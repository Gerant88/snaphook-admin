import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid,
} from 'recharts'

interface Props {
  data: {
    NO_IDENTITY: number
    UNKNOWN_TOWER: number
    STRONG_SIGNAL: number
  }
}

const THREAT_BARS = [
  { key: 'NO_IDENTITY',   label: 'No Identity',   color: '#FF3B30' },
  { key: 'UNKNOWN_TOWER', label: 'Unknown Tower',  color: '#FFB300' },
  { key: 'STRONG_SIGNAL', label: 'Strong Signal',  color: '#00D4AA' },
]

export default function ThreatBreakdown({ data }: Props) {
  const chartData = THREAT_BARS.map((t) => ({
    name:  t.label,
    count: data[t.key as keyof typeof data],
    color: t.color,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#888', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#888', fontSize: 10 }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#0F1629', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
          labelStyle={{ color: '#aaa', fontSize: 11 }}
          itemStyle={{ color: '#fff', fontSize: 12 }}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
