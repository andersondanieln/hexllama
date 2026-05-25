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
// Speculative-decoding settings. Three modes:
//  - 'native': model has built-in MTP/NextN heads (Qwen3.6, DeepSeek-V3 etc.)
//  - 'draft':  pair with a smaller draft GGUF (llama-server --spec-type draft-simple)
//  - 'off':    no acceleration flags appended at spawn
export interface AccelerationConfig {
  mode: 'native' | 'draft' | 'off'
  // Path to the draft GGUF when mode === 'draft'. Ignored otherwise.
  draftModelPath?: string
  // Tokens drafted per step (llama-server default: 3). Higher = bigger
  // potential gain on predictable text, more wasted compute on misses.
  draftMax?: number
  // Minimum draft tokens before falling back to normal decoding.
  draftMin?: number
  // Minimum acceptance probability for greedy decoding (default 0.0).
  draftPMin?: number
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
  acceleration?: AccelerationConfig
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
  // Last draft-acceptance reading parsed from llama-server stderr while the
  // card is running. Cleared when the card stops.
  acceptance?: { rate: number; accepted: number; generated: number }
}
