import {
  APP_VERSION,
  CAMPAIGN_SIGNAL_PARTS_REQUIRED,
  DIFFICULTIES,
  GAME_VERSION,
  MISSION_TYPES,
  POI_TYPES,
  RESEARCH_TECHS,
  RESOURCE_META,
  STRUCTURES,
  SURVIVOR_ROLES,
  TUTORIAL_STEPS,
  WEATHER_TYPES,
  ZOMBIE_TYPES
} from "./constants.js";
import { clamp, destinationPoint } from "./geo.js";
import { mulberry32 } from "./rng.js";
import {
  createMission,
  createSurvivor,
  decorateWorldFeatures,
  withPoiFeatureDefaults
} from "./world.js";

const MAX_ROSTER_ENTRIES = 50;
const MAX_POI_ENTRIES = 100;
const MAX_ACTIVE_MISSIONS = 5;
const MAX_HISTORY_MISSIONS = 30;
const MAX_ZOMBIES = 125;
const MAX_LOG_ENTRIES = 140;
const MAX_ID_LENGTH = 96;
const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 600;
const MAX_GAME_MINUTES = 100_000_000;
const MAX_RESOURCE_AMOUNT = 1_000_000_000;
const MAX_COUNTER_VALUE = 1_000_000_000;
const MAX_HEALTH_VALUE = 1_000_000;
const MAX_DISTANCE_VALUE = 1_000_000_000_000;
const MAX_MISSION_MINUTES = 110_000_000;
const MAX_WAVE_NUMBER = Math.ceil(MAX_GAME_MINUTES / (24 * 60)) + 1;
const MAX_WAVE_COUNT = 500;
const MAX_COOLDOWN_SECONDS = 120;
const MAX_SPAWN_TIMER_SECONDS = 300;
const MAX_GENERATOR_FUEL_PULSE_MINUTES = 180;
const GOOGLE_COORDINATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GOOGLE_CONTENT_FIELDS = Object.freeze([
  "address",
  "formattedAddress",
  "shortFormattedAddress",
  "vicinity",
  "displayName",
  "externalId",
  "googleMapsURI",
  "googleMapsUri",
  "googlePrimaryType",
  "primaryType",
  "googleTypes",
  "types",
  "distanceFromBase"
]);
const GOOGLE_DESCRIPTION_FIELDS = Object.freeze([
  "name",
  "address",
  "formattedAddress",
  "shortFormattedAddress",
  "vicinity",
  "displayName",
  "googleMapsURI",
  "googleMapsUri"
]);
const KNOWN_STATE_FIELDS = new Set([
  "activity",
  "appVersion",
  "autoFire",
  "base",
  "bossKills",
  "campaign",
  "createdAt",
  "difficultyId",
  "distanceTravelled",
  "effects",
  "inventory",
  "kills",
  "lastDailyConsumptionDay",
  "lastGardenProductionDay",
  "lastOutpostProductionDay",
  "locationsLooted",
  "logs",
  "mapFollowsPlayer",
  "missions",
  "missionsCompleted",
  "movementMode",
  "nestsCleared",
  "noise",
  "notifications",
  "paused",
  "player",
  "pois",
  "randomState",
  "realPlaceCount",
  "research",
  "resources",
  "score",
  "seed",
  "selectedPoiId",
  "status",
  "threat",
  "timers",
  "totalMinutes",
  "tutorialIndex",
  "tutorialVisible",
  "updatedAt",
  "vehicle",
  "version",
  "wave",
  "weather",
  "worldSource",
  "zombies"
]);
const LOG_CATEGORIES = new Set([
  "system",
  "campaign",
  "craft",
  "movement",
  "base",
  "loot",
  "vehicle",
  "mission",
  "nest",
  "radio",
  "research",
  "survivor",
  "outpost",
  "weather",
  "wave",
  "gameover"
]);

