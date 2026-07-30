import { DEFAULT_CENTER } from "./constants.js";
import { GameEngine } from "./engine.js";
import { distanceMeters, roundedCoordinate } from "./geo.js";
import { SoundManager } from "./audio.js";
import {
  deleteSave,
  exportSave,
  hasSave,
  importSave,
  loadGame,
  loadSettings,
  saveGame,
  saveSettings
} from "./storage.js";
import { createInitialState } from "./world.js";
import { normalizeGooglePlaces } from "./real-places.js";
import { GameUI } from "./ui.js";
import {
  GoogleMapAdapter,
  resetGoogleMapsLoader
} from "./maps/google-map.js";
import { FallbackMapAdapter } from "./maps/fallback-map.js";
import {
  preloadSpriteAtlases,
  spriteAtlasStatus
} from "./sprites.js";

const appRoot = document.querySelector("#app");
let settings = loadSettings();
/** @type {{lat: number, lng: number}} */
let selectedStart = { ...DEFAULT_CENTER };
let mapAdapter = null;
let engine = null;
let currentState = null;
let phase = "setup";
let followPulseAt = 0;
const sound = new SoundManager(settings.soundEnabled);

const ui = new GameUI(appRoot, {
  startNew: (difficultyId) => void startNewGame(difficultyId),
  continueGame: () => continueSavedGame(),
  locate: () => void locatePlayer(),
  searchLocation: (query) => searchLocation(query),
  saveSettings: (nextSettings) => applySettings(nextSettings),
  requestRender: () => currentState && ui.renderGame(currentState, settings),
  pause: () => engine?.pause(true),
  resume: () => engine?.pause(false),
  fire: () => engine?.fire(),
  melee: () => engine?.melee(),
  heal: () => engine?.heal(),
  useFieldKit: () => engine?.useFieldKit(),
  useAntidote: () => engine?.useAntidote(),
  toggleSprint: () => {
    if (!engine) return;
    engine.setMovementMode(currentState.movementMode === "sprint" ? "walk" : "sprint");
  },
  toggleAutoFire: () => engine?.toggleAutoFire(),
  returnToBase: () => engine?.returnToBase(),
  returnToVehicle: () => engine?.returnToVehicle(),
  scavenge: () => engine?.beginScavenge(),
  clearNest: () => engine?.beginClearNest(),
  cancelActivity: () => engine?.cancelActivity(),
  buildStructure: (id) => engine?.buildStructure(id),
  craftItem: (id) => engine?.craftItem(id),
  researchTech: (id) => engine?.researchTech(id),
  assignSurvivorRole: (survivorId, roleId) => engine?.assignSurvivorRole(survivorId, roleId),
  claimOutpost: (poiId) => engine?.claimOutpost(poiId),
  deployTrap: () => engine?.deployTrap(),
  repairVehicle: () => engine?.repairVehicle(),
  repairVehicleWithKit: () => engine?.repairVehicleWithKit(),
  toggleVehicle: () => engine?.toggleVehicle(),
  buildBeacon: () => engine?.buildEvacuationBeacon(),
  callEvacuation: () => engine?.callEvacuation(),
  repairBase: (target) => engine?.repairBase(target),
  selectPoi: (id) => selectPoi(id),
  travelToPoi: (id) => {
    if (engine?.travelToPoi(id)) {
      const poi = currentState.pois.find((item) => item.id === id);
      if (poi) mapAdapter?.panTo(poi.pos);
    }
  },
  dismissNotification: (id) => engine?.dismissNotification(id),
  nextTutorial: () => {
    engine?.advanceTutorial();
    if (currentState && !currentState.tutorialVisible) {
      markTutorialSeen();
      engine?.pause(false);
    }
  },
  skipTutorial: () => {
    engine?.hideTutorial();
    markTutorialSeen();
    engine?.pause(false);
  },
  exportSave: () => currentState && exportSave(currentState),
  importSave: (file) => handleImport(file),
  toggleSound: () => toggleSound(),
  quitToMenu: () => quitToMenu(),
  restart: () => restartGame()
});

