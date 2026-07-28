export function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seedFromLocation(location, salt = "dead-ground") {
  return hashString(`${location.lat.toFixed(6)}:${location.lng.toFixed(6)}:${salt}`);
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBetween(random, min, max) {
  return min + (max - min) * random();
}

export function randomInt(random, min, maxInclusive) {
  return Math.floor(randomBetween(random, min, maxInclusive + 1));
}

export function pick(random, values) {
  if (!values.length) return undefined;
  return values[Math.floor(random() * values.length)];
}

export function weightedPick(random, entries, getWeight = (entry) => entry.weight ?? 1) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, getWeight(entry)), 0);
  if (total <= 0) return entries[0];
  let cursor = random() * total;
  for (const entry of entries) {
    cursor -= Math.max(0, getWeight(entry));
    if (cursor <= 0) return entry;
  }
  return entries.at(-1);
}

export function chance(random, probability) {
  return random() < probability;
}

export function stableNoise(x, y, seed = 0) {
  let value = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 69069);
  value = (value ^ (value >>> 13)) >>> 0;
  value = Math.imul(value, 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
