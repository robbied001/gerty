/**
 * Victron VRM API Client for Gerty Home Automation.
 *
 * Connects to a Victron MultiPlus II (or any Victron system) via the
 * VRM (Victron Remote Management) cloud API to read live battery data.
 *
 * ── Setup ────────────────────────────────────────────────────────────
 *  1. Log in to https://vrm.victronenergy.com
 *  2. Go to Settings → Access Tokens → create a new token
 *  3. Copy the token and your Site (Installation) ID
 *  4. Enter them in the Gerty dashboard settings panel
 *
 * ── Alternative: Modbus TCP (local) ─────────────────────────────────
 *  If your GX device (Cerbo GX / Venus GX) is on the same LAN you can
 *  read registers directly over Modbus TCP (port 502):
 *    Register 840  Battery Voltage   uint16  /10  V
 *    Register 841  Battery Current   int16   /10  A
 *    Register 842  Battery Power     int16   x1   W
 *    Register 843  Battery SOC       uint16  x1   %
 *    Register 844  Battery State     uint16  x1   0=idle 1=charging 2=discharging
 *  Unit-ID: 100  (com.victronenergy.system)
 *  Enable Modbus TCP on the GX: Settings → Services → Modbus-TCP → ON
 *  Note: Modbus TCP requires a server-side proxy since browsers cannot
 *  open raw TCP sockets. The VRM API approach works from the browser.
 */

const Victron = (() => {
  const VRM_BASE = "https://vrmapi.victronenergy.com/v2";

  // ── Persistent config (localStorage) ─────────────────────────────
  const STORAGE_KEY = "gerty_victron_config";

  function loadConfig() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  /**
   * @returns {{ accessToken: string, siteId: string } | null}
   */
  function getCredentials() {
    const cfg = loadConfig();
    if (cfg.accessToken && cfg.siteId) return cfg;
    return null;
  }

  function setCredentials(accessToken, siteId) {
    saveConfig({ accessToken: accessToken.trim(), siteId: siteId.trim() });
  }

  function clearCredentials() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isConfigured() {
    return getCredentials() !== null;
  }

  // ── API helpers ──────────────────────────────────────────────────

  async function vrmFetch(path) {
    const creds = getCredentials();
    if (!creds) throw new Error("Victron VRM not configured");

    const res = await fetch(`${VRM_BASE}${path}`, {
      headers: { "X-Authorization": `Token ${creds.accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`VRM API ${res.status}: ${body}`);
    }

    return res.json();
  }

  // ── Battery data ─────────────────────────────────────────────────

  /**
   * Fetch current battery summary from VRM.
   *
   * @returns {Promise<{
   *   percent: number,
   *   voltage: number | null,
   *   current: number | null,
   *   power: number | null,
   *   state: string
   * }>}
   */
  async function getBatteryState() {
    const creds = getCredentials();
    if (!creds) throw new Error("Victron VRM not configured");

    // Use the diagnostics endpoint — it returns all current installation data
    // including battery SOC, voltage, current, power, and state.
    const data = await vrmFetch(
      `/installations/${creds.siteId}/diagnostics?count=1`
    );

    const records = data.records || [];

    // Helper: find a diagnostic record by its "code" field
    const find = (code) => {
      const r = records.find((d) => d.code === code);
      return r ? parseFloat(r.formattedValue || r.rawValue) : null;
    };

    const soc = find("SOC");
    const voltage = find("bv");
    const current = find("bc");
    const power = find("bp");
    const stateRaw = find("bs");

    const stateMap = { 0: "Idle", 1: "Charging", 2: "Discharging" };

    return {
      percent: soc !== null && !isNaN(soc) ? soc : 0,
      voltage: voltage,
      current: current,
      power: power,
      state: stateMap[stateRaw] || (stateRaw !== null ? `Unknown (${stateRaw})` : "N/A"),
    };
  }

  /**
   * Validate the current credentials by attempting to fetch the installation.
   *
   * @returns {Promise<{ success: boolean, name?: string, error?: string }>}
   */
  async function testConnection() {
    try {
      const creds = getCredentials();
      if (!creds) return { success: false, error: "No credentials configured" };

      const data = await vrmFetch(`/installations/${creds.siteId}/system-overview`);
      return { success: true, name: data.records?.name || "Connected" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    isConfigured,
    getCredentials,
    setCredentials,
    clearCredentials,
    testConnection,
    getBatteryState,
  };
})();
