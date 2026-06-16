import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';
import { registerConfigEndpoints } from './endpoints/config.js';
import { registerDeviceEndpoints } from './endpoints/devices.js';
import { registerDiscoveryEndpoint } from './endpoints/discovery.js';
const server = new HomebridgePluginUiServer();
// Register all endpoints
registerConfigEndpoints(server);
registerDiscoveryEndpoint(server);
registerDeviceEndpoints(server);
server.ready();
//# sourceMappingURL=server.js.map