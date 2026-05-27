import { useState, useEffect } from 'react'
import { fetchConfig } from '../api'
import type { ConfigEntry } from '../types'
import type { Page } from '../App'
import NavTabs from '../components/NavTabs'

interface Props {
  activePage: Page
  onNavigate: (p: Page) => void
  onSignOut:  () => void
}

// Algorithm-relevant config keys and how each one affects detection
const ALGO_PARAMS: { key: string; effect: string }[] = [
  {
    key:    'signal_strength_delta_dbm',
    effect: 'A tower must exceed peer average by this many dBm to trigger the STRONG_SIGNAL amplifier. Lower values catch subtler boosts but increase false positives.',
  },
  {
    key:    'min_opencellid_samples',
    effect: 'OpenCellID coverage is only trusted when ≥ this many crowd-sourced records exist for the area. Prevents UNKNOWN_TOWER from firing in uncharted regions.',
  },
  {
    key:    'no_identity_score',
    effect: 'Base threat score assigned when a tower exposes no Cell ID, MCC, MNC, or LAC. Legitimate towers always identify themselves; zero identity is the strongest rogue indicator.',
  },
  {
    key:    'unknown_tower_score',
    effect: 'Base threat score for towers that are identified but absent from the OpenCellID database. Can be elevated if STRONG_SIGNAL is also detected.',
  },
  {
    key:    'strong_signal_score',
    effect: 'Additional score applied when an anomalous signal boost is confirmed. Since GER-66 (v1.1) this is an amplifier only — it never triggers a standalone threat.',
  },
]

const PIPELINE_STEPS = [
  {
    code:  'TelephonyManager.getAllCellInfo()',
    label: 'Cell scan',
    desc:  'Android API returns a snapshot of all visible cell towers, including the serving cell and neighbors.',
  },
  {
    code:  'CellTower (Cell ID, MCC, MNC, LAC, signal dBm, radio type)',
    label: 'Parse tower objects',
    desc:  'Raw CellInfo objects are normalized into CellTower data classes. Missing fields produce null values, not errors.',
  },
  {
    code:  'OpenCellID lookup → KnownTower?',
    label: 'Database cross-reference',
    desc:  'Each tower is checked against the crowd-sourced OpenCellID dataset. Only results with ≥ min_opencellid_samples records are trusted.',
  },
  {
    code:  'AnomalyDetector.evaluate(tower, peers)',
    label: 'Anomaly evaluation',
    desc:  'The detector applies threat rules in priority order: identity check → DB lookup → signal delta. Returns ThreatResult.',
  },
  {
    code:  'ThreatResult { type, score, reason }',
    label: 'Threat result',
    desc:  'Score 0.0 = CLEAN. Score > 0.0 triggers storage and (if score > 0) a backend sighting submission.',
    fork:  true,
  },
  {
    code:  'ThreatStore (Room) + POST /sightings',
    label: 'Persist & report',
    desc:  'High-score results are saved locally for the SMS correlation window and submitted to the backend for hotzone analysis.',
  },
  {
    code:  'Dashboard threat level',
    label: 'UI verdict',
    desc:  'The highest active ThreatResult score determines the SAFE / WARNING / DANGER / COMPROMISED badge shown to the user.',
  },
]

const THREAT_TYPES = [
  { type: 'NO_IDENTITY',                                          score: '0.90', color: '#FF3B30', trigger: 'All of Cell ID, MCC, MNC, LAC are null',                                                      standalone: 'Yes — highest priority'  },
  { type: 'UNKNOWN_TOWER (unregistered)',                         score: '0.80', color: '#FF3B30', trigger: 'Tower not in OpenCellID (requires reliable coverage)',                                          standalone: 'Yes'                     },
  { type: 'UNKNOWN_TOWER (registered, known PH carrier)',         score: '0.65', color: '#FFB300', trigger: 'Registered tower absent from OpenCellID but belongs to Globe/Smart/DITO (MCC 515) — carrier trust boost applied', standalone: 'Yes — below COMPROMISED' },
  { type: 'UNKNOWN_TOWER + STRONG_SIGNAL',                        score: '0.85', color: '#FF3B30', trigger: 'Unknown tower AND signal > delta above peer average',                                           standalone: 'Combination'             },
  { type: 'UNKNOWN_TOWER + STRONG_SIGNAL (registered, known PH carrier)', score: '0.65', color: '#FFB300', trigger: 'Combination with carrier trust boost — score capped at 0.65 regardless of signal amplifier', standalone: 'Combination — capped'   },
  { type: 'NO_IDENTITY + STRONG_SIGNAL',                          score: '0.95', color: '#FF3B30', trigger: 'No identity AND abnormally strong signal',                                                      standalone: 'Combination (highest)'   },
  { type: 'STRONG_SIGNAL (alone)',                                score: '0.0',  color: '#888',    trigger: 'Strong signal on an identified, known tower — amplifier only',                                  standalone: 'No — not a threat alone' },
  { type: 'CLEAN',                                                score: '0.0',  color: '#00D4AA', trigger: 'Tower identified and present in OpenCellID',                                                     standalone: '—'                       },
]

