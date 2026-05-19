import { create } from 'zustand'
import type { Template, BackendVersion, CommandsSchema, ReleaseInfo, RunningStatus } from '../../../shared/types'
interface CardState {
  template: Template
  status: RunningStatus
  pid?: number
  expanded: boolean
}
export interface ModelFileInfo {
  name: string; path: string; size: number; folder: string; external?: boolean
}
export interface ModelDownloadInfo {
  id: string; url: string; filename: string; destPath: string
  receivedBytes: number; totalBytes: number
  phase: 'downloading' | 'paused' | 'done' | 'error' | 'cancelled'
  percent: number; repoId?: string; speed?: number
}
interface AppStore {
  cards: CardState[]
  backends: BackendVersion[]
  models: ModelFileInfo[]
  activeBackend: BackendVersion | null
  commandsSchema: CommandsSchema | null
  releaseInfo: ReleaseInfo | null
  paths: { models: string; templates: string; backend: string } | null
  view: 'cards' | 'settings' | 'hub' | 'models' | 'about'
  showCreateModal: boolean
  editingTemplate: Template | null
  prefillModelPath: string | null
  updateDismissed: boolean
  checkingUpdate: boolean
  downloadProgress: { percent: number; phase: string } | null
  templateSearch: string
  modelDownloads: Record<string, ModelDownloadInfo>
  hfDownloads: { repoId: string; filename: string; percent: number; phase: 'downloading' | 'paused' | 'saving' | 'creating_template' | 'done' | 'error' | 'starting'; speed?: number }[]
  hubQuery: string
  hubResults: any[]
  hubSelectedModelId: string | null
  setView: (v: AppStore['view']) => void
  setShowCreateModal: (show: boolean, template?: Template | null) => void
  setPrefillModelPath: (path: string | null) => void
  setActiveBackend: (b: BackendVersion) => void
  setCommandsSchema: (s: CommandsSchema) => void
  setBackends: (b: BackendVersion[]) => void
  setModels: (m: ModelFileInfo[]) => void
  setCards: (c: CardState[]) => void
  setReleaseInfo: (r: ReleaseInfo | null) => void
  setPaths: (p: { models: string; templates: string; backend: string }) => void
  setUpdateDismissed: (v: boolean) => void
  setCheckingUpdate: (v: boolean) => void
  setDownloadProgress: (data: { percent: number; phase: string } | null) => void
  setTemplateSearch: (q: string) => void
  upsertModelDownload: (d: ModelDownloadInfo) => void
  removeModelDownload: (id: string) => void
  setHfDownload: (d: { repoId: string; filename: string; percent: number; phase: 'downloading' | 'paused' | 'saving' | 'creating_template' | 'done' | 'error' | 'starting'; speed?: number }) => void
  removeHfDownload: (filename: string) => void
  setHubQuery: (q: string) => void
  setHubResults: (r: any[]) => void
  setHubSelectedModelId: (id: string | null) => void
  addCard: (template: Template) => void
  updateCard: (id: string, template: Partial<Template>) => void
  removeCard: (id: string) => void
  setCardStatus: (id: string, status: RunningStatus, pid?: number) => void
  toggleCardExpanded: (id: string) => void
  collapseAllCards: () => void
}
export const useStore = create<AppStore>((set) => ({
  cards: [], backends: [], models: [], activeBackend: null,
  commandsSchema: null, releaseInfo: null, paths: null,
  view: 'cards', showCreateModal: false, editingTemplate: null, prefillModelPath: null,
  updateDismissed: false, checkingUpdate: false, downloadProgress: null,
  templateSearch: '', modelDownloads: {}, hfDownloads: [],
  hubQuery: '', hubResults: [], hubSelectedModelId: null,
  setView: (v) => set({ view: v }),
  setShowCreateModal: (show, template = null) => set({ showCreateModal: show, editingTemplate: template }),
  setPrefillModelPath: (path) => set({ prefillModelPath: path }),
  setActiveBackend: (b) => set({ activeBackend: b }),
  setCommandsSchema: (s) => set({ commandsSchema: s }),
  setBackends: (b) => set({ backends: b }),
  setModels: (m) => set({ models: m }),
  setCards: (c) => set({ cards: c }),
  setReleaseInfo: (r) => set({ releaseInfo: r }),
  setPaths: (p) => set({ paths: p }),
  setUpdateDismissed: (v) => set({ updateDismissed: v }),
  setCheckingUpdate: (v) => set({ checkingUpdate: v }),
  setDownloadProgress: (data) => set({ downloadProgress: data }),
  setTemplateSearch: (q) => set({ templateSearch: q }),
  upsertModelDownload: (d) => set((s) => ({ modelDownloads: { ...s.modelDownloads, [d.id]: d } })),
  removeModelDownload: (id) => set((s) => {
    const next = { ...s.modelDownloads }; delete next[id]; return { modelDownloads: next }
  }),
  setHfDownload: (d) => set((s) => {
    const arr = s.hfDownloads.filter(x => x.filename !== d.filename)
    return { hfDownloads: [...arr, d] }
  }),
  removeHfDownload: (filename) => set((s) => ({ hfDownloads: s.hfDownloads.filter(x => x.filename !== filename) })),
  setHubQuery: (q) => set({ hubQuery: q }),
  setHubResults: (r) => set({ hubResults: r }),
  setHubSelectedModelId: (id) => set({ hubSelectedModelId: id }),
  addCard: (template) => set((s) => ({ cards: [...s.cards, { template, status: 'idle', expanded: false }] })),
  updateCard: (id, partial) => set((s) => ({
    cards: s.cards.map(c => c.template.id === id ? { ...c, template: { ...c.template, ...partial, updatedAt: new Date().toISOString() } } : c)
  })),
  removeCard: (id) => set((s) => ({ cards: s.cards.filter(c => c.template.id !== id) })),
  setCardStatus: (id, status, pid) => set((s) => ({
    cards: s.cards.map(c => c.template.id === id ? { ...c, status, pid: pid ?? c.pid } : c)
  })),
  toggleCardExpanded: (id) => set((s) => ({
    cards: s.cards.map(c => c.template.id === id ? { ...c, expanded: !c.expanded } : c)
  })),
  collapseAllCards: () => set((s) => ({ cards: s.cards.map(c => ({ ...c, expanded: false })) }))
}))
