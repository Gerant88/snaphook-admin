import { useState, useEffect, useCallback } from 'react'
import { fetchSightings } from '../api'
import type { SightingRow } from '../types'

interface Props {
  refreshTick: number   // incremented by parent every 30s; re-fetches current page without resetting
  onSignOut:   () => void
}

const PHT = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

const scoreColor = (s: number) => s >= 0.8 ? '#FF3B30' : s >= 0.6 ? '#FFB300' : '#00D4AA'
const fmtCoord  = (v: number | null) => v != null ? v.toFixed(4) : '—'

// Build the page-number list with ellipsis. Returns numbers and '…' strings.
function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  const lo = Math.max(2, current - 1)
  const hi = Math.min(total - 1, current + 1)
  for (let i = lo; i <= hi; i++) pages.push(i)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

const HEADERS = ['ID', 'Lat / Lng', 'Score', 'Radio', 'Signal', 'Est. Distance', 'Fingerprint', 'Time (PHT)']

export default function PaginatedSightingsTable({ refreshTick, onSignOut }: Props) {
  const [page,       setPage]       = useState(1)
  const [limit,      setLimit]      = useState(10)
  const [data,       setData]       = useState<SightingRow[]>([])
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading,  setIsLoading]  = useState(true)

  const load = useCallback(async (p: number, l: number) => {
    setIsLoading(true)
    try {
      const res = await fetchSightings(p, l)
      setData(res.data)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 401) onSignOut()
    } finally {
      setIsLoading(false)
    }
  }, [onSignOut])

  // Page or limit change → fetch (limit change resets to page 1 via the setter below)
  useEffect(() => { load(page, limit) }, [page, limit, load])

  // Parent refresh tick → re-fetch current page without touching pagination state
  useEffect(() => {
    if (refreshTick > 0) load(page, limit)
  // intentionally exclude page/limit — we only want to re-fetch, not react to nav
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit)
    setPage(1)           // resets to page 1; the effect above re-fetches
  }

  // Derived
  const firstItem = total === 0 ? 0 : (page - 1) * limit + 1
  const lastItem  = Math.min(page * limit, total)
  const nums      = pageNumbers(page, totalPages)

  return (
    <div>
      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {HEADERS.map((h) => (
                <th key={h} className="text-left text-muted text-xs font-medium uppercase tracking-wide pb-3 pr-4 last:pr-0 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ opacity: isLoading ? 0.45 : 1, transition: 'opacity 0.2s' }}>
            {data.map((s) => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">

                {/* ID */}
                <td className="py-3 pr-4 text-muted font-mono text-xs whitespace-nowrap">
                  #{s.id}
                </td>

                {/* Lat/Lng */}
                <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                  {s.lat != null && s.lng != null
                    ? <span className="text-white/80">{fmtCoord(s.lat)}, {fmtCoord(s.lng)}</span>
                    : <span className="text-muted">—</span>}
                </td>

                {/* Score */}
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="font-mono text-xs font-semibold" style={{ color: scoreColor(s.threatScore) }}>
                    {(s.threatScore * 100).toFixed(0)}%
                  </span>
                </td>

                {/* Radio */}
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="text-xs bg-white/5 rounded px-2 py-0.5 text-white/70">{s.radioType}</span>
                </td>

                {/* Signal */}
                <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                  {s.signalStrength != null
                    ? <span className="text-white/70">{s.signalStrength} dBm</span>
                    : <span className="text-muted">—</span>}
                </td>

                {/* Est. distance */}
                <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                  {s.estimatedDistanceM != null
                    ? <span className="text-teal">~{Math.round(s.estimatedDistanceM)}m</span>
                    : <span className="text-muted">—</span>}
                </td>

                {/* Fingerprint */}
                <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                  {s.fingerprintId
                    ? <span className="text-white/60">{s.fingerprintId.slice(0, 8)}</span>
                    : <span className="text-muted">—</span>}
                </td>

                {/* Time */}
                <td className="py-3 text-xs text-muted whitespace-nowrap">
                  {PHT.format(new Date(s.timestamp))}
                </td>
              </tr>
            ))}

            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted text-sm">
                  No sightings yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination controls ───────────────────────────────────────── */}
      {total > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/5">

          {/* Left: range label */}
          <p className="text-xs text-muted whitespace-nowrap">
            Showing <span className="text-white/70">{firstItem}–{lastItem}</span> of{' '}
            <span className="text-white/70">{total}</span> sightings
          </p>

          {/* Center: page buttons */}
          <div className="flex items-center gap-1">
            {/* Prev */}
            <PageBtn
              label="←"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            />

            {nums.map((n, i) =>
              n === '…' ? (
                <span key={`e${i}`} className="px-2 text-muted text-xs select-none">…</span>
              ) : (
                <PageBtn
                  key={n}
                  label={String(n)}
                  onClick={() => setPage(n as number)}
                  active={n === page}
                />
              )
            )}

            {/* Next */}
            <PageBtn
              label="→"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            />
          </div>

          {/* Right: page-size selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Rows</span>
            <select
              value={limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="bg-card border border-white/10 rounded-lg text-xs text-white/80
                         px-2 py-1 focus:outline-none focus:border-teal/40 cursor-pointer"
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function PageBtn({
  label, onClick, disabled = false, active = false,
}: {
  label: string; onClick: () => void; disabled?: boolean; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-w-[28px] h-7 px-1.5 rounded-md text-xs font-mono transition-colors"
      style={{
        background:   active    ? 'rgba(0,212,170,0.15)' : 'transparent',
        borderWidth:  1,
        borderStyle:  'solid',
        borderColor:  active    ? 'rgba(0,212,170,0.4)'  :
                      disabled  ? 'rgba(255,255,255,0.05)': 'rgba(255,255,255,0.1)',
        color:        disabled  ? '#444'                 :
                      active    ? '#00D4AA'              : '#888',
        cursor:       disabled  ? 'not-allowed'          : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