export function migrateState(rawState) {
  if (!rawState || typeof rawState !== "object") return null;
  if (Number(rawState.version ?? 1) > GAME_VERSION) return null;
  if (!isPosition(rawState.base?.pos) && !isPosition(rawState.player?.pos)) return null;
  if (!Array.isArray(rawState.pois)) return null;

  const state = cloneState(rawState);
  const now = Date.now();
  const seed = Number.isFinite(Number(state.seed)) ? Number(state.seed) >>> 0 : 0xdecafbad;
  const random = mulberry32((seed ^ 0x6c8e9cf5) >>> 0);
  const basePosition = readPosition(state.base?.pos) ?? readPosition(state.player?.pos);
  const difficultyId = DIFFICULTIES[state.difficultyId] ? state.difficultyId : "normal";
  const sourceCreatedAt = clamp(finiteOr(state.createdAt, 0), 0, now);
  const googleDescriptions = collectGoogleDescriptions(state.pois);

  state.version = GAME_VERSION;
  state.appVersion = APP_VERSION;
  state.seed = seed;
  state.difficultyId = difficultyId;
  state.status = ["playing", "gameover", "victory"].includes(state.status) ? state.status : "playing";
  state.paused = false;
  state.createdAt = clamp(finiteOr(state.createdAt, now), 0, now);
  state.updatedAt = now;
  state.totalMinutes = clamp(finiteOr(state.totalMinutes, 480), 0, MAX_GAME_MINUTES);
  state.lastDailyConsumptionDay = clamp(integerOr(state.lastDailyConsumptionDay, 0), 0, MAX_COUNTER_VALUE);
  state.lastGardenProductionDay = clamp(integerOr(state.lastGardenProductionDay, 0), 0, MAX_COUNTER_VALUE);
  state.lastOutpostProductionDay = clamp(integerOr(state.lastOutpostProductionDay, 0), 0, MAX_COUNTER_VALUE);
  state.score = clamp(finiteOr(state.score, 0), 0, MAX_COUNTER_VALUE);
  state.kills = clamp(integerOr(state.kills, 0), 0, MAX_COUNTER_VALUE);
  state.bossKills = clamp(integerOr(state.bossKills ?? state.stats?.bossesKilled, 0), 0, MAX_COUNTER_VALUE);
  state.distanceTravelled = clamp(finiteOr(state.distanceTravelled, 0), 0, MAX_DISTANCE_VALUE);
  state.locationsLooted = clamp(integerOr(state.locationsLooted, 0), 0, MAX_COUNTER_VALUE);
  state.nestsCleared = clamp(integerOr(state.nestsCleared ?? state.stats?.nestsPurged, 0), 0, MAX_COUNTER_VALUE);
  state.missionsCompleted = clamp(integerOr(state.missionsCompleted ?? state.stats?.missionsCompleted, 0), 0, MAX_COUNTER_VALUE);
  state.threat = clamp(finiteOr(state.threat, 8), 0, 100);
  state.noise = clamp(finiteOr(state.noise, 4), 0, 100);
  state.activity = null;
  state.tutorialIndex = clamp(
    integerOr(state.tutorialIndex, 0),
    0,
    TUTORIAL_STEPS.length
  );
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
  const legacyCount = clamp(integerOr(state.base?.survivors, 3), 1, MAX_ROSTER_ENTRIES);
  const rawRoster = Array.isArray(state.base?.roster)
    ? state.base.roster.slice(0, MAX_ROSTER_ENTRIES)
    : Array.isArray(state.survivors)
      ? state.survivors.slice(0, MAX_ROSTER_ENTRIES)
      : [];
  const survivorIds = new Set();
  const roster = rawRoster.length
    ? rawRoster.map((survivor, index) => normalizeSurvivor(survivor, index, random, survivorIds))
    : Array.from(
      { length: legacyCount },
      (_, index) => normalizeSurvivor(null, index, random, survivorIds)
    );

  state.base = {
    pos: { ...basePosition },
    radius: clamp(Math.max(28, finiteOr(state.base?.radius, 34), 34 + structures.wall * 4), 28, 10_000),
    health: clamp(finiteOr(state.base?.health, 260), 0, MAX_HEALTH_VALUE),
    maxHealth: clamp(finiteOr(state.base?.maxHealth, 260), 1, MAX_HEALTH_VALUE),
    wallHealth: clamp(finiteOr(state.base?.wallHealth, 0), 0, MAX_HEALTH_VALUE),
    wallMaxHealth: clamp(finiteOr(state.base?.wallMaxHealth, 0), 0, MAX_HEALTH_VALUE),
    survivors: roster.length,
    roster,
    morale: clamp(finiteOr(state.base?.morale, 72), 0, 100),
    structures,
    turretCooldown: clamp(finiteOr(state.base?.turretCooldown, 0), 0, MAX_COOLDOWN_SECONDS),
    guardCooldown: clamp(finiteOr(state.base?.guardCooldown, 0), 0, MAX_COOLDOWN_SECONDS),
    trapCooldown: clamp(finiteOr(state.base?.trapCooldown, 0), 0, MAX_COOLDOWN_SECONDS),
    traps: clamp(integerOr(state.base?.traps ?? state.base?.trapCharges, 0), 0, MAX_RESOURCE_AMOUNT),
    generatorOnline: Boolean(state.base?.generatorOnline)
  };
  const expectedWallMaxHealth = structures.wall > 0 ? 180 + structures.wall * 170 : 0;
  state.base.wallMaxHealth = Math.max(state.base.wallMaxHealth, expectedWallMaxHealth);
  state.base.health = Math.min(state.base.maxHealth, state.base.health);
  state.base.wallHealth = Math.min(state.base.wallMaxHealth, state.base.wallHealth);

  const playerPosition = readPosition(state.player?.pos) ?? { ...basePosition };
  state.player = {
    pos: playerPosition,
    target: null,
    health: clamp(finiteOr(state.player?.health, 100), 0, MAX_HEALTH_VALUE),
    maxHealth: clamp(Math.max(finiteOr(state.player?.maxHealth, 100), 100 + structures.infirmary * 6), 1, MAX_HEALTH_VALUE),
    stamina: clamp(finiteOr(state.player?.stamina, 100), 0, MAX_HEALTH_VALUE),
    maxStamina: clamp(finiteOr(state.player?.maxStamina, 100), 1, MAX_HEALTH_VALUE),
    armor: clamp(Math.max(finiteOr(state.player?.armor, 0), structures.workshop * 6), 0, 55),
    fireCooldown: 0,
    meleeCooldown: 0,
    invulnerability: 0,
    heading: normalizeHeading(state.player?.heading),
    atBase: Boolean(state.player?.atBase),
    atOutpostId: state.player?.atOutpostId ?? null,
    infection: clamp(finiteOr(state.player?.infection, 0), 0, 100),
    bleeding: Boolean(state.player?.bleeding),
    injury: ["none", "sprain", "fracture"].includes(state.player?.injury) ? state.player.injury : "none"
  };
  state.player.health = Math.min(state.player.maxHealth, state.player.health);
  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina);

  state.inventory = {
    fieldKit: clamp(integerOr(state.inventory?.fieldKit, 0), 0, MAX_RESOURCE_AMOUNT),
    repairKit: clamp(integerOr(state.inventory?.repairKit, 0), 0, MAX_RESOURCE_AMOUNT),
    trap: clamp(integerOr(state.inventory?.trap, 0), 0, MAX_RESOURCE_AMOUNT),
    antidote: clamp(integerOr(state.inventory?.antidote, 0), 0, MAX_RESOURCE_AMOUNT)
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
    discovered: Boolean(
      state.vehicle?.discovered ||
      state.vehicle?.repaired ||
      state.vehicle?.active
    ),
    repaired: Boolean(state.vehicle?.repaired),
    active: Boolean(state.vehicle?.active),
    condition: clamp(vehicleCondition, 0, 100),
    maxCondition: 100,
    distanceTravelled: clamp(finiteOr(state.vehicle?.distanceTravelled, 0), 0, MAX_DISTANCE_VALUE),
    pos: readPosition(state.vehicle?.pos) ?? { ...basePosition },
    parkedAt: safeId(state.vehicle?.parkedAt) || "base"
  };
  if (!state.vehicle.repaired || state.vehicle.condition <= 0) state.vehicle.active = false;
  if (state.vehicle.active) {
    state.vehicle.pos = { ...state.player.pos };
    state.vehicle.parkedAt = "mobile";
  }

  const weatherType = WEATHER_TYPES[state.weather?.type]
    ? state.weather.type
    : WEATHER_TYPES[state.weather?.id]
      ? state.weather.id
      : "clear";
  state.weather = {
    type: weatherType,
    remainingMinutes: clamp(finiteOr(state.weather?.remainingMinutes, 360), 1, MAX_GAME_MINUTES),
    changes: clamp(integerOr(state.weather?.changes, 0), 0, MAX_COUNTER_VALUE)
  };

  const normalizedPois = normalizePois(
    state.pois,
    state.base.pos,
    sourceCreatedAt,
    now
  );
  state.pois = normalizedPois.pois;
  if (state.pois.length === 0) return null;
  relocateDependentPositions(state, normalizedPois.expiredRelocations);
  reconcileWorldFeatures(state.pois, state.base.pos, random, state.difficultyId, state.vehicle.discovered);
  const vehicleWreckPoi = state.pois.find((poi) => poi.vehicleWreck);
  if (
    vehicleWreckPoi &&
    (!state.vehicle.discovered || state.vehicle.parkedAt === "wreck")
  ) {
    state.vehicle.pos = { ...vehicleWreckPoi.pos };
    state.vehicle.parkedAt = "wreck";
  }
  state.realPlaceCount = state.pois.filter((poi) => poi.realPlace).length;
  state.worldSource = state.realPlaceCount > 0 ? "hybrid-google-places" : "procedural";

  state.missions = normalizeMissions(
    state,
    difficultyId,
    normalizedPois.idMap,
    googleDescriptions
  );
  if (!state.vehicle.discovered && !state.missions.active.some((mission) => mission.type === "vehicle")) {
    const vehiclePoi = state.pois.find((poi) => poi.vehicleWreck && !poi.looted);
    if (vehiclePoi) {
      vehiclePoi.discovered = true;
      if (state.missions.active.length < MAX_ACTIVE_MISSIONS) {
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
  }

  const campaignSource = state.campaign ?? state.extraction ?? {};
  const collectedSignalParts = state.pois.filter((poi) =>
    poi.campaignSignalPart && poi.signalPartCollected
  ).length;
  const signalParts = clamp(
    Math.max(integerOr(campaignSource.signalParts, 0), collectedSignalParts),
    0,
    CAMPAIGN_SIGNAL_PARTS_REQUIRED
  );
  state.pois
    .filter((poi) => poi.campaignSignalPart && !poi.signalPartCollected)
    .slice(0, Math.max(0, signalParts - collectedSignalParts))
    .forEach((poi) => {
      poi.signalPartCollected = true;
      poi.looted = true;
    });
  state.campaign = {
    phase: ["signal", "research", "beacon", "final", "victory"].includes(campaignSource.phase)
      ? campaignSource.phase
      : "signal",
    signalParts,
    requiredSignalParts: CAMPAIGN_SIGNAL_PARTS_REQUIRED,
    beaconBuilt: Boolean(campaignSource.beaconBuilt),
    evacuationCalled: Boolean(campaignSource.evacuationCalled ?? campaignSource.active),
    finalSiegeStarted: Boolean(campaignSource.finalSiegeStarted ?? campaignSource.finalWaveStarted),
    finalSiegeDefeated: Boolean(campaignSource.finalSiegeDefeated),
    victoryAt: campaignSource.victoryAt == null
      ? null
      : Number.isFinite(Number(campaignSource.victoryAt))
        ? clamp(Number(campaignSource.victoryAt), 0, Date.now())
        : null
  };
  if (state.campaign.finalSiegeStarted) {
    state.campaign.evacuationCalled = true;
    state.campaign.beaconBuilt = true;
  } else if (state.campaign.evacuationCalled) {
    state.campaign.beaconBuilt = true;
  }
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

  state.wave = normalizeWave(state.wave);

  const zombieIds = new Set();
  state.zombies = Array.isArray(state.zombies)
    ? state.zombies
      .slice(0, MAX_ZOMBIES)
      .map((zombie, index) => normalizeZombie(
        zombie,
        normalizedPois.idMap,
        zombieIds,
        index
      ))
      .filter(Boolean)
    : [];
  relocateEntityPositions(state.zombies, normalizedPois.expiredRelocations);
  state.effects = [];
  state.notifications = [];
  state.logs = normalizeLogs(state.logs, state.totalMinutes, googleDescriptions);
  state.timers = normalizeTimers(state.timers);
  state.randomState = (Number(state.randomState ?? seed) >>> 0) || 0x9e3779b9;
  state.selectedPoiId = resolvePoiId(state.selectedPoiId, normalizedPois.idMap, state.pois);
  state.player.atOutpostId = resolvePoiId(state.player.atOutpostId, normalizedPois.idMap, state.pois);
  if (!state.pois.some((poi) => poi.id === state.player.atOutpostId && poi.outpost)) {
    state.player.atOutpostId = null;
  }
  state.wave.total = clamp(
    Math.max(state.wave.total, state.wave.queued + state.wave.spawned),
    0,
    MAX_WAVE_COUNT
  );
  if (
    state.status === "playing" &&
    state.campaign.finalSiegeStarted &&
    (!state.wave.active || !state.wave.final)
  ) {
    state.campaign.finalSiegeStarted = false;
    state.campaign.evacuationCalled = false;
    state.campaign.phase = "beacon";
  }
  if (state.status !== "playing") state.paused = true;
  stripUnknownTopLevelFields(state);
  return state;
}

export function validateMigratedState(state) {
  const poiIds = Array.isArray(state?.pois) ? state.pois.map((poi) => poi.id) : [];
  return Boolean(
    state &&
    state.version === GAME_VERSION &&
    isPosition(state.base?.pos) &&
    isPosition(state.player?.pos) &&
    Number.isFinite(state.totalMinutes) &&
    state.totalMinutes >= 0 &&
    state.totalMinutes <= MAX_GAME_MINUTES &&
    Number.isFinite(state.base?.health) &&
    Number.isFinite(state.player?.health) &&
    Array.isArray(state.base?.roster) &&
    state.base.roster.length >= 1 &&
    state.base.roster.length <= MAX_ROSTER_ENTRIES &&
    Array.isArray(state.pois) &&
    state.pois.length > 0 &&
    state.pois.length <= MAX_POI_ENTRIES &&
    poiIds.length === new Set(poiIds).size &&
    state.pois.every((poi) =>
      isSafeId(poi.id) &&
      isPosition(poi.pos) &&
      POI_TYPES[poi.type] &&
      Number.isInteger(poi.danger) &&
      poi.danger >= 1 &&
      poi.danger <= 5
    ) &&
    state.pois.filter((poi) => poi.campaignSignalPart).length >= CAMPAIGN_SIGNAL_PARTS_REQUIRED &&
    Object.values(state.resources ?? {}).every((amount) =>
      Number.isFinite(amount) &&
      amount >= 0 &&
      amount <= MAX_RESOURCE_AMOUNT
    ) &&
    Array.isArray(state.missions?.active) &&
    state.missions.active.length <= MAX_ACTIVE_MISSIONS &&
    Number.isInteger(state.wave?.number) &&
    state.wave.number >= 0 &&
    state.wave.number <= MAX_WAVE_NUMBER &&
    Number.isInteger(state.wave?.queued) &&
    state.wave.queued >= 0 &&
    state.wave.queued <= MAX_WAVE_COUNT &&
    Number.isFinite(state.wave?.nextSpawnIn) &&
    state.wave.nextSpawnIn >= 0 &&
    state.wave.nextSpawnIn <= MAX_COOLDOWN_SECONDS &&
    Number.isFinite(state.timers?.ambientSpawn) &&
    state.timers.ambientSpawn >= 0.1 &&
    state.timers.ambientSpawn <= MAX_SPAWN_TIMER_SECONDS &&
    Number.isFinite(state.timers?.nestSpawn) &&
    state.timers.nestSpawn >= 0.1 &&
    state.timers.nestSpawn <= MAX_SPAWN_TIMER_SECONDS &&
    Number.isFinite(state.timers?.generatorFuelPulse) &&
    state.timers.generatorFuelPulse >= 0 &&
    state.timers.generatorFuelPulse <= MAX_GENERATOR_FUEL_PULSE_MINUTES &&
    Array.isArray(state.zombies) &&
    state.zombies.length <= MAX_ZOMBIES &&
    Array.isArray(state.logs) &&
    state.logs.length <= MAX_LOG_ENTRIES &&
    DIFFICULTIES[state.difficultyId]
  );
}

/**
 * Applique aux clones destinés au stockage les mêmes bornes numériques que la
 * migration. Cela empêche notamment JSON.stringify de convertir Infinity en null.
 */
export function sanitizeStateBoundsForStorage(payload) {
  if (!payload || typeof payload !== "object") return payload;

  payload.totalMinutes = clamp(
    finiteOr(payload.totalMinutes, 480),
    0,
    MAX_GAME_MINUTES
  );
  payload.score = clamp(finiteOr(payload.score, 0), 0, MAX_COUNTER_VALUE);
  payload.resources = normalizeResources(payload.resources);
  payload.wave = normalizeWave(payload.wave);
  payload.timers = normalizeTimers(payload.timers);

  if (payload.base && typeof payload.base === "object") {
    payload.base.turretCooldown = clamp(
      finiteOr(payload.base.turretCooldown, 0),
      0,
      MAX_COOLDOWN_SECONDS
    );
    payload.base.guardCooldown = clamp(
      finiteOr(payload.base.guardCooldown, 0),
      0,
      MAX_COOLDOWN_SECONDS
    );
    payload.base.trapCooldown = clamp(
      finiteOr(payload.base.trapCooldown, 0),
      0,
      MAX_COOLDOWN_SECONDS
    );
  }

  if (payload.player && typeof payload.player === "object") {
    payload.player.heading = normalizeHeading(payload.player.heading);
  }

  if (Array.isArray(payload.zombies)) {
    payload.zombies = payload.zombies.map((zombie) => ({
      ...zombie,
      attackCooldown: clamp(
        finiteOr(zombie?.attackCooldown, 0),
        0,
        MAX_COOLDOWN_SECONDS
      ),
      screamCooldown: clamp(
        finiteOr(zombie?.screamCooldown, 8),
        0,
        MAX_COOLDOWN_SECONDS
      ),
      stagger: clamp(
        finiteOr(zombie?.stagger, 0),
        0,
        MAX_COOLDOWN_SECONDS
      ),
      heading: normalizeHeading(zombie?.heading)
    }));
  }

  if (Array.isArray(payload.logs)) {
    payload.logs = payload.logs.map((entry) => ({
      ...entry,
      totalMinutes: clamp(
        finiteOr(entry?.totalMinutes, payload.totalMinutes),
        0,
        MAX_GAME_MINUTES
      )
    }));
  }

  return payload;
}

function normalizeWave(rawWave) {
  const wave = rawWave && typeof rawWave === "object" ? rawWave : {};
  const spawned = clamp(integerOr(wave.spawned, 0), 0, MAX_WAVE_COUNT);
  const queued = clamp(
    integerOr(wave.queued, 0),
    0,
    MAX_WAVE_COUNT - spawned
  );
  const total = clamp(
    Math.max(integerOr(wave.total, queued), queued + spawned),
    0,
    MAX_WAVE_COUNT
  );
  return {
    active: Boolean(wave.active),
    number: clamp(integerOr(wave.number, 0), 0, MAX_WAVE_NUMBER),
    queued,
    total,
    spawned,
    defeated: clamp(integerOr(wave.defeated, 0), 0, spawned),
    nextSpawnIn: clamp(
      finiteOr(wave.nextSpawnIn, 0),
      0,
      MAX_COOLDOWN_SECONDS
    ),
    announcedDay: clamp(
      integerOr(wave.announcedDay, 0),
      0,
      MAX_WAVE_NUMBER
    ),
    bossQueued: clamp(integerOr(wave.bossQueued, 0), 0, queued),
    final: Boolean(wave.final)
  };
}

function normalizeTimers(rawTimers) {
  const timers = rawTimers && typeof rawTimers === "object" ? rawTimers : {};
  return {
    ambientSpawn: clamp(
      finiteOr(timers.ambientSpawn, 5),
      0.1,
      MAX_SPAWN_TIMER_SECONDS
    ),
    nestSpawn: clamp(
      finiteOr(timers.nestSpawn, 26),
      0.1,
      MAX_SPAWN_TIMER_SECONDS
    ),
    savePulse: 0,
    uiPulse: 0,
    secondPulse: 0,
    generatorFuelPulse: clamp(
      finiteOr(timers.generatorFuelPulse, 0),
      0,
      MAX_GENERATOR_FUEL_PULSE_MINUTES
    )
  };
}

function stripUnknownTopLevelFields(state) {
  for (const field of Object.keys(state)) {
    if (!KNOWN_STATE_FIELDS.has(field)) delete state[field];
  }
}

function normalizeResources(rawResources) {
  const result = {};
  for (const id of Object.keys(RESOURCE_META)) {
    result[id] = clamp(
      finiteOr(rawResources?.[id], 0),
      0,
      MAX_RESOURCE_AMOUNT
    );
  }
  return result;
}

function normalizeSurvivor(raw, index, random, usedIds) {
  const fallback = createSurvivor(random, index, ["guard", "medic", "engineer"][index] ?? "idle");
  return {
    id: uniqueSafeId(raw?.id || fallback.id, "survivor", index, usedIds),
    name: boundedString(raw?.name || fallback.name, MAX_NAME_LENGTH, fallback.name),
    role: SURVIVOR_ROLES[raw?.role] ? raw.role : fallback.role,
    health: clamp(finiteOr(raw?.health, 100), 0, 100),
    morale: clamp(finiteOr(raw?.morale, 70), 0, 100),
    injured: Boolean(raw?.injured),
    joinedDay: clamp(integerOr(raw?.joinedDay, 1), 1, 100_000)
  };
}

function normalizeMissions(state, difficultyId, poiIdMap, googleDescriptions = []) {
  let active = [];
  let history = [];
  let lastGeneratedDay = 0;
  if (Array.isArray(state.missions)) {
    active = state.missions.filter((mission) =>
      mission?.status !== "completed" && mission?.status !== "expired"
    );
    history = state.missions.filter((mission) =>
      mission?.status === "completed" || mission?.status === "expired"
    );
  } else if (state.missions && typeof state.missions === "object") {
    active = Array.isArray(state.missions.active) ? state.missions.active : [];
    history = Array.isArray(state.missions.history) ? state.missions.history : [];
    lastGeneratedDay = Math.max(0, integerOr(state.missions.lastGeneratedDay, 0));
  }
  const poisById = new Map(state.pois.map((poi) => [poi.id, poi]));
  const missionIds = new Set();
  const normalize = (mission, status, index) => {
    if (!mission || !MISSION_TYPES[mission.type]) return null;
    const poiId = resolvePoiId(mission.poiId, poiIdMap, state.pois);
    const poi = poisById.get(poiId);
    if (!poi) return null;
    if (
      status === "active" &&
      (mission.type === "nest" ? !poi.nest?.active : poi.looted)
    ) {
      return null;
    }
    const createdAtMinutes = clamp(
      finiteOr(mission.createdAtMinutes, state.totalMinutes),
      0,
      MAX_GAME_MINUTES
    );
    const fallback = createMission({
      type: mission.type,
      poi,
      totalMinutes: createdAtMinutes,
      difficultyId,
      index
    });
    const expiresAtMinutes = finiteOr(
      mission.expiresAtMinutes,
      fallback.expiresAtMinutes
    );
    if (status === "active" && expiresAtMinutes <= state.totalMinutes) return null;
    return {
      id: uniqueSafeId(mission.id || fallback.id, "mission", index, missionIds),
      type: mission.type,
      title: redactGoogleDescriptions(
        boundedString(mission.title, MAX_NAME_LENGTH, fallback.title),
        googleDescriptions,
        fallback.title
      ),
      description: redactGoogleDescriptions(
        boundedString(
        mission.description,
        MAX_TEXT_LENGTH,
        fallback.description
        ),
        googleDescriptions,
        fallback.description
      ),
      poiId,
      status,
      createdAtMinutes,
      expiresAtMinutes: clamp(
        expiresAtMinutes,
        createdAtMinutes + 1,
        MAX_MISSION_MINUTES
      ),
      completedAtMinutes: status === "completed"
        ? clamp(
            finiteOr(mission.completedAtMinutes, state.totalMinutes),
            createdAtMinutes,
            MAX_MISSION_MINUTES
          )
        : null
    };
  };
  state.pois.forEach((poi) => {
    poi.missionMarker = null;
  });
  const occupiedPoiIds = new Set();
  const normalizedActive = active
    .slice(0, MAX_ACTIVE_MISSIONS * 2)
    .map((mission, index) => normalize(mission, "active", index))
    .filter((mission) => {
      if (!mission || occupiedPoiIds.has(mission.poiId)) return false;
      occupiedPoiIds.add(mission.poiId);
      return true;
    })
    .slice(0, MAX_ACTIVE_MISSIONS);
  for (const mission of normalizedActive) {
    const poi = poisById.get(mission.poiId);
    if (poi) poi.missionMarker = mission.type;
  }
  return {
    active: normalizedActive,
    history: history
      .slice(0, MAX_HISTORY_MISSIONS)
      .map((mission, index) => normalize(
        mission,
        mission?.status === "expired" ? "expired" : "completed",
        index + MAX_ACTIVE_MISSIONS
      ))
      .filter(Boolean),
    lastGeneratedDay: clamp(lastGeneratedDay, 0, 100_000)
  };
}

function normalizeZombie(raw, poiIdMap, usedIds, index) {
  if (!raw || !ZOMBIE_TYPES[raw.type] || !isPosition(raw.pos)) return null;
  const config = ZOMBIE_TYPES[raw.type];
  const maxHealth = clamp(
    finiteOr(raw.maxHealth, config.health),
    1,
    MAX_HEALTH_VALUE
  );
  const health = clamp(finiteOr(raw.health, maxHealth), 0, maxHealth);
  if (raw.dead || health <= 0) return null;
  return {
    id: uniqueSafeId(raw.id, "zombie", index, usedIds),
    type: raw.type,
    pos: readPosition(raw.pos),
    health,
    maxHealth,
    attackCooldown: clamp(finiteOr(raw.attackCooldown, 0), 0, MAX_COOLDOWN_SECONDS),
    screamCooldown: clamp(finiteOr(raw.screamCooldown, 8), 0, MAX_COOLDOWN_SECONDS),
    target: raw.target === "player" ? "player" : "base",
    heading: normalizeHeading(raw.heading),
    wave: Boolean(raw.wave),
    stagger: clamp(finiteOr(raw.stagger, 0), 0, MAX_COOLDOWN_SECONDS),
    defenderPoiId: resolvePoiId(raw.defenderPoiId, poiIdMap, []) || null,
    dead: false
  };
}

/**
 * Retire du clone de sauvegarde tout contenu Places non stockable. Les identifiants
 * de lieu restent disponibles et les coordonnées expirent au plus tard après 30 jours.
 */
export function sanitizeGoogleContentForStorage(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.pois)) return payload;
  const googleDescriptions = collectGoogleDescriptions(payload.pois);
  const expiredRelocations = [];
  payload.pois = payload.pois.map((poi, index) => {
    const googleBacked = isGoogleBackedPoi(poi);
    const next = { ...poi };
    for (const field of GOOGLE_CONTENT_FIELDS) {
      delete next[field];
    }
    if (!googleBacked) return next;

    const placeId = boundedString(
      poi.placeId ?? poi.externalId ?? poi.id,
      256,
      poi.id
    );
    const fetchedAt = normalizeFetchedAt(
      poi.googleFetchedAt ?? poi.fetchedAt ?? payload.createdAt ?? 0,
      now
    );
    const expiresAt = normalizeGoogleExpiry(
      poi.googleExpiresAt,
      fetchedAt
    );
    const type = independentPoiType(placeId);
    next.type = type;
    next.name = `${POI_TYPES[type].label} — site réel ${index + 1}`;
    next.placeId = placeId;
    next.googleFetchedAt = fetchedAt;
    next.googleExpiresAt = expiresAt;
    next.source = "google-places";
    next.realPlace = true;

    if (expiresAt <= now) {
      next.pos = proceduralRecoveryPosition(payload.base?.pos, placeId, index);
      if (isPosition(poi.pos)) {
        expiredRelocations.push({
          from: readPosition(poi.pos),
          to: { ...next.pos }
        });
      }
      next.source = "procedural-recovery";
      next.realPlace = false;
      delete next.placeId;
      delete next.googleFetchedAt;
      delete next.googleExpiresAt;
    }
    return next;
  });
  relocateDependentPositions(payload, expiredRelocations);
  redactPayloadGoogleDescriptions(payload, googleDescriptions);
  payload.realPlaceCount = payload.pois.filter((poi) => poi.realPlace).length;
  payload.worldSource = payload.realPlaceCount > 0
    ? "hybrid-google-places"
    : "procedural";
  return payload;
}

