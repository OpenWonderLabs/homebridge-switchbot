import type { RelaySwitchChannelCommands, RelaySwitchStatus } from '../types/device.js';
import { WoRelaySwitch1 } from './wo-relay-switch-1.js';
/**
 * Relay Switch 2PM Device (2-channel with power monitoring)
 * Extends Relay Switch 1 with channel-specific control
 */
export declare class WoRelaySwitch2PM extends WoRelaySwitch1 implements RelaySwitchChannelCommands {
    /**
     * Set channel 1 state
     */
    setChannel1(state: boolean): Promise<boolean>;
    /**
     * Set channel 2 state
     */
    setChannel2(state: boolean): Promise<boolean>;
    /**
     * Get device status (inherited, same as 1PM)
     */
    getStatus(): Promise<RelaySwitchStatus>;
}
//# sourceMappingURL=wo-relay-switch-2pm.d.ts.map