/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * plug.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'
import type { airPurifierServiceData, airPurifierStatus, airPurifierTableServiceData, airPurifierTableStatus, airPurifierTableWebhookContext, airPurifierWebhookContext, bodyChange, device, SwitchBotBLE, SwitchbotDevice } from 'node-switchbot'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

export class AirPurifier extends deviceBase {
  // Services
  private AirPurifier: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    RotationSpeed: CharacteristicValue
    CurrentAirPurifierState: CharacteristicValue
    TargetAirPurifierState: CharacteristicValue
    CurrentHeaterCoolerState: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: airPurifierStatus | airPurifierTableStatus

  // Webhook
  webhookContext!: airPurifierWebhookContext | airPurifierTableWebhookContext

  // BLE
  serviceData!: airPurifierServiceData | airPurifierTableServiceData

  // Updates
  airPurifierUpdateInProgress!: boolean
  doAirPurifierUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.AIR_PURIFIER

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doAirPurifierUpdate = new Subject()
    this.airPurifierUpdateInProgress = false

    // Initialize AirPurifier Service
    accessory.context.AirPurifier = accessory.context.AirPurifier ?? {}
    this.AirPurifier = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.AirPurifier) ?? accessory.addService(this.hap.Service.AirPurifier) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
      CurrentAirPurifierState: accessory.context.CurrentAirPurifierState ?? this.hap.Characteristic.CurrentAirPurifierState.INACTIVE,
      TargetAirPurifierState: accessory.context.TargetAirPurifierState ?? this.hap.Characteristic.TargetAirPurifierState.AUTO,
      CurrentHeaterCoolerState: accessory.context.CurrentHeaterCoolerState ?? this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE,
    }
    accessory.context.AirPurifier = this.AirPurifier as object

    // Initialize AirPurifier Service
    this.AirPurifier.Service.setCharacteristic(this.hap.Characteristic.Name, this.AirPurifier.Name).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.AirPurifier.Active
    }).onSet(this.ActiveSet.bind(this))

    // Initialize Fan RotationSpeed Characteristic
    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed).onGet(() => {
      return this.AirPurifier.RotationSpeed
    }).onSet(this.RotationSpeedSet.bind(this))

    // Retrieve initial values and updateHomekit
    try {
      this.debugLog('Retrieve initial values and update Homekit')
      this.refreshStatus()
    } catch (e: any) {
      this.errorLog(`failed to retrieve initial values and update Homekit, Error: ${e.message ?? e}`)
    }

    // regisiter webhook event handler if enabled
    try {
      this.debugLog('Registering Webhook Event Handler')
      this.registerWebhook()
    } catch (e: any) {
      this.errorLog(`failed to registerWebhook, Error: ${e.message ?? e}`)
    }

    // regisiter platform BLE event handler if enabled
    try {
      this.debugLog('Registering Platform BLE Event Handler')
      this.registerPlatformBLE()
    } catch (e: any) {
      this.errorLog(`failed to registerPlatformBLE, Error: ${e.message ?? e}`)
    }

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.airPurifierUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doAirPurifierUpdate
      .pipe(
        tap(() => {
          this.airPurifierUpdateInProgress = true
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges()
        } catch (e: any) {
          await this.apiError(e)
          this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
        }
        this.airPurifierUpdateInProgress = false
      })
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog('BLEparseStatus')
    this.debugLog(`(powerState, fanSpeed) = BLE:(${this.serviceData.isOn}, ${this.serviceData.speed}), current:(${this.AirPurifier.Active}, ${this.AirPurifier.RotationSpeed})`)

    // Active
    this.AirPurifier.Active = this.serviceData.isOn ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.AirPurifier.Active}`)

    // RotationSpeed
    this.AirPurifier.RotationSpeed = this.serviceData.speed
    this.debugLog(`RotationSpeed: ${this.AirPurifier.RotationSpeed}`)
  }

  async openAPIparseStatus() {
    this.debugLog('openAPIparseStatus')
    this.debugLog(`(version, power, mode, childLock) = OpenAPI:(${this.deviceStatus.version}, ${this.deviceStatus.power}, ${this.deviceStatus.mode}, ${this.deviceStatus.childLock}), current:(${this.accessory.context.version}, ${this.AirPurifier.Active}, ${this.AirPurifier.TargetAirPurifierState})`)

    // Active - handle both "ON"/"on" and "OFF"/"off"
    this.AirPurifier.Active = (this.deviceStatus.power === 'ON' || this.deviceStatus.power === 'on')
      ? this.hap.Characteristic.Active.ACTIVE
      : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.AirPurifier.Active}`)

    // Map mode to TargetAirPurifierState
    if (this.deviceStatus.mode !== undefined) {
      switch (this.deviceStatus.mode) {
        case 1: // normal/fan mode
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.MANUAL
          break
        case 2: // auto mode
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.AUTO
          break
        case 3: // sleep mode
        case 4: // pet mode
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.MANUAL
          break
        default:
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.AUTO
      }
      this.debugLog(`TargetAirPurifierState (mode ${this.deviceStatus.mode}): ${this.AirPurifier.TargetAirPurifierState}`)
    }

    // CurrentAirPurifierState based on power
    this.AirPurifier.CurrentAirPurifierState = this.AirPurifier.Active
      ? this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
      : this.hap.Characteristic.CurrentAirPurifierState.INACTIVE
    this.debugLog(`CurrentAirPurifierState: ${this.AirPurifier.CurrentAirPurifierState}`)

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version as string
      this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      this.debugSuccessLog(`version: ${this.accessory.context.version}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    this.debugLog('parseStatusWebhook')
    this.debugLog(`(power, mode, childLock) = Webhook:(${this.webhookContext.power}, ${this.webhookContext.mode}, ${this.webhookContext.childLock}), current:(${this.AirPurifier.Active}, ${this.AirPurifier.TargetAirPurifierState})`)

    // Active - handle webhook power state
    this.AirPurifier.Active = (this.webhookContext.power === 'ON' || this.webhookContext.power === 'on')
      ? this.hap.Characteristic.Active.ACTIVE
      : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.AirPurifier.Active}`)

    // Handle mode from webhook if available
    if (this.webhookContext.mode !== undefined) {
      switch (this.webhookContext.mode) {
        case 1:
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.MANUAL
          break
        case 2:
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.AUTO
          break
        case 3:
        case 4:
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.MANUAL
          break
        default:
          this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.AUTO
      }
      this.debugLog(`TargetAirPurifierState: ${this.AirPurifier.TargetAirPurifierState}`)
    }

    // FirmwareVersion
    /* if (this.webhookContext.version) {
      const deviceVersion = this.webhookContext.version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      this.debugSuccessLog(`version: ${this.accessory.context.version}`)
    } */
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (this.BLE) {
      await this.BLERefreshStatus()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus()
    } else {
      await this.offlineOff()
      this.debugWarnLog(`Connection Type: ${this.device.connectionType}, refreshStatus will not happen.`)
    }
  }

  async BLERefreshStatus(): Promise<void> {
    this.debugLog('BLERefreshStatus')
    const switchBotBLE = await this.switchbotBLE()
    if (switchBotBLE === undefined) {
      await this.BLERefreshConnection(switchBotBLE)
    } else {
      // Start to monitor advertisement packets
      (async () => {
        // Start to monitor advertisement packets
        const serviceData = await this.monitorAdvertisementPackets(switchBotBLE) as unknown as airPurifierServiceData | airPurifierTableServiceData
        // Update HomeKit
        if ((serviceData.model === SwitchBotBLEModel.AirPurifier && SwitchBotBLEModelName.AirPurifier) ?? (serviceData.model === SwitchBotBLEModel.AirPurifierTable && SwitchBotBLEModelName.AirPurifierTable)) {
          this.serviceData = serviceData
          if (serviceData !== undefined || serviceData !== null) {
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
          } else {
            this.errorLog(`serviceData is either undefined or null, serviceData: ${JSON.stringify(serviceData)}`)
            await this.BLERefreshConnection(switchBotBLE)
          }
        } else {
          this.errorLog(`failed to get serviceData, serviceData: ${JSON.stringify(serviceData)}`)
          await this.BLERefreshConnection(switchBotBLE)
        }
      })()
    }
  }

  async registerPlatformBLE(): Promise<void> {
    this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE && !this.device.disablePlatformBLE) {
      this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: airPurifierServiceData | airPurifierTableServiceData) => {
          try {
            this.serviceData = context
            if (context !== undefined || context !== null) {
              this.debugLog(`received BLE: ${JSON.stringify(context)}`)
              await this.BLEparseStatus()
              await this.updateHomeKitCharacteristics()
            } else {
              this.errorLog(`context is either undefined or null, context: ${JSON.stringify(context)}`)
              await this.BLERefreshConnection(context)
            }
          } catch (e: any) {
            this.errorLog(`failed to handle BLE. Received: ${JSON.stringify(context)} Error: ${e.message ?? e}`)
          }
        }
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog('is not listening to Platform BLE')
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    this.debugLog('openAPIRefreshStatus')
    try {
      const deviceStatus = await this.deviceRefreshStatus<airPurifierStatus>()
      this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      if (await this.successfulStatusCodes(deviceStatus)) {
        this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.deviceStatus = deviceStatus.body
        await this.openAPIparseStatus()
        await this.updateHomeKitCharacteristics()
      } else {
        this.debugWarnLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      }
    } catch (e: any) {
      await this.apiError(e)
      this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: airPurifierWebhookContext | airPurifierTableWebhookContext) => {
        try {
          this.webhookContext = context
          if (context !== undefined || context !== null) {
            this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
            await this.parseStatusWebhook()
            await this.updateHomeKitCharacteristics()
          } else {
            this.errorLog(`context is either undefined or null, context: ${JSON.stringify(context)}`)
          }
        } catch (e: any) {
          this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e.message ?? e}`)
        }
      }
    } else {
      this.debugLog('is not listening webhook.')
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   * commandType   command                 parameter                                 Description
   * "command"     "turnOff"               "default"                             =   set to OFF state
   * "command"     "turnOn"                "default"                             =   set to ON state
   * "command"     "setNightLightMode"     "off, 1, or 2"                        =   off, turn off nightlight, (1, bright) (2, dim)
   * "command"     "setWindMode"           "direct, natural, sleep, or baby"     =   Set fan mode
   * "command"     "setWindSpeed"          "{1-100} e.g. 10"                     =   Set fan speed 1~100
   */

  async pushChanges(): Promise<void> {
    if (this.BLE) {
      await this.BLEpushChanges()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
      if (this.AirPurifier.Active) {
        this.debugLog(`Active: ${this.AirPurifier.Active}`)
        // Push RotationSpeed Update
        this.debugLog(`RotationSpeed: ${this.AirPurifier.RotationSpeed}`)
        await this.pushRotationSpeedChanges()
      } else {
        this.debugLog('BLE (RotationSpeed) & (SwingMode) changes will not happen, as the device is Off.')
      }
    } else {
      await this.offlineOff()
      this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`)
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.airPurifierUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog('BLEpushChanges')
    if (this.AirPurifier.Active !== this.accessory.context.Active) {
      this.debugLog(`BLEpushChanges On: ${this.AirPurifier.Active} OnCached: ${this.accessory.context.Active}`)
      const switchBotBLE = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchBotBLE !== false) {
          switchBotBLE
            .discover({ model: this.device.bleModel, id: this.device.bleMac })
            .then(async (device_list: SwitchbotDevice[]) => {
              return await this.retryBLE({
                max: this.maxRetryBLE(),
                fn: async () => {
                  if (this.AirPurifier.Active) {
                    return await (device_list[0] as any).turnOn()
                  } else {
                    return await (device_list[0] as any).turnOff()
                  }
                },
              })
            })
            .then(async () => {
              this.successLog(`Active: ${this.AirPurifier.Active} sent over SwitchBot BLE, sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${JSON.stringify(switchBotBLE)}`)
          await this.BLEPushConnection()
        }
      } catch (error) {
        this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      this.debugLog(`No change (BLEpushChanges), Active: ${this.AirPurifier.Active}, ActiveCached: ${this.accessory.context.Active}`)
    }
  }

  async openAPIpushChanges() {
    this.debugLog('openAPIpushChanges')
    if (this.AirPurifier.Active !== this.accessory.context.Active) {
      const command = this.AirPurifier.Active ? 'turnOn' : 'turnOff'
      const bodyChange: bodyChange = {
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const deviceStatus = await this.pushChangeRequest(bodyChange)
        this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(deviceStatus)) {
          this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      this.debugLog(`No changes (openAPIpushChanges), Active: ${this.AirPurifier.Active}, ActiveCached: ${this.accessory.context.Active}`)
    }
  }

  async pushRotationSpeedChanges(): Promise<void> {
    this.debugLog('pushRotationSpeedChanges')
    if (this.AirPurifier.RotationSpeed !== this.accessory.context.RotationSpeed) {
      const bodyChange: bodyChange = {
        command: 'setWindSpeed',
        parameter: `${this.AirPurifier.RotationSpeed}`,
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const deviceStatus = await this.pushChangeRequest(bodyChange)
        this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(deviceStatus)) {
          this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        this.errorLog(`failed pushRotationSpeedChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      this.debugLog(`No changes (pushRotationSpeedChanges), RotationSpeed: ${this.AirPurifier.RotationSpeed}, RotationSpeedCached: ${this.accessory.context.RotationSpeed}`)
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.AirPurifier.Active !== this.accessory.context.Active) {
      this.infoLog(`Set Active: ${value}`)
    } else {
      this.debugLog(`No Changes, Active: ${value}`)
    }

    this.AirPurifier.Active = value
    this.doAirPurifierUpdate.next()
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (this.AirPurifier.RotationSpeed !== this.accessory.context.RotationSpeed) {
      this.infoLog(`Set RotationSpeed ${value}`)
    } else {
      this.debugLog(`No Changes, RotationSpeed: ${value}`)
    }

    this.AirPurifier.RotationSpeed = value
    this.doAirPurifierUpdate.next()
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.Active, this.AirPurifier.Active, 'Active')
    // RotationSpeed
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.RotationSpeed, this.AirPurifier.RotationSpeed, 'RotationSpeed')
    // CurrentAirPurifierState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.CurrentAirPurifierState, this.AirPurifier.CurrentAirPurifierState, 'CurrentAirPurifierState')
    // TargetAirPurifierState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.TargetAirPurifierState, this.AirPurifier.TargetAirPurifierState, 'TargetAirPurifierState')
    // CurrentHeaterCoolerState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.CurrentHeaterCoolerState, this.AirPurifier.CurrentHeaterCoolerState, 'CurrentHeaterCoolerState')
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Push Changes')
      await this.openAPIpushChanges()
    }
  }

  async BLERefreshConnection(switchbot: SwitchBotBLE): Promise<void> {
    this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Refresh Status')
      await this.openAPIRefreshStatus()
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE)
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, 0)
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, this.hap.Characteristic.CurrentAirPurifierState.INACTIVE)
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, this.hap.Characteristic.TargetAirPurifierState.AUTO)
      this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, this.hap.Characteristic.CurrentHeaterCoolerState.INACTIVE)
    }
  }

  async apiError(e: any): Promise<void> {
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState, e)
  }
}
