/* eslint-disable no-console */
const PREFIX = '[SwitchBot UI/html]'

export const uiLog = {
  info: (message: string, ...parameters: any[]) => {
    console.log(PREFIX, message, ...parameters)
  },
  warn: (message: string, ...parameters: any[]) => {
    console.warn(PREFIX, message, ...parameters)
  },
  error: (message: string, ...parameters: any[]) => {
    console.error(PREFIX, message, ...parameters)
  },
  debug: (message: string, ...parameters: any[]) => {
    console.debug(PREFIX, message, ...parameters)
  },
}
