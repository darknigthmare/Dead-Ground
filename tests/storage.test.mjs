import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/world.js";
import {
  deleteSave,
  loadGame,
  saveGame,
  saveSettings
} from "../src/storage.js";

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); }
  };
}

test("sauvegarde et recharge une partie sans les effets temporaires", () => {
  globalThis.localStorage = makeStorage();
  const state = createInitialState({ start: { lat: 43.2965, lng: 5.3698 }, difficultyId: "normal", seed: 42 });
  state.paused = true;
  state.effects.push({ id: "fx", ttl: 2 });
  state.notifications.push({ id: "notice", ttl: 2 });
  state.player.target = { lat: 43.3, lng: 5.37 };

  assert.equal(saveGame(state), true);
  const loaded = loadGame();
  assert.ok(loaded);
  assert.equal(loaded.paused, false);
  assert.deepEqual(loaded.effects, []);
  assert.deepEqual(loaded.notifications, []);
  assert.equal(loaded.player.target, null);
});

test("les opérations de stockage échouent proprement quand le navigateur bloque localStorage", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(deleteSave(), false);
    assert.equal(saveSettings({ soundEnabled: true }), false);
    assert.equal(loadGame(), null);
  } finally {
    console.warn = originalWarn;
  }
});
