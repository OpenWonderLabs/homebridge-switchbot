// Error classes for node-switchbot v4 compatibility
// Always use local fallback classes for compatibility; upstream error classes are not guaranteed to exist
const SwitchbotOperationError = class extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.name = 'SwitchbotOperationError';
        this.code = code;
        this.cause = cause;
    }
};
const SwitchbotAuthenticationError = class extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.name = 'SwitchbotAuthenticationError';
        this.code = code;
        this.cause = cause;
    }
};
const CharacteristicMissingError = class extends Error {
    characteristic;
    constructor(message, characteristic) {
        super(message);
        this.name = 'CharacteristicMissingError';
        this.characteristic = characteristic;
    }
};
export { CharacteristicMissingError, SwitchbotAuthenticationError, SwitchbotOperationError };
//# sourceMappingURL=errors.js.map