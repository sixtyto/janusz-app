const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const outDir = '/out'
const nodeModules = 'node_modules'

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir)
}

const packages = [
  'tree-sitter-bash',
  'tree-sitter-c',
  'tree-sitter-c-sharp',
  'tree-sitter-cpp',
  'tree-sitter-css',
  'tree-sitter-dart',
  'tree-sitter-elixir',
  'tree-sitter-elm',
  'tree-sitter-go',
  'tree-sitter-haskell',
  'tree-sitter-html',
  'tree-sitter-java',
  'tree-sitter-javascript',
  'tree-sitter-json',
  'tree-sitter-julia',
  'tree-sitter-kotlin',
  'tree-sitter-lua',
  'tree-sitter-ocaml',
  'tree-sitter-pascal',
  'tree-sitter-perl',
  'tree-sitter-php',
  'tree-sitter-python',
  'tree-sitter-r',
  'tree-sitter-ruby',
  'tree-sitter-rust',
  'tree-sitter-scala',
  'tree-sitter-solidity',
  'tree-sitter-swift',
  'tree-sitter-toml',
  'tree-sitter-typescript',
  'tree-sitter-vue',
  'tree-sitter-yaml',
  'tree-sitter-zig',
]

function buildWasm(dir, outputName) {
  try {
    console.log(`Building ${outputName} in ${dir}...`)
    execSync('tree-sitter build --wasm', { cwd: dir, stdio: 'inherit' })
    const files = fs.readdirSync(dir)
    const wasmFile = files.find(f => f.endsWith('.wasm'))
    if (wasmFile) {
      const source = path.join(dir, wasmFile)
      const dest = path.join(outDir, `${outputName}.wasm`)
      fs.copyFileSync(source, dest)
      console.log(`-> Copied to ${dest}`)
    } else {
      console.error(`Error: No .wasm file found in ${dir}`)
    }
  } catch (e) {
    console.error(`Error building ${outputName}:`, e.message)
  }
}

packages.forEach((pkg) => {
  const pkgPath = path.join(nodeModules, pkg)
  if (!fs.existsSync(pkgPath)) {
    console.warn(`Skipping ${pkg}: not found`)
    return
  }

  if (pkg === 'tree-sitter-typescript') {
    buildWasm(path.join(pkgPath, 'typescript'), 'typescript')
    buildWasm(path.join(pkgPath, 'tsx'), 'tsx')
  } else if (pkg === 'tree-sitter-ocaml') {
    if (fs.existsSync(path.join(pkgPath, 'ocaml'))) {
      buildWasm(path.join(pkgPath, 'ocaml'), 'ocaml')
    } else {
      buildWasm(pkgPath, 'ocaml')
    }
  } else if (pkg === 'tree-sitter-php') {
    if (fs.existsSync(path.join(pkgPath, 'php'))) {
      buildWasm(path.join(pkgPath, 'php'), 'php')
    } else {
      buildWasm(pkgPath, 'php')
    }
  } else {
    let name = pkg.replace('tree-sitter-', '')
    if (name === 'c-sharp') {
      name = 'c_sharp'
    }
    if (name === 'pascal') {
      name = 'delphi'
    }
    buildWasm(pkgPath, name)
  }
})
