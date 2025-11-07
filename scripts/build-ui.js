#!/usr/bin/env node

import esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const srcDir = path.resolve(__dirname, '../src/homebridge-ui/public/js')
const outputDir = path.resolve(__dirname, '../dist/homebridge-ui/public/js')

// Ensure output directory exists
fs.mkdirSync(outputDir, { recursive: true })

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
    console.log('✓ UI bundling complete')
  })
  .catch((error) => {
    console.error('✗ UI bundling failed:', error)
    process.exit(1)
  })