await initialize();

async function initialize() {
  ui.setLoading(true);
  ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
  await Promise.all([
    initializeMap(),
    preloadSpriteAtlases()
  ]);
  ui.setPhase("setup");
  ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
  ui.setLoading(false);
  installKeyboardControls();
  registerServiceWorker();
}

async function initializeMap({ preserveView = false } = {}) {
  const previousCenter = preserveView ? mapAdapter?.getCenter?.() : null;
  mapAdapter?.destroy();
  mapAdapter = null;

  const options = {
    container: ui.mapRoot,
    center: previousCenter ?? (currentState?.player.pos || selectedStart),
    apiKey: settings.googleMapsApiKey,
    onClick: handleMapClick,
    onStatus: (status) => ui.setMapStatus(status),
    seed: currentState?.seed ?? 1337,
    reducedMotion: settings.reducedMotion
  };

  if (settings.googleMapsApiKey) {
    try {
      mapAdapter = await GoogleMapAdapter.create(options);
    } catch (error) {
      console.warn("Google Maps indisponible, bascule sur le terrain de secours.", error);
      mapAdapter = new FallbackMapAdapter(options);
      ui.showToast("warning", "Satellite indisponible", error.message || "Vérifiez la clé et ses restrictions.");
    }
  } else {
    mapAdapter = new FallbackMapAdapter(options);
  }

  if (phase === "game" && currentState) {
    mapAdapter.setMode("game");
    mapAdapter.setSnapshot(currentState);
  } else {
    mapAdapter.setMode("select");
    mapAdapter.setSelection(selectedStart);
  }
}

