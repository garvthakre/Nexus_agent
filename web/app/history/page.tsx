'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { api } from '@/lib/api'
import type { TraceRecord } from '@/types'

export default function HistoryPage() {
  const [traces, setTraces] = useState<TraceRecord[]>([])
  const [selected, setSelected] = useState<TraceRecord | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { api.listTraces().then(setTraces).catch((reason) => setError((reason as Error).message)) }, [])

  return <PageShell eyebrow="Observability / Runs" title="Execution history">
    {error && <div className="mb-4 border border-red/30 bg-red/5 text-red rounded-md px-4 py-3 text-sm">{error}</div>}
    <div className="bg-s1 border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between"><span className="font-mono text-xs tracking-wider text-muted uppercase">Recent traces</span><span className="text-xs text-muted">{traces.length} records</span></div>
      {traces.length === 0 ? <div className="p-10 text-center text-sm text-muted">No executions recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-s2 text-[11px] uppercase tracking-wider text-muted"><tr><th className="px-5 py-3">Task</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Steps</th><th className="px-5 py-3">Latency</th><th className="px-5 py-3">Created</th></tr></thead><tbody>{traces.map((trace) => <tr key={trace.id} onClick={() => api.getTrace(trace.id).then(setSelected).catch((reason) => setError((reason as Error).message))} className="border-t border-border hover:bg-s2 cursor-pointer"><td className="px-5 py-4 max-w-[420px]"><div className="text-sm text-ntext truncate">{trace.summary || trace.prompt}</div><div className="text-[11px] font-mono text-muted mt-1">{trace.id.slice(0, 8)}</div></td><td className="px-5 py-4"><span className={`text-xs uppercase ${trace.status === 'completed' ? 'text-green' : trace.status === 'failed' ? 'text-red' : 'text-amber'}`}>{trace.status}</span></td><td className="px-5 py-4 text-sm text-muted">{trace.successfulSteps}/{trace.totalSteps}</td><td className="px-5 py-4 text-sm text-muted">{trace.executionLatencyMs} ms</td><td className="px-5 py-4 text-xs text-muted">{new Date(trace.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </div>
    {selected && <div className="fixed inset-0 z-50 bg-bg/80 flex justify-end" onClick={() => setSelected(null)}><aside className="w-full max-w-xl h-full overflow-y-auto bg-s1 border-l border-border p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4 mb-7"><div><div className="font-mono text-[11px] text-cyan uppercase tracking-wider mb-2">Trace detail</div><h2 className="text-xl text-ntext">{selected.summary || selected.prompt}</h2></div><button type="button" onClick={() => setSelected(null)} className="text-muted hover:text-ntext text-xl cursor-pointer" aria-label="Close trace detail">×</button></div><div className="grid grid-cols-3 gap-2 mb-7">{[['Steps', selected.totalSteps], ['Tokens', selected.totalTokens], ['LLM ms', selected.llmLatencyMs]].map(([label, value]) => <div key={label} className="bg-s2 border border-border rounded-md p-3"><div className="text-[10px] text-muted uppercase">{label}</div><div className="text-lg text-ntext mt-1">{value}</div></div>)}</div><div className="space-y-3">{(selected.traceSteps ?? []).map((step) => <div key={step.id} className="border-l-2 border-cyan/40 pl-4 py-1"><div className="flex justify-between gap-3"><span className="text-sm text-ntext">{step.stepNumber}. {step.description}</span><span className={`text-xs uppercase ${step.status === 'completed' ? 'text-green' : 'text-red'}`}>{step.status}</span></div><div className="font-mono text-[11px] text-cyan mt-1">{step.capability}</div>{step.error && <div className="text-xs text-red mt-2">{step.error}</div>}{step.result && <pre className="mt-2 bg-s2 rounded p-3 text-[11px] text-muted overflow-auto">{JSON.stringify(step.result, null, 2)}</pre>}</div>)}</div></aside></div>}
  </PageShell>
}
