export function resetAuthSession(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem('nexus_token')
  window.location.reload()
}