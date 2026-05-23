import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import {
  existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync,
  unlinkSync, createWriteStream, statSync, rmdirSync, renameSync, promises as fsPromises
} from 'fs'
import { join, extname, basename, dirname, resolve } from 'path'
import { spawn, ChildProcess } from 'child_process'
import https from 'https'
import http from 'http'
import { app } from 'electron'
import extract from 'extract-zip'
import net from 'net'
const APP_ROOT = app.isPackaged ? join(app.getPath('userData')) : join(process.cwd())
const MODELS_DIR    = join(APP_ROOT, 'models')
const TEMPLATES_DIR = join(APP_ROOT, 'templates')
const BACKEND_DIR   = join(APP_ROOT, 'backend')
const SETTINGS_PATH = join(APP_ROOT, 'settings.json')
for (const dir of [MODELS_DIR, TEMPLATES_DIR, BACKEND_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}
function isSafePath(base: string, target: string): boolean {
  return resolve(target).startsWith(resolve(base))
}
interface AppSettings { externalModelFolders: string[] }
async function loadSettings(): Promise<AppSettings> {
  try {
    if (!existsSync(SETTINGS_PATH)) return { externalModelFolders: [] }
    const data = JSON.parse(await fsPromises.readFile(SETTINGS_PATH, 'utf-8'))
    return { externalModelFolders: Array.isArray(data.externalModelFolders) ? data.externalModelFolders : [] }
  } catch { return { externalModelFolders: [] } }
}
async function saveSettings(s: AppSettings): Promise<void> {
  await fsPromises.writeFile(SETTINGS_PATH, JSON.stringify(s, null, 2))
}
const runningProcesses = new Map<string, ChildProcess>()
let sharedChatWindow: BrowserWindow | null = null
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false)
      } else {
        resolve(true)
      }
    })
    server.once('listening', () => {
      server.close(() => {
        resolve(true)
      })
    })
    server.listen(port, '127.0.0.1')
  })
}
interface DownloadTask {
  id: string
  url: string
  filename: string
  destPath: string
  receivedBytes: number
  totalBytes: number
  speed: number
  phase: 'downloading' | 'paused' | 'done' | 'error' | 'cancelled'
  repoId?: string
  cancelFn?: () => void
}
const downloadTasks = new Map<string, DownloadTask>()
const broadcastTimes = new Map<string, number>()
const BROADCAST_THROTTLE_MS = 200
function canBroadcast(id: string): boolean {
  const now = Date.now()
  const last = broadcastTimes.get(id) || 0
  if (now - last >= BROADCAST_THROTTLE_MS) { broadcastTimes.set(id, now); return true }
  return false
}
function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'llamabox/1.0.0', Accept: 'application/json' } }
    const get = url.startsWith('https') ? https.get : http.get
    get(url, opts, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}
