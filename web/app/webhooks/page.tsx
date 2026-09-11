'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { api } from '@/lib/api'
import type { UserWebhookConfig } from '@/types'

const events = ['execution.started', 'execution.completed', 'execution.failed', 'step.error']

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<UserWebhookConfig[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['execution.completed'])
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadWebhooks() {
      try { setWebhooks(await api.listWebhooks()) } catch (error) { setMessage((error as Error).message) }
    }
    void loadWebhooks()
  }, [])

  function toggleEvent(event: string) { setSelectedEvents((current) => current.includes(event) ? current.filter((item) => item !== event) : [...current, event]) }
  async function register() {
    try { const result = await api.createWebhook({ name: name || undefined, url, events: selectedEvents }); setWebhooks((current) => [result.webhook, ...current]); setName(''); setUrl(''); setMessage('Webhook registered') }
    catch (error) { setMessage((error as Error).message) }
  }
  async function remove(id: string) { if (!window.confirm('Delete this webhook?')) return; try { await api.deleteWebhook(id); setWebhooks((current) => current.filter((webhook) => webhook.id !== id)); setMessage('Webhook deleted') } catch (error) { setMessage((error as Error).message) } }
  async function test(id: string) { try { const result = await api.testWebhook(id); setMessage(`Test dispatched as ${result.event}`) } catch (error) { setMessage((error as Error).message) } }

  return <PageShell eyebrow="Integrations / Delivery" title="Webhooks">
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
      <section className="bg-s1 border border-border rounded-lg p-5"><div className="font-mono text-xs uppercase tracking-wider text-muted mb-5">Register endpoint</div>{message && <div className="text-cyan text-xs mb-4">{message}</div>}<label className="block text-xs text-muted mb-2">NAME <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Production listener" className="mt-2 w-full bg-s2 border border-border rounded-md px-3 py-2.5 text-sm text-ntext outline-none focus:border-cyan" /></label><label className="block text-xs text-muted mb-5">URL <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/hooks/nexus" type="url" className="mt-2 w-full bg-s2 border border-border rounded-md px-3 py-2.5 text-sm text-ntext outline-none focus:border-cyan" /></label><div className="text-xs text-muted mb-3">EVENTS</div><div className="space-y-2 mb-6">{events.map((event) => <label key={event} className="flex items-center gap-3 text-sm text-ntext cursor-pointer"><input type="checkbox" checked={selectedEvents.includes(event)} onChange={() => toggleEvent(event)} className="accent-cyan" />{event}</label>)}</div><button type="button" disabled={!url || selectedEvents.length === 0} onClick={register} className="w-full bg-cyan text-bg rounded-md py-2.5 text-sm font-medium disabled:opacity-40 cursor-pointer">Register webhook</button></section>
      <section className="space-y-3">{webhooks.length === 0 ? <div className="bg-s1 border border-border rounded-lg p-10 text-center text-sm text-muted">No webhook endpoints configured.</div> : webhooks.map((webhook) => <div key={webhook.id} className="bg-s1 border border-border rounded-lg p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-ntext font-medium">{webhook.name || 'Unnamed endpoint'}</div><div className="font-mono text-xs text-cyan mt-1 break-all">{webhook.url}</div></div><span className="text-[11px] uppercase text-green">{webhook.active ? 'Active' : 'Paused'}</span></div><div className="flex flex-wrap gap-2 mt-4">{webhook.events.map((event) => <span key={event} className="px-2 py-1 bg-s2 rounded text-[11px] text-muted">{event}</span>)}</div><div className="flex gap-2 mt-5"><button type="button" onClick={() => test(webhook.id)} className="px-3 py-2 border border-cyan/30 text-cyan rounded-md text-xs cursor-pointer">Send test</button><button type="button" onClick={() => remove(webhook.id)} className="px-3 py-2 border border-red/30 text-red rounded-md text-xs cursor-pointer">Delete</button></div></div>)}</section>
    </div>
  </PageShell>
}