const THREAT_LEVELS = [
  { level: 'SAFE',        color: '#00D4AA', condition: 'No threats detected in recent scan window.', exception: null },
  { level: 'WARNING',     color: '#FFB300', condition: 'Suspicious or rogue tower nearby, but its signal is weaker than the clean-tower average.', exception: null },
  { level: 'DANGER',      color: '#FF6B00', condition: 'Suspicious tower whose signal exceeds the clean average — phone may prefer it.', exception: null },
  {
    level: 'COMPROMISED',
    color: '#FF3B30',
    condition: 'Registered (connected) tower has score ≥ 0.8 (NO_IDENTITY or UNKNOWN_TOWER). STRONG_SIGNAL alone never triggers this.',
    exception: 'Exception: Registered towers from known PH carriers (Globe MNC 02, Smart MNC 03, DITO MNC 05, etc.) not found in OpenCellID are scored 0.65 — treated as possibly new/uncatalogued towers rather than confirmed rogue.',
  },
]

const SMS_CORRELATION = [
  { smsType: 'QUARANTINE (scam pattern / phishing URL)', boost: '+0.20', color: '#FF3B30' },
  { smsType: 'WARNING (suspicious URL / urgency)',       boost: '+0.10', color: '#FFB300' },
  { smsType: 'Any correlated SMS',                       boost: '+0.10 minimum', color: '#888' },
]

const SMS_CONFIDENCE_TIERS = [
  {
    tier:       'QUARANTINE',
    confidence: '≥85%',
    action:     'Moved to quarantine',
    color:      '#FF3B30',
    when:       'URL + unknown sender + urgency, known phishing domain, exact scam template match',
  },
  {
    tier:       'WARNING',
    confidence: '50–84%',
    action:     'Stored with amber warning',
    color:      '#FFB300',
    when:       'Shortened URL from unknown sender, urgency language with a link',
  },
  {
    tier:       'INFORMATIONAL',
    confidence: '35–49%',
    action:     'Subtle indicator only — not quarantined',
    color:      '#888888',
    when:       'Promotional content from trusted sender, urgency language with no link',
  },
  {
    tier:       'CLEAN',
    confidence: '<35%',
    action:     'No action',
    color:      '#00D4AA',
    when:       'Legitimate OTPs, routine notifications, no suspicious patterns',
  },
]

const TRUSTED_SENDERS = [
  { category: 'Banks',      senders: 'BPI, BDO, Metrobank (MBTC), RCBC, PNB, Landbank, BancNet' },
  { category: 'E-wallets',  senders: 'GCash, Maya, PayMaya' },
  { category: 'Carriers',   senders: 'Globe, Smart, TNT, DITO, PLDT' },
  { category: 'Government', senders: 'SSS, PhilHealth, Pag-IBIG, BIR, DICT' },
]

const ALWAYS_QUARANTINE = [
  'URL pointing to a non-institution domain (lookalike / typosquat)',
  'Request for OTP / password / PIN accompanied by a link',
  'Exact match against a known PH scam template with a URL',
  'Account suspension or verification threat with a link',
]

const NEVER_QUARANTINE = [
  'Promotional content from a known sender with a DTI permit reference number',
  '"Text STOP to unsubscribe" pattern from a trusted sender',
  'Legitimate OTP (numeric code present, no URL) from a trusted sender',
  'Routine financial notification from a known bank sender ID without a suspicious URL',
]

