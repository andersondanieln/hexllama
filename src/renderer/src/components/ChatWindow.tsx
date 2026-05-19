import React, { useState, useEffect } from 'react'
import { ExternalLink, Copy, Check, RefreshCw } from 'lucide-react'

const IS_MACOS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export default function ChatWindow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [showIframe, setShowIframe] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setShowIframe(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpen = () => {
    window.api.openExternal(url)
  }

  const handleReload = () => {
    setShowIframe(false)
    setTimeout(() => {
      setReloadKey(prev => prev + 1)
      setShowIframe(true)
    }, 500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg)' }}>
      <div style={{ height: 48, WebkitAppRegion: 'drag', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: IS_MACOS ? 80 : 16, paddingRight: 16, background: 'var(--card-bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>Hexllama - Llama-UI</div>
        <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={handleReload}>
            <RefreshCw size={14} />
            Reload
          </button>
          <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={handleOpen}>
            <ExternalLink size={14} />
            Open in Browser
          </button>
        </div>
      </div>
      {!showIframe ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ opacity: 0.5 }} />
        </div>
      ) : (
        <iframe key={reloadKey} src={url} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} title="Llama Chat" />
      )}
    </div>
  )
}
