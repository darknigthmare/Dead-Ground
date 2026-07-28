import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPAIGN_SIGNAL_PARTS_REQUIRED,
  CRAFTING_RECIPES,
  EVACUATION_BEACON_COST,
  OUTPOST_CLAIM_COST,
  RESEARCH_TECHS,
  VEHICLE_DEFINITION
} from "../src/constants.js";
import { GameEngine } from "../src/engine.js";
import { destinationPoint, distanceMeters } from "../src/geo.js";
import { migrateState } from "../src/migrations.js";
import { createInitialState } from "../src/world.js";

const START = Object.freeze({ lat: 43.2965, lng: 5.3698 });

function freshState(seed = 20260728) {
  const state = createInitialState({ start: START, difficultyId: "normal", seed });
  state.tutorialVisible = false;
  state.notifications = [];
  return state;
}

function richState(seed) {
  const state = freshState(seed);
  for (const key of Object.keys(state.resources)) state.resources[key] = 999;
  state.resources.intel = 999;
  return state;
}

function engineFor(state) {
  return new GameEngine(state, {
    onFrame() {},
    onChange() {},
    onAutosave() {},
    onSound() {}
  });
}

test("mise à jour 1 : initialise une communauté avec rôles réellement affectés", () => {
  const state = freshState();
  assert.equal(state.base.roster.length, 3);
  assert.deepEqual(state.base.roster.map((survivor) => survivor.role), ["guard", "medic", "engineer"]);
  assert.equal(state.base.survivors, state.base.roster.length);
});

test("mise à jour 1 : change l’affectation d’un survivant à la base", () => {
  const state = freshState(1);
  const engine = engineFor(state);
  const survivor = state.base.roster[0];
  assert.equal(engine.assignSurvivorRole(survivor.id, "scout"), true);
  assert.equal(survivor.role, "scout");
});

test("mise à jour 2 : génère des missions radio avec cibles et échéances", () => {
  const state = freshState(2);
  assert.ok(state.missions.active.length >= 2);
  assert.ok(state.missions.active.some((mission) => mission.type === "vehicle"));
  for (const mission of state.missions.active) {
    assert.ok(state.pois.some((poi) => poi.id === mission.poiId));
    assert.ok(mission.expiresAtMinutes > mission.createdAtMinutes);
  }
});

test("mise à jour 2 : une mission de sauvetage ajoute un survivant", () => {
  const state = freshState(3);
  const engine = engineFor(state);
  const rescue = state.missions.active.find((mission) => mission.type === "rescue");
  assert.ok(rescue);
  const poi = state.pois.find((item) => item.id === rescue.poiId);
  poi.nest.active = false;
  const before = state.base.roster.length;
  engine.completeScavenge(poi);
  assert.ok(state.base.roster.length >= before + 1);
  assert.equal(state.missionsCompleted, 1);
});

test("mise à jour 3 : répare, active et utilise le fourgon avec carburant", () => {
  const state = richState(4);
  const engine = engineFor(state);
  state.vehicle.discovered = true;
  state.research.unlocked.push("mechanics");
  assert.equal(engine.repairVehicle(), true);
  assert.equal(state.vehicle.repaired, true);
  assert.equal(state.vehicle.condition, state.vehicle.maxCondition);
  assert.equal(engine.toggleVehicle(), true);
  const fuelBefore = state.resources.fuel;
  const target = destinationPoint(state.player.pos, 0, 250);
  assert.equal(engine.moveTo(target), true);
  engine.updateMovement(1);
  assert.ok(state.vehicle.distanceTravelled > 10);
  assert.ok(state.resources.fuel < fuelBefore);
});

test("mise à jour 4 : fabrique des consommables et les stocke", () => {
  const state = richState(5);
  const engine = engineFor(state);
  state.base.structures.workshop = 2;
  const before = state.inventory.fieldKit;
  assert.equal(engine.craftItem("fieldKit"), true);
  assert.equal(state.inventory.fieldKit, before + CRAFTING_RECIPES.fieldKit.result.amount);
});

test("mise à jour 4 : fabrique et déploie un piège de périmètre", () => {
  const state = richState(6);
  const engine = engineFor(state);
  state.base.structures.workshop = 1;
  assert.equal(engine.craftItem("trap"), true);
  assert.equal(engine.deployTrap(), true);
  assert.equal(state.base.traps, 1);
  assert.equal(state.inventory.trap, 0);
});

test("mise à jour 5 : respecte les prérequis de l’arbre de recherche", () => {
  const state = richState(7);
  const engine = engineFor(state);
  assert.equal(engine.researchTech("fortification"), false);
  assert.equal(engine.researchTech("ballistics"), true);
  assert.equal(engine.researchTech("fortification"), true);
  assert.ok(state.research.unlocked.includes("fortification"));
  assert.equal(state.research.completed, 2);
});

test("mise à jour 6 : transforme un lieu sécurisé en avant-poste productif", () => {
  const state = richState(8);
  const engine = engineFor(state);
  const poi = state.pois.find((item) => !item.nest.active && !item.outpost);
  poi.looted = true;
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  const resourcesBefore = { ...state.resources };
  assert.equal(engine.claimOutpost(poi.id), true);
  assert.equal(poi.outpost, true);
  engine.produceOutpostResources(2);
  const produced = Object.keys(state.resources).some((id) => state.resources[id] > resourcesBefore[id]);
  assert.equal(produced, true);
  for (const [resource, amount] of Object.entries(OUTPOST_CLAIM_COST)) {
    assert.ok(state.resources[resource] <= resourcesBefore[resource] - amount + 3);
  }
});

