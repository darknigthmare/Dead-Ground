import test from "node:test";
import assert from "node:assert/strict";

import { GameEngine } from "../src/engine.js";
import { destinationPoint, distanceMeters } from "../src/geo.js";
import { createInitialState } from "../src/world.js";

const START = Object.freeze({ lat: 43.2965, lng: 5.3698 });

function freshState(seed = 0x12345678) {
  const state = createInitialState({ start: START, difficultyId: "normal", seed });
  state.tutorialVisible = false;
  state.notifications = [];
  state.timers.ambientSpawn = 1_000_000;
  state.timers.nestSpawn = 1_000_000;
  return state;
}

function zombie(index, {
  pos = destinationPoint(START, 0, 300),
  wave = false,
  defenderPoiId = null
} = {}) {
  return {
    id: `hardening-zombie-${index}`,
    type: "walker",
    pos,
    health: 44,
    maxHealth: 44,
    attackCooldown: 99,
    screamCooldown: 8,
    target: "base",
    heading: 0,
    wave,
    stagger: 0,
    defenderPoiId,
    dead: false
  };
}

test("la seed qui annulait le xorshift reçoit un état aléatoire non nul", () => {
  const state = freshState(0xa5a5a5a5);
  const engine = new GameEngine(state);
  assert.notEqual(state.randomState, 0);
  assert.ok(new Set(Array.from({ length: 8 }, () => engine.random())).size > 1);
});

test("relâcher Shift ou ouvrir la pause arrête toujours le sprint", () => {
  const state = freshState();
  const engine = new GameEngine(state);
  assert.equal(engine.setMovementMode("sprint"), true);
  state.paused = true;
  assert.equal(engine.releaseSprint(), true);
  assert.equal(state.movementMode, "walk");

  state.paused = false;
  assert.equal(engine.setMovementMode("sprint"), true);
  engine.pause(true);
  assert.equal(state.movementMode, "walk");
});

test("une zone saturée ne valide ni fouille ni défenseurs fantômes", () => {
  const state = freshState();
  const poi = state.pois.find((candidate) => !candidate.looted && !candidate.nest.active);
  assert.ok(poi);
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  state.selectedPoiId = poi.id;
  state.zombies = Array.from({ length: 125 }, (_, index) => zombie(index));
  const engine = new GameEngine(state);

  assert.equal(engine.beginScavenge(), false);
  assert.equal(state.activity, null);
  assert.equal(Boolean(poi.defendersSpawned.scavenge), false);
});

test("les défenseurs liés reviennent au périmètre lors d'une reprise d'activité", () => {
  const state = freshState();
  const poi = state.pois.find((candidate) => !candidate.looted && !candidate.nest.active);
  assert.ok(poi);
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  state.selectedPoiId = poi.id;
  poi.defendersSpawned = { scavenge: true, clearNest: false };
  state.zombies = [
    zombie(1, {
      pos: destinationPoint(poi.pos, Math.PI, 900),
      defenderPoiId: poi.id
    })
  ];
  const engine = new GameEngine(state);

  assert.equal(engine.beginScavenge(), true);
  assert.ok(distanceMeters(state.zombies[0].pos, poi.pos) <= 125);
  assert.equal(state.activity.blocked, true);
});

test("le trajet vers le fourgon garé reste disponible après un retour à pied", () => {
  const state = freshState();
  const parked = destinationPoint(START, Math.PI / 2, 260);
  Object.assign(state.vehicle, {
    discovered: true,
    repaired: true,
    active: false,
    condition: 80,
    pos: parked,
    parkedAt: "field"
  });
  const engine = new GameEngine(state);

  assert.equal(engine.returnToVehicle(), true);
  assert.deepEqual(state.player.target, parked);
});

test("un kit de réparation peut réellement renforcer la palissade promise", () => {
  const state = freshState();
  state.base.structures.wall = 1;
  state.base.wallMaxHealth = 350;
  state.base.wallHealth = 100;
  state.inventory.repairKit = 1;
  const engine = new GameEngine(state);

  assert.equal(engine.repairVehicleWithKit(), true);
  assert.ok(state.base.wallHealth > 100);
  assert.equal(state.inventory.repairKit, 0);
});

test("la défaite létale prime sur le dernier tir du siège final", () => {
  const state = freshState();
  state.player.health = 1;
  state.player.maxHealth = 100;
  state.autoFire = true;
  state.resources.ammo = 10;
  state.wave = {
    active: true,
    number: 3,
    queued: 0,
    total: 1,
    spawned: 1,
    defeated: 0,
    nextSpawnIn: 0,
    announcedDay: 3,
    bossQueued: 0,
    final: true
  };
  state.campaign.finalSiegeStarted = true;
  const attacker = zombie(1, {
    pos: destinationPoint(state.player.pos, 0, 0.5),
    wave: true
  });
  attacker.health = 1;
  attacker.attackCooldown = 0;
  state.zombies = [attacker];
  const engine = new GameEngine(state);

  engine.step(0.25);
  assert.equal(state.status, "gameover");
  assert.equal(state.campaign.finalSiegeDefeated, false);
});

test("le siège final attend aussi les infectés ambiants et n'en génère pas de nouveaux", () => {
  const state = freshState();
  state.wave = {
    active: true,
    number: 4,
    queued: 0,
    total: 1,
    spawned: 1,
    defeated: 1,
    nextSpawnIn: 0,
    announcedDay: 4,
    bossQueued: 0,
    final: true
  };
  state.campaign.finalSiegeStarted = true;
  state.zombies = [zombie(1, { wave: false })];
  state.timers.ambientSpawn = 0;
  state.timers.nestSpawn = 0;
  const engine = new GameEngine(state);

  engine.updateSpawning(1);
  assert.equal(state.zombies.length, 1);
  assert.equal(engine.resolveWaveCompletion(), false);
  assert.equal(state.status, "playing");

  state.zombies[0].dead = true;
  assert.equal(engine.resolveWaveCompletion(), true);
  assert.equal(state.status, "victory");
});
