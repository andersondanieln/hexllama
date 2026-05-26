import React, { useMemo, useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList
} from 'recharts'
import { LineChart as LineIcon, BarChart3, Grid3x3 } from 'lucide-react'
import { COLUMN_DEFS, enrichRows, type ColumnDef } from './BenchmarkResultsTable'

const SERIES_COLORS = [
  '#0ea5e9', '#16a34a', '#f97316', '#a855f7',
  '#dc2626', '#0891b2', '#ca8a04', '#7c3aed',
]

// Synthetic "Test" pseudo-column so users can pick it on either axis.
const TEST_COL: ColumnDef = { key: 'test', label: 'Test', numeric: false }

function dimsThatVary(rows: Record<string, unknown>[]): ColumnDef[] {
  const candidates: ColumnDef[] = [
    TEST_COL,
    ...COLUMN_DEFS.filter(c => c.key !== 'ts_combined' && c.key !== 'test' && c.key !== 'model_filename')
  ]
  return candidates.filter(col => {
    const vals = new Set(rows.map(r => r[col.key]))
    vals.delete(undefined)
    return vals.size > 1
  })
}

type ChartType = 'auto' | 'heatmap'

export default function BenchmarkResultsChart({ rows }: { rows: Record<string, unknown>[] }) {
  const enriched = useMemo(() => enrichRows(rows), [rows])
  const varying = useMemo(() => dimsThatVary(enriched), [enriched])

  const [xKey, setXKey] = useState<string>('')
  const [seriesKey, setSeriesKey] = useState<string>('test')
  const [chartType, setChartType] = useState<ChartType>('auto')

  // Pick a sane initial X when the row set changes (or on first mount)
  useEffect(() => {
    if (!varying.length) return
    if (!xKey || !varying.find(c => c.key === xKey)) {
      const firstNumeric = varying.find(c => c.numeric && c.key !== 'test')
      setXKey((firstNumeric || varying[0]).key)
    }
    if (!seriesKey || !varying.find(c => c.key === seriesKey)) {
      setSeriesKey(varying.find(c => c.key === 'test') ? 'test' : (varying.find(c => c.key !== xKey)?.key || varying[0].key))
    }
  }, [varying, xKey, seriesKey])

  const xCol = useMemo(() => varying.find(c => c.key === xKey), [varying, xKey])
  const seriesCol = useMemo(() => varying.find(c => c.key === seriesKey), [varying, seriesKey])

  if (!enriched.length) return null
  if (!varying.length) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
        Need at least one varying dimension to chart. Try a sweep with multiple values.
      </div>
    )
  }

  const Toolbar = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>X</span>
        <select
          className="form-select"
          value={xKey}
          onChange={e => setXKey(e.target.value)}
          style={{ padding: '4px 28px 4px 8px', fontSize: 12 }}
        >
          {varying.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {chartType === 'heatmap' ? 'Y' : 'Series'}
        </span>
        <select
          className="form-select"
          value={seriesKey}
          onChange={e => setSeriesKey(e.target.value)}
          style={{ padding: '4px 28px 4px 8px', fontSize: 12 }}
        >
          {varying.filter(c => c.key !== xKey).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div style={{ flex: 1 }} />
      <div className="tab-bar" style={{ marginBottom: 0, padding: 2 }}>
        <button
          type="button"
          className={`tab-item ${chartType === 'auto' ? 'active' : ''}`}
          style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px' }}
          onClick={() => setChartType('auto')}
          title={xCol?.numeric ? 'Line chart' : 'Bar chart'}
        >
          {xCol?.numeric ? <LineIcon size={13} /> : <BarChart3 size={13} />} Chart
        </button>
        <button
          type="button"
          className={`tab-item ${chartType === 'heatmap' ? 'active' : ''}`}
          style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px' }}
          onClick={() => setChartType('heatmap')}
          title="Heatmap (X × Y of tok/s)"
        >
          <Grid3x3 size={13} /> Heatmap
        </button>
      </div>
    </div>
  )

  if (chartType === 'heatmap' && xCol && seriesCol && xCol.key !== seriesCol.key) {
    return (
      <div>
        {Toolbar}
        <Heatmap rows={enriched} xCol={xCol} yCol={seriesCol} />
      </div>
    )
  }

  // Regular chart path: line for numeric X, bar for categorical X.
  // xCol / seriesCol can be momentarily undefined on first render before the
  // initializer useEffect resolves them — skip the chart until both are ready.
  return (
    <div>
      {Toolbar}
      {xCol && seriesCol
        ? <ChartView rows={enriched} xCol={xCol} seriesCol={seriesCol} />
        : <div style={{ height: 340 }} />}
    </div>
  )
}