test("mise à jour 7 : la météo change automatiquement et applique ses modificateurs", () => {
  const state = freshState(9);
  const engine = engineFor(state);
  state.weather.type = "clear";
  state.weather.remainingMinutes = 0;
  engine.updateWeather(1);
  assert.notEqual(state.weather.type, "clear");
  assert.equal(state.weather.changes, 1);

  const clear = freshState(10);
  const rain = structuredClone(clear);
  clear.weather.type = "clear";
  rain.weather.type = "rain";
  clear.player.target = destinationPoint(clear.player.pos, 0, 100);
  rain.player.target = { ...clear.player.target };
  engineFor(clear).updateMovement(1);
  engineFor(rain).updateMovement(1);
  assert.ok(distanceMeters(START, clear.player.pos) > distanceMeters(START, rain.player.pos));
});

test("mise à jour 8 : le monde contient nids, infectés spéciaux et modules de campagne", () => {
  const state = freshState(11);
  assert.equal(state.pois.filter((poi) => poi.nest.active).length, 3);
  assert.equal(state.pois.filter((poi) => poi.campaignSignalPart).length, CAMPAIGN_SIGNAL_PARTS_REQUIRED);
  assert.equal(state.pois.filter((poi) => poi.vehicleWreck).length, 1);
});

test("mise à jour 8 : nettoyer un nid réduit la menace et rapporte du renseignement", () => {
  const state = freshState(12);
  const engine = engineFor(state);
  const poi = state.pois.find((item) => item.nest.active);
  const strength = poi.nest.strength;
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  const intelBefore = state.resources.intel;
  const threatBefore = state.threat = 50;
  assert.equal(engine.beginClearNest(), false, "aucun POI sélectionné ne doit lancer l’action");
  state.selectedPoiId = poi.id;
  assert.equal(engine.beginClearNest(), true);
  for (const zombie of state.zombies) zombie.dead = true;
  engine.updateActivity(state.activity.duration + 0.1);
  assert.equal(poi.nest.active, false);
  assert.equal(state.nestsCleared, 1);
  assert.ok(state.resources.intel >= intelBefore + strength + 1);
  assert.ok(state.threat < threatBefore);
});

test("mise à jour 9 : les attaques augmentent l’infection et l’antidote la réduit", () => {
  const state = freshState(13);
  const engine = engineFor(state);
  const before = state.player.infection;
  engine.damagePlayer(20, "alpha");
  assert.ok(state.player.infection > before);
  state.inventory.antidote = 1;
  const infected = state.player.infection;
  assert.equal(engine.useAntidote(), true);
  assert.ok(state.player.infection < infected);
});

test("mise à jour 9 : une infection totale met réellement fin à la partie", () => {
  const state = freshState(14);
  const engine = engineFor(state);
  state.player.infection = 100;
  engine.checkEndConditions();
  assert.equal(state.status, "gameover");
  assert.equal(state.paused, true);
});

test("mise à jour 10 : récupère les modules de signal par la fouille", () => {
  const state = freshState(15);
  const engine = engineFor(state);
  const poi = state.pois.find((item) => item.campaignSignalPart);
  poi.nest.active = false;
  engine.completeScavenge(poi);
  assert.equal(poi.signalPartCollected, true);
  assert.equal(state.campaign.signalParts, 1);
});

test("mise à jour 10 : construit la balise, lance le siège final et gagne", () => {
  const state = richState(16);
  const engine = engineFor(state);
  state.campaign.signalParts = state.campaign.requiredSignalParts;
  state.base.structures.radio = 2;
  state.research.unlocked.push("radioNetwork", "triage", "virology", "evacuationProtocol");
  for (const [resource, amount] of Object.entries(EVACUATION_BEACON_COST)) {
    state.resources[resource] = Math.max(state.resources[resource], amount + 10);
  }
  assert.equal(engine.buildEvacuationBeacon(), true);
  assert.equal(state.campaign.beaconBuilt, true);
  state.totalMinutes = 10 * 60;
  assert.equal(engine.callEvacuation(), true);
  assert.equal(state.wave.final, true);
  engine.completeWave();
  assert.equal(state.status, "victory");
  assert.equal(state.campaign.finalSiegeDefeated, true);
});

test("migration : une sauvegarde v1 reçoit tous les nouveaux systèmes sans perdre sa progression", () => {
  const legacy = freshState(17);
  legacy.version = 1;
  legacy.score = 777;
  delete legacy.base.roster;
  delete legacy.inventory;
  delete legacy.research;
  delete legacy.weather;
  delete legacy.vehicle;
  delete legacy.missions;
  delete legacy.campaign;
  for (const poi of legacy.pois) {
    delete poi.nest;
    delete poi.outpost;
    delete poi.campaignSignalPart;
    delete poi.vehicleWreck;
  }
  const migrated = migrateState(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.score, 777);
  assert.equal(migrated.base.roster.length, legacy.base.survivors);
  assert.ok(migrated.weather.type);
  assert.ok(Array.isArray(migrated.missions.active));
  assert.equal(migrated.campaign.requiredSignalParts, CAMPAIGN_SIGNAL_PARTS_REQUIRED);
});

test("régression : les constantes majeures ont des coûts et effets exploitables", () => {
  assert.ok(VEHICLE_DEFINITION.speed > 10);
  assert.ok(VEHICLE_DEFINITION.repairCost.parts > 0);
  assert.ok(RESEARCH_TECHS.evacuationProtocol.prerequisites.length >= 2);
});
