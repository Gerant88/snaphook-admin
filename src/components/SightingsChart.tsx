import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ChartPoint } from '../types'

interface Props { data: ChartPoint[] }

const fmtDate = (d: string) => {
  const dt = new Date(d + 'T00:00:00Z')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function SightingsChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#00D4AA" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#00D4AA" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fill: '#888', fontSize: 10 }}
          interval={4}
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
          labelStyle={{ color: '#888', fontSize: 11 }}
          itemStyle={{ color: '#00D4AA', fontSize: 12 }}
          labelFormatter={fmtDate}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#00D4AA"
          strokeWidth={2}
          fill="url(#tealGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
