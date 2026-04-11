const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

function usage() {
  console.error('Usage: node scripts/generate-matter-maps.js <input-json> [output-file]')
  process.exit(2)
}

const input = process.argv[2]
const outFile = process.argv[3] || path.join(__dirname, '..', 'src', 'matter-maps.generated.ts')

if (!input) {
  usage()
}
if (!fs.existsSync(input)) {
  console.error('Input file not found:', input)
  process.exit(2)
}

let json
try {
  json = JSON.parse(fs.readFileSync(input, 'utf8'))
} catch (e) {
  console.error('Failed to parse input JSON:', e.message)
  process.exit(2)
}

// Expecting structure: { clusters: [{ name, id, attributes: [{ name, id }, ...] }, ...] }
const clusters = Array.isArray(json.clusters) ? json.clusters : []

const clusterMapEntries = []
const attrGroups = {}

for (const c of clusters) {
  if (!c.name || typeof c.id === 'undefined') {
    continue
  }
  const key = c.name.replace(/\W/g, '')
  clusterMapEntries.push(`  ${key}: 0x${Number.parseInt(String(c.id), 10).toString(16)}`)
  const attrs = {}
  if (Array.isArray(c.attributes)) {
    for (const a of c.attributes) {
      if (!a.name || typeof a.id === 'undefined') {
        continue
      }
      const an = a.name.replace(/\W/g, '')
      attrs[an] = `0x${Number.parseInt(String(a.id), 10).toString(16)}`
    }
  }
  if (Object.keys(attrs).length) {
    attrGroups[key] = attrs
  }
}

const clusterMap = `export const MATTER_CLUSTER_IDS = {\n${clusterMapEntries.join(',\n')}\n} as const\n\n`

let attrText = 'export const MATTER_ATTRIBUTE_IDS = {\n'
for (const [k, v] of Object.entries(attrGroups)) {
  attrText += `  ${k}: {\n`
  for (const [an, aid] of Object.entries(v)) {
    attrText += `    ${an}: ${aid},\n`
  }
  attrText += `  },\n`
}
attrText += `} as const\n`

const fileContent = `// GENERATED FILE - do not edit by hand.\n// Run: node scripts/generate-matter-maps.js <zap-matter.json>\n\n${clusterMap}\n${attrText}`

// Ensure output directory exists
const outDir = path.dirname(outFile)
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

fs.writeFileSync(outFile, fileContent, 'utf8')
console.log('Wrote', outFile)
