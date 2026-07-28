import {
  BACKUP_SAVE_KEY,
  GAME_VERSION,
  LEGACY_SAVE_KEYS,
  SAVE_KEY,
  SETTINGS_KEY
} from "./constants.js";
import {
  migrateState,
  sanitizeGoogleContentForStorage,
  sanitizeStateBoundsForStorage,
  validateMigratedState
} from "./migrations.js";

const MAX_SAVE_BYTES = 5 * 1024 * 1024;

export function saveGame(state) {
  try {
    const payload = sanitizeForStorage(state);
    const serialized = serializeWithinLimit(payload);
    if (!serialized) {
      console.warn("Sauvegarde ignorée car elle dépasse la limite de 5 Mo.");
      return false;
    }
    const previous = localStorage.getItem(SAVE_KEY);
    const safePrevious = sanitizeStoredSave(previous);
    if (safePrevious) localStorage.setItem(BACKUP_SAVE_KEY, safePrevious);
    localStorage.setItem(SAVE_KEY, serialized);
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
    if (serializedByteLength(raw) > MAX_SAVE_BYTES) {
      console.warn(`Sauvegarde ignorée car trop volumineuse (${key}).`);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      const state = migrateState(parsed);
      if (!validateMigratedState(state)) continue;
      state.paused = state.status !== "playing";
      state.effects = [];
      state.notifications = [];
      state.activity = null;
      state.player.target = null;
      state.timers.savePulse = 0;
      state.timers.uiPulse = 0;
      state.timers.secondPulse = 0;
      try {
        const serialized = serializeWithinLimit(sanitizeForStorage(state));
        if (serialized) {
          const existingBackup = key === BACKUP_SAVE_KEY
            ? serialized
            : sanitizeStoredSave(localStorage.getItem(BACKUP_SAVE_KEY)) || serialized;
          localStorage.setItem(SAVE_KEY, serialized);
          localStorage.setItem(BACKUP_SAVE_KEY, existingBackup);
          for (const legacyKey of LEGACY_SAVE_KEYS) localStorage.removeItem(legacyKey);
        }
      } catch {
        // La partie reste jouable même si son nettoyage ne peut pas être persisté.
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
  if (!file || Number(file.size ?? 0) > MAX_SAVE_BYTES) {
    throw new Error("Le fichier dépasse la limite de 5 Mo.");
  }
  const text = await file.text();
  if (serializedByteLength(text) > MAX_SAVE_BYTES) {
    throw new Error("Le fichier dépasse la limite de 5 Mo.");
  }
  const state = migrateState(JSON.parse(text));
  if (!validateMigratedState(state)) throw new Error("Format de sauvegarde incompatible.");
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    const safePrevious = sanitizeStoredSave(previous);
    const serialized = serializeWithinLimit(sanitizeForStorage(state));
    if (!serialized) throw new Error("La sauvegarde importée dépasse 5 Mo.");
    if (safePrevious) localStorage.setItem(BACKUP_SAVE_KEY, safePrevious);
    localStorage.setItem(SAVE_KEY, serialized);
  } catch (error) {
    console.warn("Import chargé sans persistance locale", error);
  }
  return state;
}

export function sanitizeForStorage(state) {
  const payload = typeof structuredClone === "function"
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));
  sanitizeGoogleContentForStorage(payload);
  sanitizeStateBoundsForStorage(payload);
  payload.version = GAME_VERSION;
  payload.updatedAt = Date.now();
  payload.effects = [];
  payload.notifications = [];
  payload.activity = null;
  payload.player.target = null;
  payload.zombies = Array.isArray(payload.zombies)
    ? payload.zombies.filter((zombie) => !zombie.dead && zombie.health > 0)
    : [];
  payload.paused = false;
  payload.timers = {
    ...payload.timers,
    savePulse: 0,
    uiPulse: 0,
    secondPulse: 0
  };
  return payload;
}

function sanitizeStoredSave(raw) {
  if (!raw || serializedByteLength(raw) > MAX_SAVE_BYTES) return null;
  try {
    const state = migrateState(JSON.parse(raw));
    if (!validateMigratedState(state)) return null;
    return serializeWithinLimit(sanitizeForStorage(state));
  } catch {
    return null;
  }
}

function serializeWithinLimit(payload) {
  const serialized = JSON.stringify(payload);
  return serializedByteLength(serialized) <= MAX_SAVE_BYTES
    ? serialized
    : null;
}

function serializedByteLength(value) {
  const text = String(value ?? "");
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(text).byteLength;
  }
  return text.length;
}
