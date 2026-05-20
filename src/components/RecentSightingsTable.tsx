import type { RecentSighting } from '../types'

interface Props { sightings: RecentSighting[] }

const PHT = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

const scoreColor = (score: number) => {
  if (score >= 0.8) return '#FF3B30'
  if (score >= 0.6) return '#FFB300'
  return '#00D4AA'
}

const fmtCoord = (v: number | null) => (v != null ? v.toFixed(4) : '—')

const fmtDist = (d: number | null) =>
  d != null ? `~${Math.round(d)}m` : '—'

const HEADERS = ['ID', 'Lat / Lng', 'Threat Score', 'Radio', 'Est. Distance', 'Fingerprint', 'Time (PHT)']

export default function RecentSightingsTable({ sightings }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            {HEADERS.map((h) => (
              <th key={h} className="text-left text-muted text-xs font-medium uppercase tracking-wide pb-3 pr-4 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sightings.map((s) => (
            <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-3 pr-4 text-muted font-mono text-xs">#{s.id}</td>
              <td className="py-3 pr-4 font-mono text-xs">
                {s.lat != null && s.lng != null
                  ? <span className="text-white/80">{fmtCoord(s.lat)}, {fmtCoord(s.lng)}</span>
                  : <span className="text-muted">—</span>}
              </td>
              <td className="py-3 pr-4">
                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: scoreColor(s.threatScore) }}
                >
                  {(s.threatScore * 100).toFixed(0)}%
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="text-xs bg-white/5 rounded px-2 py-0.5 text-white/70">{s.radioType}</span>
              </td>
              <td className="py-3 pr-4 font-mono text-xs">
                {s.estimatedDistanceM != null
                  ? <span className="text-teal">{fmtDist(s.estimatedDistanceM)}</span>
                  : <span className="text-muted/40 italic text-[10px]">—</span>}
              </td>
              <td className="py-3 pr-4 font-mono text-xs">
                {s.fingerprintId
                  ? <span className="text-white/70">{s.fingerprintId}</span>
                  : <span className="text-muted/40 italic text-[10px]">—</span>}
              </td>
              <td className="py-3 text-xs text-muted whitespace-nowrap">
                {PHT.format(new Date(s.timestamp))}
              </td>
            </tr>
          ))}
          {sightings.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted text-sm">
                No sightings yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
