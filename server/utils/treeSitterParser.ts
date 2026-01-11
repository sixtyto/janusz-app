import type { Node, Tree } from 'web-tree-sitter'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ServiceType } from '#shared/types/ServiceType'
import { Language, Parser } from 'web-tree-sitter'
import { extensionToGrammar, keywords, symbolNodeTypes } from './treeSitterConfig'
import { useLogger } from './useLogger'

let treeSitterInitialized = false
const languageCache = new Map<string, Language>()

export async function initializeTreeSitter(): Promise<void> {
  if (treeSitterInitialized) {
    return
  }

  await Parser.init()
  treeSitterInitialized = true
}

export async function getLanguage(grammarName: string): Promise<Language | null> {
  const logger = useLogger(ServiceType.repoIndexer)
  if (languageCache.has(grammarName)) {
    return languageCache.get(grammarName)!
  }

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
    const language = await Language.load(wasmPath)
    languageCache.set(grammarName, language)
    logger.info(`Loaded tree-sitter grammar: ${grammarName}`)
    return language
  } catch (error) {
    logger.warn(`Failed to load grammar: ${grammarName}`, { error })
    return null
  }
}

function extractNameFromNode(node: Node): string | null {
  const nameNode = node.childForFieldName('name')
    ?? node.children.find((child: Node) => child.type === 'identifier')
    ?? node.children.find((child: Node) => child.type === 'property_identifier')
    ?? node.children.find((child: Node) => child.type === 'type_identifier')

  if (nameNode) {
    return nameNode.text
  }

  if (node.type === 'variable_declarator') {
    const identifier = node.children.find((child: Node) => child.type === 'identifier')
    return identifier?.text ?? null
  }

  if (node.type === 'export_statement') {
    const declaration = node.childForFieldName('declaration')
    if (declaration) {
      return extractNameFromNode(declaration)
    }
  }

  return null
}

function traverseTree(node: Node, symbols: Set<string>, maxDepth = 100): void {
  if (maxDepth <= 0) {
    return
  }

  if (symbolNodeTypes.has(node.type)) {
    const name = extractNameFromNode(node)
    const isKeyword = (name: string): boolean => keywords.has(name)
    if (name && /^\w+$/.test(name) && !isKeyword(name)) {
      symbols.add(name)
    }
  }

  for (const child of node.children) {
    traverseTree(child, symbols, maxDepth - 1)
  }
}

export async function extractSymbols(
  content: string,
  extension: string,
): Promise<string[] | null> {
  const logger = useLogger(ServiceType.repoIndexer)
  const getGrammarForExtension = (extension: string): string | null => extensionToGrammar.get(extension.toLowerCase()) ?? null
  const grammarName = getGrammarForExtension(extension)
  if (!grammarName) {
    return null
  }

  const language = await getLanguage(grammarName)
  if (!language) {
    return null
  }

  let parser: Parser | null = null
  let tree: Tree | null = null

  try {
    await initializeTreeSitter()
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
    if (tree) tree.delete()
    if (parser) parser.delete()
  }
}

export function isTreeSitterSupported(extension: string): boolean {
  return extensionToGrammar.has(extension.toLowerCase())
}