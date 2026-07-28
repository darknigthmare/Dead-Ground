import {
  BASE_RADIUS_METERS,
  CAMPAIGN_SIGNAL_PARTS_REQUIRED,
  DIFFICULTIES,
  GAME_VERSION,
  MISSION_TYPES,
  POI_TYPES,
  STARTING_CLOCK_MINUTES,
  STRUCTURES,
  WEATHER_TYPES,
  ZOMBIE_TYPES
} from "./constants.js";
import { destinationPoint, distanceMeters } from "./geo.js";
import {
  chance,
  mulberry32,
  pick,
  randomBetween,
  randomInt,
  seedFromLocation,
  weightedPick
} from "./rng.js";

const POI_SUFFIXES = Object.freeze([
  "du secteur nord",
  "du vieux quartier",
  "près du carrefour",
  "derrière la voie rapide",
  "du lotissement",
  "de la zone industrielle",
  "du centre",
  "près des collines",
  "du quartier est",
  "de la périphérie"
]);

const SURVIVOR_FIRST_NAMES = Object.freeze([
  "Alex", "Nora", "Malik", "Élise", "Samir", "Lina", "Victor", "Inès", "Gabriel", "Maya",
  "Rayan", "Camille", "Naël", "Sarah", "Hugo", "Jade", "Yanis", "Lou", "Thomas", "Leïla",
  "Sofia", "Noé", "Aya", "Mathis", "Romy", "Idris", "Zoé", "Mehdi"
]);

const SURVIVOR_LAST_NAMES = Object.freeze([
  "Morel", "Benali", "Rossi", "Dubois", "Caron", "Diallo", "Garcia", "Nguyen", "Martin", "Petit",
  "Robert", "Leroy", "Mercier", "Fournier", "Lambert", "Faure", "Lopez", "Boyer", "Meyer", "Costa"
]);

