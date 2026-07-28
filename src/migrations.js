import {
  APP_VERSION,
  CAMPAIGN_SIGNAL_PARTS_REQUIRED,
  DIFFICULTIES,
  GAME_VERSION,
  MISSION_TYPES,
  RESEARCH_TECHS,
  RESOURCE_META,
  STRUCTURES,
  SURVIVOR_ROLES,
  WEATHER_TYPES,
  ZOMBIE_TYPES
} from "./constants.js";
import { clamp } from "./geo.js";
import { mulberry32 } from "./rng.js";
import {
  createMission,
  createSurvivor,
  decorateWorldFeatures,
  withPoiFeatureDefaults
} from "./world.js";

export function migrateState(rawState) {
  if (!rawState || typeof rawState !== "object") return null;
  if (Number(rawState.version ?? 1) > GAME_VERSION) return null;
  if (!isPosition(rawState.base?.pos) && !isPosition(rawState.player?.pos)) return null;
  if (!Array.isArray(rawState.pois)) return null;

  const state = cloneState(rawState);
  const seed = Number.isFinite(Number(state.seed)) ? Number(state.seed) >>> 0 : 0xdecafbad;
  const random = mulberry32((seed ^ 0x6c8e9cf5) >>> 0);
  const basePosition = readPosition(state.base?.pos) ?? readPosition(state.player?.pos);
  const difficultyId = DIFFICULTIES[state.difficultyId] ? state.difficultyId : "normal";

  state.version = GAME_VERSION;
  state.appVersion = APP_VERSION;
  state.seed = seed;
  state.difficultyId = difficultyId;
  state.status = ["playing", "gameover", "victory"].includes(state.status) ? state.status : "playing";
  state.paused = false;
  state.createdAt = finiteOr(state.createdAt, Date.now());
  state.updatedAt = Date.now();
  state.totalMinutes = Math.max(0, finiteOr(state.totalMinutes, 480));
  state.lastDailyConsumptionDay = Math.max(0, integerOr(state.lastDailyConsumptionDay, 0));
  state.lastGardenProductionDay = Math.max(0, integerOr(state.lastGardenProductionDay, 0));
  state.lastOutpostProductionDay = Math.max(0, integerOr(state.lastOutpostProductionDay, 0));
  state.score = Math.max(0, finiteOr(state.score, 0));
  state.kills = Math.max(0, integerOr(state.kills, 0));
  state.bossKills = Math.max(0, integerOr(state.bossKills ?? state.stats?.bossesKilled, 0));
  state.distanceTravelled = Math.max(0, finiteOr(state.distanceTravelled, 0));
  state.locationsLooted = Math.max(0, integerOr(state.locationsLooted, 0));
  state.nestsCleared = Math.max(0, integerOr(state.nestsCleared ?? state.stats?.nestsPurged, 0));
  state.missionsCompleted = Math.max(0, integerOr(state.missionsCompleted ?? state.stats?.missionsCompleted, 0));
  state.threat = clamp(finiteOr(state.threat, 8), 0, 100);
  state.noise = clamp(finiteOr(state.noise, 4), 0, 100);
  state.activity = null;
  state.tutorialIndex = Math.max(0, integerOr(state.tutorialIndex, 0));
  state.tutorialVisible = Boolean(state.tutorialVisible);
  state.mapFollowsPlayer = state.mapFollowsPlayer !== false;
  state.autoFire = state.autoFire !== false;
  state.movementMode = state.movementMode === "sprint" ? "sprint" : "walk";
  state.worldSource = state.worldSource === "hybrid-google-places" ? state.worldSource : "procedural";
  state.realPlaceCount = Math.max(0, integerOr(state.realPlaceCount, state.pois.filter((poi) => poi?.realPlace).length));

  state.resources = normalizeResources(state.resources);

  const structures = {};
  for (const [id, definition] of Object.entries(STRUCTURES)) {
    structures[id] = clamp(integerOr(state.base?.structures?.[id], 0), 0, definition.maxLevel);
  }
  const legacyCount = Math.max(1, integerOr(state.base?.survivors, 3));
  const rawRoster = Array.isArray(state.base?.roster)
    ? state.base.roster
    : Array.isArray(state.survivors)
      ? state.survivors
      : [];
  const roster = rawRoster.length
    ? rawRoster.map((survivor, index) => normalizeSurvivor(survivor, index, random))
    : Array.from({ length: legacyCount }, (_, index) => createSurvivor(random, index, ["guard", "medic", "engineer"][index] ?? "idle"));

  state.base = {
    pos: { ...basePosition },
    radius: Math.max(28, finiteOr(state.base?.radius, 34)),
    health: Math.max(0, finiteOr(state.base?.health, 260)),
    maxHealth: Math.max(1, finiteOr(state.base?.maxHealth, 260)),
    wallHealth: Math.max(0, finiteOr(state.base?.wallHealth, 0)),
    wallMaxHealth: Math.max(0, finiteOr(state.base?.wallMaxHealth, 0)),
    survivors: roster.length,
    roster,
    morale: clamp(finiteOr(state.base?.morale, 72), 0, 100),
    structures,
    turretCooldown: Math.max(0, finiteOr(state.base?.turretCooldown, 0)),
    guardCooldown: Math.max(0, finiteOr(state.base?.guardCooldown, 0)),
    trapCooldown: Math.max(0, finiteOr(state.base?.trapCooldown, 0)),
    traps: Math.max(0, integerOr(state.base?.traps ?? state.base?.trapCharges, 0)),
    generatorOnline: Boolean(state.base?.generatorOnline)
  };
  state.base.health = Math.min(state.base.maxHealth, state.base.health);
  state.base.wallHealth = Math.min(state.base.wallMaxHealth, state.base.wallHealth);

  const playerPosition = readPosition(state.player?.pos) ?? { ...basePosition };
  state.player = {
    pos: playerPosition,
    target: null,
    health: Math.max(0, finiteOr(state.player?.health, 100)),
    maxHealth: Math.max(1, finiteOr(state.player?.maxHealth, 100)),
    stamina: Math.max(0, finiteOr(state.player?.stamina, 100)),
    maxStamina: Math.max(1, finiteOr(state.player?.maxStamina, 100)),
    armor: clamp(finiteOr(state.player?.armor, 0), 0, 55),
    fireCooldown: 0,
    meleeCooldown: 0,
    invulnerability: 0,
    heading: finiteOr(state.player?.heading, 0),
    atBase: Boolean(state.player?.atBase),
    atOutpostId: state.player?.atOutpostId ?? null,
    infection: clamp(finiteOr(state.player?.infection, 0), 0, 100),
    bleeding: Boolean(state.player?.bleeding),
    injury: ["none", "sprain", "fracture"].includes(state.player?.injury) ? state.player.injury : "none"
  };
  state.player.health = Math.min(state.player.maxHealth, state.player.health);
  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina);

  state.inventory = {
    fieldKit: Math.max(0, integerOr(state.inventory?.fieldKit, 0)),
    repairKit: Math.max(0, integerOr(state.inventory?.repairKit, 0)),
    trap: Math.max(0, integerOr(state.inventory?.trap, 0)),
    antidote: Math.max(0, integerOr(state.inventory?.antidote, 0))
  };

  const legacyCompleted = Array.isArray(state.research?.completed) ? state.research.completed : [];
  const rawUnlocked = Array.isArray(state.research?.unlocked) ? state.research.unlocked : legacyCompleted;
  const unlocked = [...new Set(rawUnlocked.filter((id) => RESEARCH_TECHS[id]))];
  state.research = {
    unlocked,
    completed: unlocked.length
  };

  const vehicleCondition = finiteOr(state.vehicle?.condition ?? state.vehicle?.health, 0);
  state.vehicle = {
    discovered: Boolean(state.vehicle?.discovered),
    repaired: Boolean(state.vehicle?.repaired),
    active: Boolean(state.vehicle?.active),
    condition: clamp(vehicleCondition, 0, 100),
    maxCondition: 100,
    distanceTravelled: Math.max(0, finiteOr(state.vehicle?.distanceTravelled, 0))
  };
  if (!state.vehicle.repaired || state.vehicle.condition <= 0) state.vehicle.active = false;

  const weatherType = WEATHER_TYPES[state.weather?.type]
    ? state.weather.type
    : WEATHER_TYPES[state.weather?.id]
      ? state.weather.id
      : "clear";
  state.weather = {
    type: weatherType,
    remainingMinutes: Math.max(1, finiteOr(state.weather?.remainingMinutes, 360)),
    changes: Math.max(0, integerOr(state.weather?.changes, 0))
  };

  const hadFeatures = state.pois.some((poi) =>
    poi?.campaignSignalPart || poi?.vehicleWreck || poi?.nest?.active || poi?.outpost
  );
  state.pois = state.pois
    .map((poi) => withPoiFeatureDefaults(poi))
    .filter((poi) => isPosition(poi.pos));
  if (state.pois.length === 0) return null;
  if (!hadFeatures) decorateWorldFeatures(state.pois, state.base.pos, random, state.difficultyId);

  state.missions = normalizeMissions(state, difficultyId);
  if (!state.vehicle.discovered && !state.missions.active.some((mission) => mission.type === "vehicle")) {
    const vehiclePoi = state.pois.find((poi) => poi.vehicleWreck && !poi.looted);
    if (vehiclePoi) {
      vehiclePoi.discovered = true;
      vehiclePoi.missionMarker = "vehicle";
      state.missions.active.push(createMission({
        type: "vehicle",
        poi: vehiclePoi,
        totalMinutes: state.totalMinutes,
        difficultyId,
        index: state.missions.active.length
      }));
    }
  }

  const campaignSource = state.campaign ?? state.extraction ?? {};
  state.campaign = {
    phase: ["signal", "research", "beacon", "final", "victory"].includes(campaignSource.phase)
      ? campaignSource.phase
      : "signal",
    signalParts: Math.max(0, integerOr(campaignSource.signalParts, 0)),
    requiredSignalParts: CAMPAIGN_SIGNAL_PARTS_REQUIRED,
    beaconBuilt: Boolean(campaignSource.beaconBuilt),
    evacuationCalled: Boolean(campaignSource.evacuationCalled ?? campaignSource.active),
    finalSiegeStarted: Boolean(campaignSource.finalSiegeStarted ?? campaignSource.finalWaveStarted),
    finalSiegeDefeated: Boolean(campaignSource.finalSiegeDefeated),
    victoryAt: campaignSource.victoryAt ?? null
  };
  if (state.campaign.finalSiegeDefeated || state.status === "victory") {
    state.campaign.phase = "victory";
    state.status = "victory";
  } else if (state.campaign.finalSiegeStarted) {
    state.campaign.phase = "final";
  } else if (state.campaign.beaconBuilt) {
    state.campaign.phase = "beacon";
  } else if (state.campaign.signalParts >= CAMPAIGN_SIGNAL_PARTS_REQUIRED) {
    state.campaign.phase = "research";
  }

  state.wave = {
    active: Boolean(state.wave?.active),
    number: Math.max(0, integerOr(state.wave?.number, 0)),
    queued: Math.max(0, integerOr(state.wave?.queued, 0)),
    total: Math.max(0, integerOr(state.wave?.total, state.wave?.queued ?? 0)),
    spawned: Math.max(0, integerOr(state.wave?.spawned, 0)),
    defeated: Math.max(0, integerOr(state.wave?.defeated, 0)),
    nextSpawnIn: Math.max(0, finiteOr(state.wave?.nextSpawnIn, 0)),
    announcedDay: Math.max(0, integerOr(state.wave?.announcedDay, 0)),
    bossQueued: Math.max(0, integerOr(state.wave?.bossQueued, 0)),
    final: Boolean(state.wave?.final)
  };

  state.zombies = Array.isArray(state.zombies)
    ? state.zombies.map(normalizeZombie).filter(Boolean).slice(0, 125)
    : [];
  state.effects = [];
  state.notifications = [];
  state.logs = Array.isArray(state.logs) ? state.logs.slice(0, 140) : [];
  state.timers = {
    ambientSpawn: Math.max(0.1, finiteOr(state.timers?.ambientSpawn, 5)),
    nestSpawn: Math.max(0.1, finiteOr(state.timers?.nestSpawn, 26)),
    savePulse: 0,
    uiPulse: 0,
    secondPulse: 0,
    generatorFuelPulse: Math.max(0, finiteOr(state.timers?.generatorFuelPulse, 0))
  };
  state.randomState = (Number(state.randomState ?? seed) >>> 0) || 0x9e3779b9;
  state.selectedPoiId = state.pois.some((poi) => poi.id === state.selectedPoiId) ? state.selectedPoiId : null;
  if (!state.pois.some((poi) => poi.id === state.player.atOutpostId && poi.outpost)) state.player.atOutpostId = null;
  return state;
}

