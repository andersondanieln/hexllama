import React, { useState, useEffect } from 'react'
import { ExternalLink, Copy, Check, RefreshCw, X, SquareArrowUpRight, Lock, Pin } from 'lucide-react'

const IS_MACOS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

interface Tab {
  url: string
  name: string
}

export default function ChatWindow({ url }: { url: string }) {
  // Parse parameters from URL
  const searchParams = new URLSearchParams(window.location.search)
  const isDetached = searchParams.get('detached') === 'true'
  const initialName = searchParams.get('name') || getPortLabel(url)

  // Manage tabs: { url, name }
  const [tabs, setTabs] = useState<Tab[]>([{ url, name: initialName }])
  const [activeTab, setActiveTab] = useState<string>(url)
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set([url]))
  
  // Custom pinned tabs: list of URLs
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([])
  
  // Glowing new tabs: list of URLs
  const [glowingTabs, setGlowingTabs] = useState<Set<string>>(new Set())

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const [copied, setCopied] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Add activeTab to loadedTabs set if not already present
  useEffect(() => {
    if (!loadedTabs.has(activeTab)) {
      setLoadedTabs(prev => {
        const next = new Set(prev)
        next.add(activeTab)
        return next
      })
    }
  }, [activeTab, loadedTabs])

  // Listen for new tab events and tab movements
  useEffect(() => {
    if (isDetached) return

    window.api.onAddChatTab((data: { url: string; name: string }) => {
      setTabs((prev) => {
        if (prev.some(t => t.url === data.url)) {
          setActiveTab(data.url)
          return prev
        }
        const next = [...prev, data]
        setActiveTab(data.url)
        
        // Add to glowing tabs to flash it!
        setGlowingTabs(g => {
          const nextG = new Set(g)
          nextG.add(data.url)
          return nextG
        })
        
        return next
      })
    })
  }, [isDetached])

  // Listen for cross-window tab removal (when dragged elsewhere)
  useEffect(() => {
    window.api.onTabMovedElsewhere((data: { url: string }) => {
      setTabs((prev) => {
        if (!prev.some(t => t.url === data.url)) return prev
        const nextTabs = prev.filter(t => t.url !== data.url)
        
        if (nextTabs.length === 0) {
          window.close()
          return prev
        }
        
        if (activeTab === data.url) {
          setActiveTab(nextTabs[0].url)
        }
        return nextTabs
      })
      
      setLoadedTabs(prev => {
        const next = new Set(prev)
        next.delete(data.url)
        return next
      })
      
      setPinnedTabs(prev => prev.filter(t => t !== data.url))
      setGlowingTabs(prev => {
        const next = new Set(prev)
        next.delete(data.url)
        return next
      })
    })
  }, [activeTab])

  const handleCopy = () => {
    navigator.clipboard.writeText(activeTab)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpen = () => {
    window.api.openExternal(activeTab)
  }

  const handleReload = () => {
    setReloadKey(prev => prev + 1)
  }

  const handleCloseTab = (tabUrl: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length === 1) {
      window.close()
      return
    }
    const index = tabs.findIndex(t => t.url === tabUrl)
    const nextTabs = tabs.filter(t => t.url !== tabUrl)
    setTabs(nextTabs)
    
    // Clean states
    setLoadedTabs(prev => {
      const next = new Set(prev)
      next.delete(tabUrl)
      return next
    })
    setPinnedTabs(prev => prev.filter(t => t !== tabUrl))
    setGlowingTabs(prev => {
      const next = new Set(prev)
      next.delete(tabUrl)
      return next
    })

    if (activeTab === tabUrl) {
      const nextActive = nextTabs[Math.max(0, index - 1)]
      setActiveTab(nextActive.url)
    }
  }

  const handleDetachTab = (tabUrl: string, tabName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const match = tabUrl.match(/:(\d+)/)
    if (match) {
      const port = parseInt(match[1], 10)
      window.api.openDetachedChatWindow(port, tabName)
      
      // Close tab in this window
      if (tabs.length === 1) {
        window.close()
      } else {
        const index = tabs.findIndex(t => t.url === tabUrl)
        const nextTabs = tabs.filter(t => t.url !== tabUrl)
        setTabs(nextTabs)
        setLoadedTabs(prev => {
          const next = new Set(prev)
          next.delete(tabUrl)
          return next
        })
        setPinnedTabs(prev => prev.filter(t => t !== tabUrl))
        setGlowingTabs(prev => {
          const next = new Set(prev)
          next.delete(tabUrl)
          return next
        })
        if (activeTab === tabUrl) {
          const nextActive = nextTabs[Math.max(0, index - 1)]
          setActiveTab(nextActive.url)
        }
      }
    }
  }

  const handleTogglePinTab = (tabUrl: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedTabs(prev => {
      if (prev.includes(tabUrl)) {
        return prev.filter(t => t !== tabUrl)
      } else {
        return [...prev, tabUrl]
      }
    })
  }

  function getPortLabel(tabUrl: string) {
    const match = tabUrl.match(/:(\d+)/)
    return match ? `Port ${match[1]}` : 'Chat'
  }

  const getCleanAddress = (tabUrl: string) => {
    try {
      const parsed = new URL(tabUrl)
      return `${parsed.hostname}:${parsed.port}`
    } catch {
      return tabUrl.replace(/^https?:\/\//, '')
    }
  }

  // HTML5 Drag and Drop handlers for tabs
  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sortedTabs[index].url)
    e.dataTransfer.setData('tab-name', sortedTabs[index].name)
  }

  const handleDragEnter = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return
    
    // Convert targetIndex and draggedIndex into sortedTabs mapping
    const draggedTab = sortedTabs[draggedIndex]
    const targetTab = sortedTabs[targetIndex]
    
    // Rearrange within the primary tabs list
    const originalDraggedIdx = tabs.findIndex(t => t.url === draggedTab.url)
    const originalTargetIdx = tabs.findIndex(t => t.url === targetTab.url)
    
    const nextTabs = [...tabs]
    const [removed] = nextTabs.splice(originalDraggedIdx, 1)
    nextTabs.splice(originalTargetIdx, 0, removed)
    setTabs(nextTabs)
    
    setDraggedIndex(targetIndex)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  // Handle dropping a tab dragged from another window
  const handleExternalDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedUrl = e.dataTransfer.getData('text/plain')
    const droppedName = e.dataTransfer.getData('tab-name') || getPortLabel(droppedUrl)

    if (droppedUrl && (droppedUrl.startsWith('http://127.0.0.1:') || droppedUrl.startsWith('http://localhost:'))) {
      setTabs((prev) => {
        if (prev.some(t => t.url === droppedUrl)) {
          setActiveTab(droppedUrl)
          return prev
        }
        return [...prev, { url: droppedUrl, name: droppedName }]
      })
      setActiveTab(droppedUrl)
      
      // Notify the main process to trigger tab removal across other windows
      window.api.notifyTabMoved(droppedUrl)
    }
  }

  // Sort tabs so pinned ones are at the front
  const sortedTabs = [...tabs].sort((a, b) => {
    const aPinned = pinnedTabs.includes(a.url)
    const bPinned = pinnedTabs.includes(b.url)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return 0
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg)', overflow: 'hidden' }}>
      
      {/* Dynamic Keyframes Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes tabGlow {
          0%, 100% {
            box-shadow: inset 0 0 8px rgba(22, 163, 74, 0.15), 0 0 4px rgba(22, 163, 74, 0.1);
            border-color: rgba(22, 163, 74, 0.3);
          }
          50% {
            box-shadow: inset 0 0 16px rgba(22, 163, 74, 0.5), 0 0 12px rgba(22, 163, 74, 0.35);
            border-color: var(--success);
            background: rgba(22, 163, 74, 0.08);
          }
        }
        
        .tabs-container::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `}} />

      {/* 1. COMPACT TAB BAR (Chrome Style) */}
      <div 
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleExternalDrop}
        style={{
          height: 38,
          WebkitAppRegion: 'drag',
          display: 'flex',
          alignItems: 'flex-end',
          background: 'var(--surface)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          paddingLeft: IS_MACOS ? 78 : 12,
          paddingRight: IS_MACOS ? 12 : 120, // leave space for Windows native control buttons
        }}
      >
        <div 
          className="tabs-container"
          style={{
            display: 'flex',
            gap: 3,
            height: '100%',
            alignItems: 'flex-end',
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitAppRegion: 'no-drag',
            flex: 1,
            paddingBottom: 0
          }}
        >
          {sortedTabs.map((tab, index) => {
            const isActive = tab.url === activeTab
            const isPinned = pinnedTabs.includes(tab.url)
            const isGlowing = glowingTabs.has(tab.url)
            
            return (
              <div
                key={tab.url}
                draggable={!isDetached}
                onDragStart={(e) => handleDragStart(index, e)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => {
                  setActiveTab(tab.url)
                  // Remove glow on click
                  if (isGlowing) {
                    setGlowingTabs(g => {
                      const nextG = new Set(g)
                      nextG.delete(tab.url)
                      return nextG
                    })
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: isPinned ? 4 : 6,
                  height: 30,
                  padding: isPinned ? '0 8px' : '0 10px 0 14px',
                  borderRadius: '6px 6px 0 0',
                  background: isActive ? 'var(--bg)' : 'transparent',
                  border: '1px solid transparent',
                  borderBottom: isActive ? '1px solid var(--bg)' : 'none',
                  borderLeftColor: isActive ? 'var(--border)' : 'transparent',
                  borderRightColor: isActive ? 'var(--border)' : 'transparent',
                  borderTopColor: isActive ? 'var(--border)' : 'transparent',
                  position: 'relative',
                  top: 1,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                  minWidth: isPinned ? 40 : 110,
                  maxWidth: isPinned ? 70 : 160,
                  justifyContent: 'space-between',
                  transition: 'background 150ms, color 150ms, width 200ms ease, transform 200ms ease',
                  opacity: draggedIndex === index ? 0.3 : 1,
                  animation: isGlowing ? 'tabGlow 1.5s ease-in-out infinite' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span 
                  title={isPinned ? getPortLabel(tab.url) : tab.name}
                  style={{ 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    whiteSpace: 'nowrap', 
                    flex: 1, 
                    marginRight: 4, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 4,
                    minWidth: 0
                  }}
                >
                  {isPinned && <Pin size={10} style={{ transform: 'rotate(45deg)', fill: 'var(--text-secondary)', flexShrink: 0 }} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                    {!isPinned ? tab.name : getPortLabel(tab.url).replace('Port ', '')}
                  </span>
                </span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  {/* Pin/Unpin icon button (hidden on detached windows) */}
                  {!isDetached && !isPinned && (
                    <button
                      onClick={(e) => handleTogglePinTab(tab.url, e)}
                      title="Fixar aba"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 150ms, background 150ms'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text)'
                        e.currentTarget.style.background = 'var(--bg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)'
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      <Pin size={11} />
                    </button>
                  )}

                  {/* Pinned Tab unpin action */}
                  {!isDetached && isPinned && (
                    <button
                      onClick={(e) => handleTogglePinTab(tab.url, e)}
                      title="Desafixar aba"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        color: 'var(--accent)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 150ms, background 150ms'
                      }}
                    >
                      <Pin size={11} style={{ transform: 'rotate(45deg)', fill: 'var(--accent)' }} />
                    </button>
                  )}
                  
                  {/* Detach button (only if not pinned and not detached already) */}
                  {!isDetached && !isPinned && (
                    <button
                      onClick={(e) => handleDetachTab(tab.url, tab.name, e)}
                      title="Abrir em Nova Janela"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 150ms, background 150ms'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text)'
                        e.currentTarget.style.background = 'var(--bg)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)'
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      <SquareArrowUpRight size={11} />
                    </button>
                  )}
                  
                  {/* Close button (only shown if not pinned) */}
                  {!isPinned && (
                    <button
                      onClick={(e) => handleCloseTab(tab.url, e)}
                      title="Fechar aba"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 2,
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 150ms, background 150ms'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--danger)'
                        e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)'
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 2. NAVIGATION BAR & ADDRESS BAR */}
      <div style={{
        height: 38,
        background: 'var(--surface)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 12,
        WebkitAppRegion: 'no-drag'
      }}>
        {/* Reload button */}
        <button
          onClick={handleReload}
          title="Reload page"
          style={{
            background: 'none',
            border: 'none',
            padding: 6,
            borderRadius: '50%',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 150ms, color 150ms'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg)'
            e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <RefreshCw size={14} />
        </button>

        {/* Browser Pill Address Bar */}
        <div
          onClick={handleCopy}
          title="Click to copy link"
          style={{
            flex: 1,
            background: 'var(--bg)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            borderRadius: 16,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            gap: 6,
            userSelect: 'none',
            cursor: 'pointer',
            transition: 'border-color 150ms, background 150ms'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.15)'
            e.currentTarget.style.background = 'var(--surface)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.05)'
            e.currentTarget.style.background = 'var(--bg)'
          }}
        >
          <Lock size={12} className="text-success" style={{ color: 'var(--success)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {getCleanAddress(activeTab)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {copied ? (
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>Link Copied!</span>
            ) : (
              <>
                <Copy size={10} />
                Copy
              </>
            )}
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px', fontSize: 12, height: 26, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={handleOpen}
            title="Open in default system browser"
          >
            <ExternalLink size={12} />
            Browser
          </button>
        </div>
      </div>

      {/* 3. MULTI-IFRAME CONTENT AREA (Preserves loaded states without reloading) */}
      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        {sortedTabs.map((tab) => {
          const isLoaded = loadedTabs.has(tab.url)
          if (!isLoaded) return null // lazy load tab iframes
          
          return (
            <iframe
              key={`${tab.url}-${reloadKey}`}
              src={tab.url}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#fff',
                display: tab.url === activeTab ? 'block' : 'none'
              }}
              title={`Llama Chat ${tab.url}`}
            />
          )
        })}
        
        {/* Loading Spinner */}
        {!loadedTabs.has(activeTab) && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg)',
            color: 'var(--text-muted)'
          }}>
            <RefreshCw size={24} className="spin" style={{ opacity: 0.5 }} />
          </div>
        )}
      </div>

    </div>
  )
}
