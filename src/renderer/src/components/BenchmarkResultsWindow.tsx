import React, { useEffect, useState } from 'react'
import { Loader2, FileText, Printer, Check } from 'lucide-react'
import BenchmarkResultsTable, { rowsToMarkdown } from './BenchmarkResultsTable'
import BenchmarkResultsChart from './BenchmarkResultsChart'
import RecommendedSettings from './RecommendedSettings'

const IS_MACOS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export default function BenchmarkResultsWindow() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [context, setContext] = useState<{ backendPath: string; backendExe?: string; modelPath: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'md' | 'pdf' | null>(null)
  const [savedTo, setSavedTo] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getLatestBenchResults().then(payload => {
      setRows(payload?.rows || [])
      setContext(payload?.context || null)
      setLoading(false)
    }).catch(e => {
      setError(String(e))
      setLoading(false)
    })
  }, [])

  async function handleExportMarkdown() {
    setExporting('md'); setError(''); setSavedTo(null)
    try {
      const md = rowsToMarkdown(rows)
      const res = await window.api.benchExportMarkdown(md)
      if (res.success) setSavedTo(res.path || 'saved')
      else if (!res.canceled) setError(res.error || 'Export failed')
    } finally { setExporting(null) }
  }

  async function handleExportPdf() {
    setExporting('pdf'); setError(''); setSavedTo(null)
    try {
      const res = await window.api.benchExportPdf()
      if (res.success) setSavedTo(res.path || 'saved')
      else if (!res.canceled) setError(res.error || 'Export failed')
    } finally { setExporting(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg)' }}>
      <div
        style={{
          height: 48,
          WebkitAppRegion: 'drag',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: IS_MACOS ? 80 : 16,
          paddingRight: 16,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)'
        } as React.CSSProperties}
      >
        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>
          Benchmark Results {rows.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {rows.length} row{rows.length === 1 ? '' : 's'}</span>}
        </div>
        <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', gap: 8 } as React.CSSProperties}>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 12px', fontSize: 13 }}
            onClick={handleExportMarkdown}
            disabled={loading || !rows.length || !!exporting}
          >
            {exporting === 'md' ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
            Export Markdown
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: '4px 12px', fontSize: 13 }}
            onClick={handleExportPdf}
            disabled={loading || !rows.length || !!exporting}
          >
            {exporting === 'pdf' ? <Loader2 size={14} className="spin" /> : <Printer size={14} />}
            Export PDF
          </button>
        </div>
      </div>

      {savedTo && (
        <div style={{
          padding: '8px 16px',
          background: 'rgba(22,163,74,0.08)',
          borderBottom: '1px solid var(--border)',
          color: 'var(--success)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <Check size={14} /> Saved to <span className="mono">{savedTo}</span>
        </div>
      )}

      {error && (
        <div className="hub-error" style={{ margin: '12px 16px 0' }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="spin" style={{ display: 'block', margin: '0 auto 8px' }} />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            No results to display.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <RecommendedSettings rows={rows} context={context || undefined} />
            </div>
            <div
              style={{
                marginBottom: 24,
                padding: '16px 16px 8px',
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <BenchmarkResultsChart rows={rows} />
            </div>
            <BenchmarkResultsTable rows={rows} />
          </>
        )}
      </div>
    </div>
  )
}
