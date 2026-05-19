import React, { useMemo, useState } from 'react'
import { Trophy, Copy, Check } from 'lucide-react'
import { enrichRows } from './BenchmarkResultsTable'

// llama-bench column → CLI flag for llama-server / llama-cli. Keep this in sync
// with COLUMN_DEFS — only flags the user can meaningfully pass downstream.
const RECOMMEND_PARAMS: { key: string; flag: string }[] = [
  { key: 'n_threads',    flag: '-t' },
  { key: 'n_gpu_layers', flag: '-ngl' },
  { key: 'n_batch',      flag: '-b' },
  { key: 'n_ubatch',     flag: '-ub' },
  { key: 'flash_attn',   flag: '-fa' },
  { key: 'type_k',       flag: '-ctk' },
  { key: 'type_v',       flag: '-ctv' },
]

export default function RecommendedSettings({ rows }: { rows: Record<string, unknown>[] }) {
  const enriched = useMemo(() => enrichRows(rows), [rows])
  const [copied, setCopied] = useState<string | null>(null)

  // Best row per test (pp512, tg128, etc.) by avg_ts.
  const bestPerTest = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>()
    for (const r of enriched) {
      const test = String(r.test || '')
      const ts = Number(r.avg_ts)
      if (!Number.isFinite(ts) || !test) continue
      const cur = m.get(test)
      if (!cur || Number(cur.avg_ts) < ts) m.set(test, r)
    }
    return m
  }, [enriched])

  // Only show params that actually varied across the sweep — others are llama-bench
  // defaults the user didn't choose and don't need to copy.
  const sweptParams = useMemo(() => {
    return RECOMMEND_PARAMS.filter(p => {
      const vals = new Set(enriched.map(r => String(r[p.key])))
      vals.delete('undefined')
      return vals.size > 1
    })
  }, [enriched])

  if (bestPerTest.size === 0 || sweptParams.length === 0) return null

  function flagString(row: Record<string, unknown>): string {
    return sweptParams.map(p => `${p.flag} ${row[p.key]}`).join(' ')
  }

  async function copy(test: string, str: string) {
    await navigator.clipboard.writeText(str)
    setCopied(test)
    setTimeout(() => setCopied(null), 1500)
  }

  const cards = Array.from(bestPerTest.entries())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, color: 'var(--text-muted)',
        letterSpacing: '0.4px', textTransform: 'uppercase', fontWeight: 600
      }}>
        <Trophy size={13} /> Recommended Settings
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(cards.length, 2)}, minmax(0, 1fr))`,
        gap: 12
      }}>
        {cards.map(([test, row]) => {
          const flags = flagString(row)
          return (
            <div
              key={test}
              style={{
                padding: '12px 14px',
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  Best for <span style={{ fontFamily: "'SF Mono','Fira Code',monospace" }}>{test}</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                    {Number(row.avg_ts).toFixed(2)} tok/s
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => copy(test, flags)}
                  title="Copy as CLI flags"
                  style={{ padding: 6 }}
                >
                  {copied === test ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: 12,
                rowGap: 3,
                fontSize: 12,
                fontFamily: "'SF Mono','Fira Code',monospace",
                marginBottom: 10
              }}>
                {sweptParams.map(p => (
                  <React.Fragment key={p.key}>
                    <div style={{ color: 'var(--text-muted)' }}>{p.flag}</div>
                    <div style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{String(row[p.key])}</div>
                  </React.Fragment>
                ))}
              </div>
              <div style={{
                padding: '6px 10px',
                background: 'var(--bg)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "'SF Mono','Fira Code',monospace",
                color: 'var(--text-secondary)',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                wordBreak: 'break-all'
              } as React.CSSProperties}>
                {flags}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
