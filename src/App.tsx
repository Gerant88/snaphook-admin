import { useState } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import MapPage from './pages/MapPage'
import ConfigPage from './pages/ConfigPage'

export type Page = 'dashboard' | 'map' | 'config'

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

  const navProps = { activePage: page, onNavigate: setPage, onSignOut: handleSignOut }

  switch (page) {
    case 'map':    return <MapPage    {...navProps} />
    case 'config': return <ConfigPage {...navProps} />
    default:       return <Dashboard  {...navProps} />
  }
}
