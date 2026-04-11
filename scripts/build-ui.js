#!/usr/bin/env node

import esbuild from 'esbuild'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const srcDir = path.resolve(__dirname, '../src/homebridge-ui/public/js')
const outputDir = path.resolve(__dirname, '../dist/homebridge-ui/public/js')
const publicDir = path.resolve(__dirname, '../dist/homebridge-ui/public')

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true })

function assetHash(filePath) {
  const contents = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(contents).digest('hex').slice(0, 8)
}

function cacheBustBuiltAssets() {
  const indexPath = path.join(publicDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    return
  }

  let html = fs.readFileSync(indexPath, 'utf8')
  const assets = ['app.js', 'advanced-settings.js']

  for (const assetName of assets) {
    const assetPath = path.join(outputDir, assetName)
    if (!fs.existsSync(assetPath)) {
      continue
    }

    const hashedSrc = `js/${assetName}?v=${assetHash(assetPath)}`
    html = html.replace(new RegExp(`js/${assetName}(\\?v=[^\"']+)?`, 'g'), hashedSrc)
  }

  fs.writeFileSync(indexPath, html)
}

// Transpile TypeScript to JavaScript with esbuild
esbuild
  .build({
    entryPoints: [path.join(srcDir, 'app.ts')],
    outfile: path.join(outputDir, 'app.js'),
    bundle: true,
    target: 'es2020',
    platform: 'browser',
    format: 'esm',
    sourcemap: true,
    external: [],
    minify: false,
    logLevel: 'info',
  })
  .then(() => {
    cacheBustBuiltAssets()
    console.log('✓ UI bundling complete')
  })
  .catch((error) => {
    console.error('✗ UI bundling failed:', error)
    process.exit(1)
  })
