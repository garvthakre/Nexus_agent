'use client'

import { FormEvent, useState } from 'react'
import { api } from '@/lib/api'

export default function AuthForm() {
  const [registering, setRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const result = registering ? await api.register(email, password) : await api.login(email, password)
      localStorage.setItem('nexus_token', result.token)
      window.location.reload()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg px-6">
      <form onSubmit={submit} className="w-full max-w-md bg-s1 border border-border rounded-lg p-6">
        <h1 className="font-display text-2xl text-ntext mb-2">NEXUS Agent</h1>
        <p className="text-muted text-sm mb-5">{registering ? 'Create your account' : 'Sign in to continue'}</p>
        <input className="w-full mb-3 p-3 bg-s2 text-ntext border border-border rounded" type="email" required placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input className="w-full mb-3 p-3 bg-s2 text-ntext border border-border rounded" type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="text-red text-sm mb-3">{error}</p>}
        <button className="w-full p-3 bg-cyan text-bg rounded cursor-pointer" type="submit">{registering ? 'Register' : 'Login'}</button>
        <button className="w-full mt-3 text-cyan text-sm bg-transparent border-none cursor-pointer" type="button" onClick={() => setRegistering(!registering)}>{registering ? 'Already have an account? Login' : 'Create an account'}</button>
      </form>
    </main>
  )
}
