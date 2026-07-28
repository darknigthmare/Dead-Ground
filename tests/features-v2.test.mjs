import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/engine.js";
import { RESEARCH_TECHS, WEATHER_TYPES, ZOMBIE_TYPES } from "../src/constants.js";
import { bearingRadians, destinationPoint, distanceMeters } from "../src/geo.js";
import { createInitialState } from "../src/world.js";

const START = { lat: 43.2965, lng: 5.3698 };

function createEngine(seed = 123456) {
  const state = createInitialState({ start: START, difficultyId: "normal", seed });
  state.tutorialVisible = false;
  state.autoFire = false;
  return { state, engine: new GameEngine(state) };
}

function fillResources(state, amount = 999) {
  for (const id of Object.keys(state.resources)) state.resources[id] = amount;
}

function weakZombie(pos, type = "walker", wave = false) {
  const config = ZOMBIE_TYPES[type];
  return {
    id: `test-${type}-${Math.random()}`,
    type,
    pos: { ...pos },
    health: 1,
    maxHealth: config.health,
    attackCooldown: 0,
    screamCooldown: 99,
    target: null,
    heading: 0,
    wave,
    stagger: 0,
    dead: false
  };
}

function defeatPoiDefendersWithPlayerCommands(state, engine, poiId) {
  state.resources.ammo = Math.max(state.resources.ammo, 999);
  state.player.health = state.player.maxHealth = 1_000_000;
  state.timers.ambientSpawn = 1_000_000;
  state.timers.nestSpawn = 1_000_000;
  for (
    let step = 0;
    step < 600 && state.zombies.some((zombie) => !zombie.dead && zombie.defenderPoiId === poiId);
    step += 1
  ) {
    if (state.player.fireCooldown <= 0) engine.fire();
    engine.step(0.25);
  }
  assert.equal(
    state.zombies.some((zombie) => !zombie.dead && zombie.defenderPoiId === poiId),
    false,
    "les commandes de tir doivent permettre d’éliminer tous les défenseurs pendant l’activité"
  );
}

test("mise à jour majeure 1 — la météo change et modifie réellement la vitesse", () => {
  const clear = createEngine(101);
  const storm = createEngine(101);
  const target = destinationPoint(START, Math.PI / 2, 100);
  clear.state.player.target = { ...target };
  storm.state.player.target = { ...target };
  clear.state.weather.type = "clear";
  storm.state.weather.type = "storm";
  clear.engine.updateMovement(1);
  storm.engine.updateMovement(1);
  assert.ok(clear.state.distanceTravelled > storm.state.distanceTravelled);
  assert.equal(clear.state.distanceTravelled, 4.8);
  assert.equal(storm.state.distanceTravelled, 4.8 * WEATHER_TYPES.storm.movement);

  clear.state.weather.remainingMinutes = 0;
  const previous = clear.state.weather.type;
  clear.engine.updateWeather(1);
  assert.notEqual(clear.state.weather.type, previous);
  assert.equal(clear.state.weather.changes, 1);
});

test("mise à jour majeure 2 — blessures, saignement et infection sont soignables", () => {
  const { state, engine } = createEngine(102);
  engine.random = () => 0;
  state.player.health = state.player.maxHealth;
  state.player.bleeding = true;
  state.inventory.fieldKit = 0;
  state.resources.medicine = 1;
  assert.equal(engine.heal(), true, "un saignement à pleine vie doit rester traitable");
  assert.equal(state.player.bleeding, false);
  assert.equal(state.resources.medicine, 0);

  state.player.infection = 82;
  state.inventory.antidote = 1;
  state.research.unlocked.push("virology");
  assert.equal(engine.useAntidote(), true);
  assert.equal(state.player.infection, 37);
  assert.equal(state.inventory.antidote, 0);

  state.player.health = 40;
  state.player.bleeding = true;
  state.player.injury = "fracture";
  state.inventory.fieldKit = 1;
  assert.equal(engine.useFieldKit(), true);
  assert.equal(state.player.bleeding, false);
  assert.equal(state.player.injury, "sprain");
  assert.ok(state.player.health > 40);
});

test("mise à jour majeure 3 — les rôles des survivants influencent les coûts", () => {
  const { state, engine } = createEngine(103);
  for (const survivor of state.base.roster) survivor.role = "idle";
  for (const survivor of state.base.roster) {
    assert.equal(engine.assignSurvivorRole(survivor.id, "engineer"), true);
  }
  fillResources(state, 100);
  const woodBefore = state.resources.wood;
  assert.equal(engine.buildStructure("wall"), true);
  assert.equal(engine.roleCount("engineer"), 3);
  assert.equal(state.resources.wood, woodBefore - 18, "trois ingénieurs réduisent le coût bois de 20 à 18");
});