function handleMapClick(position) {
  const rounded = roundedCoordinate(position, 6);
  if (phase === "setup") {
    selectedStart = rounded;
    mapAdapter.setSelection(selectedStart);
    ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
    return;
  }

  if (!engine || !currentState || currentState.paused || currentState.status !== "playing") return;
  const nearestPoi = currentState.pois
    .filter((poi) => poi.discovered)
    .map((poi) => ({ poi, distance: distanceMeters(position, poi.pos) }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (nearestPoi && nearestPoi.distance <= 24) {
    selectPoi(nearestPoi.poi.id);
  } else {
    engine.moveTo(rounded);
  }
}

async function startNewGame(difficultyId, forcedStart = selectedStart) {
  let realPois = [];
  const canSearchRealPlaces = Boolean(settings.googleMapsApiKey && mapAdapter?.searchNearbyPois);

  if (canSearchRealPlaces) {
    ui.setLoading(true, "Analyse des bâtiments et commerces réels autour de la base…");
    try {
      const rawPlaces = await mapAdapter.searchNearbyPois(forcedStart, { radius: 1500, maxResultCount: 20 });
      realPois = normalizeGooglePlaces(rawPlaces, forcedStart, { maxCount: 22 });
      if (realPois.length > 0) {
        ui.showToast(
          "success",
          "Zone réelle analysée",
          `${realPois.length} lieux Google transformés en objectifs d’exploration.`
        );
      } else {
        ui.showToast("info", "Aucun lieu exploitable", "Le monde sera complété par la génération procédurale.");
      }
    } catch (error) {
      console.warn("Recherche Google Places indisponible, utilisation du monde hybride de secours.", error);
      ui.showToast(
        "warning",
        "Lieux réels indisponibles",
        error.message || "La génération procédurale prend le relais."
      );
    } finally {
      ui.setLoading(false);
    }
  }

  const state = createInitialState({ start: forcedStart, difficultyId, realPois });
  state.tutorialVisible = !settings.tutorialSeen;
  deleteSave();
  launchState(state);
}

function continueSavedGame() {
  const state = loadGame();
  if (!state) {
    ui.showToast("warning", "Sauvegarde absente", "Aucune partie compatible n’a été trouvée.");
    ui.renderSetup({ selectedStart, hasSave: false, settings });
    return;
  }
  selectedStart = { ...state.base.pos };
  launchState(state);
}

function launchState(state) {
  engine?.stop();
  if (state.status === "playing" && state.tutorialVisible) state.paused = true;
  currentState = state;
  phase = "game";
  ui.setPhase("game");
  mapAdapter.setMode("game");
  mapAdapter.setSnapshot(state);
  mapAdapter.panTo(state.player.pos, 18);

  engine = new GameEngine(state, {
    onFrame: (nextState, renderMetadata) => {
      currentState = nextState;
      mapAdapter?.setAnimationTime?.(renderMetadata.animationTimeMs);
      mapAdapter?.setSnapshot(nextState);
      const now = performance.now();
      if (nextState.mapFollowsPlayer && nextState.player.target && now - followPulseAt > 620) {
        followPulseAt = now;
        mapAdapter?.panTo(nextState.player.pos);
      }
    },
    onChange: (nextState) => {
      currentState = nextState;
      mapAdapter?.setSnapshot(nextState);
      ui.renderGame(nextState, settings);
    },
    onAutosave: (nextState) => saveGame(nextState),
    onSound: (type) => sound.play(type)
  });

  ui.renderGame(state, settings);
  saveGame(state);
  globalThis.__DEAD_GROUND_DEBUG__ = {
    getState: () => currentState,
    getEngine: () => engine,
    render: () => currentState && ui.renderGame(currentState, settings),
    getSpriteStatus: () => spriteAtlasStatus(),
    setAnimationTime: (value) => {
      mapAdapter?.setAnimationTime?.(Number(value) || 0);
      if (currentState) mapAdapter?.setSnapshot(currentState);
    }
  };
  engine.start();
  sound.unlock().catch(() => {});
}

function selectPoi(id) {
  if (!engine || !currentState) return;
  if (!id) {
    currentState.selectedPoiId = null;
    ui.renderGame(currentState, settings);
    mapAdapter?.setSnapshot(currentState);
    return;
  }
  if (engine.selectPoi(id)) {
    const poi = currentState.pois.find((item) => item.id === id);
    if (poi) mapAdapter?.panTo(poi.pos);
  }
}

async function searchLocation(query) {
  try {
    ui.setLoading(true, "Recherche de la zone…");
    const result = await mapAdapter.geocode(query);
    if (!result) throw new Error("Aucun résultat trouvé.");
    selectedStart = roundedCoordinate(result.position, 6);
    mapAdapter.setSelection(selectedStart);
    mapAdapter.panTo(selectedStart, 18);
    ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
    ui.showToast("success", "Zone localisée", result.label || query);
  } catch (error) {
    ui.showToast("warning", "Recherche impossible", error.message || "Réessayez avec une autre adresse.");
  } finally {
    ui.setLoading(false);
  }
}

async function locatePlayer() {
  const consented = await ui.requestLocationConsent?.();
  if (consented === false) return;
  if (!navigator.geolocation) {
    ui.showToast("warning", "Géolocalisation indisponible", "Ce navigateur ne fournit pas la position.");
    return;
  }
  ui.setLoading(true, "Récupération de votre position…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      selectedStart = roundedCoordinate({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }, 6);
      mapAdapter.setSelection(selectedStart);
      mapAdapter.panTo(selectedStart, 18);
      ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
      ui.setLoading(false);
      ui.showToast("success", "Position trouvée", `Précision annoncée : ${Math.round(position.coords.accuracy)} m.`);
    },
    (error) => {
      ui.setLoading(false);
      ui.showToast("warning", "Position refusée", error.message || "Autorisez la géolocalisation dans le navigateur.");
    },
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
  );
}

async function applySettings(nextSettings) {
  const keyChanged = nextSettings.googleMapsApiKey !== settings.googleMapsApiKey;
  settings = { ...settings, ...nextSettings };
  saveSettings(settings);
  sound.setEnabled(settings.soundEnabled);
  ui.shell.classList.toggle("reduce-motion", settings.reducedMotion);
  mapAdapter?.setReducedMotion?.(settings.reducedMotion);
  ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
  if (currentState) ui.renderGame(currentState, settings);

  if (keyChanged) {
    const loaderReset = resetGoogleMapsLoader({ reloadIfLoaded: true });
    if (loaderReset.reloading) return;
    ui.setLoading(true, "Reconfiguration du moteur cartographique…");
    try {
      await initializeMap({ preserveView: true });
    } finally {
      ui.setLoading(false);
    }
  }
  ui.showToast("success", "Paramètres enregistrés", keyChanged ? "Le fournisseur cartographique a été rechargé." : "Configuration appliquée.");
}

function toggleSound() {
  settings.soundEnabled = !settings.soundEnabled;
  saveSettings(settings);
  sound.setEnabled(settings.soundEnabled);
  if (settings.soundEnabled) sound.unlock().then(() => sound.play("loot")).catch(() => {});
  ui.showToast("info", "Audio", settings.soundEnabled ? "Effets sonores activés." : "Effets sonores coupés.");
}

function markTutorialSeen() {
  settings.tutorialSeen = true;
  saveSettings(settings);
}

function quitToMenu() {
  if (currentState && currentState.status === "playing") saveGame(currentState);
  engine?.stop();
  engine = null;
  phase = "setup";
  selectedStart = currentState ? { ...currentState.base.pos } : selectedStart;
  currentState = null;
  ui.setPhase("setup");
  mapAdapter.setMode("select");
  mapAdapter.setSelection(selectedStart);
  mapAdapter.panTo(selectedStart, 18);
  ui.renderSetup({ selectedStart, hasSave: hasSave(), settings });
}

function restartGame() {
  if (!currentState) return;
  const start = { ...currentState.base.pos };
  const difficultyId = currentState.difficultyId;
  void startNewGame(difficultyId, start);
}

async function handleImport(file) {
  try {
    const state = await importSave(file);
    ui.showToast("success", "Sauvegarde importée", "La partie peut maintenant être chargée.");
    if (phase === "game") launchState(state);
    else ui.renderSetup({ selectedStart, hasSave: true, settings });
  } catch (error) {
    ui.showToast("danger", "Import refusé", error.message || "Fichier incompatible.");
  }
}

function installKeyboardControls() {
  window.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === "Escape" && ui.isSettingsOpen?.()) {
      event.preventDefault();
      ui.closeSettings?.();
      return;
    }
    if (phase !== "game" || !engine) return;
    if (event.code === "Escape" && currentState?.tutorialVisible) {
      event.preventDefault();
      return;
    }
    const key = String(event.key || "").toLowerCase();

    if (event.code === "Space") {
      event.preventDefault();
      engine.fire();
    } else if (key === "f") {
      engine.melee();
    } else if (event.code === "Digit1") {
      engine.heal();
    } else if (event.code === "Digit2") {
      engine.useAntidote();
    } else if (key === "v" && !event.repeat) {
      engine.toggleVehicle();
    } else if (key === "a" && !event.repeat) {
      engine.toggleAutoFire();
    } else if (key === "r") {
      engine.returnToBase();
    } else if (event.code === "Escape" && !event.repeat) {
      engine.togglePause();
    } else if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) {
      engine.setMovementMode("sprint");
    }
  });

  window.addEventListener("keyup", (event) => {
    if (phase !== "game" || !engine) return;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") engine.releaseSprint();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && phase === "game" && currentState?.status === "playing") engine?.pause(true);
  });

  window.addEventListener("beforeunload", () => {
    if (currentState?.status === "playing") saveGame(currentState);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.warn("Service worker non enregistré", error);
  });
}
