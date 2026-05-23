import React, { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore'
import {
  Search, Download, Heart, ChevronDown, ChevronLeft,
  FolderOpen, CheckCircle, Loader2, X, AlertCircle, Box, Pause, Play,
  ArrowDown, ArrowUp, Calendar
} from 'lucide-react'
interface HfModel {
  id: string
  author: string
  name: string
  downloads: number
  likes: number
  tags: string[]
  lastModified: string
}
interface HfFile {
  name: string
  size: number
  downloadUrl: string
}
function formatBytes(bytes: number): string {
  if (!bytes) return '?'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
function formatSpeed(bps?: number): string {
  if (!bps) return ''
  const mbps = bps / (1024 * 1024)
  return `${mbps.toFixed(1)} MB/s`
}
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function quantLabel(filename: string): { label: string; color: string } {
  const upper = filename.toUpperCase()
  if (upper.includes('Q2')) return { label: 'Q2', color: '#ef4444' }
  if (upper.includes('Q3')) return { label: 'Q3', color: '#f97316' }
  if (upper.includes('Q4')) return { label: 'Q4', color: '#eab308' }
  if (upper.includes('Q5')) return { label: 'Q5', color: '#22c55e' }
  if (upper.includes('Q6')) return { label: 'Q6', color: '#3b82f6' }
  if (upper.includes('Q8')) return { label: 'Q8', color: '#8b5cf6' }
  if (upper.includes('F16')) return { label: 'F16', color: '#6366f1' }
  if (upper.includes('F32')) return { label: 'F32', color: '#6366f1' }
  if (upper.includes('BF16')) return { label: 'BF16', color: '#6366f1' }
  return { label: 'GGUF', color: '#6b7280' }
}
export default function HuggingFaceView() {
  const {
    hfDownloads, setHfDownload, removeHfDownload,
    hubQuery, hubResults, hubSelectedModelId,
    setHubQuery, setHubResults, setHubSelectedModelId,
    hubSort, hubDirection, setHubSort, setHubDirection
  } = useStore()

  const selectedModel = (hubResults as HfModel[]).find(m => m.id === hubSelectedModelId) ?? null

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<HfFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  const [inputValue, setInputValue] = useState(hubQuery)

  useEffect(() => {
    if (hubSelectedModelId && hubResults.length > 0 && files.length === 0) {
      const model = (hubResults as HfModel[]).find(m => m.id === hubSelectedModelId)
      if (model) fetchFiles(model)
    }
  }, [])

  const doSearch = useCallback(async (q: string, sort = hubSort, direction = hubDirection) => {
    if (!q.trim()) return
    setHubQuery(q)          
    setLoading(true)
    setError('')
    setHubResults([])
    setHubSelectedModelId(null)
    try {
      const res = await window.api.hfSearch(q.trim(), sort, direction)
      if ('error' in res) throw new Error((res as any).error)
      setHubResults(res as HfModel[])
    } catch (e: any) {
      setError(e.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [hubSort, hubDirection])

  async function fetchFiles(model: HfModel) {
    setFiles([])
    setFilesLoading(true)
    try {
      const res = await window.api.hfGetFiles(model.id)
      if ('error' in res) throw new Error((res as any).error)
      setFiles(res as HfFile[])
    } catch (e: any) {
      setError(e.message || 'Failed to fetch files')
    } finally {
      setFilesLoading(false)
    }
  }

  async function handleSelectModel(model: HfModel) {
    setHubSelectedModelId(model.id)
    fetchFiles(model)
  }

  async function handleDownload(file: HfFile) {
    if (!selectedModel) return
    setHfDownload({ repoId: selectedModel.id, filename: file.name, percent: 0, phase: 'starting' })
    const res = await window.api.hfDownloadModel({
      repoId: selectedModel.id,
      filename: file.name,
      downloadUrl: file.downloadUrl
    })
    if (!res.success) {
      removeHfDownload(file.name)
      alert(`Download failed: ${res.error}`)
    }
  }

  const isDownloading = (filename: string) => hfDownloads.some(d => d.filename === filename)
  const getProgress = (filename: string) => hfDownloads.find(d => d.filename === filename)
  const popularQueries = ['llama', 'mistral', 'phi', 'qwen', 'gemma', 'deepseek', 'falcon']
  return (
    <div className="hub-container">
      {}
      <div className="page-header">
        <div>
          <h1 className="page-title">Model Hub</h1>
          <p className="page-subtitle">Search and download GGUF models from HuggingFace</p>
        </div>
        <button className="btn btn-ghost" onClick={() => window.api.hfOpenModelsDir()} title="Open models folder">
          <FolderOpen size={15} /> Open /models
        </button>
      </div>
      {}
      <div className="hub-search-bar">
        <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          className="hub-search-input"
          type="text"
          placeholder="Search GGUF models on HuggingFace..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch(inputValue)}
        />
        {inputValue && (
          <button className="hub-search-clear" onClick={() => { setInputValue(''); setHubQuery(''); setHubResults([]); setHubSelectedModelId(null) }}>
            <X size={14} />
          </button>
        )}
        <div className="hub-sort-divider" />
        <select
          className="hub-sort-select"
          value={hubSort}
          onChange={(e) => {
            const sort = e.target.value
            setHubSort(sort)
            // HF API doesn't support ascending for downloads/likes
            let newDirection = hubDirection
            if ((sort === 'downloads' || sort === 'likes') && hubDirection === 1) {
              newDirection = -1
              setHubDirection(-1)
            }
            if (inputValue.trim()) {
              doSearch(inputValue, sort, newDirection)
            }
          }}
        >
          <option value="downloads">Downloads</option>
          <option value="likes">Likes</option>
          <option value="createdAt">Date Created</option>
          <option value="lastModified">Last Updated</option>
        </select>
        {hubSort !== 'downloads' && hubSort !== 'likes' && (
          <button
            className="btn btn-ghost btn-icon"
            style={{ padding: '6px', marginLeft: '-4px', marginRight: '4px' }}
            title={hubDirection === -1 ? 'Descending' : 'Ascending'}
            onClick={() => {
              const newDir = hubDirection === -1 ? 1 : -1
              setHubDirection(newDir)
              if (inputValue.trim()) {
                doSearch(inputValue, hubSort, newDir)
              }
            }}
          >
            {hubDirection === -1 ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
          </button>
        )}
        <button className="btn btn-primary" onClick={() => doSearch(inputValue)} disabled={loading || !inputValue.trim()}>
          {loading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
          Search
        </button>
      </div>
      {}
      {!hubResults.length && !loading && (
        <div className="hub-tags">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Popular:</span>
          {popularQueries.map(q => (
            <button key={q} className="hub-tag-btn" onClick={() => { setInputValue(q); doSearch(q) }}>
              {q}
            </button>
          ))}
        </div>
      )}
      {}
      {error && (
        <div className="hub-error">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={12} />
          </button>
        </div>
      )}
      {}
      {loading && (
        <div className="hub-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="hub-card skeleton" />
          ))}
        </div>
      )}
      {}
      {!loading && hubResults.length > 0 && (
        <div className={`hub-results-layout ${selectedModel ? 'has-detail' : ''}`}>
          {}
          <div className="hub-grid">
            {(hubResults as HfModel[]).map(model => (
              <button
                key={model.id}
                className={`hub-card ${selectedModel?.id === model.id ? 'selected' : ''}`}
                onClick={() => handleSelectModel(model)}
              >
                <div className="hub-card-icon">
                  <Box size={18} />
                </div>
                <div className="hub-card-body">
                  <div className="hub-card-name" title={model.name}>{model.name}</div>
                  <div className="hub-card-author">{model.author}</div>
                  <div className="hub-card-stats">
                    <span><Download size={11} /> {formatNumber(model.downloads)}</span>
                    <span><Heart size={11} /> {formatNumber(model.likes)}</span>
                    {model.lastModified && <span><Calendar size={11} /> {new Date(model.lastModified).toLocaleDateString()}</span>}
                  </div>
                </div>
                <ChevronDown size={14} style={{ transform: 'rotate(-90deg)', flexShrink: 0, color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
          {}
          {selectedModel && (
            <div className="hub-detail-panel">
              <div className="hub-detail-header">
                <button className="btn btn-ghost btn-icon" onClick={() => setHubSelectedModelId(null)} title="Back">
                  <ChevronLeft size={16} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hub-detail-name" title={selectedModel.name}>{selectedModel.name}</div>
                  <div className="hub-detail-author">{selectedModel.author}</div>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={() => window.api.openExternal(`https://huggingface.co/${selectedModel.id}`)}
                  title="Open on HuggingFace"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
              </div>
              <div className="hub-detail-stats">
                <span><Download size={12} /> {formatNumber(selectedModel.downloads)} downloads</span>
                <span><Heart size={12} /> {formatNumber(selectedModel.likes)} likes</span>
              </div>
              <div className="hub-detail-section-label">GGUF Files</div>
              {filesLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  <Loader2 size={14} className="spin" /> Loading files...
                </div>
              )}
              {!filesLoading && files.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>No GGUF files found in this repository.</div>
              )}
              {!filesLoading && files.map(file => {
                const dl = getProgress(file.name)
                const downloading = isDownloading(file.name)
                const done = dl?.phase === 'done'
                const { label, color } = quantLabel(file.name)
                return (
                  <div key={file.name} className="hub-file-row">
                    <div className="hub-file-info">
                      <span className="hub-quant-badge" style={{ background: color + '22', color }}>
                        {label}
                      </span>
                      <div className="hub-file-name" title={file.name}>{file.name}</div>
                      <div className="hub-file-size">{formatBytes(file.size)}</div>
                    </div>
                    {downloading && !done ? (
                      <div className="hub-file-progress">
                        <div className="hub-progress-bar">
                          <div className="hub-progress-fill" style={{ width: `${dl?.percent || 0}%`, opacity: dl?.phase === 'paused' ? 0.45 : 1, transition: 'width 0.3s ease' }} />
                        </div>
                        <span className="hub-progress-label">
                          {dl?.phase === 'saving'
                            ? 'Salvando...'
                            : dl?.phase === 'creating_template'
                            ? 'Criando template...'
                            : dl?.phase === 'paused'
                            ? `Pausado • ${dl?.percent || 0}%`
                            : `${dl?.percent || 0}%${dl?.speed ? ` • ${formatSpeed(dl.speed)}` : ''}`
                          }
                        </span>
                        {dl?.phase === 'paused' ? (
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ marginLeft: 4 }}
                            onClick={() => window.api.resumeModelDownload(file.name)}
                            title="Resume"
                          >
                            <Play size={12} />
                          </button>
                        ) : dl?.phase === 'downloading' ? (
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ marginLeft: 4 }}
                            onClick={() => window.api.pauseModelDownload(file.name)}
                            title="Pause"
                          >
                            <Pause size={12} />
                          </button>
                        ) : null}
                      </div>
                    ) : done ? (
                      <div className="hub-file-done">
                        <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm hub-dl-btn"
                        onClick={() => handleDownload(file)}
                      >
                        <Download size={13} />
                        Download
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {}
      {hfDownloads.filter(d => d.phase !== 'done').length > 0 && (
        <div className="hub-downloads-strip">
          {hfDownloads.filter(d => d.phase !== 'done').map(dl => {
            const isPaused = dl.phase === 'paused'
            let statusText = `${dl.percent}%`
            if (dl.phase === 'downloading') statusText = dl.speed ? `${dl.percent}% • ${formatSpeed(dl.speed)}` : `Baixando [${dl.percent}%]`
            if (dl.phase === 'saving') statusText = 'Salvando em /models...'
            if (dl.phase === 'creating_template') statusText = 'Criando template...'
            if (isPaused) statusText = `Pausado • ${dl.percent}%`
            return (
              <div key={dl.filename} className="hub-dl-strip-item">
                {isPaused
                  ? <Pause size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  : <Loader2 size={12} className="spin" style={{ flexShrink: 0 }} />}
                <span className="hub-dl-strip-name">{dl.filename}</span>
                <div className="hub-dl-strip-bar">
                  <div className="hub-dl-strip-fill" style={{ width: `${dl.percent}%`, opacity: isPaused ? 0.45 : 1, transition: 'width 0.3s ease' }} />
                </div>
                <span className="hub-dl-strip-pct">{statusText}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
