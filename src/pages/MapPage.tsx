import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { fetchHotzones, fetchStats, triggerTriangulation, generateTestSightings } from '../api'
import type { Hotzone, RecentSighting } from '../types'
import type { Page } from '../App'
import NavTabs from '../components/NavTabs'

interface Props {
  activePage:    Page
  onNavigate:    (p: Page) => void
  onSignOut:     () => void
  onOpenProfile: (fpId: string) => void
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

// ── Triangulation pin icon (crosshair SVG) ────────────────────────────────────

function makeCrosshairIcon(confidenceM: number): L.DivIcon {
  // Smaller confidence = more prominent marker (inverse relationship)
  const size = confidenceM < 100 ? 32 : confidenceM < 250 ? 26 : 20
  const half = size / 2
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <style>
        .pulse { animation: pulse 1.5s ease-in-out infinite; transform-origin: ${half}px ${half}px; }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(1.15); } }
      </style>
      <g class="pulse">
        <circle cx="${half}" cy="${half}" r="${half - 2}" fill="none" stroke="#FF3B30" stroke-width="2"/>
        <line x1="${half}" y1="2" x2="${half}" y2="${half - 5}" stroke="#FF3B30" stroke-width="2"/>
        <line x1="${half}" y1="${half + 5}" x2="${half}" y2="${size - 2}" stroke="#FF3B30" stroke-width="2"/>
        <line x1="2" y1="${half}" x2="${half - 5}" y2="${half}" stroke="#FF3B30" stroke-width="2"/>
        <line x1="${half + 5}" y1="${half}" x2="${size - 2}" y2="${half}" stroke="#FF3B30" stroke-width="2"/>
        <circle cx="${half}" cy="${half}" r="3" fill="#FF3B30"/>
      </g>
    </svg>`
  return L.divIcon({
    html:      svg,
    iconSize:  [size, size],
    iconAnchor:[half, half],
    className: '',
  })
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

// ── MapRefresher — updates map size after panel toggle ────────────────────────

function MapRefresher({ trigger }: { trigger: number }) {
  const map = useMap()
  useEffect(() => { setTimeout(() => map.invalidateSize(), 50) }, [trigger, map])
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapPage({ activePage, onNavigate, onSignOut, onOpenProfile }: Props) {
  const [hotzones,         setHotzones]         = useState<Hotzone[]>([])
  const [sightings,        setSightings]        = useState<RecentSighting[]>([])
  const [showHotzones,     setShowHotzones]     = useState(true)
  const [showSightings,    setShowSightings]    = useState(true)
  const [showTriangulation,setShowTriangulation]= useState(true)
  const [loading,          setLoading]          = useState(false)
  const [lastUpdated,      setLastUpdated]      = useState<Date | null>(null)
  const [error,            setError]            = useState('')
  const [showTestPanel,    setShowTestPanel]    = useState(false)
  const [mapRefreshTick,   setMapRefreshTick]   = useState(0)

  // Test data generator state
  const [testLat,  setTestLat]  = useState('14.5547')
  const [testLng,  setTestLng]  = useState('121.0244')
  const [testFp,   setTestFp]   = useState('deadbeef01234567')
  const [testCount,setTestCount]= useState('5')
  const [testRadius,setTestRadius]= useState('300')
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg,  setTestMsg]  = useState('')

  const isDevMode = import.meta.env.DEV

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

  async function handleGenerateTestData() {
    setTestBusy(true)
    setTestMsg('')
    try {
      const result = await generateTestSightings({
        lat:           parseFloat(testLat),
        lng:           parseFloat(testLng),
        fingerprintId: testFp,
        count:         parseInt(testCount, 10),
        radiusM:       parseInt(testRadius, 10),
      })
      setTestMsg(`Generated ${result.generated} sightings`)
      await load()
    } catch (e) {
      setTestMsg((e as Error).message)
    } finally {
      setTestBusy(false)
    }
  }

  async function handleTriangulate(fingerprintId: string) {
    try {
      await triggerTriangulation(fingerprintId)
      await load()
    } catch {
      setError(`Triangulation failed for ${fingerprintId}`)
    }
  }

  const triangulatedHotzones = hotzones.filter(
    (h) => h.triLat != null && h.triLng != null,
  )

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
          <MapRefresher trigger={mapRefreshTick} />

          {/* CartoDB dark tiles */}
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
                    {hz.fingerprintId && (
                      <button
                        onClick={() => onOpenProfile(hz.fingerprintId!)}
                        style={{
                          display: 'block', background: 'none', border: 'none', padding: 0,
                          color: hz.fingerprintId.startsWith('noid_') ? '#666' : '#00D4AA',
                          fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
                          fontStyle: hz.fingerprintId.startsWith('noid_') ? 'italic' : 'normal',
                          textAlign: 'left',
                        }}
                        title={hz.fingerprintId.startsWith('noid_')
                          ? 'Location-based fingerprint (~111m). Click to open profile.'
                          : 'Click to open Threat Profile'}
                      >
                        FP: {hz.fingerprintId}
                      </button>
                    )}
                    {hz.fingerprintId && hz.triLat == null && (
                      <button
                        onClick={() => handleTriangulate(hz.fingerprintId!)}
                        style={{
                          marginTop: 6, fontSize: 11, cursor: 'pointer',
                          background: '#FF3B3022', border: '1px solid #FF3B3066',
                          color: '#FF3B30', borderRadius: 4, padding: '2px 6px',
                        }}
                      >
                        Triangulate
                      </button>
                    )}
                  </div>
                </Popup>
              </Circle>
            )
          })}

          {/* Triangulation layers */}
          {showTriangulation && triangulatedHotzones.map((hz) => {
            const icon = makeCrosshairIcon(hz.triConfidenceM ?? 300)
            return (
              <React.Fragment key={`tri-${hz.id}`}>
                {/* Confidence circle — dashed red, 10% fill */}
                <Circle
                  center={[hz.triLat!, hz.triLng!]}
                  radius={hz.triConfidenceM ?? 300}
                  pathOptions={{
                    color:       '#FF3B30',
                    fillColor:   '#FF3B30',
                    fillOpacity: 0.10,
                    weight:      2,
                    dashArray:   '6 4',
                  }}
                />
                {/* Crosshair pin */}
                <Marker
                  position={[hz.triLat!, hz.triLng!]}
                  icon={icon}
                >
                  <Popup>
                    <div>
                      <div style={{ color: '#FF3B30', fontWeight: 600, marginBottom: 4 }}>
                        📍 Estimated Tower Location
                      </div>
                      <div style={{ color: '#888', fontSize: 11 }}>
                        Confidence: ±{Math.round(hz.triConfidenceM ?? 0)}m
                      </div>
                      <div style={{ color: '#888', fontSize: 11 }}>
                        Based on {hz.triReporterCount} reports
                      </div>
                      {hz.isMobile && (
                        <div style={{ color: '#FFB300', fontSize: 11, marginTop: 4 }}>
                          ⚠ Possibly mobile
                        </div>
                      )}
                      {hz.lastTriangulated && (
                        <div style={{ color: '#888', fontSize: 11 }}>
                          {PHT.format(new Date(hz.lastTriangulated))} PHT
                        </div>
                      )}
                      {hz.fingerprintId && (
                        <button
                          onClick={() => onOpenProfile(hz.fingerprintId!)}
                          style={{
                            display: 'block', background: 'none', border: 'none', padding: 0,
                            color: hz.fingerprintId.startsWith('noid_') ? '#666' : '#00D4AA',
                            fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
                            fontStyle: hz.fingerprintId.startsWith('noid_') ? 'italic' : 'normal',
                            textAlign: 'left',
                          }}
                          title="Click to open Threat Profile"
                        >
                          FP: {hz.fingerprintId}
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
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
                      <button
                        onClick={() => onOpenProfile(s.fingerprintId!)}
                        style={{
                          display: 'block', background: 'none', border: 'none', padding: 0,
                          color: s.fingerprintId.startsWith('noid_') ? '#666' : '#00D4AA',
                          fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
                          fontStyle: s.fingerprintId.startsWith('noid_') ? 'italic' : 'normal',
                          textAlign: 'left',
                        }}
                        title={s.fingerprintId.startsWith('noid_')
                          ? 'Location-based fingerprint (~111m). Click to open profile.'
                          : 'Click to open Threat Profile'}
                      >
                        FP: {s.fingerprintId}
                      </button>
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
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 min-w-[180px]">
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
            <ToggleButton
              label="Triangulation"
              active={showTriangulation}
              activeColor="#FF3B30"
              count={triangulatedHotzones.length}
              onClick={() => setShowTriangulation((v) => !v)}
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

            {/* Test data generator toggle (dev mode only) */}
            {isDevMode && (
              <button
                onClick={() => {
                  setShowTestPanel((v) => !v)
                  setMapRefreshTick((n) => n + 1)
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                           rounded-lg text-xs font-medium border border-white/10
                           text-amber-400 hover:text-amber-300 hover:border-amber-400/30
                           transition-colors"
              >
                🧪 {showTestPanel ? 'Hide' : 'Test Data'}
              </button>
            )}
          </div>

          {/* ── Test data generator panel ──────────────────────────────── */}
          {isDevMode && showTestPanel && (
            <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-amber-400/20 p-3 shadow-xl space-y-2">
              <p className="text-amber-400 text-[10px] uppercase tracking-wider font-semibold">
                Generate Test Data
              </p>
              <TestInput label="Lat"    value={testLat}    onChange={setTestLat} />
              <TestInput label="Lng"    value={testLng}    onChange={setTestLng} />
              <TestInput label="Fingerprint ID" value={testFp}    onChange={setTestFp} />
              <TestInput label="Count"  value={testCount}  onChange={setTestCount} />
              <TestInput label="Radius (m)" value={testRadius} onChange={setTestRadius} />
              <button
                onClick={handleGenerateTestData}
                disabled={testBusy}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5
                           rounded-lg text-xs font-medium border border-amber-400/40
                           bg-amber-400/10 text-amber-300 hover:bg-amber-400/20
                           disabled:opacity-40 transition-colors"
              >
                {testBusy ? '⏳ Generating…' : '⚡ Generate'}
              </button>
              {testMsg && (
                <p className="text-[10px] text-center"
                   style={{ color: testMsg.startsWith('Generated') ? '#00D4AA' : '#FF3B30' }}>
                  {testMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Legend (bottom left) ─────────────────────────────────────── */}
        <div className="absolute bottom-8 left-4 z-[1000]
                        bg-card/95 backdrop-blur-sm rounded-xl border border-white/10 p-3 shadow-xl">
          <p className="text-muted text-[10px] uppercase tracking-wider mb-2">Legend</p>

          <div className="space-y-1 mb-3">
            <p className="text-[10px] text-white/50 uppercase tracking-wide">Hotzones</p>
            <LegendRow color="#FFB300" label="3–9 reports"    shape="circle" />
            <LegendRow color="#FF3B30" label="10–24 reports"  shape="circle" />
            <LegendRow color="#CC0000" label="25+ reports"    shape="circle" />
          </div>

          <div className="space-y-1 mb-3">
            <p className="text-[10px] text-white/50 uppercase tracking-wide">Triangulation</p>
            <LegendRow color="#FF3B30" label="🎯 Estimated tower" shape="crosshair" />
            <LegendRow color="#FF3B30" label="Confidence area" shape="dashed" />
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

// Need React import for Fragment
import React from 'react'

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
        borderColor:     active ? `${activeColor}40` : 'rgba(255,255,255,0.08)',
        backgroundColor: active ? `${activeColor}12` : 'transparent',
        color:           active ? activeColor : '#888',
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
  color: string; label: string; shape: 'circle' | 'dot' | 'crosshair' | 'dashed'
}) {
  let indicator: React.ReactNode
  if (shape === 'crosshair') {
    indicator = (
      <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0">
        <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5"/>
        <line x1="7" y1="1" x2="7" y2="4" stroke={color} strokeWidth="1.5"/>
        <line x1="7" y1="10" x2="7" y2="13" stroke={color} strokeWidth="1.5"/>
        <line x1="1" y1="7" x2="4" y2="7" stroke={color} strokeWidth="1.5"/>
        <line x1="10" y1="7" x2="13" y2="7" stroke={color} strokeWidth="1.5"/>
        <circle cx="7" cy="7" r="2" fill={color}/>
      </svg>
    )
  } else if (shape === 'dashed') {
    indicator = (
      <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0">
        <circle cx="7" cy="7" r="6" fill={`${color}1A`} stroke={color}
                strokeWidth="1.5" strokeDasharray="3 2"/>
      </svg>
    )
  } else {
    indicator = (
      <div
        className="flex-shrink-0"
        style={{
          width:           shape === 'circle' ? 14 : 10,
          height:          shape === 'circle' ? 14 : 10,
          borderRadius:    '50%',
          border:          shape === 'circle' ? `2px solid ${color}` : 'none',
          backgroundColor: shape === 'dot' ? color : `${color}33`,
        }}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      {indicator}
      {label}
    </div>
  )
}

function TestInput({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted w-20 flex-shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-0.5
                   text-[11px] text-white font-mono focus:outline-none focus:border-amber-400/40"
      />
    </div>
  )
}
