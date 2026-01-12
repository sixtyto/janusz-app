import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { supportedGrammars } from '../server/utils/treeSitterConfig'

const nodeModulesDirectory = path.resolve(process.cwd(), 'node_modules')
const publicDirectory = path.resolve(process.cwd(), 'public')
const grammarsDirectory = path.join(publicDirectory, 'grammars')

function copyCoreTreeSitterWasm(): void {
  const webTreeSitterDirectory = path.join(nodeModulesDirectory, 'web-tree-sitter')
  const files = fs.readdirSync(webTreeSitterDirectory)
  const wasmSource = files.find(file => file.endsWith('.wasm'))

  if (wasmSource) {
    const source = path.join(webTreeSitterDirectory, wasmSource)
    const destination = path.join(grammarsDirectory, 'tree-sitter.wasm')
    fs.copyFileSync(source, destination)
    console.log(`[grammars] Copied ${wasmSource} to grammars/tree-sitter.wasm`)
  } else {
    console.error('[grammars] No .wasm file found in web-tree-sitter package')
  }
}

function buildWasm(directory: string, outputName: string): void {
  try {
    const files = fs.readdirSync(directory)
    let wasmFile = files.find(file => file.endsWith('.wasm'))

    if (wasmFile) {
      console.log(`[grammars] Found pre-built ${wasmFile}, skipping build...`)
    } else {
      console.log(`[grammars] Building ${outputName}...`)
      execSync('npx tree-sitter build --wasm', { cwd: directory, stdio: 'inherit' })
      const newFiles = fs.readdirSync(directory)
      wasmFile = newFiles.find(file => file.endsWith('.wasm'))
    }

    if (wasmFile) {
      const source = path.join(directory, wasmFile)
      const destination = path.join(grammarsDirectory, `${outputName}.wasm`)
      fs.copyFileSync(source, destination)
      console.log(`[grammars] Copied ${wasmFile} to ${outputName}.wasm`)
    } else {
      console.error(`[grammars] No .wasm file generated or found for ${outputName}`)
      process.exit(1)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[grammars] Failed to process ${outputName}: ${message}`)
    process.exit(1)
  }
}

function getPackageDirectory(grammarName: string): string {
  return path.join(nodeModulesDirectory, `tree-sitter-${grammarName}`)
}

function buildGrammar(grammarName: string): void {
  const packageDirectory = getPackageDirectory(grammarName)

  if (!fs.existsSync(packageDirectory)) {
    console.warn(`[grammars] Skipping ${grammarName}: package not found`)
    return
  }

  if (grammarName === 'typescript') {
    buildWasm(path.join(packageDirectory, 'typescript'), 'typescript')
    buildWasm(path.join(packageDirectory, 'tsx'), 'tsx')
  } else if (grammarName === 'ocaml') {
    const ocamlSubdirectory = path.join(packageDirectory, 'ocaml')
    buildWasm(fs.existsSync(ocamlSubdirectory) ? ocamlSubdirectory : packageDirectory, 'ocaml')
  } else if (grammarName === 'php') {
    const phpSubdirectory = path.join(packageDirectory, 'php')
    buildWasm(fs.existsSync(phpSubdirectory) ? phpSubdirectory : packageDirectory, 'php')
  } else {
    buildWasm(packageDirectory, grammarName)
  }
}

export async function buildGrammars(): Promise<void> {
  if (!fs.existsSync(grammarsDirectory)) {
    fs.mkdirSync(grammarsDirectory, { recursive: true })
  }

  copyCoreTreeSitterWasm()

  console.log('[grammars] Building grammar WASMs...')

  for (const grammar of supportedGrammars) {
    buildGrammar(grammar)
  }

  console.log('[grammars] Grammar build complete.')
}

// Allow running directly via npx tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  buildGrammars().catch(console.error)
}
