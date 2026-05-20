import React from 'react'
import { useStore } from '../store/useStore'
import { LayoutGrid, Settings, FolderOpen, HardDrive, Search, Database } from 'lucide-react'

export default function Sidebar() {
  const { view, setView, backends, activeBackend, setActiveBackend, setCommandsSchema, paths, compactSidebarEnabled } = useStore()

  async function switchBackend(name: string) {
    const b = backends.find((x) => x.name === name)
    if (!b) return
    setActiveBackend(b)
    const cmds = await window.api.getCommands(name)
    if (cmds) setCommandsSchema(cmds)
  }

  return (
    <nav className={`sidebar ${compactSidebarEnabled ? 'sidebar-compact' : ''}`}>
      {/* Compact Sidebar Scoped Stylesheet */}
      <style dangerouslySetInnerHTML={{ __html: `
        .sidebar {
          transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1), padding 220ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .sidebar-compact {
          width: 60px !important;
          overflow-x: hidden !important;
          white-space: nowrap;
          padding: 16px 8px !important;
          align-items: center !important;
        }
        
        .sidebar-compact:hover {
          width: 220px !important;
          padding: 16px 12px !important;
          align-items: stretch !important;
        }
        
        /* Smooth labels fade and visibility transition */
        .sidebar-compact .nav-section-label {
          opacity: 0;
          height: 0;
          margin: 0;
          padding: 0;
          overflow: hidden;
          transition: opacity 120ms ease, height 220ms ease, margin 220ms ease, padding 220ms ease, visibility 120ms ease;
          visibility: hidden;
        }
        
        .sidebar-compact:hover .nav-section-label {
          opacity: 1;
          height: auto;
          visibility: visible;
          margin-top: 12px;
          padding: 8px 8px 4px;
        }
        
        /* Remove text from flex flow when collapsed to allow mathematical centering of the icon */
        .sidebar-compact .nav-item-text {
          position: absolute !important;
          opacity: 0 !important;
          visibility: hidden !important;
          transition: opacity 120ms ease;
        }
        
        .sidebar-compact:hover .nav-item-text {
          position: static !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        
        /* Convert buttons to perfectly centered 44px squares when collapsed */
        .sidebar-compact .nav-item {
          display: flex;
          align-items: center;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
          padding: 0 !important;
          margin: 2px 0;
          transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1), height 220ms ease, padding 220ms ease, margin 220ms ease, justify-content 220ms ease, border-radius 220ms ease;
          border-radius: 8px !important;
          flex-shrink: 0;
        }
        
        /* Restore buttons back to full capsules on hover */
        .sidebar-compact:hover .nav-item {
          justify-content: flex-start !important;
          width: 196px !important;
          height: 38px !important;
          padding: 8px 12px !important;
          margin: 0;
          border-radius: var(--radius-sm) !important;
        }
        
        /* Center icons when collapsed, restore margins on hover */
        .sidebar-compact .nav-item svg,
        .sidebar-compact .about-icon {
          flex-shrink: 0;
          margin-right: 0 !important;
          transition: margin-right 220ms ease;
        }
        
        .sidebar-compact:hover .nav-item svg,
        .sidebar-compact:hover .about-icon {
          margin-right: 12px !important;
        }
        
        .sidebar-compact .about-icon {
          display: inline-block;
          width: 16px;
          text-align: center;
          line-height: 1;
        }
        
        /* Spacing for folders trigger container */
        .sidebar-compact .folder-triggers-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        
        .sidebar-compact:hover .folder-triggers-container {
          align-items: stretch;
          width: 100%;
        }
      `}} />

      <span className="nav-section-label">Navigation</span>
      <button
        className={`nav-item ${view === 'cards' ? 'active' : ''}`}
        onClick={() => setView('cards')}
      >
        <LayoutGrid size={16} />
        <span className="nav-item-text">My Templates</span>
      </button>
      <button
        className={`nav-item ${view === 'models' ? 'active' : ''}`}
        onClick={() => setView('models')}
      >
        <Database size={16} />
        <span className="nav-item-text">Models</span>
      </button>
      <button
        className={`nav-item ${view === 'hub' ? 'active' : ''}`}
        onClick={() => setView('hub')}
      >
        <Search size={16} />
        <span className="nav-item-text">Model Hub</span>
      </button>
      <button
        className={`nav-item ${view === 'settings' ? 'active' : ''}`}
        onClick={() => setView('settings')}
      >
        <Settings size={16} />
        <span className="nav-item-text">Settings</span>
      </button>
      <button
        className={`nav-item ${view === 'about' ? 'active' : ''}`}
        onClick={() => setView('about')}
      >
        <span className="about-icon" style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>i</span>
        <span className="nav-item-text">About</span>
      </button>

      {backends.length > 0 && (
        <>
          <span className="nav-section-label" style={{ marginTop: 12 }}>Backend</span>
          {backends.map((b) => (
            <button
              key={b.name}
              className={`nav-item ${activeBackend?.name === b.name ? 'active' : ''}`}
              onClick={() => switchBackend(b.name)}
              title={b.path}
            >
              <HardDrive size={16} />
              <span className="nav-item-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                {b.name}
              </span>
            </button>
          ))}
        </>
      )}

      {backends.length === 0 && (
        <>
          <span className="nav-section-label" style={{ marginTop: 12 }}>Backend</span>
          <div className="nav-item-text" style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            No backend found.<br />Download one in Settings.
          </div>
        </>
      )}

      {paths && (
        <div className="folder-triggers-container" style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button className="nav-item" onClick={() => window.api.openFolder(paths.backend)} title={paths.backend}>
            <FolderOpen size={16} />
            <span className="nav-item-text">Open /backend</span>
          </button>
          <button className="nav-item" onClick={() => window.api.openFolder(paths.models)} title={paths.models}>
            <FolderOpen size={16} />
            <span className="nav-item-text">Open /models</span>
          </button>
        </div>
      )}
    </nav>
  )
}
