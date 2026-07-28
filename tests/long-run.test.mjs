import test from "node:test";
import assert from "node:assert/strict";

import { MAX_LOG_ENTRIES, RESEARCH_TECHS, STRUCTURES } from "../src/constants.js";
import { GameEngine } from "../src/engine.js";
import { createInitialState } from "../src/world.js";

const START = Object.freeze({ lat: 43.2965, lng: 5.3698 });

function assertFiniteNumbers(value, path = "state", seen = new Set()) {
  if (value == null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} doit rester un nombre fini`);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteNumbers(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assertFiniteNumbers(item, `${path}.${key}`, seen);
  }
}

test("simulation longue : six jours restent stables sans fuite ni valeur invalide", () => {
  const state = createInitialState({ start: START, difficultyId: "normal", seed: 0xdead2026 });
  state.tutorialVisible = false;
  state.autoFire = true;
  state.base.health = state.base.maxHealth = 1_000_000;
  state.base.wallHealth = state.base.wallMaxHealth = 1_000_000;
  state.player.health = state.player.maxHealth = 1_000_000;
  state.resources = Object.fromEntries(Object.keys(state.resources).map((key) => [key, 1_000_000]));
  state.research.unlocked = Object.keys(RESEARCH_TECHS);
  state.research.completed = state.research.unlocked.length;
  for (const [id, definition] of Object.entries(STRUCTURES)) {
    state.base.structures[id] = definition.maxLevel;
  }

  const engine = new GameEngine(state, {
    onFrame() {},
    onChange() {},
    onAutosave() {},
    onSound() {}
  });
  // La simulation teste tous les systèmes temporels et l’IA sans pouvoir être arrêtée
  // par une mort aléatoire du personnage pendant le test de résistance.
  engine.damagePlayer = () => {};

  const initialMinutes = state.totalMinutes;
  const steps = 14_400; // 6 jours de jeu à 0,25 seconde par pas.
  for (let index = 0; index < steps; index += 1) engine.step(0.25);

  assert.ok(state.totalMinutes >= initialMinutes + 6 * 1440 - 1);
  assert.ok(state.weather.changes >= 6);
  assert.ok(state.wave.number >= 1);
  assert.ok(state.missions.lastGeneratedDay >= 1);
  assert.ok(state.zombies.length <= 125);
  assert.ok(state.logs.length <= MAX_LOG_ENTRIES);
  assert.ok(state.missions.history.length <= 30);
  assert.equal(state.status, "playing");
  assert.equal(state.paused, false);
  for (const [resource, amount] of Object.entries(state.resources)) {
    assert.ok(amount >= 0, `${resource} ne doit jamais devenir négatif`);
  }
  assertFiniteNumbers(state);
});
