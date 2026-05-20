import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Play, Square, Settings, ChevronDown, MoreVertical, Copy, Trash, Download, Globe, Server } from 'lucide-react'
import type { CardState, CommandParam } from '../../../shared/types'
import CmdParamsEditor from './CmdParamsEditor'
interface Props { card: CardState }
export default function ModelCard({ card }: Props) {
  const { toggleCardExpanded, updateCard, setCardStatus, removeCard, backends, activeBackend, commandsSchema, setShowCreateModal, models } = useStore()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isRunning = card.status === 'running'
  const isExpanded = card.expanded
  const launchMode = card.template.launchMode || 'chat'
  const modelExists = !card.template.modelPath || models.some(m => m.path === card.template.modelPath)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  async function handleRunToggle() {
    if (isRunning) {
      const res = await window.api.stopModel(card.template.id)
      if (res.success) setCardStatus(card.template.id, 'idle')
      else alert(`Failed to stop: ${res.error}`)
      return
    }
    let targetBackend = backends.find(b => b.name === card.template.backendVersion)
    if (!targetBackend && activeBackend) targetBackend = activeBackend
    if (!targetBackend || !targetBackend.exe) {
      alert('Backend not found or has no executable.')
      return
    }
    const args: string[] = []
    const tArgs = card.template.args
    if (card.template.modelPath) args.push('-m', card.template.modelPath)
    if (commandsSchema) {
      for (const cat of commandsSchema.categories) {
        for (const cmd of cat.commands) {
          const val = tArgs[cmd.arg]
          if (val !== undefined && val !== null && val !== '') {
            if (cmd.type === 'boolean') { if (val === true) args.push(cmd.arg) }
            else args.push(cmd.arg, String(val))
          }
        }
      }
    } else {
      for (const [k, v] of Object.entries(tArgs)) {
        if (v === true) args.push(k)
        else if (v !== false && v !== null && v !== '') args.push(k, String(v))
      }
    }
    if (!args.includes('--port') && card.template.serverPort) {
      args.push('--port', String(card.template.serverPort))
    }
    if (launchMode === 'api' && !args.includes('--no-webui')) {
      args.push('--no-webui')
    }
    const openBrowser = launchMode === 'chat'
    const res = await window.api.runModel({
      id: card.template.id,
      name: card.template.name,
      backendPath: targetBackend.path,
      exe: targetBackend.exe,
      args,
      openBrowser,
      port: card.template.serverPort || 8080
    })
    if (res.success) setCardStatus(card.template.id, 'running', res.pid, res.port)
    else { alert(`Failed to run: ${res.error}`); setCardStatus(card.template.id, 'error') }
  }
  async function handleDelete() {
    if (isRunning) { alert('Please stop the model before deleting.'); return }
    if (confirm('Delete this template?')) {
      await window.api.deleteTemplate(card.template.id)
      removeCard(card.template.id)
    }
  }
  async function handleExport() { await window.api.exportTemplate(card.template); setShowMenu(false) }
  function handleEdit() { setShowCreateModal(true, card.template); setShowMenu(false) }
  function handleDuplicate() {
    const t = { ...card.template, id: Date.now().toString(), name: `${card.template.name} (Copy)` }
    window.api.saveTemplate(t).then(res => { if (res.success) useStore.getState().addCard(t) })
    setShowMenu(false)
  }
  function setLaunchMode(mode: 'chat' | 'api') {
    updateCard(card.template.id, { launchMode: mode })
    window.api.saveTemplate({ ...card.template, launchMode: mode })
  }
  return (
    <div className={`model-card ${isRunning ? 'running' : ''}`} style={{ overflow: 'visible' }}>
      <div className="card-header">
        <div className="card-icon">
          {isRunning ? (
            <div className="spin"><Settings size={20} className="text-success" /></div>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          )}
        </div>
        <div className="card-info">
          <h3 className="card-name" title={card.template.name}>{card.template.name}</h3>
          <p className="card-desc" title={card.template.description}>{card.template.description || 'No description'}</p>
        </div>
        <div className="card-menu-btn" ref={menuRef} style={{ position: 'relative', zIndex: 10 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowMenu(!showMenu)}>
            <MoreVertical size={16} />
          </button>
          {showMenu && (
            <div className="dropdown-menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 500 }}>
              <button className="dropdown-item" onClick={handleEdit}><Settings size={14} /> Edit Template</button>
              <button className="dropdown-item" onClick={handleDuplicate}><Copy size={14} /> Duplicate</button>
              <button className="dropdown-item" onClick={handleExport}><Download size={14} /> Export</button>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={handleDelete}><Trash size={14} /> Delete</button>
            </div>
          )}
        </div>
      </div>
      <div className="card-meta">
        <span className="card-tag" title={card.template.modelPath}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
          {!modelExists ? <span style={{ color: 'var(--danger)' }}>Missing File</span> : (card.template.modelPath?.split(/[/\\]/).pop() || 'No model')}
        </span>
        <span className="card-tag">
          <span className={`status-dot ${isRunning ? 'running' : 'idle'}`} />
          {isRunning ? `Port ${card.tempPort || card.template.serverPort || 8080}` : 'Ready'}
        </span>
      </div>
      {}
      <div className="card-launch-mode">
        <button
          className={`launch-mode-btn ${launchMode === 'chat' ? 'active' : ''}`}
          onClick={() => setLaunchMode('chat')}
          title="Open chat web UI when started"
          disabled={isRunning}
        >
          <Globe size={12} /> Chat UI
        </button>
        <button
          className={`launch-mode-btn ${launchMode === 'api' ? 'active' : ''}`}
          onClick={() => setLaunchMode('api')}
          title="Serve API only, no web UI"
          disabled={isRunning}
        >
          <Server size={12} /> API Only
        </button>
      </div>
      <div className="card-actions">
        <button
          className={`btn card-run-btn ${isRunning ? 'btn-danger' : 'btn-primary'}`}
          onClick={handleRunToggle}
          disabled={!isRunning && !modelExists}
          style={isRunning && launchMode === 'chat' ? { flex: 0.5 } : {}}
          title={!isRunning && !modelExists ? 'Cannot start: model file is missing' : ''}
        >
          {isRunning ? <><Square size={14} /> Stop</> : <><Play size={14} /> Start</>}
        </button>
        {isRunning && launchMode === 'chat' && (
          <button
            className="btn card-run-btn"
            style={{ flex: 0.5, background: 'var(--accent)', color: 'var(--accent-fg)' }}
            onClick={() => window.api.openChatWindow(card.tempPort || card.template.serverPort || 8080, card.template.name)}
            title="Open Chat Window"
          >
            <Globe size={14} /> Open Chat
          </button>
        )}
        <button
          className={`card-expand-btn ${isExpanded ? 'open' : ''}`}
          onClick={() => toggleCardExpanded(card.template.id)}
          title="Configure CLI Parameters"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <div className={`card-expanded ${isExpanded ? 'open' : ''}`}>
        <div className="expanded-inner">
          <CmdParamsEditor templateId={card.template.id} args={card.template.args} />
        </div>
      </div>
    </div>
  )
}
