import { Plan, ReviewResult, ExecutionState } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function fetchAPI<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  register: (email: string, password: string) => fetchAPI<{ token: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => fetchAPI<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listKeys: () => fetchAPI<Array<{ provider: string; updatedAt: string }>>('/api/keys'),
  saveKey: (provider: string, key: string) => fetchAPI('/api/keys', { method: 'POST', body: JSON.stringify({ provider, key }) }),
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
}
