import React from 'react'
import { useStore } from '../store/useStore'
import { RefreshCw } from 'lucide-react'
interface Props {
  onCheckUpdates: () => void
}
const IS_MACOS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
export default function Titlebar({ onCheckUpdates }: Props) {
  const { checkingUpdate } = useStore()
  return (
    <header className={`titlebar${IS_MACOS ? ' titlebar-macos' : ''}`}>
      {}
      <div className="titlebar-logo">
        <img
          src="./full-logo.png"
          alt="hexllama"
          className="titlebar-logo-img"
          draggable={false}
        />
      </div>
      {}
      <div className="titlebar-drag-region" />
      <div className="titlebar-actions">
        <button
          className={`btn btn-ghost btn-icon ${checkingUpdate ? 'spin-btn' : ''}`}
          onClick={onCheckUpdates}
          title="Check for llama.cpp updates"
          disabled={checkingUpdate}
        >
          <RefreshCw size={15} className={checkingUpdate ? 'spin' : ''} />
        </button>
      </div>
    </header>
  )
}
