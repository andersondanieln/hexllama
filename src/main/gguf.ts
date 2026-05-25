// Minimal GGUF v2/v3 metadata reader. Walks KV pairs from the file header and
// returns architecture, native context length, and MTP head count (Qwen's
// "nextn_predict_layers" or other arch-prefixed variants).
//
// Only the first HEADER_READ_BYTES of the file is touched — large enough to
// hold any realistic metadata blob, small enough to be fast even over network
// disks. Tensor data is never read.

import { promises as fsPromises } from 'fs'

const MAGIC = Buffer.from('GGUF', 'utf-8')
// Has to cover the full metadata block, which can be 10+ MB for models with
// large tokenizer arrays (e.g. Qwen 35B-MoE puts its MTP key at kv[54], past
// a 150K-token vocab). 32 MB is still <1% of any real model file size.
const HEADER_READ_BYTES = 32 * 1024 * 1024 // 32 MB

enum GgufType {
  UINT8 = 0, INT8 = 1, UINT16 = 2, INT16 = 3,
  UINT32 = 4, INT32 = 5, FLOAT32 = 6, BOOL = 7,
  STRING = 8, ARRAY = 9,
  UINT64 = 10, INT64 = 11, FLOAT64 = 12
}

export interface GgufInfo {
  architecture: string | null
  contextLength: number | null
  // Number of MTP / NextN prediction heads. >0 means the GGUF carries the
  // weights needed for `--spec-type draft-mtp` to engage.
  mtpLayers: number
  // Tokenizer vocab size. Used to pre-screen spec-decode draft pairs: vocab
  // mismatch is a necessary-but-not-sufficient sign of incompatibility, but
  // catches the >95% case before the user waits for llama-server to refuse.
  vocabSize: number | null
}

interface CacheEntry extends GgufInfo { size: number; mtimeMs: number }
const cache = new Map<string, CacheEntry>()

class Cursor {
  constructor(public buf: Buffer, public off: number = 0) {}
  u32(): number { const v = this.buf.readUInt32LE(this.off); this.off += 4; return v }
  u64(): number {
    // Realistic metadata values (layer counts, ctx lengths) fit in 2^53.
    const lo = this.buf.readUInt32LE(this.off)
    const hi = this.buf.readUInt32LE(this.off + 4)
    this.off += 8
    return hi * 0x1_0000_0000 + lo
  }
  i32(): number { const v = this.buf.readInt32LE(this.off); this.off += 4; return v }
  i64(): number {
    const lo = this.buf.readUInt32LE(this.off)
    const hi = this.buf.readInt32LE(this.off + 4)
    this.off += 8
    return hi * 0x1_0000_0000 + lo
  }
  f32(): number { const v = this.buf.readFloatLE(this.off); this.off += 4; return v }
  f64(): number { const v = this.buf.readDoubleLE(this.off); this.off += 8; return v }
  u8(): number { return this.buf[this.off++] }
  i8(): number { const v = this.buf.readInt8(this.off); this.off += 1; return v }
  u16(): number { const v = this.buf.readUInt16LE(this.off); this.off += 2; return v }
  i16(): number { const v = this.buf.readInt16LE(this.off); this.off += 2; return v }
  str(): string {
    const len = this.u64()
    const s = this.buf.toString('utf-8', this.off, this.off + len)
    this.off += len
    return s
  }
  skipValue(type: number): void {
    switch (type) {
      case GgufType.UINT8: case GgufType.INT8: case GgufType.BOOL: this.off += 1; return
      case GgufType.UINT16: case GgufType.INT16: this.off += 2; return
      case GgufType.UINT32: case GgufType.INT32: case GgufType.FLOAT32: this.off += 4; return
      case GgufType.UINT64: case GgufType.INT64: case GgufType.FLOAT64: this.off += 8; return
      case GgufType.STRING: { const slen = this.u64(); this.off += slen; return }
      case GgufType.ARRAY: {
        const elemType = this.u32()
        const n = this.u64()
        for (let i = 0; i < n; i++) this.skipValue(elemType)
        return
      }
      default: throw new Error(`Unknown GGUF type ${type}`)
    }
  }
  readNumeric(type: number): number | null {
    switch (type) {
      case GgufType.UINT8: return this.u8()
      case GgufType.INT8: return this.i8()
      case GgufType.UINT16: return this.u16()
      case GgufType.INT16: return this.i16()
      case GgufType.UINT32: return this.u32()
      case GgufType.INT32: return this.i32()
      case GgufType.UINT64: return this.u64()
      case GgufType.INT64: return this.i64()
      case GgufType.FLOAT32: { const v = this.f32(); return Math.round(v) }
      case GgufType.FLOAT64: { const v = this.f64(); return Math.round(v) }
      default: return null
    }
  }
  readString(type: number): string | null {
    if (type !== GgufType.STRING) return null
    return this.str()
  }
}