const FP_MITIGATIONS = [
  {
    risk:       'Sparse OpenCellID coverage',
    mitigation: 'min_opencellid_samples threshold prevents UNKNOWN_TOWER from firing when the database has insufficient records for an area.',
  },
  {
    risk:       'New legitimate towers',
    mitigation: 'UNKNOWN_TOWER requires verified DB coverage to fire — absence of data in a low-sample area is treated as INCONCLUSIVE, not rogue.',
  },
  {
    risk:       'Known carrier trust boost',
    mitigation: 'If the phone is registered to a tower from a known PH carrier (MCC 515: Globe, Smart, DITO) but the tower isn\'t in OpenCellID, score is reduced to 0.65. This prevents false COMPROMISED alerts on new legitimate towers that haven\'t been catalogued yet (GER-65).',
  },
  {
    risk:       'Strong signal on a known tower',
    mitigation: 'STRONG_SIGNAL alone is never flagged as a threat (GER-66). A tower must also be missing from the DB or lack identity to score above 0.',
  },
  {
    risk:       'No mobile data connection',
    mitigation: 'ConnectivityProbe returns INCONCLUSIVE when offline — the app never downgrades connectivity verdict to COMPROMISED without a live probe.',
  },
  {
    risk:       'Wi-Fi active',
    mitigation: 'ConnectivityProbe is skipped when Wi-Fi is connected, preventing false network-level verdicts from a cellular-only check.',
  },
  {
    risk:       'Legitimate bank / carrier OTPs',
    mitigation: 'The SMS engine maintains a trusted sender whitelist (GCash, BDO, BPI, Maya, Globe, Smart …). Messages from these senders are capped at INFORMATIONAL (≤35% confidence) unless a suspicious URL pointing to a non-institution domain is detected (GER-90).',
  },
  {
    risk:       'SMS correlation as confirmation, not detection',
    mitigation: 'SMS events only boost confidence on already-flagged tower fingerprints. Clean towers are completely unaffected — a phishing SMS alone cannot trigger a tower threat (GER-75).',
  },
]

