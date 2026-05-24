import { useState, useCallback } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import MapPage from './pages/MapPage'
import ConfigPage from './pages/ConfigPage'
import ThreatProfilePage from './pages/ThreatProfilePage'
import AlgorithmPage from './pages/AlgorithmPage'

export type Page = 'dashboard' | 'map' | 'config' | 'profile' | 'algorithm'

export default function App() {
  const [authed, setAuthed] = useState(
    () => !!localStorage.getItem('snaphook_admin_key'),
  )
  const [page,      setPage]      = useState<Page>('dashboard')
  const [profileFp, setProfileFp] = useState('')
  const [backPage,  setBackPage]  = useState<Exclude<Page, 'profile'>>('dashboard')

  const handleSignOut = () => {
    localStorage.removeItem('snaphook_admin_key')
    setAuthed(false)
  }

  const handleOpenProfile = useCallback((fpId: string) => {
    setProfileFp(fpId)
    setBackPage((page === 'profile' ? 'dashboard' : page) as Exclude<Page, 'profile'>)
    setPage('profile')
  }, [page])

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  const navProps = {
    activePage:     page,
    onNavigate:     setPage,
    onSignOut:      handleSignOut,
    onOpenProfile:  handleOpenProfile,
  }

  switch (page) {
    case 'profile':
      return <ThreatProfilePage {...navProps} fingerprintId={profileFp} backPage={backPage} />
    case 'map':
      return <MapPage       {...navProps} />
    case 'config':
      return <ConfigPage    activePage={page} onNavigate={setPage} onSignOut={handleSignOut} />
    case 'algorithm':
      return <AlgorithmPage activePage={page} onNavigate={setPage} onSignOut={handleSignOut} />
    default:
      return <Dashboard  {...navProps} />
  }
}
