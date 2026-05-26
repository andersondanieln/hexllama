import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Gauge, Play, Loader2, AlertCircle, ExternalLink, Copy, Check, ChevronDown } from 'lucide-react'
import RecommendedSettings from './RecommendedSettings'

interface SweepParam {
  flag: string
  label: string
  placeholder: string
  defaultValue: string
  validValues: string  // shown after the flag so users know what they can type
  choices?: string[]   // common values shown in the pick-menu next to the input
}
// `defaultValue` is what llama-bench uses when the flag isn't passed (per its --help).
// `validValues` is a short description of the allowed input range or enumeration.
// `choices` populates a checkbox dropdown next to the input -- ticking values
// rebuilds the comma list automatically so users don't have to type quant names etc.
const KV_TYPES = ['f16', 'f32', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1']
const QUANT_KV = new Set(['q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1'])

// Smart split-and-merge: if a sweep mixes fa=0 with quantized KV types, llama-bench
// will fail mid-run. Split into the minimum number of valid sub-sweeps that each
// run as a single llama-bench invocation.
function splitSweep(params: Record<string, string>): { subs: Record<string, string>[]; skipped: number; faAutoset: boolean } {
  const sweep = (s: string) => s.split(',').map(t => t.trim()).filter(Boolean)
  const faVals = sweep(params['-fa'] || '')
  const ctkVals = sweep(params['-ctk'] || '')
  const ctvVals = sweep(params['-ctv'] || '')
  const hasQuantKV = [...ctkVals, ...ctvVals].some(v => QUANT_KV.has(v))
  const hasFaZero = faVals.includes('0')
  const hasFaOne = faVals.includes('1')

  // User left -fa empty but selected quant KV. llama-bench defaults to fa=0 and
  // fails context init — auto-set -fa 1 since that's the only value that works.
  if (hasQuantKV && faVals.length === 0) {
    return { subs: [{ ...params, '-fa': '1' }], skipped: 0, faAutoset: true }
  }

  // No constraint conflict — pass the user's sweep through unchanged.
  if (!hasQuantKV || !hasFaZero) return { subs: [params], skipped: 0, faAutoset: false }

  // Need to split. fa=0 must only see non-quant ctk/ctv; fa=1 sees everything.
  const nonQuantCtk = ctkVals.filter(v => !QUANT_KV.has(v))
  const nonQuantCtv = ctvVals.filter(v => !QUANT_KV.has(v))
  const total = Math.max(1, faVals.length) * Math.max(1, ctkVals.length) * Math.max(1, ctvVals.length)

  const subs: Record<string, string>[] = []

  // fa=0 branch — only emit if there's at least one valid (non-quant ctk, non-quant ctv) pair
  if (nonQuantCtk.length > 0 && nonQuantCtv.length > 0) {
    subs.push({ ...params, '-fa': '0', '-ctk': nonQuantCtk.join(','), '-ctv': nonQuantCtv.join(',') })
  }
  // fa=1 branch — keep ctk/ctv as the user typed
  if (hasFaOne) {
    subs.push({ ...params, '-fa': '1' })
  }

  // Count how many cartesian combos got dropped so we can tell the user.
  const validFaZero = nonQuantCtk.length * nonQuantCtv.length * (hasFaZero ? 1 : 0)
  const validFaOne = ctkVals.length * ctvVals.length * (hasFaOne ? 1 : 0)
  const otherDimsMul = sweepCombos(params, ['-fa', '-ctk', '-ctv'])
  const valid = (validFaZero + validFaOne) * otherDimsMul
  const allCombos = total * otherDimsMul
  return { subs: subs.length ? subs : [params], skipped: Math.max(0, allCombos - valid), faAutoset: false }
}

// Multiply the value-count of every swept flag except those listed in `exclude`.
function sweepCombos(params: Record<string, string>, exclude: string[]): number {
  let n = 1
  for (const [k, v] of Object.entries(params)) {
    if (exclude.includes(k)) continue
    const count = v.split(',').map(t => t.trim()).filter(Boolean).length
    if (count > 0) n *= count
  }
  return n
}

function describeSub(sub: Record<string, string>): string {
  return SWEEP_PARAMS
    .map(p => {
      const v = (sub[p.flag] || '').trim()
      return v ? `${p.flag} { ${v} }` : null
    })
    .filter(Boolean)
    .join(' · ')
}
// Curated starting points. Each preset answers a specific tuning question without
// blowing the run-time budget — single-axis where possible. Clicking replaces the
// current params (it does NOT merge), so the user always sees exactly what runs.
interface SweepPreset {
  id: string
  label: string
  question: string  // shown on hover; what the sweep is trying to answer
  runs: number      // estimated run count (ignoring auto-split — that's transparent)
  params: Record<string, string>
}
const SWEEP_PRESETS: SweepPreset[] = [
  {
    id: 'flash-attn',
    label: 'Flash Attention',
    question: 'Does Flash Attention help on your hardware?',
    runs: 2,
    params: { '-fa': '0,1' }
  },
  {
    id: 'gpu-offload',
    label: 'GPU Offload',
    question: 'How many layers to offload to the GPU for the best speed/memory trade?',
    runs: 4,
    params: { '-ngl': '0,32,64,99' }
  },
  {
    id: 'batch-tune',
    label: 'Batch Tuning',
    question: 'Which batch + micro-batch combo maximizes prompt-processing throughput?',
    runs: 6,
    params: { '-b': '1024,2048,4096', '-ub': '256,512' }
  },
  {
    id: 'kv-quant',
    label: 'KV Quantization',
    question: 'How much memory can KV cache quantization save, at what speed cost?',
    runs: 9,
    params: { '-fa': '1', '-ctk': 'f16,q8_0,q4_0', '-ctv': 'f16,q8_0,q4_0' }
  },
  {
    id: 'threads',
    label: 'Thread Count',
    question: 'How does CPU thread count affect throughput on this model?',
    runs: 5,
    params: { '-t': '4,6,8,10,12' }
  }
]
function splitVals(s: string): string[] {
  return s.split(',').map(t => t.trim()).filter(Boolean)
}
// A preset is "active" when every value it specifies appears in the current sweep.
// This is a subset check (not equality), so multiple presets stack naturally:
// selecting Flash Attn + KV Quantization both stay highlighted.
function presetMatches(preset: SweepPreset, current: Record<string, string>): boolean {
  for (const [flag, val] of Object.entries(preset.params)) {
    const want = new Set(splitVals(val))
    const have = new Set(splitVals(current[flag] || ''))
    for (const v of want) if (!have.has(v)) return false
  }
  return true
}
function applyPreset(preset: SweepPreset, current: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = { ...current }
  for (const [flag, val] of Object.entries(preset.params)) {
    const have = splitVals(next[flag] || '')
    const merged = [...have]
    for (const v of splitVals(val)) if (!merged.includes(v)) merged.push(v)
    next[flag] = merged.join(',')
  }
  return next
}
function removePreset(preset: SweepPreset, current: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = { ...current }
  for (const [flag, val] of Object.entries(preset.params)) {
    const remove = new Set(splitVals(val))
    const kept = splitVals(next[flag] || '').filter(v => !remove.has(v))
    if (kept.length === 0) delete next[flag]
    else next[flag] = kept.join(',')
  }
  return next
}

const SWEEP_PARAMS: SweepParam[] = [
  { flag: '-t',    label: 'Threads',     placeholder: 'e.g. 4,6,8',    defaultValue: '8',    validValues: '1..256',                                                                                  choices: ['2', '4', '6', '8', '10', '12'] },
  { flag: '-ngl',  label: 'GPU Layers',  placeholder: 'e.g. 99,30,0',  defaultValue: '99',   validValues: '0..99 (all)',                                                                              choices: ['0', '16', '32', '64', '99'] },
  { flag: '-b',    label: 'Batch Size',  placeholder: 'e.g. 512,2048', defaultValue: '2048', validValues: '1..65536',                                                                                 choices: ['128', '256', '512', '1024', '2048', '4096'] },
  { flag: '-ub',   label: 'Micro-Batch', placeholder: 'e.g. 256,512',  defaultValue: '512',  validValues: '1..65536, ≤ batch',                                                                        choices: ['64', '128', '256', '512', '1024'] },
  { flag: '-p',    label: 'Prompt Size', placeholder: 'e.g. 128,1024', defaultValue: '512',  validValues: '≥ 0',                                                                                     choices: ['0', '128', '256', '512', '1024', '2048', '4096'] },
  { flag: '-n',    label: 'Gen Size',    placeholder: 'e.g. 32,64',    defaultValue: '128',  validValues: '≥ 0',                                                                                     choices: ['0', '32', '64', '128', '256', '512'] },
  { flag: '-fa',   label: 'Flash Attn',  placeholder: 'e.g. 0,1',      defaultValue: '0',    validValues: '0 | 1 — required = 1 for any non-f16/f32/bf16 KV cache type',                              choices: ['0', '1'] },
  { flag: '-ctk',  label: 'KV Cache K',  placeholder: 'e.g. f16,q8_0', defaultValue: 'f16',  validValues: 'f16 | f32 | bf16 — and (with -fa 1) q8_0 | q4_0 | q4_1 | iq4_nl | q5_0 | q5_1',             choices: KV_TYPES },
  { flag: '-ctv',  label: 'KV Cache V',  placeholder: 'e.g. f16,q8_0', defaultValue: 'f16',  validValues: 'f16 | f32 | bf16 — and (with -fa 1) q8_0 | q4_0 | q4_1 | iq4_nl | q5_0 | q5_1',             choices: KV_TYPES },
]

function PresetButton({ preset, active, disabled, onClick }: {
  preset: SweepPreset
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
      >
        {preset.label}
        <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{preset.runs}×</span>
      </button>
      {hover && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width: 280,
            padding: '10px 12px',
            background: 'var(--surface)',
            border: '1.5px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--text)',
            pointerEvents: 'none'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{preset.question}</div>
          <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>
            Adds <span className="mono" style={{ fontFamily: "'SF Mono','Fira Code',monospace" }}>~{preset.runs} runs</span>
            {' '}per test. Click again to remove. Combine with other presets — overlapping values merge.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(preset.params).map(([flag, val]) => (
              <div key={flag} style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 11 }}>
                <span style={{ color: 'var(--accent)' }}>{flag}</span>
                <span style={{ color: 'var(--text-muted)' }}> = </span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MultiChoiceMenu({ choices, value, onChange, disabled }: {
  choices: string[]
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = new Set(value.split(',').map(s => s.trim()).filter(Boolean))
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  function toggle(v: string) {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange(choices.filter(c => next.has(c)).join(','))
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        title="Pick common values"
        style={{ padding: 4 }}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          minWidth: 140,
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-md)',
          zIndex: 50,
          padding: 4
        }}>
          {choices.map(c => (
            <label
              key={c}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: 12,
                borderRadius: 4,
                userSelect: 'none'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <input
                type="checkbox"
                checked={selected.has(c)}
                onChange={() => toggle(c)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontFamily: "'SF Mono','Fira Code',monospace" }}>{c}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
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
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [errorCopied, setErrorCopied] = useState(false)
  const [subSweepIdx, setSubSweepIdx] = useState(0)
  const [subSweepTotal, setSubSweepTotal] = useState(0)
  const startedAt = useRef<number>(0)

  // Live split plan — shown above the Run button so the user can see what'll happen.
  const plan = (() => {
    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(params)) {
      const c = v.split(',').map(s => s.trim()).filter(Boolean).join(',')
      if (c) cleaned[k] = c
    }
    return splitSweep(cleaned)
  })()
  const willSplit = plan.subs.length > 1 || plan.skipped > 0 || plan.faAutoset

  useEffect(() => {
    if (typeof window.api.onBenchProgress !== 'function') return
    window.api.onBenchProgress(({ line }) => {
      setProgressLines(prev => {
        // keep the last 12 lines so we have context for the failure
        const next = [...prev, line]
        return next.length > 12 ? next.slice(next.length - 12) : next
      })
    })
    return () => window.api.removeBenchProgressListener?.()
  }, [])

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [running])

  // splitSweep now auto-fixes the empty-fa + quant-KV case, so this warning is
  // unreachable in normal usage — kept as a safety net for future edits.
  const kvFaWarning: string | null = null

  async function handleRun() {
    setError(''); setRows([]); setProgressLines([]); setSubSweepIdx(0); setSubSweepTotal(0)
    const backend = backends.find(b => b.name === backendName) || activeBackend
    if (!backend) { setError('No backend selected.'); return }
    if (!modelPath) { setError('Select a model.'); return }

    const { subs } = plan
    setSubSweepTotal(subs.length)
    setRunning(true)
    const merged: Record<string, unknown>[] = []
    try {
      for (let i = 0; i < subs.length; i++) {
        setSubSweepIdx(i + 1)
        if (subs.length > 1) {
          setProgressLines(prev => [...prev, `── sub-sweep ${i + 1}/${subs.length}: ${describeSub(subs[i])} ──`])
        }
        const res = await window.api.benchRun({
          backendPath: backend.path,
          backendExe: backend.exe || undefined,
          modelPath,
          reps,
          params: subs[i]
        })
        if (res.success) {
          merged.push(...(res.rows || []))
        } else {
          setError(res.error || 'Run failed')
          break
        }
      }
      setRows(merged)
    } catch (e) {
      setError(String(e))
    } finally {
      setRunning(false)
      // Intentionally keep subSweepIdx/Total so the error banner can show which sub-sweep failed.
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
        <div style={{ padding: '0 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginRight: 4 }}>
            Presets:
          </span>
          {SWEEP_PRESETS.map(preset => {
            const active = presetMatches(preset, params)
            return (
              <PresetButton
                key={preset.id}
                preset={preset}
                active={active}
                disabled={running}
                onClick={() =>
                  setParams(active ? removePreset(preset, params) : applyPreset(preset, params))
                }
              />
            )
          })}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setParams({})}
            disabled={running || Object.values(params).every(v => !v.trim())}
            title="Clear all sweep parameters"
            style={{ marginLeft: 'auto' }}
          >
            Clear
          </button>
        </div>
        <p className="form-hint" style={{ padding: '0 16px 12px', fontSize: 12 }}>
          Click presets to stack them (re-click to remove). Comma-separated values in a field
          produce a sweep (e.g. <code>4,6,8</code>). Leave a field empty to use llama-bench's
          single-value default (shown next to each label). Ranges like <code>1024-4096+1024</code>
          are also supported.
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
                  <div className="cmd-arg">
                    {p.flag}
                    <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 400 }}>
                      ({p.validValues})
                    </span>
                  </div>
                </div>
                <div className="cmd-input-group" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="text"
                    className="cmd-input"
                    placeholder={p.placeholder}
                    value={v}
                    onChange={e => setParams({ ...params, [p.flag]: e.target.value })}
                    disabled={running}
                    style={{ flex: 1 }}
                  />
                  {p.choices && (
                    <MultiChoiceMenu
                      choices={p.choices}
                      value={v}
                      onChange={next => setParams({ ...params, [p.flag]: next })}
                      disabled={running}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {kvFaWarning && (
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'rgba(217,119,6,0.08)',
            border: '1.5px solid rgba(217,119,6,0.35)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--warning)',
            fontSize: 12,
            lineHeight: 1.5
          }}
        >
          ⚠ {kvFaWarning}
        </div>
      )}

      {willSplit && !running && (
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'rgba(59,130,246,0.06)',
            border: '1.5px solid rgba(59,130,246,0.35)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            fontSize: 12,
            lineHeight: 1.5
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {plan.faAutoset
              ? 'Auto-set -fa 1 (quantized KV requires Flash Attn)'
              : `Auto-split into ${plan.subs.length} sub-sweep${plan.subs.length === 1 ? '' : 's'}`}
            {plan.skipped > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                {' '}· skipping {plan.skipped} invalid combo{plan.skipped === 1 ? '' : 's'} (fa=0 + quantized KV)
              </span>
            )}
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--text-secondary)' }}>
            {plan.subs.map((s, i) => (
              <li key={i} style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 11 }}>
                {describeSub(s)}
              </li>
            ))}
          </ul>
          {plan.subs.length > 1 && (
            <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 11 }}>
              Model will reload once per sub-sweep, then results merge into a single table.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={running || !modelPath}
          title={!modelPath ? 'Select a model first' : (running ? 'Benchmark in progress' : '')}
        >
          {running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
          {running ? 'Running benchmark…' : 'Run Benchmark'}
        </button>
        {!running && !modelPath && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Select a model above to enable.
          </span>
        )}
      </div>

      {running && (() => {
        // Show *what's currently running* — that's the active sub-sweep, not
        // the user's original input (which may have invalid combos that the
        // splitter filtered out).
        const activeSub = subSweepTotal > 0 && subSweepIdx > 0
          ? plan.subs[Math.min(subSweepIdx - 1, plan.subs.length - 1)]
          : params
        const sweepSummary = describeSub(activeSub)
        const latest = progressLines[progressLines.length - 1] || 'Loading model…'
        const recent = progressLines.slice(-4)
        return (
          <div
            style={{
              position: 'sticky',
              bottom: 16,
              zIndex: 999,
              marginTop: 16,
              padding: '12px 14px',
              background: 'var(--surface)',
              border: '1.5px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Loader2 size={16} className="spin" style={{ flexShrink: 0, color: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {latest}
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {subSweepTotal > 1 && (
                    <span style={{ color: 'var(--accent)', fontWeight: 600, marginRight: 8 }}>
                      Sub-sweep {subSweepIdx}/{subSweepTotal}
                    </span>
                  )}
                  {Math.floor(elapsed / 60)}m {String(elapsed % 60).padStart(2, '0')}s elapsed
                </div>
              </div>
            </div>
            {sweepSummary && (
              <div style={{
                marginTop: 6,
                padding: '6px 10px',
                background: 'var(--bg)',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: "'SF Mono','Fira Code',monospace",
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Sweep:</span> {sweepSummary}
              </div>
            )}
            {recent.length > 1 && (
              <div style={{
                marginTop: 8,
                padding: '6px 10px',
                background: 'var(--bg)',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: "'SF Mono','Fira Code',monospace",
                maxHeight: 90,
                overflow: 'auto',
                userSelect: 'text',
                WebkitUserSelect: 'text'
              } as React.CSSProperties}>
                {recent.map((l, i) => (
                  <div key={i} style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    opacity: i === recent.length - 1 ? 1 : 0.55
                  }}>
                    {l}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {error && (() => {
        const failedSub = subSweepTotal > 0 && subSweepIdx > 0
          ? plan.subs[Math.min(subSweepIdx - 1, plan.subs.length - 1)]
          : params
        const sweepSummary = describeSub(failedSub)
        const subLabel = subSweepTotal > 1 ? ` (sub-sweep ${subSweepIdx}/${subSweepTotal})` : ''
        const lastFew = progressLines.slice(-6)
        const fullCopy =
          (sweepSummary ? `Sweep at failure${subLabel}: ${sweepSummary}\n\n` : '') +
          (lastFew.length ? `Last lines before failure:\n${lastFew.join('\n')}\n\n` : '') +
          error
        return (
          <div
            className="hub-error"
            style={{
              marginTop: 16,
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              flexDirection: 'column'
            } as React.CSSProperties}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <pre
                style={{
                  flex: 1,
                  margin: 0,
                  fontFamily: "'SF Mono','Fira Code',monospace",
                  fontSize: 12,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  cursor: 'text'
                } as React.CSSProperties}
              >
                {error}
              </pre>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => {
                  navigator.clipboard.writeText(fullCopy)
                  setErrorCopied(true)
                  setTimeout(() => setErrorCopied(false), 1500)
                }}
                title="Copy error + sweep + recent log"
                style={{ flexShrink: 0, padding: 6 }}
              >
                {errorCopied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            {sweepSummary && (
              <div style={{
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.04)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "'SF Mono','Fira Code',monospace",
                color: 'var(--text)',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              } as React.CSSProperties}>
                <span style={{ opacity: 0.6 }}>Sweep at time of failure{subLabel}:</span> {sweepSummary}
              </div>
            )}
            {lastFew.length > 0 && (
              <div style={{
                width: '100%',
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.04)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "'SF Mono','Fira Code',monospace",
                color: 'var(--text-secondary)',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                maxHeight: 140,
                overflow: 'auto'
              } as React.CSSProperties}>
                <div style={{ opacity: 0.6, marginBottom: 4 }}>Last {lastFew.length} llama-bench lines:</div>
                {lastFew.map((l, i) => <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>)}
              </div>
            )}
          </div>
        )
      })()}

      {rows.length > 0 && (() => {
        const backend = backends.find(b => b.name === backendName) || activeBackend
        const ctx = backend && modelPath
          ? { backendPath: backend.path, backendExe: backend.exe || undefined, modelPath }
          : undefined
        return (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <RecommendedSettings rows={rows} context={ctx} />
            <div
              style={{
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
                onClick={() => window.api.benchShowResults(rows, ctx)}
              >
                <ExternalLink size={14} /> Open Results Window
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
