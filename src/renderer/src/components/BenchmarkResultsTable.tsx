import React, { useMemo } from 'react'

export interface ColumnDef {
  key: string
  label: string
  numeric?: boolean
  alwaysShow?: boolean
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'test',          label: 'Test',                                       alwaysShow: true },
  { key: 'n_threads',     label: 'Threads',     numeric: true },
  { key: 'n_gpu_layers',  label: 'GPU Layers',  numeric: true },
  { key: 'n_batch',       label: 'Batch',       numeric: true },
  { key: 'n_ubatch',      label: 'µ-Batch',     numeric: true },
  { key: 'n_depth',       label: 'Depth',       numeric: true },
  { key: 'flash_attn',    label: 'FA',          numeric: true },
  { key: 'type_k',        label: 'KV K' },
  { key: 'type_v',        label: 'KV V' },
  { key: 'split_mode',    label: 'Split' },
  { key: 'main_gpu',      label: 'Main GPU',    numeric: true },
  { key: 'model_filename', label: 'Model' },
  { key: 'ts_combined',   label: 'tok/s',       numeric: true, alwaysShow: true },
]

export function deriveTest(row: Record<string, unknown>): string {
  const np = Number(row.n_prompt) || 0
  const ng = Number(row.n_gen) || 0
  if (np > 0 && ng === 0) return `pp${np}`
  if (np === 0 && ng > 0) return `tg${ng}`
  if (np > 0 && ng > 0) return `pp${np}+tg${ng}`
  return '—'
}

export function formatTs(avg: unknown, sd: unknown): string {
  if (avg == null) return '—'
  const a = Number(avg)
  const s = Number(sd) || 0
  if (!Number.isFinite(a)) return String(avg)
  return `${a.toFixed(2)} ± ${s.toFixed(2)}`
}

export function shortModelName(filename: unknown): string {
  if (typeof filename !== 'string') return '—'
  const base = filename.split(/[\\/]/).pop() || filename
  return base.replace(/\.(gguf|bin|ggml)$/i, '')
}

export function enrichRows(raw: Record<string, unknown>[]): Record<string, unknown>[] {
  return raw.map(r => ({
    ...r,
    test: deriveTest(r),
    ts_combined: formatTs(r.avg_ts, r.stddev_ts),
    model_filename: shortModelName(r.model_filename),
  }))
}

export function activeColumns(rows: Record<string, unknown>[]): ColumnDef[] {
  return COLUMN_DEFS.filter(col => {
    if (col.alwaysShow) return true
    const vals = new Set(rows.map(r => r[col.key]))
    vals.delete(undefined)
    return vals.size > 1
  })
}

export function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v)
    if (Math.abs(v) >= 1000 || Number.isInteger(v)) return v.toLocaleString()
    return v.toFixed(2)
  }
  if (typeof v === 'boolean') return v ? '1' : '0'
  return String(v)
}

export function rowsToMarkdown(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '# Benchmark Results\n\n_No data._\n'
  const enriched = enrichRows(rows)
  const cols = activeColumns(enriched)
  const lines: string[] = []
  lines.push('# Benchmark Results')
  lines.push('')
  lines.push(`Generated ${new Date().toISOString()} — ${rows.length} row${rows.length === 1 ? '' : 's'}`)
  lines.push('')
  lines.push('| ' + cols.map(c => c.label).join(' | ') + ' |')
  lines.push('| ' + cols.map(c => c.numeric ? '---:' : '---').join(' | ') + ' |')
  for (const r of enriched) {
    const cells = cols.map(c => {
      const v = r[c.key]
      if (c.key === 'test' || c.key === 'ts_combined' || c.key === 'model_filename') return String(v ?? '—')
      return formatCell(v).replace(/\|/g, '\\|')
    })
    lines.push('| ' + cells.join(' | ') + ' |')
  }
  return lines.join('\n') + '\n'
}

export default function BenchmarkResultsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const enriched = useMemo(() => enrichRows(rows), [rows])
  const columns = useMemo(() => activeColumns(enriched), [enriched])
  const bestByTest = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of enriched) {
      const test = String(r.test || '')
      const ts = Number(r.avg_ts)
      if (!Number.isFinite(ts)) continue
      const cur = m.get(test)
      if (cur === undefined || ts > cur) m.set(test, ts)
    }
    return m
  }, [enriched])

  if (!enriched.length) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
        No results to display.
      </div>
    )
  }

  return (
    <div
      style={{
        overflowX: 'auto',
        border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow)'
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--border)' }}>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  padding: '10px 14px',
                  textAlign: col.numeric ? 'right' : 'left',
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  position: 'sticky', top: 0, background: 'var(--bg)'
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {enriched.map((r, i) => {
            const isBest = bestByTest.get(String(r.test)) === Number(r.avg_ts)
            const bestBg = 'rgba(22,163,74,0.18)'
            return (
              <tr
                key={i}
                style={{
                  borderBottom: i === enriched.length - 1 ? 'none' : '1px solid var(--border)'
                }}
              >
                {columns.map((col, ci) => {
                  const isTs = col.key === 'ts_combined'
                  const isFirst = ci === 0
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '8px 14px',
                        whiteSpace: 'nowrap',
                        textAlign: col.numeric ? 'right' : 'left',
                        fontFamily: col.numeric ? "'SF Mono','Fira Code',monospace" : undefined,
                        fontWeight: isTs ? 600 : 400,
                        color: isTs ? 'var(--text)' : 'var(--text-secondary)',
                        fontVariantNumeric: 'tabular-nums',
                        background: isBest
                          ? bestBg
                          : (i % 2 === 1 ? 'var(--bg)' : undefined),
                        borderLeft: isBest && isFirst ? '4px solid var(--success)' : undefined,
                        paddingLeft: isBest && isFirst ? '10px' : '14px'
                      }}
                    >
                      {col.key === 'test' || col.key === 'ts_combined' || col.key === 'model_filename'
                        ? (isTs && isBest
                            ? <><span style={{ color: 'var(--success)', fontWeight: 700, marginRight: 6 }}>★ BEST</span>{String(r[col.key] ?? '—')}</>
                            : String(r[col.key] ?? '—'))
                        : formatCell(r[col.key])}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