/** Create a complete, deterministic campaign state. */
export function createInitialState({ start, difficultyId = "normal", seed = undefined, realPois = [] }) {
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal;
  const worldSeed = Number.isFinite(seed) ? seed >>> 0 : seedFromLocation(start);
  const random = mulberry32(worldSeed);
  const poiCount = difficultyId === "easy" ? 24 : difficultyId === "hard" ? 19 : 22;
  const pois = generateHybridPois(start, random, poiCount, realPois).map(withPoiFeatureDefaults);
  decorateWorldFeatures(pois, start, random, difficultyId);

  const roster = [
    createSurvivor(random, 0, "guard"),
    createSurvivor(random, 1, "medic"),
    createSurvivor(random, 2, "engineer")
  ];

  const missions = [];
  const vehiclePoi = pois.find((poi) => poi.vehicleWreck);
  if (vehiclePoi) {
    vehiclePoi.discovered = true;
    vehiclePoi.missionMarker = "vehicle";
    missions.push(createMission({
      type: "vehicle",
      poi: vehiclePoi,
      totalMinutes: STARTING_CLOCK_MINUTES,
      difficultyId,
      index: missions.length
    }));
  }
  const rescuePoi = pois.find((poi) => !poi.vehicleWreck && !poi.campaignSignalPart && !poi.nest.active);
  if (rescuePoi) {
    rescuePoi.discovered = true;
    rescuePoi.missionMarker = "rescue";
    missions.push(createMission({
      type: "rescue",
      poi: rescuePoi,
      totalMinutes: STARTING_CLOCK_MINUTES,
      difficultyId,
      index: missions.length
    }));
  }

  return {
    version: GAME_VERSION,
    seed: worldSeed,
    difficultyId: difficulty.id,
    status: "playing",
    paused: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalMinutes: STARTING_CLOCK_MINUTES,
    lastDailyConsumptionDay: 0,
    lastGardenProductionDay: 0,
    lastOutpostProductionDay: 0,
    score: 0,
    kills: 0,
    bossKills: 0,
    distanceTravelled: 0,
    locationsLooted: 0,
    nestsCleared: 0,
    missionsCompleted: 0,
    worldSource: pois.some((poi) => poi.realPlace) ? "hybrid-google-places" : "procedural",
    realPlaceCount: pois.filter((poi) => poi.realPlace).length,
    wave: {
      active: false,
      number: 0,
      queued: 0,
      total: 0,
      spawned: 0,
      defeated: 0,
      nextSpawnIn: 0,
      announcedDay: 0,
      bossQueued: 0,
      final: false
    },
    threat: 8,
    noise: 4,
    selectedPoiId: null,
    activity: null,
    tutorialIndex: 0,
    tutorialVisible: true,
    mapFollowsPlayer: true,
    autoFire: true,
    movementMode: "walk",
    weather: {
      type: "clear",
      remainingMinutes: randomInt(random, 240, 360),
      changes: 0
    },
    base: {
      pos: { ...start },
      radius: BASE_RADIUS_METERS,
      health: 260,
      maxHealth: 260,
      wallHealth: 0,
      wallMaxHealth: 0,
      survivors: roster.length,
      roster,
      morale: 72,
      structures: Object.fromEntries(Object.keys(STRUCTURES).map((key) => [key, 0])),
      turretCooldown: 0,
      guardCooldown: 0,
      trapCooldown: 0,
      traps: 0,
      generatorOnline: false
    },
    player: {
      pos: { ...start },
      target: null,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      armor: 0,
      infection: 0,
      bleeding: false,
      injury: "none",
      fireCooldown: 0,
      meleeCooldown: 0,
      invulnerability: 0,
      heading: 0,
      atBase: true,
      atOutpostId: null
    },
    resources: { ...difficulty.startingResources },
    inventory: { fieldKit: 1, repairKit: 0, trap: 0, antidote: 0 },
    research: { unlocked: [], completed: 0 },
    vehicle: {
      discovered: false,
      repaired: false,
      active: false,
      condition: 0,
      maxCondition: 100,
      distanceTravelled: 0,
      pos: vehiclePoi ? { ...vehiclePoi.pos } : { ...start },
      parkedAt: vehiclePoi ? "wreck" : "base"
    },
    missions: {
      active: missions,
      history: [],
      lastGeneratedDay: 1
    },
    campaign: {
      phase: "signal",
      signalParts: 0,
      requiredSignalParts: CAMPAIGN_SIGNAL_PARTS_REQUIRED,
      beaconBuilt: false,
      evacuationCalled: false,
      finalSiegeStarted: false,
      finalSiegeDefeated: false,
      victoryAt: null
    },
    pois,
    zombies: [],
    effects: [],
    logs: [
      createLog(
        STARTING_CLOCK_MINUTES,
        "system",
        "Base établie. Le réseau radio annonce une contamination généralisée."
      ),
      createLog(
        STARTING_CLOCK_MINUTES,
        "campaign",
        `Objectif : récupérer ${CAMPAIGN_SIGNAL_PARTS_REQUIRED} modules de signal et préparer une évacuation.`
      )
    ],
    notifications: [
      {
        id: `notice-${Date.now().toString(36)}`,
        type: "info",
        title: "Point de départ sécurisé",
        text: "Explorez, organisez les survivants et préparez la première vague de 20 h.",
        ttl: 8
      }
    ],
    timers: {
      ambientSpawn: randomBetween(random, 7, 11),
      nestSpawn: randomBetween(random, 20, 30),
      savePulse: 0,
      uiPulse: 0,
      secondPulse: 0,
      generatorFuelPulse: 0
    },
    randomState: (worldSeed ^ 0xa5a5a5a5) || 0x9e3779b9
  };
}

export function createSurvivor(random = Math.random, index = 0, role = "idle") {
  const first = pick(random, SURVIVOR_FIRST_NAMES) ?? "Survivant";
  const last = pick(random, SURVIVOR_LAST_NAMES) ?? String(index + 1);
  return {
    id: `survivor-${index + 1}-${Math.floor(random() * 1e9).toString(36)}`,
    name: `${first} ${last}`,
    role,
    health: 100,
    morale: randomInt(random, 64, 86),
    injured: false,
    joinedDay: 1
  };
}

export function createMission({ type, poi, totalMinutes, difficultyId = "normal", index = 0 }) {
  const definition = MISSION_TYPES[type] ?? MISSION_TYPES.supply;
  const durationScale = DIFFICULTIES[difficultyId]?.missionDuration ?? 1;
  const durationByType = { rescue: 500, supply: 420, nest: 640, intel: 520, vehicle: 1200 };
  const duration = Math.max(180, Math.round((durationByType[type] ?? 480) * durationScale));
  return {
    id: `mission-${type}-${poi.id}-${index}-${Math.floor(totalMinutes)}`,
    type,
    title: `${definition.label} — ${poi.name}`,
    description: definition.description,
    poiId: poi.id,
    status: "active",
    createdAtMinutes: totalMinutes,
    expiresAtMinutes: totalMinutes + duration,
    completedAtMinutes: null
  };
}

