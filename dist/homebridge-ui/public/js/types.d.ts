declare global {
    interface HomebridgeToastApi {
        success?: (message: string, title?: string) => void;
        error?: (message: string, title?: string) => void;
        warning?: (message: string, title?: string) => void;
        info?: (message: string, title?: string) => void;
    }
    interface HomebridgePluginUiAPI {
        request: (endpoint: string, params?: any) => Promise<any>;
        getPluginConfig?: () => Promise<any[]>;
        updatePluginConfig?: (config: any[]) => Promise<void>;
        savePluginConfig?: () => Promise<void>;
        closeSettings?: () => void;
        showSpinner?: () => void;
        hideSpinner?: () => void;
        disableSaveButton?: () => void;
        enableSaveButton?: () => void;
        toast?: HomebridgeToastApi;
    }
    let homebridge: HomebridgePluginUiAPI;
}
export {};
//# sourceMappingURL=types.d.ts.map