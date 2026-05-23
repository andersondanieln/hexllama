export interface ModelFile {
  name: string
  path: string
}
export interface BackendVersion {
  name: string
  path: string
  hasCommands: boolean
  exe: string | null
}
export interface CommandParam {
  arg: string
  short?: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'string' | 'select' | 'text'
  default?: string | number | boolean | null
  options?: string[]
  min?: number
  max?: number
  placeholder?: string
  env?: string
  deprecated?: boolean
}
export interface CommandCategory {
  name: string
  icon: string
  commands: CommandParam[]
}
export interface CommandsSchema {
  version: string
  categories: CommandCategory[]
}
export interface Template {
  id: string
  name: string
  description?: string
  backendVersion?: string
  modelPath?: string
  serverPort: number
  args: Record<string, string | number | boolean | null>
  tags?: string[]
  launchMode?: 'chat' | 'api'
  createdAt: string
  updatedAt: string
  _file?: string
}
export interface ReleaseInfo {
  tagName: string
  name: string
  url: string
  publishedAt: string
  isNewer?: boolean
  assets: { name: string; downloadUrl: string; size: number }[]
  error?: string
}
export type RunningStatus = 'idle' | 'running' | 'error'
export interface CardState {
  template: Template
  status: RunningStatus
  pid?: number
  expanded: boolean
}
