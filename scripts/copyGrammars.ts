import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { GRAMMAR_SOURCES } from '../server/utils/treeSitterConfig'

export function copyGrammars() {
  const grammars = GRAMMAR_SOURCES

  const publicDir = path.resolve(process.cwd(), 'public')
  const grammarsDir = path.join(publicDir, 'grammars')

  if (!fs.existsSync(grammarsDir)) {
    fs.mkdirSync(grammarsDir, { recursive: true })
  }

  const coreSource = path.resolve(process.cwd(), 'node_modules/web-tree-sitter/web-tree-sitter.wasm')
  const coreDest = path.join(grammarsDir, 'tree-sitter.wasm')
  try {
    fs.copyFileSync(coreSource, coreDest)
    console.log('[nuxt] Copied core tree-sitter.wasm to public/grammars')
  } catch (error) {
    console.warn('[nuxt] Failed to copy core tree-sitter.wasm:', error)
  }

  for (const [name, relativePath] of Object.entries(grammars)) {
    const source = path.resolve(process.cwd(), 'node_modules', relativePath)
    const dest = path.join(grammarsDir, `${name}.wasm`)
    try {
      fs.copyFileSync(source, dest)

      console.log(`[nuxt] Copied ${name} grammar to public/grammars`)
    } catch (error) {
      console.warn(`[nuxt] Failed to copy ${name} grammar:`, error)
    }
  }
}
