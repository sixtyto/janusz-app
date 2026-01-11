import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { supportedGrammars } from '../server/utils/treeSitterConfig'

async function downloadFile(url: string, dest: string, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.statusText}`)
      }
      const stream = fs.createWriteStream(dest)
      if (!res.body) {
        throw new Error(`No body in response for ${url}`)
      }
      // @ts-expect-error - Readable.fromWeb handles web streams
      await finished(Readable.fromWeb(res.body).pipe(stream))
      return
    } catch (e) {
      if (i === retries - 1) {
        throw e
      }

      console.warn(`[nuxt] Failed to download ${url}, retrying (${i + 1}/${retries})...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

export async function downloadGrammars() {
  const publicDir = path.resolve(process.cwd(), 'public')
  const grammarsDir = path.join(publicDir, 'grammars')

  if (!fs.existsSync(grammarsDir)) {
    fs.mkdirSync(grammarsDir, { recursive: true })
  }

  try {
    const pkgDir = path.resolve(process.cwd(), 'node_modules/web-tree-sitter')
    const files = fs.readdirSync(pkgDir)
    const wasmSource = files.find(f => f.endsWith('.wasm'))

    if (wasmSource) {
      const source = path.join(pkgDir, wasmSource)
      const dest = path.join(grammarsDir, 'tree-sitter.wasm')
      fs.copyFileSync(source, dest)

      console.log(`[nuxt] Copied ${wasmSource} to public/grammars/tree-sitter.wasm`)
    } else {
      console.error('[nuxt] No .wasm file found in web-tree-sitter package')
    }
  } catch (e) {
    console.error('[nuxt] Failed to copy core tree-sitter.wasm', e)
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const shouldDownload = isProduction || process.env.DOWNLOAD_GRAMMARS === 'true'

  if (!shouldDownload) {
    console.log('[nuxt] Skipping grammar download in dev mode (set DOWNLOAD_GRAMMARS=true to force)')
    return
  }

  console.log('[nuxt] Downloading grammars...')

  const promises = supportedGrammars.map(async (name) => {
    const url = `https://unpkg.com/tree-sitter-wasms/out/tree-sitter-${name}.wasm`
    const dest = path.join(grammarsDir, `${name}.wasm`)

    if (fs.existsSync(dest)) {
      return
    }

    try {
      await downloadFile(url, dest)

      console.log(`[nuxt] Downloaded ${name}`)
    } catch (e) {
      console.warn(`[nuxt] Failed to download ${name}:`, e)
    }
  })

  await Promise.all(promises)

  console.log('[nuxt] Grammar download complete.')
}