export function generateHybridPois(origin, random, count, realPois = []) {
  const acceptedReal = [];
  for (const candidate of realPois ?? []) {
    if (!candidate?.pos) continue;
    if (distanceMeters(origin, candidate.pos) < 65 || distanceMeters(origin, candidate.pos) > 1750) continue;
    if (acceptedReal.some((item) => item.id === candidate.id || distanceMeters(item.pos, candidate.pos) < 22)) continue;
    acceptedReal.push({ ...candidate });
    if (acceptedReal.length >= count) break;
  }

  if (acceptedReal.length >= count) return acceptedReal.slice(0, count);
  const generated = generatePois(origin, random, Math.max(count * 2, count + 10));
  const procedural = generated.filter((poi) =>
    acceptedReal.every((realPoi) => distanceMeters(realPoi.pos, poi.pos) >= 45)
  );
  const needed = count - acceptedReal.length;
  return [
    ...acceptedReal,
    ...procedural.slice(0, needed).map((poi, index) => ({
      ...poi,
      id: `poi-procedural-${index + 1}`,
      source: "procedural",
      realPlace: false
    }))
  ];
}

export function generatePois(origin, random, count) {
  const entries = Object.entries(POI_TYPES).map(([id, config]) => ({ id, ...config }));
  const pois = [];
  const angleOffset = randomBetween(random, 0, Math.PI * 2);

  for (let index = 0; index < count; index += 1) {
    const ring = index < 6 ? 0 : index < 14 ? 1 : 2;
    const minDistance = ring === 0 ? 100 : ring === 1 ? 330 : 700;
    const maxDistance = ring === 0 ? 310 : ring === 1 ? 720 : 1320;
    const angle = angleOffset + (index / count) * Math.PI * 2 + randomBetween(random, -0.28, 0.28);
    const distance = randomBetween(random, minDistance, maxDistance);
    const type = weightedPick(random, entries);
    const danger = Math.max(1, Math.min(5, type.danger + (ring === 2 && chance(random, 0.35) ? 1 : 0)));
    pois.push({
      id: `poi-${index + 1}`,
      type: type.id,
      name: `${type.label} ${pick(random, POI_SUFFIXES)}`,
      pos: destinationPoint(origin, angle, distance),
      danger,
      looted: false,
      discovered: index < 5,
      visited: false,
      currentThreat: danger + randomInt(random, 0, 2),
      lootSeed: Math.floor(random() * 0xffffffff) >>> 0,
      source: "procedural",
      realPlace: false
    });
  }
  return pois;
}

export function withPoiFeatureDefaults(poi) {
  const rawDefendersSpawned = poi.defendersSpawned;
  const defendersSpawned = rawDefendersSpawned && typeof rawDefendersSpawned === "object"
    ? {
        scavenge: Boolean(rawDefendersSpawned.scavenge),
        clearNest: Boolean(rawDefendersSpawned.clearNest)
      }
    : {
        scavenge: Boolean(rawDefendersSpawned),
        clearNest: Boolean(rawDefendersSpawned)
      };
  return {
    ...poi,
    looted: Boolean(poi.looted),
    discovered: Boolean(poi.discovered),
    visited: Boolean(poi.visited),
    outpost: Boolean(poi.outpost),
    outpostClaimedDay: poi.outpostClaimedDay ?? null,
    campaignSignalPart: Boolean(poi.campaignSignalPart),
    signalPartCollected: Boolean(poi.signalPartCollected),
    vehicleWreck: Boolean(poi.vehicleWreck),
    missionMarker: poi.missionMarker ?? null,
    defendersSpawned,
    nest: {
      active: Boolean(poi.nest?.active),
      strength: Math.max(0, Math.min(3, Math.floor(Number(poi.nest?.strength ?? 0))))
    }
  };
}

/** Adds campaign parts, vehicle and infected nests to existing POIs. Mutates the array intentionally. */
export function decorateWorldFeatures(pois, origin, random, difficultyId = "normal") {
  if (!Array.isArray(pois) || pois.length === 0) return pois;
  const candidates = pois.slice().sort((a, b) => distanceMeters(origin, b.pos) - distanceMeters(origin, a.pos));
  const signalCandidates = candidates.slice(0, Math.max(CAMPAIGN_SIGNAL_PARTS_REQUIRED + 2, 6));
  for (let index = 0; index < CAMPAIGN_SIGNAL_PARTS_REQUIRED; index += 1) {
    const selectedIndex = Math.min(signalCandidates.length - 1, index * 2);
    const poi = signalCandidates[selectedIndex];
    if (!poi) continue;
    poi.campaignSignalPart = true;
    poi.discovered = index === 0 || poi.discovered;
  }

  const vehiclePoi = pois
    .filter((poi) => ["fuel", "warehouse", "hardware"].includes(poi.type) && !poi.campaignSignalPart)
    .sort((a, b) => distanceMeters(origin, a.pos) - distanceMeters(origin, b.pos))[0]
    ?? pois.find((poi) => !poi.campaignSignalPart);
  if (vehiclePoi) {
    vehiclePoi.vehicleWreck = true;
    vehiclePoi.discovered = true;
  }

  const nestCount = difficultyId === "easy" ? 2 : difficultyId === "hard" ? 4 : 3;
  const nestCandidates = pois
    .filter((poi) => !poi.campaignSignalPart && !poi.vehicleWreck && distanceMeters(origin, poi.pos) > 250)
    .sort(() => random() - 0.5);
  nestCandidates.slice(0, nestCount).forEach((poi, index) => {
    poi.nest = { active: true, strength: 1 + (index % 3) };
    if (index === 0) poi.discovered = true;
  });
  return pois;
}

