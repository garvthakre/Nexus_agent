import cron, { ScheduledTask } from 'node-cron';
import { planTask } from '../ai/planner';
import { reviewPlan } from '../ai/reviewer';
import { createSession } from './sessionService';
import { executeAllSteps } from './executionService';
import { broadcast, registerSessionOwner } from './websocketService';
import { dispatchWebhook } from './webhookService';
import { listAllEnabledSchedules, markScheduleRun } from './scheduleService';
import { ScheduleRecord } from '../types';

// ─── Module State ─────────────────────────────────────────────────────────────

const activeTasks = new Map<string, ScheduledTask>();

// ─── Register One Schedule ────────────────────────────────────────────────────

function registerCronJob(schedule: ScheduleRecord): void {
  // Remove existing task for this ID if any (handles updates)
  const existing = activeTasks.get(schedule.id);
  if (existing) {
    existing.stop();
    activeTasks.delete(schedule.id);
  }

  if (!schedule.enabled) return;

  if (!cron.validate(schedule.cronExpression)) {
    console.error(`[Scheduler] Invalid cron expression for schedule ${schedule.id}: "${schedule.cronExpression}"`);
    return;
  }

  const task = cron.schedule(schedule.cronExpression, async () => {
    console.log(`[Scheduler] Triggering schedule "${schedule.name}" (${schedule.id})`);

    try {
      // 1. Plan
      broadcast({ type: 'planning', message: `[Scheduled] ${schedule.name}: Analyzing...` }, schedule.userId);
      const plan = await planTask(schedule.prompt, schedule.userId);

      // 2. Safety Review
      const review = await reviewPlan(plan, schedule.userId);
      if (review.verdict === 'UNSAFE') {
        console.warn(`[Scheduler] Schedule "${schedule.name}" blocked by safety review: ${review.recommendation}`);
        await markScheduleRun(schedule.id, 'blocked_unsafe', null);
        broadcast({
          type: 'safety_check',
          message: `[Scheduled] ${schedule.name}: Blocked by safety review — ${review.recommendation}`,
        }, schedule.userId);
        return;
      }

      // 3. Create Session
      const { sessionId, session } = await createSession(schedule.userId, plan);
      registerSessionOwner(sessionId, schedule.userId);

      broadcast({ type: 'plan_ready', sessionId, plan }, schedule.userId);
      broadcast({
        type: 'execution_start',
        sessionId,
        totalSteps: plan.steps.length,
      }, schedule.userId);

      await dispatchWebhook('execution.started', {
        sessionId,
        summary: plan.summary ?? schedule.name,
        stepCount: plan.steps.length,
        scheduledBy: schedule.id,
      }, schedule.userId);

      // 4. Execute
      await markScheduleRun(schedule.id, 'running', sessionId);
      await executeAllSteps(sessionId, session);
      await markScheduleRun(schedule.id, 'completed', sessionId);

      console.log(`[Scheduler] Schedule "${schedule.name}" completed (session ${sessionId})`);
    } catch (err: unknown) {
      const message = (err as Error).message;
      console.error(`[Scheduler] Schedule "${schedule.name}" failed:`, message);
      await markScheduleRun(schedule.id, 'failed', null);
      broadcast({ type: 'error', message: `[Scheduled] ${schedule.name}: ${message}` }, schedule.userId);
    }
  });

  activeTasks.set(schedule.id, task);
  console.log(`[Scheduler] Registered: "${schedule.name}" — ${schedule.cronExpression}`);
}

// ─── Manual One-Off Run ───────────────────────────────────────────────────────

export async function triggerScheduleNow(schedule: ScheduleRecord): Promise<{ sessionId: string; status: string }> {
  console.log(`[Scheduler] Manually triggering schedule "${schedule.name}" (${schedule.id})`);

  broadcast({ type: 'planning', message: `[Scheduled Run] ${schedule.name}: Analyzing request...` }, schedule.userId);
  const plan = await planTask(schedule.prompt, schedule.userId);

  const review = await reviewPlan(plan, schedule.userId);
  if (review.verdict === 'UNSAFE') {
    await markScheduleRun(schedule.id, 'blocked_unsafe', null);
    throw new Error(`Execution blocked by safety reviewer: ${review.recommendation}`);
  }

  const { sessionId, session } = await createSession(schedule.userId, plan);
  registerSessionOwner(sessionId, schedule.userId);

  broadcast({ type: 'plan_ready', sessionId, plan }, schedule.userId);
  broadcast({
    type: 'execution_start',
    sessionId,
    totalSteps: plan.steps.length,
  }, schedule.userId);

  await dispatchWebhook('execution.started', {
    sessionId,
    summary: plan.summary ?? schedule.name,
    stepCount: plan.steps.length,
    scheduledBy: schedule.id,
  }, schedule.userId);

  await markScheduleRun(schedule.id, 'running', sessionId);

  // Run in background without blocking API response
  void (async () => {
    try {
      await executeAllSteps(sessionId, session);
      await markScheduleRun(schedule.id, 'completed', sessionId);
      console.log(`[Scheduler] Manual run completed for "${schedule.name}"`);
    } catch (err) {
      console.error(`[Scheduler] Manual run failed for "${schedule.name}":`, err);
      await markScheduleRun(schedule.id, 'failed', sessionId);
    }
  })();

  return { sessionId, status: 'executing' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Call once from server.ts after the HTTP server starts */
export async function startSchedulerDaemon(): Promise<void> {
  const schedules = await listAllEnabledSchedules();
  console.log(`[Scheduler] Loading ${schedules.length} enabled schedule(s)`);
  for (const s of schedules) {
    registerCronJob(s);
  }
}

/** Call after creating or updating a schedule via API */
export function syncSchedule(schedule: ScheduleRecord): void {
  registerCronJob(schedule);
}

/** Call after deleting a schedule via API */
export function removeSchedule(scheduleId: string): void {
  const task = activeTasks.get(scheduleId);
  if (task) {
    task.stop();
    activeTasks.delete(scheduleId);
    console.log(`[Scheduler] Removed schedule ${scheduleId}`);
  }
}
