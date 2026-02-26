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

const sessions = new Map<string, Session>();

// ─── WebSocket ────────────────────────────────────────────────────────────────

function broadcast(data: WsMessage): void {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Client connected');
  ws.send(JSON.stringify({ type: 'connected', message: 'NEXUS Agent Online' } satisfies WsMessage));
  ws.on('close', () => console.log('[WS] Client disconnected'));
  ws.on('error', (err) => console.error('[WS] Error:', err));
});

// ─── REST Routes ──────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'online', timestamp: new Date().toISOString(), provider: process.env.AI_PROVIDER ?? 'groq' });
});

app.post('/api/plan', async (req: Request<object, object, PlanRequest>, res: Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return; }

    broadcast({ type: 'planning', message: 'Analyzing your request...' });
    const plan: Plan = await planTask(prompt);
    const sessionId = uuidv4();

    sessions.set(sessionId, { plan, status: 'planned', currentStep: 0, stopped: false });
    broadcast({ type: 'plan_ready', sessionId, plan });
    res.json({ sessionId, plan });
  } catch (err: unknown) {
    const e = err as Error;
    broadcast({ type: 'error', message: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/review', async (req: Request<object, object, ReviewRequest>, res: Response) => {
  try {
    const { plan } = req.body;
    if (!plan) { res.status(400).json({ error: 'plan is required' }); return; }
    const review = await reviewPlan(plan);
    res.json(review);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/execute', async (req: Request<object, object, ExecuteRequest>, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) { res.status(400).json({ error: 'sessionId is required' }); return; }

    const session = sessions.get(sessionId);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

    session.status = 'executing';
    session.stopped = false;

    broadcast({ type: 'execution_start', sessionId, totalSteps: session.plan.steps.length });
    res.json({ status: 'executing', message: 'Execution started' });
    void executeAllSteps(sessionId, session);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/stop', (req: Request<object, object, StopRequest>, res: Response) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);
  if (session) { session.stopped = true; broadcast({ type: 'execution_stopped', sessionId }); }
  res.json({ status: 'stopped' });
});

app.get('/api/session/:sessionId', (req: Request, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json(session);
});

// ─── Adaptive Execution Logic ─────────────────────────────────────────────────

const MAX_RETRIES = 2;

async function executeAllSteps(sessionId: string, session: Session): Promise<void> {
  const { plan } = session;
  const results: StepExecutionResult[] = [];
  let totalFailed = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    if (session.stopped) break;

    const step = plan.steps[i];
    session.currentStep = i + 1;

    broadcast({ type: 'step_start', sessionId, stepNumber: step.step_number, step });

    if (step.safety_risk === 'high') {
      broadcast({ type: 'safety_check', sessionId, stepNumber: step.step_number, message: `High-risk step: ${step.description}` });
      await sleep(1000);
    }

    let lastError = '';
    let succeeded = false;

    // ── Retry loop ──────────────────────────────────────────────────────────
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (session.stopped) break;

      if (attempt > 0) {
        broadcast({
          type: 'safety_check',
          sessionId,
          stepNumber: step.step_number,
          message: `Retrying step ${step.step_number} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`,
        });
        await sleep(1500 * attempt); // back-off
      }

      const startTime = Date.now();

      try {
        const result = await executeStep(step);
        const duration = Date.now() - startTime;

        results.push({ stepNumber: step.step_number, success: true, result, duration });
        broadcast({ type: 'step_complete', sessionId, stepNumber: step.step_number, result, duration });
        succeeded = true;
        break; // no more retries needed
      } catch (err: unknown) {
        lastError = (err as Error).message;
        console.warn(`[Executor] Step ${step.step_number} attempt ${attempt + 1} failed:`, lastError);
      }
    }

    if (!succeeded) {
      // ── Adaptive fallback: skip non-critical steps, adapt plan ────────────
      const isCritical = step.safety_risk === 'high' || i === 0;

      broadcast({
        type: 'step_error',
        sessionId,
        stepNumber: step.step_number,
        error: lastError,
      });

      results.push({ stepNumber: step.step_number, success: false, error: lastError });
      totalFailed++;

      if (isCritical && totalFailed === 1) {
        // Try an adaptive workaround for the most common failure types
        const workaround = await tryAdaptiveWorkaround(step, lastError, sessionId);
        if (workaround) {
          results[results.length - 1] = { stepNumber: step.step_number, success: true, result: workaround };
          broadcast({ type: 'step_complete', sessionId, stepNumber: step.step_number, result: workaround, duration: 0 });
          totalFailed--;
          continue;
        }
      }

      // Skip the step and continue — don't halt entire execution
      broadcast({
        type: 'safety_check',
        sessionId,
        stepNumber: step.step_number,
        message: `⚠ Step ${step.step_number} skipped after ${MAX_RETRIES + 1} attempts — continuing with next step...`,
      });

      await sleep(500);
    }

    await sleep(300);
  }

  if (!session.stopped) {
    const successCount = results.filter((r) => r.success).length;
    session.status = totalFailed === results.length ? 'failed' : 'completed';

    broadcast({
      type: 'execution_complete',
      sessionId,
      results,
      summary: {
        total: plan.steps.length,
        success: successCount,
        failed: totalFailed,
        duration: results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
      },
    });
  }
}