test("mise à jour majeure 4 — l’arbre de recherche applique ses prérequis", () => {
  const { state, engine } = createEngine(104);
  state.resources.intel = 100;
  assert.equal(engine.researchTech("fortification"), false);
  assert.equal(engine.researchTech("ballistics"), true);
  assert.equal(engine.researchTech("fortification"), true);
  assert.deepEqual(state.research.unlocked, ["ballistics", "fortification"]);
  assert.equal(state.research.completed, 2);
  assert.equal(state.resources.intel, 100 - RESEARCH_TECHS.ballistics.cost - RESEARCH_TECHS.fortification.cost);
});

test("mise à jour majeure 5 — artisanat et pièges fonctionnent jusqu’au combat", () => {
  const { state, engine } = createEngine(105);
  fillResources(state);
  assert.equal(engine.buildStructure("workshop"), true);
  assert.equal(engine.craftItem("trap"), true);
  assert.equal(state.inventory.trap, 1);
  assert.equal(engine.deployTrap(), true);
  assert.equal(state.base.traps, 1);

  const targetPos = destinationPoint(state.base.pos, 0, 18);
  const target = weakZombie(targetPos);
  state.zombies.push(target);
  engine.updateTraps();
  assert.equal(state.base.traps, 0);
  assert.equal(target.dead, true);
  assert.equal(state.kills, 1);
  assert.ok(state.effects.some((effect) => effect.type === "explosion"));
});

test("mise à jour majeure 6 — une mission de sauvetage recrute un survivant", () => {
  const { state, engine } = createEngine(106);
  const mission = state.missions.active.find((item) => item.type === "rescue");
  assert.ok(mission, "la campagne initiale doit contenir un appel de détresse");
  const poi = state.pois.find((item) => item.id === mission.poiId);
  const before = state.base.roster.length;
  engine.completeMissionsForPoi(poi, "scavenge");
  assert.equal(state.base.roster.length, before + 1);
  assert.equal(state.missionsCompleted, 1);
  assert.equal(state.missions.active.some((item) => item.id === mission.id), false);
  assert.equal(state.missions.history[0].status, "completed");
});

test("mise à jour majeure 7 — un nid niveau 3 génère les nouvelles mutations puis peut être éradiqué", () => {
  const { state, engine } = createEngine(107);
  const poi = state.pois.find((item) => item.nest?.active && item.nest.strength === 3);
  assert.ok(poi);
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  state.selectedPoiId = poi.id;
  assert.equal(engine.beginClearNest(), true);
  assert.ok(state.zombies.some((zombie) => zombie.type === "spitter"));
  assert.ok(state.zombies.some((zombie) => zombie.type === "armored"));
  defeatPoiDefendersWithPlayerCommands(state, engine, poi.id);
  for (let step = 0; step < 80 && state.activity; step += 1) engine.step(0.25);
  assert.equal(poi.nest.active, false);
  assert.equal(state.nestsCleared, 1);
  assert.ok(state.resources.intel > 1);
});

test("assaut de lieu — tir, mêlée et autofire restent disponibles sans contourner les défenseurs", () => {
  const { state, engine } = createEngine(10_701);
  const poi = state.pois.find((item) => !item.nest?.active && !item.looted);
  assert.ok(poi);
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  state.selectedPoiId = poi.id;
  state.resources.ammo = 999;
  state.player.health = state.player.maxHealth = 1_000_000;
  state.timers.ambientSpawn = 1_000_000;
  state.timers.nestSpawn = 1_000_000;

  const meleeTarget = weakZombie(destinationPoint(poi.pos, 0, 2));
  state.zombies.push(meleeTarget);
  assert.equal(engine.beginScavenge(), true);
  assert.equal(state.activity.blocked, true);
  assert.equal(engine.melee(), true, "la mêlée doit rester autorisée pendant une fouille");
  assert.equal(meleeTarget.dead, true);

  const ammoBeforeManualShot = state.resources.ammo;
  assert.equal(engine.fire(), true, "le tir manuel doit rester autorisé pendant une fouille");
  assert.equal(state.resources.ammo, ammoBeforeManualShot - 1);
  const elapsedWhileDefended = state.activity.elapsed;
  engine.step(0.25);
  assert.equal(state.activity.elapsed, elapsedWhileDefended, "la fouille doit rester suspendue tant qu’un défenseur associé vit");

  assert.equal(engine.toggleAutoFire(), true);
  const ammoBeforeAutoFire = state.resources.ammo;
  for (let step = 0; step < 8 && state.resources.ammo === ammoBeforeAutoFire; step += 1) {
    engine.step(0.25);
  }
  assert.ok(state.resources.ammo < ammoBeforeAutoFire, "l’autofire doit engager les défenseurs pendant l’activité");
  assert.equal(engine.toggleAutoFire(), true);
  defeatPoiDefendersWithPlayerCommands(state, engine, poi.id);
  const unrelated = weakZombie(destinationPoint(poi.pos, 0, 2));
  state.zombies.push(unrelated);
  for (let step = 0; step < 80 && state.activity; step += 1) engine.step(0.25);
  assert.equal(poi.looted, true, "la fouille doit reprendre dès que ses propres défenseurs sont éliminés");
  assert.equal(unrelated.dead, false, "un infecté non associé ne doit pas bloquer la fouille");
});