function normalizePois(rawPois, basePosition, sourceCreatedAt, now = Date.now()) {
  const usedIds = new Set();
  const idMap = new Map();
  const expiredRelocations = [];
  const pois = [];
  for (const [index, raw] of rawPois.slice(0, MAX_POI_ENTRIES).entries()) {
    if (!raw || typeof raw !== "object" || !isPosition(raw.pos)) continue;
    const originalId = String(raw.id ?? "");
    const id = uniqueSafeId(originalId, "poi", index, usedIds);
    if (originalId && !idMap.has(originalId)) idMap.set(originalId, id);

    const googleBacked = isGoogleBackedPoi(raw);
    const placeId = googleBacked
      ? boundedString(raw.placeId ?? raw.externalId ?? originalId, 256, id)
      : "";
    const fetchedAt = googleBacked
      ? normalizeFetchedAt(raw.googleFetchedAt ?? raw.fetchedAt ?? sourceCreatedAt, now)
      : null;
    const expiresAt = googleBacked
      ? normalizeGoogleExpiry(raw.googleExpiresAt, fetchedAt)
      : null;
    const googleExpired = googleBacked && expiresAt <= now;
    const type = googleBacked
      ? independentPoiType(placeId)
      : POI_TYPES[raw.type]
        ? raw.type
        : "house";
    const config = POI_TYPES[type];
    const pos = googleExpired
      ? proceduralRecoveryPosition(basePosition, placeId, index)
      : readPosition(raw.pos);
    if (googleExpired) {
      expiredRelocations.push({
        from: readPosition(raw.pos),
        to: { ...pos }
      });
    }
    const danger = clamp(integerOr(raw.danger, config.danger), 1, 5);
    const normalized = withPoiFeatureDefaults({
      id,
      type,
      name: googleBacked
        ? `${config.label} — site réel ${index + 1}`
        : boundedString(raw.name, MAX_NAME_LENGTH, config.label),
      pos,
      danger,
      looted: Boolean(raw.looted),
      discovered: Boolean(raw.discovered),
      visited: Boolean(raw.visited),
      currentThreat: clamp(finiteOr(raw.currentThreat, danger), 0, 20),
      lootSeed: Number(raw.lootSeed) >>> 0,
      source: googleExpired
        ? "procedural-recovery"
        : googleBacked
          ? "google-places"
          : raw.source === "procedural-recovery"
            ? "procedural-recovery"
            : "procedural",
      realPlace: googleBacked && !googleExpired,
      placeId: googleExpired ? null : placeId || null,
      googleFetchedAt: googleExpired ? null : fetchedAt,
      googleExpiresAt: googleExpired ? null : expiresAt,
      outpost: Boolean(raw.outpost),
      outpostClaimedDay: raw.outpostClaimedDay == null
        ? null
        : clamp(integerOr(raw.outpostClaimedDay, 1), 1, 100_000),
      campaignSignalPart: Boolean(
        raw.campaignSignalPart || raw.signalPartCollected
      ),
      signalPartCollected: Boolean(raw.signalPartCollected),
      vehicleWreck: Boolean(raw.vehicleWreck),
      missionMarker: MISSION_TYPES[raw.missionMarker]
        ? raw.missionMarker
        : null,
      defendersSpawned: raw.defendersSpawned,
      nest: {
        active: Boolean(raw.nest?.active),
        strength: clamp(integerOr(raw.nest?.strength, 0), 0, 3)
      }
    });
    pois.push(normalized);
  }
  return { pois, idMap, expiredRelocations };
}

