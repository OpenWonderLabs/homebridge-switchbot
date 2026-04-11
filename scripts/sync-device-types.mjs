import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const sourcePath = path.join(root, 'src/device-types.ts')
const schemaPath = path.join(root, 'config.schema.json')

const source = fs.readFileSync(sourcePath, 'utf8')
const schemaRaw = fs.readFileSync(schemaPath, 'utf8')
const schema = JSON.parse(schemaRaw)

const match = source.match(/export const DEVICE_TYPES = (\{[\s\S]*?\}) as const/)
if (!match) {
  throw new Error('Could not find DEVICE_TYPES in src/device-types.ts')
}

// WARNING: This uses eval via new Function. Only safe if device-types.ts is trusted.
// eslint-disable-next-line no-new-func -- device-types.ts is trusted and controlled
const deviceTypesByCategory = (new Function(`return (${match[1]})`))()
const enumValues = [...new Set(Object.values(deviceTypesByCategory).flat())]

const configDeviceType = schema?.schema?.properties?.devices?.items?.properties?.configDeviceType
if (!configDeviceType) {
  throw new Error('Could not locate schema.properties.devices.items.properties.configDeviceType')
}

configDeviceType.enum = enumValues

fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8')
console.log(`Synchronized ${enumValues.length} device types into config.schema.json`)