test("assaut de nid — annuler puis reprendre ne duplique pas les défenseurs associés", () => {
  const { state, engine } = createEngine(10_702);
  const poi = state.pois.find((item) => item.nest?.active);
  assert.ok(poi);
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  state.selectedPoiId = poi.id;
  assert.equal(engine.beginClearNest(), true);
  const firstDefenderIds = state.zombies
    .filter((zombie) => zombie.defenderPoiId === poi.id)
    .map((zombie) => zombie.id)
    .sort();
  assert.ok(firstDefenderIds.length > 0);
  assert.equal(engine.cancelActivity(), true);
  assert.equal(engine.beginClearNest(), true);
  assert.deepEqual(
    state.zombies
      .filter((zombie) => zombie.defenderPoiId === poi.id)
      .map((zombie) => zombie.id)
      .sort(),
    firstDefenderIds
  );

  defeatPoiDefendersWithPlayerCommands(state, engine, poi.id);
  const unrelated = weakZombie(destinationPoint(poi.pos, 0, 2));
  state.zombies.push(unrelated);
  for (let step = 0; step < 80 && state.activity; step += 1) engine.step(0.25);
  assert.equal(poi.nest.active, false, "un infecté non associé ne doit pas bloquer la destruction du nid");
  assert.equal(unrelated.dead, false);
});

test("mise à jour majeure 8 — les avant-postes étendent le réseau et produisent des ressources", () => {
  const { state, engine } = createEngine(108);
  fillResources(state);
  const poi = state.pois
    .filter((item) => !item.nest?.active && !item.campaignSignalPart && !item.vehicleWreck)
    .sort((a, b) => distanceMeters(state.base.pos, b.pos) - distanceMeters(state.base.pos, a.pos))[0];
  assert.ok(poi);
  poi.looted = true;
  state.player.pos = { ...poi.pos };
  state.player.atBase = false;
  state.selectedPoiId = poi.id;
  assert.equal(engine.claimOutpost(poi.id), true);
  assert.equal(poi.outpost, true);

  const before = { ...state.resources };
  engine.produceOutpostResources(2);
  assert.ok(Object.keys(state.resources).some((id) => state.resources[id] > before[id]));

  const outward = bearingRadians(state.base.pos, poi.pos);
  const target = destinationPoint(poi.pos, outward, 620);
  assert.ok(distanceMeters(state.base.pos, target) > 1450, "le test doit sortir de la portée de base");
  assert.ok(distanceMeters(poi.pos, target) < 650, "le test doit rester couvert par l’avant-poste");
  assert.equal(engine.moveTo(target), true);
});

test("mise à jour majeure 9 — le fourgon est réparable, rapide, consommateur et protecteur", () => {
  const { state, engine } = createEngine(109);
  fillResources(state);
  state.vehicle.discovered = true;
  state.research.unlocked.push("mechanics");
  assert.equal(engine.repairVehicle(), true);
  assert.equal(state.vehicle.condition, 100);
  const fuelBefore = state.resources.fuel;
  assert.equal(engine.toggleVehicle(), true);
  state.player.target = destinationPoint(state.player.pos, Math.PI / 2, 100);
  engine.updateMovement(1);
  assert.ok(state.distanceTravelled >= 15.9);
  assert.ok(state.resources.fuel < fuelBefore);
  assert.ok(state.vehicle.condition < 100);

  state.player.health = 100;
  const conditionBeforeHit = state.vehicle.condition;
  engine.random = () => 0.5;
  engine.damagePlayer(20, "walker");
  assert.ok(state.player.health > 85, "le blindage doit absorber plus de la moitié du choc");
  assert.ok(state.vehicle.condition < conditionBeforeHit);
});

