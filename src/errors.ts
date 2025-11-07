// Error classes for node-switchbot v4 compatibility
// Always use local fallback classes for compatibility; upstream error classes are not guaranteed to exist

const SwitchbotOperationError = class extends Error {
  code?: string
  cause?: Error
  constructor(message: string, code?: string, cause?: Error) {
    super(message)
    this.name = 'SwitchbotOperationError'
    this.code = code
    this.cause = cause
  }
}

const SwitchbotAuthenticationError = class extends Error {
  code?: string
  cause?: Error
  constructor(message: string, code?: string, cause?: Error) {
    super(message)
    this.name = 'SwitchbotAuthenticationError'
    this.code = code
    this.cause = cause
  }
}

const CharacteristicMissingError = class extends Error {
  characteristic: string
  constructor(message: string, characteristic: string) {
    super(message)
    this.name = 'CharacteristicMissingError'
    this.characteristic = characteristic
  }
}

export { CharacteristicMissingError, SwitchbotAuthenticationError, SwitchbotOperationError }
