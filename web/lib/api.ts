import { Plan, ReviewResult, ExecutionState, CommerceProduct, CommerceSession, CommerceTransaction } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function fetchAPI<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'API error')
  return data
}

export interface PlanResponse {
  sessionId: string
  plan: Plan
}

export interface ExecuteResponse {
  status: string
  message: string
}

export interface StopResponse {
  status: string
}

export interface HealthResponse {
  status: string
  timestamp: string
  provider: string
}

export const api = {
  health: () =>
    fetchAPI<HealthResponse>('/api/health'),

  plan: (prompt: string) =>
    fetchAPI<PlanResponse>('/api/plan', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  review: (plan: Plan) =>
    fetchAPI<ReviewResult>('/api/review', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  execute: (sessionId: string) =>
    fetchAPI<ExecuteResponse>('/api/execute', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  stop: (sessionId: string) =>
    fetchAPI<StopResponse>('/api/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  getSession: (sessionId: string) =>
    fetchAPI<ExecutionState>(`/api/session/${sessionId}`),

  commerceCatalog: () => fetchAPI<{ products: CommerceProduct[] }>('/commerce/catalog'),
  commerceStart: (buyerType: 'human' | 'simulated_agent' = 'human') =>
    fetchAPI<CommerceSession>('/commerce/session/start', { method: 'POST', body: JSON.stringify({ buyerType }) }),
  commerceMessage: (sessionId: string, message: string) =>
    fetchAPI<{ result: { reply: string; action: string }; session: CommerceSession | undefined }>(`/commerce/session/${sessionId}/message`, { method: 'POST', body: JSON.stringify({ message }) }),
  commerceCheckout: (sessionId: string, key: string, demoOutcome?: 'success' | 'failure') =>
    fetchAPI<{ transaction: CommerceTransaction; decision: string; amount: number }>(`/commerce/session/${sessionId}/checkout`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ demoOutcome }) }),
  commerceApprove: (sessionId: string, key: string) =>
    fetchAPI<{ transaction: CommerceTransaction }>(`/commerce/session/${sessionId}/approve`, { method: 'POST', headers: { 'Idempotency-Key': key } }),
  commerceReject: (sessionId: string) =>
    fetchAPI<{ transaction: CommerceTransaction }>(`/commerce/session/${sessionId}/reject`, { method: 'POST' }),
  commerceMetrics: () => fetchAPI<{ sessions: number; checkoutInitiated: number; completionRate: number; captured: number; failed: number; humanGated: number; autoApproved: number }>('/commerce/metrics'),
  commerceSimulate: (persona: string, goal: string) => fetchAPI<unknown>('/commerce/simulate', { method: 'POST', body: JSON.stringify({ persona, goal }) }),
}
