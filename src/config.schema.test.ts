import fs from 'node:fs'
import path from 'node:path'

import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'

describe('config.schema.json validation', () => {
  const schemaPath = path.join(process.cwd(), 'config.schema.json')
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(schema.schema)

  it('should validate a complete valid configuration', () => {
    const validConfig = {
      name: 'SwitchBot',
      credentials: {
        token: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        secret: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        notice: 'Keep your Token & Secret a secret!',
      },
      options: {
        devices: [
          {
            configDeviceName: 'hub',
            deviceId: 'FCE69B5FBC31',
            hide_device: false,
            configDeviceType: 'Hub 2',
            connectionType: 'OpenAPI',
            hide_lightsensor: true,
            logging: 'standard',
          },
          {
            configDeviceName: 'ToiletFan',
            deviceId: 'C53430351578',
            hide_device: false,
            configDeviceType: 'Bot',
            connectionType: 'OpenAPI',
            type: 'fan',
            mode: 'switch',
            allowPush: false,
            logging: 'standard',
          },
        ],
        logging: 'standard',
      },
      _bridge: {
        username: '0E:34:2C:CD:AC:C3',
        port: 51631,
      },
      platform: 'SwitchBot',
    }

    const isValid = validate(validConfig)
    expect(isValid).toBe(true)
    expect(validate.errors).toBeNull()
  })

  it('should reject configuration missing required logging property in options', () => {
    const invalidConfig = {
      name: 'SwitchBot',
      credentials: {
        token: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        secret: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        notice: 'Keep your Token & Secret a secret!',
      },
      options: {
        devices: [
          {
            configDeviceName: 'hub',
            deviceId: 'FCE69B5FBC31',
            configDeviceType: 'Hub 2',
          },
        ],
        // Missing logging property
      },
      platform: 'SwitchBot',
    }

    const isValid = validate(invalidConfig)
    expect(isValid).toBe(false)
    expect(validate.errors).toBeDefined()
    
    expect(validate.errors?.some(error => 
      error.dataPath === '.options' && 
      error.message === 'should have required property \'logging\''
    )).toBe(true)
  })

  it('should validate configuration with Hub 2 device type', () => {
    const hubConfig = {
      name: 'SwitchBot',
      credentials: {
        token: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        secret: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        notice: 'Keep your Token & Secret a secret!',
      },
      options: {
        devices: [
          {
            configDeviceName: 'hub',
            deviceId: 'FCE69B5FBC31',
            configDeviceType: 'Hub 2',
            connectionType: 'OpenAPI',
            hide_lightsensor: true,
          },
        ],
        logging: 'standard',
      },
      platform: 'SwitchBot',
    }

    const isValid = validate(hubConfig)
    expect(isValid).toBe(true)
    expect(validate.errors).toBeNull()
  })

  it('should validate configuration with Bot device type and allowPush property', () => {
    const botConfig = {
      name: 'SwitchBot',
      credentials: {
        token: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        secret: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
        notice: 'Keep your Token & Secret a secret!',
      },
      options: {
        devices: [
          {
            configDeviceName: 'ToiletFan',
            deviceId: 'C53430351578',
            configDeviceType: 'Bot',
            type: 'fan',
            mode: 'switch',
            allowPush: false,
          },
        ],
        logging: 'standard',
      },
      platform: 'SwitchBot',
    }

    const isValid = validate(botConfig)
    expect(isValid).toBe(true)
    expect(validate.errors).toBeNull()
  })
})