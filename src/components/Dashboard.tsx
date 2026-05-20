import { useState, useEffect, useCallback } from 'react'
import { fetchStats, fetchChart } from '../api'
import type { StatsResponse, ChartPoint } from '../types'
import type { Page } from '../App'
import StatCard from './StatCard'
import SightingsChart from './SightingsChart'
import ThreatBreakdown from './ThreatBreakdown'
import RecentSightingsTable from './RecentSightingsTable'
import NavTabs from './NavTabs'

interface Props {
  activePage: Page
  onNavigate: (p: Page) => void
  onSignOut: () => void
}

const PHT_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export default function Dashboard({ activePage, onNavigate, onSignOut }: Props) {
  const [stats,       setStats]       = useState<StatsResponse | null>(null)
  const [chart,       setChart]       = useState<ChartPoint[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetchStats(), fetchChart()])
      setStats(s)
      setChart(c)
      setLastUpdated(new Date())
      setError('')
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 401) {
        onSignOut()
        return
      }
      setError('Failed to load data. Retrying…')
    } finally {
      setLoading(false)
    }
  }, [onSignOut])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="min-h-screen bg-navy text-white">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-white/5 px-6 py-4">
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
          <div className="flex items-center gap-6">
            {lastUpdated && (
              <span className="text-muted text-xs hidden sm:block">
                Updated {PHT_TIME.format(lastUpdated)} PHT
              </span>
            )}
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

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Error banner */}
        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        {loading && !stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-5 border border-white/5 animate-pulse h-24" />
            ))}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Sightings"
              value={stats.sightings.total}
              sub="All time"
            />
            <StatCard
              label="Last 7 Days"
              value={stats.sightings.last7days}
              sub="Past week"
              accent="#FFB300"
            />
            <StatCard
              label="Last 30 Days"
              value={stats.sightings.last30days}
              sub="Past month"
              accent="#FFB300"
            />
            <StatCard
              label="Active Hotzones"
              value={stats.hotzones.active}
              sub="≥ 3 reports"
              accent="#FF3B30"
            />
          </div>
        )}

        {/* ── Charts row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sightings per day */}
          <div className="lg:col-span-2 bg-card rounded-2xl p-6 border border-white/5">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Sightings per Day — Last 30 Days</h2>
            {chart.length > 0
              ? <SightingsChart data={chart} />
              : <div className="h-[220px] flex items-center justify-center text-muted text-sm">Loading…</div>
            }
          </div>

          {/* Threat type breakdown */}
          <div className="bg-card rounded-2xl p-6 border border-white/5">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Threat Type Breakdown</h2>
            {stats ? (
              <>
                <ThreatBreakdown data={stats.threatTypes} />
                {/* Legend */}
                <div className="mt-3 space-y-1.5">
                  {[
                    { label: 'No Identity',   color: '#FF3B30', count: stats.threatTypes.NO_IDENTITY   },
                    { label: 'Unknown Tower', color: '#FFB300', count: stats.threatTypes.UNKNOWN_TOWER  },
                    { label: 'Strong Signal', color: '#00D4AA', count: stats.threatTypes.STRONG_SIGNAL  },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-muted">{t.label}</span>
                      </div>
                      <span className="font-mono" style={{ color: t.color }}>{t.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted text-sm">Loading…</div>
            )}
          </div>
        </div>

        {/* ── Recent sightings table ───────────────────────────────────────── */}
        <div className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Recent Sightings</h2>
          <RecentSightingsTable sightings={stats?.recentSightings ?? []} />
        </div>

      </main>
    </div>
  )
}