function ChartView({ rows, xCol, seriesCol }: { rows: Record<string, unknown>[]; xCol: ColumnDef; seriesCol: ColumnDef }) {
  const seriesValues = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(String(r[seriesCol.key] ?? ''))
    return Array.from(set).filter(Boolean).sort()
  }, [rows, seriesCol.key])

  const data = useMemo(() => {
    const byX = new Map<string | number, Record<string, unknown>>()
    for (const r of rows) {
      const xRaw = r[xCol.key]
      const xVal = xCol.numeric ? Number(xRaw) : String(xRaw ?? '')
      if (!byX.has(xVal)) byX.set(xVal, { [xCol.key]: xVal })
      const ts = Number(r.avg_ts)
      if (!Number.isFinite(ts)) continue
      const sKey = String(r[seriesCol.key] ?? '')
      // If multiple rows match the same (x, series) cell, average them.
      const existing = byX.get(xVal)![sKey]
      if (typeof existing === 'number') {
        byX.get(xVal)![sKey] = (existing + ts) / 2
      } else {
        byX.get(xVal)![sKey] = ts
      }
    }
    return Array.from(byX.values()).sort((a, b) => {
      const av = a[xCol.key], bv = b[xCol.key]
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      return String(av).localeCompare(String(bv))
    })
  }, [rows, xCol, seriesCol])

  // Tight-fit the y-axis to the actual data range. recharts defaults to [0, dataMax]
  // which flattens small differences (e.g. 47 vs 49 tok/s looks identical when the
  // axis spans 0-50). 10% headroom keeps top/bottom values from kissing the edges.
  const yDomain = useMemo<[number, number] | undefined>(() => {
    const vals: number[] = []
    for (const row of data) {
      for (const s of seriesValues) {
        const v = row[s]
        if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
      }
    }
    if (!vals.length) return undefined
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    if (min === max) return [Math.max(0, min - 1), max + 1]
    const pad = (max - min) * 0.1
    return [Math.max(0, min - pad), max + pad]
  }, [data, seriesValues])

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis
        dataKey={xCol.key}
        stroke="var(--text-secondary)"
        label={{ value: xCol.label, position: 'insideBottom', offset: -2, style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
      />
      <YAxis
        stroke="var(--text-secondary)"
        domain={yDomain || ['auto', 'auto']}
        tickFormatter={(v) => Number(v).toFixed(1)}
        label={{ value: 'tok/s', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 12 } }}
      />
      <Tooltip
        contentStyle={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12 }}
        labelStyle={{ color: 'var(--text)' }}
        formatter={(v) => Number(v).toFixed(2)}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  )

  // Compact value labels above each data point / bar top. With the y-axis zoomed in,
  // showing the raw numbers keeps the chart honest about what the differences mean.
  const valueLabel = {
    position: (xCol.numeric ? 'top' : 'top') as 'top',
    fontSize: 10,
    fill: 'var(--text-secondary)',
    formatter: (v: unknown) => Number(v).toFixed(1)
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer>
          {xCol.numeric ? (
            <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
              {commonAxes}
              {seriesValues.map((s, i) => (
                <Line
                  key={s}
                  dataKey={s}
                  name={s}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                >
                  {seriesValues.length <= 4 && <LabelList {...valueLabel} />}
                </Line>
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
              {commonAxes}
              {seriesValues.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  name={s}
                  fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                  radius={[3, 3, 0, 0]}
                >
                  {seriesValues.length <= 4 && <LabelList {...valueLabel} />}
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {yDomain && yDomain[0] > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          Y-axis zoomed to {yDomain[0].toFixed(1)}–{yDomain[1].toFixed(1)} tok/s to make small differences visible.
        </div>
      )}
    </div>
  )
}

function Heatmap({ rows, xCol, yCol }: { rows: Record<string, unknown>[]; xCol: ColumnDef; yCol: ColumnDef }) {
  const xVals = useMemo(() => {
    const arr = Array.from(new Set(rows.map(r => r[xCol.key])))
    return arr
      .filter(v => v != null)
      .sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b
        return String(a).localeCompare(String(b))
      })
  }, [rows, xCol.key])
  const yVals = useMemo(() => {
    const arr = Array.from(new Set(rows.map(r => r[yCol.key])))
    return arr
      .filter(v => v != null)
      .sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b
        return String(a).localeCompare(String(b))
      })
  }, [rows, yCol.key])

  // Test types in the data — render one heatmap per test (pp512, tg128).
  const testTypes = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) set.add(String(r.test || ''))
    return Array.from(set).filter(Boolean).sort()
  }, [rows])

  function cellValue(x: unknown, y: unknown, test: string): number | null {
    const matches = rows.filter(r => r[xCol.key] === x && r[yCol.key] === y && r.test === test)
    if (!matches.length) return null
    const vals = matches.map(r => Number(r.avg_ts)).filter(v => Number.isFinite(v))
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  function colorFor(v: number | null, min: number, max: number): string {
    if (v == null) return 'transparent'
    if (max === min) return 'hsl(140, 60%, 80%)'
    const t = (v - min) / (max - min)
    return `hsl(140, 60%, ${88 - t * 50}%)`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {testTypes.map(test => {
        const cellVals = xVals.flatMap(x => yVals.map(y => cellValue(x, y, test))).filter((v): v is number => v != null)
        const min = cellVals.length ? Math.min(...cellVals) : 0
        const max = cellVals.length ? Math.max(...cellVals) : 0
        const bestVal = cellVals.length ? Math.max(...cellVals) : null
        return (
          <div key={test}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
              {test} <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(tok/s — green = faster)</span>
            </div>
            <div style={{ overflowX: 'auto', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        padding: '6px 10px',
                        background: 'var(--bg)',
                        textAlign: 'right',
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        fontSize: 11,
                        borderBottom: '1px solid var(--border)',
                        borderRight: '1px solid var(--border)'
                      }}
                    >
                      {yCol.label} ↓ / {xCol.label} →
                    </th>
                    {xVals.map(x => (
                      <th
                        key={String(x)}
                        style={{
                          padding: '6px 10px',
                          background: 'var(--bg)',
                          textAlign: 'center',
                          fontFamily: "'SF Mono','Fira Code',monospace",
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          borderBottom: '1px solid var(--border)'
                        }}
                      >
                        {String(x)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yVals.map(y => (
                    <tr key={String(y)}>
                      <th
                        style={{
                          padding: '6px 10px',
                          textAlign: 'right',
                          background: 'var(--bg)',
                          fontFamily: "'SF Mono','Fira Code',monospace",
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          borderRight: '1px solid var(--border)'
                        }}
                      >
                        {String(y)}
                      </th>
                      {xVals.map(x => {
                        const v = cellValue(x, y, test)
                        const isBest = v != null && bestVal != null && v === bestVal
                        return (
                          <td
                            key={String(x)}
                            style={{
                              padding: '8px 10px',
                              textAlign: 'center',
                              background: colorFor(v, min, max),
                              fontFamily: "'SF Mono','Fira Code',monospace",
                              fontSize: 12,
                              color: 'var(--text)',
                              border: '1px solid rgba(0,0,0,0.04)',
                              fontWeight: isBest ? 700 : 400,
                              fontVariantNumeric: 'tabular-nums'
                            }}
                            title={v != null ? `${xCol.label} = ${x}, ${yCol.label} = ${y}: ${v.toFixed(2)} tok/s` : ''}
                          >
                            {v != null ? v.toFixed(1) : '—'}
                            {isBest && <span style={{ color: 'var(--success)', marginLeft: 4 }}>★</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
