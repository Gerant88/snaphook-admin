import { useState, useEffect, useCallback, useRef } from 'react'
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

// ── Detailed descriptions ─────────────────────────────────────────────────────

const DETAILED_DESCRIPTIONS: Record<string, string> = {
  gsm_tx_power_dbm: "How powerful we assume a rogue GSM tower is broadcasting. Real cell towers broadcast at 43 dBm, but IMSI catchers (fake towers) are portable devices that typically broadcast at 20–30 dBm. Lower this value if distance estimates seem too large. Example: at −87 dBm signal, 43 dBm TX power estimates 3.5 km away, but 25 dBm estimates only 350 m away.",

  lte_tx_power_dbm: "Same as GSM TX Power but for LTE (4G) towers. LTE rogue towers are less common but exist. Same logic applies — lower values give shorter, more realistic distance estimates for portable IMSI catchers.",

  umts_tx_power_dbm: "Same as GSM TX Power but for UMTS (3G) towers. Adjust if 3G rogue tower distances seem off.",

  nr_tx_power_dbm: "Same as GSM TX Power but for NR (5G) towers. 5G IMSI catchers are rare but emerging. Keep at default unless you have specific intelligence.",

  max_estimated_distance_m: "The furthest distance we'll estimate for a rogue tower. Even if signal math says 5 km, a portable IMSI catcher can't realistically operate that far. Default 500 m is conservative. Example: a backpack-sized IMSI catcher typically works within 100–300 m.",

  min_estimated_distance_m: "The closest distance we'll estimate. GPS and signal readings have measurement errors, so we never estimate closer than this. Default 10 m prevents nonsensical readings from indoors or near-field interference.",

  signal_strength_delta_dbm: "How much stronger than its neighbors a tower must be before we flag it as suspicious. IMSI catchers boost their signal to force phones to connect to them. Example: if nearby towers average −80 dBm and one reads −60 dBm (20 dBm stronger), it gets flagged. Lower this to catch more subtle boosts, but increases false positives.",

  min_opencellid_samples: "How many times a tower must appear in the OpenCellID crowd-sourced database before we trust it as 'known'. A tower with only 1 report might just be missing data, not actually rogue. Default 3 means at least 3 people must have recorded it. Higher = fewer false positives but may miss newer legitimate towers.",

  no_identity_score: "Threat score (0–1) assigned when a tower refuses to identify itself — no Cell ID, no network code, nothing. This is the strongest rogue indicator since legitimate towers always identify themselves. Default 0.9 = 90% threat confidence. Rarely needs adjustment.",

  unknown_tower_score: "Threat score (0–1) for towers not found in the OpenCellID database but otherwise identified. Could be a new legitimate tower or a rogue one. Default 0.8 = 80% confidence. Lower if you're seeing too many false positives in areas with poor OpenCellID coverage.",

  strong_signal_score: "Threat score (0–1) for towers broadcasting significantly stronger than their neighbors. On its own this is weaker evidence — some towers are just closer. Combined with other flags it's more meaningful. Default 0.7 = 70% confidence.",

  hotzone_min_reports: "Minimum number of unique sightings before an area is marked as a hotzone on the map. A single report could be a false positive or a one-time event. Default 3 means at least 3 separate detections must happen before an area is flagged publicly. Lower for faster hotzone detection, higher for more certainty.",

  hotzone_cluster_radius_m: "How close two sightings must be (in meters) to be grouped into the same hotzone. If two people detect a rogue tower 400 m apart, they're probably seeing the same tower — so they cluster. Default 500 m. Lower if you want more precise, smaller hotzones. Higher if reports seem too scattered.",

  history_retention_days: "How many days of threat history SnapHook keeps on each user's phone. Older records are automatically deleted to save storage. Default 5 days. Increase if you want longer historical tracking, decrease to save phone storage.",

  sighting_dedup_window_ms: "How long (in minutes) before the same tower can be reported to the backend again. Prevents the server from getting flooded with identical reports every 45 seconds. Default 5 minutes. Lower if you want more frequent updates, higher to reduce server load.",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isDedup = (key: string) => key === 'sighting_dedup_window_ms'
const isScore = (key: string) => key.includes('score')

function parseEntry(e: ConfigEntry): number {
  const raw = parseFloat(e.value)
  return isDedup(e.key) ? raw / 60_000 : raw
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

function toApiString(e: ConfigEntry, val: number): string {
  if (isDedup(e.key)) return String(Math.round(val * 60_000))
  if (e.type === 'int') return String(Math.round(val))
  return isScore(e.key) ? val.toFixed(2) : String(val)
}

// ── Info Modal ────────────────────────────────────────────────────────────────

interface InfoModalProps {
  entry: ConfigEntry
  currentDisplay: string
  onClose: () => void
}

function InfoModal({ entry, currentDisplay, onClose }: InfoModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const min = sliderMin(entry)
  const max = sliderMax(entry)
  const detail = DETAILED_DESCRIPTIONS[entry.key]

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-teal/30 shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#0F1629' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/5">
          <div>
            <p className="text-teal font-semibold text-base">{entry.label}</p>
            <p className="text-muted text-xs mt-0.5">{entry.key}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors ml-4 flex-shrink-0 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Current value */}
          <div className="flex items-center gap-3 bg-teal/5 rounded-xl px-4 py-3 border border-teal/10">
            <span className="text-muted text-xs">Current value</span>
            <span className="font-mono font-bold text-teal ml-auto">{currentDisplay}</span>
          </div>

          {/* Range */}
          <div className="flex gap-3">
            <div className="flex-1 bg-white/3 rounded-lg px-3 py-2 border border-white/5 text-center">
              <p className="text-[10px] text-muted uppercase tracking-wide">Min</p>
              <p className="font-mono text-sm text-white/70 mt-0.5">{formatDisplay(entry, min)}</p>
            </div>
            <div className="flex-1 bg-white/3 rounded-lg px-3 py-2 border border-white/5 text-center">
              <p className="text-[10px] text-muted uppercase tracking-wide">Max</p>
              <p className="font-mono text-sm text-white/70 mt-0.5">{formatDisplay(entry, max)}</p>
            </div>
          </div>

          {/* Short description */}
          <div>
            <p className="text-xs text-muted/70 uppercase tracking-wide mb-1.5">Summary</p>
            <p className="text-sm text-white/80 leading-relaxed">{entry.description}</p>
          </div>

          {/* Detailed description */}
          {detail && (
            <div>
              <p className="text-xs text-muted/70 uppercase tracking-wide mb-1.5">Details</p>
              <p className="text-sm text-white/70 leading-relaxed">{detail}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Info icon SVG ─────────────────────────────────────────────────────────────

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" />
      <rect x="6.5" y="5.5" width="1" height="5" rx="0.5" fill="currentColor" />
      <rect x="6.5" y="3.5" width="1" height="1" rx="0.5" fill="currentColor" />
    </svg>
  )
}

// ── ConfigRow ─────────────────────────────────────────────────────────────────

type RowStatus = 'idle' | 'saving' | 'saved' | 'error'

function ConfigRow({ entry }: { entry: ConfigEntry }) {
  const [localVal,   setLocalVal]   = useState(() => parseEntry(entry))
  const [status,     setStatus]     = useState<RowStatus>('idle')
  const [errMsg,     setErrMsg]     = useState('')
  const [showModal,  setShowModal]  = useState(false)

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

  const borderColor = status === 'saved' ? 'border-teal/30'
                    : status === 'error' ? 'border-danger/30'
                    : 'border-white/5'

  return (
    <>
      <div className={`rounded-xl border p-4 transition-colors ${borderColor} bg-navy/50`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            {/* Label + info icon */}
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white">{entry.label}</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-muted/50 hover:text-teal transition-colors flex-shrink-0"
                title="Learn more"
                aria-label={`More info about ${entry.label}`}
              >
                <InfoIcon />
              </button>
            </div>
            <p className="text-xs text-muted mt-0.5 leading-relaxed">{entry.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-lg font-bold text-teal">
              {formatDisplay(entry, localVal)}
            </span>
            {/* Sync badge */}
            {entry.isAppConfig ? (
              <span
                title="Saving this will be picked up by the SnapHook app within 24 hours"
                className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-help
                           bg-teal/15 text-teal border border-teal/20"
              >
                📱 Syncs to app
              </span>
            ) : (
              <span
                title="This setting only affects server-side calculations"
                className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-help
                           bg-white/5 text-muted border border-white/10"
              >
                🖥 Server only
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={status === 'saving'}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all disabled:opacity-40
                         border border-teal/40 text-teal hover:bg-teal/10"
            >
              {status === 'saving' ? '…' : status === 'saved' ? '✓ Saved' : 'Save'}
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

      {showModal && (
        <InfoModal
          entry={entry}
          currentDisplay={formatDisplay(entry, localVal)}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
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
