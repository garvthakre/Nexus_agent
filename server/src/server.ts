import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

import { planTask } from './ai/planner';
import { reviewPlan } from './ai/reviewer';
import { executeStep } from './executor/stepExecutor';
import {
  Plan,
  Session,
  WsMessage,
  StepExecutionResult,
  PlanRequest,
  ExecuteRequest,
  StopRequest,
  ReviewRequest,
} from './types';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// In-memory session store
const sessions = new Map<string, Session>();

// ─── WebSocket ────────────────────────────────────────────────────────────────

function broadcast(data: WsMessage): void {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Client connected');
  ws.send(JSON.stringify({ type: 'connected', message: 'NEXUS Agent Online' } satisfies WsMessage));

  ws.on('close', () => console.log('[WS] Client disconnected'));
  ws.on('error', (err) => console.error('[WS] Error:', err));
});

// ─── REST Routes ──────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    provider: process.env.AI_PROVIDER ?? 'groq',
  });
});

// Generate plan from natural language
app.post('/api/plan', async (req: Request<object, object, PlanRequest>, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    broadcast({ type: 'planning', message: 'Analyzing your request...' });

    const plan: Plan = await planTask(prompt);
    const sessionId = uuidv4();

    sessions.set(sessionId, {
      plan,
      status: 'planned',
      currentStep: 0,
      stopped: false,
    });

    broadcast({ type: 'plan_ready', sessionId, plan });
    res.json({ sessionId, plan });
  } catch (err: unknown) {
    const e = err as Error;
    console.error('[Plan Error]', e.message);
    broadcast({ type: 'error', message: e.message });
    res.status(500).json({ error: e.message });
  }
});

// Review plan safety
app.post('/api/review', async (req: Request<object, object, ReviewRequest>, res: Response) => {
  try {
    const { plan } = req.body;
    if (!plan) {
      res.status(400).json({ error: 'plan is required' });
      return;
    }
    const review = await reviewPlan(plan);
    res.json(review);
  } catch (err: unknown) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

// Execute a plan
app.post('/api/execute', async (req: Request<object, object, ExecuteRequest>, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId is required' });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    session.status = 'executing';
    session.stopped = false;

    broadcast({
      type: 'execution_start',
      sessionId,
      totalSteps: session.plan.steps.length,
    });

    // Return immediately; run execution in background
    res.json({ status: 'executing', message: 'Execution started' });
    void executeAllSteps(sessionId, session);
  } catch (err: unknown) {
    const e = err as Error;
    res.status(500).json({ error: e.message });
  }
});

// Stop execution
app.post('/api/stop', (req: Request<object, object, StopRequest>, res: Response) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);
  if (session) {
    session.stopped = true;
    broadcast({ type: 'execution_stopped', sessionId });
  }
  res.json({ status: 'stopped' });
});

// Get session status
app.get('/api/session/:sessionId', (req: Request, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// ─── Execution Logic ──────────────────────────────────────────────────────────

async function executeAllSteps(sessionId: string, session: Session): Promise<void> {
  const { plan } = session;
  const results: StepExecutionResult[] = [];

  for (let i = 0; i < plan.steps.length; i++) {
    if (session.stopped) break;

    const step = plan.steps[i];
    session.currentStep = i + 1;

    broadcast({ type: 'step_start', sessionId, stepNumber: step.step_number, step });

    // Warn + brief pause before high-risk steps
    if (step.safety_risk === 'high') {
      broadcast({
        type: 'safety_check',
        sessionId,
        stepNumber: step.step_number,
        message: `High-risk step: ${step.description}`,
      });
      await sleep(1000);
    }

    const startTime = Date.now();

    try {
      const result = await executeStep(step);
      const duration = Date.now() - startTime;

      results.push({ stepNumber: step.step_number, success: true, result, duration });
      broadcast({ type: 'step_complete', sessionId, stepNumber: step.step_number, result, duration });

      await sleep(300); // brief pause for visual effect
    } catch (err: unknown) {
      const e = err as Error;
      const duration = Date.now() - startTime;

      results.push({ stepNumber: step.step_number, success: false, error: e.message, duration });
      broadcast({ type: 'step_error', sessionId, stepNumber: step.step_number, error: e.message });

      session.status = 'failed';
      broadcast({ type: 'execution_failed', sessionId, stepNumber: step.step_number, error: e.message });
      return;
    }
  }

  if (!session.stopped) {
    session.status = 'completed';
    const successCount = results.filter((r) => r.success).length;

    broadcast({
      type: 'execution_complete',
      sessionId,
      results,
      summary: {
        total: plan.steps.length,
        success: successCount,
        failed: results.length - successCount,
        duration: results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
      },
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

 
const PORT = parseInt(process.env.PORT ?? '3001', 10);

server.listen(PORT, () => {
  console.log(`
 
  HTTP : http://localhost:${PORT}             
  WS   : ws://localhost:${PORT}               
  AI   : ${(process.env.AI_PROVIDER ?? 'groq').padEnd(32)}
 
  `);
});
