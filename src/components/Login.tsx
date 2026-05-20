import { useState, FormEvent } from 'react'
import { testAuth } from '../api'

interface Props {
  onSuccess: () => void
}

export default function Login({ onSuccess }: Props) {
  const [key,     setKey]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const ok = await testAuth(key)
      if (ok) {
        localStorage.setItem('snaphook_admin_key', key)
        onSuccess()
      } else {
        setError('Invalid admin key. Please try again.')
      }
    } catch {
      setError('Connection failed. Check the API URL.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl p-8 w-full max-w-md border border-white/5 shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
            <span className="text-2xl font-bold tracking-tight text-white">SnapHook</span>
          </div>
          <p className="text-muted text-sm">Admin Console</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted mb-1.5">Admin Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your admin key"
              autoComplete="current-password"
              className="w-full bg-navy border border-white/10 rounded-xl px-4 py-3 text-white
                         placeholder-muted/50 focus:outline-none focus:border-teal/60
                         transition-colors text-sm"
            />
          </div>

          {error && (
            <p className="text-danger text-sm bg-danger/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full bg-teal text-navy font-semibold py-3 rounded-xl
                       hover:bg-teal/90 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all text-sm"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
