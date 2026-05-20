import { useState, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Popup } from 'react-leaflet'
import { fetchHotzones, fetchStats } from '../api'
import type { Hotzone, RecentSighting } from '../types'
import type { Page } from '../App'
import NavTabs from '../components/NavTabs'

interface Props {
  activePage: Page
  onNavigate: (p: Page) => void
  onSignOut:  () => void
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const hotzoneStyle = (count: number) => {
  if (count >= 25) return { color: '#CC0000', fillOpacity: 0.60 }
  if (count >= 10) return { color: '#FF3B30', fillOpacity: 0.50 }
  return              { color: '#FFB300', fillOpacity: 0.40 }
}

const sightingColor = (score: number) => {
  if (score >= 0.8) return '#FF3B30'
  if (score >= 0.6) return '#FFB300'
  return '#00D4AA'
}

// ── PHT formatter ─────────────────────────────────────────────────────────────

const PHT = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

const PHT_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapPage({ activePage, onNavigate, onSignOut }: Props) {
  const [hotzones,       setHotzones]       = useState<Hotzone[]>([])
  const [sightings,      setSightings]      = useState<RecentSighting[]>([])
  const [showHotzones,   setShowHotzones]   = useState(true)
  const [showSightings,  setShowSightings]  = useState(true)
  const [loading,        setLoading]        = useState(false)
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null)
  const [error,          setError]          = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [hz, stats] = await Promise.all([fetchHotzones(), fetchStats()])
      setHotzones(hz)
      setSightings(stats.recentSightings.filter((s) => s.lat != null && s.lng != null))
      setLastUpdated(new Date())
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 401) { onSignOut(); return }
      setError('Failed to load map data')
    } finally {
      setLoading(false)
    }
  }, [onSignOut])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-white/5 px-6 py-4 flex-shrink-0">
        <div className="max-w-none flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              <span className="font-bold text-lg tracking-tight">
                SnapHook <span className="text-teal">Admin</span>
              </span>
            </div>
            <NavTabs activePage={activePage} onNavigate={onNavigate} />
          </div>
          <button
            onClick={onSignOut}
            className="text-xs text-muted hover:text-white transition-colors border border-white/10
                       hover:border-white/20 rounded-lg px-3 py-1.5"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Map + overlays ───────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Error banner */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001]
                          bg-danger/90 text-white text-xs rounded-lg px-4 py-2 shadow-lg">
            {error}
          </div>
        )}

        {/* Leaflet map */}
        <MapContainer
          center={[14.5547, 121.0244]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          {/* CartoDB dark tiles with OSM fallback */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
          />

          {/* Hotzone circles */}
          {showHotzones && hotzones.map((hz) => {
            const { color, fillOpacity } = hotzoneStyle(hz.reportCount)
            return (
              <Circle
                key={hz.id}
                center={[hz.centerLat, hz.centerLng]}
                radius={hz.radius}
                pathOptions={{ color, fillColor: color, fillOpacity, weight: 2 }}
              >
                <Popup>
                  <div>
                    <div style={{ color: color, fontWeight: 600, marginBottom: 4 }}>
                      {hz.reportCount} reports
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>
                      First seen: {PHT.format(new Date(hz.firstSeen))}
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>
                      Last seen: {PHT.format(new Date(hz.lastSeen))}
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>
                      Radius: {hz.radius}m
                    </div>
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* Individual sighting markers */}
          {showSightings && sightings.map((s) => {
            if (s.lat == null || s.lng == null) return null
            const color = sightingColor(s.threatScore)
            return (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.lng]}
                radius={6}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1.5 }}
              >
                <Popup>
                  <div>
                    <div style={{ color, fontWeight: 600, marginBottom: 4 }}>
                      Score: {(s.threatScore * 100).toFixed(0)}%
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>Radio: {s.radioType}</div>
                    {s.fingerprintId && (
                      <div style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>
                        FP: {s.fingerprintId}
                      </div>
                    )}
                    <div style={{ color: '#888', fontSize: 11 }}>
                      {PHT.format(new Date(s.timestamp))}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>

        {/* ── Controls overlay (top right) ─────────────────────────────── */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 min-w-[168px]">
          <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-white/10 p-3 shadow-xl space-y-2">

            {/* Last updated */}
            {lastUpdated && (
              <p className="text-muted text-[10px] text-center pb-1 border-b border-white/5">
                {PHT_TIME.format(lastUpdated)} PHT
              </p>
            )}

            {/* Toggle buttons */}
            <ToggleButton
              label="Hotzones"
              active={showHotzones}
              activeColor="#FF3B30"
              count={hotzones.length}
              onClick={() => setShowHotzones((v) => !v)}
            />
            <ToggleButton
              label="Sightings"
              active={showSightings}
              activeColor="#00D4AA"
              count={sightings.length}
              onClick={() => setShowSightings((v) => !v)}
            />

            {/* Refresh */}
            <button
              onClick={load}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                         rounded-lg text-xs font-medium border border-white/10
                         text-muted hover:text-white hover:border-white/20
                         disabled:opacity-40 transition-colors mt-1"
            >
              <span className={loading ? 'animate-spin' : ''}>↻</span>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Legend (bottom left) ─────────────────────────────────────── */}
        <div className="absolute bottom-8 left-4 z-[1000]
                        bg-card/95 backdrop-blur-sm rounded-xl border border-white/10 p-3 shadow-xl">
          <p className="text-muted text-[10px] uppercase tracking-wider mb-2">Legend</p>

          <div className="space-y-1 mb-3">
            <p className="text-[10px] text-white/50 uppercase tracking-wide">Hotzones</p>
            <LegendRow color="#FFB300" label="3–9 reports"  shape="circle" />
            <LegendRow color="#FF3B30" label="10–24 reports" shape="circle" />
            <LegendRow color="#CC0000" label="25+ reports"  shape="circle" />
          </div>

          <div className="space-y-1">
            <p className="text-[10px] text-white/50 uppercase tracking-wide">Sightings</p>
            <LegendRow color="#FF3B30" label="High ≥ 80%"  shape="dot" />
            <LegendRow color="#FFB300" label="Med ≥ 60%"   shape="dot" />
            <LegendRow color="#00D4AA" label="Low < 60%"   shape="dot" />
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleButton({
  label, active, activeColor, count, onClick,
}: {
  label: string; active: boolean; activeColor: string; count: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg
                 text-xs font-medium border transition-colors"
      style={{
        borderColor: active ? `${activeColor}40` : 'rgba(255,255,255,0.08)',
        backgroundColor: active ? `${activeColor}12` : 'transparent',
        color: active ? activeColor : '#888',
      }}
    >
      <span>{active ? 'Hide' : 'Show'} {label}</span>
      <span className="font-mono text-[10px] opacity-60">{count}</span>
    </button>
  )
}

function LegendRow({
  color, label, shape,
}: {
  color: string; label: string; shape: 'circle' | 'dot'
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <div
        className="flex-shrink-0"
        style={{
          width:  shape === 'circle' ? 14 : 10,
          height: shape === 'circle' ? 14 : 10,
          borderRadius: '50%',
          border: shape === 'circle' ? `2px solid ${color}` : 'none',
          backgroundColor: shape === 'dot' ? color : `${color}33`,
        }}
      />
      {label}
    </div>
  )
}