export function validateMigratedState(state) {
  return Boolean(
    state &&
    state.version === GAME_VERSION &&
    isPosition(state.base?.pos) &&
    isPosition(state.player?.pos) &&
    Array.isArray(state.pois) &&
    state.pois.length > 0 &&
    DIFFICULTIES[state.difficultyId]
  );
}

function normalizeResources(rawResources) {
  const result = {};
  for (const id of Object.keys(RESOURCE_META)) {
    result[id] = Math.max(0, finiteOr(rawResources?.[id], 0));
  }
  return result;
}

function normalizeSurvivor(raw, index, random) {
  const fallback = createSurvivor(random, index, ["guard", "medic", "engineer"][index] ?? "idle");
  return {
    id: String(raw?.id || fallback.id),
    name: String(raw?.name || fallback.name),
    role: SURVIVOR_ROLES[raw?.role] ? raw.role : fallback.role,
    health: clamp(finiteOr(raw?.health, 100), 0, 100),
    morale: clamp(finiteOr(raw?.morale, 70), 0, 100),
    injured: Boolean(raw?.injured),
    joinedDay: Math.max(1, integerOr(raw?.joinedDay, 1))
  };
}

function normalizeMissions(state, difficultyId) {
  let active = [];
  let history = [];
  let lastGeneratedDay = 0;
  if (Array.isArray(state.missions)) {
    active = state.missions.filter((mission) => mission?.status !== "completed" && mission?.status !== "expired");
    history = state.missions.filter((mission) => mission?.status === "completed" || mission?.status === "expired");
  } else if (state.missions && typeof state.missions === "object") {
    active = Array.isArray(state.missions.active) ? state.missions.active : [];
    history = Array.isArray(state.missions.history) ? state.missions.history : [];
    lastGeneratedDay = Math.max(0, integerOr(state.missions.lastGeneratedDay, 0));
  }
  const poiIds = new Set(state.pois.map((poi) => poi.id));
  const normalize = (mission, status) => {
    if (!mission || !MISSION_TYPES[mission.type] || !poiIds.has(mission.poiId)) return null;
    const poi = state.pois.find((item) => item.id === mission.poiId);
    const fallback = createMission({
      type: mission.type,
      poi,
      totalMinutes: finiteOr(mission.createdAtMinutes, state.totalMinutes),
      difficultyId,
      index: 0
    });
    return {
      ...fallback,
      ...mission,
      status
    };
  };
  return {
    active: active.map((mission) => normalize(mission, "active")).filter(Boolean),
    history: history.map((mission) => normalize(mission, mission.status === "expired" ? "expired" : "completed")).filter(Boolean).slice(0, 30),
    lastGeneratedDay
  };
}

function normalizeZombie(raw) {
  if (!raw || !ZOMBIE_TYPES[raw.type] || !isPosition(raw.pos)) return null;
  const config = ZOMBIE_TYPES[raw.type];
  const maxHealth = Math.max(1, finiteOr(raw.maxHealth, config.health));
  return {
    id: String(raw.id || `z-migrated-${Math.random().toString(36).slice(2)}`),
    type: raw.type,
    pos: readPosition(raw.pos),
    health: clamp(finiteOr(raw.health, maxHealth), 0, maxHealth),
    maxHealth,
    attackCooldown: Math.max(0, finiteOr(raw.attackCooldown, 0)),
    screamCooldown: Math.max(0, finiteOr(raw.screamCooldown, 8)),
    target: raw.target === "player" ? "player" : "base",
    heading: finiteOr(raw.heading, 0),
    wave: Boolean(raw.wave),
    stagger: Math.max(0, finiteOr(raw.stagger, 0)),
    dead: false
  };
}

function cloneState(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function readPosition(value) {
  if (!isPosition(value)) return null;
  return { lat: Number(value.lat), lng: Number(value.lng) };
}

function isPosition(value) {
  return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng));
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function integerOr(value, fallback) {
  return Math.floor(finiteOr(value, fallback));
}
