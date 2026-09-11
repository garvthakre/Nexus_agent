'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { api, ApiKeyRecord } from '@/lib/api'

const providers = ['groq', 'openai', 'anthropic', 'gemini']

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.listKeys().then(setKeys).catch((error) => setMessage(error.message)).finally(() => setLoading(false)) }, [])

  async function save(provider: string) {
    if (!values[provider]?.trim()) return
    try {
      await api.saveKey(provider, values[provider].trim())
      setKeys((current) => [...current.filter((key) => key.provider !== provider), { provider, updatedAt: new Date().toISOString() }])
      setValues((current) => ({ ...current, [provider]: '' }))
      setMessage(`${provider.toUpperCase()} key saved`)
    } catch (error) { setMessage((error as Error).message) }
  }

  async function remove(provider: string) {
    if (!window.confirm(`Delete the ${provider.toUpperCase()} key?`)) return
    try { await api.deleteKey(provider); setKeys((current) => current.filter((key) => key.provider !== provider)); setMessage(`${provider.toUpperCase()} key deleted`) }
    catch (error) { setMessage((error as Error).message) }
  }

  return <PageShell eyebrow="Settings / BYOK" title="API key vault">
    <div className="max-w-3xl space-y-3">
      <p className="text-sm text-muted mb-6">Bring your own provider keys. Values are encrypted by the backend and never returned to the browser.</p>
      {message && <div className="border border-cyan/30 bg-cyan/5 text-cyan text-sm rounded-md px-4 py-3">{message}</div>}
      {loading ? <div className="text-muted text-sm">Loading provider status...</div> : providers.map((provider) => {
        const active = keys.some((key) => key.provider === provider)
        return <div key={provider} className="bg-s1 border border-border rounded-lg p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-32 shrink-0"><div className="text-ntext font-medium capitalize">{provider}</div><div className={`text-[11px] uppercase tracking-wider mt-1 ${active ? 'text-green' : 'text-muted'}`}>{active ? 'Configured' : 'Missing'}</div></div>
          <input type="password" value={values[provider] ?? ''} onChange={(event) => setValues({ ...values, [provider]: event.target.value })} placeholder={active ? 'Enter a replacement key' : 'Paste provider key'} className="flex-1 bg-s2 border border-border rounded-md px-3 py-2.5 text-sm text-ntext outline-none focus:border-cyan" />
          <button type="button" onClick={() => save(provider)} className="px-4 py-2.5 rounded-md bg-cyan text-bg text-sm font-medium cursor-pointer">Save</button>
          {active && <button type="button" onClick={() => remove(provider)} className="px-3 py-2.5 rounded-md border border-red/30 text-red text-sm cursor-pointer">Delete</button>}
        </div>
      })}
    </div>
  </PageShell>
}