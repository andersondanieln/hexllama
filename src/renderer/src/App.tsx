import React, { useEffect } from 'react'
import { useStore } from './store/useStore'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import CardsView from './components/CardsView'
import SettingsView from './components/SettingsView'
import HuggingFaceView from './components/HuggingFaceView'
import ModelsView from './components/ModelsView'
import AboutView from './components/AboutView'
import CreateModal from './components/CreateModal'
import UpdateBanner from './components/UpdateBanner'
import ChatWindow from './components/ChatWindow'
import { buildDefaultTemplate } from './utils/defaultTemplate'
import type { Template } from '../../shared/types'

export default function App() {
  const searchParams = new URLSearchParams(window.location.search)
  const chatUrl = searchParams.get('chat_url')

  if (chatUrl) {
    return <ChatWindow url={chatUrl} />
  }

  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  const {
    view, showCreateModal, activeBackend,
    setBackends, setModels, setActiveBackend, setCommandsSchema,
    setCards, setPaths, setReleaseInfo, setCheckingUpdate,
    setHfDownload, removeHfDownload, addCard,
    upsertModelDownload, removeModelDownload
  } = useStore()

  useEffect(() => {
    async function init() {
      try {
        const [paths, backendsData, modelsData] = await Promise.all([
          window.api.getPaths(),
          window.api.listBackends(),
          window.api.listModels()
        ])
        setPaths(paths)
        setBackends(backendsData)
        setModels(modelsData)
        if (backendsData.length > 0) {
          setActiveBackend(backendsData[0])
          const cmds = await window.api.getCommands(backendsData[0].name)
          if (cmds) setCommandsSchema(cmds)
        } else {
          const cmds = await window.api.getCommands('')
          if (cmds) setCommandsSchema(cmds)
        }
        const templates = await window.api.listTemplates()
        setCards(
          (templates as Template[]).map((t) => ({
            template: t,
            status: 'idle',
            expanded: false
          }))
        )
      } catch (e) {
        console.error('Init error:', e)
      }
      checkUpdates()
    }
    init()
    window.api.onModelError((data) => {
      useStore.getState().setCardStatus(data.id, 'error')
      alert(`Model execution error:\n\n${data.error}`)
    })
    window.api.onModelExited((data) => {
      const s = useStore.getState()
      const card = s.cards.find(c => c.template.id === data.id)
      if (card && card.status === 'running') s.setCardStatus(data.id, 'idle')
    })
  }, [])

  useEffect(() => {
    window.api.onHfDownloadProgress(async (data) => {

      upsertModelDownload({
        id: (data as any).id || data.filename,
        url: '',
        filename: data.filename,
        destPath: data.destPath,
        receivedBytes: (data as any).receivedBytes ?? 0,
        totalBytes: (data as any).totalBytes ?? 0,
        speed: (data as any).speed ?? 0,
        percent: data.percent,
        phase: data.phase as any,
        repoId: (data as any).repoId
      })

      if (data.phase === 'done') {
        
        setHfDownload({ repoId: '', filename: data.filename, percent: 100, phase: 'saving' })

        const models = await window.api.listModels()
        useStore.getState().setModels(models)

        setHfDownload({ repoId: '', filename: data.filename, percent: 100, phase: 'creating_template' })
        const { cards, activeBackend: backend, addCard: add } = useStore.getState()
        const template = buildDefaultTemplate(
          data.filename,
          data.destPath,
          cards.map(c => c.template),
          backend?.name || ''
        )
        const res = await window.api.saveTemplate(template)
        if (res.success) add({ ...template, id: res.id })

        setHfDownload({ repoId: '', filename: data.filename, percent: 100, phase: 'done' })
        setTimeout(() => removeHfDownload(data.filename), 2500)
      } else {
        
        setHfDownload({
          repoId: '',
          filename: data.filename,
          percent: data.percent,
          phase: data.phase as any,
          speed: (data as any).speed
        })
      }
    })
    return () => window.api.removeHfDownloadListener()
  }, [])

  useEffect(() => {
    window.api.onModelDownloadProgress(async (data: any) => {
      
      if (data.repoId) return
      upsertModelDownload(data)
      if (data.phase === 'done') {
        const models = await window.api.listModels()
        useStore.getState().setModels(models)
        
        const { cards, activeBackend: backend, addCard: add } = useStore.getState()
        const template = buildDefaultTemplate(
          data.filename,
          data.destPath,
          cards.map(c => c.template),
          backend?.name || ''
        )
        const res = await window.api.saveTemplate(template)
        if (res.success) add({ ...template, id: res.id })
        setTimeout(() => removeModelDownload(data.id), 4000)
      }
    })
    
    window.api.listModelDownloads().then(list => {
      list.forEach((dl: any) => upsertModelDownload(dl))
    })
    return () => window.api.removeModelDownloadListener()
  }, [])

  useEffect(() => {
    if (!activeBackend) return
    window.api.getCommands(activeBackend.name).then((cmds) => {
      if (cmds) setCommandsSchema(cmds)
    })
  }, [activeBackend, setCommandsSchema])

  useEffect(() => {
    window.api.onDownloadProgress((data) => {
      useStore.getState().setDownloadProgress(data)
    })
    return () => window.api.removeDownloadListener()
  }, [])

  async function checkUpdates() {
    setCheckingUpdate(true)
    try {
      const info = await window.api.checkUpdates()
      setReleaseInfo(info)
    } finally {
      setCheckingUpdate(false)
    }
  }

  function renderView() {
    if (view === 'hub') return <HuggingFaceView />
    if (view === 'settings') return <SettingsView />
    if (view === 'models') return <ModelsView />
    if (view === 'about') return <AboutView />
    return <CardsView />
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text)'
      }}>
        <img src="./icon.png" alt="Hexllama Icon" style={{ width: 128, height: 128, marginBottom: 24, imageRendering: 'crisp-edges' }} draggable={false} />
        <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.5px' }}>All AI-Glory to the Llama.cpp</h2>
      </div>
    )
  }

  return (
    <div className="app">
      <Titlebar onCheckUpdates={checkUpdates} />
      <UpdateBanner />
      <div className="main-layout">
        <Sidebar />
        <main className="content">
          {renderView()}
        </main>
      </div>
      {showCreateModal && <CreateModal />}

      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 80, zIndex: 998,
          background: 'linear-gradient(to top, var(--surface) 20%, transparent)',
          pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
          padding: '0 24px 24px 0'
        }}
      >
        <div
          onClick={() => window.api.openExternal('https://andercoder.com')}
          style={{
            cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.2s',
            pointerEvents: 'auto', filter: 'invert(1)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
          title="AnderCoder"
        >
          <img src="./logo-stroke.svg" alt="AnderCoder" style={{ height: 24, display: 'block' }} draggable={false} />
        </div>
      </div>
    </div>
  )
}