function reconcileWorldFeatures(pois, basePosition, random, difficultyId, vehicleDiscovered) {
  const hadFeatures = pois.some((poi) =>
    poi.campaignSignalPart || poi.vehicleWreck || poi.nest?.active || poi.outpost
  );
  if (!hadFeatures) decorateWorldFeatures(pois, basePosition, random, difficultyId);

  const orderedSignals = pois
    .filter((poi) => poi.campaignSignalPart)
    .sort((a, b) =>
      Number(b.signalPartCollected) - Number(a.signalPartCollected)
    );
  const keptSignals = new Set(
    orderedSignals.slice(0, CAMPAIGN_SIGNAL_PARTS_REQUIRED)
  );
  for (const poi of orderedSignals.slice(CAMPAIGN_SIGNAL_PARTS_REQUIRED)) {
    poi.campaignSignalPart = false;
    poi.signalPartCollected = false;
  }
  const candidates = pois
    .filter((poi) => !keptSignals.has(poi) && !poi.vehicleWreck)
    .sort((a, b) => positionDistanceSquared(basePosition, b.pos) -
      positionDistanceSquared(basePosition, a.pos));
  while (
    keptSignals.size < CAMPAIGN_SIGNAL_PARTS_REQUIRED &&
    candidates.length > 0
  ) {
    const poi = candidates.shift();
    poi.campaignSignalPart = true;
    poi.signalPartCollected = false;
    keptSignals.add(poi);
  }

  if (!vehicleDiscovered && !pois.some((poi) => poi.vehicleWreck)) {
    const vehiclePoi = pois.find((poi) =>
      !poi.campaignSignalPart && !poi.outpost
    );
    if (vehiclePoi) {
      vehiclePoi.vehicleWreck = true;
      vehiclePoi.discovered = true;
    }
  }

  const desiredNestCount = difficultyId === "easy"
    ? 2
    : difficultyId === "hard"
      ? 4
      : 3;
  const activeNestCount = pois.filter((poi) => poi.nest?.active).length;
  if (activeNestCount < desiredNestCount) {
    const nestCandidates = pois
      .filter((poi) =>
        !poi.campaignSignalPart &&
        !poi.vehicleWreck &&
        !poi.outpost &&
        !poi.looted &&
        !poi.nest?.active
      )
      .sort(() => random() - 0.5);
    nestCandidates
      .slice(0, desiredNestCount - activeNestCount)
      .forEach((poi, index) => {
        poi.nest = { active: true, strength: 1 + (index % 3) };
      });
  }
}

