/* Copyright(C) 2017-2023, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * util.ts: @switchbot/homebridge-switchbot platform class.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
