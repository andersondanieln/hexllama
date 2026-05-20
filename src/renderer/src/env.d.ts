import type { Template, BackendVersion, CommandsSchema, ReleaseInfo } from '../../shared/types'
interface ModelFileInfo {
  name: string
  path: string
  size: number
  folder: string
  external?: boolean
}
interface ModelDownloadInfo {
  id: string
  url: string
  filename: string
  destPath: string
  receivedBytes: number
  totalBytes: number
  phase: 'downloading' | 'paused' | 'done' | 'error' | 'cancelled'
  percent: number
  speed?: number
  repoId?: string
}
interface HfModelResult {
  id: string; author: string; name: string
  downloads: number; likes: number; tags: string[]; lastModified: string
}
interface HfFileResult { name: string; size: number; downloadUrl: string }
interface LlamaCppApi {
  listModels: () => Promise<ModelFileInfo[]>
  deleteModel: (filePath: string) => Promise<{ success: boolean; error?: string }>
  renameModel: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  startModelDownload: (opts: { url: string; filename: string; repoId?: string; modelFolder?: string }) => Promise<{ success: boolean; id?: string; error?: string }>
  pauseModelDownload: (id: string) => Promise<{ success: boolean; error?: string }>
  resumeModelDownload: (id: string) => Promise<{ success: boolean; error?: string }>
  cancelModelDownload: (id: string) => Promise<{ success: boolean; error?: string }>
  listModelDownloads: () => Promise<ModelDownloadInfo[]>
  onModelDownloadProgress: (cb: (data: ModelDownloadInfo) => void) => void
  removeModelDownloadListener: () => void
  listBackends: () => Promise<BackendVersion[]>
  deleteBackend: (name: string) => Promise<{ success: boolean; error?: string }>
  getCommands: (backendName: string) => Promise<CommandsSchema | null>
  saveBackendCommands: (backendName: string, schema: object) => Promise<{ success: boolean; error?: string }>
  listTemplates: () => Promise<Template[]>
  saveTemplate: (template: object) => Promise<{ success: boolean; id: string }>
  deleteTemplate: (id: string) => Promise<{ success: boolean }>
  importTemplate: () => Promise<Template | null>
  exportTemplate: (template: object) => Promise<{ success: boolean }>
  pickModelFile: () => Promise<{ name: string; path: string } | null>
  runModel: (opts: { id: string; name: string; backendPath: string; exe: string; args: string[]; openBrowser: boolean; port: number }) => Promise<{ success: boolean; pid?: number; error?: string }>
  stopModel: (id: string) => Promise<{ success: boolean; error?: string; alreadyStopped?: boolean }>
  onModelError: (cb: (data: { id: string; error: string }) => void) => void
  onModelExited: (cb: (data: { id: string }) => void) => void
  checkUpdates: () => Promise<ReleaseInfo>
  downloadRelease: (opts: { url: string; version: string; assetName: string }) => Promise<{ success: boolean; path?: string; error?: string }>
  cancelBackendDownload: () => Promise<{ success: boolean }>
  onDownloadProgress: (callback: (data: { percent: number; phase: string }) => void) => void
  removeDownloadListener: () => void
  hfSearch: (query: string) => Promise<HfModelResult[] | { error: string }>
  hfGetFiles: (repoId: string) => Promise<HfFileResult[] | { error: string }>
  hfDownloadModel: (opts: { repoId: string; filename: string; downloadUrl: string }) => Promise<{ success: boolean; error?: string }>
  hfOpenModelsDir: () => Promise<void>
  onHfDownloadProgress: (callback: (data: { percent: number; phase: string; filename: string; destPath: string; speed?: number }) => void) => void
  removeHfDownloadListener: () => void
  openFolder: (path: string) => Promise<void>
  getPaths: () => Promise<{ models: string; templates: string; backend: string }>
  listExternalModelFolders: () => Promise<string[]>
  addExternalModelFolder: () => Promise<{ success: boolean; folders?: string[] }>
  removeExternalModelFolder: (folder: string) => Promise<{ success: boolean; folders: string[] }>
  openExternal: (url: string) => Promise<void>
  openChatWindow: (port: number, name: string) => Promise<void>
  openDetachedChatWindow: (port: number, name: string) => Promise<void>
  onAddChatTab: (cb: (data: { url: string; name: string }) => void) => void
  notifyTabMoved: (url: string) => Promise<void>
  onTabMovedElsewhere: (cb: (data: { url: string }) => void) => void
  getVersion: () => Promise<string>
}
declare global {
  interface Window { api: LlamaCppApi }
}
