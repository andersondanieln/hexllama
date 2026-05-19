import React, { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Gauge, Play, Loader2, AlertCircle } from 'lucide-react'

interface SweepParam { flag: string; label: string; placeholder: string }
const SWEEP_PARAMS: SweepParam[] = [
  { flag: '-t',    label: 'Threads',         placeholder: '4,6,8' },
  { flag: '-ngl',  label: 'GPU Layers',      placeholder: '99,30,0' },
  { flag: '-b',    label: 'Batch Size',      placeholder: '512,2048' },
  { flag: '-ub',   label: 'Micro-Batch',     placeholder: '256,512' },
  { flag: '-p',    label: 'Prompt Size',     placeholder: '128,512,1024' },
  { flag: '-n',    label: 'Gen Size',        placeholder: '32,128' },
  { flag: '-fa',   label: 'Flash Attn (0/1)', placeholder: '0,1' },
  { flag: '-ctk',  label: 'KV Cache K',      placeholder: 'f16,q8_0' },
  { flag: '-ctv',  label: 'KV Cache V',      placeholder: 'f16,q8_0' },
]

// Columns we know how to label and want to consider showing.
// Order here is the rendered column order (left -> right) when present.
const COLUMN_DEFS: { key: string; label: string; numeric?: boolean; alwaysShow?: boolean }[] = [
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

function deriveTest(row: Record<string, unknown>): string {
  const np = Number(row.n_prompt) || 0
  const ng = Number(row.n_gen) || 0
  if (np > 0 && ng === 0) return `pp${np}`
  if (np === 0 && ng > 0) return `tg${ng}`
  if (np > 0 && ng > 0) return `pp${np}+tg${ng}`
  return '—'
}

function formatTs(avg: unknown, sd: unknown): string {
  if (avg == null) return '—'
  const a = Number(avg)
  const s = Number(sd) || 0
  if (!Number.isFinite(a)) return String(avg)
  return `${a.toFixed(2)} ± ${s.toFixed(2)}`
}

function shortModelName(filename: unknown): string {
  if (typeof filename !== 'string') return '—'
  const base = filename.split(/[\\/]/).pop() || filename
  return base.replace(/\.(gguf|bin|ggml)$/i, '')
}

function enrichRows(raw: Record<string, unknown>[]) {
  return raw.map(r => ({
    ...r,
    test: deriveTest(r),
    ts_combined: formatTs(r.avg_ts, r.stddev_ts),
    model_filename: shortModelName(r.model_filename),
  }))
}

function activeColumns(rows: Record<string, unknown>[]) {
  return COLUMN_DEFS.filter(col => {
    if (col.alwaysShow) return true
    const vals = new Set(rows.map(r => r[col.key]))
    vals.delete(undefined)
    return vals.size > 1
  })
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v)
    if (Math.abs(v) >= 1000 || Number.isInteger(v)) return v.toLocaleString()
    return v.toFixed(2)
  }
  if (typeof v === 'boolean') return v ? '1' : '0'
  return String(v)
}

