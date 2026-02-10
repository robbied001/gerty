/**
 * Gerty – Home Automation Dashboard
 * Wires up UI widgets to the Devices API layer.
 */

// ── Helpers ──────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function updateClock() {
  const now = new Date();
  $("clock").textContent = now.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }) + "  ·  " + now.toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Pool Pump ────────────────────────────────────────────
const pumpToggle = $("pump-toggle");
const pumpBadge  = $("pump-badge");

function renderPump(state) {
  pumpToggle.checked = state.on;
  pumpBadge.textContent = state.on ? "ON" : "OFF";
  pumpBadge.className   = "status-badge " + (state.on ? "status-on" : "status-off");
}

pumpToggle.addEventListener("change", async () => {
  const state = await Devices.poolPump.setState(pumpToggle.checked);
  renderPump(state);
});

async function refreshPump() {
  const state = await Devices.poolPump.getState();
  renderPump(state);
}

// ── Solar Battery ────────────────────────────────────────
function batteryColor(pct) {
  if (pct >= 60) return "var(--green)";
  if (pct >= 25) return "var(--amber)";
  return "var(--red)";
}

function batteryLabel(pct) {
  if (pct >= 80) return "Excellent";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Fair";
  if (pct >= 20) return "Low";
  return "Critical";
}

function renderBattery(state) {
  const pct = Math.round(state.percent);
  $("battery-pct").textContent       = pct + "%";
  $("battery-pct-small").textContent = pct + "%";
  $("battery-status").textContent    = batteryLabel(pct);
  const bar = $("battery-bar");
  bar.style.width      = pct + "%";
  bar.style.background = batteryColor(pct);

  // Extra Victron details
  const statsEl = $("battery-stats");
  if (state.source === "victron") {
    statsEl.style.display = "";
    $("battery-voltage").textContent =
      state.voltage !== null ? state.voltage.toFixed(1) + " V" : "--";
    $("battery-power").textContent =
      state.power !== null ? state.power.toFixed(0) + " W" : "--";
    $("battery-current").textContent =
      state.current !== null ? state.current.toFixed(1) + " A" : "--";
    $("battery-charge-state").textContent = state.state || "--";
  } else {
    statsEl.style.display = "none";
  }

  // Source badge
  const badge = $("battery-source");
  badge.style.display = "";
  if (state.source === "victron") {
    badge.textContent = "VRM Live";
    badge.className = "battery-source source-victron";
  } else {
    badge.textContent = "Mock";
    badge.className = "battery-source source-mock";
  }
}

async function refreshBattery() {
  try {
    const state = await Devices.solarBattery.getState();
    renderBattery(state);
  } catch (err) {
    console.error("Battery refresh error:", err);
  }
}

// ── Victron Settings Modal ───────────────────────────────
const overlay    = $("settings-overlay");
const tokenInput = $("vrm-token");
const siteInput  = $("vrm-site");
const statusEl   = $("settings-status");
const clearBtn   = $("settings-clear");

function openSettings() {
  const creds = typeof Victron !== "undefined" && Victron.getCredentials();
  if (creds) {
    tokenInput.value = creds.accessToken;
    siteInput.value  = creds.siteId;
    clearBtn.style.display = "";
  } else {
    tokenInput.value = "";
    siteInput.value  = "";
    clearBtn.style.display = "none";
  }
  statusEl.textContent = "";
  statusEl.className = "modal-status";
  overlay.classList.add("open");
}

function closeSettings() {
  overlay.classList.remove("open");
}

$("open-settings").addEventListener("click", openSettings);
$("settings-cancel").addEventListener("click", closeSettings);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeSettings();
});

$("settings-save").addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const site  = siteInput.value.trim();

  if (!token || !site) {
    statusEl.textContent = "Both fields are required.";
    statusEl.className = "modal-status err";
    return;
  }

  statusEl.textContent = "Testing connection...";
  statusEl.className = "modal-status";

  Victron.setCredentials(token, site);
  const result = await Victron.testConnection();

  if (result.success) {
    statusEl.textContent = "Connected! " + (result.name || "");
    statusEl.className = "modal-status ok";
    setTimeout(() => {
      closeSettings();
      refreshBattery();
    }, 1200);
  } else {
    statusEl.textContent = "Failed: " + result.error;
    statusEl.className = "modal-status err";
  }
});

$("settings-clear").addEventListener("click", () => {
  Victron.clearCredentials();
  tokenInput.value = "";
  siteInput.value  = "";
  clearBtn.style.display = "none";
  statusEl.textContent = "Disconnected. Using mock data.";
  statusEl.className = "modal-status";
  refreshBattery();
});

// ── Init ─────────────────────────────────────────────────
updateClock();
setInterval(updateClock, 10_000);

refreshPump();
refreshBattery();

// Poll devices every 3 seconds (swap for push/WebSocket when available)
setInterval(refreshPump, 3000);
setInterval(refreshBattery, 3000);
