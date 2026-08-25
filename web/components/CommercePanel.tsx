'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { CommerceProduct, CommerceSession, CommerceTransaction } from '@/types'

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

export default function CommercePanel() {
  const [products, setProducts] = useState<CommerceProduct[]>([])
  const [session, setSession] = useState<CommerceSession | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [failureDemo, setFailureDemo] = useState(false)
  const [metrics, setMetrics] = useState({ sessions: 0, checkoutInitiated: 0, completionRate: 0, captured: 0, failed: 0, humanGated: 0, autoApproved: 0 })
  const [notice, setNotice] = useState('')
  const [transaction, setTransaction] = useState<CommerceTransaction | null>(null)

  useEffect(() => {
    void Promise.all([api.commerceCatalog(), api.commerceMetrics()])
      .then(([catalog, currentMetrics]) => { setProducts(catalog.products); setMetrics(currentMetrics) })
      .catch((error: Error) => setNotice(error.message))
  }, [])

  const refreshMetrics = () => { void api.commerceMetrics().then(setMetrics).catch(() => undefined) }
  const start = () => {
    void api.commerceStart().then(setSession).catch((error: Error) => setNotice(error.message))
  }
  const send = async (text: string = message) => {
    if (!session || !text.trim()) return
    setLoading(true)
    try {
      const response = await api.commerceMessage(session.sessionId, text)
      setSession(response.session ?? session)
      setMessage('')
    } catch (error) { setNotice((error as Error).message) }
    finally { setLoading(false) }
  }
  const checkout = async () => {
    if (!session) return
    setLoading(true)
    try {
      const result = await api.commerceCheckout(session.sessionId, crypto.randomUUID(), failureDemo ? 'failure' : 'success')
      setTransaction(result.transaction)
      setNotice(`${result.decision}: ${result.transaction.status}. ${result.transaction.reasoning}`)
      refreshMetrics()
    } catch (error) { setNotice((error as Error).message) }
    finally { setLoading(false) }
  }
  const approve = async () => {
    if (!session || !transaction) return
    try {
      const result = await api.commerceApprove(session.sessionId, crypto.randomUUID())
      setTransaction(result.transaction)
      setNotice('Human approval recorded. The Razorpay test order is pending payment confirmation.')
      refreshMetrics()
    } catch (error) { setNotice((error as Error).message) }
  }
  const reject = async () => {
    if (!session) return
    try {
      const result = await api.commerceReject(session.sessionId)
      setTransaction(result.transaction)
      setNotice('Checkout rejected by a human reviewer.')
      refreshMetrics()
    } catch (error) { setNotice((error as Error).message) }
  }
  const simulate = () => {
    setLoading(true)
    void api.commerceSimulate('A price-sensitive student developer', 'Find a practical laptop stand and checkout if the value is good')
      .then(() => { setNotice('Simulation completed'); refreshMetrics() })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setLoading(false))
  }

  const total = session?.cartItems.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId)
    return sum + (product?.price ?? 0) * item.quantity
  }, 0) ?? 0

  return (
    <section className="bg-s1 border border-border rounded-lg p-5 mt-6 slide-up-anim">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-xs text-cyan font-mono tracking-widest mb-1">COMMERCE LAB</div>
          <h2 className="font-display text-3xl text-ntext">Nexus Desk Kit</h2>
          <p className="text-sm text-muted">Catalog-grounded selling with a human approval gate.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={start} className="px-3 py-2 rounded border border-cyan text-cyan text-sm">New session</button>
          <button onClick={simulate} disabled={loading} className="px-3 py-2 rounded border border-border2 text-ntext text-sm">Run buyer simulation</button>
        </div>
      </div>

      {notice && <div className="border border-amber/40 text-amber text-sm p-3 mb-4 rounded">{notice}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_280px] gap-4">
        <div>
          <div className="text-xs text-muted font-mono mb-2">CATALOG / 20 ITEMS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[390px] overflow-auto pr-1">
            {products.map((product) => (
              <button key={product.id} onClick={() => void send(`Add one ${product.name} to my cart`)} disabled={!session || loading} className="text-left bg-s2 border border-border rounded p-3 hover:border-cyan transition-colors disabled:opacity-50">
                <div className="text-sm text-ntext font-medium">{product.name}</div>
                <div className="text-xs text-muted mt-1 line-clamp-2">{product.description}</div>
                <div className="text-cyan text-sm mt-2">{money(product.price)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-s2 border border-border rounded p-4 min-h-[390px] flex flex-col">
          <div className="text-xs text-muted font-mono mb-3">CONVERSATION</div>
          <div className="flex-1 overflow-auto space-y-2 mb-3">
            {!session && <p className="text-sm text-muted">Start a session to talk to the commerce agent.</p>}
            {session?.messages.map((item, index) => <div key={`${item.timestamp}-${index}`} className={`text-sm p-2 rounded ${item.role === 'buyer' ? 'bg-s3 text-ntext' : 'bg-cyan/10 text-cyan'}`}><span className="text-[10px] uppercase opacity-60">{item.role}</span><br />{item.content}</div>)}
          </div>
          <div className="flex gap-2">
            <input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send() }} placeholder="Ask about the gear..." className="min-w-0 flex-1 bg-s3 border border-border2 rounded px-3 py-2 text-sm text-ntext outline-none focus:border-cyan" />
            <button onClick={() => void send()} disabled={!session || loading} className="px-3 rounded bg-cyan text-bg text-sm font-semibold disabled:opacity-40">Send</button>
          </div>
        </div>

        <div className="bg-s2 border border-border rounded p-4">
          <div className="text-xs text-muted font-mono mb-3">CHECKOUT</div>
          <div className="text-2xl text-ntext mb-4">{money(total)}</div>
          <div className="text-xs text-muted mb-4">Status: <span className="text-cyan">{session?.status ?? 'no session'}</span></div>
          <label className="flex items-center gap-2 text-xs text-amber mb-4"><input type="checkbox" checked={failureDemo} onChange={(event) => setFailureDemo(event.target.checked)} /> Force test failure</label>
          <button onClick={() => void checkout()} disabled={!session || total === 0 || loading} className="w-full px-3 py-2 rounded bg-green text-bg text-sm font-semibold disabled:opacity-40">Create test order</button>
          {transaction?.gatingDecision === 'human_approval_required' && transaction.status === 'created' && <div className="mt-3 border border-amber/40 rounded p-3"><div className="text-xs text-amber mb-2">Human approval required</div><div className="flex gap-2"><button onClick={() => void approve()} className="flex-1 px-2 py-1 rounded bg-amber text-bg text-xs font-semibold">Approve</button><button onClick={() => void reject()} className="flex-1 px-2 py-1 rounded border border-red text-red text-xs">Reject</button></div></div>}
          <div className="border-t border-border mt-5 pt-4 text-xs text-muted space-y-2">
            <div>Auto-approved: <span className="text-green">{metrics.autoApproved}</span></div>
            <div>Human-gated: <span className="text-amber">{metrics.humanGated}</span></div>
            <div>Captured: <span className="text-green">{metrics.captured}</span></div>
            <div>Failed: <span className="text-red">{metrics.failed}</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}
