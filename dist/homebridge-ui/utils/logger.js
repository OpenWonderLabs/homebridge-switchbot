/* eslint-disable no-console */
const PREFIX = '[SwitchBot UI/Server]';
export const uiLog = {
    info: (message, ...parameters) => {
        console.log(PREFIX, message, ...parameters);
    },
    warn: (message, ...parameters) => {
        console.warn(PREFIX, message, ...parameters);
    },
    error: (message, ...parameters) => {
        console.error(PREFIX, message, ...parameters);
    },
    debug: (message, ...parameters) => {
        console.debug(PREFIX, message, ...parameters);
    },
};
//# sourceMappingURL=logger.js.map