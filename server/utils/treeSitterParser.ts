import type { Node as SyntaxNode, Tree } from 'web-tree-sitter'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { ServiceType } from '#shared/types/ServiceType'
import { Language, Parser } from 'web-tree-sitter'
import { extensionToGrammar, keywords, symbolNodeTypes } from './treeSitterConfig'
import { useLogger } from './useLogger'

const languageCache = new Map<string, Promise<Language | null>>()

let initPromise: Promise<void> | null = null
export async function initializeTreeSitter(): Promise<void> {
  if (initPromise) {
    return initPromise
  }

  const logger = useLogger(ServiceType.repoIndexer)
  const wasmFilename = 'tree-sitter.wasm'
  const searchPaths = [
    path.join(process.cwd(), 'public', 'grammars', wasmFilename),
    path.join(process.cwd(), '.output', 'public', 'grammars', wasmFilename),
  ]

  let wasmPath: string | null = null
  for (const p of searchPaths) {
    try {
      await fs.access(p, constants.F_OK)
      wasmPath = p
      break
    } catch {
      // Continue searching
    }
  }

  if (!wasmPath) {
    logger.warn(`Core tree-sitter.wasm not found in checked paths: ${searchPaths.join(', ')}`)
    initPromise = Parser.init()
  } else {
    initPromise = Parser.init({
      locateFile() {
        return wasmPath!
      },
    })
  }

  return initPromise as Promise<void>
}

export async function getLanguage(grammarName: string): Promise<Language | null> {
  const logger = useLogger(ServiceType.repoIndexer)
  if (languageCache.has(grammarName)) {
    return languageCache.get(grammarName)!
  }

  const loadLanguage = async () => {
    const wasmFilename = `${grammarName}.wasm`
    const searchPaths = [
      path.join(process.cwd(), 'public', 'grammars', wasmFilename),
      path.join(process.cwd(), '.output', 'public', 'grammars', wasmFilename),
    ]

    let wasmPath: string | null = null
    for (const p of searchPaths) {
      try {
        await fs.access(p, constants.F_OK)
        wasmPath = p
        break
      } catch {
        // Continue searching
      }
    }

    if (!wasmPath) {
      logger.warn(`Grammar file not found: ${wasmFilename} checked paths: ${searchPaths.join(', ')}`)
      return null
    }

    try {
      await initializeTreeSitter()
      const language = await Language.load(wasmPath)
      logger.info(`Loaded tree-sitter grammar: ${grammarName}`)
      return language
    } catch (error) {
      logger.warn(`Failed to load grammar: ${grammarName}`, { error })
      return null
    }
  }

  const promise = loadLanguage()
  languageCache.set(grammarName, promise)
  return promise
}

function extractNameFromNode(node: SyntaxNode): string | null {
  const nameNode = node.childForFieldName('name')
  if (nameNode) {
    return nameNode.text
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i)
    if (child && (child.type === 'identifier' || child.type === 'property_identifier' || child.type === 'type_identifier')) {
      return child.text
    }
  }

  if (node.type === 'variable_declarator') {
    return node.childForFieldName('id')?.text ?? null
  }

  return null
}

function traverseTree(root: SyntaxNode, symbols: Set<string>): void {
  const stack: SyntaxNode[] = [root]

  while (stack.length > 0) {
    const node = stack.pop()!

    if (symbolNodeTypes.has(node.type)) {
      const name = extractNameFromNode(node)
      if (name && /^\w+$/.test(name) && !keywords.has(name)) {
        symbols.add(name)
      }
    }

    // Push children in reverse order to process them in original order (DFS)
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const child = node.namedChild(i)
      if (child) {
        stack.push(child)
      }
    }
  }
}

export async function extractSymbols(
  content: string,
  extension: string,
): Promise<string[] | null> {
  const logger = useLogger(ServiceType.repoIndexer)
  const grammarName = extensionToGrammar.get(extension.toLowerCase())
  if (!grammarName) {
    return null
  }

  await initializeTreeSitter()

  const language = await getLanguage(grammarName)
  if (!language) {
    return null
  }

  let parser: Parser | null = null
  let tree: Tree | null = null
  try {
    // Instantiate parser locally to avoid race conditions in concurrent processing
    parser = new Parser()
    parser.setLanguage(language)
    tree = parser.parse(content)
    if (!tree) {
      logger.warn(`Failed to parse content for ${extension}`)
      return null
    }

    const rootNode = tree.rootNode

    if (rootNode.hasError) {
      logger.warn(`Syntax errors detected in ${extension}, extracting partial symbols`)
    }

    const symbols = new Set<string>()
    traverseTree(rootNode, symbols)

    return Array.from(symbols)
  } catch (error) {
    logger.warn(`AST parsing failed for ${extension}`, { error })
    return null
  } finally {
    if (tree) {
      tree.delete()
    }
    if (parser) {
      parser.delete()
    }
  }
}

export function isTreeSitterSupported(extension: string): boolean {
  return extensionToGrammar.has(extension.toLowerCase())
}
