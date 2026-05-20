import { useState, useEffect, useCallback } from 'react'
import { fetchConfig, updateConfig } from '../api'
import type { ConfigEntry } from '../types'
import type { Page } from '../App'
import NavTabs from '../components/NavTabs'

interface Props {
  activePage: Page
  onNavigate: (p: Page) => void
  onSignOut:  () => void
}

// ── Group definitions ─────────────────────────────────────────────────────────

const GROUPS = [
  {
    title: 'FSPL Distance Estimation',
    keys:  ['gsm_tx_power_dbm', 'lte_tx_power_dbm', 'umts_tx_power_dbm', 'nr_tx_power_dbm',
            'max_estimated_distance_m', 'min_estimated_distance_m'],
  },
  {
    title: 'Detection Thresholds',
    keys:  ['signal_strength_delta_dbm', 'min_opencellid_samples',
            'no_identity_score', 'unknown_tower_score', 'strong_signal_score'],
  },
  {
    title: 'Hotzone Settings',
    keys:  ['hotzone_min_reports', 'hotzone_cluster_radius_m'],
  },
  {
    title: 'Data Retention',
    keys:  ['history_retention_days', 'sighting_dedup_window_ms'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const isDedup = (key: string) => key === 'sighting_dedup_window_ms'
const isScore = (key: string) => key.includes('score')

/** Parse the raw DB string value into a slider-friendly number. */
function parseEntry(e: ConfigEntry): number {
  const raw = parseFloat(e.value)
  return isDedup(e.key) ? raw / 60_000 : raw  // ms → minutes for dedup
}

function sliderMin(e: ConfigEntry): number {
  if (isDedup(e.key)) return (e.minValue ?? 60_000) / 60_000
  return e.minValue ?? 0
}

function sliderMax(e: ConfigEntry): number {
  if (isDedup(e.key)) return (e.maxValue ?? 3_600_000) / 60_000
  return e.maxValue ?? 100
}

function sliderStep(e: ConfigEntry): number {
  if (isScore(e.key)) return 0.05
  if (e.type === 'int' || isDedup(e.key)) return 1
  return 1
}

function formatDisplay(e: ConfigEntry, val: number): string {
  if (isDedup(e.key))     return `${val.toFixed(0)} min`
  if (isScore(e.key))     return val.toFixed(2)
  if (e.type === 'float') return val % 1 === 0 ? String(val) : val.toFixed(1)
  return String(Math.round(val))
}

/** Convert slider value back to the string stored in the DB. */
function toApiString(e: ConfigEntry, val: number): string {
  if (isDedup(e.key)) return String(Math.round(val * 60_000))
  if (e.type === 'int') return String(Math.round(val))
  return isScore(e.key) ? val.toFixed(2) : String(val)
}

// ── ConfigRow ─────────────────────────────────────────────────────────────────

type RowStatus = 'idle' | 'saving' | 'saved' | 'error'

function ConfigRow({ entry }: { entry: ConfigEntry }) {
  const [localVal, setLocalVal] = useState(() => parseEntry(entry))
  const [status,   setStatus]   = useState<RowStatus>('idle')
  const [errMsg,   setErrMsg]   = useState('')

  const min  = sliderMin(entry)
  const max  = sliderMax(entry)
  const step = sliderStep(entry)

  const handleSave = async () => {
    setStatus('saving')
    setErrMsg('')
    try {
      await updateConfig(entry.key, toApiString(entry, localVal))
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2_000)
    } catch (err) {
      setErrMsg((err as Error).message)
      setStatus('error')
    }
  }

  const borderColor = status === 'saved'  ? 'border-teal/30'
                    : status === 'error'  ? 'border-danger/30'
                    : 'border-white/5'

  return (
    <div className={`rounded-xl border p-4 transition-colors ${borderColor} bg-navy/50`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{entry.label}</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">{entry.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="font-mono text-lg font-bold transition-colors"
            style={{ color: status === 'saved' ? '#00D4AA' : '#00D4AA' }}
          >
            {formatDisplay(entry, localVal)}
          </span>
          <button
            onClick={handleSave}
            disabled={status === 'saving'}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-40
                       border border-teal/40 text-teal hover:bg-teal/10"
          >
            {status === 'saving' ? '…'
            : status === 'saved' ? '✓ Saved'
            : 'Save'}
          </button>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localVal}
        onChange={(e) => { setLocalVal(parseFloat(e.target.value)); setStatus('idle') }}
        className="w-full accent-teal cursor-pointer h-1.5"
      />

      <div className="flex justify-between text-[10px] text-muted/60 mt-1">
        <span>{formatDisplay(entry, min)}</span>
        <span>{formatDisplay(entry, max)}</span>
      </div>

      {status === 'error' && (
        <p className="text-danger text-xs mt-2">{errMsg}</p>
      )}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 4 }).map((_, gi) => (
        <div key={gi} className="bg-card rounded-2xl p-6 border border-white/5 space-y-4">
          <div className="h-4 w-40 bg-white/5 rounded animate-pulse" />
          {Array.from({ length: 3 }).map((_, ri) => (
            <div key={ri} className="h-20 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConfigPage({ activePage, onNavigate, onSignOut }: Props) {
  const [entries,  setEntries]  = useState<ConfigEntry[]>([])
  const [loading,  setLoading]  = useState(true)
  const [fetchErr, setFetchErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setFetchErr('')
    try {
      setEntries(await fetchConfig())
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 401) { onSignOut(); return }
      setFetchErr('Failed to load configuration.')
    } finally {
      setLoading(false)
    }
  }, [onSignOut])

  useEffect(() => { load() }, [load])

  // Build a lookup map for O(1) access
  const byKey = new Map(entries.map((e) => [e.key, e]))

  return (
    <div className="min-h-screen bg-navy text-white">

      {/* Top bar */}
      <header className="bg-card border-b border-white/5 px-6 py-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {fetchErr && (
          <div className="bg-danger/10 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm">
            {fetchErr}
          </div>
        )}

        {loading ? <Skeleton /> : (
          GROUPS.map((group) => {
            const groupEntries = group.keys.map((k) => byKey.get(k)).filter((e): e is ConfigEntry => !!e)
            if (groupEntries.length === 0) return null

            return (
              <div key={group.title} className="bg-card rounded-2xl p-6 border border-white/5">
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
                  {group.title}
                </h2>
                <div className="space-y-3">
                  {groupEntries.map((entry) => (
                    <ConfigRow key={entry.key} entry={entry} />
                  ))}
                </div>
              </div>
            )
          })
        )}

      </main>
    </div>
  )
}
