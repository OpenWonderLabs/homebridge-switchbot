/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * plug.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'
import type { batteryCirculatorFanServiceData, batteryCirculatorFanStatus, batteryCirculatorFanWebhookContext, bodyChange, device, SwitchbotDevice } from 'node-switchbot'

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

export class Fan extends deviceBase {
  // Services
  private Fan: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    SwingMode: CharacteristicValue
    RotationSpeed: CharacteristicValue
  }

  private Battery: {
    Name: CharacteristicValue
    Service: Service
    BatteryLevel: CharacteristicValue
    StatusLowBattery: CharacteristicValue
    ChargingState: CharacteristicValue
  }

  private LightBulb: {
    Name: CharacteristicValue
    Service: Service
    On: CharacteristicValue
    Brightness: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: batteryCirculatorFanStatus

  // Webhook
  webhookContext!: batteryCirculatorFanWebhookContext

  // BLE
  serviceData!: batteryCirculatorFanServiceData

  // Updates
  fanUpdateInProgress!: boolean
  doFanUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.FAN

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doFanUpdate = new Subject()
    this.fanUpdateInProgress = false

    // Initialize Fan Service
    accessory.context.Fan = accessory.context.Fan ?? {}
    this.Fan = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.Fanv2) ?? accessory.addService(this.hap.Service.Fanv2) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.INACTIVE,
      SwingMode: accessory.context.SwingMode ?? this.hap.Characteristic.SwingMode.SWING_DISABLED,
      RotationSpeed: accessory.context.RotationSpeed ?? 0,
    }
    accessory.context.Fan = this.Fan as object

    // Initialize Fan Service
    this.Fan.Service.setCharacteristic(this.hap.Characteristic.Name, this.Fan.Name).getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.Fan.Active
    }).onSet(this.ActiveSet.bind(this))

    // Initialize Fan RotationSpeed Characteristic
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.RotationSpeed).onGet(() => {
      return this.Fan.RotationSpeed
    }).onSet(this.RotationSpeedSet.bind(this))

    // Initialize Fan SwingMode Characteristic
    this.Fan.Service.getCharacteristic(this.hap.Characteristic.SwingMode).onGet(() => {
      return this.Fan.SwingMode
    }).onSet(this.SwingModeSet.bind(this))

    // Initialize Battery Service
    accessory.context.Battery = accessory.context.Battery ?? {}
    this.Battery = {
      Name: `${accessory.displayName} Battery`,
      Service: accessory.getService(this.hap.Service.Battery) ?? accessory.addService(this.hap.Service.Battery) as Service,
      BatteryLevel: accessory.context.BatteryLevel ?? 100,
      StatusLowBattery: accessory.context.StatusLowBattery ?? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      ChargingState: accessory.context.ChargingState ?? this.hap.Characteristic.ChargingState.NOT_CHARGING,
    }
    accessory.context.Battery = this.Battery as object

    // Initialize Battery Service
    this.Battery.Service.setCharacteristic(this.hap.Characteristic.Name, this.Battery.Name).getCharacteristic(this.hap.Characteristic.BatteryLevel).onGet(() => {
      return this.Battery.BatteryLevel
    })

    // Initialize Battery ChargingState Characteristic
    this.Battery.Service.getCharacteristic(this.hap.Characteristic.ChargingState).onGet(() => {
      return this.Battery.ChargingState
    })

    // Initialize Battery StatusLowBattery Characteristic
    this.Battery.Service.getCharacteristic(this.hap.Characteristic.StatusLowBattery).onGet(() => {
      return this.Battery.StatusLowBattery
    })

    // Initialize LightBulb Service
    accessory.context.LightBulb = accessory.context.LightBulb ?? {}
    this.LightBulb = {
      Name: `${accessory.displayName} Night Light`,
      Service: accessory.getService(this.hap.Service.Lightbulb) ?? accessory.addService(this.hap.Service.Lightbulb) as Service,
      On: accessory.context.On ?? false,
      Brightness: accessory.context.Brightness ?? 0,
    }
    accessory.context.LightBulb = this.LightBulb as object

    // Initialize LightBulb Characteristics
    this.LightBulb.Service.setCharacteristic(this.hap.Characteristic.Name, this.LightBulb.Name).getCharacteristic(this.hap.Characteristic.On).onGet(() => {
      return this.LightBulb.On
    }).onSet(this.OnSet.bind(this))

    // Initialize LightBulb Brightness Characteristic
    this.LightBulb.Service.getCharacteristic(this.hap.Characteristic.Brightness).onGet(() => {
      return this.LightBulb.Brightness
    }).onSet(this.BrightnessSet.bind(this))

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
      .pipe(skipWhile(() => this.fanUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for Plug change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doFanUpdate
      .pipe(
        tap(() => {
          this.fanUpdateInProgress = true
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
        this.fanUpdateInProgress = false
      })
  }

  async BLEparseStatus(): Promise<void> {
    this.debugLog('BLEparseStatus')
    this.debugLog(`(powerState, fanSpeed) = BLE:(${this.serviceData.state}, ${this.serviceData.fanSpeed}), current:(${this.Fan.Active}, ${this.Fan.RotationSpeed})`)

    // Active
    this.Fan.Active = this.serviceData.state === 'on' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.Fan.Active}`)

    // RotationSpeed
    this.Fan.RotationSpeed = this.serviceData.fanSpeed // ?? 0
    this.debugLog(`RotationSpeed: ${this.Fan.RotationSpeed}`)
  }

  async openAPIparseStatus() {
    this.debugLog('openAPIparseStatus')
    this.debugLog(`(version, battery, powerState, oscillation, chargingStatus, fanSpeed) = OpenAPI:(${this.deviceStatus.version}, ${this.deviceStatus.battery}, ${this.deviceStatus.power}, ${this.deviceStatus.oscillation}, ${this.deviceStatus.chargingStatus}, ${this.deviceStatus.fanSpeed}), current:(${this.accessory.context.version}, ${this.Battery.BatteryLevel}, ${this.Fan.Active}, ${this.Fan.SwingMode}, ${this.Battery.ChargingState}, ${this.Fan.RotationSpeed})`)

    // Active
    this.Fan.Active = this.deviceStatus.power === 'on' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.Fan.Active}`)

    // SwingMode
    this.Fan.SwingMode = this.deviceStatus.oscillation === 'on'
      ? this.hap.Characteristic.SwingMode.SWING_ENABLED
      : this.hap.Characteristic.SwingMode.SWING_DISABLED
    this.debugLog(`SwingMode: ${this.Fan.SwingMode}`)

    // RotationSpeed
    this.Fan.RotationSpeed = this.deviceStatus.fanSpeed ?? 0
    this.debugLog(`RotationSpeed: ${this.Fan.RotationSpeed}`)

    // ChargingState
    this.Battery.ChargingState = this.deviceStatus.chargingStatus === 'charging'
      ? this.hap.Characteristic.ChargingState.CHARGING
      : this.hap.Characteristic.ChargingState.NOT_CHARGING

    // BatteryLevel
    this.Battery.BatteryLevel = this.deviceStatus.battery
    this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString()
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
    this.debugLog(`(version, battery, powerState, oscillation, chargingStatus, fanSpeed) = Webhook:(${this.webhookContext.version}, ${this.webhookContext.battery}, ${this.webhookContext.powerState}, ${this.webhookContext.oscillation}, ${this.webhookContext.chargingStatus}, ${this.webhookContext.fanSpeed}), current:(${this.accessory.context.version}, ${this.Battery.BatteryLevel}, ${this.Fan.Active}, ${this.Fan.SwingMode}, ${this.Battery.ChargingState}, ${this.Fan.RotationSpeed})`)

    // Active
    this.Fan.Active = this.webhookContext.powerState === 'ON' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    this.debugLog(`Active: ${this.Fan.Active}`)

    // SwingMode
    this.Fan.SwingMode = this.webhookContext.oscillation === 'on'
      ? this.hap.Characteristic.SwingMode.SWING_ENABLED
      : this.hap.Characteristic.SwingMode.SWING_DISABLED
    this.debugLog(`SwingMode: ${this.Fan.SwingMode}`)

    // RotationSpeed
    this.Fan.RotationSpeed = this.webhookContext.fanSpeed // ?? 0
    this.debugLog(`RotationSpeed: ${this.Fan.RotationSpeed}`)

    // BatteryLevel
    this.Battery.BatteryLevel = this.webhookContext.battery
    this.debugLog(`BatteryLevel: ${this.Battery.BatteryLevel}`)

    // StatusLowBattery
    this.Battery.StatusLowBattery = this.Battery.BatteryLevel < 10
      ? this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : this.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
    this.debugLog(`StatusLowBattery: ${this.Battery.StatusLowBattery}`)

    // ChargingState
    this.Battery.ChargingState = this.webhookContext.chargingStatus === 'charging'
      ? this.hap.Characteristic.ChargingState.CHARGING
      : this.hap.Characteristic.ChargingState.NOT_CHARGING
    this.debugLog(`ChargingState: ${this.Battery.ChargingState}`)

    // FirmwareVersion
    if (this.webhookContext.version) {
      const deviceVersion = this.webhookContext.version.replace(/^V|-.*$/g, '') ?? '0.0.0'
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
        const serviceData = await this.monitorAdvertisementPackets(switchBotBLE) as batteryCirculatorFanServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Unknown && SwitchBotBLEModelName.Unknown) {
          this.serviceData = serviceData
          await this.BLEparseStatus()
          await this.updateHomeKitCharacteristics()
        } else {
          this.errorLog(`failed to get serviceData, serviceData: ${JSON.stringify(serviceData)}`)
          await this.BLERefreshConnection(switchBotBLE)
        }
      })()
    }
  }

  async registerPlatformBLE(): Promise<void> {
    this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE) {
      this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: batteryCirculatorFanServiceData) => {
          try {
            this.debugLog(`received BLE: ${JSON.stringify(context)}`)
            this.serviceData = context
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
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
      const { body } = await this.deviceRefreshStatus()
      const deviceStatus: any = await body
      this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      if (await this.successfulStatusCodes(deviceStatus)) {
        this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.deviceStatus = deviceStatus.body
        await this.openAPIparseStatus()
        await this.updateHomeKitCharacteristics()
      } else {
        this.debugWarnLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.debugWarnLog(deviceStatus)
      }
    } catch (e: any) {
      await this.apiError(e)
      this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: batteryCirculatorFanWebhookContext) => {
        try {
          this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
          this.webhookContext = context
          await this.parseStatusWebhook()
          await this.updateHomeKitCharacteristics()
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
    if (!this.device.enableCloudService && this.OpenAPI) {
      this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLEpushChanges()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
      if (this.Fan.Active) {
        this.debugLog(`Active: ${this.Fan.Active}`)
        // Push RotationSpeed Update
        this.debugLog(`RotationSpeed: ${this.Fan.RotationSpeed}`)
        await this.pushRotationSpeedChanges()
        // Push SwingMode Update
        this.debugLog(`SwingMode: ${this.Fan.SwingMode}`)
        await this.pushSwingModeChanges()
      } else {
        this.debugLog('BLE (RotationSpeed) & (SwingMode) changes will not happen, as the device is Off.')
      }
    } else {
      await this.offlineOff()
      this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`)
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.fanUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    this.debugLog('BLEpushChanges')
    if (this.Fan.Active !== this.accessory.context.Active) {
      this.debugLog(`BLEpushChanges On: ${this.Fan.Active} OnCached: ${this.accessory.context.Active}`)
      const switchBotBLE = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchBotBLE !== false) {
          switchBotBLE
            .discover({ model: this.device.bleModel, id: this.device.bleMac })
            .then(async (device_list: SwitchbotDevice[]) => {
              const deviceList = device_list as unknown as SwitchbotDevice[]
              return await this.retryBLE({
                max: await this.maxRetryBLE(),
                fn: async () => {
                  if (this.Fan.Active) {
                    return await deviceList[0].turnOn()
                  } else {
                    return await deviceList[0].turnOff()
                  }
                },
              })
            })
            .then(async () => {
              this.successLog(`Active: ${this.Fan.Active} sent over SwitchBot BLE,  sent successfully`)
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
      this.debugLog(`No change (BLEpushChanges), Active: ${this.Fan.Active}, ActiveCached: ${this.accessory.context.Active}`)
    }
  }

  async openAPIpushChanges() {
    this.debugLog('openAPIpushChanges')
    if (this.Fan.Active !== this.accessory.context.Active) {
      const command = this.Fan.Active ? 'turnOn' : 'turnOff'
      const bodyChange: bodyChange = {
        command: `${command}`,
        parameter: 'default',
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
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
      this.debugLog(`No changes (openAPIpushChanges), Active: ${this.Fan.Active}, ActiveCached: ${this.accessory.context.Active}`)
    }
  }

  async pushRotationSpeedChanges(): Promise<void> {
    this.debugLog('pushRotationSpeedChanges')
    if (this.Fan.SwingMode !== this.accessory.context.SwingMode) {
      const bodyChange: bodyChange = {
        command: 'setWindSpeed',
        parameter: `${this.Fan.RotationSpeed}`,
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
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
      this.debugLog(`No changes (pushRotationSpeedChanges), RotationSpeed: ${this.Fan.RotationSpeed}, RotationSpeedCached: ${this.accessory.context.RotationSpeed}`)
    }
  }

  async pushSwingModeChanges(): Promise<void> {
    this.debugLog('pushSwingModeChanges')
    if (this.Fan.SwingMode !== this.accessory.context.SwingMode) {
      const parameter = this.Fan.SwingMode === this.hap.Characteristic.SwingMode.SWING_ENABLED ? 'on' : 'off'
      const bodyChange: bodyChange = {
        command: 'setOscillation',
        parameter: `${parameter}`,
        commandType: 'command',
      }
      this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body
        this.debugLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(deviceStatus)) {
          this.debugSuccessLog(`statusCode: ${deviceStatus.statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        this.errorLog(`failed pushSwingModeChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      this.debugLog(`No changes (pushSwingModeChanges), SwingMode: ${this.Fan.SwingMode}, SwingModeCached: ${this.accessory.context.SwingMode}`)
    }
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.Active !== this.accessory.context.Active) {
      this.infoLog(`Set Active: ${value}`)
    } else {
      this.debugLog(`No Changes, Active: ${value}`)
    }

    this.Fan.Active = value
    this.doFanUpdate.next()
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async RotationSpeedSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.RotationSpeed !== this.accessory.context.RotationSpeed) {
      this.infoLog(`Set RotationSpeed ${value}`)
    } else {
      this.debugLog(`No Changes, RotationSpeed: ${value}`)
    }

    this.Fan.RotationSpeed = value
    this.doFanUpdate.next()
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async SwingModeSet(value: CharacteristicValue): Promise<void> {
    if (this.Fan.SwingMode !== this.accessory.context.SwingMode) {
      this.infoLog(`Set SwingMode ${value}`)
    } else {
      this.debugLog(`No Changes, SwingMode: ${value}`)
    }

    this.Fan.SwingMode = value
    this.doFanUpdate.next()
  }

  /**
   * Handle requests to set the value of the "On" characteristic
   */
  async OnSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On !== this.accessory.context.On) {
      this.infoLog(`Set On: ${value}`)
    } else {
      this.debugLog(`No Changes, On: ${value}`)
    }

    this.LightBulb.On = value
    this.doFanUpdate.next()
  }

  /**
   * Handle requests to set the value of the "Brightness" characteristic
   */
  async BrightnessSet(value: CharacteristicValue): Promise<void> {
    if (this.LightBulb.On && (this.LightBulb.Brightness !== this.accessory.context.Brightness)) {
      this.infoLog(`Set Brightness: ${value}`)
    } else {
      if (this.LightBulb.On) {
        this.debugLog(`No Changes, Brightness: ${value}`)
      } else {
        this.debugLog(`Set Brightness: ${value}, On: ${this.LightBulb.On}`)
      }
    }

    this.LightBulb.Brightness = value
    this.doFanUpdate.next()
  }

  async updateHomeKitCharacteristics(): Promise<void> {
    // Active
    await this.updateCharacteristic(this.Fan.Service, this.hap.Characteristic.Active, this.Fan.Active, 'Active')
    // RotationSpeed
    await this.updateCharacteristic(this.Fan.Service, this.hap.Characteristic.RotationSpeed, this.Fan.RotationSpeed, 'RotationSpeed')
    // SwingMode
    await this.updateCharacteristic(this.Fan.Service, this.hap.Characteristic.SwingMode, this.Fan.SwingMode, 'SwingMode')
    // BatteryLevel
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.BatteryLevel, this.Battery.BatteryLevel, 'BatteryLevel')
    // ChargingState
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.ChargingState, this.Battery.ChargingState, 'ChargingState')
    // StatusLowBattery
    await this.updateCharacteristic(this.Battery.Service, this.hap.Characteristic.StatusLowBattery, this.Battery.StatusLowBattery, 'StatusLowBattery')
    // On
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.On, this.LightBulb.On, 'On')
    // Brightness
    await this.updateCharacteristic(this.LightBulb.Service, this.hap.Characteristic.Brightness, this.LightBulb.Brightness, 'Brightness')
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
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE)
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, 0)
      this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, this.hap.Characteristic.SwingMode.SWING_DISABLED)
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, false)
      this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Brightness, 0)
    }
  }

  async apiError(e: any): Promise<void> {
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.RotationSpeed, e)
    this.Fan.Service.updateCharacteristic(this.hap.Characteristic.SwingMode, e)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.On, e)
    this.LightBulb.Service.updateCharacteristic(this.hap.Characteristic.Brightness, e)
  }
}
