#!/usr/bin/env node
// Smoke test: time cards + mixed favorites layout via preview server.
// Run: node preview/verify-time-cards.mjs

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

async function postJson(path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const url = dashSessionQuery
    ? `http://127.0.0.1:${PORT}${path}${sep}${dashSessionQuery}`
    : `http://127.0.0.1:${PORT}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function waitForServer(child) {
  for (let i = 0; i < 300; i++) {
    if (child.exitCode != null) throw new Error("preview server exited early");
    try {
      await getJson("/auth/status");
      return;
    } catch {
      await wait(200);
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
  const favorites = (data.config?.favorites || []).map(Number);
  assert(favorites.length >= 2, "mock has device favorites");
  assert(Array.isArray(data.config?.timeCards), "timeCards in config");

  // Reject invalid style by coercing to default on create
  const created = await postJson("/time-cards", {
    action: "create",
    style: "time_seconds",
    size: "square",
  });
  assert(created.res.ok, "create time ok");
  assert(created.json.id?.startsWith("t_"), "id generated");
  assert(created.json.timeCards?.length === 1, "one time card");
  assert(created.json.timeCards[0].style === "time_seconds", "style saved");
  assert(created.json.favoritesLayout.some((k) => k.startsWith("t:")), "layout includes time");

  const timeId = created.json.id;

  // Update style
  const updated = await postJson("/time-cards", {
    action: "update",
    id: timeId,
    style: "time_date",
    size: "wide",
  });
  assert(updated.res.ok, "update ok");
  assert(updated.json.timeCards[0].style === "time_date", "style updated");
  assert(updated.json.timeCards[0].size === "wide", "size updated");

  // Mixed layout with devices + time
  const layout = [
    "t:" + timeId.slice(2),
    ...favorites.map((id) => "d:" + id),
  ];
  const layoutSave = await postJson("/settings/favorites-layout", {
    layout,
    favoriteSizes: { [favorites[0]]: "wide" },
    timeSizes: { [timeId]: "compact" },
  });
  assert(layoutSave.res.ok, "layout save ok");
  assert(layoutSave.json.favoritesLayout[0] === "t:" + timeId.slice(2), "time first");
  assert(String(layoutSave.json.sizes[favorites[0]]) === "wide", "device size saved");
  assert(layoutSave.json.timeCards[0].size === "compact", "time size saved");

  // Invalid time size ignored
  const badTimeSize = await postJson("/settings/favorites-layout", {
    layout,
    timeSizes: { [timeId]: "viewport" },
  });
  assert(badTimeSize.res.ok, "bad time size request ok");
  assert(badTimeSize.json.timeCards[0].size === "compact", "invalid time size ignored");

  // Tall / large round-trip (dashboard-friendly, not fill-screen)
  const tallSave = await postJson("/settings/favorites-layout", {
    layout,
    timeSizes: { [timeId]: "tall" },
  });
  assert(tallSave.res.ok, "tall layout save ok");
  assert(tallSave.json.timeCards[0].size === "tall", "time tall saved");

  const largeSave = await postJson("/settings/favorites-layout", {
    layout,
    timeSizes: { [timeId]: "large" },
  });
  assert(largeSave.res.ok, "large layout save ok");
  assert(largeSave.json.timeCards[0].size === "large", "time large saved");

  // Legacy POST /favorites preserves time cards
  const reversed = favorites.slice().reverse();
  const legacy = await postJson("/favorites", { ids: reversed, sizes: {} });
  assert(legacy.res.ok, "legacy favorites ok");
  assert(legacy.json.timeCards?.length === 1, "legacy preserves time cards");
  assert(legacy.json.favoritesLayout.some((k) => k.startsWith("t:")), "legacy preserves time layout slot");

  // Coexist with embeds
  const embed = await postJson("/embed-cards", {
    action: "create",
    title: "Agenda",
    url: "https://calendar.google.com/calendar/embed?src=example",
  });
  assert(embed.res.ok, "embed create ok");
  assert(embed.json.timeCards?.length === 1, "embed response keeps time cards");
  assert(embed.json.favoritesLayout.some((k) => k.startsWith("t:")), "time still in layout");
  assert(embed.json.favoritesLayout.some((k) => k.startsWith("e:")), "embed in layout");

  // Delete time
  const deleted = await postJson("/time-cards", { action: "delete", id: timeId });
  assert(deleted.res.ok, "delete ok");
  assert((deleted.json.timeCards || []).length === 0, "no time cards left");
  assert(!(deleted.json.favoritesLayout || []).some((k) => k.startsWith("t:")), "time removed from layout");
  assert((deleted.json.favoritesLayout || []).some((k) => k.startsWith("e:")), "embed still in layout");

  // Card limit
  for (let i = 0; i < 12; i++) {
    const r = await postJson("/time-cards", { action: "create", style: "time" });
    assert(r.res.ok, "create card " + i);
  }
  const over = await postJson("/time-cards", { action: "create", style: "time" });
  assert(!over.res.ok, "limit enforced");

  console.log("verify-time-cards: ok");
} finally {
  child.kill("SIGTERM");
}
