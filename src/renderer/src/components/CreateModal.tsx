import React, { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { FolderOpen, ChevronDown, Terminal, Globe, Server } from 'lucide-react'
import type { Template } from '../../../shared/types'
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
  const { setShowCreateModal, editingTemplate, backends, activeBackend, addCard, updateCard, models } = useStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [backendVersion, setBackendVersion] = useState('')
  const [modelPath, setModelPath] = useState('')
  const [serverPort, setServerPort] = useState(8080)
  const [args, setArgs] = useState<Record<string, any>>({})
  const [launchMode, setLaunchMode] = useState<'chat' | 'api'>('chat')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importCmd, setImportCmd] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCreateModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setShowCreateModal])
  useEffect(() => {
    if (editingTemplate) {
      setName(editingTemplate.name)
      setDescription(editingTemplate.description || '')
      setBackendVersion(editingTemplate.backendVersion || '')
      setModelPath(editingTemplate.modelPath || '')
      setServerPort(editingTemplate.serverPort || 8080)
      setArgs(editingTemplate.args || {})
      setLaunchMode(editingTemplate.launchMode || 'chat')
    } else {
      if (activeBackend) setBackendVersion(activeBackend.name)
      setArgs({})
      setLaunchMode('chat')
    }
  }, [editingTemplate, activeBackend])
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
    const templateData: Partial<Template> = {
      name,
      description,
      backendVersion,
      modelPath,
      serverPort,
      args,
      launchMode
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
        launchMode,
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
