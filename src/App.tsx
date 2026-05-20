import { useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'

export default function App() {
  const [authed, setAuthed] = useState(
    () => !!localStorage.getItem('snaphook_admin_key'),
  )

  const handleSignOut = () => {
    localStorage.removeItem('snaphook_admin_key')
    setAuthed(false)
  }

  return authed
    ? <Dashboard onSignOut={handleSignOut} />
    : <Login onSuccess={() => setAuthed(true)} />
}
