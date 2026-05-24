import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, Popup } from 'react-leaflet'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts'
import {
  fetchFingerprintProfile,
  fetchFingerprintActivity,
  fetchFingerprintRelated,
  updateFingerprintNotes,
  fetchCampaigns,
  createCampaign,
} from '../api'
import type { ThreatProfile, ActivityData, RelatedFingerprint, Campaign } from '../types'
import type { Page } from '../App'
import NavTabs from '../components/NavTabs'

interface Props {
  fingerprintId: string
  backPage:      Exclude<Page, 'profile'>
  activePage:    Page
  onNavigate:    (p: Page) => void
  onSignOut:     () => void
  onOpenProfile: (fpId: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHT = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short', day: 'numeric', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12a' : i < 12 ? `${i}a` : i === 12 ? '12p' : `${i - 12}p`)

function heatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'rgba(255,255,255,0.05)'
  const t = Math.min(count / max, 1)
  if (t < 0.25) return `rgba(0,212,170,${0.15 + t * 0.6})`
  if (t < 0.5)  return `rgba(0,212,170,${0.3 + t * 0.6})`
  if (t < 0.75) return `rgba(0,184,148,${0.5 + t * 0.4})`
  return `rgba(0,212,170,${0.7 + t * 0.3})`
}

const statusColor = (s: string) =>
  s === 'ACTIVE' ? '#00D4AA' : s === 'DORMANT' ? '#FFB300' : '#888'

const classColor = (c: string) =>
  c === 'NO_IDENTITY' ? '#FF3B30' : c === 'STRONG_SIGNAL' ? '#FFB300' : '#888'

const scoreColor = (v: number) => v >= 0.8 ? '#FF3B30' : v >= 0.6 ? '#FFB300' : '#00D4AA'

// ── Component ─────────────────────────────────────────────────────────────────

