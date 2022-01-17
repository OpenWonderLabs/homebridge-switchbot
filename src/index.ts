import * as homebridge from "homebridge";
import * as settings from "./settings";
import * as platform from "./platform";

/**
 * This method registers the platform with Homebridge
 */
export = (api: homebridge.API): void => {
  api.registerPlatform(settings.PLATFORM_NAME, platform.SwitchBotPlatform);
};
