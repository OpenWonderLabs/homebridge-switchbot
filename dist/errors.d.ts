declare const SwitchbotOperationError: {
    new (message: string, code?: string, cause?: Error): {
        code?: string;
        cause?: Error;
        name: string;
        message: string;
        stack?: string;
    };
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
    prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]): any;
    stackTraceLimit: number;
};
declare const SwitchbotAuthenticationError: {
    new (message: string, code?: string, cause?: Error): {
        code?: string;
        cause?: Error;
        name: string;
        message: string;
        stack?: string;
    };
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
    prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]): any;
    stackTraceLimit: number;
};
declare const CharacteristicMissingError: {
    new (message: string, characteristic: string): {
        characteristic: string;
        name: string;
        message: string;
        stack?: string;
        cause?: unknown;
    };
    captureStackTrace(targetObject: object, constructorOpt?: Function): void;
    prepareStackTrace(err: Error, stackTraces: NodeJS.CallSite[]): any;
    stackTraceLimit: number;
};
export { CharacteristicMissingError, SwitchbotAuthenticationError, SwitchbotOperationError };
//# sourceMappingURL=errors.d.ts.map