test("fourgon — le stationnement persiste et démarrage/réparation exigent sa proximité", () => {
  const { state, engine } = createEngine(10_901);
  fillResources(state);
  state.vehicle.discovered = true;
  state.research.unlocked.push("mechanics");
  state.player.health = state.player.maxHealth = 1_000_000;
  state.timers.ambientSpawn = 1_000_000;
  state.timers.nestSpawn = 1_000_000;
  assert.equal(engine.repairVehicle(), true);
  assert.equal(state.vehicle.parkedAt, "base");
  assert.equal(engine.toggleVehicle(), true);

  const fieldStop = destinationPoint(state.base.pos, 0, 120);
  assert.equal(engine.moveTo(fieldStop), true);
  for (let step = 0; step < 80 && state.player.target; step += 1) engine.step(0.25);
  assert.equal(state.player.target, null);
  assert.equal(engine.toggleVehicle(), true);
  const parkedPosition = { ...state.vehicle.pos };
  assert.equal(state.vehicle.parkedAt, "field");
  assert.ok(distanceMeters(parkedPosition, fieldStop) < 0.1);

  assert.equal(engine.returnToBase(), true);
  for (let step = 0; step < 160 && state.player.target; step += 1) engine.step(0.25);
  assert.equal(state.player.target, null);
  assert.ok(distanceMeters(state.player.pos, state.vehicle.pos) > 48);
  state.inventory.repairKit = 1;
  assert.equal(engine.repairVehicleWithKit(), false);
  assert.equal(state.inventory.repairKit, 1);
  assert.equal(engine.toggleVehicle(), false, "le fourgon garé au loin ne doit pas se téléporter au joueur");
  assert.ok(distanceMeters(state.vehicle.pos, parkedPosition) < 0.1);

  assert.equal(engine.moveTo(parkedPosition), true);
  for (let step = 0; step < 160 && state.player.target; step += 1) engine.step(0.25);
  assert.equal(engine.repairVehicleWithKit(), true);
  assert.equal(state.inventory.repairKit, 0);
  assert.equal(engine.toggleVehicle(), true);
  state.resources.fuel = 0.001;
  assert.equal(engine.moveTo(destinationPoint(state.player.pos, Math.PI / 2, 100)), true);
  for (let step = 0; step < 4 && state.vehicle.active; step += 1) engine.step(0.25);
  assert.equal(state.vehicle.active, false);
  assert.ok(distanceMeters(state.vehicle.pos, state.player.pos) < 0.1);
  assert.equal(state.vehicle.parkedAt, "field");
});

test("communauté — blessure ou moral effondré désactive le rôle, et les soins continuent sans le joueur", () => {
  const roleState = createEngine(10_902);
  const guard = roleState.state.base.roster.find((survivor) => survivor.role === "guard");
  assert.ok(guard);
  assert.equal(roleState.engine.roleCount("guard"), 1);
  guard.morale = 20;
  assert.equal(roleState.engine.roleCount("guard"), 0);
  guard.morale = 100;
  guard.injured = true;
  assert.equal(roleState.engine.roleCount("guard"), 0);
  guard.injured = false;
  guard.health = 20;
  assert.equal(roleState.engine.roleCount("guard"), 0);

  for (const treatment of ["infirmary", "medic"]) {
    const { state, engine } = createEngine(treatment === "infirmary" ? 10_903 : 10_904);
    state.totalMinutes = 10 * 60;
    state.player.pos = destinationPoint(state.base.pos, 0, 200);
    state.player.atBase = false;
    state.player.health = state.player.maxHealth = 1_000_000;
    state.timers.ambientSpawn = 1_000_000;
    state.timers.nestSpawn = 1_000_000;
    for (const survivor of state.base.roster) survivor.role = "idle";
    if (treatment === "infirmary") {
      state.base.structures.infirmary = 1;
    } else {
      state.base.roster[0].role = "medic";
    }
    const patient = state.base.roster[1];
    patient.injured = true;
    patient.health = 94;
    for (let step = 0; step < 220 && patient.injured; step += 1) engine.step(0.25);
    assert.equal(patient.injured, false, `${treatment} doit soigner le roster même si le joueur est absent`);
    assert.ok(patient.health >= 95);
    assert.equal(state.player.atBase, false);
  }
});

test("mise à jour majeure 10 — la campagne d’évacuation mène à une victoire jouable", () => {
  const { state, engine } = createEngine(110);
  fillResources(state);
  state.campaign.signalParts = state.campaign.requiredSignalParts;
  state.base.structures.radio = 2;
  state.research.unlocked.push("radioNetwork", "triage", "virology", "evacuationProtocol");
  assert.equal(engine.buildEvacuationBeacon(), true);
  assert.equal(state.campaign.beaconBuilt, true);
  assert.equal(engine.callEvacuation(), true);
  assert.equal(state.wave.active, true);
  assert.equal(state.wave.final, true);
  assert.equal(state.campaign.finalSiegeStarted, true);

  state.wave.queued = 0;
  state.zombies = [];
  engine.updateZombies(0);
  assert.equal(state.status, "victory");
  assert.equal(state.paused, true);
  assert.equal(state.campaign.finalSiegeDefeated, true);
});
