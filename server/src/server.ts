import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { tryAutoFixBeforeRetry } from './utils/autoFix';
import { planTask , replanFromStep } from './ai/planner';
import { reviewPlan } from './ai/reviewer';
import { executeStep, getLivePage } from './executor/stepExecutor';
import { logExecution, getFailureStats } from './utils/executionLogger';
import {
  Plan,
  Session,
  WsMessage,
  StepExecutionResult,
  PlanRequest,
  ExecuteRequest,
  StopRequest,
  ReviewRequest,
  PlanStep,
  StepResult,
} from './types';

// ─── ENV VALIDATOR ────────────────────────────────────────────────────────────
// FIX 4: Validate required env vars at startup so missing keys fail loudly
// instead of crashing mysteriously on the first task.

function validateEnv(): void {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();

  const required: Record<string, string[]> = {
    groq:      ['GROQ_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    openai:    ['OPENAI_API_KEY'],
  };

  const missing = (required[provider] ?? []).filter(
    (k) => !process.env[k] || (process.env[k] ?? '').includes('your_')
  );

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach((k) => console.error(`   ${k}`));
    console.error('\nSteps to fix:');
    console.error('  1. Copy server/.env.example to server/.env');
    console.error(`  2. Fill in your ${provider.toUpperCase()} API key`);
    console.error('  3. Restart the server\n');
    process.exit(1);
  }

  console.log(`✓ Env valid — provider: ${provider}`);
}

// Run before anything else starts
validateEnv();

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

app.get('/api/health', async (_req: Request, res: Response) => {
  const stats = await getFailureStats();
  res.json({
    status:       'online',
    timestamp:    new Date().toISOString(),
    provider:     process.env.AI_PROVIDER ?? 'groq',
    totalRuns:    stats.totalRuns,
    avgSuccessRate: `${Math.round(stats.avgSuccess * 100)}%`,
    recentTrend:  stats.recentTrend,
    topFailures:  Object.entries(stats.byCapability)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cap, n]) => `${cap}(${n})`)
      .join(', ') || 'none',
  });
});

app.get('/api/logs', async (_req: Request, res: Response) => {
  const stats = await getFailureStats();
  res.json(stats);
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
  if (session) {
    session.stopped = true;
    broadcast({ type: 'execution_stopped', sessionId });
  }
  res.json({ status: 'stopped' });
});

app.get('/api/session/:sessionId', (req: Request, res: Response) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json(session);
});

// ─── Execution Logic ──────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

