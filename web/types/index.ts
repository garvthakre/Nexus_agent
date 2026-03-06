// ─── Capability ───────────────────────────────────────────────────────────────

export type Capability =
  | 'browser_open' | 'browser_click' | 'browser_fill'
  | 'browser_read_page' | 'browser_extract_results'
  | 'browser_wait_for_element' | 'browser_get_page_state'
  | 'browser_screenshot_analyze' | 'browser_screenshot'
  | 'open_application'
  | 'app_find_window' | 'app_focus_window' | 'app_click'
  | 'app_type' | 'app_screenshot' | 'app_verify'
  | 'type_text' | 'run_shell_command' | 'set_wallpaper'
  | 'create_file' | 'create_folder' | 'download_file'
  | 'wait'

export type SafetyRisk = 'low' | 'medium' | 'high'
export type StepStatus  = 'pending' | 'running' | 'complete' | 'error'

// ─── Plan Step ────────────────────────────────────────────────────────────────

export interface StepParameters {
  url?: string
  selector?: string
  value?: string
  seconds?: number
  variable_name?: string
  topic?: string
  count?: number
  target_description?: string
  action?: 'click' | 'fill'
  app_name?: string
  element_name?: string
  text?: string
  path?: string
  destination?: string
  content?: string
  command?: string
  query?: string
}

export interface PlanStep {
  step_number: number
  capability: Capability
  parameters: StepParameters
  description: string
  safety_risk: SafetyRisk
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface Plan {
  intent: string
  confidence: number
  requires_confirmation: boolean
  summary: string
  steps: PlanStep[]
}

// ─── Step Result ──────────────────────────────────────────────────────────────

export interface StepResult {
  success: boolean
  message?: string
  url?: string
  title?: string
  content?: string
  summary?: string
  results?: unknown[]
  navigated?: boolean
  warning?: string
  strategy?: string
  error?: string
  path?: string
  stdout?: string
  stderr?: string
}

// ─── Execution Summary ────────────────────────────────────────────────────────

export interface ExecutionSummary {
  total: number
  success: number
  failed: number
  duration?: number
}

// ─── Execution State ──────────────────────────────────────────────────────────

export type ExecutionStatus = 'idle' | 'planned' | 'executing' | 'completed' | 'failed' | 'stopped'

export interface ExecutionState {
  status: ExecutionStatus
  currentStep: number | null
  completedSteps: number[]
  failedStep: number | null
  stepResults: Record<number, StepResult>
  summary: ExecutionSummary | null
}

// ─── Review ───────────────────────────────────────────────────────────────────

export interface ReviewResult {
  verdict: 'SAFE' | 'UNSAFE' | 'REVIEW_REQUIRED'
  confidence: number
  risks: string[]
  safe_steps: number[]
  risky_steps: number[]
  recommendation: string
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export type WsMessageType =
  | 'connected' | 'planning' | 'plan_ready'
  | 'execution_start' | 'step_start' | 'step_complete' | 'step_error'
  | 'safety_check' | 'execution_complete' | 'execution_failed'
  | 'execution_stopped' | 'error'

export interface ActivityEvent {
  type: WsMessageType
  message: string
  time: string
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

export interface WsMessage {
  type: WsMessageType
  message?: string
  sessionId?: string
  plan?: Plan
  step?: PlanStep
  stepNumber?: number
  result?: StepResult
  results?: Array<{ stepNumber: number; success: boolean }>
  duration?: number
  error?: string
  totalSteps?: number
  summary?: ExecutionSummary
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  plan: Plan
  status: ExecutionStatus
  currentStep: number
  stopped: boolean
}

// ─── API request/response ─────────────────────────────────────────────────────

export interface PlanRequest   { prompt: string }
export interface ExecuteRequest { sessionId: string }
export interface StopRequest    { sessionId: string }
export interface ReviewRequest  { plan: Plan }