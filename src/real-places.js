import { POI_TYPES } from "./constants.js";
import { distanceMeters } from "./geo.js";
import { mulberry32, randomInt, seedFromLocation } from "./rng.js";

export const GOOGLE_PLACE_COORDINATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Uniquement des types de la Table A de Places API (New), donc utilisables
// dans includedPrimaryTypes de Place.searchNearby.
export const REAL_PLACE_SEARCH_TYPES = Object.freeze([
  "supermarket",
  "grocery_store",
  "convenience_store",
  "discount_supermarket",
  "hypermarket",
  "market",
  "general_store",
  "shopping_mall",
  "pharmacy",
  "drugstore",
  "police",
  "fire_station",
  "hospital",
  "general_hospital",
  "medical_center",
  "medical_clinic",
  "doctor",
  "gas_station",
  "hardware_store",
  "home_improvement_store",
  "building_materials_store",
  "warehouse_store",
  "storage",
  "school",
  "primary_school",
  "secondary_school",
  "university",
  "apartment_building",
  "apartment_complex",
  "housing_complex",
  "hotel",
  "lodging"
]);

const TYPE_PRIORITY = Object.freeze({
  pharmacy: "pharmacy",
  drugstore: "pharmacy",
  police: "police",
  fire_station: "police",
  hospital: "clinic",
  general_hospital: "clinic",
  medical_center: "clinic",
  medical_clinic: "clinic",
  doctor: "clinic",
  gas_station: "fuel",
  hardware_store: "hardware",
  home_improvement_store: "hardware",
  building_materials_store: "hardware",
  warehouse_store: "warehouse",
  storage: "warehouse",
  supermarket: "market",
  grocery_store: "market",
  convenience_store: "market",
  discount_supermarket: "market",
  hypermarket: "market",
  market: "market",
  general_store: "market",
  shopping_mall: "market",
  school: "school",
  primary_school: "school",
  secondary_school: "school",
  university: "school",
  apartment_building: "house",
  apartment_complex: "house",
  housing_complex: "house",
  hotel: "house",
  lodging: "house"
});
const GAME_POI_TYPE_IDS = Object.freeze(Object.keys(POI_TYPES));

export function mapGooglePlaceType(primaryType, types = []) {
  const candidates = [primaryType, ...types].filter(Boolean);
  for (const candidate of candidates) {
    if (TYPE_PRIORITY[candidate]) return TYPE_PRIORITY[candidate];
  }
  return "house";
}

export function normalizeGooglePlaces(rawPlaces, origin, { maxCount = 22 } = {}) {
  const seenIds = new Set();
  const seenPositions = [];
  const normalized = [];

  for (const raw of rawPlaces ?? []) {
    const pos = readPosition(raw.location);
    if (!pos) continue;
    const distance = distanceMeters(origin, pos);
    if (distance < 70 || distance > 1700) continue;

    const externalId = String(raw.id || raw.placeId || "").trim();
    if (!externalId) continue;
    if (seenIds.has(externalId)) continue;
    if (seenPositions.some((item) => distanceMeters(item, pos) < 22)) continue;

    const placeHash = hashString(externalId);
    const type = GAME_POI_TYPE_IDS[placeHash % GAME_POI_TYPE_IDS.length];
    const config = POI_TYPES[type] ?? POI_TYPES.house;
    const deterministicRandom = mulberry32((seedFromLocation(origin) ^ placeHash) >>> 0);
    const danger = Math.max(1, Math.min(5, config.danger + randomInt(deterministicRandom, 0, 1)));
    const fetchedAt = Date.now();

    normalized.push({
      id: `real-${safeId(externalId).slice(0, 76)}-${placeHash.toString(36)}`,
      type,
      name: `${config.label} — site réel ${normalized.length + 1}`,
      pos,
      danger,
      looted: false,
      discovered: distance <= 420,
      visited: false,
      currentThreat: danger + randomInt(deterministicRandom, 0, 2),
      lootSeed: Math.floor(deterministicRandom() * 0xffffffff) >>> 0,
      source: "google-places",
      realPlace: true,
      placeId: externalId,
      googleFetchedAt: fetchedAt,
      googleExpiresAt: fetchedAt + GOOGLE_PLACE_COORDINATE_TTL_MS,
      sortDistance: Math.round(distance),
      outpost: false,
      campaignSignalPart: false,
      signalPartCollected: false,
      vehicleWreck: false,
      missionMarker: null,
      nest: { active: false, strength: 0 }
    });
    seenIds.add(externalId);
    seenPositions.push(pos);
    if (normalized.length >= maxCount) break;
  }

  return normalized
    .sort((a, b) => a.sortDistance - b.sortDistance)
    .map(({ sortDistance: _sortDistance, ...poi }) => poi);
}

function readPosition(location) {
  if (!location) return null;
  if (typeof location.lat === "function" && typeof location.lng === "function") {
    return { lat: location.lat(), lng: location.lng() };
  }
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function safeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 96);
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