function normalizeLogs(rawLogs, fallbackMinutes, googleDescriptions = []) {
  if (!Array.isArray(rawLogs)) return [];
  const usedIds = new Set();
  return rawLogs
    .slice(0, MAX_LOG_ENTRIES)
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      return {
        id: uniqueSafeId(entry.id, "log", index, usedIds),
        totalMinutes: clamp(
          finiteOr(entry.totalMinutes, fallbackMinutes),
          0,
          MAX_GAME_MINUTES
        ),
        category: LOG_CATEGORIES.has(entry.category) ? entry.category : "system",
        text: redactGoogleDescriptions(
          boundedString(entry.text, MAX_TEXT_LENGTH, "Entrée restaurée."),
          googleDescriptions,
          "Entrée restaurée."
        )
      };
    })
    .filter(Boolean);
}

function collectGoogleDescriptions(rawPois) {
  if (!Array.isArray(rawPois)) return [];
  const descriptions = new Set();
  for (const poi of rawPois) {
    if (!poi || !isGoogleBackedPoi(poi)) continue;
    for (const field of GOOGLE_DESCRIPTION_FIELDS) {
      const description = readGoogleDescription(poi[field]);
      if (
        description.length < 3 ||
        (field === "name" && isTacticalGoogleAlias(description))
      ) {
        continue;
      }
      descriptions.add(description.slice(0, MAX_TEXT_LENGTH));
    }
  }
  return [...descriptions].sort((a, b) => b.length - a.length);
}

