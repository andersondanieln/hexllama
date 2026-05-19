import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Gauge, Play, Loader2, AlertCircle, ExternalLink } from 'lucide-react'

interface SweepParam { flag: string; label: string; placeholder: string; defaultValue: string }
// `defaultValue` is what llama-bench uses when the flag isn't passed (per its --help).
// Shown next to the label so users know exactly what an empty input means.
const SWEEP_PARAMS: SweepParam[] = [
  { flag: '-t',    label: 'Threads',         placeholder: 'e.g. 4,6,8',    defaultValue: '8' },
  { flag: '-ngl',  label: 'GPU Layers',      placeholder: 'e.g. 99,30,0',  defaultValue: '99' },
  { flag: '-b',    label: 'Batch Size',      placeholder: 'e.g. 512,2048', defaultValue: '2048' },
  { flag: '-ub',   label: 'Micro-Batch',     placeholder: 'e.g. 256,512',  defaultValue: '512' },
  { flag: '-p',    label: 'Prompt Size',     placeholder: 'e.g. 128,1024', defaultValue: '512' },
  { flag: '-n',    label: 'Gen Size',        placeholder: 'e.g. 32,64',    defaultValue: '128' },
  { flag: '-fa',   label: 'Flash Attn',      placeholder: 'e.g. 0,1',      defaultValue: '0' },
  { flag: '-ctk',  label: 'KV Cache K',      placeholder: 'e.g. f16,q8_0', defaultValue: 'f16' },
  { flag: '-ctv',  label: 'KV Cache V',      placeholder: 'e.g. f16,q8_0', defaultValue: 'f16' },
]

export default function BenchmarkView() {
  const { models, backends, activeBackend } = useStore()
  const [modelPath, setModelPath] = useState('')
  const [backendName, setBackendName] = useState(activeBackend?.name || '')
  const [reps, setReps] = useState<number>(3)
  const [params, setParams] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState('')
  const [progressLine, setProgressLine] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef<number>(0)

  useEffect(() => {
    if (typeof window.api.onBenchProgress !== 'function') return
    window.api.onBenchProgress(({ line }) => setProgressLine(line))
    return () => window.api.removeBenchProgressListener?.()
  }, [])

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [running])

  async function handleRun() {
    setError(''); setRows([]); setProgressLine('')
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
          Comma-separated values produce a sweep (e.g. <code>4,6,8</code>). Leave a field empty to
          use llama-bench's single-value default (shown next to each label). Ranges like
          <code>1024-4096+1024</code> are also supported.
        </p>
        <div className="cmd-grid">
          {SWEEP_PARAMS.map(p => {
            const v = params[p.flag] || ''
            const isActive = v.trim().length > 0
            return (
              <div key={p.flag} className={`cmd-row ${isActive ? 'active-param' : ''}`}>
                <div className="cmd-label-group">
                  <div className="cmd-label">
                    {p.label}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>
                      default: <span className="mono">{p.defaultValue}</span>
                    </span>
                  </div>
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

      {rows.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: '16px 18px',
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {rows.length} result{rows.length === 1 ? '' : 's'} ready
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Open the results window to view the table and export to Markdown or PDF.
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => window.api.benchShowResults(rows)}
          >
            <ExternalLink size={14} /> Open Results Window
          </button>
        </div>
      )}
    </div>
  )
}
