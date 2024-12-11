/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * irdevice.ts: @switchbot/homebridge-switchbot.
 */
import type { API, CharacteristicValue, HAP, Logging, PlatformAccessory, Service } from 'homebridge'
import type { bodyChange, irdevice } from 'node-switchbot'

import type { SwitchBotPlatform } from '../platform.js'
import type { irAirConfig, irDevicesConfig, irFanConfig, irLightConfig, irOtherConfig, SwitchBotPlatformConfig } from '../settings.js'

export abstract class irdeviceBase {
  public readonly api: API
  public readonly log: Logging
  public readonly config!: SwitchBotPlatformConfig
  protected readonly hap: HAP

  // Config
  protected deviceLogging!: string
  protected deviceRefreshRate!: number
  protected deviceUpdateRate!: number
  protected devicePushRate!: number
  protected deviceMaxRetries!: number
  protected deviceDelayBetweenRetries!: number
  protected deviceDisablePushOn!: boolean
  protected deviceDisablePushOff!: boolean
  protected deviceDisablePushDetail?: boolean

  constructor(
    protected readonly platform: SwitchBotPlatform,
    protected accessory: PlatformAccessory,
    protected device: irdevice & irDevicesConfig,
  ) {
    this.api = this.platform.api
    this.log = this.platform.log
    this.config = this.platform.config
    this.hap = this.api.hap

    this.getDeviceLogSettings(accessory, device)
    this.getDeviceRateSettings(device)
    this.getDeviceConfigSettings(device)
    this.getDeviceContext(accessory, device)

    // Set accessory information
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.Manufacturer, 'SwitchBot')
      .setCharacteristic(this.hap.Characteristic.AppMatchingIdentifier, 'id1087374760')
      .setCharacteristic(this.hap.Characteristic.Name, accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.ConfiguredName, accessory.displayName)
      .setCharacteristic(this.hap.Characteristic.Model, accessory.context.model ?? 'Unknown')
      .setCharacteristic(this.hap.Characteristic.ProductData, device.deviceId)
      .setCharacteristic(this.hap.Characteristic.SerialNumber, device.deviceId)
  }

  async getDeviceLogSettings(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): Promise<void> {
    this.deviceLogging = this.platform.debugMode ? 'debugMode' : device.logging ?? this.platform.platformLogging ?? 'standard'
    const logging = this.platform.debugMode ? 'Debug Mode' : device.logging ? 'Device Config' : this.platform.platformLogging ? 'Platform Config' : 'Default'
    accessory.context.deviceLogging = this.deviceLogging
    this.debugLog(`Using ${logging} Logging: ${this.deviceLogging}`)
  }

  async getDeviceRateSettings(device: irdevice & irDevicesConfig): Promise<void> {
    // refreshRate
    this.deviceRefreshRate = device.refreshRate ?? this.platform.platformRefreshRate ?? 300
    const refreshRate = device.refreshRate ? 'Device Config' : this.platform.platformRefreshRate ? 'Platform Config' : 'Default'
    this.accessory.context.refreshRate = this.deviceRefreshRate
    // updateRate
    this.deviceUpdateRate = device.updateRate ?? this.platform.platformUpdateRate ?? 5
    const updateRate = device.updateRate ? 'Device Config' : this.platform.platformUpdateRate ? 'Platform Config' : 'Default'
    this.accessory.context.updateRate = this.deviceUpdateRate
    // pushRate
    this.devicePushRate = device.pushRate ?? this.platform.platformPushRate ?? 0.1
    const pushRate = device.pushRate ? 'Device Config' : this.platform.platformPushRate ? 'Platform Config' : 'Default'
    this.accessory.context.pushRate = this.devicePushRate
    this.debugLog(`Using ${refreshRate} refreshRate: ${this.deviceRefreshRate}, ${updateRate} updateRate: ${this.deviceUpdateRate}, ${pushRate} pushRate: ${this.devicePushRate}`)
    // maxRetries
    this.deviceMaxRetries = device.maxRetries ?? this.platform.platformMaxRetries ?? 2
    const maxRetries = device.maxRetries ? 'Device' : this.platform.platformMaxRetries ? 'Platform' : 'Default'
    this.debugLog(`Using ${maxRetries} Max Retries: ${this.deviceMaxRetries}`)
    // delayBetweenRetries
    this.deviceDelayBetweenRetries = device.delayBetweenRetries ? (device.delayBetweenRetries * 1000) : this.platform.platformDelayBetweenRetries ?? 3000
    const delayBetweenRetries = device.delayBetweenRetries ? 'Device' : this.platform.platformDelayBetweenRetries ? 'Platform' : 'Default'
    this.debugLog(`Using ${delayBetweenRetries} Delay Between Retries: ${this.deviceDelayBetweenRetries}`)

    // disablePushOn
    this.deviceDisablePushOn = device.disablePushOn ?? false
    const disablePushOn = device.disablePushOn ? 'Device Config' : 'Default'
    // disablePushOff
    this.deviceDisablePushOff = device.disablePushOff ?? false
    const disablePushOff = device.disablePushOff ? 'Device Config' : 'Default'
    // disablePushDetail
    this.deviceDisablePushDetail = device.disablePushDetail ?? false
    const disablePushDetail = device.disablePushDetail ? 'Device Config' : 'Default'
    this.debugLog(`Using ${disablePushOn} Disable Push On: ${this.deviceDisablePushOn}, ${disablePushOff} Disable Push Off: ${this.deviceDisablePushOff}, ${disablePushDetail} Disable Push Detail: ${this.deviceDisablePushDetail}`)
  }

  async getDeviceConfigSettings(device: irdevice & irDevicesConfig): Promise<void> {
    const deviceConfig = Object.assign(
      {},
      device.logging !== 'standard' && { logging: device.logging },
      device.connectionType !== '' && { connectionType: device.connectionType },
      device.external === true && { external: device.external },
      device.customize === true && { customize: device.customize },
      device.commandType !== '' && { commandType: device.commandType },
      device.customOn !== '' && { customOn: device.customOn },
      device.customOff !== '' && { customOff: device.customOff },
      device.disablePushOn === true && { disablePushOn: device.disablePushOn },
      device.disablePushOff === true && { disablePushOff: device.disablePushOff },
      device.disablePushDetail === true && { disablePushDetail: device.disablePushDetail },
    )
    let deviceSpecificConfig = {}
    switch (device.configRemoteType) {
      case 'Fan':
      case 'DIY Fan':
        deviceSpecificConfig = device as irFanConfig
        break
      case 'Light':
      case 'DIY Light':
        deviceSpecificConfig = device as irLightConfig
        break
      case 'Air Conditioner':
      case 'DIY Air Conditioner':
        deviceSpecificConfig = device as irAirConfig
        break
      case 'Others':
        deviceSpecificConfig = device as irOtherConfig
        break
      default:
        break
    }
    const config = Object.assign(
      {},
      deviceConfig,
      deviceSpecificConfig,
    )
    if (Object.keys(config).length !== 0) {
      this.debugSuccessLog(`Config: ${JSON.stringify(config)}`)
    }
  }

  async getDeviceContext(accessory: PlatformAccessory, device: irdevice & irDevicesConfig): Promise<void> {
    accessory.context.name = device.deviceName
    accessory.context.model = device.remoteType
    accessory.context.deviceId = device.deviceId
    accessory.context.remoteType = device.remoteType

    const deviceFirmwareVersion = device.firmware ?? accessory.context.version ?? this.platform.version ?? '0.0.0'
    const version = deviceFirmwareVersion.toString()
    this.debugLog(`version: ${version?.replace(/^V|-.*$/g, '')}`)
    let deviceVersion: string
    if (version?.includes('.') === false) {
      const replace = version?.replace(/^V|-.*$/g, '')
      const match = replace?.match(/./g)
      const validVersion = match?.join('.')
      deviceVersion = validVersion ?? '0.0.0'
    } else {
      deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
    }
    accessory
      .getService(this.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.SoftwareRevision, deviceVersion)
      .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
      .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
      .updateValue(deviceVersion)
    accessory.context.version = deviceVersion
    this.debugSuccessLog(`version: ${accessory.context.version}`)
  }

  async pushChangeRequest(bodyChange: bodyChange): Promise<{ body: any, statusCode: number }> {
    const { response, statusCode } = await this.platform.switchBotAPI.controlDevice(this.device.deviceId, bodyChange.command, bodyChange.parameter, bodyChange.commandType)
    return { body: response, statusCode }
  }

  async successfulStatusCodes(deviceStatus: any) {
    return (deviceStatus.statusCode === 200 || deviceStatus.statusCode === 100)
  }

  /**
   * Update the characteristic value and log the change.
   *
   * @param Service Service
   * @param Characteristic Characteristic
   * @param CharacteristicValue CharacteristicValue | undefined
   * @param CharacteristicName string
   * @return: void
   *
   */
  async updateCharacteristic(Service: Service, Characteristic: any, CharacteristicValue: CharacteristicValue | undefined, CharacteristicName: string): Promise<void> {
    if (CharacteristicValue === undefined) {
      this.debugLog(`${CharacteristicName}: ${CharacteristicValue}`)
    } else {
      Service.updateCharacteristic(Characteristic, CharacteristicValue)
      this.debugLog(`updateCharacteristic ${CharacteristicName}: ${CharacteristicValue}`)
      this.debugWarnLog(`${CharacteristicName} context before: ${this.accessory.context[CharacteristicName]}`)
      this.accessory.context[CharacteristicName] = CharacteristicValue
      this.debugWarnLog(`${CharacteristicName} context after: ${this.accessory.context[CharacteristicName]}`)
    }
  }

  async pushStatusCodes(deviceStatus: any) {
    this.debugWarnLog(`deviceStatus: ${JSON.stringify(deviceStatus)}`)
    this.debugWarnLog(`deviceStatus statusCode: ${deviceStatus.statusCode}`)
  }

  async successfulPushChange(deviceStatus: any, bodyChange: any) {
    this.debugSuccessLog(`deviceStatus StatusCode: ${deviceStatus.statusCode}`)
    this.successLog(`request to SwitchBot API, body: ${JSON.stringify(bodyChange)} sent successfully`)
  }

  async pushChangeError(e: Error) {
    this.errorLog(`failed pushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
  }

  async commandType(): Promise<string> {
    let commandType: string
    if (this.device.commandType && this.device.customize) {
      commandType = this.device.commandType
    } else if (this.device.customize) {
      commandType = 'customize'
    } else {
      commandType = 'command'
    }
    return commandType
  }

  async commandOn(): Promise<string> {
    let command: string
    if (this.device.customize && this.device.customOn) {
      command = this.device.customOn
    } else {
      command = 'turnOn'
    }
    return command
  }

  async commandOff(): Promise<string> {
    let command: string
    if (this.device.customize && this.device.customOff) {
      command = this.device.customOff
    } else {
      command = 'turnOff'
    }
    return command
  }

  async statusCode(statusCode: number): Promise<void> {
    const statusMessages = {
      151: 'Command not supported by this deviceType',
      152: 'Device not found',
      160: 'Command is not supported',
      161: 'Device is offline',
      171: `Hub Device is offline. Hub: ${this.device.hubDeviceId}`,
      190: 'Device internal error due to device states not synchronized with server, or command format is invalid',
      100: 'Command successfully sent',
      200: 'Request successful',
      400: 'Bad Request, an invalid payload request',
      401: 'Unauthorized, Authorization for the API is required, but the request has not been authenticated',
      403: 'Forbidden, The request has been authenticated but does not have appropriate permissions, or a requested resource is not found',
      404: 'Not Found, Specifies the requested path does not exist',
      406: 'Not Acceptable, a MIME type has been requested via the Accept header for a value not supported by the server',
      415: 'Unsupported Media Type, a contentType header has been defined that is not supported by the server',
      422: 'Unprocessable Entity: The server cannot process the request, often due to exceeded API limits.',
      429: 'Too Many Requests, exceeded the number of requests allowed for a given time window',
      500: 'Internal Server Error, An unexpected error occurred. These errors should be rare',
    }
    if (statusCode === 171 && (this.device.hubDeviceId === this.device.deviceId || this.device.hubDeviceId === '000000000000')) {
      this.debugErrorLog(`statusCode 171 changed to 161: hubDeviceId ${this.device.hubDeviceId} matches deviceId ${this.device.deviceId}, device is its own hub.`)
      statusCode = 161
    }
    const logMessage = statusMessages[statusCode] || `Unknown statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`
    const logMethod = [100, 200].includes(statusCode) ? 'debugLog' : statusMessages[statusCode] ? 'errorLog' : 'infoLog'
    this[logMethod](`${logMessage}, statusCode: ${statusCode}`)
  }

  /**
   * Logging for Device
   */
  async infoLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.info(`${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
    }
  }

  async successLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.success(`${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
    }
  }

  async debugSuccessLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.success(`[DEBUG] ${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
      }
    }
  }

  async warnLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.warn(`${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
    }
  }

  async debugWarnLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.warn(`[DEBUG] ${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
      }
    }
  }

  async errorLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      this.log.error(`${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
    }
  }

  async debugErrorLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (await this.loggingIsDebug()) {
        this.log.error(`[DEBUG] ${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
      }
    }
  }

  async debugLog(...log: any[]): Promise<void> {
    if (await this.enablingDeviceLogging()) {
      if (this.deviceLogging === 'debug') {
        this.log.info(`[DEBUG] ${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
      } else if (this.deviceLogging === 'debugMode') {
        this.log.debug(`${this.device.remoteType}: ${this.accessory.displayName}`, String(...log))
      }
    }
  }

  async loggingIsDebug(): Promise<boolean> {
    return this.deviceLogging === 'debugMode' || this.deviceLogging === 'debug'
  }

  async enablingDeviceLogging(): Promise<boolean> {
    return this.deviceLogging === 'debugMode' || this.deviceLogging === 'debug' || this.deviceLogging === 'standard'
  }
}
