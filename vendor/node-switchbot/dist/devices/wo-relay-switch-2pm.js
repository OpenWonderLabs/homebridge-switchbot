/* Copyright(C) 2024-2026, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * devices/wo-relay-switch-2pm.ts: SwitchBot v4.0.0 - Relay Switch 2PM Device
 */
import { DEVICE_COMMANDS } from '../settings.js';
import { WoRelaySwitch1 } from './wo-relay-switch-1.js';
/**
 * Relay Switch 2PM Device (2-channel with power monitoring)
 * Extends Relay Switch 1 with channel-specific control
 */
export class WoRelaySwitch2PM extends WoRelaySwitch1 {
    /**
     * Set channel 1 state
     */
    async setChannel1(state) {
        const raw = state ? DEVICE_COMMANDS.RELAY.CHANNEL1_ON : DEVICE_COMMANDS.RELAY.CHANNEL1_OFF;
        const command = this.maybeEncryptCommand([...raw]);
        const result = await this.sendCommand(command, `setChannel1:${state}`);
        return result.success;
    }
    /**
     * Set channel 2 state
     */
    async setChannel2(state) {
        const raw = state ? DEVICE_COMMANDS.RELAY.CHANNEL2_ON : DEVICE_COMMANDS.RELAY.CHANNEL2_OFF;
        const command = this.maybeEncryptCommand([...raw]);
        const result = await this.sendCommand(command, `setChannel2:${state}`);
        return result.success;
    }
    /**
     * Get device status (inherited, same as 1PM)
     */
    async getStatus() {
        return super.getStatus();
    }
}
//# sourceMappingURL=wo-relay-switch-2pm.js.map