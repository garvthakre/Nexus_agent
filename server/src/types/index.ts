export type Capability =
  | 'browser_navigate'
  | 'browser_click'
  | 'browser_fill'
  | 'browser_read_page'
  | 'browser_extract_results'
  | 'browser_scroll'
  | 'browser_screenshot'
  | 'browser_wait_for_element'   // ← NEW (Week 2 Task 7)
  | 'browser_get_page_state'     // ← NEW (Week 2 Task 7)
  | 'open_application'
  | 'close_application'
  | 'send_keys'
  | 'get_clipboard'
  | 'set_clipboard'
  | 'run_script';

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface PlanStep {
  step_number:    number;
  capability:     Capability;
  description:    string;
  parameters:     Record<string, unknown>;
  optional?:      boolean;
  wait_after_ms?: number;
}

export interface Plan {
  summary:    string;
  steps:      PlanStep[];
  created_at: string;
}

// ─── Step Result ──────────────────────────────────────────────────────────────

export type ChangeType = 'url' | 'content' | 'none';

export interface StepResult {
  stepNumber: number;
  success:    boolean;
  output?:    unknown;
  error?:     string;
  strategy?:  string;   // which tier/selector worked (from Browserengine)
  tier?:      number;   // -1=memory, 0-4=tiers

  // ── NEW fields (Week 2 Task 7) ────────────────────────────────────────────
  navigated?:   boolean;      // true if this step caused a page navigation
  changeType?:  ChangeType;   // what kind of change was detected after click
  electron?:    boolean;      // true if step was executed via Electron CDP
  cdp_port?:    number;       // CDP port used for Electron steps
}

// ─── Execution Log (mirrors server ExecutionLog) ───────────────────────────

export interface StepLog {
  stepNumber:    number;
  capability:    Capability;
  description:   string;
  success:       boolean;
  strategy?:     string;
  errorMessage?: string;
  durationMs:    number;
  retryCount:    number;
  pageUrl?:      string;
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

// ─── WebSocket Broadcast Message Types ───────────────────────────────────────
//
// These mirror the `type` field used in broadcast() calls in server.ts.
// The union lets the frontend switch on event.type with full type safety.

export type BroadcastEvent =
  | { type: 'planning';    message: string }
  | { type: 'plan_ready';  sessionId: string; plan: Plan }
  | { type: 'step_start';  sessionId: string; stepNumber: number; description: string }
  | { type: 'step_done';   sessionId: string; stepNumber: number; result: StepResult }
  | { type: 'step_error';  sessionId: string; stepNumber: number; error: string }
  | { type: 'task_done';   sessionId: string; results: StepResult[]; summary: string }
  | { type: 'task_error';  sessionId: string; error: string }
  // ── NEW (Week 2 re-planning) ────────────────────────────────────────────
  | { type: 'replanning';  sessionId: string; fromStep: number; reason: string }
  | { type: 'replan_done'; sessionId: string; newStepCount: number };

// ─── Session / API Types ──────────────────────────────────────────────────────

export interface SessionState {
  sessionId:   string;
  status:      'idle' | 'planning' | 'executing' | 'done' | 'error';
  plan?:       Plan;
  results:     StepResult[];
  startedAt?:  string;
  finishedAt?: string;
}

export interface ApiRunRequest {
  prompt:    string;
  sessionId?: string;
  provider?: 'claude' | 'openai' | 'groq';
}

export interface ApiRunResponse {
  sessionId: string;
  plan:      Plan;
}

// ─── Selector Memory Stats (for /api/logs response) ───────────────────────

export interface SelectorMemoryStats {
  totalDomains:   number;
  totalHints:     number;
  totalSelectors: number;
  topDomains:     Array<{ domain: string; hints: number }>;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export interface HealthResponse {
  status:        'ok' | 'degraded';
  uptime:        number;
  version:       string;
  memoryStats?:  SelectorMemoryStats;
  successRate?:  number;
  totalRuns?:    number;
}