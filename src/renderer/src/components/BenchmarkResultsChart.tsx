import React, { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import { COLUMN_DEFS, enrichRows } from './BenchmarkResultsTable'

// Series colors for up to ~8 distinct tests (pp512, tg128, pg512+128, etc).
// Cycled if more.
const SERIES_COLORS = [
  '#0ea5e9', // sky
  '#16a34a', // green
  '#f97316', // orange
  '#a855f7', // violet
  '#dc2626', // red
  '#0891b2', // cyan
  '#ca8a04', // yellow
  '#7c3aed', // indigo
]

// Find the first numeric column from COLUMN_DEFS that actually varies across rows.
// That's our X axis.
function detectXAxis(rows: Record<string, unknown>[]): { key: string; label: string } | null {
  for (const col of COLUMN_DEFS) {
    if (!col.numeric) continue
    if (col.key === 'ts_combined') continue
    const vals = new Set(rows.map(r => r[col.key]))
    vals.delete(undefined)
    if (vals.size > 1) return { key: col.key, label: col.label }
  }
  return null
}

export default function BenchmarkResultsChart({ rows }: { rows: Record<string, unknown>[] }) {
  const enriched = useMemo(() => enrichRows(rows), [rows])
  const xAxis = useMemo(() => detectXAxis(enriched), [enriched])
  const testTypes = useMemo(() => {
    const set = new Set<string>()
    for (const r of enriched) set.add(String(r.test || ''))
    return Array.from(set).filter(Boolean).sort()
  }, [enriched])

  const chartData = useMemo(() => {
    if (xAxis) {
      // Pivot: one row per unique X value, with one column per test type.
      const byX = new Map<number | string, Record<string, unknown>>()
      for (const r of enriched) {
        const xRaw = r[xAxis.key]
        const xVal = typeof xRaw === 'number' ? xRaw : String(xRaw ?? '')
        if (!byX.has(xVal)) byX.set(xVal, { [xAxis.key]: xVal })
        const ts = Number(r.avg_ts)
        if (Number.isFinite(ts)) byX.get(xVal)![String(r.test || 'value')] = ts
      }
      return Array.from(byX.values()).sort((a, b) => {
        const av = a[xAxis.key], bv = b[xAxis.key]
        if (typeof av === 'number' && typeof bv === 'number') return av - bv
        return String(av).localeCompare(String(bv))
      })
    }
    // No swept dimension: one bar per test (just visualizing the headline numbers).
    return testTypes.map(t => {
      const rowsForTest = enriched.filter(r => r.test === t)
      const avg = rowsForTest.reduce((s, r) => s + (Number(r.avg_ts) || 0), 0) / Math.max(rowsForTest.length, 1)
      return { test: t, avg_ts: avg }
    })
  }, [enriched, xAxis, testTypes])

  if (!enriched.length) return null

  // Empty x-axis case: render a bar chart per test.
  if (!xAxis) {
    return (
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="test" stroke="var(--text-secondary)" />
            <YAxis stroke="var(--text-secondary)" label={{ value: 'tok/s', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 12 } }} />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 8,
                fontSize: 12
              }}
              formatter={(v: number) => v.toFixed(2)}
            />
            <Bar dataKey="avg_ts" fill={SERIES_COLORS[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Swept-dimension case: line chart, one line per test.
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey={xAxis.key}
            stroke="var(--text-secondary)"
            label={{ value: xAxis.label, position: 'insideBottom', offset: -2, style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
          />
          <YAxis
            stroke="var(--text-secondary)"
            label={{ value: 'tok/s', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1.5px solid var(--border)',
              borderRadius: 8,
              fontSize: 12
            }}
            labelStyle={{ color: 'var(--text)' }}
            formatter={(v: number) => v.toFixed(2)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {testTypes.map((t, i) => (
            <Line
              key={t}
              dataKey={t}
              name={t}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
