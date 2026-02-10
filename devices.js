/**
 * Device API layer for Gerty Home Automation.
 *
 * Each device exposes:
 *   - getState()  -> Promise<object>   current readings / status
 *   - setState(v) -> Promise<object>   send a command (toggles, set-points, etc.)
 *
 * The solar battery reads live data from a Victron inverter via the VRM API
 * (see victron.js).  When VRM is not yet configured it falls back to mock
 * data so the UI still works during development.
 */

const Devices = (() => {
  // --------------- internal mock state ---------------
  let poolPumpOn = false;
  let solarBatteryPct = 72; // percent (mock fallback)

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
      /**
       * @returns {Promise<{
       *   percent: number,
       *   voltage: number | null,
       *   current: number | null,
       *   power: number | null,
       *   state: string,
       *   source: "victron" | "mock"
       * }>}
       */
      async getState() {
        // Try Victron VRM first
        if (typeof Victron !== "undefined" && Victron.isConfigured()) {
          try {
            const data = await Victron.getBatteryState();
            return { ...data, source: "victron" };
          } catch (err) {
            console.warn("Victron VRM fetch failed, using mock:", err.message);
          }
        }

        // Fallback: mock data
        return {
          percent: solarBatteryPct,
          voltage: null,
          current: null,
          power: null,
          state: "N/A",
          source: "mock",
        };
      },
    },
  };
})();
