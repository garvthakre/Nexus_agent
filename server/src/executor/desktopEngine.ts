/**
 * desktopEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Windows native desktop app automation via pywinauto.
 *
 * Calls desktop_agent.py (which must be in server/scripts/) via shell.
 * Returns structured results compatible with StepResult.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { promisify } from 'util';
import { StepResult } from '../types';

const execAsync = promisify(exec);

// ─── Config ───────────────────────────────────────────────────────────────────

// desktop_agent.py lives next to the compiled server, or in server/scripts/
function getAgentPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'scripts', 'desktop_agent.py'),
    path.join(__dirname, '..', 'scripts', 'desktop_agent.py'),
    path.join(process.cwd(), 'scripts', 'desktop_agent.py'),
    path.join(process.cwd(), 'desktop_agent.py'),
  ];
  // Return first one we find at runtime (checked in ensurePywinauto)
  return candidates[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── pywinauto setup ──────────────────────────────────────────────────────────

let pywinautoReady = false;

export async function ensurePywinauto(): Promise<void> {
  if (pywinautoReady) return;

  // Check Python is available
  try {
    await execAsync('python --version', { timeout: 5000 });
  } catch {
    try {
      await execAsync('python3 --version', { timeout: 5000 });
    } catch {
      throw new Error('Python not found. Install Python 3 from python.org');
    }
  }

  // Check pywinauto
  try {
    await execAsync('python -c "import pywinauto"', { timeout: 8000 });
    pywinautoReady = true;
  } catch {
    console.log('[DesktopEngine] Installing pywinauto...');
    try {
      await execAsync('pip install pywinauto --quiet', { timeout: 120_000 });
      pywinautoReady = true;
      console.log('[DesktopEngine] ✓ pywinauto installed');
    } catch (installErr) {
      throw new Error(
        `Could not install pywinauto: ${(installErr as Error).message}\n` +
        `Manually run: pip install pywinauto`
      );
    }
  }

  // Verify desktop_agent.py exists — try all candidate paths
  const candidates = [
    path.join(__dirname, '..', '..', 'scripts', 'desktop_agent.py'),
    path.join(__dirname, '..', 'scripts', 'desktop_agent.py'),
    path.join(process.cwd(), 'scripts', 'desktop_agent.py'),
    path.join(process.cwd(), 'desktop_agent.py'),
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      console.log(`[DesktopEngine] ✓ Found desktop_agent.py at: ${p}`);
      return;
    } catch { /* try next */ }
  }

  throw new Error(
    `desktop_agent.py not found. Expected at one of:\n${candidates.join('\n')}\n\n` +
    `Copy desktop_agent.py into your server/scripts/ folder.`
  );
}

// ─── Agent caller ─────────────────────────────────────────────────────────────

interface AgentResult {
  success: boolean;
  message?: string;
  error?: string;
  strategy?: string;
  title?: string;
  elements?: Array<{ title: string; control_type: string; auto_id: string }>;
}

async function callAgent(args: string[], timeoutMs = 15_000): Promise<AgentResult> {
  await ensurePywinauto();

  // Find the script
  const candidates = [
    path.join(__dirname, '..', '..', 'scripts', 'desktop_agent.py'),
    path.join(__dirname, '..', 'scripts', 'desktop_agent.py'),
    path.join(process.cwd(), 'scripts', 'desktop_agent.py'),
    path.join(process.cwd(), 'desktop_agent.py'),
  ];

  let scriptPath = candidates[0];
  for (const p of candidates) {
    try { await fs.access(p); scriptPath = p; break; } catch { /* next */ }
  }

  // Escape args for shell
  const escapedArgs = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ');
  const cmd = `python "${scriptPath}" ${escapedArgs}`;

  console.log(`[DesktopEngine] Running: ${cmd.slice(0, 120)}`);

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs });
    if (stderr) console.warn('[DesktopEngine] stderr:', stderr.slice(0, 200));

    const result = JSON.parse(stdout.trim()) as AgentResult;
    return result;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    // Try to parse JSON from stdout even on non-zero exit
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout.trim()) as AgentResult;
      } catch { /* fall through */ }
    }
    return {
      success: false,
      error: e.message.slice(0, 300),
    };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wait for a native app window to appear and be ready.
 */
export async function appFindWindow(appName: string, timeoutSeconds = 10): Promise<StepResult> {
  const result = await callAgent(['find_window', appName, '--timeout', String(timeoutSeconds)], (timeoutSeconds + 3) * 1000);

  if (!result.success) {
    throw new Error(result.error ?? `Window not found for "${appName}"`);
  }

  return {
    success: true,
    message: result.message ?? `Window ready: "${appName}"`,
    title: result.title,
  };
}

/**
 * Click a UI element inside a native app by name/label.
 */
export async function appClick(appName: string, elementName: string): Promise<StepResult> {
  const result = await callAgent(['click', appName, elementName], 12_000);

  if (!result.success) {
    throw new Error(result.error ?? `Could not click "${elementName}" in "${appName}"`);
  }

  return {
    success: true,
    message: result.message ?? `Clicked "${elementName}"`,
    strategy: result.strategy,
  };
}

/**
 * Type text into a UI element inside a native app.
 */
export async function appType(appName: string, elementName: string, text: string): Promise<StepResult> {
  const result = await callAgent(['type', appName, elementName, text], 12_000);

  if (!result.success) {
    throw new Error(result.error ?? `Could not type into "${elementName}" in "${appName}"`);
  }

  return {
    success: true,
    message: result.message ?? `Typed into "${elementName}"`,
    strategy: result.strategy,
  };
}

/**
 * Focus a native app window (bring to front).
 */
export async function appFocusWindow(appName: string): Promise<StepResult> {
  const result = await callAgent(['focus_window', appName], 8_000);

  if (!result.success) {
    throw new Error(result.error ?? `Could not focus "${appName}"`);
  }

  return {
    success: true,
    message: result.message ?? `Focused "${appName}"`,
  };
}

/**
 * List all UI elements in a native app window (for debugging).
 */
export async function appListElements(appName: string): Promise<StepResult> {
  const result = await callAgent(['list_elements', appName], 10_000);

  if (!result.success) {
    throw new Error(result.error ?? `Could not list elements in "${appName}"`);
  }

  return {
    success: true,
    message: result.message ?? `Listed elements`,
    elements: result.elements,
  };
}