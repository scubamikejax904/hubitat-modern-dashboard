# Deferred: offline device indicator

**Status:** Removed from codebase (was briefly in beta 0.2.37). Revisit later.

**Git reference:** `4951b91` — "Release 0.2.37: optional offline device indicator"

## Goal

Show when Hubitat considers a device unreachable, so users can see connectivity at a glance without the dashboard inventing its own "stale" heuristics.

## Signal chosen (and why)

Use **only** Hubitat platform `device.getStatus()`:

| Value | Treatment |
|-------|-----------|
| `INACTIVE` | Offline |
| `ACTIVE`, `UNKNOWN` | Not offline |

**Explicitly not used:**

- `getLastActivity()` age thresholds (inactivity ≠ reported offline)
- `healthStatus` attribute (sparse on stock drivers; community-driver dependent)
- `devicewatch-devicestatus` (Device Watchdog app; filtered elsewhere in this project)
- `presence` attribute (occupancy, not connectivity)

`getStatus()` does **not** emit eventsocket events — offline state updates only via `/data` polling and `/device` reconcile.

## Implementation summary (0.2.37)

### Companion app (`app/ModernLightsDashboard.groovy.template`)

- **Preference** (Options section, default off): `showOfflineDevices` — "Show inactive devices as offline (grayed out)"
- **Config JSON:** `"showOfflineDevices": true|false`
- **Helpers:**
  ```groovy
  def isDeviceInactive(d) {
      try { return d.getStatus()?.toString()?.equalsIgnoreCase("INACTIVE") } catch (e) { return false }
  }
  def appendOfflineJson(out, d) {
      if (showOfflineDevices == true && isDeviceInactive(d)) out << ",\"off\":1"
  }
  ```
- **`appendOfflineJson(out, d)`** called for every device type in `renderData()` and `renderDevice()` (lights, outlets, thermostats, temp sensors, sensors, locks, shades, valves, music). Omit `off` when online to keep payloads small.

### Frontend (`src/app.js`)

- `cfg.showOfflineDevices` from `/data` config
- `deviceIsOffline(dev)` → `cfg.showOfflineDevices && dev.off`
- `applyOfflineUi(el, dev)` → toggles `.offline` class
- `mergeOfflineField(dev, payload)` in `refreshDevice()` branches
- Status labels: **"Offline"** on tiles, locks, shades, music, thermostats; sensor cards kept readings and used an **"Offline"** pill
- Applied in: `syncTileState`, `applySensorCardState`, lock/shade/music/tstat favorites, `updateClimateWidgets`

### CSS (`src/styles.css`)

```css
.tile.offline,
.sensor-card.offline,
.quick-lock-row.offline,
.shade-tile.offline,
.music-row.offline,
.quick-fav-card.offline,
.room-climate.offline {
  opacity: 0.45;
  filter: grayscale(0.85);
}
```

### Preview mock (`preview/server.mjs`)

- `showOfflineDevices: true` in config; sample devices with `"off": 1`

## UX refinement (post-0.2.37)

Initial build disabled controls (`pointer-events: none`, `aria-disabled`, button `disabled`). That was **reverted** before this feature was shelved: offline is informational only because `INACTIVE` can be wrong for quiet battery devices and repeaters. Controls must stay usable.

## Why it didn't work well

- Hubitat `INACTIVE` is **not reliably "offline"** — quiet but healthy devices (battery sensors on long check-in intervals, some Zigbee repeaters) can show INACTIVE while still fine.
- No real-time updates for status changes (poll-only).
- Users on beta reported the indicator was misleading more often than helpful.

## If revisiting

1. Re-evaluate whether `getStatus()` alone is acceptable, or document false positives clearly in the UI.
2. Consider optional `healthStatus` support **in addition** when drivers implement it — still no last-activity heuristics.
3. Keep visual-only indication; never block commands based on connectivity guess.
4. Full patch: `git show 4951b91` or diff `47ca95b..4951b91`.
