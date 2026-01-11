import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

export function copyGrammars() {
  const grammars = {
    bash: 'tree-sitter-wasms/out/tree-sitter-bash.wasm',
    c: 'tree-sitter-wasms/out/tree-sitter-c.wasm',
    c_sharp: 'tree-sitter-wasms/out/tree-sitter-c_sharp.wasm',
    cpp: 'tree-sitter-wasms/out/tree-sitter-cpp.wasm',
    css: 'tree-sitter-wasms/out/tree-sitter-css.wasm',
    dart: 'tree-sitter-wasms/out/tree-sitter-dart.wasm',
    elixir: 'tree-sitter-wasms/out/tree-sitter-elixir.wasm',
    elm: 'tree-sitter-wasms/out/tree-sitter-elm.wasm',
    go: 'tree-sitter-wasms/out/tree-sitter-go.wasm',
    // haskell: 'tree-sitter-wasms/out/tree-sitter-haskell.wasm', // Missing in tree-sitter-wasms
    html: 'tree-sitter-wasms/out/tree-sitter-html.wasm',
    java: 'tree-sitter-wasms/out/tree-sitter-java.wasm',
    javascript: 'tree-sitter-wasms/out/tree-sitter-javascript.wasm',
    json: 'tree-sitter-wasms/out/tree-sitter-json.wasm',
    kotlin: 'tree-sitter-wasms/out/tree-sitter-kotlin.wasm',
    lua: 'tree-sitter-wasms/out/tree-sitter-lua.wasm',
    ocaml: 'tree-sitter-wasms/out/tree-sitter-ocaml.wasm',
    php: 'tree-sitter-wasms/out/tree-sitter-php.wasm',
    python: 'tree-sitter-wasms/out/tree-sitter-python.wasm',
    ruby: 'tree-sitter-wasms/out/tree-sitter-ruby.wasm',
    rust: 'tree-sitter-wasms/out/tree-sitter-rust.wasm',
    scala: 'tree-sitter-wasms/out/tree-sitter-scala.wasm',
    solidity: 'tree-sitter-wasms/out/tree-sitter-solidity.wasm',
    swift: 'tree-sitter-wasms/out/tree-sitter-swift.wasm',
    toml: 'tree-sitter-wasms/out/tree-sitter-toml.wasm',
    typescript: 'tree-sitter-wasms/out/tree-sitter-typescript.wasm',
    tsx: 'tree-sitter-wasms/out/tree-sitter-tsx.wasm',
    vue: 'tree-sitter-wasms/out/tree-sitter-vue.wasm',
    yaml: 'tree-sitter-wasms/out/tree-sitter-yaml.wasm',
    zig: 'tree-sitter-wasms/out/tree-sitter-zig.wasm',
  }

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
      console.log(`[nuxt] Copied ${name} grammar to public/grammars`)
    } catch (error) {
      console.warn(`[nuxt] Failed to copy ${name} grammar:`, error)
    }
  }
}
