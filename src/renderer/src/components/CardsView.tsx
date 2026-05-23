import React from 'react'
import { useStore } from '../store/useStore'
import ModelCard from './ModelCard'
import { Plus, Upload, Search } from 'lucide-react'
import type { Template } from '../../../shared/types'
export default function CardsView() {
  const { cards, setShowCreateModal, addCard, templateSearch, setTemplateSearch } = useStore()
  async function handleImport() {
    const template = await window.api.importTemplate()
    if (template) {
      addCard(template as Template)
    }
  }
  const filtered = templateSearch.trim()
    ? cards.filter(c => {
        const q = templateSearch.toLowerCase()
        return c.template.name.toLowerCase().includes(q) ||
               (c.template.description || '').toLowerCase().includes(q) ||
               c.template.tags?.some(t => t.toLowerCase().includes(q))
      })
    : cards
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Templates</h1>
          <p className="page-subtitle">
            {cards.length === 0
              ? 'Create your first template to get started'
              : `${filtered.length} of ${cards.length} template${cards.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={handleImport}>
            <Upload size={15} />
            Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} />
            New Template
          </button>
        </div>
      </div>
      {}
      {cards.length > 0 && (
        <div className="template-search-bar">
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            className="template-search-input"
            placeholder="Search templates..."
            value={templateSearch}
            onChange={e => setTemplateSearch(e.target.value)}
          />
          {templateSearch && (
            <button
              className="template-search-clear"
              onClick={() => setTemplateSearch('')}
              title="Clear"
            >×</button>
          )}
        </div>
      )}
      {cards.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </div>
          <h3>No templates yet</h3>
          <p>Create a template to configure and launch a llama.cpp model with one click.</p>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} />
            Create Template
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 24px' }}>
          <h3 style={{ fontSize: 15 }}>No matches</h3>
          <p>No templates found for "{templateSearch}".</p>
          <button className="btn btn-ghost" onClick={() => setTemplateSearch('')}>Clear search</button>
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map((card) => (
            <ModelCard key={card.template.id} card={card} />
          ))}
          <button className="add-card" onClick={() => setShowCreateModal(true)}>
            <Plus size={28} />
            <span>Add Template</span>
          </button>
        </div>
      )}
    </div>
  )
}
