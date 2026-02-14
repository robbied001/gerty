/**
 * SolarEdge Monitoring API Client for Gerty Home Automation.
 *
 * Reads live solar production data from a SolarEdge inverter via the
 * SolarEdge Monitoring Server API.
 *
 * ── Setup ────────────────────────────────────────────────────────────
 *  1. Log in to https://monitoring.solaredge.com
 *  2. Go to Admin (cog icon) → Site Access → enable API Access
 *  3. Copy the API Key that appears
 *  4. Your Site ID is in the URL: monitoring.solaredge.com/solaredge-web/p/site/{siteId}/…
 *  5. Enter both in the Gerty dashboard settings panel
 *
 * ── Rate limits ─────────────────────────────────────────────────────
 *  SolarEdge allows 300 API requests per day.
 *  At one request every 5 minutes → 288/day, safely under the limit.
 *  Data updates on the SolarEdge side every ~15 minutes anyway.
 *
 * ── Proxy ───────────────────────────────────────────────────────────
 *  SolarEdge recommends NOT calling the API from browser JavaScript.
 *  Gerty's server.js proxies /api/solaredge/* to avoid CORS issues
 *  and to keep the API key out of browser network logs.
 */

const SolarEdge = (() => {
  // Local proxy path (served by server.js) — avoids CORS.
  const SE_BASE = "/api/solaredge";

  // ── Persistent config (localStorage) ─────────────────────────────
  const STORAGE_KEY = "gerty_solaredge_config";

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

  function getCredentials() {
    const cfg = loadConfig();
    if (cfg.apiKey && cfg.siteId) return cfg;
    return null;
  }

  function setCredentials(apiKey, siteId) {
    saveConfig({ apiKey: apiKey.trim(), siteId: siteId.trim() });
  }

  function clearCredentials() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isConfigured() {
    return getCredentials() !== null;
  }

  // ── API helpers ──────────────────────────────────────────────────

  async function seFetch(path) {
    const creds = getCredentials();
    if (!creds) throw new Error("SolarEdge not configured");

    const sep = path.includes("?") ? "&" : "?";
    const url = `${SE_BASE}${path}${sep}api_key=${creds.apiKey}`;

    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SolarEdge API ${res.status}: ${body}`);
    }

    return res.json();
  }

  // ── Solar production data ────────────────────────────────────────

  /**
   * Fetch current solar production overview.
   *
   * @returns {Promise<{
   *   currentPower: number,
   *   energyToday: number,
   *   energyMonth: number,
   *   energyYear: number,
   *   energyLifetime: number
   * }>}
   */
  async function getProduction() {
    const creds = getCredentials();
    if (!creds) throw new Error("SolarEdge not configured");

    const data = await seFetch(`/site/${creds.siteId}/overview.json`);
    const overview = data.overview || {};

    return {
      currentPower: (overview.currentPower || {}).power || 0,       // Watts
      energyToday: (overview.lastDayData || {}).energy || 0,        // Wh
      energyMonth: (overview.lastMonthData || {}).energy || 0,      // Wh
      energyYear: (overview.lastYearData || {}).energy || 0,        // Wh
      energyLifetime: (overview.lifeTimeData || {}).energy || 0,    // Wh
    };
  }

  /**
   * Validate credentials by fetching the site overview.
   *
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async function testConnection() {
    try {
      const creds = getCredentials();
      if (!creds) return { success: false, error: "No credentials configured" };

      await seFetch(`/site/${creds.siteId}/overview.json`);
      return { success: true };
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
    getProduction,
  };
})();
