import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super()
    this.ready()
  }
}

function startPluginUiServer(): PluginUiServer {
  return new PluginUiServer()
}

startPluginUiServer()
