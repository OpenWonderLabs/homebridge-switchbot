/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * airpurifier.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'
import type { airPurifierServiceData, airPurifierStatus, bodyChange, device, SwitchbotDevice } from 'node-switchbot'
/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import { formatDeviceIdAsMac } from '../utils.js'
import { deviceBase } from './device.js'

export class AirPurifier extends deviceBase {
  // Services
  private AirPurifier: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    CurrentAirPurifierState: CharacteristicValue
    TargetAirPurifierState: CharacteristicValue
    RotationSpeed: CharacteristicValue
    LockPhysicalControls: CharacteristicValue
  }

  private AirQualitySensor?: {
    Name: CharacteristicValue
    Service: Service
    AirQuality: CharacteristicValue
    PM2_5Density: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: airPurifierStatus

  // BLE
  serviceData!: airPurifierServiceData

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
      CurrentAirPurifierState: accessory.context.CurrentAirPurifierState ?? this.hap.Characteristic.CurrentAirPurifierState.INACTIVE,
      TargetAirPurifierState: accessory.context.TargetAirPurifierState ?? this.hap.Characteristic.TargetAirPurifierState.AUTO,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
      LockPhysicalControls: accessory.context.LockPhysicalControls ?? this.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED,
    }
    accessory.context.AirPurifier = this.AirPurifier as object

    // Initialize AirPurifier Service Characteristics
    this.AirPurifier.Service.setCharacteristic(this.hap.Characteristic.Name, this.AirPurifier.Name).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.AirPurifier.Active
    }).onSet(this.ActiveSet.bind(this))

    // Initialize AirPurifier RotationSpeed Characteristic
    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed).onGet(() => {
      return this.AirPurifier.RotationSpeed
    }).onSet(this.RotationSpeedSet.bind(this))

    // Initialize AirPurifier CurrentAirPurifierState Characteristic
    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.CurrentAirPurifierState).onGet(() => {
      return this.AirPurifier.CurrentAirPurifierState
    })

    // Initialize AirPurifier TargetAirPurifierState Characteristic
    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.TargetAirPurifierState).onGet(() => {
      return this.AirPurifier.TargetAirPurifierState
    }).onSet(this.TargetAirPurifierStateSet.bind(this))

    // Initialize AirPurifier LockPhysicalControls Characteristic
    this.AirPurifier.Service.getCharacteristic(this.hap.Characteristic.LockPhysicalControls).onGet(() => {
      return this.AirPurifier.LockPhysicalControls
    })

    // Initialize AirQualitySensor Service (optional, based on device capabilities)
    accessory.context.AirQualitySensor = accessory.context.AirQualitySensor ?? {}
    this.AirQualitySensor = {
      Name: `${accessory.displayName} Air Quality`,
      Service: accessory.getService(this.hap.Service.AirQualitySensor) ?? accessory.addService(this.hap.Service.AirQualitySensor) as Service,
      AirQuality: accessory.context.AirQuality ?? this.hap.Characteristic.AirQuality.UNKNOWN,
      PM2_5Density: accessory.context.PM2_5Density ?? 0,
    }
    accessory.context.AirQualitySensor = this.AirQualitySensor as object

    // Initialize AirQualitySensor Characteristics
    this.AirQualitySensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.AirQualitySensor.Name).getCharacteristic(this.hap.Characteristic.AirQuality).onGet(() => {
      return this.AirQualitySensor!.AirQuality
    })

    this.AirQualitySensor.Service.getCharacteristic(this.hap.Characteristic.PM2_5Density).onGet(() => {
      return this.AirQualitySensor!.PM2_5Density
    })

    // Retrieve initial values and updateHomekit
    try {
      this.debugLog('Retrieve initial values and update Homekit')
      this.refreshStatus()
    } catch (e: any) {
      this.errorLog(`failed to retrieve initial values and update Homekit, Error: ${e.message ?? e}`)
    }

    // register webhook event handler if enabled
    try {
      this.debugLog('Registering Webhook Event Handler')
      this.registerWebhook()
    } catch (e: any) {
      this.errorLog(`failed to registerWebhook, Error: ${e.message ?? e}`)
    }

    // register platform BLE event handler if enabled
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

    // Watch for Air Purifier change events
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
          this.errorLog(`failed pushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
        }
        this.airPurifierUpdateInProgress = false
      })
  }

  /**
   * Validates that essential BLE service data properties are present
   * @param data - The service data to validate
   * @returns true if all essential properties are defined, false otherwise
   */
  private hasEssentialBLEData(data: airPurifierServiceData): boolean {
    return data !== undefined
      && data !== null
      && data.isOn !== undefined
      && data.mode !== undefined
      && data.child_lock !== undefined
      && data.speed !== undefined
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog('BLEparseStatus')
    this.debugLog(`(isOn, mode, child_lock, speed) = BLE:(${this.serviceData.isOn}, ${this.serviceData.mode}, ${this.serviceData.child_lock}, ${this.serviceData.speed}), current:(${this.AirPurifier.Active}, ${this.AirPurifier.TargetAirPurifierState}, ${this.AirPurifier.LockPhysicalControls}, ${this.AirPurifier.RotationSpeed})`)

    // Active
    this.AirPurifier.Active = this.serviceData.isOn ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.AirPurifier.Active}`)

    // CurrentAirPurifierState
    if (this.serviceData.isOn) {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
    } else {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.INACTIVE
    }
    this.debugLog(`CurrentAirPurifierState: ${this.AirPurifier.CurrentAirPurifierState}`)

    // TargetAirPurifierState (mode: 0 = auto, 1 = manual/low, 2 = medium, 3 = high)
    if (this.serviceData.mode === 'auto' || this.serviceData.mode === null) {
      this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.AUTO
    } else {
      this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.MANUAL
    }
    this.debugLog(`TargetAirPurifierState: ${this.AirPurifier.TargetAirPurifierState}`)

    // RotationSpeed
    this.AirPurifier.RotationSpeed = this.serviceData.speed
    this.debugLog(`RotationSpeed: ${this.AirPurifier.RotationSpeed}`)

    // LockPhysicalControls
    this.AirPurifier.LockPhysicalControls = this.serviceData.child_lock
      ? this.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED
      : this.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED
    this.debugLog(`LockPhysicalControls: ${this.AirPurifier.LockPhysicalControls}`)

    // AirQuality (if sensor is enabled)
    if (this.AirQualitySensor && this.serviceData.isAqiValid) {
      const aqiLevel = this.serviceData.aqi_level
      if (aqiLevel === 'excellent') {
        this.AirQualitySensor.AirQuality = this.hap.Characteristic.AirQuality.EXCELLENT
      } else if (aqiLevel === 'good') {
        this.AirQualitySensor.AirQuality = this.hap.Characteristic.AirQuality.GOOD
      } else if (aqiLevel === 'fair') {
        this.AirQualitySensor.AirQuality = this.hap.Characteristic.AirQuality.FAIR
      } else if (aqiLevel === 'poor') {
        this.AirQualitySensor.AirQuality = this.hap.Characteristic.AirQuality.INFERIOR
      } else {
        this.AirQualitySensor.AirQuality = this.hap.Characteristic.AirQuality.POOR
      }
      this.debugLog(`AirQuality: ${this.AirQualitySensor.AirQuality}`)
    }
  }

  async openAPIparseStatus() {
    this.debugLog('openAPIparseStatus')
    this.debugLog(`(version, power, mode, childLock) = OpenAPI:(${this.deviceStatus.version}, ${this.deviceStatus.power}, ${this.deviceStatus.mode}, ${this.deviceStatus.childLock}), current:(${this.accessory.context.version}, ${this.AirPurifier.Active}, ${this.AirPurifier.TargetAirPurifierState}, ${this.AirPurifier.LockPhysicalControls})`)

    // Active
    this.AirPurifier.Active = this.deviceStatus.power === 'on' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.AirPurifier.Active}`)

    // CurrentAirPurifierState
    if (this.deviceStatus.power === 'on') {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR
    } else {
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.INACTIVE
    }
    this.debugLog(`CurrentAirPurifierState: ${this.AirPurifier.CurrentAirPurifierState}`)

    // TargetAirPurifierState (mode: 0 = auto, 1 = low, 2 = medium, 3 = high)
    if (this.deviceStatus.mode === 0) {
      this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.AUTO
    } else {
      this.AirPurifier.TargetAirPurifierState = this.hap.Characteristic.TargetAirPurifierState.MANUAL
    }
    this.debugLog(`TargetAirPurifierState: ${this.AirPurifier.TargetAirPurifierState}`)

    // RotationSpeed (convert mode to percentage)
    if (this.deviceStatus.mode === 0) {
      this.AirPurifier.RotationSpeed = 0 // Auto mode
    } else {
      this.AirPurifier.RotationSpeed = Math.round((this.deviceStatus.mode / 3) * 100)
    }
    this.debugLog(`RotationSpeed: ${this.AirPurifier.RotationSpeed}`)

    // LockPhysicalControls
    this.AirPurifier.LockPhysicalControls = this.deviceStatus.childLock === 1
      ? this.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED
      : this.hap.Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED
    this.debugLog(`LockPhysicalControls: ${this.AirPurifier.LockPhysicalControls}`)

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

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`refreshStatus enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
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
        const serviceData = await this.monitorAdvertisementPackets(switchBotBLE) as airPurifierServiceData
        // Update HomeKit
        if ((serviceData.model === SwitchBotBLEModel.AirPurifier || serviceData.model === SwitchBotBLEModel.AirPurifierTable) 
            && (serviceData.modelName === SwitchBotBLEModelName.AirPurifier || serviceData.modelName === SwitchBotBLEModelName.AirPurifierTable)) {
          this.serviceData = serviceData
          // Validate that essential properties are present in serviceData
          if (this.hasEssentialBLEData(serviceData)) {
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
          } else {
            this.errorLog(`serviceData is missing essential properties, serviceData: ${JSON.stringify(serviceData)}`)
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
        this.platform.bleEventHandler[this.device.bleMac] = async (context: airPurifierServiceData) => {
          try {
            this.serviceData = context
            // Validate that essential properties are present in context
            if (this.hasEssentialBLEData(context)) {
              this.debugLog(`received BLE: ${JSON.stringify(context)}`)
              await this.BLEparseStatus()
              await this.updateHomeKitCharacteristics()
            } else {
              this.errorLog(`context is missing essential properties, context: ${JSON.stringify(context)}`)
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
      const response = await this.deviceRefreshStatus()
      const deviceStatus: any = response.body
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
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: any) => {
        try {
          this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
          // Webhook handling would go here when available
          // For now, just refresh status
          await this.refreshStatus()
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
   * commandType   command         parameter         Description
   * "command"     "turnOff"       "default"     =   set to OFF state
   * "command"     "turnOn"        "default"     =   set to ON state
   * "command"     "setMode"       "{0-3}"       =   0 for auto, 1 for low, 2 for medium, 3 for high
   */

  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLEpushChanges()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
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
      this.debugLog(`BLEpushChanges Active: ${this.AirPurifier.Active} ActiveCached: ${this.accessory.context.Active}`)
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
      this.debugLog(`No changes (BLEpushChanges), Active: ${this.AirPurifier.Active}, ActiveCached: ${this.accessory.context.Active}`)
    }
  }

  async openAPIpushChanges(): Promise<void> {
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
        const response = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = response.body
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

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.Active, this.AirPurifier.Active, 'Active')
    // CurrentAirPurifierState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.CurrentAirPurifierState, this.AirPurifier.CurrentAirPurifierState, 'CurrentAirPurifierState')
    // TargetAirPurifierState
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.TargetAirPurifierState, this.AirPurifier.TargetAirPurifierState, 'TargetAirPurifierState')
    // RotationSpeed
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.RotationSpeed, this.AirPurifier.RotationSpeed, 'RotationSpeed')
    // LockPhysicalControls
    await this.updateCharacteristic(this.AirPurifier.Service, this.hap.Characteristic.LockPhysicalControls, this.AirPurifier.LockPhysicalControls, 'LockPhysicalControls')
    // AirQuality (if sensor is enabled)
    if (this.AirQualitySensor) {
      await this.updateCharacteristic(this.AirQualitySensor.Service, this.hap.Characteristic.AirQuality, this.AirQualitySensor.AirQuality, 'AirQuality')
      await this.updateCharacteristic(this.AirQualitySensor.Service, this.hap.Characteristic.PM2_5Density, this.AirQualitySensor.PM2_5Density, 'PM2_5Density')
    }
  }

  async ActiveSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`Active: ${value}`)
    this.AirPurifier.Active = value
    this.doAirPurifierUpdate.next()
  }

  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`RotationSpeed: ${value}`)
    this.AirPurifier.RotationSpeed = value
    // Note: Speed changes might need additional API calls depending on the device capabilities
    // For now, we just update the value
  }

  async TargetAirPurifierStateSet(value: CharacteristicValue): Promise<void> {
    this.debugLog(`TargetAirPurifierState: ${value}`)
    this.AirPurifier.TargetAirPurifierState = value
    // Note: Mode changes might need additional API calls depending on the device capabilities
    // For now, we just update the value
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Push Changes')
      await this.openAPIpushChanges()
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      this.warnLog('Using OpenAPI Connection to Refresh Status')
      await this.openAPIRefreshStatus()
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.AirPurifier.Active = this.hap.Characteristic.Active.INACTIVE
      this.AirPurifier.CurrentAirPurifierState = this.hap.Characteristic.CurrentAirPurifierState.INACTIVE
    }
  }

  async apiError(e: any): Promise<void> {
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e)
    this.AirPurifier.Service.updateCharacteristic(this.hap.Characteristic.LockPhysicalControls, e)
    if (this.AirQualitySensor) {
      this.AirQualitySensor.Service.updateCharacteristic(this.hap.Characteristic.AirQuality, e)
      this.AirQualitySensor.Service.updateCharacteristic(this.hap.Characteristic.PM2_5Density, e)
    }
  }
}