function readGoogleDescription(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value?.text === "string") return value.text.trim();
  return "";
}

function isTacticalGoogleAlias(value) {
  return /site réel\s+\d+$/iu.test(String(value).trim());
}

function redactGoogleDescriptions(value, descriptions, fallback) {
  let text = String(value ?? "");
  for (const description of descriptions ?? []) {
    if (!description) continue;
    text = text.replace(
      new RegExp(escapeRegExp(description), "giu"),
      "site réel"
    );
  }
  text = text.trim();
  return text || fallback;
}

function redactPayloadGoogleDescriptions(payload, descriptions) {
  const redactMission = (mission) => {
    if (!mission || typeof mission !== "object") return mission;
    return {
      ...mission,
      title: redactGoogleDescriptions(
        boundedString(mission.title, MAX_NAME_LENGTH, "Mission de secteur"),
        descriptions,
        "Mission de secteur"
      ),
      description: redactGoogleDescriptions(
        boundedString(
          mission.description,
          MAX_TEXT_LENGTH,
          "Objectif tactique local."
        ),
        descriptions,
        "Objectif tactique local."
      )
    };
  };

  if (Array.isArray(payload.missions)) {
    payload.missions = payload.missions.map(redactMission);
  } else if (payload.missions && typeof payload.missions === "object") {
    if (Array.isArray(payload.missions.active)) {
      payload.missions.active = payload.missions.active.map(redactMission);
    }
    if (Array.isArray(payload.missions.history)) {
      payload.missions.history = payload.missions.history.map(redactMission);
    }
  }

  if (Array.isArray(payload.logs)) {
    payload.logs = payload.logs.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        text: redactGoogleDescriptions(
          boundedString(entry.text, MAX_TEXT_LENGTH, "Entrée restaurée."),
          descriptions,
          "Entrée restaurée."
        )
      };
    });
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relocateDependentPositions(payload, relocations) {
  if (!Array.isArray(relocations) || relocations.length === 0) return;
  if (payload.player && typeof payload.player === "object") {
    payload.player.pos = relocateExactPosition(payload.player.pos, relocations);
  }
  if (payload.vehicle && typeof payload.vehicle === "object") {
    payload.vehicle.pos = relocateExactPosition(payload.vehicle.pos, relocations);
  }
  relocateEntityPositions(payload.zombies, relocations);
}

