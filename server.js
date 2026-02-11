#!/usr/bin/env node
/**
 * Gerty – lightweight dev server.
 *
 * Serves the static dashboard AND proxies requests to the Victron VRM API
 * so the browser never hits a CORS wall.
 *
 *   node server.js            → http://localhost:3000
 *   PORT=8080 node server.js  → http://localhost:8080
 *
 * Routes:
 *   /api/vrm/*  →  https://vrmapi.victronenergy.com/v2/*  (proxied)
 *   /*          →  static files from this directory
 */

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const PORT     = parseInt(process.env.PORT, 10) || 3000;
const VRM_HOST = "vrmapi.victronenergy.com";
const VRM_BASE = "/v2";

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

// ── Static file handler ────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
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

// ── Server ─────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Handle CORS preflight
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

  if (req.url.startsWith("/api/vrm")) {
    proxyVRM(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Gerty is running at  http://localhost:${PORT}\n`);
  console.log("  VRM API proxy at     /api/vrm/*\n");
});
