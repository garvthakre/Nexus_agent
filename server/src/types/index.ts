/**
 *  
 *
 *
 *  
 *   + browser_screenshot_analyze  (NEW — Vision fallback capability)
 *
 * Already present from Week 2:
 *   + browser_wait_for_element
 *   + browser_get_page_state
 */

// ─── Capability Union ─────────────────────────────────────────────────────────
// This is the exhaustive list of all capabilities the planner can emit.
// Add new capabilities here AND in:
//   1. stepExecutor.ts executeStep() switch
//   2. planner.ts VALID_CAPABILITIES set
//   3. planner.ts STATIC_SYSTEM_PROMPT capability catalog

export type Capability =
  // Browser automation
  | 'browser_open'
  | 'browser_click'
  | 'browser_fill'
  | 'browser_read_page'
  | 'browser_extract_results'
  | 'browser_wait_for_element'      
  | 'browser_get_page_state'       
  | 'browser_screenshot_analyze' 
  | 'browser_screenshot'    

  // App automation
  | 'open_application'
  | 'app_find_window'
  | 'app_focus_window'
  | 'app_click'
  | 'app_type'
  | 'app_screenshot'
  | 'app_verify'

  // System
  | 'type_text'
  | 'run_shell_command'
  | 'set_wallpaper'

  // Files
  | 'create_file'
  | 'create_folder'
  | 'download_file'

  // Utility
  | 'wait';
  | 'whatsapp_send'
| 'whatsapp_get_chats';

// ─── Step Parameters ──────────────────────────────────────────────────────────

export interface StepParameters {
  // browser_open
  url?: string;

  // browser_click / browser_fill / browser_wait_for_element
  selector?: string;
  value?: string;
  seconds?: number;

  // browser_read_page / browser_extract_results
  variable_name?: string;
  topic?: string;
  count?: number;

  // browser_screenshot_analyze  (Week 3)
  target_description?: string;
  action?: 'click' | 'fill';

  // open_application / app_*
  app_name?: string;
  element_name?: string;
  text?: string;

  // create_file / create_folder / download_file
  path?: string;
  destination?: string;
  content?: string;

  // run_shell_command
  command?: string;

  // set_wallpaper
  query?: string;
}


// ─── Plan Step ────────────────────────────────────────────────────────────────

export interface PlanStep {
  capability: Capability;
  parameters: StepParameters;
  description: string;
}


// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface Plan {
  steps: PlanStep[];
  reasoning?: string;
}


// ─── Step Result ──────────────────────────────────────────────────────────────

export interface StepResult {
  success: boolean;
  message?: string;
  url?: string;
  title?: string;
  content?: string;
  results?: unknown[];
  navigated?: boolean;
  warning?: string;
  strategy?: string;       // Which tier/selector won (for logging)
  error?: string;
  path ?: string;          // For screenshots or files
}


// ─── Execution Log Entry ──────────────────────────────────────────────────────

export interface ExecutionLogEntry {
  sessionId:     string;
  taskPrompt:    string;
  timestamp:     string;
  totalSteps:    number;
  failedSteps:   number;
  overallSuccess: boolean;
  successRate:   number;
  durationMs:    number;
  steps: Array<{
    stepIndex:    number;
    capability:   Capability;
    description:  string;
    success:      boolean;
    strategy?:    string;
    errorMessage?: string;
    durationMs:   number;
    retryCount:   number;
    pageUrl?:     string;
  }>;
}