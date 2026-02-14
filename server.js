#!/usr/bin/env node
/**
 * Gerty – lightweight server with VRM proxy & password protection.
 *
 * Serves the static dashboard AND proxies requests to the Victron VRM API
 * so the browser never hits a CORS wall.
 *
 *   node server.js            → http://localhost:3000
 *   PORT=8080 node server.js  → http://localhost:8080
 *
 * Environment variables:
 *   PORT            – listen port (default 3000)
 *   GERTY_PASSWORD  – if set, requires this password to access the dashboard
 *                     (uses HTTP Basic Auth, username is ignored)
 *
 * Routes:
 *   /api/vrm/*  →  https://vrmapi.victronenergy.com/v2/*  (proxied)
 *   /*          →  static files from this directory
 */

const http   = require("http");
const https  = require("https");
const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

const PORT     = parseInt(process.env.PORT, 10) || 3000;
const PASSWORD = process.env.GERTY_PASSWORD || "";
const VRM_HOST = "vrmapi.victronenergy.com";
const VRM_BASE = "/v2";
const SE_HOST  = "monitoringapi.solaredge.com";
const SE_BASE  = "";

// ── MIME types for static serving ──────────────────────────
const MIME = {
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

// ── Password protection (HTTP Basic Auth) ──────────────────
function checkAuth(req, res) {
  if (!PASSWORD) return true; // no password set → open access

  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    // Accept any username, just check the password
    const pass = decoded.includes(":") ? decoded.split(":").slice(1).join(":") : decoded;
    // Constant-time comparison to prevent timing attacks
    if (pass.length === PASSWORD.length &&
        crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(PASSWORD))) {
      return true;
    }
  }

  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Gerty"',
    "Content-Type": "text/plain",
  });
  res.end("Unauthorized – set password via GERTY_PASSWORD env variable");
  return false;
}

// ── Static file handler ────────────────────────────────────
function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0]; // strip query string
  let filePath = path.join(__dirname, urlPath === "/" ? "index.html" : urlPath);
  const ext = path.extname(filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ── VRM API proxy handler ──────────────────────────────────
function proxyVRM(req, res) {
  // Strip the /api/vrm prefix → forward the rest to VRM
  const vrmPath = VRM_BASE + req.url.replace(/^\/api\/vrm/, "");

  // Forward relevant headers (auth token, content-type)
  const proxyHeaders = {
    "Host": VRM_HOST,
    "Accept": "application/json",
  };
  if (req.headers["x-authorization"]) {
    proxyHeaders["X-Authorization"] = req.headers["x-authorization"];
  }
  if (req.headers["content-type"]) {
    proxyHeaders["Content-Type"] = req.headers["content-type"];
  }

  const options = {
    hostname: VRM_HOST,
    port: 443,
    path: vrmPath,
    method: req.method,
    headers: proxyHeaders,
  };

  const proxyReq = https.request(options, (proxyRes) => {
    // Pass through status and response headers (minus CORS blockers)
    const responseHeaders = {
      "Content-Type": proxyRes.headers["content-type"] || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("VRM proxy error:", err.message);
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: "VRM API unreachable: " + err.message }));
  });

  // Forward request body (for POST)
  req.pipe(proxyReq);
}

// ── SolarEdge API proxy handler ─────────────────────────────
function proxySolarEdge(req, res) {
  // Strip the /api/solaredge prefix → forward the rest
  const sePath = SE_BASE + req.url.replace(/^\/api\/solaredge/, "");

  const options = {
    hostname: SE_HOST,
    port: 443,
    path: sePath,
    method: "GET",
    headers: {
      "Host": SE_HOST,
      "Accept": "application/json",
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const responseHeaders = {
      "Content-Type": proxyRes.headers["content-type"] || "application/json",
      "Access-Control-Allow-Origin": "*",
    };
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("SolarEdge proxy error:", err.message);
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ error: "SolarEdge API unreachable: " + err.message }));
  });

  proxyReq.end();
}

// ── Server ─────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Handle CORS preflight (no auth needed for OPTIONS)
  if (req.method === "OPTIONS" && req.url.startsWith("/api/vrm")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "X-Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // Password gate — everything except CORS preflight is protected
  if (!checkAuth(req, res)) return;

  if (req.url.startsWith("/api/vrm")) {
    proxyVRM(req, res);
  } else if (req.url.startsWith("/api/solaredge")) {
    proxySolarEdge(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Gerty is running at  http://localhost:${PORT}`);
  console.log("  VRM API proxy at     /api/vrm/*");
  console.log("  SolarEdge proxy at   /api/solaredge/*");
  if (PASSWORD) {
    console.log("  Password protection  ENABLED");
  } else {
    console.log("  Password protection  OFF (set GERTY_PASSWORD to enable)");
  }
  console.log();
});
