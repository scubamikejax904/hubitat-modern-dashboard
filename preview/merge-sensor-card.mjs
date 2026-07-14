// Mirror of merge helpers in src/app-pre.js for preview verification.

const SENSOR_TEMP_PROMOTE_TYPES = new Set(["humidity", "illuminance"]);

function mergeSensorExEntries(parts, excludeKeys) {
  const exclude = new Set((excludeKeys || []).map((k) => String(k).toLowerCase()));
  const out = [];
  const seen = new Set();
  for (const list of parts) {
    for (const e of list || []) {
      const k = String(e.k || "").toLowerCase();
      if (!k || exclude.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ k: e.k, v: e.v, u: e.u ?? null });
    }
  }
  return out;
}

function resolveMergedSensorBattery(tempRec, sensorRec, ex) {
  const batEx = (ex || []).find((e) => e.k === "battery");
  const bat = tempRec?.bat ?? sensorRec?.bat ?? (batEx ? batEx.v : null);
  return bat != null && bat !== "" ? bat : null;
}

function environmentalTempPrimaryCard(tempRec, sensorRec) {
  const exParts = [];
  if (sensorRec.v != null && sensorRec.v !== "") {
    exParts.push([{ k: sensorRec.t, v: sensorRec.v, u: sensorRec.u ?? null }]);
  }
  exParts.push(sensorRec.ex || [], tempRec.ex || []);
  const ex = mergeSensorExEntries(exParts, ["temperature"]);
  return {
    i: tempRec.i,
    t: "temp",
    v: tempRec.temp,
    ex,
    bat: resolveMergedSensorBattery(tempRec, sensorRec, ex),
  };
}

function sensorPrimaryCard(sensorRec, tempRec) {
  const exclude = sensorRec.t === "humidity" ? ["humidity"]
    : sensorRec.t === "illuminance" ? ["illuminance"] : [];
  const exParts = [sensorRec.ex || []];
  if (tempRec) {
    exParts.push([{ k: "temperature", v: tempRec.temp, u: tempRec.u ?? null }]);
    exParts.push(tempRec.ex || []);
  }
  const ex = mergeSensorExEntries(exParts, exclude);
  return {
    i: sensorRec.i,
    t: sensorRec.t,
    v: sensorRec.v,
    ex,
    bat: resolveMergedSensorBattery(tempRec, sensorRec, ex),
  };
}

// Mirror of sensorCardFilterTypes in src/app-pre.js for preview verification.
const SENSOR_FILTER_TYPE_KEYS = new Set([
  "temp", "motion", "shock", "contact", "leak", "smoke", "humidity", "illuminance", "presence", "valve", "generic",
]);
const SENSOR_EX_KEY_TO_FILTER_TYPE = {
  temperature: "temp",
  humidity: "humidity",
  illuminance: "illuminance",
  motion: "motion",
  contact: "contact",
  water: "leak",
  smoke: "smoke",
  presence: "presence",
  acceleration: "shock",
  shock: "shock",
  vibration: "shock",
};

function sensorCardFilterTypes(dev) {
  const types = new Set();
  const add = (t) => {
    if (t && SENSOR_FILTER_TYPE_KEYS.has(t)) types.add(t);
  };
  add(dev.t);
  add(dev._senRef?.t);
  if (dev._tempRef) add("temp");
  for (const e of dev.ex || []) {
    const k = String(e.k || "").toLowerCase();
    add(SENSOR_EX_KEY_TO_FILTER_TYPE[k] || (SENSOR_FILTER_TYPE_KEYS.has(k) ? k : null));
  }
  return types;
}

export function buildMergedSensorCard(tempRec, sensorRec) {
  if (tempRec && sensorRec && SENSOR_TEMP_PROMOTE_TYPES.has(sensorRec.t)) {
    return environmentalTempPrimaryCard(tempRec, sensorRec);
  }
  if (sensorRec) return sensorPrimaryCard(sensorRec, tempRec);
  if (tempRec) {
    return { i: tempRec.i, t: "temp", v: tempRec.temp, ex: tempRec.ex || [], bat: tempRec.bat ?? null };
  }
  return null;
}

export { sensorCardFilterTypes };
