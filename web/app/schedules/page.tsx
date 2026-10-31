'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PageShell from '@/components/PageShell'
import { api } from '@/lib/api'
import type { ScheduleRecord } from '@/types'

const PRESET_CRONS = [
  { label: 'Every 5 min', expr: '*/5 * * * *' },
  { label: 'Every 15 min', expr: '*/15 * * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Daily at 9 AM', expr: '0 9 * * *' },
  { label: 'Daily at 2 AM', expr: '0 2 * * *' },
  { label: 'Weekdays 9 AM', expr: '0 9 * * 1-5' },
]

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([])
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [cronExpression, setCronExpression] = useState('*/15 * * * *')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)

  async function loadSchedules() {
    try {
      const data = await api.listSchedules()
      setSchedules(data || [])
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  useEffect(() => {
    void loadSchedules()
    // Poll every 5s to refresh statuses and execution results
    const interval = setInterval(() => {
      void loadSchedules()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  async function createSchedule() {
    if (!name.trim() || !prompt.trim() || !cronExpression.trim()) return
    setLoading(true)
    setMessage('')
    try {
      const result = await api.createSchedule({
        name: name.trim(),
        prompt: prompt.trim(),
        cronExpression: cronExpression.trim(),
        enabled: true,
      })
      setSchedules((cur) => [result.schedule, ...cur])
      setName('')
      setPrompt('')
      setMessage('Schedule created successfully')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSchedule(schedule: ScheduleRecord) {
    try {
      const updated = await api.updateSchedule(schedule.id, { enabled: !schedule.enabled })
      setSchedules((cur) => cur.map((s) => (s.id === schedule.id ? updated.schedule : s)))
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  async function deleteSchedule(id: string) {
    if (!window.confirm('Delete this scheduled job?')) return
    try {
      await api.deleteSchedule(id)
      setSchedules((cur) => cur.filter((s) => s.id !== id))
      setMessage('Schedule deleted')
    } catch (error) {
      setMessage((error as Error).message)
    }
  }

  async function runNow(schedule: ScheduleRecord) {
    setRunningId(schedule.id)
    setMessage(`Triggering "${schedule.name}" now...`)
    try {
      const res = await api.runScheduleNow(schedule.id)
      setMessage(`Started execution: Session ${res.sessionId.slice(0, 8)}... View on Dashboard or History!`)
      await loadSchedules()
    } catch (error) {
      setMessage(`Run failed: ${(error as Error).message}`)
    } finally {
      setRunningId(null)
    }
  }

  return (
    <PageShell eyebrow="Automation / Daemon" title="Scheduled Runs">
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
        
        {/* Create Form */}
        <section className="bg-s1 border border-border rounded-lg p-5">
          <div className="font-mono text-xs uppercase tracking-wider text-muted mb-4">
            New Scheduled Job
          </div>

          {message && (
            <div className="text-cyan text-xs mb-4 p-3 bg-cyan/10 border border-cyan/20 rounded font-medium">
              {message}
            </div>
          )}

          <label className="block text-xs text-muted mb-3">
            JOB NAME
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Check Payment Disputes"
              className="mt-1.5 w-full bg-s2 border border-border rounded-md px-3 py-2 text-sm text-ntext outline-none focus:border-cyan"
            />
          </label>

          <label className="block text-xs text-muted mb-3">
            AUTOMATION PROMPT
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Open the merchant dashboard and check for any failed payment disputes in the last hour"
              rows={3}
              className="mt-1.5 w-full bg-s2 border border-border rounded-md px-3 py-2 text-sm text-ntext outline-none focus:border-cyan resize-none"
            />
          </label>

          <label className="block text-xs text-muted mb-2">
            CRON EXPRESSION
            <input
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="*/15 * * * *"
              className="mt-1.5 w-full bg-s2 border border-border rounded-md px-3 py-2 font-mono text-sm text-cyan outline-none focus:border-cyan"
            />
          </label>

          <div className="flex flex-wrap gap-1.5 mb-5">
            {PRESET_CRONS.map((p) => (
              <button
                key={p.expr}
                type="button"
                onClick={() => setCronExpression(p.expr)}
                className={`px-2 py-1 text-[11px] rounded border transition-colors cursor-pointer ${
                  cronExpression === p.expr
                    ? 'border-cyan text-cyan bg-cyan/10'
                    : 'border-border text-muted hover:text-ntext bg-s2'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!name.trim() || !prompt.trim() || !cronExpression.trim() || loading}
            onClick={createSchedule}
            className="w-full bg-cyan text-bg rounded-md py-2.5 text-sm font-medium disabled:opacity-40 cursor-pointer transition-opacity"
          >
            {loading ? 'Creating...' : 'Schedule Automation'}
          </button>
        </section>

        {/* Existing Schedules List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted px-1">
            <span>ACTIVE SCHEDULES ({schedules.length})</span>
            <span>Auto-refreshes every 5s</span>
          </div>

          {schedules.length === 0 ? (
            <div className="bg-s1 border border-border rounded-lg p-10 text-center text-sm text-muted">
              No scheduled jobs yet. Add one on the left to run tasks automatically in the background.
            </div>
          ) : (
            schedules.map((schedule) => (
              <div key={schedule.id} className="bg-s1 border border-border rounded-lg p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-ntext font-semibold text-base">{schedule.name}</div>
                    <div className="font-mono text-xs text-cyan mt-0.5">{schedule.cronExpression}</div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={runningId === schedule.id}
                      onClick={() => runNow(schedule)}
                      className="px-3 py-1 bg-cyan/10 hover:bg-cyan/20 border border-cyan/40 text-cyan rounded text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {runningId === schedule.id ? 'Running...' : 'Run Now'}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleSchedule(schedule)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase cursor-pointer border ${
                        schedule.enabled
                          ? 'border-green/40 text-green bg-green/10'
                          : 'border-muted/40 text-muted bg-s2'
                      }`}
                    >
                      {schedule.enabled ? 'Active' : 'Paused'}
                    </button>
                  </div>
                </div>

                <div className="text-sm text-muted bg-s2 p-3 rounded border border-border my-3 font-sans">
                  {schedule.prompt}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted pt-2 border-t border-border/50">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span>
                      Last Run:{' '}
                      <span className="text-ntext font-mono">
                        {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleTimeString() : 'Never'}
                      </span>
                    </span>
                    {schedule.lastStatus && (
                      <span>
                        Status:{' '}
                        <span
                          className={`font-mono font-semibold uppercase ${
                            schedule.lastStatus === 'completed'
                              ? 'text-green'
                              : schedule.lastStatus === 'failed'
                              ? 'text-red'
                              : 'text-amber'
                          }`}
                        >
                          {schedule.lastStatus}
                        </span>
                      </span>
                    )}
                    {schedule.lastSessionId && (
                      <Link
                        href={`/history`}
                        className="text-cyan underline hover:text-cyan/80 font-mono text-[11px]"
                      >
                        Session: {schedule.lastSessionId.slice(0, 8)}...
                      </Link>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => deleteSchedule(schedule.id)}
                      className="px-3 py-1.5 border border-red/30 text-red hover:bg-red/10 rounded-md text-xs cursor-pointer transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </PageShell>
  )
}