async function executeAllSteps(sessionId: string, session: Session): Promise<void> {
  const { plan } = session;
  const results: StepExecutionResult[] = [];
  let totalFailed = 0;
  const startTime = Date.now();

  for (let i = 0; i < plan.steps.length; i++) {
    if (session.stopped) break;

    const step = plan.steps[i];
    session.currentStep = i + 1;

    broadcast({ type: 'step_start', sessionId, stepNumber: step.step_number, step });

    if (step.safety_risk === 'high') {
      broadcast({
        type:       'safety_check',
        sessionId,
        stepNumber: step.step_number,
        message:    `High-risk step: ${step.description}`,
      });
      await sleep(1000);
    }

    let lastError = '';
    let succeeded = false;

    // ── Retry loop ────────────────────────────────────────────────────────
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (session.stopped) break;

      if (attempt > 0) {
        // FIX 3: Single tryAutoFixBeforeRetry call per retry.
        // Original had a SECOND call specifically for run_shell_command
        // right below this block — shell commands were getting patched
        // twice, which corrupted already-fixed files on the second pass.
        const fixApplied = await tryAutoFixBeforeRetry(step, lastError, broadcast);

        if (fixApplied) {
          broadcast({
            type: 'planning',
            message: `✓ Auto-fix applied (attempt ${attempt + 1}): ${fixApplied}`,
          });
        } else {
          broadcast({
            type: 'safety_check',
            sessionId,
            stepNumber: step.step_number,
            message: `Retrying step ${step.step_number} (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — no auto-fix found...`,
          });
        }

        await sleep(1500 * attempt);
      }

      const stepStartTime = Date.now();

      try {
        const result   = await executeStep(step);
        const duration = Date.now() - stepStartTime;

        results.push({ stepNumber: step.step_number, success: true, result, duration });
        broadcast({ type: 'step_complete', sessionId, stepNumber: step.step_number, result, duration });
        succeeded = true;
        break;
      } catch (err: unknown) {
        lastError = (err as Error).message;
        console.warn(`[Executor] Step ${step.step_number} attempt ${attempt + 1} failed:`, lastError);
      }
    }

    if (!succeeded) {
      broadcast({ type: 'step_error', sessionId, stepNumber: step.step_number, error: lastError });
      results.push({ stepNumber: step.step_number, success: false, error: lastError });
      totalFailed++;

      // ── Mid-execution replanning ──────────────────────────────────────
      const isLastStep = i >= plan.steps.length - 1;

      if (!isLastStep) {
        const livePage = getLivePage();

        if (livePage) {
          try {
            const pageUrl   = livePage.url();
            const pageTitle = await livePage.title().catch(() => '');

            const completedSteps = plan.steps.slice(0, i).map((s) => ({
              description: s.description,
              capability:  s.capability,
            }));

            const remainingGoal = plan.steps
              .slice(i + 1)
              .map((s) => s.description)
              .join('; ');

            broadcast({
              type:    'planning',
              message: `Step ${step.step_number} failed — re-planning from current page...`,
            });

            console.log(
              `[Server] Attempting mid-execution replan after step ${step.step_number} failed.`
            );

            const newPlan = await replanFromStep(
              plan.summary,
              completedSteps,
              step,
              lastError,
              pageUrl,
              pageTitle,
              remainingGoal,
            );

            if (newPlan && newPlan.steps.length > 0) {
              const numberedNewSteps = newPlan.steps.map((s, idx) => ({
                ...s,
                step_number: step.step_number + idx + 1,
              }));

              plan.steps.splice(i + 1, plan.steps.length - (i + 1), ...numberedNewSteps);

              broadcast({ type: 'plan_ready', sessionId, plan });
              broadcast({
                type:    'planning',
                message: `Re-planned: ${newPlan.steps.length} new step${newPlan.steps.length !== 1 ? 's' : ''} generated`,
              });

              console.log(
                `[Server] Re-plan successful — inserted ${newPlan.steps.length} new steps. ` +
                `Execution continues.`
              );
            } else {
              console.warn('[Server] Re-plan returned no steps — continuing with original remaining steps');
            }
          } catch (replanErr) {
            console.warn('[Server] Re-planning threw an error:', (replanErr as Error).message);
          }
        } else {
          console.warn('[Server] getLivePage() returned null — cannot replan (no live browser context)');
        }
      }

      await sleep(500);
    }

    await sleep(300);
  }

  if (!session.stopped) {
    const successCount = results.filter((r) => r.success).length;
    const totalDuration = Date.now() - startTime;
    session.status = totalFailed === results.length ? 'failed' : 'completed';

    broadcast({
      type: 'execution_complete',
      sessionId,
      results,
      summary: {
        total:    plan.steps.length,
        success:  successCount,
        failed:   totalFailed,
        duration: totalDuration,
      },
    });

    await logExecution({
      timestamp:      new Date().toISOString(),
      sessionId,
      prompt:         session.plan.summary,
      intent:         session.plan.intent,
      provider:       process.env.AI_PROVIDER ?? 'groq',
      totalSteps:     plan.steps.length,
      steps:          results.map((r, idx) => ({
        stepNumber:   r.stepNumber,
        capability:   plan.steps[idx]?.capability ?? 'unknown',
        description:  plan.steps[idx]?.description ?? '',
        success:      r.success,
        errorMessage: r.error,
        durationMs:   r.duration ?? 0,
        retryCount:   0,
        pageUrl:      r.result?.url as string | undefined,
        strategy:     r.result?.strategy as string | undefined,
      })),
      overallSuccess: totalFailed < results.length / 2,
      successRate:    results.length > 0
        ? (results.length - totalFailed) / results.length
        : 0,
      durationMs: totalDuration,
    });
  }
}

// ─── Adaptive Workarounds ─────────────────────────────────────────────────────

async function tryAdaptiveWorkaround(
  step: PlanStep,
  error: string,
  sessionId: string,
): Promise<StepResult | null> {
  broadcast({
    type: 'planning',
    message: `Trying adaptive workaround for step ${step.step_number}...`,
  });

  if (error.includes("Executable doesn't exist") || error.includes('playwright install')) {
    broadcast({ type: 'planning', message: 'Auto-installing Playwright browsers...' });
    try {
      const { execAsync: exec2 } = await getExecAsync();
      await exec2('npx playwright install chromium', { timeout: 120_000 });
      broadcast({ type: 'planning', message: '✓ Playwright installed — retrying step...' });
      return await executeStep(step);
    } catch (installErr) {
      console.error('[Workaround] Playwright install failed:', installErr);
      if (step.capability === 'browser_open' && step.parameters.url) {
        return openInSystemBrowser(step.parameters.url);
      }
    }
  }

  if (error.includes('robotjs') || error.includes('Cannot type')) {
    if (step.parameters.text) {
      return openTextInNotepad(step.parameters.text, sessionId);
    }
  }

  if (step.capability === 'open_application' && step.parameters.app_name) {
    return openViaShell(step.parameters.app_name);
  }

  return null;
}

async function openInSystemBrowser(url: string): Promise<StepResult> {
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

async function openTextInNotepad(text: string, _sessionId: string): Promise<StepResult> {
  const { execAsync: exec2 } = await getExecAsync();
  const fs2   = await import('fs/promises');
  const os2   = await import('os');
  const path2 = await import('path');
  const tmpFile = path2.join(os2.tmpdir(), `nexus-text-${Date.now()}.txt`);
  await fs2.writeFile(tmpFile, text, 'utf-8');
  if (process.platform === 'win32') {
    await exec2(`notepad "${tmpFile}"`);
  }
  return { success: true, path: tmpFile, message: `Text written to ${tmpFile}` };
}

async function openViaShell(appName: string): Promise<StepResult> {
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
  const { exec }    = await import('child_process');
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
  AI   : ${(process.env.AI_PROVIDER ?? 'groq').padEnd(28)} 
  `);
});