export default function ThreatProfilePage({
  fingerprintId, backPage, activePage, onNavigate, onSignOut, onOpenProfile,
}: Props) {
  const [profile,  setProfile]  = useState<ThreatProfile | null>(null)
  const [activity, setActivity] = useState<ActivityData | null>(null)
  const [related,  setRelated]  = useState<RelatedFingerprint[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Notes
  const [notes,       setNotes]       = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved,  setNotesSaved]  = useState(false)

  // Campaign form
  const [showCampaignForm,  setShowCampaignForm]  = useState(false)
  const [campaignName,      setCampaignName]      = useState('')
  const [campaignNotes,     setCampaignNotes]     = useState('')
  const [campaignFps,       setCampaignFps]       = useState<string[]>([fingerprintId])
  const [campaignSaving,    setCampaignSaving]    = useState(false)
  const [campaignFpInput,   setCampaignFpInput]   = useState('')
  const notesSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetchFingerprintProfile(fingerprintId),
      fetchFingerprintActivity(fingerprintId),
      fetchFingerprintRelated(fingerprintId),
      fetchCampaigns(),
    ]).then(([p, a, r, c]) => {
      setProfile(p)
      setNotes(p.notes ?? '')
      setActivity(a)
      setRelated(r.related)
      setCampaigns(c)
      setError('')
    }).catch((e: Error & { status?: number }) => {
      if (e.status === 401) { onSignOut(); return }
      setError('Failed to load profile.')
    }).finally(() => setLoading(false))
  }, [fingerprintId, onSignOut])

  async function handleSaveNotes() {
    setNotesSaving(true)
    try {
      await updateFingerprintNotes(fingerprintId, notes)
      setNotesSaved(true)
      if (notesSavedTimer.current) clearTimeout(notesSavedTimer.current)
      notesSavedTimer.current = setTimeout(() => setNotesSaved(false), 2500)
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleCreateCampaign() {
    if (!campaignName.trim()) return
    setCampaignSaving(true)
    try {
      const created = await createCampaign({ name: campaignName, notes: campaignNotes || undefined, fingerprintIds: campaignFps })
      setCampaigns((prev) => [created, ...prev])
      if (profile) setProfile({ ...profile, campaigns: [...profile.campaigns, { id: created.id, name: created.name }] })
      setShowCampaignForm(false)
      setCampaignName('')
      setCampaignNotes('')
      setCampaignFps([fingerprintId])
    } finally {
      setCampaignSaving(false)
    }
  }

  const thisFpCampaigns = campaigns.filter((c) => c.fingerprintIds.includes(fingerprintId))

  // ── Activity heatmap helpers
  const gridMap = new Map<string, number>()
  let gridMax = 0
  activity?.grid.forEach((g) => {
    gridMap.set(`${g.dow}-${g.hour}`, g.count)
    if (g.count > gridMax) gridMax = g.count
  })

  // ── Map center
  const mapCenter: [number, number] = profile?.sightingPoints.length
    ? [
        profile.sightingPoints.reduce((a, b) => a + b.lat, 0) / profile.sightingPoints.length,
        profile.sightingPoints.reduce((a, b) => a + b.lng, 0) / profile.sightingPoints.length,
      ]
    : [14.5881, 121.0606]

  const isNoid = fingerprintId.startsWith('noid_')

  return (
    <div className="min-h-screen bg-navy text-white">
      <style>{`@media print { .no-print { display:none!important } .print-content { all:revert } }`}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-white/5 px-6 py-4 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              <span className="font-bold text-lg tracking-tight">
                SnapHook <span className="text-teal">Admin</span>
              </span>
            </div>
            <NavTabs activePage={activePage} onNavigate={onNavigate} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate(backPage)}
              className="text-xs text-muted hover:text-white transition-colors border border-white/10
                         hover:border-white/20 rounded-lg px-3 py-1.5"
            >
              ← Back
            </button>
            <button
              onClick={() => window.print()}
              className="text-xs text-teal/80 hover:text-teal transition-colors border border-teal/20
                         hover:border-teal/40 rounded-lg px-3 py-1.5"
            >
              Export / Print
            </button>
            <button
              onClick={onSignOut}
              className="text-xs text-muted hover:text-white transition-colors border border-white/10
                         hover:border-white/20 rounded-lg px-3 py-1.5"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 print-content">

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-24 text-muted text-sm">
            Loading profile…
          </div>
        )}

        {!loading && profile && (
          <>
            {/* ── 1. Identity header ──────────────────────────────────────── */}
            <div className="bg-card rounded-2xl p-6 border border-white/5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span
                      className="font-mono text-2xl font-bold tracking-tight"
                      style={{ color: isNoid ? '#888' : '#00D4AA', fontStyle: isNoid ? 'italic' : 'normal' }}
                    >
                      {fingerprintId}
                    </span>
                    {isNoid && (
                      <span className="text-xs text-muted/60 border border-white/10 rounded px-2 py-0.5">
                        Location-based
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted font-mono">
                    {profile.cellId != null && <span>Cell&nbsp;{profile.cellId}</span>}
                    {profile.lac    != null && <span>LAC&nbsp;{profile.lac}</span>}
                    {profile.mcc    != null && <span>MCC&nbsp;{profile.mcc}</span>}
                    {profile.mnc    != null && <span>MNC&nbsp;{profile.mnc}</span>}
                    <span>Radio&nbsp;{profile.radioType}</span>
                    {profile.cellId == null && <span className="text-muted/50">No cell identity</span>}
                  </div>
                </div>

                <div className="flex gap-2">
                  <span
                    className="text-xs font-semibold rounded-full px-3 py-1 border"
                    style={{
                      color:        statusColor(profile.status),
                      borderColor:  statusColor(profile.status) + '44',
                      background:   statusColor(profile.status) + '15',
                    }}
                  >
                    {profile.status}
                  </span>
                  <span
                    className="text-xs font-semibold rounded-full px-3 py-1 border"
                    style={{
                      color:       classColor(profile.threatClassification),
                      borderColor: classColor(profile.threatClassification) + '44',
                      background:  classColor(profile.threatClassification) + '15',
                    }}
                  >
                    {profile.threatClassification.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-white/5">
                <Stat label="Total Sightings"  value={profile.totalSightings.toLocaleString()} />
                <Stat label="Unique Reporters" value={profile.uniqueReporters.toLocaleString()} />
                <Stat label="First Seen" value={PHT.format(new Date(profile.firstSeen))} small />
                <Stat label="Last Seen"  value={PHT.format(new Date(profile.lastSeen))}  small />
              </div>
            </div>

            {/* ── 2. Map + Signal profile row ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Location map */}
              <div className="lg:col-span-2 bg-card rounded-2xl border border-white/5 overflow-hidden" style={{ height: 340 }}>
                <MapContainer
                  center={mapCenter}
                  zoom={15}
                  style={{ width: '100%', height: '100%' }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; CartoDB'
                  />

                  {/* Movement trail for mobile towers */}
                  {profile.hotzone?.isMobile && profile.sightingPoints.length > 1 && (
                    <Polyline
                      positions={profile.sightingPoints.map((p) => [p.lat, p.lng])}
                      pathOptions={{ color: '#FFB300', weight: 2, dashArray: '4 4', opacity: 0.7 }}
                    />
                  )}

                  {/* Sighting dots */}
                  {profile.sightingPoints.map((p, i) => (
                    <CircleMarker
                      key={i}
                      center={[p.lat, p.lng]}
                      radius={5}
                      pathOptions={{
                        color:       scoreColor(p.threatScore),
                        fillColor:   scoreColor(p.threatScore),
                        fillOpacity: 0.75,
                        weight:      1.5,
                      }}
                    >
                      <Popup>
                        <div style={{ fontSize: 11, color: '#ccc' }}>
                          <div style={{ color: scoreColor(p.threatScore), fontWeight: 600 }}>
                            Score: {(p.threatScore * 100).toFixed(0)}%
                          </div>
                          <div>{PHT.format(new Date(p.timestamp))}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}

                  {/* Triangulated location */}
                  {profile.hotzone?.triLat != null && profile.hotzone?.triLng != null && (
                    <Circle
                      center={[profile.hotzone.triLat, profile.hotzone.triLng]}
                      radius={profile.hotzone.triConfidenceM ?? 200}
                      pathOptions={{ color: '#FF3B30', fillColor: '#FF3B30', fillOpacity: 0.12, weight: 2, dashArray: '6 4' }}
                    >
                      <Popup>
                        <div style={{ fontSize: 11, color: '#ccc' }}>
                          <div style={{ color: '#FF3B30', fontWeight: 600 }}>Estimated tower location</div>
                          <div>±{Math.round(profile.hotzone.triConfidenceM ?? 0)}m confidence</div>
                          {profile.hotzone.isMobile && <div style={{ color: '#FFB300' }}>⚠ Possibly mobile</div>}
                        </div>
                      </Popup>
                    </Circle>
                  )}
                </MapContainer>
              </div>

              {/* Signal profile */}
              <div className="bg-card rounded-2xl p-6 border border-white/5 space-y-4">
                <h3 className="text-sm font-semibold text-white/80">Signal Profile</h3>
                <div className="space-y-3">
                  <SignalRow label="Avg signal"  value={profile.avgSignalStrength != null ? `${profile.avgSignalStrength} dBm` : '—'} />
                  <SignalRow label="Min signal"  value={profile.minSignalStrength != null ? `${profile.minSignalStrength} dBm` : '—'} />
                  <SignalRow label="Max signal"  value={profile.maxSignalStrength != null ? `${profile.maxSignalStrength} dBm` : '—'} />
                  <div className="border-t border-white/5 pt-3" />
                  <SignalRow label="Avg distance" value={profile.avgDistanceM != null ? `~${profile.avgDistanceM}m` : '—'} accent="#00D4AA" />
                  <SignalRow label="Min distance" value={profile.minDistanceM != null ? `~${profile.minDistanceM}m` : '—'} />
                  <SignalRow label="Max distance" value={profile.maxDistanceM != null ? `~${profile.maxDistanceM}m` : '—'} />
                </div>
                {profile.hotzone?.isMobile && (
                  <div className="mt-2 rounded-lg bg-amber-400/10 border border-amber-400/20 px-3 py-2 text-xs text-amber-400">
                    ⚠ Movement detected — this tower may be mobile
                  </div>
                )}
                {profile.hotzone?.triReporterCount != null && (
                  <div className="text-xs text-muted mt-2">
                    Triangulated from {profile.hotzone.triReporterCount} reporters
                  </div>
                )}
              </div>
            </div>

            {/* ── 3. Time of operations ────────────────────────────────────── */}
            {activity && (
              <div className="bg-card rounded-2xl p-6 border border-white/5 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/80">Time of Operations</h3>
                  <span className="text-xs text-muted">
                    Peak: {DOW_LABELS[activity.peakDow]} · {HOUR_LABELS[activity.peakHour]} PHT
                  </span>
                </div>

                {/* Hour × day heatmap */}
                <div>
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: 600 }}>
                      {/* Hour axis */}
                      <div className="flex mb-1 pl-9">
                        {HOUR_LABELS.map((h, i) => (
                          <div key={i} style={{ width: 22, flexShrink: 0 }}
                            className="text-center text-muted text-[9px]">
                            {i % 3 === 0 ? h : ''}
                          </div>
                        ))}
                      </div>
                      {/* Grid rows */}
                      {DOW_LABELS.map((day, dow) => (
                        <div key={dow} className="flex items-center mb-0.5">
                          <span className="text-muted text-[10px] w-8 shrink-0 text-right pr-1">{day}</span>
                          {Array.from({ length: 24 }, (_, hour) => {
                            const count = gridMap.get(`${dow}-${hour}`) ?? 0
                            return (
                              <div
                                key={hour}
                                title={`${day} ${HOUR_LABELS[hour]}: ${count} detection${count !== 1 ? 's' : ''}`}
                                style={{
                                  width: 22, height: 16, flexShrink: 0,
                                  background: heatColor(count, gridMax),
                                  borderRadius: 2, margin: '0 1px',
                                }}
                              />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-muted">Less</span>
                    {[0, 0.2, 0.4, 0.7, 1].map((t, i) => (
                      <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: heatColor(t * gridMax, gridMax) }} />
                    ))}
                    <span className="text-[10px] text-muted">More</span>
                  </div>
                </div>

                {/* Daily timeline chart */}
                <div>
                  <p className="text-xs text-muted mb-2">Detections — last 30 days</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={activity.dailySeries} barSize={8} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                      <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#888' }}
                        itemStyle={{ color: '#00D4AA' }}
                        formatter={(v: number) => [v, 'detections']}
                      />
                      <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                        {activity.dailySeries.map((entry, i) => (
                          <Cell key={i} fill={entry.count > 0 ? '#00D4AA' : 'rgba(255,255,255,0.05)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── 4 & 5. Related fingerprints + Campaigns & Notes row ────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Related fingerprints */}
              <div className="bg-card rounded-2xl p-6 border border-white/5">
                <h3 className="text-sm font-semibold text-white/80 mb-4">Related Fingerprints</h3>
                {related.length === 0 ? (
                  <p className="text-muted text-xs">No related fingerprints detected within 500m.</p>
                ) : (
                  <div className="space-y-2">
                    {related.map((r) => (
                      <div key={r.fingerprintId}
                        className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3">
                        <div>
                          <button
                            onClick={() => onOpenProfile(r.fingerprintId)}
                            className="font-mono text-xs text-teal/80 hover:text-teal transition-colors hover:underline underline-offset-2"
                          >
                            {r.fingerprintId}
                          </button>
                          <div className="flex gap-3 mt-1 text-[10px] text-muted">
                            <span>~{r.distanceM}m away</span>
                            <span>{r.temporalOverlapPct}% time overlap</span>
                            <span>{r.sightingCount} sightings</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className="text-xs font-semibold" style={{ color: r.confidence >= 0.6 ? '#FF3B30' : r.confidence >= 0.35 ? '#FFB300' : '#888' }}>
                            {Math.round(r.confidence * 100)}%
                          </div>
                          <div className="text-[10px] text-muted">confidence</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Group as campaign shortcut */}
                {related.length > 0 && (
                  <button
                    onClick={() => {
                      setCampaignFps([fingerprintId, ...related.slice(0, 3).map((r) => r.fingerprintId)])
                      setShowCampaignForm(true)
                    }}
                    className="mt-4 w-full text-xs text-center py-2 rounded-lg border border-white/10 hover:border-teal/30 text-muted hover:text-teal transition-colors"
                  >
                    + Group as campaign
                  </button>
                )}
              </div>

              {/* Campaigns + Notes */}
              <div className="space-y-4">

                {/* Campaigns this fingerprint belongs to */}
                <div className="bg-card rounded-2xl p-6 border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white/80">Campaigns</h3>
                    <button
                      onClick={() => setShowCampaignForm(!showCampaignForm)}
                      className="text-xs text-teal/70 hover:text-teal transition-colors"
                    >
                      + New
                    </button>
                  </div>

                  {thisFpCampaigns.length === 0 && !showCampaignForm && (
                    <p className="text-muted text-xs">Not part of any campaign yet.</p>
                  )}

                  {thisFpCampaigns.map((c) => (
                    <div key={c.id} className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3 mb-2">
                      <div className="text-sm font-medium text-white/90">{c.name}</div>
                      {c.notes && <div className="text-xs text-muted mt-1">{c.notes}</div>}
                      <div className="text-[10px] text-muted/60 mt-1">{c.fingerprintIds.length} fingerprints</div>
                    </div>
                  ))}

                  {showCampaignForm && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-white/5">
                      <input
                        type="text"
                        placeholder="Campaign name (e.g. Makati CBD — Q1 2026)"
                        value={campaignName}
                        onChange={(e) => setCampaignName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white
                                   focus:outline-none focus:border-teal/40 placeholder-muted"
                      />
                      <textarea
                        placeholder="Notes (optional)"
                        value={campaignNotes}
                        onChange={(e) => setCampaignNotes(e.target.value)}
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white
                                   focus:outline-none focus:border-teal/40 placeholder-muted resize-none"
                      />
                      <div>
                        <p className="text-[10px] text-muted mb-1">Fingerprints in campaign:</p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {campaignFps.map((fp) => (
                            <span key={fp} className="inline-flex items-center gap-1 font-mono text-[10px] bg-teal/10 text-teal rounded px-2 py-0.5">
                              {fp.slice(0, 10)}
                              {fp !== fingerprintId && (
                                <button onClick={() => setCampaignFps((f) => f.filter((x) => x !== fp))} className="text-muted hover:text-white">×</button>
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add fingerprint ID…"
                            value={campaignFpInput}
                            onChange={(e) => setCampaignFpInput(e.target.value)}
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white
                                       focus:outline-none focus:border-teal/40 placeholder-muted font-mono"
                          />
                          <button
                            onClick={() => {
                              const v = campaignFpInput.trim()
                              if (v && !campaignFps.includes(v)) setCampaignFps((f) => [...f, v])
                              setCampaignFpInput('')
                            }}
                            className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-muted hover:text-white transition-colors"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateCampaign}
                          disabled={campaignSaving || !campaignName.trim()}
                          className="flex-1 py-2 rounded-lg bg-teal/15 border border-teal/30 text-teal text-xs font-medium
                                     hover:bg-teal/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {campaignSaving ? 'Saving…' : 'Create Campaign'}
                        </button>
                        <button
                          onClick={() => setShowCampaignForm(false)}
                          className="px-4 py-2 rounded-lg border border-white/10 text-muted text-xs hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Analyst notes */}
                <div className="bg-card rounded-2xl p-6 border border-white/5">
                  <h3 className="text-sm font-semibold text-white/80 mb-3">Analyst Notes</h3>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    placeholder="Add notes about this threat actor, observed behaviour, related incidents…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                               focus:outline-none focus:border-teal/40 placeholder-muted resize-none"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs transition-opacity ${notesSaved ? 'text-teal opacity-100' : 'opacity-0'}`}>
                      Saved
                    </span>
                    <button
                      onClick={handleSaveNotes}
                      disabled={notesSaving}
                      className="text-xs bg-teal/15 border border-teal/30 text-teal rounded-lg px-4 py-1.5
                                 hover:bg-teal/25 transition-colors disabled:opacity-40"
                    >
                      {notesSaving ? 'Saving…' : 'Save Notes'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`font-semibold text-white/90 ${small ? 'text-xs' : 'text-base'}`}>{value}</p>
    </div>
  )
}

function SignalRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-mono" style={{ color: accent ?? 'rgba(255,255,255,0.7)' }}>{value}</span>
    </div>
  )
}
