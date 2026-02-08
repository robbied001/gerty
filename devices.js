/**
 * Device API layer for Gerty Home Automation.
 *
 * Each device exposes:
 *   - getState()  -> Promise<object>   current readings / status
 *   - setState(v) -> Promise<object>   send a command (toggles, set-points, etc.)
 *
 * Right now these return mock data.  Swap the implementations for real
 * HTTP / MQTT / WebSocket calls when you connect actual hardware.
 */

const Devices = (() => {
  // --------------- internal mock state ---------------
  let poolPumpOn = false;
  let solarBatteryPct = 72; // percent

  // Simulate slow battery drain / charge so the UI feels alive
  let batteryDirection = -1;
  setInterval(() => {
    solarBatteryPct += batteryDirection;
    if (solarBatteryPct <= 10) batteryDirection = 1;
    if (solarBatteryPct >= 100) batteryDirection = -1;
  }, 5000);

  // --------------- public API ---------------
  return {
    poolPump: {
      /** @returns {Promise<{on: boolean}>} */
      getState() {
        return Promise.resolve({ on: poolPumpOn });
      },
      /** @param {boolean} on */
      setState(on) {
        poolPumpOn = Boolean(on);
        return Promise.resolve({ on: poolPumpOn });
      },
    },

    solarBattery: {
      /** @returns {Promise<{percent: number}>} */
      getState() {
        return Promise.resolve({ percent: solarBatteryPct });
      },
    },
  };
})();
