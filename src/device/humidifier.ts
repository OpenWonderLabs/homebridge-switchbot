/* Copyright(C) 2021-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * humidifier.ts: @switchbot/homebridge-switchbot.
 */
import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge'

import type { SwitchBotPlatform } from '../platform.js'
import type { devicesConfig } from '../settings.js'
import type { humidifierServiceData } from '../types/bledevicestatus.js'
import type { device } from '../types/devicelist.js'
import type { humidifierStatus } from '../types/devicestatus.js'
import type { humidifierWebhookContext } from '../types/devicewebhookstatus.js'

/*
* For Testing Locally:
* import { SwitchBotBLEModel, SwitchBotBLEModelName } from '/Users/Shared/GitHub/OpenWonderLabs/node-switchbot/dist/index.js';
*/
import { SwitchBotBLEModel, SwitchBotBLEModelName } from 'node-switchbot'
import { debounceTime, interval, skipWhile, Subject, take, tap } from 'rxjs'

import { convertUnits, formatDeviceIdAsMac, validHumidity } from '../utils.js'
import { deviceBase } from './device.js'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Humidifier extends deviceBase {
  // Services
  private HumidifierDehumidifier: {
    Name: CharacteristicValue
    Service: Service
    Active: CharacteristicValue
    WaterLevel: CharacteristicValue
    CurrentRelativeHumidity: CharacteristicValue
    TargetHumidifierDehumidifierState: CharacteristicValue
    CurrentHumidifierDehumidifierState: CharacteristicValue
    RelativeHumidityHumidifierThreshold: CharacteristicValue
  }

  private TemperatureSensor?: {
    Name: CharacteristicValue
    Service: Service
    CurrentTemperature: CharacteristicValue
  }

  // OpenAPI
  deviceStatus!: humidifierStatus

  // Webhook
  webhookContext!: humidifierWebhookContext

  // BLE
  serviceData!: humidifierServiceData

  // Updates
  humidifierUpdateInProgress!: boolean
  doHumidifierUpdate!: Subject<void>

  constructor(
    readonly platform: SwitchBotPlatform,
    accessory: PlatformAccessory,
    device: device & devicesConfig,
  ) {
    super(platform, accessory, device)
    // Set category
    accessory.category = this.hap.Categories.AIR_HUMIDIFIER

    // this is subject we use to track when we need to POST changes to the SwitchBot API
    this.doHumidifierUpdate = new Subject()
    this.humidifierUpdateInProgress = false

    // Initialize the HumidifierDehumidifier Service
    accessory.context.HumidifierDehumidifier = accessory.context.HumidifierDehumidifier ?? {}
    this.HumidifierDehumidifier = {
      Name: accessory.displayName,
      Service: accessory.getService(this.hap.Service.HumidifierDehumidifier) ?? accessory.addService(this.hap.Service.HumidifierDehumidifier) as Service,
      Active: accessory.context.Active ?? this.hap.Characteristic.Active.ACTIVE,
      WaterLevel: accessory.context.WaterLevel ?? 100,
      CurrentRelativeHumidity: accessory.context.CurrentRelativeHumidity ?? 50,
      TargetHumidifierDehumidifierState: accessory.context.TargetHumidifierDehumidifierState ?? this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER,
      CurrentHumidifierDehumidifierState: accessory.context.CurrentHumidifierDehumidifierState ?? this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE,
      RelativeHumidityHumidifierThreshold: accessory.context.RelativeHumidityHumidifierThreshold ?? 50,
    }
    accessory.context.HumidifierDehumidifier = this.HumidifierDehumidifier as object

    // Initialize the HumidifierDehumidifier Characteristics
    this.HumidifierDehumidifier.Service.setCharacteristic(this.hap.Characteristic.Name, this.HumidifierDehumidifier.Name).setCharacteristic(this.hap.Characteristic.CurrentHumidifierDehumidifierState, this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState).getCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState).setProps({
      validValueRanges: [0, 1],
      minValue: 0,
      maxValue: 1,
      validValues: [0, 1],
    }).onGet(() => {
      return this.HumidifierDehumidifier.TargetHumidifierDehumidifierState
    }).onSet(this.TargetHumidifierDehumidifierStateSet.bind(this))

    this.HumidifierDehumidifier.Service.getCharacteristic(this.hap.Characteristic.Active).onGet(() => {
      return this.HumidifierDehumidifier.Active
    }).onSet(this.ActiveSet.bind(this))

    this.HumidifierDehumidifier.Service.getCharacteristic(this.hap.Characteristic.RelativeHumidityHumidifierThreshold).setProps({
      validValueRanges: [0, 100],
      minValue: 0,
      maxValue: 100,
      minStep: device.humidifier?.set_minStep ?? 1,
    }).onGet(() => {
      return this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold
    }).onSet(this.RelativeHumidityHumidifierThresholdSet.bind(this))

    // Initialize the Temperature Sensor Service
    if (device.humidifier?.hide_temperature) {
      if (this.TemperatureSensor) {
        this.debugLog('Removing Temperature Sensor Service')
        this.TemperatureSensor!.Service = this.accessory.getService(this.hap.Service.TemperatureSensor) as Service
        accessory.removeService(this.TemperatureSensor!.Service)
      }
    } else {
      accessory.context.TemperatureSensor = accessory.context.TemperatureSensor ?? {}
      this.TemperatureSensor = {
        Name: `${accessory.displayName} Temperature Sensor`,
        Service: accessory.getService(this.hap.Service.TemperatureSensor) ?? this.accessory.addService(this.hap.Service.TemperatureSensor) as Service,
        CurrentTemperature: accessory.context.CurrentTemperature || 30,
      }
      accessory.context.TemperatureSensor = this.TemperatureSensor as object

      // Initialize the Temperature Sensor Characteristics
      this.TemperatureSensor.Service.setCharacteristic(this.hap.Characteristic.Name, this.TemperatureSensor.Name).getCharacteristic(this.hap.Characteristic.CurrentTemperature).setProps({
        validValueRanges: [-273.15, 100],
        minValue: -273.15,
        maxValue: 100,
        minStep: 0.1,
      }).onGet(() => {
        return this.TemperatureSensor!.CurrentTemperature
      })
    }

    // Retrieve initial values and updateHomekit
    try {
      this.debugLog('Retrieve initial values and update Homekit')
      this.refreshStatus()
    } catch (e: any) {
      this.errorLog(`failed to retrieve initial values and update Homekit, Error: ${e}`)
    }

    // regisiter webhook event handler if enabled
    try {
      this.debugLog('Registering Webhook Event Handler')
      this.registerWebhook()
    } catch (e: any) {
      this.errorLog(`failed to registerWebhook, Error: ${e}`)
    }

    // regisiter platform BLE event handler if enabled
    try {
      this.debugLog('Registering Platform BLE Event Handler')
      this.registerPlatformBLE()
    } catch (e: any) {
      this.errorLog(`failed to registerPlatformBLE, Error: ${e}`)
    }

    // Start an update interval
    interval(this.deviceRefreshRate * 1000)
      .pipe(skipWhile(() => this.humidifierUpdateInProgress))
      .subscribe(async () => {
        await this.refreshStatus()
      })

    // Watch for Humidifier change events
    // We put in a debounce of 100ms so we don't make duplicate calls
    this.doHumidifierUpdate
      .pipe(
        tap(() => {
          this.humidifierUpdateInProgress = true
        }),
        debounceTime(this.devicePushRate * 1000),
      )
      .subscribe(async () => {
        try {
          await this.pushChanges()
        } catch (e: any) {
          await this.apiError(e)
          await this.errorLog(`failed pushChanges with ${device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
        }
        this.humidifierUpdateInProgress = false
      })
  }

  async BLEparseStatus(): Promise<void> {
    await this.debugLog('BLEparseStatus')
    await this.debugLog(`(onState, percentage, autoMode) = BLE:(${this.serviceData.onState}, ${this.serviceData.percentage}, ${this.serviceData.autoMode}), current:(${this.HumidifierDehumidifier.Active}, ${this.HumidifierDehumidifier.CurrentRelativeHumidity}, ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}, ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold})`,
    )

    // Active
    this.HumidifierDehumidifier.Active = this.serviceData.onState ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE
    await this.debugLog(`Active: ${this.HumidifierDehumidifier.Active}`)

    // Current Relative Humidity
    this.HumidifierDehumidifier.CurrentRelativeHumidity = validHumidity(this.serviceData.humidity)
    await this.debugLog(`CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`)

    // Target Humidifier Dehumidifier State
    switch (this.serviceData.autoMode) {
      case true:
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState
          = this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER
        this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = this.HumidifierDehumidifier.CurrentRelativeHumidity
        break
      default:
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState = this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER
        this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = this.serviceData.percentage > 100 ? 100 : this.serviceData.percentage
        if (this.HumidifierDehumidifier.CurrentRelativeHumidity > this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold) {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.IDLE
        } else if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE
        } else {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        }
    }
    await this.debugLog(`TargetHumidifierDehumidifierState: ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}, RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}, CurrentHumidifierDehumidifierState: ${this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState}`)
  }

  async openAPIparseStatus(): Promise<void> {
    await this.debugLog('openAPIparseStatus')
    await this.debugLog(`(power, auto, temperature, lackWater, nebulizationEfficiency, version) = OpenAPI:(${this.deviceStatus.power}, ${this.deviceStatus.auto}, ${this.deviceStatus.temperature}, ${this.deviceStatus.lackWater}, ${this.deviceStatus.nebulizationEfficiency}, ${this.deviceStatus.version}), current:(${this.HumidifierDehumidifier.Active}, ${this.HumidifierDehumidifier.CurrentRelativeHumidity}, ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}, ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold})`)

    // Active
    this.HumidifierDehumidifier.Active = this.deviceStatus.power === 'on'
      ? this.hap.Characteristic.Active.ACTIVE
      : this.hap.Characteristic.Active.INACTIVE
    await this.debugLog(`Active: ${this.HumidifierDehumidifier.Active}`)

    // Current Relative Humidity
    this.HumidifierDehumidifier.CurrentRelativeHumidity = validHumidity(this.deviceStatus.humidity)
    await this.debugLog(`CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`)

    // Current Temperature
    if (!this.device.humidifier?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = this.deviceStatus.temperature
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}`)
    }
    // Target Humidifier Dehumidifier State
    switch (this.deviceStatus.auto) {
      case true:
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState
          = this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER
        this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = this.HumidifierDehumidifier.CurrentRelativeHumidity
        break
      default:
        this.HumidifierDehumidifier.TargetHumidifierDehumidifierState = this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER
        this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = this.deviceStatus.nebulizationEfficiency > 100
          ? 100
          : this.deviceStatus.nebulizationEfficiency
        if (this.HumidifierDehumidifier.CurrentRelativeHumidity > this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold) {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.IDLE
        } else if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE
        } else {
          this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING
        }
    }
    await this.debugLog(`TargetHumidifierDehumidifierState: ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}, RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}, CurrentHumidifierDehumidifierState: ${this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState}`)

    // Water Level
    if (this.deviceStatus.lackWater) {
      this.HumidifierDehumidifier.WaterLevel = 0
    } else {
      this.HumidifierDehumidifier.WaterLevel = 100
    }
    await this.debugLog(`WaterLevel: ${this.HumidifierDehumidifier.WaterLevel}`)

    // Firmware Version
    if (this.deviceStatus.version) {
      const version = this.deviceStatus.version.toString()
      await this.debugLog(`Firmware Version: ${version.replace(/^V|-.*$/g, '')}`)
      const deviceVersion = version.replace(/^V|-.*$/g, '') ?? '0.0.0'
      this.accessory
        .getService(this.hap.Service.AccessoryInformation)!
        .setCharacteristic(this.hap.Characteristic.HardwareRevision, deviceVersion)
        .setCharacteristic(this.hap.Characteristic.FirmwareRevision, deviceVersion)
        .getCharacteristic(this.hap.Characteristic.FirmwareRevision)
        .updateValue(deviceVersion)
      this.accessory.context.version = deviceVersion
      await this.debugSuccessLog(`version: ${this.accessory.context.version}`)
    }
  }

  async parseStatusWebhook(): Promise<void> {
    await this.debugLog('parseStatusWebhook')
    await this.debugLog(`(temperature, humidity) = Webhook:(${convertUnits(this.webhookContext.temperature, this.webhookContext.scale, this.device.iosensor?.convertUnitTo)}, ${this.webhookContext.humidity}), current:(${this.TemperatureSensor?.CurrentTemperature}, ${this.HumidifierDehumidifier.CurrentRelativeHumidity})`)

    // CurrentRelativeHumidity
    this.HumidifierDehumidifier.CurrentRelativeHumidity = validHumidity(this.webhookContext.humidity)
    await this.debugLog(`CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`)

    // CurrentTemperature
    if (!this.device.humidifier?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.CurrentTemperature = convertUnits(this.webhookContext.temperature, this.webhookContext.scale, this.device.iosensor?.convertUnitTo)
      await this.debugLog(`CurrentTemperature: ${this.TemperatureSensor.CurrentTemperature}`)
    }
  }

  /**
   * Asks the SwitchBot API for the latest device information
   */
  async refreshStatus(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`refreshStatus enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLERefreshStatus()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIRefreshStatus()
    } else {
      await this.offlineOff()
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, refreshStatus will not happen.`)
    }
  }

  async BLERefreshStatus(): Promise<void> {
    await this.debugLog('BLERefreshStatus')
    const switchbot = await this.switchbotBLE()
    if (switchbot === undefined) {
      await this.BLERefreshConnection(switchbot)
    } else {
      // Start to monitor advertisement packets
      (async () => {
        // Start to monitor advertisement packets
        const serviceData = await this.monitorAdvertisementPackets(switchbot) as humidifierServiceData
        // Update HomeKit
        if (serviceData.model === SwitchBotBLEModel.Humidifier && serviceData.modelName === SwitchBotBLEModelName.Humidifier) {
          this.serviceData = serviceData
          await this.BLEparseStatus()
          await this.updateHomeKitCharacteristics()
        } else {
          await this.errorLog(`failed to get serviceData, serviceData: ${serviceData}`)
          await this.BLERefreshConnection(switchbot)
        }
      })()
    }
  }

  async registerPlatformBLE(): Promise<void> {
    await this.debugLog('registerPlatformBLE')
    if (this.config.options?.BLE) {
      await this.debugLog('is listening to Platform BLE.')
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        this.platform.bleEventHandler[this.device.bleMac] = async (context: humidifierServiceData) => {
          try {
            await this.debugLog(`received BLE: ${JSON.stringify(context)}`)
            this.serviceData = context
            await this.BLEparseStatus()
            await this.updateHomeKitCharacteristics()
          } catch (e: any) {
            await this.errorLog(`failed to handle BLE. Received: ${JSON.stringify(context)} Error: ${e}`)
          }
        }
      } catch (error) {
        await this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      await this.debugLog('is not listening to Platform BLE')
    }
  }

  async openAPIRefreshStatus(): Promise<void> {
    await this.debugLog('openAPIRefreshStatus')
    try {
      const { body, statusCode } = await this.deviceRefreshStatus()
      const deviceStatus: any = await body.json()
      await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
      if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
        await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        this.deviceStatus = deviceStatus.body
        await this.openAPIparseStatus()
        await this.updateHomeKitCharacteristics()
      } else {
        await this.debugWarnLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        await this.debugWarnLog(statusCode, deviceStatus)
      }
    } catch (e: any) {
      await this.apiError(e)
      await this.errorLog(`failed openAPIRefreshStatus with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
    }
  }

  async registerWebhook() {
    if (this.device.webhook) {
      await this.debugLog('is listening webhook.')
      this.platform.webhookEventHandler[this.device.deviceId] = async (context: humidifierWebhookContext) => {
        try {
          await this.debugLog(`received Webhook: ${JSON.stringify(context)}`)
          this.webhookContext = context
          await this.parseStatusWebhook()
          await this.updateHomeKitCharacteristics()
        } catch (e: any) {
          await this.errorLog(`failed to handle webhook. Received: ${JSON.stringify(context)} Error: ${e}`)
        }
      }
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushChanges(): Promise<void> {
    if (!this.device.enableCloudService && this.OpenAPI) {
      await this.errorLog(`pushChanges enableCloudService: ${this.device.enableCloudService}`)
    } else if (this.BLE) {
      await this.BLEpushChanges()
    } else if (this.OpenAPI && this.platform.config.credentials?.token) {
      await this.openAPIpushChanges()
    } else {
      await this.offlineOff()
      await this.debugWarnLog(`Connection Type: ${this.device.connectionType}, pushChanges will not happen.`)
    }
    // Refresh the status from the API
    interval(15000)
      .pipe(skipWhile(() => this.humidifierUpdateInProgress))
      .pipe(take(1))
      .subscribe(async () => {
        await this.refreshStatus()
      })
  }

  async BLEpushChanges(): Promise<void> {
    await this.debugLog('BLEpushChanges')
    if ((this.HumidifierDehumidifier.TargetHumidifierDehumidifierState === this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER)
      && (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE)
      && (this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold !== this.HumidifierDehumidifier.CurrentRelativeHumidity)) {
      const switchbot = await this.platform.connectBLE(this.accessory, this.device)
      try {
        const formattedDeviceId = formatDeviceIdAsMac(this.device.deviceId)
        this.device.bleMac = formattedDeviceId
        await this.debugLog(`bleMac: ${this.device.bleMac}`)
        if (switchbot !== false) {
          switchbot
            .discover({ model: this.device.bleModel, quick: true, id: this.device.bleMac })
            .then(async (device_list: any) => {
              return await device_list[0].percentage(this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold)
            })
            .then(async () => {
              await this.successLog(`RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold} sent over BLE,  sent successfully`)
              await this.updateHomeKitCharacteristics()
            })
            .catch(async (e: any) => {
              await this.apiError(e)
              await this.errorLog(`failed BLEpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
              await this.BLEPushConnection()
            })
        } else {
          await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
          await this.BLEPushConnection()
        }
      } catch (error) {
        await this.errorLog(`failed to format device ID as MAC, Error: ${error}`)
      }
    } else {
      await this.debugLog(`No changes (BLEpushChanges), Active: ${this.HumidifierDehumidifier.Active}, RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}, CurrentRelativeHumidity: ${this.HumidifierDehumidifier.CurrentRelativeHumidity}`)
    }
  }

  async openAPIpushChanges(): Promise<void> {
    await this.debugLog('openAPIpushChanges')
    if ((this.HumidifierDehumidifier.TargetHumidifierDehumidifierState === this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER)
      && (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE)
      && (this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold !== this.HumidifierDehumidifier.CurrentRelativeHumidity)) {
      await this.debugLog(`Auto Off, RelativeHumidityHumidifierThreshold: ${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}!`)
      const bodyChange = JSON.stringify({
        command: 'setMode',
        parameter: `${this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold}`,
        commandType: 'command',
      })
      await this.debugLog(`SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body.json()
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(statusCode)
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.errorLog(`failed openAPIpushChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else if ((this.HumidifierDehumidifier.TargetHumidifierDehumidifierState === this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER) && (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE)) {
      await this.pushAutoChanges()
    } else {
      await this.pushActiveChanges()
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushAutoChanges(): Promise<void> {
    this.debugLog('pushAutoChanges')
    if ((this.HumidifierDehumidifier.TargetHumidifierDehumidifierState
      === this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER)
      && (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE)) {
      await this.debugLog('Pushing Auto')
      const bodyChange = JSON.stringify({
        command: 'setMode',
        parameter: 'auto',
        commandType: 'command',
      })
      await this.debugLog(`pushAutoChanges, SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body.json()
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(statusCode)
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.errorLog(`failed pushAutoChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      await this.debugLog(`No changes (pushAutoChanges), TargetHumidifierDehumidifierState: ${this.HumidifierDehumidifier.TargetHumidifierDehumidifierState}, Active: ${this.HumidifierDehumidifier.Active}`)
    }
  }

  /**
   * Pushes the requested changes to the SwitchBot API
   */
  async pushActiveChanges(): Promise<void> {
    await this.debugLog('pushActiveChanges')
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
      await this.debugLog('Pushing Off')
      const bodyChange = JSON.stringify({
        command: 'turnOff',
        parameter: 'default',
        commandType: 'command',
      })
      await this.debugLog(`pushActiveChanges, SwitchBot OpenAPI bodyChange: ${JSON.stringify(bodyChange)}`)
      try {
        const { body, statusCode } = await this.pushChangeRequest(bodyChange)
        const deviceStatus: any = await body.json()
        await this.debugLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
        if (await this.successfulStatusCodes(statusCode, deviceStatus)) {
          await this.debugSuccessLog(`statusCode: ${statusCode}, deviceStatus: ${JSON.stringify(deviceStatus)}`)
          await this.updateHomeKitCharacteristics()
        } else {
          await this.statusCode(statusCode)
          await this.statusCode(deviceStatus.statusCode)
        }
      } catch (e: any) {
        await this.apiError(e)
        await this.errorLog(`failed pushActiveChanges with ${this.device.connectionType} Connection, Error Message: ${JSON.stringify(e.message)}`)
      }
    } else {
      await this.debugLog(`No changes (pushActiveChanges), Active: ${this.HumidifierDehumidifier.Active}`)
    }
  }

  /**
   * Handle requests to set the "Active" characteristic
   */
  async ActiveSet(value: CharacteristicValue): Promise<void> {
    if (this.HumidifierDehumidifier.Active !== this.accessory.context.Active) {
      await this.infoLog(`Set Active: ${value}`)
    } else {
      await this.debugLog(`No Changes, Active: ${value}`)
    }

    this.HumidifierDehumidifier.Active = value
    this.doHumidifierUpdate.next()
  }

  /**
   * Handle requests to set the "Target Humidifier Dehumidifier State" characteristic
   */
  async TargetHumidifierDehumidifierStateSet(value: CharacteristicValue): Promise<void> {
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.infoLog(`Set TargetHumidifierDehumidifierState: ${value}`)
    } else {
      await this.debugLog(`No Changes, TargetHumidifierDehumidifierState: ${value}`)
    }

    this.HumidifierDehumidifier.TargetHumidifierDehumidifierState = value
    this.doHumidifierUpdate.next()
  }

  /**
   * Handle requests to set the "Relative Humidity Humidifier Threshold" characteristic
   */
  async RelativeHumidityHumidifierThresholdSet(value: CharacteristicValue): Promise<void> {
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.ACTIVE) {
      await this.infoLog(`Set RelativeHumidityHumidifierThreshold: ${value}`)
    } else {
      await this.debugLog(`No Changes, RelativeHumidityHumidifierThreshold: ${value}`)
    }
    // If the Humidifier is off, turn it on
    if (this.HumidifierDehumidifier.Active === this.hap.Characteristic.Active.INACTIVE) {
      this.HumidifierDehumidifier.Active = this.hap.Characteristic.Active.ACTIVE
      this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState = this.hap.Characteristic.CurrentHumidifierDehumidifierState.IDLE
    }

    this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold = value
    this.doHumidifierUpdate.next()
  }

  /**
   * Updates the status for each of the HomeKit Characteristics
   */
  async updateHomeKitCharacteristics(): Promise<void> {
    // CurrentRelativeHumidity
    await this.updateCharacteristic(this.HumidifierDehumidifier.Service, this.hap.Characteristic.CurrentRelativeHumidity, this.HumidifierDehumidifier.CurrentRelativeHumidity, 'CurrentRelativeHumidity')
    // WaterLevel
    await this.updateCharacteristic(this.HumidifierDehumidifier.Service, this.hap.Characteristic.WaterLevel, this.HumidifierDehumidifier.WaterLevel, 'WaterLevel')
    // CurrentHumidifierDehumidifierState
    await this.updateCharacteristic(this.HumidifierDehumidifier.Service, this.hap.Characteristic.CurrentHumidifierDehumidifierState, this.HumidifierDehumidifier.CurrentHumidifierDehumidifierState, 'CurrentHumidifierDehumidifierState')
    // TargetHumidifierDehumidifierState
    await this.updateCharacteristic(this.HumidifierDehumidifier.Service, this.hap.Characteristic.TargetHumidifierDehumidifierState, this.HumidifierDehumidifier.TargetHumidifierDehumidifierState, 'TargetHumidifierDehumidifierState')
    // Active
    await this.updateCharacteristic(this.HumidifierDehumidifier.Service, this.hap.Characteristic.Active, this.HumidifierDehumidifier.Active, 'Active')
    // RelativeHumidityHumidifierThreshold
    await this.updateCharacteristic(this.HumidifierDehumidifier.Service, this.hap.Characteristic.RelativeHumidityHumidifierThreshold, this.HumidifierDehumidifier.RelativeHumidityHumidifierThreshold, 'RelativeHumidityHumidifierThreshold')
    // CurrentTemperature
    if (!this.device.humidifier?.hide_temperature && this.TemperatureSensor?.Service) {
      await this.updateCharacteristic(this.TemperatureSensor.Service, this.hap.Characteristic.CurrentTemperature, this.TemperatureSensor.CurrentTemperature, 'CurrentTemperature')
    }
  }

  async BLEPushConnection() {
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Push Changes')
      await this.openAPIpushChanges()
    }
  }

  async BLERefreshConnection(switchbot: any): Promise<void> {
    await this.errorLog(`wasn't able to establish BLE Connection, node-switchbot: ${switchbot}`)
    if (this.platform.config.credentials?.token && this.device.connectionType === 'BLE/OpenAPI') {
      await this.warnLog('Using OpenAPI Connection to Refresh Status')
      await this.openAPIRefreshStatus()
    }
  }

  async offlineOff(): Promise<void> {
    if (this.device.offline) {
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHumidifierDehumidifierState, this.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE)
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState, this.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER)
      this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.Active, this.hap.Characteristic.Active.INACTIVE)
    }
  }

  async apiError(e: any): Promise<void> {
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentRelativeHumidity, e)
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.WaterLevel, e)
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.CurrentHumidifierDehumidifierState, e)
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.TargetHumidifierDehumidifierState, e)
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.Active, e)
    this.HumidifierDehumidifier.Service.updateCharacteristic(this.hap.Characteristic.RelativeHumidityHumidifierThreshold, e)
    if (!this.device.humidifier?.hide_temperature && this.TemperatureSensor?.Service) {
      this.TemperatureSensor.Service.updateCharacteristic(this.hap.Characteristic.CurrentTemperature, e)
    }
  }
}