function startDownload(
  url: string,
  destPath: string,
  startByte: number,
  onProgress: (received: number, total: number, speed: number) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  let destroyed = false
  let currentReq: ReturnType<typeof https.get> | null = null
  const flags = startByte > 0 ? 'a' : 'w'
  const file = createWriteStream(destPath, { flags })

  let speedBytes = 0
  let lastSpeedCheck = Date.now()
  let currentSpeed = 0

  const attempt = (currentUrl: string) => {
    const get = currentUrl.startsWith('https') ? https.get : http.get
    const headers: Record<string, string> = { 'User-Agent': 'hexllama/1.0' }
    if (startByte > 0) headers['Range'] = `bytes=${startByte}-`
    currentReq = get(currentUrl, { headers }, (res) => {
      if (destroyed) { res.destroy(); return }
      if (res.statusCode === 301 || res.statusCode === 302) {
        return attempt(res.headers.location!)
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        if (!destroyed) onError(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const contentLength = parseInt(res.headers['content-length'] || '0', 10)
      const totalBytes = contentLength + startByte
      let receivedBytes = startByte

      res.on('data', (chunk: Buffer) => {
        if (destroyed) return
        file.write(chunk)
        receivedBytes += chunk.length
        speedBytes += chunk.length

        const now = Date.now()
        const elapsed = (now - lastSpeedCheck) / 1000
        if (elapsed >= 0.5) {
          currentSpeed = speedBytes / elapsed
          speedBytes = 0
          lastSpeedCheck = now
        }
        onProgress(receivedBytes, totalBytes, currentSpeed)
      })

      res.on('end', () => {
        if (destroyed) return
        file.end(() => {
          if (!destroyed) onDone()
        })
      })

      res.on('error', (err) => {
        if (!destroyed) { file.destroy(); onError(err) }
      })
    }).on('error', (err) => {
      if (!destroyed) { file.destroy(); onError(err) }
    })
  }
  attempt(url)
  return () => {
    if (destroyed) return
    destroyed = true
    currentReq?.destroy()
    
    file.end()
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('list-models', async () => {
    const exts = ['.gguf', '.bin', '.ggml']
    const results: { name: string; path: string; size: number; folder: string; external: boolean }[] = []
    const seen = new Set<string>()
    const scan = async (dir: string, external: boolean) => {
      try {
        const files = await fsPromises.readdir(dir, { withFileTypes: true })
        for (const e of files) {
          if (e.isDirectory()) await scan(join(dir, e.name), external)
          else if (exts.includes(extname(e.name).toLowerCase()) && !e.name.endsWith('.tmp')) {
            const fp = join(dir, e.name)
            const key = resolve(fp)
            if (seen.has(key)) continue
            seen.add(key)
            const st = await fsPromises.stat(fp)
            results.push({ name: e.name, path: fp, size: st.size, folder: basename(dir), external })
          }
        }
      } catch {}
    }
    if (existsSync(MODELS_DIR)) await scan(MODELS_DIR, false)
    const settings = await loadSettings()
    for (const folder of settings.externalModelFolders) {
      if (existsSync(folder)) await scan(folder, true)
    }
    return results
  })
  ipcMain.handle('list-external-model-folders', async () => (await loadSettings()).externalModelFolders)
  ipcMain.handle('add-external-model-folder', async () => {
    const r = await dialog.showOpenDialog({ title: 'Add External Model Folder', properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths.length) return { success: false }
    const folder = r.filePaths[0]
    const s = await loadSettings()
    if (!s.externalModelFolders.includes(folder)) {
      s.externalModelFolders.push(folder)
      await saveSettings(s)
    }
    return { success: true, folders: s.externalModelFolders }
  })
  ipcMain.handle('remove-external-model-folder', async (_e, folder: string) => {
    const s = await loadSettings()
    s.externalModelFolders = s.externalModelFolders.filter(f => f !== folder)
    await saveSettings(s)
    return { success: true, folders: s.externalModelFolders }
  })
  ipcMain.handle('delete-model', (_e, filePath: string) => {
    try {
      if (!isSafePath(MODELS_DIR, filePath)) return { success: false, error: 'Access denied' }
      unlinkSync(filePath)
      const dir = dirname(filePath)
      if (dir !== MODELS_DIR) {
        try { if (readdirSync(dir).length === 0) rmdirSync(dir) } catch {}
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('rename-model', (_e, oldPath: string, newName: string) => {
    try {
      if (!isSafePath(MODELS_DIR, oldPath)) return { success: false, error: 'Access denied' }
      const dir = dirname(oldPath)
      const newPath = join(dir, newName + extname(oldPath))
      if (!isSafePath(MODELS_DIR, newPath)) return { success: false, error: 'Access denied' }
      renameSync(oldPath, newPath)
      return { success: true, newPath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('start-model-download', (event, opts: {
    url: string
    filename: string
    repoId?: string
    modelFolder?: string
  }) => {
    const id = opts.filename
    if (downloadTasks.has(id)) {
      const t = downloadTasks.get(id)!
      if (t.phase === 'downloading') return { success: false, error: 'Already downloading' }
    }
    const folder = opts.modelFolder || opts.repoId?.split('/').pop() || 'downloads'
    const destDir = join(MODELS_DIR, folder)
    if (!isSafePath(MODELS_DIR, destDir)) return { success: false, error: 'Access denied' }
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    const finalPath = join(destDir, opts.filename)
    const tmpPath = finalPath + '.tmp'
    const task: DownloadTask = {
      id, url: opts.url, filename: opts.filename,
      destPath: finalPath, receivedBytes: 0, totalBytes: 0, speed: 0,
      phase: 'downloading', repoId: opts.repoId
    }
    const broadcastProgress = (t: DownloadTask, force = false) => {
      if (!force && !canBroadcast(t.id)) return
      const payload = {
        id: t.id, filename: t.filename,
        percent: t.totalBytes > 0 ? Math.round((t.receivedBytes / t.totalBytes) * 100) : 0,
        receivedBytes: t.receivedBytes, totalBytes: t.totalBytes,
        speed: t.speed, phase: t.phase, destPath: t.destPath,
        repoId: t.repoId
      }
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) win.webContents.send('model-download-progress', payload)
      })
    }
    task.cancelFn = startDownload(
      opts.url, tmpPath, 0,
      (received, total, speed) => { task.receivedBytes = received; task.totalBytes = total; task.speed = speed; broadcastProgress(task) },
      () => {
        try { renameSync(tmpPath, finalPath) } catch {}
        task.phase = 'done'; task.speed = 0; broadcastProgress(task, true)
        setTimeout(() => { downloadTasks.delete(id); broadcastTimes.delete(id) }, 5000)
      },
      (err) => { task.phase = 'error'; task.speed = 0; broadcastProgress(task, true); console.error('Download error:', err) }
    )
    downloadTasks.set(id, task)
    broadcastProgress(task, true)
    return { success: true, id }
  })
  ipcMain.handle('pause-model-download', (_e, id: string) => {
    const task = downloadTasks.get(id)
    if (!task || task.phase !== 'downloading') return { success: false, error: 'Not downloading' }
    task.cancelFn?.()
    task.phase = 'paused'
    task.speed = 0
    
    broadcastTimes.delete(id)
    const payload = {
      id, filename: task.filename, phase: 'paused', speed: 0,
      percent: task.totalBytes > 0 ? Math.round((task.receivedBytes / task.totalBytes) * 100) : 0,
      receivedBytes: task.receivedBytes, totalBytes: task.totalBytes,
      destPath: task.destPath, repoId: task.repoId
    }
    BrowserWindow.getAllWindows().forEach(win => { 
      if (!win.isDestroyed()) {
        win.webContents.send('model-download-progress', payload)
        if (task.repoId) win.webContents.send('hf-download-progress', payload)
      }
    })
    return { success: true }
  })
  ipcMain.handle('resume-model-download', (_e, id: string) => {
    const task = downloadTasks.get(id)
    if (!task || task.phase !== 'paused') return { success: false, error: 'Not paused' }
    task.phase = 'downloading'
    const tmpPath = task.destPath + '.tmp'
    
    try { task.receivedBytes = statSync(tmpPath).size } catch {}
    const broadcastProgress = (t: DownloadTask, force = false) => {
      if (!force && !canBroadcast(t.id)) return
      const payload = {
        id: t.id, filename: t.filename, phase: t.phase, speed: t.speed,
        percent: t.totalBytes > 0 ? Math.round((t.receivedBytes / t.totalBytes) * 100) : 0,
        receivedBytes: t.receivedBytes, totalBytes: t.totalBytes, destPath: t.destPath,
        repoId: t.repoId
      }
      BrowserWindow.getAllWindows().forEach(win => { 
        if (!win.isDestroyed()) {
          win.webContents.send('model-download-progress', payload)
          if (t.repoId) win.webContents.send('hf-download-progress', payload)
        }
      })
    }
    const startByte = task.receivedBytes
    task.cancelFn = startDownload(
      task.url, tmpPath, startByte,
      (received, total, speed) => { task.receivedBytes = received; task.totalBytes = total; task.speed = speed; broadcastProgress(task) },
      () => {
        try { renameSync(tmpPath, task.destPath) } catch {}
        task.phase = 'done'; task.speed = 0; broadcastProgress(task, true)
        setTimeout(() => { downloadTasks.delete(id); broadcastTimes.delete(id) }, 5000)
      },
      (err) => { task.phase = 'error'; task.speed = 0; broadcastProgress(task, true); console.error('Resume error:', err) }
    )
    broadcastProgress(task, true)
    return { success: true }
  })
  ipcMain.handle('cancel-model-download', (event, id: string) => {
    const task = downloadTasks.get(id)
    if (!task) return { success: false, error: 'Not found' }
    task.cancelFn?.()
    task.phase = 'cancelled'
    
    try { unlinkSync(task.destPath + '.tmp') } catch {}
    try { unlinkSync(task.destPath) } catch {}
    const payload = { id, filename: task.filename, phase: 'cancelled', percent: 0, receivedBytes: 0, totalBytes: 0, speed: 0 }
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('model-download-progress', payload)
        if (task.repoId) win.webContents.send('hf-download-progress', payload)
      }
    })
    downloadTasks.delete(id)
    return { success: true }
  })
  ipcMain.handle('list-model-downloads', () => {
    return Array.from(downloadTasks.values()).map(t => ({
      id: t.id, url: t.url, filename: t.filename, destPath: t.destPath,
      receivedBytes: t.receivedBytes, totalBytes: t.totalBytes, phase: t.phase,
      percent: t.totalBytes > 0 ? Math.round((t.receivedBytes / t.totalBytes) * 100) : 0
    }))
  })
  ipcMain.handle('list-backends', () => {
    if (!existsSync(BACKEND_DIR)) return []
    const findExecutable = (dir: string, depth = 0): string | null => {
      if (depth > 3) return null
      try {
        const files = readdirSync(dir, { withFileTypes: true })
        const names = process.platform === 'win32'
          ? ['llama-server.exe', 'llama-server', 'main.exe', 'main', 'server.exe', 'server']
          : ['llama-server', 'main', 'server']
        for (const f of files) {
          if (!f.isDirectory() && names.includes(f.name.toLowerCase())) return f.name
        }
        for (const f of files) {
          if (f.isDirectory()) {
            const sub = findExecutable(join(dir, f.name), depth + 1)
            if (sub) return join(f.name, sub)
          }
        }
      } catch {}
      return null
    }
    const backends = readdirSync(BACKEND_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const commandsPath = join(BACKEND_DIR, d.name, 'commands.json')
        const basePath = join(BACKEND_DIR, d.name)
        return { name: d.name, path: basePath, hasCommands: existsSync(commandsPath), exe: findExecutable(basePath) }
      })
    backends.sort((a, b) => {
      const n = (s: string) => parseInt((s.match(/(\d{3,6})/) || ['0', '0'])[1], 10)
      return n(b.name) - n(a.name)
    })
    return backends
  })
  ipcMain.handle('delete-backend', (_e, backendName: string) => {
    try {
      const backendPath = join(BACKEND_DIR, backendName)
      if (!isSafePath(BACKEND_DIR, backendPath)) return { success: false, error: 'Access denied' }
      const rm = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name)
          e.isDirectory() ? rm(p) : unlinkSync(p)
        }
        rmdirSync(dir)
      }
      rm(backendPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('get-commands', (_e, backendName: string) => {
    const commandsPath = join(BACKEND_DIR, backendName, 'commands.json')
    if (!isSafePath(BACKEND_DIR, commandsPath)) return null
    if (existsSync(commandsPath)) return JSON.parse(readFileSync(commandsPath, 'utf-8'))
    const defaultPath = app.isPackaged
      ? join(process.resourcesPath, 'resources', 'commands.json')
      : join(process.cwd(), 'resources', 'commands.json')
    if (existsSync(defaultPath)) return JSON.parse(readFileSync(defaultPath, 'utf-8'))
    return null
  })
  ipcMain.handle('save-backend-commands', (_e, backendName: string, schema: unknown) => {
    try {
      const backendPath = join(BACKEND_DIR, backendName)
      if (!isSafePath(BACKEND_DIR, backendPath)) return { success: false, error: 'Access denied' }
      if (!existsSync(backendPath)) mkdirSync(backendPath, { recursive: true })
      writeFileSync(join(backendPath, 'commands.json'), JSON.stringify(schema, null, 2))
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('list-templates', () => {
    if (!existsSync(TEMPLATES_DIR)) return []
    return readdirSync(TEMPLATES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try { return { ...JSON.parse(readFileSync(join(TEMPLATES_DIR, f), 'utf-8')), _file: f } }
        catch { return null }
      })
      .filter(Boolean)
  })
  ipcMain.handle('save-template', (_e, template: Record<string, unknown>) => {
    const id = (template.id as string) || Date.now().toString()
    writeFileSync(join(TEMPLATES_DIR, `${id}.json`), JSON.stringify({ ...template, id }, null, 2))
    return { success: true, id }
  })
  ipcMain.handle('delete-template', (_e, id: string) => {
    const fp = join(TEMPLATES_DIR, `${id}.json`)
    if (!isSafePath(TEMPLATES_DIR, fp)) return { success: false, error: 'Access denied' }
    if (existsSync(fp)) unlinkSync(fp)
    return { success: true }
  })
  ipcMain.handle('import-template', async () => {
    const r = await dialog.showOpenDialog({ title: 'Import Template', filters: [{ name: 'JSON Template', extensions: ['json'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths.length) return null
    const data = JSON.parse(readFileSync(r.filePaths[0], 'utf-8'))
    const id = Date.now().toString(); data.id = id
    writeFileSync(join(TEMPLATES_DIR, `${id}.json`), JSON.stringify(data, null, 2))
    return data
  })
  ipcMain.handle('export-template', async (_e, template: Record<string, unknown>) => {
    const r = await dialog.showSaveDialog({ title: 'Export Template', defaultPath: `${template.name ?? 'template'}.json`, filters: [{ name: 'JSON Template', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return { success: false }
    writeFileSync(r.filePath, JSON.stringify(template, null, 2)); return { success: true }
  })
  ipcMain.handle('pick-model-file', async () => {
    const r = await dialog.showOpenDialog({ title: 'Select Model File', filters: [{ name: 'GGUF / GGML Models', extensions: ['gguf', 'bin', 'ggml'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths.length) return null
    return { name: basename(r.filePaths[0]), path: r.filePaths[0] }
  })
  ipcMain.handle('pick-any-file', async () => {
    const r = await dialog.showOpenDialog({ title: 'Select File', properties: ['openFile'] })
    if (r.canceled || !r.filePaths.length) return null
    return r.filePaths[0]
  })
  ipcMain.handle('run-model', async (_e, opts: { id: string; name: string; backendPath: string; exe: string; args: string[]; openBrowser: boolean; port: number }) => {
    if (runningProcesses.has(opts.id)) return { success: false, error: 'Already running' }
    const port = opts.port || 8080
    let available = await isPortAvailable(port)
    let finalPort = port
    let finalArgs = [...opts.args]

    if (!available) {
      const response = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Yes', 'No'],
        defaultId: 0,
        title: 'Port Conflict',
        message: `Port ${port} is already in use by another running model or process.`,
        detail: `Would you like to temporarily allocate a different available port for "${opts.name}"?`,
        cancelId: 1
      })
      if (response.response === 0) {
        let tempPort = port + 1
        while (tempPort < 65535) {
          if (await isPortAvailable(tempPort)) {
            break
          }
          tempPort++
        }
        finalPort = tempPort
        // Update the --port parameter in finalArgs
        const portIdx = finalArgs.indexOf('--port')
        if (portIdx !== -1 && portIdx + 1 < finalArgs.length) {
          finalArgs[portIdx + 1] = String(finalPort)
        } else {
          const shortPortIdx = finalArgs.indexOf('-p')
          if (shortPortIdx !== -1 && shortPortIdx + 1 < finalArgs.length) {
            finalArgs[shortPortIdx + 1] = String(finalPort)
          } else {
            finalArgs.push('--port', String(finalPort))
          }
        }
        available = true
      } else {
        return { success: false, error: `Port ${port} is already in use.` }
      }
    }

    const exePath = join(opts.backendPath, opts.exe)
    if (!isSafePath(BACKEND_DIR, exePath)) return { success: false, error: 'Access denied' }
    if (!existsSync(exePath)) return { success: false, error: `Executable not found: ${exePath}` }
    try {
      const proc = spawn(exePath, finalArgs, { detached: false, stdio: 'pipe', cwd: dirname(exePath), windowsHide: false })
      proc.stderr?.on('data', (d) => console.error('[llama-server]', d.toString()))
      proc.stdout?.on('data', (d) => console.log('[llama-server]', d.toString()))
      proc.on('error', (err: any) => {
        let msg = String(err)
        if (err.code === 'UNKNOWN' && opts.backendPath.toLowerCase().includes('arm64') && process.arch !== 'arm64') {
          msg = 'Architecture mismatch: You are trying to run an ARM64 backend on an x64 system. Please delete this backend in Settings and download the x64 version.'
        }
        console.error('[llama-server] spawn error:', msg)
        runningProcesses.delete(opts.id)
        _e.sender.send('model-error', { id: opts.id, error: msg })
      })
      runningProcesses.set(opts.id, proc)
      proc.on('exit', () => {
        runningProcesses.delete(opts.id)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('model-exited', { id: opts.id })
        })
      })
      if (opts.openBrowser) {
        setTimeout(() => {
          if (runningProcesses.has(opts.id)) {
            openChatWindow(finalPort, opts.name)
          }
        }, 2500)
      }
      return { success: true, pid: proc.pid, port: finalPort }
    } catch (err: any) {
      if (err.code === 'UNKNOWN' && opts.backendPath.toLowerCase().includes('arm64') && process.arch !== 'arm64') {
        return { success: false, error: 'Architecture mismatch: You are trying to run an ARM64 backend on an x64 system. Please delete this backend in Settings and download the x64 version.' }
      }
      return { success: false, error: String(err) }
    }
  })
  
  function openChatWindow(port: number, name?: string) {
    const chatUrl = `http://127.0.0.1:${port}`
    const templateName = name || `Port ${port}`
    if (sharedChatWindow && !sharedChatWindow.isDestroyed()) {
      if (sharedChatWindow.isMinimized()) {
        sharedChatWindow.restore()
      }
      sharedChatWindow.show()
      sharedChatWindow.focus()
      sharedChatWindow.webContents.send('add-chat-tab', { url: chatUrl, name: templateName })
      return
    }
    const candidates = [
      join(process.cwd(), 'assets', 'icon.png'),                  
      join(__dirname, '../../assets/icon.png'),                    
      join(app.getAppPath(), 'assets', 'icon.png')                 
    ]
    const icon = candidates.find(existsSync)
    
    let x: number | undefined
    let y: number | undefined
    const width = 1024
    const height = 768
    const mainWin = BrowserWindow.getAllWindows().find(w => {
      try {
        const url = w.webContents.getURL()
        return !url.includes('chat_url')
      } catch {
        return false
      }
    })
    if (mainWin && !mainWin.isDestroyed()) {
      const bounds = mainWin.getBounds()
      x = Math.round(bounds.x + (bounds.width - width) / 2)
      y = Math.round(bounds.y + (bounds.height - height) / 2)
    }
    
    sharedChatWindow = new BrowserWindow({
      width, height, show: true, autoHideMenuBar: true,
      title: 'Hexllama - Llama-UI',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#ffffff',
      ...(icon ? { icon } : {}),
      ...(x !== undefined && y !== undefined ? { x, y } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    sharedChatWindow.on('closed', () => {
      sharedChatWindow = null
    })
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl) {
      sharedChatWindow.loadURL(`${rendererUrl}?chat_url=${encodeURIComponent(chatUrl)}&name=${encodeURIComponent(templateName)}`)
    } else {
      sharedChatWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { chat_url: chatUrl, name: templateName } })
    }
  }

  ipcMain.handle('open-chat-window', (_e, port: number, name: string) => {
    openChatWindow(port, name)
  })

  ipcMain.handle('open-detached-chat-window', (_e, port: number, name: string) => {
    const chatUrl = `http://127.0.0.1:${port}`
    const templateName = name || `Port ${port}`
    const candidates = [
      join(process.cwd(), 'assets', 'icon.png'),                  
      join(__dirname, '../../assets/icon.png'),                    
      join(app.getAppPath(), 'assets', 'icon.png')                 
    ]
    const icon = candidates.find(existsSync)
    
    let x: number | undefined
    let y: number | undefined
    const width = 1024
    const height = 768
    const mainWin = BrowserWindow.getAllWindows().find(w => {
      try {
        const url = w.webContents.getURL()
        return !url.includes('chat_url')
      } catch {
        return false
      }
    })
    if (mainWin && !mainWin.isDestroyed()) {
      const bounds = mainWin.getBounds()
      x = Math.round(bounds.x + (bounds.width - width) / 2)
      y = Math.round(bounds.y + (bounds.height - height) / 2)
    }
    
    const detachedWin = new BrowserWindow({
      width, height, show: true, autoHideMenuBar: true,
      title: 'Hexllama - Llama-UI',
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#ffffff',
      ...(icon ? { icon } : {}),
      ...(x !== undefined && y !== undefined ? { x, y } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl) {
      detachedWin.loadURL(`${rendererUrl}?chat_url=${encodeURIComponent(chatUrl)}&name=${encodeURIComponent(templateName)}&detached=true`)
    } else {
      detachedWin.loadFile(join(__dirname, '../renderer/index.html'), { query: { chat_url: chatUrl, name: templateName, detached: 'true' } })
    }
  })

  ipcMain.handle('notify-tab-moved', (_e, url: string) => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('tab-moved-elsewhere', { url })
      }
    })
  })
  ipcMain.handle('stop-model', (_e, id: string) => {
    const proc = runningProcesses.get(id)
    if (!proc) return { success: true, alreadyStopped: true }
    proc.kill(); runningProcesses.delete(id)
    return { success: true }
  })
  let cancelBackendDl: (() => void) | null = null

  ipcMain.handle('check-updates', async () => {
    try {
      const release = await fetchJson('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest') as any
      if (!release || !release.assets) return { error: 'Invalid response from GitHub' }
      const isMac = process.platform === 'darwin'
      const isLinux = process.platform === 'linux'
      const arch = process.arch
      const platformAssets = release.assets.filter((a: any) => {
        const n = a.name.toLowerCase()
        if (n.startsWith('cudart-')) return false
        if (isMac) {
          if (!n.endsWith('.tar.gz') || !n.includes('macos')) return false
          if (arch === 'arm64' && !n.includes('arm64')) return false
          if (arch === 'x64' && !n.includes('x64')) return false
          return true
        }
        if (isLinux) {
          if (!n.endsWith('.tar.gz') || !n.includes('ubuntu')) return false
          if (arch === 'arm64' && !n.includes('arm64')) return false
          if (arch === 'x64' && n.includes('arm64')) return false
          return true
        }
        if (!n.endsWith('.zip')) return false
        if (!(n.includes('win') || n.includes('windows'))) return false
        if (arch === 'x64' && n.includes('arm64')) return false
        if (arch === 'arm64' && n.includes('x64')) return false
        return true
      })
      const latestNum = parseInt(release.tag_name.replace(/^b/, ''), 10)
      let isNewer = true
      if (existsSync(BACKEND_DIR)) {
        for (const d of readdirSync(BACKEND_DIR, { withFileTypes: true }).filter(d => d.isDirectory())) {
          const m = d.name.match(/(\d{3,6})/); if (!m) continue
          if (parseInt(m[1], 10) >= latestNum || d.name.includes(release.tag_name)) { isNewer = false; break }
        }
      }
      return { tagName: release.tag_name, name: release.name, url: release.html_url, publishedAt: release.published_at, isNewer, assets: platformAssets.map((a: any) => ({ name: a.name, downloadUrl: a.browser_download_url, size: a.size })) }
    } catch (err) { return { error: String(err) } }
  })
  ipcMain.handle('download-release', async (event, opts: { url: string; version: string; assetName: string }) => {
    const archivePath = join(app.getPath('temp'), opts.assetName)
    const extractPath = join(BACKEND_DIR, opts.version)
    const isTarGz = opts.assetName.toLowerCase().endsWith('.tar.gz')
    try {
      event.sender.send('download-progress', { percent: 0, phase: 'downloading' })
      await new Promise<void>((resolve, reject) => {
        cancelBackendDl = startDownload(opts.url, archivePath, 0,
          (r, t) => event.sender.send('download-progress', { percent: t > 0 ? Math.round(r / t * 100) : 0, phase: 'downloading' }),
          resolve, reject)
      })
      cancelBackendDl = null
      event.sender.send('download-progress', { percent: 100, phase: 'extracting' })
      if (!existsSync(extractPath)) mkdirSync(extractPath, { recursive: true })
      if (isTarGz) {
        await new Promise<void>((resolve, reject) => {
          const p = spawn('tar', ['-xzf', archivePath, '-C', extractPath], { stdio: 'pipe' })
          p.on('error', reject)
          p.on('exit', code => code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`)))
        })
      } else {
        await extract(archivePath, { dir: extractPath })
      }
      try { unlinkSync(archivePath) } catch (e) { console.error('Failed to cleanup temp file', e) }
      return { success: true, path: extractPath }
    } catch (err) {
      cancelBackendDl = null
      try { unlinkSync(archivePath) } catch (e) { console.error('Failed to cleanup temp file', e) }
      return { success: false, error: String(err) }
    }
  })
  ipcMain.handle('cancel-backend-download', () => {
    if (cancelBackendDl) {
      cancelBackendDl()
      cancelBackendDl = null
    }
    return { success: true }
  })
  ipcMain.handle('open-folder', (_e, folderPath: string) => shell.openPath(folderPath))
  ipcMain.handle('get-paths', () => ({ models: MODELS_DIR, templates: TEMPLATES_DIR, backend: BACKEND_DIR }))
  ipcMain.handle('open-external', (_e, url: string) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
  })
  ipcMain.handle('hf-search', async (_e, query: string, sort = 'downloads', direction = -1) => {
    try {
      const data = await fetchJson(`https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&limit=24&sort=${sort}&direction=${direction}`) as any
      if (!Array.isArray(data)) {
        if (data && data.error) return { error: data.error }
        return { error: 'Unknown response from Hugging Face' }
      }
      return data.map(m => ({ id: m.id, author: m.author || m.id.split('/')[0] || '', name: m.id.split('/').pop() || m.id, downloads: m.downloads || 0, likes: m.likes || 0, tags: m.tags || [], lastModified: m.createdAt || m.lastModified || '' }))
    } catch (err) { return { error: String(err) } }
  })
  ipcMain.handle('hf-get-files', async (_e, repoId: string) => {
    try {
      const data = await fetchJson(`https://huggingface.co/api/models/${repoId}/tree/main`) as any[]
      return data.filter((f: any) => f.type === 'file' && f.path.endsWith('.gguf')).map((f: any) => ({
        name: f.path,
        size: f.size || 0,
        downloadUrl: `https://huggingface.co/${repoId}/resolve/main/${f.path}`
      }))
    } catch (err) { return { error: String(err) } }
  })
  ipcMain.handle('hf-download-model', (_event, opts: { repoId: string; filename: string; downloadUrl: string }) => {
    const id = opts.filename
    if (downloadTasks.has(id)) {
      const existing = downloadTasks.get(id)!
      if (existing.phase === 'downloading') return { success: false, error: 'Already downloading' }
    }
    const folder = opts.repoId.split('/').pop() || 'downloads'
    const destDir = join(MODELS_DIR, folder)
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    const finalPath = join(destDir, opts.filename)
    const tmpPath = finalPath + '.tmp'
    const task: DownloadTask = { id, url: opts.downloadUrl, filename: opts.filename, destPath: finalPath, receivedBytes: 0, totalBytes: 0, speed: 0, phase: 'downloading', repoId: opts.repoId }
    const broadcast = (force = false) => {
      if (!force && !canBroadcast(task.id)) return
      const percent = task.totalBytes > 0 ? Math.round(task.receivedBytes / task.totalBytes * 100) : 0

      const payload = {
        id: task.id, filename: task.filename, phase: task.phase,
        percent, speed: task.speed, destPath: task.destPath,
        receivedBytes: task.receivedBytes, totalBytes: task.totalBytes,
        repoId: task.repoId
      }
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('hf-download-progress', payload)
        }
      })
    }
    task.cancelFn = startDownload(
      opts.downloadUrl, tmpPath, 0,
      (r, t, speed) => { task.receivedBytes = r; task.totalBytes = t; task.speed = speed; broadcast() },
      () => {
        try { renameSync(tmpPath, finalPath) } catch {}
        task.phase = 'done'; task.speed = 0; broadcast(true)
        setTimeout(() => { downloadTasks.delete(id); broadcastTimes.delete(id) }, 10000)
      },
      (err) => { task.phase = 'error'; task.speed = 0; broadcast(true); console.error('HF download error:', err) }
    )
    downloadTasks.set(id, task)
    return { success: true }
  })
  ipcMain.handle('hf-open-models-dir', () => shell.openPath(MODELS_DIR))
  ipcMain.handle('onDownloadProgress', () => {})
  ipcMain.handle('removeDownloadListener', () => {})
  ipcMain.handle('get-version', () => app.getVersion())
}
