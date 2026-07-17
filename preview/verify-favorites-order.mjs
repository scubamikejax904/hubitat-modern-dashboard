#!/usr/bin/env node
// Smoke test: favorites order round-trip via preview server.
// Run: node preview/verify-favorites-order.mjs

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = String(18000 + Math.floor(Math.random() * 2000));
const MOCK_DASH_PASSWORD = "dashpass";
let dashSessionQuery = "";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function wait(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function getJson(path) {
  const sep = path.includes("?") ? "&" : "?";
  const url = dashSessionQuery
    ? `http://127.0.0.1:${PORT}${path}${sep}${dashSessionQuery}`
    : `http://127.0.0.1:${PORT}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function waitForServer(child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode != null) throw new Error("preview server exited early");
    try {
      await getJson("/auth/status");
      return;
    } catch {
      await wait(100);
    }
  }
  throw new Error("preview server did not become ready");
}

async function unlockPreview() {
  const res = await fetch(`http://127.0.0.1:${PORT}/auth/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ password: MOCK_DASH_PASSWORD }),
  });
  if (!res.ok) throw new Error("auth unlock failed: HTTP " + res.status);
  const data = await res.json();
  if (!data.session) throw new Error("auth unlock missing session");
  dashSessionQuery = "dash_session=" + encodeURIComponent(data.session);
}

const child = spawn("node", ["preview/server.mjs"], {
  cwd: root,
  env: { ...process.env, PORT },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(child);
  await unlockPreview();

  const data = await getJson("/data");
  const initial = Array.isArray(data.config?.favorites) ? data.config.favorites.map(Number) : [];
  assert(initial.length >= 2, "mock has at least two favorites");

  const reversed = initial.slice().reverse();
  const postRes = await fetch(`http://127.0.0.1:${PORT}/favorites?${dashSessionQuery}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: reversed }),
  });
  assert(postRes.ok, "POST /favorites ok");

  const after = await getJson("/data");
  const saved = (after.config?.favorites || []).map(Number);
  assert(saved.join(",") === reversed.join(","), "favorites order persisted");

  console.log("verify-favorites-order: ok");
} finally {
  child.kill("SIGTERM");
}