export default function BenchmarkView() {
  const { models, backends, activeBackend } = useStore()
  const [modelPath, setModelPath] = useState('')
  const [backendName, setBackendName] = useState(activeBackend?.name || '')
  const [reps, setReps] = useState<number>(3)
  const [params, setParams] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')

  const enriched = useMemo(() => enrichRows(rows), [rows])
  const columns = useMemo(() => activeColumns(enriched), [enriched])

  async function handleRun() {
    setError(''); setRows([])
    const backend = backends.find(b => b.name === backendName) || activeBackend
    if (!backend) { setError('No backend selected.'); return }
    if (!modelPath) { setError('Select a model.'); return }
    setRunning(true)
    try {
      const res = await window.api.benchRun({
        backendPath: backend.path,
        backendExe: backend.exe || undefined,
        modelPath,
        reps,
        params
      })
      if (res.success) setRows(res.rows || [])
      else setError(res.error || 'Run failed')
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Benchmark</h1>
          <p className="page-subtitle">
            Sweep <code>llama-bench</code> parameters and compare performance
          </p>
        </div>
      </div>

      {/* Setup */}
      <div className="form-row" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label">Model</label>
          <select
            className="form-select mono text-sm"
            value={modelPath}
            onChange={e => setModelPath(e.target.value)}
            disabled={running}
          >
            <option value="">-- Select a model --</option>
            {models.map(m => (
              <option key={m.path} value={m.path}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Backend</label>
          <select
            className="form-select"
            value={backendName}
            onChange={e => setBackendName(e.target.value)}
            disabled={running}
          >
            <option value="">{activeBackend ? `Default (${activeBackend.name})` : 'Default (Active)'}</option>
            {backends.map(b => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Repetitions</label>
          <input
            type="number"
            className="form-input"
            value={reps}
            onChange={e => setReps(Number(e.target.value))}
            min={1} max={20} step="any"
            disabled={running}
          />
        </div>
      </div>

      {/* Sweep params */}
      <div className="settings-section">
        <div className="settings-section-title"><Gauge size={14} /> Sweep Parameters</div>
        <p className="form-hint" style={{ padding: '0 16px 12px', fontSize: 12 }}>
          Comma-separated values produce a sweep (e.g. <code>4,6,8</code>). Leave empty to use the
          default. Ranges like <code>1024-4096+1024</code> are also supported.
        </p>
        <div className="cmd-grid">
          {SWEEP_PARAMS.map(p => {
            const v = params[p.flag] || ''
            const isActive = v.trim().length > 0
            return (
              <div key={p.flag} className={`cmd-row ${isActive ? 'active-param' : ''}`}>
                <div className="cmd-label-group">
                  <div className="cmd-label">{p.label}</div>
                  <div className="cmd-arg">{p.flag}</div>
                </div>
                <div className="cmd-input-group">
                  <input
                    type="text"
                    className="cmd-input"
                    placeholder={p.placeholder}
                    value={v}
                    onChange={e => setParams({ ...params, [p.flag]: e.target.value })}
                    disabled={running}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={running || !modelPath}
        >
          {running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
          {running ? 'Running benchmark…' : 'Run Benchmark'}
        </button>
      </div>

      {running && (
        <div
          style={{
            position: 'sticky',
            bottom: 16,
            zIndex: 999,
            marginTop: 16,
            padding: '12px 16px',
            background: 'var(--surface)',
            border: '1.5px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          <Loader2 size={16} className="spin" style={{ flexShrink: 0, color: 'var(--accent)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2, fontSize: 13 }}>
              {progressLine || 'Loading model…'}
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-secondary)' }}>
              {Math.floor(elapsed / 60)}m {String(elapsed % 60).padStart(2, '0')}s elapsed
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="hub-error" style={{ marginTop: 16 }}>
          <AlertCircle size={14} /> <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</span>
        </div>
      )}

      {enriched.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="settings-section-title" style={{ marginBottom: 12 }}>
            <Gauge size={14} /> Results ({enriched.length} row{enriched.length === 1 ? '' : 's'})
          </div>
          <div style={{
            overflowX: 'auto',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1.5px solid var(--border)' }}>
                  {columns.map(col => (
                    <th key={col.key} style={{
                      padding: '10px 14px',
                      textAlign: col.numeric ? 'right' : 'left',
                      fontWeight: 600,
                      fontSize: 11,
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      position: 'sticky', top: 0, background: 'var(--bg)'
                    }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: i === enriched.length - 1 ? 'none' : '1px solid var(--border)',
                      background: i % 2 === 1 ? 'var(--bg)' : undefined
                    }}
                  >
                    {columns.map(col => {
                      const isTs = col.key === 'ts_combined'
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
                            fontVariantNumeric: 'tabular-nums'
                          }}
                        >
                          {col.key === 'test' || col.key === 'ts_combined' || col.key === 'model_filename'
                            ? String(r[col.key] ?? '—')
                            : formatCell(r[col.key])}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