// MTP/NextN comes under different key spellings across architectures. The
// `<arch>.nextn_predict_layers` form is what Qwen3.x ships; the other two
// match DeepSeek-V3 / GLM-style naming if they show up via the same flag.
function isMtpKey(key: string, arch: string | null): boolean {
  if (arch) {
    const prefix = `${arch}.`
    if (key === `${prefix}nextn_predict_layers`) return true
    if (key === `${prefix}mtp.num_layers`) return true
    if (key === `${prefix}mtp_layers`) return true
  }
  // Architecture-agnostic fallbacks — if a future build emits these without the
  // arch prefix we still catch them.
  return /\.nextn_predict_layers$/.test(key) || /\.mtp(_layers|\.num_layers)$/.test(key)
}

async function readGgufInfoUncached(filePath: string): Promise<GgufInfo> {
  const empty: GgufInfo = { architecture: null, contextLength: null, mtpLayers: 0, vocabSize: null }
  let fh
  try {
    fh = await fsPromises.open(filePath, 'r')
    const stat = await fh.stat()
    const len = Math.min(HEADER_READ_BYTES, stat.size)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, 0)
    if (!buf.subarray(0, 4).equals(MAGIC)) return empty
    const c = new Cursor(buf, 4)
    const version = c.u32()
    if (version < 2 || version > 3) return empty
    c.u64() // tensor_count
    const kvCount = c.u64()
    const out: GgufInfo = { architecture: null, contextLength: null, mtpLayers: 0, vocabSize: null }
    for (let i = 0; i < kvCount; i++) {
      if (c.off >= buf.length - 12) return out
      const key = c.str()
      const type = c.u32()
      try {
        // We can't `continue` after read*() without first checking that it
        // actually consumed bytes — a non-matching type returns null without
        // advancing, which would misalign every subsequent key.
        if (key === 'general.architecture') {
          const s = c.readString(type)
          if (s !== null) { out.architecture = s; continue }
        } else if (out.architecture && key === `${out.architecture}.vocab_size`) {
          const n = c.readNumeric(type)
          if (n !== null) { out.vocabSize = n; continue }
        } else if (out.architecture && key === `${out.architecture}.context_length`) {
          const n = c.readNumeric(type)
          if (n !== null) { out.contextLength = n; continue }
        } else if (isMtpKey(key, out.architecture)) {
          const n = c.readNumeric(type)
          if (n !== null) { if (n > 0) out.mtpLayers = n; continue }
        } else if (out.vocabSize === null && key === 'tokenizer.ggml.tokens' && type === GgufType.ARRAY) {
          // Fallback: count the tokens array directly. peek the element type
          // and length without materializing the full array.
          const elemType = c.u32()
          const n = c.u64()
          out.vocabSize = n
          for (let j = 0; j < n; j++) c.skipValue(elemType)
          continue
        }
        c.skipValue(type)
      } catch {
        return out
      }
    }
    return out
  } catch {
    return empty
  } finally {
    try { await fh?.close() } catch {}
  }
}

export async function readGgufInfo(filePath: string): Promise<GgufInfo> {
  let size = 0, mtimeMs = 0
  try {
    const st = await fsPromises.stat(filePath)
    size = st.size
    mtimeMs = st.mtimeMs
  } catch {
    return { architecture: null, contextLength: null, mtpLayers: 0, vocabSize: null }
  }
  const hit = cache.get(filePath)
  if (hit && hit.size === size && hit.mtimeMs === mtimeMs) {
    return { architecture: hit.architecture, contextLength: hit.contextLength, mtpLayers: hit.mtpLayers, vocabSize: hit.vocabSize }
  }
  const info = await readGgufInfoUncached(filePath)
  cache.set(filePath, { ...info, size, mtimeMs })
  return info
}

// Convenience wrapper that mirrors the older single-purpose API used by
// callers that only need the context length.
export async function readNativeContext(filePath: string): Promise<number | null> {
  return (await readGgufInfo(filePath)).contextLength
}