// ─── Adaptive Workarounds ─────────────────────────────────────────────────────

async function tryAdaptiveWorkaround(
  step: import('./types').PlanStep,
  error: string,
  sessionId: string,
): Promise<import('./types').StepResult | null> {
  broadcast({
    type: 'planning',
    message: `Trying adaptive workaround for step ${step.step_number}...`,
  });

  // Playwright missing → auto-install
  if (error.includes("Executable doesn't exist") || error.includes('playwright install')) {
    broadcast({ type: 'planning', message: 'Auto-installing Playwright browsers...' });
    try {
      const { execAsync: exec2 } = await getExecAsync();
      await exec2('npx playwright install chromium', { timeout: 120_000 });
      broadcast({ type: 'planning', message: '✓ Playwright installed — retrying step...' });
      // Re-execute the original step
      return await executeStep(step);
    } catch (installErr) {
      console.error('[Workaround] Playwright install failed:', installErr);
      // Fallback: open URL in system browser
      if (step.capability === 'browser_open' && step.parameters.url) {
        return openInSystemBrowser(step.parameters.url);
      }
    }
  }

  // robotjs / typing failure → PowerShell fallback
  if (error.includes('robotjs') || error.includes('Cannot type')) {
    if (step.parameters.text) {
      return openTextInNotepad(step.parameters.text, sessionId);
    }
  }

  // App open failure → try shell open
  if (step.capability === 'open_application' && step.parameters.app_name) {
    return openViaShell(step.parameters.app_name);
  }

  return null;
}

async function openInSystemBrowser(url: string): Promise<import('./types').StepResult> {
  const { execAsync: exec2 } = await getExecAsync();
  const finalUrl = url.startsWith('http') ? url : `https://${url}`;
  if (process.platform === 'win32') {
    await exec2(`start "" "${finalUrl}"`);
  } else if (process.platform === 'darwin') {
    await exec2(`open "${finalUrl}"`);
  } else {
    await exec2(`xdg-open "${finalUrl}"`);
  }
  await sleep(1500);
  return { success: true, url: finalUrl, message: `Opened ${finalUrl} in system default browser` };
}

async function openTextInNotepad(text: string, _sessionId: string): Promise<import('./types').StepResult> {
  const { execAsync: exec2 } = await getExecAsync();
  const fs2 = await import('fs/promises');
  const os2 = await import('os');
  const path2 = await import('path');
  const tmpFile = path2.join(os2.tmpdir(), `nexus-text-${Date.now()}.txt`);
  await fs2.writeFile(tmpFile, text, 'utf-8');
  if (process.platform === 'win32') {
    await exec2(`notepad "${tmpFile}"`);
  }
  return { success: true, path: tmpFile, message: `Text written to ${tmpFile} and opened in Notepad` };
}

async function openViaShell(appName: string): Promise<import('./types').StepResult> {
  const { execAsync: exec2 } = await getExecAsync();
  if (process.platform === 'win32') {
    try {
      await exec2(`powershell -Command "Start-Process '${appName}'"`, { timeout: 5000 });
      return { success: true, message: `Opened ${appName} via PowerShell` };
    } catch {
      await exec2(`cmd /c start ${appName}`, { timeout: 5000 });
      return { success: true, message: `Opened ${appName} via cmd` };
    }
  }
  throw new Error(`Cannot open ${appName}`);
}

async function getExecAsync() {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  return { execAsync: promisify(exec) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);
server.listen(PORT, () => {
  console.log(`
  HTTP : http://localhost:${PORT}
  WS   : ws://localhost:${PORT}
  AI   : ${(process.env.AI_PROVIDER ?? 'groq').padEnd(32)}
  `);
});