const CHANGELOG = [
  {
    version: 'v2.0',
    ticket:  'GER-90',
    date:    '2026-05',
    summary: 'SMS scanning philosophy overhaul — precision over recall. New confidence tiers: QUARANTINE (≥85%), WARNING (50–84%), INFORMATIONAL (35–49%), CLEAN (<35%). Trusted PH sender whitelist (BPI, BDO, GCash, Globe, Smart …) capped at INFORMATIONAL unless a suspicious URL is detected. DTI permit reference numbers reduce suspicion score. Informational warnings replace aggressive quarantine for low-confidence patterns.',
  },
  {
    version: 'v1.4',
    ticket:  'GER-75',
    date:    '2026-05',
    summary: 'SMS-Tower correlation confidence boost — when a phishing SMS is received while a rogue tower is active (within 5 minutes), the tower fingerprint\'s confidence score is boosted. KNOWN_SCAM_PATTERN adds +0.20; SUSPICIOUS_URL and URGENCY_KEYWORDS each add +0.10. Boosted confidence is capped at 1.0.',
  },
  {
    version: 'v1.3',
    ticket:  'GER-74',
    date:    '2026-05',
    summary: 'NO_IDENTITY pseudo-fingerprinting — location-based noid_ fingerprint for unidentifiable towers. Previously each NO_IDENTITY detection had no fingerprint, preventing deduplication and correlation. Now generates a 12-char hex fingerprint scoped to the reporter\'s location.',
  },
  {
    version: 'v1.2',
    ticket:  'GER-65',
    date:    '2026-05',
    summary: 'Carrier trust boost — registered PH carrier towers (Globe/Smart/DITO, MCC 515) get score capped at 0.65 when not found in OpenCellID. Prevents false COMPROMISED alerts on new legitimate towers that haven\'t been catalogued yet.',
  },
  {
    version: 'v1.1',
    ticket:  'GER-66',
    date:    '2026-05',
    summary: 'STRONG_SIGNAL demoted to amplifier only. Previously flagged as standalone threat at score 0.7. Now only elevates the score of NO_IDENTITY or UNKNOWN_TOWER — never fires alone.',
  },
  {
    version: 'v1.0',
    ticket:  null,
    date:    '2026-04',
    summary: 'Initial release — STRONG_SIGNAL as standalone threat (score 0.7), NO_IDENTITY (0.9), UNKNOWN_TOWER (0.8), four threat levels.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function AlgorithmPage({ activePage, onNavigate, onSignOut }: Props) {
  const [config,  setConfig]  = useState<ConfigEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const configMap = Object.fromEntries(config.map((c) => [c.key, c]))

  return (
    <div className="min-h-screen bg-navy text-white">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              <span className="font-bold text-lg tracking-tight">
                Snaphook <span className="text-teal">Admin</span>
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

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-white/90">Detection Algorithm</h1>
          <p className="text-sm text-muted mt-1">
            Reference documentation for Snaphook's rogue cell-tower detection methodology.
            Updated whenever algorithm changes ship.
          </p>
        </div>

        {/* ── 1. Detection pipeline ──────────────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-5">1 · Detection Pipeline</h2>

          <div className="flex flex-col items-center gap-0 max-w-xl">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={i} className="w-full flex flex-col items-center">
                {/* Step box */}
                <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3">
                  <div className="font-mono text-xs text-teal mb-0.5">{step.code}</div>
                  <div className="text-[11px] font-semibold text-white/70 mb-0.5">{step.label}</div>
                  <div className="text-[11px] text-muted leading-snug">{step.desc}</div>
                </div>
                {/* Connector arrow — skip after last */}
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className="flex flex-col items-center py-1 select-none">
                    <div className="w-px h-3 bg-white/10" />
                    <div className="text-white/20 text-xs">▼</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. Threat type reference ───────────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-4">2 · Threat Type Reference</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Threat Type', 'Score', 'Trigger Condition', 'Standalone?'].map((h) => (
                    <th key={h} className="text-left text-muted text-xs font-medium uppercase tracking-wide pb-3 pr-6 last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {THREAT_TYPES.map((t) => (
                  <tr key={t.type} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-6 font-mono text-xs font-semibold whitespace-nowrap"
                        style={{ color: t.color }}>
                      {t.type}
                    </td>
                    <td className="py-3 pr-6 font-mono text-xs whitespace-nowrap"
                        style={{ color: t.color }}>
                      {t.score}
                    </td>
                    <td className="py-3 pr-6 text-xs text-white/70">{t.trigger}</td>
                    <td className="py-3 text-xs text-muted whitespace-nowrap">{t.standalone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted mt-3">
            Scores shown are base values. The STRONG_SIGNAL amplifier can raise NO_IDENTITY to 0.95 and UNKNOWN_TOWER to 0.85.
            Registered towers from known PH carriers (MCC 515) are capped at 0.65 regardless of amplifiers (GER-65).
          </p>
        </section>

        {/* ── 3. SMS Correlation Confidence Boost ───────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-1">3 · SMS Correlation Confidence Boost</h2>
          <p className="text-[11px] text-muted mb-4">
            When a phishing SMS is received while a rogue tower is active (within 5 minutes), the tower fingerprint's
            confidence score is boosted. Only applies to already-flagged towers — clean towers are unaffected.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['SMS Threat Type', 'Confidence Boost'].map((h) => (
                    <th key={h} className="text-left text-muted text-xs font-medium uppercase tracking-wide pb-3 pr-6 last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SMS_CORRELATION.map((row) => (
                  <tr key={row.smsType} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-6 font-mono text-xs font-semibold" style={{ color: row.color }}>{row.smsType}</td>
                    <td className="py-3 font-mono text-xs font-semibold text-teal">{row.boost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3 space-y-1">
            <p className="text-[11px] text-white/70">
              <span className="font-semibold text-white/90">Formula: </span>
              Boosted confidence = base score + sum of all correlation boosts, capped at 1.0
            </p>
            <p className="text-[11px] text-muted">
              Example: NO_IDENTITY tower (0.90) + QUARANTINE-tier SMS (+0.20) = 1.0 — "Confirmed threat"
            </p>
            <p className="text-[11px] text-muted">
              Visible in Threat Profile page under "Correlated SMS Events".
            </p>
          </div>
        </section>

        {/* ── 4. Threat level thresholds ─────────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-4">4 · Threat Level Thresholds</h2>
          <div className="space-y-3">
            {THREAT_LEVELS.map((lvl) => (
              <div key={lvl.level}
                className="flex items-start gap-4 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3">
                <span
                  className="mt-0.5 text-xs font-bold rounded-full px-3 py-0.5 border shrink-0 whitespace-nowrap"
                  style={{
                    color:       lvl.color,
                    borderColor: lvl.color + '44',
                    background:  lvl.color + '15',
                  }}
                >
                  {lvl.level}
                </span>
                <div>
                  <p className="text-xs text-white/70 leading-relaxed">{lvl.condition}</p>
                  {lvl.exception && (
                    <p className="text-[11px] text-muted leading-relaxed mt-1.5 italic">{lvl.exception}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. Live algorithm parameters ──────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/80">5 · Algorithm Parameters</h2>
            <span className="text-[11px] text-muted">Live values from backend config</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {ALGO_PARAMS.map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {ALGO_PARAMS.map(({ key, effect }) => {
                const entry = configMap[key]
                return (
                  <div key={key}
                    className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-teal/80">{key}</span>
                      <span className="font-mono text-sm font-semibold text-white/90">
                        {entry?.value ?? '—'}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted leading-snug">{effect}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 6. False positive mitigations ─────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-4">6 · False Positive Mitigations</h2>
          <div className="space-y-3">
            {FP_MITIGATIONS.map((m) => (
              <div key={m.risk}
                className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3">
                <div className="text-xs font-semibold text-white/80 mb-1">{m.risk}</div>
                <p className="text-[11px] text-muted leading-snug">{m.mitigation}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. Changelog ──────────────────────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-4">7 · Algorithm Changelog</h2>
          <div className="space-y-3">
            {CHANGELOG.map((entry) => (
              <div key={entry.version}
                className="flex items-start gap-4 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3">
                <div className="shrink-0 text-right" style={{ minWidth: 56 }}>
                  <div className="font-mono text-xs font-bold text-teal">{entry.version}</div>
                  <div className="text-[10px] text-muted">{entry.date}</div>
                  {entry.ticket && (
                    <div className="text-[10px] text-muted/60 mt-0.5">{entry.ticket}</div>
                  )}
                </div>
                <div className="border-l border-white/10 pl-4">
                  <p className="text-xs text-white/70 leading-relaxed">{entry.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 8. SMS Detection Philosophy ───────────────────────────────────── */}
        <section className="bg-card rounded-2xl p-6 border border-white/5">
          <h2 className="text-sm font-semibold text-white/80 mb-1">8 · SMS Detection Philosophy</h2>
          <p className="text-[11px] text-muted mb-5">
            Precision over recall — only quarantine when near-certain. False positives damage user
            trust more than false negatives. Overhauled in GER-90 (v2.0).
          </p>

          {/* Confidence tiers */}
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">Confidence Tiers</h3>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Tier', 'Confidence', 'Action', 'When'].map((h) => (
                    <th key={h} className="text-left text-muted text-xs font-medium uppercase tracking-wide pb-3 pr-6 last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SMS_CONFIDENCE_TIERS.map((t) => (
                  <tr key={t.tier} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-6 font-mono text-xs font-semibold" style={{ color: t.color }}>{t.tier}</td>
                    <td className="py-3 pr-6 font-mono text-xs" style={{ color: t.color }}>{t.confidence}</td>
                    <td className="py-3 pr-6 text-xs text-white/70">{t.action}</td>
                    <td className="py-3 text-xs text-muted">{t.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Trusted sender whitelist */}
          <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">Trusted Sender Whitelist</h3>
          <p className="text-[11px] text-muted mb-3">
            Messages from these registered PH institution sender IDs are capped at INFORMATIONAL (≤35%)
            unless a URL pointing to a non-institution domain is detected.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {TRUSTED_SENDERS.map((g) => (
              <div key={g.category} className="rounded-xl bg-white/[0.02] border border-white/5 px-4 py-3">
                <div className="text-[10px] font-semibold text-teal/80 uppercase tracking-wide mb-1">{g.category}</div>
                <div className="text-xs text-white/70">{g.senders}</div>
              </div>
            ))}
          </div>

          {/* Always / never quarantine */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">Always Quarantine</h3>
              <div className="space-y-2">
                {ALWAYS_QUARANTINE.map((rule) => (
                  <div key={rule} className="flex items-start gap-2 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2">
                    <span className="text-[#FF3B30] text-xs mt-0.5 shrink-0">✕</span>
                    <p className="text-[11px] text-white/70 leading-snug">{rule}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">Never Quarantine</h3>
              <div className="space-y-2">
                {NEVER_QUARANTINE.map((rule) => (
                  <div key={rule} className="flex items-start gap-2 rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2">
                    <span className="text-[#00D4AA] text-xs mt-0.5 shrink-0">✓</span>
                    <p className="text-[11px] text-white/70 leading-snug">{rule}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
