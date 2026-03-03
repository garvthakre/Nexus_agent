/**
 * executionLogger.ts  — NEXUS Execution Logger
 * ─────────────────────────────────────────────────────────────────────────────
 * Logs every execution run to ~/nexus-logs/executions.jsonl (JSONL format).
 * Keeps a rolling window of the last 500 entries to prevent unbounded growth.
 * Provides failure stats used by /api/logs and /api/health.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StepLog {
  stepNumber:    number;
  capability:    string;
  description:   string;
  success:       boolean;
  strategy?:     string;      // which tier/selector worked
  errorMessage?: string;
  durationMs:    number;
  retryCount:    number;
  pageUrl?:      string;      // URL at time of step
}

export interface ExecutionLog {
  timestamp:      string;
  sessionId:      string;
  prompt:         string;
  intent:         string;
  provider:       string;
  totalSteps:     number;
  steps:          StepLog[];
  overallSuccess: boolean;
  successRate:    number;
  durationMs:     number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LOG_DIR  = path.join(os.homedir(), 'nexus-logs');
const LOG_FILE = path.join(LOG_DIR, 'executions.jsonl');
const MAX_ENTRIES = 500; // rolling window — prevents unbounded growth

// ─── Write ────────────────────────────────────────────────────────────────────

export async function logExecution(entry: ExecutionLog): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });

    // Read existing entries
    let lines: string[] = [];
    try {
      const raw = await fs.readFile(LOG_FILE, 'utf-8');
      lines = raw.trim().split('\n').filter(Boolean);
    } catch {
      // File doesn't exist yet — start fresh
    }

    // Append new entry and trim to rolling window
    lines.push(JSON.stringify(entry));
    if (lines.length > MAX_ENTRIES) {
      lines = lines.slice(lines.length - MAX_ENTRIES);
    }

    await fs.writeFile(LOG_FILE, lines.join('\n') + '\n', 'utf-8');

    console.log(
      `[Logger] Logged: ${entry.intent} — ` +
      `${Math.round(entry.successRate * 100)}% success ` +
      `(${lines.length}/${MAX_ENTRIES} entries)`
    );
  } catch (err) {
    // Never crash the server just because logging failed
    console.warn('[Logger] Write failed:', (err as Error).message);
  }
}

// ─── Read / Stats ─────────────────────────────────────────────────────────────

export async function getFailureStats(): Promise<{
  byCapability:  Record<string, number>;
  byDomain:      Record<string, number>;
  totalRuns:     number;
  avgSuccess:    number;
  recentTrend:   'improving' | 'degrading' | 'stable' | 'insufficient_data';
}> {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf-8');
    const entries: ExecutionLog[] = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));

    const byCapability: Record<string, number> = {};
    const byDomain:     Record<string, number> = {};

    for (const entry of entries) {
      for (const step of entry.steps) {
        if (!step.success) {
          byCapability[step.capability] = (byCapability[step.capability] ?? 0) + 1;
          if (step.pageUrl) {
            try {
              const domain = new URL(step.pageUrl).hostname;
              byDomain[domain] = (byDomain[domain] ?? 0) + 1;
            } catch { /* invalid URL */ }
          }
        }
      }
    }

    const avgSuccess = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.successRate, 0) / entries.length
      : 0;

    // Trend: compare last 10 vs previous 10
    let recentTrend: 'improving' | 'degrading' | 'stable' | 'insufficient_data' =
      'insufficient_data';

    if (entries.length >= 20) {
      const recent   = entries.slice(-10).reduce((s, e) => s + e.successRate, 0) / 10;
      const previous = entries.slice(-20, -10).reduce((s, e) => s + e.successRate, 0) / 10;
      const delta = recent - previous;
      recentTrend = delta > 0.05 ? 'improving' : delta < -0.05 ? 'degrading' : 'stable';
    }

    return { byCapability, byDomain, totalRuns: entries.length, avgSuccess, recentTrend };
  } catch {
    return {
      byCapability: {},
      byDomain: {},
      totalRuns: 0,
      avgSuccess: 0,
      recentTrend: 'insufficient_data',
    };
  }
}