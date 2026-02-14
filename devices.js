/**
 * Device API layer for Gerty Home Automation.
 *
 * Each device exposes:
 *   - getState()  -> Promise<object>   current readings / status
 *   - setState(v) -> Promise<object>   send a command (toggles, set-points, etc.)
 *
 * The solar battery reads live data from a Victron inverter via the VRM API
 * (see victron.js).  Solar production reads from a SolarEdge inverter via
 * their monitoring API (see solaredge.js).  When either is not configured
 * it falls back to mock data so the UI still works during development.
 */

const Devices = (() => {
  // --------------- internal mock state ---------------
  let poolPumpOn = false;
  let solarBatteryPct = 72; // percent (mock fallback)
  let mockSolarPower = 3200; // watts (mock fallback)
  let mockSolarDir = -50;

  // Simulate slow battery drain / charge so the UI feels alive
  let batteryDirection = -1;
  setInterval(() => {
    solarBatteryPct += batteryDirection;
    if (solarBatteryPct <= 10) batteryDirection = 1;
    if (solarBatteryPct >= 100) batteryDirection = -1;

    mockSolarPower += mockSolarDir;
    if (mockSolarPower <= 0) { mockSolarPower = 0; mockSolarDir = 50; }
    if (mockSolarPower >= 5000) mockSolarDir = -50;
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
    solarProduction: {
      /**
       * @returns {Promise<{
       *   currentPower: number,
       *   energyToday: number,
       *   energyMonth: number,
       *   energyYear: number,
       *   energyLifetime: number,
       *   source: "solaredge" | "mock"
       * }>}
       */
      async getState() {
        // Try SolarEdge API first
        if (typeof SolarEdge !== "undefined" && SolarEdge.isConfigured()) {
          try {
            const data = await SolarEdge.getProduction();
            return { ...data, source: "solaredge" };
          } catch (err) {
            console.warn("SolarEdge fetch failed, using mock:", err.message);
          }
        }

        // Fallback: mock data
        return {
          currentPower: mockSolarPower,
          energyToday: 18400,
          energyMonth: 486000,
          energyYear: 4230000,
          energyLifetime: 12750000,
          source: "mock",
        };
      },
    },
  };
})();
