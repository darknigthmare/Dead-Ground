import {
  BACKUP_SAVE_KEY,
  GAME_VERSION,
  LEGACY_SAVE_KEYS,
  SAVE_KEY,
  SETTINGS_KEY
} from "./constants.js";
import { migrateState, validateMigratedState } from "./migrations.js";

export function saveGame(state) {
  try {
    const payload = sanitizeForStorage(state);
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous) localStorage.setItem(BACKUP_SAVE_KEY, previous);
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn("Sauvegarde impossible", error);
    return false;
  }
}

export function loadGame() {
  const keys = [SAVE_KEY, BACKUP_SAVE_KEY, ...LEGACY_SAVE_KEYS];
  for (const key of keys) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      console.warn("Lecture de sauvegarde impossible", error);
      return null;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const originalVersion = Number(parsed.version ?? 1);
      const state = migrateState(parsed);
      if (!validateMigratedState(state)) continue;
      state.paused = false;
      state.effects = [];
      state.notifications = [];
      state.activity = null;
      state.player.target = null;
      state.timers.savePulse = 0;
      state.timers.uiPulse = 0;
      state.timers.secondPulse = 0;
      if (key !== SAVE_KEY || originalVersion !== GAME_VERSION) {
        try {
          // Conserve le fichier d’origine avant toute migration. Si la source est
          // déjà la sauvegarde secondaire, ne l’écrase pas.
          if (key !== BACKUP_SAVE_KEY) localStorage.setItem(BACKUP_SAVE_KEY, raw);
          localStorage.setItem(SAVE_KEY, JSON.stringify(sanitizeForStorage(state)));
        } catch {
          // La partie reste jouable même si la migration ne peut pas être persistée.
        }
      }
      return state;
    } catch (error) {
      console.warn(`Sauvegarde illisible (${key})`, error);
    }
  }
  return null;
}

export function hasSave() {
  return Boolean(loadGame());
}

export function deleteSave() {
  try {
    for (const key of [SAVE_KEY, BACKUP_SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
      localStorage.removeItem(key);
    }
    return true;
  } catch (error) {
    console.warn("Suppression de sauvegarde impossible", error);
    return false;
  }
}

export function loadSettings() {
  const configKey = String(globalThis.window?.DEAD_GROUND_CONFIG?.googleMapsApiKey ?? "").trim();
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return {
      googleMapsApiKey: String(stored.googleMapsApiKey || configKey || "").trim(),
      soundEnabled: stored.soundEnabled !== false,
      reducedMotion: stored.reducedMotion === true,
      tutorialSeen: stored.tutorialSeen === true
    };
  } catch {
    return {
      googleMapsApiKey: configKey,
      soundEnabled: true,
      reducedMotion: false,
      tutorialSeen: false
    };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.warn("Enregistrement des paramètres impossible", error);
    return false;
  }
}

export function exportSave(state) {
  const payload = {
    ...sanitizeForStorage(state),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dead-ground-v2-save-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importSave(file) {
  const text = await file.text();
  const state = migrateState(JSON.parse(text));
  if (!validateMigratedState(state)) throw new Error("Format de sauvegarde incompatible.");
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous) localStorage.setItem(BACKUP_SAVE_KEY, previous);
    localStorage.setItem(SAVE_KEY, JSON.stringify(sanitizeForStorage(state)));
  } catch (error) {
    console.warn("Import chargé sans persistance locale", error);
  }
  return state;
}

function sanitizeForStorage(state) {
  const payload = typeof structuredClone === "function"
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));
  payload.version = GAME_VERSION;
  payload.updatedAt = Date.now();
  payload.effects = [];
  payload.notifications = [];
  payload.activity = null;
  payload.player.target = null;
  payload.paused = false;
  payload.timers = {
    ...payload.timers,
    savePulse: 0,
    uiPulse: 0,
    secondPulse: 0
  };
  return payload;
}
