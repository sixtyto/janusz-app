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

  for (const [name, relativePath] of Object.entries(grammars)) {
    const source = path.resolve(process.cwd(), 'node_modules', relativePath)
    const dest = path.join(grammarsDir, `${name}.wasm`)
    try {
      fs.copyFileSync(source, dest)
      // eslint-disable-next-line no-console
      console.log(`[nuxt] Copied ${name} grammar to public/grammars`)
    } catch (error) {
      console.warn(`[nuxt] Failed to copy ${name} grammar:`, error)
    }
  }
}