export function createZombie({ origin, random, day = 1, difficultyId = "normal", wave = false, typeId }) {
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal;
  const selectedType = typeId && ZOMBIE_TYPES[typeId] ? typeId : chooseZombieType(random, day, wave);
  const config = ZOMBIE_TYPES[selectedType] ?? ZOMBIE_TYPES.walker;
  const angle = randomBetween(random, 0, Math.PI * 2);
  const distance = randomBetween(random, wave ? 190 : 150, wave ? 360 : 460);
  const healthScale = difficulty.zombieHealth * (1 + Math.max(0, day - 1) * 0.035);
  const health = Math.round(config.health * healthScale);

  return {
    id: `z-${Date.now().toString(36)}-${Math.floor(random() * 1e9).toString(36)}`,
    type: selectedType,
    pos: destinationPoint(origin, angle, distance),
    health,
    maxHealth: health,
    attackCooldown: randomBetween(random, 0, config.attackEvery),
    screamCooldown: randomBetween(random, 6, 12),
    target: null,
    heading: angle + Math.PI,
    wave,
    defenderPoiId: null,
    stagger: 0,
    dead: false
  };
}

export function chooseZombieType(random, day, wave) {
  const entries = [
    { id: "walker", weight: Math.max(28, 82 - day * 3) },
    { id: "runner", weight: 10 + day * 2 + (wave ? 7 : 0) },
    { id: "screamer", weight: day >= 2 ? 2 + day : 0 },
    { id: "spitter", weight: day >= 2 ? 1 + day * 0.75 : 0 },
    { id: "brute", weight: day >= 3 ? 1 + day * 0.8 + (wave ? 2 : 0) : 0 },
    { id: "armored", weight: day >= 4 ? 0.5 + day * 0.55 + (wave ? 1.5 : 0) : 0 }
  ];
  return weightedPick(random, entries).id;
}

export function rollPoiLoot(poi, difficultyId = "normal", bonusMultiplier = 1) {
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal;
  const config = POI_TYPES[poi.type] ?? POI_TYPES.house;
  const random = mulberry32(((poi.lootSeed ?? seedFromLocation(poi.pos)) ^ 0x9e3779b9) >>> 0);
  const loot = {};
  const multiplier = Math.max(0.1, difficulty.loot * bonusMultiplier);

  for (const [resource, [min, max]] of Object.entries(config.loot)) {
    const scaled = Math.max(0, Math.round(randomInt(random, min, max) * multiplier));
    if (scaled > 0) loot[resource] = scaled;
  }
  if (chance(random, 0.16 + poi.danger * 0.025)) loot.ammo = (loot.ammo ?? 0) + randomInt(random, 2, 8);
  if (chance(random, 0.08 + poi.danger * 0.02)) loot.medicine = (loot.medicine ?? 0) + 1;
  if (chance(random, 0.08 + poi.danger * 0.018)) loot.intel = (loot.intel ?? 0) + 1;
  return loot;
}

export function poiById(state, poiId) {
  return state.pois.find((poi) => poi.id === poiId) ?? null;
}

export function closestPoi(state, position = state.player.pos, predicate = (_poi) => true) {
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const poi of state.pois) {
    if (!predicate(poi)) continue;
    const distance = distanceMeters(position, poi.pos);
    if (distance < selectedDistance) {
      selected = poi;
      selectedDistance = distance;
    }
  }
  return selected ? { poi: selected, distance: selectedDistance } : null;
}

export function createLog(totalMinutes, category, text) {
  return {
    id: `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    totalMinutes,
    category,
    text
  };
}

// Guard against corrupt migrations that contain obsolete weather identifiers.
export function isKnownWeather(id) {
  return Boolean(WEATHER_TYPES[id]);
}
