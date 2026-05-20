import React, { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { HardDrive, Download, Trash, RefreshCw, Loader2, ChevronDown, Terminal, Bell, BellOff, FolderPlus, Folder } from 'lucide-react'
import CommandsEditor from './CommandsEditor'

const NOTIF_KEY = 'hexllama_update_notify'

function getNotifPref(): 'banner' | 'manual' {
  return (localStorage.getItem(NOTIF_KEY) as 'banner' | 'manual') || 'banner'
}

export default function SettingsView() {
  const { backends, activeBackend, setActiveBackend, setCommandsSchema, setBackends,
          releaseInfo, checkingUpdate, downloadProgress, setDownloadProgress, setCheckingUpdate, setReleaseInfo,
          setModels, compactSidebarEnabled, setCompactSidebarEnabled } = useStore()
  const [downloading, setDownloading] = useState(false)
  const [selectedAssetUrl, setSelectedAssetUrl] = useState('')
  const [expandedEditor, setExpandedEditor] = useState<string | null>(null)
  const [notifPref, setNotifPref] = useState<'banner' | 'manual'>(getNotifPref())
  const [extFolders, setExtFolders] = useState<string[]>([])

  useEffect(() => {
    if (releaseInfo?.assets.length && !selectedAssetUrl) {
      setSelectedAssetUrl(releaseInfo.assets[0].downloadUrl)
    }
  }, [releaseInfo, selectedAssetUrl])

  useEffect(() => {
    window.api.listExternalModelFolders().then(setExtFolders)
  }, [])

  async function refreshModels() {
    const m = await window.api.listModels()
    setModels(m)
  }
  async function handleAddExtFolder() {
    const res = await window.api.addExternalModelFolder()
    if (res.success && res.folders) { setExtFolders(res.folders); await refreshModels() }
  }
  async function handleRemoveExtFolder(folder: string) {
    const res = await window.api.removeExternalModelFolder(folder)
    setExtFolders(res.folders)
    await refreshModels()
  }

  function handleNotifPref(pref: 'banner' | 'manual') {
    setNotifPref(pref)
    localStorage.setItem(NOTIF_KEY, pref)
  }

  async function handleSwitchBackend(name: string) {
    const b = backends.find(x => x.name === name)
    if (!b) return
    setActiveBackend(b)
    const cmds = await window.api.getCommands(name)
    if (cmds) setCommandsSchema(cmds)
  }

  async function handleDeleteBackend(name: string) {
    if (!confirm(`Delete backend "${name}"? This will remove all files in that folder.`)) return
    const res = await window.api.deleteBackend(name)
    if (res.success) {
      const updated = await window.api.listBackends()
      setBackends(updated)
    } else alert('Delete failed: ' + res.error)
  }

  async function handleCheckUpdates() {
    setCheckingUpdate(true)
    try {
      const info = await window.api.checkUpdates()
      setReleaseInfo(info)
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleDownload = async () => {
    if (!releaseInfo || !releaseInfo.assets.length) return
    const asset = releaseInfo.assets.find(a => a.downloadUrl === selectedAssetUrl) || releaseInfo.assets[0]
    setDownloading(true)
    const res = await window.api.downloadRelease({
      url: asset.downloadUrl,
      version: `${releaseInfo.tagName}-${asset.name.replace('.zip', '')}`,
      assetName: asset.name
    })
    setDownloading(false)
    setDownloadProgress(null)
    if (res.success) {
      const backendsData = await window.api.listBackends()
      setBackends(backendsData)
    } else alert(`Download failed: ${res.error}`)
  }

  return (
    <div className="max-w-3xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage llama.cpp backends and configurations</p>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="settings-section">
        <div className="settings-section-title"><Bell /> Update Notifications</div>
        <div className="settings-row" style={{ borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Choose how you'd like to be informed when a new version of llama.cpp is available.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`launch-mode-btn ${notifPref === 'banner' ? 'active' : ''}`}
              onClick={() => handleNotifPref('banner')}
            >
              <Bell size={13} />
              Show Banner Automatically
            </button>
            <button
              className={`launch-mode-btn ${notifPref === 'manual' ? 'active' : ''}`}
              onClick={() => handleNotifPref('manual')}
            >
              <BellOff size={13} />
              Check Manually Only
            </button>
          </div>
          {notifPref === 'manual' && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              The update banner will not be shown automatically. Use "Check Now" below anytime.
            </p>
          )}
        </div>
      </div>

      {/* Sidebar Layout Section */}
      <div className="settings-section">
        <div className="settings-section-title"><Terminal /> Sidebar Layout</div>
        <div className="settings-row" style={{ borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Toggle the sidebar mode. When auto-collapse is enabled, the sidebar collapses into a compact icon-only view and expands automatically to show full labels when you hover your mouse over it.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`launch-mode-btn ${!compactSidebarEnabled ? 'active' : ''}`}
              onClick={() => setCompactSidebarEnabled(false)}
            >
              Full Sidebar (Default)
            </button>
            <button
              className={`launch-mode-btn ${compactSidebarEnabled ? 'active' : ''}`}
              onClick={() => setCompactSidebarEnabled(true)}
            >
              Auto-Collapse Sidebar
            </button>
          </div>
        </div>
      </div>

      {}
      <div className="settings-section">
        <div className="settings-section-title"><Folder /> External Model Folders</div>
        <div className="settings-row" style={{ borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Add folders outside the app's default models directory. Files inside (and any subdirectories) will appear on the Models page alongside downloaded models. They stay where they are &mdash; nothing is copied.
          </p>
          {extFolders.length === 0 ? (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No external folders configured.</div>
          ) : (
            <div className="flex flex-col gap-2" style={{ width: '100%' }}>
              {extFolders.map(f => (
                <div key={f} className="settings-row" style={{ borderBottom: 'none', padding: '6px 0' }}>
                  <div className="settings-row-sub mono" style={{ flex: 1, wordBreak: 'break-all' }}>{f}</div>
                  <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleRemoveExtFolder(f)} title="Remove folder">
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleAddExtFolder}>
            <FolderPlus size={13} /> Add Folder
          </button>
        </div>
      </div>

      {}
      <div className="settings-section">
        <div className="settings-section-title"><HardDrive /> Installed Backends</div>
        {backends.length === 0 ? (
          <div className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
            No backends installed. Download one below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {backends.map((b) => (
              <div key={b.name}>
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label flex items-center gap-2">
                      {b.name}
                      {activeBackend?.name === b.name && <span className="version-badge active-version">Active</span>}
                      {!b.hasCommands && <span className="version-badge">Fallback Schema</span>}
                    </div>
                    <div className="settings-row-sub mono">{b.exe || 'No executable found'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSwitchBackend(b.name)}
                      disabled={activeBackend?.name === b.name}
                    >
                      Set Active
                    </button>
                    <button
                      className={`btn btn-ghost btn-sm flex items-center gap-1 ${expandedEditor === b.name ? 'btn-primary' : ''}`}
                      onClick={() => setExpandedEditor(expandedEditor === b.name ? null : b.name)}
                      title="Edit commands.json"
                    >
                      <Terminal size={13} />
                      <ChevronDown size={12} style={{ transform: expandedEditor === b.name ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon text-danger"
                      onClick={() => handleDeleteBackend(b.name)}
                      title="Delete backend"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
                {expandedEditor === b.name && (
                  <div className="ce-panel">
                    <CommandsEditor backendName={b.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {}
      <div className="settings-section">
        <div className="settings-section-title"><Download /> Available Updates</div>
        {checkingUpdate ? (
          <div className="flex items-center gap-2 text-sm py-4" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={14} className="spin" /> Checking GitHub for releases...
          </div>
        ) : releaseInfo ? (
          releaseInfo.error ? (
            <div className="text-danger text-sm py-2">Error: {releaseInfo.error}</div>
          ) : (
            <div className="settings-row" style={{ borderBottom: 'none', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="settings-row-label">{releaseInfo.name || releaseInfo.tagName}</div>
                <div className="settings-row-sub">
                  Published: {new Date(releaseInfo.publishedAt).toLocaleDateString()}
                  {releaseInfo.isNewer === false && <span style={{ marginLeft: 8, color: 'var(--success)' }}>✓ Up to date</span>}
                </div>
              </div>
              {releaseInfo.isNewer !== false && releaseInfo.assets.length > 0 && (
                <div className="flex items-center gap-2 w-full">
                  <select
                    className="cmd-select flex-1"
                    value={selectedAssetUrl}
                    onChange={e => setSelectedAssetUrl(e.target.value)}
                    disabled={downloading || !!downloadProgress}
                  >
                    {releaseInfo.assets.map(a => (
                      <option key={a.downloadUrl} value={a.downloadUrl}>
                        {a.name} ({Math.round(a.size / 1024 / 1024)} MB)
                      </option>
                    ))}
                  </select>
                  {downloading || downloadProgress ? (
                    <div className="text-sm flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 size={14} className="spin" />
                      {downloadProgress?.phase === 'extracting' ? 'Extracting...' : `Downloading... ${downloadProgress?.percent || 0}%`}
                      <button 
                        className="btn btn-ghost btn-sm text-danger" 
                        onClick={() => { window.api.cancelBackendDownload(); setDownloading(false); setDownloadProgress(null); }}
                        style={{ padding: '0 8px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={handleDownload}>Download</button>
                  )}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Click "Check Now" to query GitHub.</div>
        )}
        <div className="mt-4 pt-4 border-t">
          <button className="btn btn-secondary w-full justify-center" onClick={handleCheckUpdates} disabled={checkingUpdate || downloading}>
            <RefreshCw size={14} className={checkingUpdate ? 'spin' : ''} /> Check Now
          </button>
        </div>
      </div>
    </div>
  )
}
