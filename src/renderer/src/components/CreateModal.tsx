import React, { useState, useEffect, useMemo } from 'react'
import { useStore, type ModelFileInfo } from '../store/useStore'
import { FolderOpen, ChevronDown, Terminal, Globe, Server, Zap } from 'lucide-react'
import type { Template, AccelerationConfig } from '../../../shared/types'
import CmdParamsEditor from './CmdParamsEditor'
function parseCommand(cmd: string): {
  modelPath: string
  serverPort: number
  args: Record<string, string | number | boolean>
} {
  const parts: string[] = []
  const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(cmd)) !== null) {
    parts.push(m[0].replace(/^['"]|['"]$/g, ''))
  }
  let modelPath = ''
  let serverPort = 8080
  const args: Record<string, string | number | boolean> = {}
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p === '-m' || p === '--model') {
      modelPath = parts[++i] || ''
    } else if (p === '--port') {
      serverPort = parseInt(parts[++i] || '8080', 10)
    } else if (p.startsWith('--') || p.startsWith('-')) {
      const next = parts[i + 1]
      if (next && !next.startsWith('-')) {
        const numVal = Number(next)
        args[p] = isNaN(numVal) ? next : numVal
        i++
      } else {
        args[p] = true
      }
    }
  }
  return { modelPath, serverPort, args }
}
export default function CreateModal() {
  const { setShowCreateModal, editingTemplate, backends, activeBackend, addCard, updateCard, models, prefillModelPath, setPrefillModelPath, cards } = useStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [backendVersion, setBackendVersion] = useState('')
  const [modelPath, setModelPath] = useState('')
  const [serverPort, setServerPort] = useState(8080)
  const [args, setArgs] = useState<Record<string, any>>({})
  const [tagsStr, setTagsStr] = useState('')
  const [launchMode, setLaunchMode] = useState<'chat' | 'api'>('chat')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importCmd, setImportCmd] = useState('')
  const [acceleration, setAcceleration] = useState<AccelerationConfig | undefined>(undefined)
  const [showAccelTuning, setShowAccelTuning] = useState(false)
  // The selected model's detected capability — null if no model picked yet or
  // it doesn't ship MTP heads. Drives whether the Acceleration section appears.
  const selectedModel = useMemo(() => models.find(m => m.path === modelPath), [models, modelPath])
  const mtpAvailable = selectedModel?.mtpCapability === 'native'
  // Draft-model candidates: any GGUF smaller than the main model, not itself.
  // Architecture-matched pairs are flagged as `recommended` and surface first.
  // Vocab-mismatched pairs are flagged `compatible: false` and llama-server
  // will refuse them; we surface this upfront instead of after a 90s load.
  const draftCandidates = useMemo(() => {
    if (!selectedModel) return [] as Array<{ model: ModelFileInfo; recommended: boolean; compatible: boolean }>
    const mainArch = selectedModel.architecture || ''
    const mainFamily = mainArch.replace(/[0-9].*$/, '')
    const mainVocab = selectedModel.vocabSize
    return models
      .filter(m => m.path !== selectedModel.path)
      .filter(m => m.name.toLowerCase().endsWith('.gguf'))
      .filter(m => m.size < selectedModel.size)
      .map(m => {
        const family = (m.architecture || '').replace(/[0-9].*$/, '')
        const recommended = !!mainFamily && family === mainFamily
        // Compatible if both vocab sizes known and equal, OR if either is
        // unknown (don't block on missing metadata).
        const compatible = !mainVocab || !m.vocabSize || mainVocab === m.vocabSize
        return { model: m, recommended, compatible }
      })
      .sort((a, b) => {
        if (a.compatible !== b.compatible) return a.compatible ? -1 : 1
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1
        return a.model.size - b.model.size
      })
  }, [models, selectedModel])
  const draftAvailable = !mtpAvailable && draftCandidates.length > 0
  // The currently-picked draft's compatibility, used to gate the save button.
  const currentDraftIncompatible = useMemo(() => {
    if (acceleration?.mode !== 'draft' || !acceleration.draftModelPath) return false
    const c = draftCandidates.find(c => c.model.path === acceleration.draftModelPath)
    return c ? !c.compatible : false
  }, [acceleration, draftCandidates])
  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name)
      setDescription(editingTemplate.description || '')
      setBackendVersion(editingTemplate.backendVersion || '')
      setModelPath(editingTemplate.modelPath || '')
      setServerPort(editingTemplate.serverPort || 8080)
      setArgs(editingTemplate.args || {})
      setTagsStr(editingTemplate.tags?.join(', ') || '')
      setLaunchMode(editingTemplate.launchMode || 'chat')
      setAcceleration(editingTemplate.acceleration)
    } else {
      if (activeBackend) setBackendVersion(activeBackend.name)
      setArgs({})
      setTagsStr('')
      setLaunchMode('chat')
      setAcceleration(undefined)
      if (prefillModelPath) {
        setModelPath(prefillModelPath)
        setPrefillModelPath(null)
      }
      const usedPorts = new Set(cards.map(c => c.template.serverPort))
      let port = 8080
      while (usedPorts.has(port)) port++
      setServerPort(port)
    }
  }, [editingTemplate, activeBackend, prefillModelPath, setPrefillModelPath, cards])
  // Auto-enable MTP the first time the user picks an MTP-capable model on a
  // fresh template. Existing templates keep whatever the user explicitly
  // saved, even if undefined → preserves their intent.
  useEffect(() => {
    if (editingTemplate) return
    if (mtpAvailable && acceleration === undefined) {
      setAcceleration({ mode: 'native' })
    }
  }, [mtpAvailable, editingTemplate, acceleration])
  async function handlePickModel() {
    const file = await window.api.pickModelFile()
    if (file) setModelPath(file.path)
  }
  function handleImportCmd() {
    if (!importCmd.trim()) return
    const parsed = parseCommand(importCmd)
    if (parsed.modelPath) setModelPath(parsed.modelPath)
    if (parsed.serverPort) setServerPort(parsed.serverPort)
    setArgs((prev) => ({ ...prev, ...parsed.args }))
    setShowImport(false)
    setImportCmd('')
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return alert('Name is required')
    if (currentDraftIncompatible) {
      return alert('The selected draft model has a vocab size that does not match the main model. Pick a same-family draft or disable speculative decoding.')
    }
    const templateData: Partial<Template> = {
      name,
      description,
      backendVersion,
      modelPath,
      serverPort,
      args,
      tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      launchMode,
      acceleration
    }
    if (editingTemplate) {
      const res = await window.api.saveTemplate({ ...editingTemplate, ...templateData })
      if (res.success) {
        updateCard(editingTemplate.id, templateData)
        setShowCreateModal(false)
      }
    } else {
      const newTemplate: Omit<Template, 'id'> = {
        name,
        description,
        backendVersion,
        modelPath,
        serverPort,
        args,
        tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
        launchMode,
        acceleration,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const res = await window.api.saveTemplate(newTemplate)
      if (res.success) {
        addCard({ ...newTemplate, id: res.id } as Template)
        setShowCreateModal(false)
      }
    }
  }
  return (
    <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{editingTemplate ? 'Edit Template' : 'New Template'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="modal-body">
            {}
            <div className="collapsible-section" style={{ marginBottom: 16 }}>
              <button
                type="button"
                className="collapsible-toggle"
                onClick={() => setShowImport(!showImport)}
              >
                <Terminal size={14} />
                <span>Import from command</span>
                <ChevronDown
                  size={14}
                  style={{ marginLeft: 'auto', transform: showImport ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }}
                />
              </button>
              {showImport && (
                <div className="collapsible-body">
                  <p className="form-hint" style={{ marginBottom: 8 }}>
                    Paste a <code>llama-server</code> command and the form will be filled automatically.
                  </p>
                  <textarea
                    className="form-textarea mono"
                    rows={3}
                    value={importCmd}
                    onChange={e => setImportCmd(e.target.value)}
                    placeholder="llama-server -m /models/model.gguf --port 8080 --ctx-size 4096 ..."
                    style={{ fontSize: 12, fontFamily: "'SF Mono','Fira Code',monospace" }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={handleImportCmd}
                  >
                    Parse &amp; Fill
                  </button>
                </div>
              )}
            </div>
            {}
            <div className="form-group">
              <label className="form-label">Template Name</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Llama 3 8B Default"
                required
                autoFocus
              />
            </div>
            {}
            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Short description of this configuration..."
              />
            </div>
            {}
            <div className="form-group">
              <label className="form-label">Tags (comma-separated)</label>
              <input
                type="text"
                className="form-input"
                value={tagsStr}
                onChange={e => setTagsStr(e.target.value)}
                placeholder="e.g. llama3, coding, 8b"
              />
            </div>
            {}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Backend Version</label>
                <select
                  className="form-select"
                  value={backendVersion}
                  onChange={e => setBackendVersion(e.target.value)}
                >
                  <option value="">Default (Active)</option>
                  {backends.map(b => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Server Port</label>
                <input
                  type="number"
                  className="form-input"
                  value={serverPort}
                  onChange={e => setServerPort(Number(e.target.value))}
                  min={1024}
                  max={65535}
                />
                {(() => {
                  const conflict = cards.find(c =>
                    c.template.id !== editingTemplate?.id &&
                    c.template.serverPort === serverPort
                  )
                  return conflict ? (
                    <div className="form-hint" style={{ color: 'var(--warning)' }}>
                      Port {serverPort} is already used by &ldquo;{conflict.template.name}&rdquo;. They cannot run at the same time.
                    </div>
                  ) : null
                })()}
              </div>
            </div>
            {}
            <div className="form-group">
              <label className="form-label">Launch Mode</label>
              <div className="launch-mode-row">
                <button type="button" className={`launch-mode-btn ${launchMode === 'chat' ? 'active' : ''}`} onClick={() => setLaunchMode('chat')}>
                  <Globe size={13} /> Chat UI
                </button>
                <button type="button" className={`launch-mode-btn ${launchMode === 'api' ? 'active' : ''}`} onClick={() => setLaunchMode('api')}>
                  <Server size={13} /> API Only
                </button>
              </div>
              <div className="form-hint">Chat UI opens the browser. API Only serves at the port without opening the web UI.</div>
            </div>
            {}
            <div className="form-group mb-0">
              <label className="form-label">Model File</label>
              <div className="file-picker">
                <select
                  className="form-select mono text-sm flex-1"
                  value={modelPath}
                  onChange={e => setModelPath(e.target.value)}
                >
                  <option value="">-- Select a model --</option>
                  {models.map(m => (
                    <option key={m.path} value={m.path}>{m.name}</option>
                  ))}
                  {modelPath && !models.find(m => m.path === modelPath) && (
                    <option value={modelPath}>{modelPath.split(/[/\\]/).pop()}</option>
                  )}
                </select>
                <button type="button" className="btn btn-secondary" onClick={handlePickModel}>
                  <FolderOpen size={16} />
                  Browse
                </button>
              </div>
              <div className="form-hint">Select a file from /models or browse your computer.</div>
            </div>
            {draftAvailable && (() => {
              const enabled = acceleration?.mode === 'draft' && !!acceleration?.draftModelPath
              const currentDraft = acceleration?.draftModelPath
              const recommended = draftCandidates.filter(c => c.recommended)
              return (
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 14px',
                    background: enabled ? 'rgba(59,130,246,0.06)' : 'var(--surface)',
                    border: `1.5px solid ${enabled ? 'rgba(59,130,246,0.45)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Zap size={16} style={{ color: enabled ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        Speculative decoding
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                          (optional — pair a small draft model)
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Drafts {acceleration?.draftMax ?? 3} tokens per step with a smaller GGUF.
                        Typical 1.5–2× speedup on agentic / repetitive workloads.
                        {recommended.length > 0
                          ? <> {recommended.length} architecture-matched draft{recommended.length === 1 ? '' : 's'} available.</>
                          : <> No same-family draft in your library — vocab compatibility is on you.</>}
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => {
                          if (e.target.checked) {
                            const auto = recommended[0]?.model.path || draftCandidates[0]?.model.path
                            setAcceleration({ ...(acceleration || {}), mode: 'draft', draftModelPath: auto })
                          } else {
                            setAcceleration({ mode: 'off' })
                          }
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{enabled ? 'On' : 'Off'}</span>
                    </label>
                  </div>
                  {enabled && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Draft model</div>
                      <select
                        className="form-select mono text-sm"
                        value={currentDraft || ''}
                        onChange={e => setAcceleration({ ...(acceleration || { mode: 'draft' }), mode: 'draft', draftModelPath: e.target.value })}
                        style={{ width: '100%' }}
                      >
                        <option value="">-- Select a draft model --</option>
                        {draftCandidates.map(c => (
                          <option key={c.model.path} value={c.model.path} disabled={!c.compatible}>
                            {c.recommended ? '★ ' : ''}{c.model.name} ({(c.model.size / 1e9).toFixed(1)} GB)
                            {!c.compatible ? ` — incompatible vocab (${c.model.vocabSize ?? '?'} vs ${selectedModel?.vocabSize ?? '?'})` : ''}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        ★ = same architecture family as main. Mismatched vocab will cause llama-server to refuse the pair.
                      </div>
                      {currentDraftIncompatible && (
                        <div style={{
                          marginTop: 8, padding: '6px 10px',
                          background: 'rgba(220,38,38,0.08)',
                          border: '1.5px solid rgba(220,38,38,0.35)',
                          borderRadius: 6, fontSize: 11, color: 'var(--danger)'
                        }}>
                          ⚠ Vocab mismatch — this pair will be refused at startup. Pick a same-family draft.
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowAccelTuning(!showAccelTuning)}
                        style={{ padding: '2px 8px', fontSize: 11, marginTop: 8 }}
                      >
                        <ChevronDown size={11} style={{ transform: showAccelTuning ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
                        {showAccelTuning ? 'Hide' : 'Show'} tuning
                      </button>
                      {showAccelTuning && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 8, marginTop: 8, fontSize: 12, alignItems: 'center' }}>
                          <label style={{ color: 'var(--text-muted)' }}>Draft max</label>
                          <input
                            type="number" min={1} max={16}
                            className="form-input"
                            style={{ width: 80, padding: '4px 8px' }}
                            value={acceleration?.draftMax ?? 3}
                            onChange={e => setAcceleration({ ...(acceleration || { mode: 'draft' }), draftMax: parseInt(e.target.value, 10) || 3 })}
                          />
                          <label style={{ color: 'var(--text-muted)' }}>Draft min</label>
                          <input
                            type="number" min={0} max={16}
                            className="form-input"
                            style={{ width: 80, padding: '4px 8px' }}
                            value={acceleration?.draftMin ?? 0}
                            onChange={e => setAcceleration({ ...(acceleration || { mode: 'draft' }), draftMin: parseInt(e.target.value, 10) || 0 })}
                          />
                          <label style={{ color: 'var(--text-muted)' }}>Min p</label>
                          <input
                            type="number" min={0} max={1} step={0.05}
                            className="form-input"
                            style={{ width: 80, padding: '4px 8px' }}
                            value={acceleration?.draftPMin ?? 0}
                            onChange={e => setAcceleration({ ...(acceleration || { mode: 'draft' }), draftPMin: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
            {mtpAvailable && (() => {
              const enabled = acceleration?.mode === 'native'
              return (
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 14px',
                    background: enabled ? 'rgba(59,130,246,0.06)' : 'var(--surface)',
                    border: `1.5px solid ${enabled ? 'rgba(59,130,246,0.45)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Zap size={16} style={{ color: enabled ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        Multi-token prediction
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.4px',
                          padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                          background: 'rgba(22,163,74,0.15)', color: 'var(--success)',
                          border: '1px solid rgba(22,163,74,0.35)'
                        }}>
                          {selectedModel?.mtpLayers ?? 1} NextN layer{(selectedModel?.mtpLayers ?? 1) === 1 ? '' : 's'} detected
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Drafts {acceleration?.draftMax ?? 3} tokens per step via the model's built-in MTP heads.
                        Typically 1.5–2.5× faster generation on capable models like Qwen3.6.
                      </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={e => setAcceleration(e.target.checked ? { ...(acceleration || {}), mode: 'native' } : { mode: 'off' })}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{enabled ? 'On' : 'Off'}</span>
                    </label>
                  </div>
                  {enabled && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowAccelTuning(!showAccelTuning)}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                      >
                        <ChevronDown size={11} style={{ transform: showAccelTuning ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
                        {showAccelTuning ? 'Hide' : 'Show'} tuning
                      </button>
                      {showAccelTuning && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 8, marginTop: 8, fontSize: 12, alignItems: 'center' }}>
                          <label style={{ color: 'var(--text-muted)' }}>Draft max</label>
                          <input
                            type="number" min={1} max={16}
                            className="form-input"
                            style={{ width: 80, padding: '4px 8px' }}
                            value={acceleration?.draftMax ?? 3}
                            onChange={e => setAcceleration({ ...(acceleration || { mode: 'native' }), draftMax: parseInt(e.target.value, 10) || 3 })}
                          />
                          <label style={{ color: 'var(--text-muted)' }}>Draft min</label>
                          <input
                            type="number" min={0} max={16}
                            className="form-input"
                            style={{ width: 80, padding: '4px 8px' }}
                            value={acceleration?.draftMin ?? 0}
                            onChange={e => setAcceleration({ ...(acceleration || { mode: 'native' }), draftMin: parseInt(e.target.value, 10) || 0 })}
                          />
                          <label style={{ color: 'var(--text-muted)' }}>Min p</label>
                          <input
                            type="number" min={0} max={1} step={0.05}
                            className="form-input"
                            style={{ width: 80, padding: '4px 8px' }}
                            value={acceleration?.draftPMin ?? 0}
                            onChange={e => setAcceleration({ ...(acceleration || { mode: 'native' }), draftPMin: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
            {}
            <div className="collapsible-section" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="collapsible-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <span>Advanced Parameters</span>
                <ChevronDown
                  size={14}
                  style={{ marginLeft: 'auto', transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }}
                />
              </button>
              {showAdvanced && (
                <div className="collapsible-body">
                  <CmdParamsEditor
                    args={args}
                    onChange={setArgs}
                    modelPathFallback={modelPath}
                    serverPortFallback={serverPort}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
