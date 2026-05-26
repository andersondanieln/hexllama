import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
const api = {
  listModels: () => ipcRenderer.invoke('list-models'),
  deleteModel: (filePath: string) => ipcRenderer.invoke('delete-model', filePath),
  renameModel: (oldPath: string, newName: string) => ipcRenderer.invoke('rename-model', oldPath, newName),
  startModelDownload: (opts: object) => ipcRenderer.invoke('start-model-download', opts),
  pauseModelDownload: (id: string) => ipcRenderer.invoke('pause-model-download', id),
  resumeModelDownload: (id: string) => ipcRenderer.invoke('resume-model-download', id),
  cancelModelDownload: (id: string) => ipcRenderer.invoke('cancel-model-download', id),
  listModelDownloads: () => ipcRenderer.invoke('list-model-downloads'),
  onModelDownloadProgress: (cb: (data: object) => void) => {
    ipcRenderer.removeAllListeners('model-download-progress')
    ipcRenderer.on('model-download-progress', (_e, data) => cb(data))
  },
  removeModelDownloadListener: () => ipcRenderer.removeAllListeners('model-download-progress'),
  listBackends: () => ipcRenderer.invoke('list-backends'),
  deleteBackend: (name: string) => ipcRenderer.invoke('delete-backend', name),
  getCommands: (backendName: string) => ipcRenderer.invoke('get-commands', backendName),
  saveBackendCommands: (backendName: string, schema: object) => ipcRenderer.invoke('save-backend-commands', backendName, schema),
  listTemplates: () => ipcRenderer.invoke('list-templates'),
  saveTemplate: (template: object) => ipcRenderer.invoke('save-template', template),
  deleteTemplate: (id: string) => ipcRenderer.invoke('delete-template', id),
  importTemplate: () => ipcRenderer.invoke('import-template'),
  exportTemplate: (template: object) => ipcRenderer.invoke('export-template', template),
  pickModelFile: () => ipcRenderer.invoke('pick-model-file'),
  pickAnyFile: () => ipcRenderer.invoke('pick-any-file'),
  runModel: (opts: object) => ipcRenderer.invoke('run-model', opts),
  stopModel: (id: string) => ipcRenderer.invoke('stop-model', id),
  onModelError: (cb: (data: { id: string; error: string }) => void) => {
    ipcRenderer.removeAllListeners('model-error')
    ipcRenderer.on('model-error', (_e, data) => cb(data))
  },
  onModelExited: (cb: (data: { id: string }) => void) => {
    ipcRenderer.removeAllListeners('model-exited')
    ipcRenderer.on('model-exited', (_e, data) => cb(data))
  },
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadRelease: (opts: object) => ipcRenderer.invoke('download-release', opts),
  cancelBackendDownload: () => ipcRenderer.invoke('cancel-backend-download'),
  onDownloadProgress: (callback: (data: { percent: number; phase: string }) => void) => {
    ipcRenderer.removeAllListeners('download-progress')
    ipcRenderer.on('download-progress', (_event, data) => callback(data))
  },
  removeDownloadListener: () => ipcRenderer.removeAllListeners('download-progress'),
  hfSearch: (query: string, sort?: string, direction?: number) => ipcRenderer.invoke('hf-search', query, sort, direction),
  hfGetFiles: (repoId: string) => ipcRenderer.invoke('hf-get-files', repoId),
  hfDownloadModel: (opts: object) => ipcRenderer.invoke('hf-download-model', opts),
  hfOpenModelsDir: () => ipcRenderer.invoke('hf-open-models-dir'),
  onHfDownloadProgress: (callback: (data: { percent: number; phase: string; filename: string; destPath: string }) => void) => {
    ipcRenderer.removeAllListeners('hf-download-progress')
    ipcRenderer.on('hf-download-progress', (_event, data) => callback(data))
  },
  removeHfDownloadListener: () => ipcRenderer.removeAllListeners('hf-download-progress'),
  openFolder: (path: string) => ipcRenderer.invoke('open-folder', path),
  getPaths: () => ipcRenderer.invoke('get-paths'),
  listExternalModelFolders: () => ipcRenderer.invoke('list-external-model-folders'),
  addExternalModelFolder: () => ipcRenderer.invoke('add-external-model-folder'),
  removeExternalModelFolder: (folder: string) => ipcRenderer.invoke('remove-external-model-folder', folder),
  getDownloadFolder: () => ipcRenderer.invoke('get-download-folder'),
  setDownloadFolder: (folder: string) => ipcRenderer.invoke('set-download-folder', folder),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  openChatWindow: (port: number, name: string) => ipcRenderer.invoke('open-chat-window', port, name),
  openDetachedChatWindow: (port: number, name: string) => ipcRenderer.invoke('open-detached-chat-window', port, name),
  onAddChatTab: (cb: (data: { url: string; name: string }) => void) => {
    ipcRenderer.removeAllListeners('add-chat-tab')
    ipcRenderer.on('add-chat-tab', (_e, data) => cb(data))
  },
  notifyTabMoved: (url: string) => ipcRenderer.invoke('notify-tab-moved', url),
  onTabMovedElsewhere: (cb: (data: { url: string }) => void) => {
    ipcRenderer.removeAllListeners('tab-moved-elsewhere')
    ipcRenderer.on('tab-moved-elsewhere', (_e, data) => cb(data))
  },
  getVersion: () => ipcRenderer.invoke('get-version'),
  benchRun: (opts: { backendPath: string; backendExe?: string; modelPath: string; reps?: number; params: Record<string, string> }) =>
    ipcRenderer.invoke('bench-run', opts),
  onBenchProgress: (cb: (data: { line: string }) => void) => {
    ipcRenderer.removeAllListeners('bench-progress')
    ipcRenderer.on('bench-progress', (_e, data) => cb(data))
  },
  removeBenchProgressListener: () => ipcRenderer.removeAllListeners('bench-progress'),
  benchShowResults: (rows: unknown[], context?: { backendPath: string; backendExe?: string; modelPath: string }) =>
    ipcRenderer.invoke('bench-show-results', rows, context),
  getLatestBenchResults: () => ipcRenderer.invoke('get-latest-bench-results'),
  benchExportMarkdown: (content: string) => ipcRenderer.invoke('bench-export-markdown', content),
  benchExportPdf: () => ipcRenderer.invoke('bench-export-pdf'),
}
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
