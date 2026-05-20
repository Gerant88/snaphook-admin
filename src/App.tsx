import { useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import MapPage from './pages/MapPage'

export type Page = 'dashboard' | 'map'

export default function App() {
  const [authed, setAuthed] = useState(
    () => !!localStorage.getItem('snaphook_admin_key'),
  )
  const [page, setPage] = useState<Page>('dashboard')

  const handleSignOut = () => {
    localStorage.removeItem('snaphook_admin_key')
    setAuthed(false)
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  return page === 'dashboard'
    ? <Dashboard activePage={page} onNavigate={setPage} onSignOut={handleSignOut} />
    : <MapPage   activePage={page} onNavigate={setPage} onSignOut={handleSignOut} />
}