function relocateEntityPositions(entities, relocations) {
  if (!Array.isArray(entities) || !Array.isArray(relocations)) return;
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") continue;
    entity.pos = relocateExactPosition(entity.pos, relocations);
  }
}

function relocateExactPosition(value, relocations) {
  if (!isPosition(value)) return value;
  const position = readPosition(value);
  const relocation = relocations.find(({ from }) =>
    from &&
    position.lat === from.lat &&
    position.lng === from.lng
  );
  return relocation ? { ...relocation.to } : position;
}

function normalizeHeading(value) {
  const heading = finiteOr(value, 0);
  const fullTurn = Math.PI * 2;
  return ((heading % fullTurn) + fullTurn) % fullTurn;
}

function resolvePoiId(value, idMap, pois) {
  if (value == null || value === "") return null;
  const raw = String(value);
  if (idMap?.has(raw)) return idMap.get(raw);
  return pois.some((poi) => poi.id === raw) ? raw : null;
}

function uniqueSafeId(value, prefix, index, usedIds) {
  const safePrefix = safeId(prefix) || "entry";
  const raw = safeId(value);
  const fallback = `${safePrefix}-${index + 1}`;
  const base = raw || fallback;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    const marker = `-${suffix++}`;
    candidate = `${base.slice(0, MAX_ID_LENGTH - marker.length)}${marker}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function safeId(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_ID_LENGTH);
}

function isSafeId(value) {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= MAX_ID_LENGTH &&
    /^[a-zA-Z0-9_-]+$/.test(value);
}

function boundedString(value, maxLength, fallback = "") {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
  return normalized || fallback;
}

function isGoogleBackedPoi(poi) {
  if (poi?.source === "procedural-recovery") return false;
  return Boolean(
    poi?.realPlace ||
    poi?.source === "google-places" ||
    poi?.placeId ||
    poi?.externalId
  );
}

function independentPoiType(placeId) {
  const ids = Object.keys(POI_TYPES);
  return ids[(hashString(placeId) >>> 0) % ids.length];
}

function normalizeFetchedAt(value, now = Date.now()) {
  return clamp(finiteOr(value, now), 0, now);
}

function normalizeGoogleExpiry(value, fetchedAt) {
  const maximum = fetchedAt + GOOGLE_COORDINATE_TTL_MS;
  return clamp(finiteOr(value, maximum), fetchedAt, maximum);
}

function proceduralRecoveryPosition(basePosition, placeId, index) {
  const origin = isPosition(basePosition)
    ? readPosition(basePosition)
    : { lat: 43.2965, lng: 5.3698 };
  const hash = hashString(`${placeId}:${index}`);
  const angle = (hash / 4294967296) * Math.PI * 2;
  const distance = 140 + ((hash >>> 8) % 1120);
  return destinationPoint(origin, angle, distance);
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function positionDistanceSquared(origin, point) {
  const lat = point.lat - origin.lat;
  const lng = point.lng - origin.lng;
  return lat * lat + lng * lng;
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
  if (
    !value ||
    !isNumericScalar(value.lat) ||
    !isNumericScalar(value.lng)
  ) {
    return false;
  }
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -85.05112878 &&
    lat <= 85.05112878 &&
    lng >= -180 &&
    lng <= 180;
}

function finiteOr(value, fallback) {
  if (!isNumericScalar(value)) return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function integerOr(value, fallback) {
  return Math.floor(finiteOr(value, fallback));
}

function isNumericScalar(value) {
  return (
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")
  );
}
