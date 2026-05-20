interface Props {
  label: string
  value: number | string
  sub?: string
  accent?: string
}

export default function StatCard({ label, value, sub, accent = '#00D4AA' }: Props) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-white/5">
      <p className="text-muted text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color: accent }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-muted text-xs mt-1">{sub}</p>}
    </div>
  )
}
