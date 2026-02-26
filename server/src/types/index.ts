// ─── Capability Types ─────────────────────────────────────────────────────────

export type Capability =
  | 'open_application'
  | 'set_wallpaper'
  | 'run_shell_command'
  | 'browser_open'
  | 'browser_fill'
  | 'browser_click'
  | 'type_text'
  | 'create_file'
  | 'create_folder'
  | 'wait'
  | 'download_file';

export type SafetyRisk = 'low' | 'medium' | 'high';

export interface StepParameters {
  app_name?: string;
  query?: string;
  command?: string;
  url?: string;
  selector?: string;
  value?: string;
  text?: string;
  path?: string;
  destination?: string;
  content?: string;
  seconds?: number;
}

export interface PlanStep {
  step_number: number;
  description: string;
  capability: Capability;
  parameters: StepParameters;
  safety_risk: SafetyRisk;
}

export interface Plan {
  intent: string;
  confidence: number;
  requires_confirmation: boolean;
  summary: string;
  steps: PlanStep[];
}

// ─── Review Types ─────────────────────────────────────────────────────────────

export type ReviewVerdict = 'SAFE' | 'UNSAFE' | 'REVIEW_REQUIRED';

export interface ReviewResult {
  verdict: ReviewVerdict;
  confidence: number;
  risks: string[];
  safe_steps: number[];
  risky_steps: number[];
  recommendation: string;
}

// ─── Session Types ────────────────────────────────────────────────────────────

export type SessionStatus = 'planned' | 'executing' | 'completed' | 'failed' | 'stopped';

export interface Session {
  plan: Plan;
  status: SessionStatus;
  currentStep: number;
  stopped: boolean;
}

// ─── Step Result Types ────────────────────────────────────────────────────────

export interface StepResult {
  success: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
  url?: string;
  title?: string;
  path?: string;
  warning?: string;
  downloadedFrom?: string;
  [key: string]: unknown;
}

export interface StepExecutionResult {
  stepNumber: number;
  success: boolean;
  result?: StepResult;
  error?: string;
  duration?: number;
}

// ─── WebSocket Message Types ──────────────────────────────────────────────────

export type WsMessageType =
  | 'connected'
  | 'planning'
  | 'plan_ready'
  | 'execution_start'
  | 'step_start'
  | 'step_complete'
  | 'step_error'
  | 'safety_check'
  | 'execution_complete'
  | 'execution_failed'
  | 'execution_stopped'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  sessionId?: string;
  message?: string;
  plan?: Plan;
  step?: PlanStep;
  stepNumber?: number;
  result?: StepResult;
  results?: StepExecutionResult[];
  totalSteps?: number;
  duration?: number;
  error?: string;
  summary?: {
    total: number;
    success: number;
    failed: number;
    duration: number;
  };
}

// ─── API Request / Response Types ─────────────────────────────────────────────

export interface PlanRequest { prompt: string }
export interface PlanResponse { sessionId: string; plan: Plan }
export interface ExecuteRequest { sessionId: string }
export interface StopRequest { sessionId: string }
export interface ReviewRequest { plan: Plan }
export interface HealthResponse { status: string; timestamp: string; provider: string }