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
}

async function refreshBattery() {
  const state = await Devices.solarBattery.getState();
  renderBattery(state);
}

// ── Init ─────────────────────────────────────────────────
updateClock();
setInterval(updateClock, 10_000);

refreshPump();
refreshBattery();

// Poll devices every 3 seconds (swap for push/WebSocket when available)
setInterval(refreshPump, 3000);
setInterval(refreshBattery, 3000);
