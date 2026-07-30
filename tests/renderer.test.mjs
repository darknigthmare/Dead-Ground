import test from "node:test";
import assert from "node:assert/strict";

import { drawGameOverlay, drawSelectionOverlay } from "../src/renderer.js";
import { FallbackMapAdapter } from "../src/maps/fallback-map.js";
import { installSpriteAtlasForTests, resetSpriteAtlasesForTests } from "../src/sprites.js";
import { createInitialState } from "../src/world.js";

function createCanvasContextSpy() {
  const calls = [];
  const gradient = { addColorStop: (...args) => calls.push(["addColorStop", ...args]) };
  const methods = {
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    beginPath: () => calls.push(["beginPath"]),
    closePath: () => calls.push(["closePath"]),
    arc: (...args) => calls.push(["arc", ...args]),
    arcTo: (...args) => calls.push(["arcTo", ...args]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    fill: () => calls.push(["fill"]),
    stroke: () => calls.push(["stroke"]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    strokeRect: (...args) => calls.push(["strokeRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    setLineDash: (...args) => calls.push(["setLineDash", ...args]),
    fillText: (...args) => calls.push(["fillText", ...args]),
    measureText: (text) => ({ width: String(text).length * 7 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    setTransform: (...args) => calls.push(["setTransform", ...args])
  };
  return { ctx: methods, calls };
}

function projectAround(origin) {
  return (point) => ({
    x: 500 + (point.lng - origin.lng) * 80_000,
    y: 360 - (point.lat - origin.lat) * 80_000
  });
}

test("le rendu complet accepte véhicule réparé, météo et infectés sans exception", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const state = createInitialState({ start: origin, difficultyId: "normal", realPois: [] });
  state.vehicle.discovered = true;
  state.vehicle.repaired = true;
  state.vehicle.condition = 76;
  state.weather.type = "rain";
  state.pois[0].discovered = true;
  state.zombies.push({
    id: "render-zombie",
    type: "spitter",
    pos: { ...origin },
    health: 20,
    maxHealth: 30,
    heading: 0,
    dead: false,
    wave: false
  });

  const { ctx, calls } = createCanvasContextSpy();
  assert.doesNotThrow(() => drawGameOverlay(ctx, projectAround(origin), state, { width: 1000, height: 720 }, { zoom: 18 }));
  assert.ok(calls.some(([name]) => name === "fillRect"), "le véhicule ou la météo doit produire des rectangles de rendu");
  assert.ok(calls.some(([name]) => name === "fillText"), "les repères de carte doivent être dessinés");
});

test("le fourgon garé est dessiné à vehicle.pos et non à une position fictive près de la base", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const state = createInitialState({ start: origin, difficultyId: "normal", seed: 8080 });
  state.vehicle.discovered = true;
  state.vehicle.repaired = true;
  state.vehicle.active = false;
  state.vehicle.condition = 65;
  state.vehicle.pos = { lat: origin.lat + 0.001, lng: origin.lng + 0.0015 };
  const project = projectAround(origin);
  const expected = project(state.vehicle.pos);
  const { ctx, calls } = createCanvasContextSpy();

  drawGameOverlay(ctx, project, state, { width: 1000, height: 720 }, { zoom: 18 });

  assert.ok(calls.some(
    ([name, x, y]) => name === "translate" && Math.abs(x - expected.x) < 0.01 && Math.abs(y - expected.y) < 0.01
  ));
});

test("le fourgon actif garde son cap de déplacement pendant une action de tir", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const state = createInitialState({ start: origin, difficultyId: "normal", seed: 9090 });
  const vehicleImage = { width: 576, height: 384 };
  state.vehicle.discovered = true;
  state.vehicle.repaired = true;
  state.vehicle.active = true;
  state.vehicle.condition = 100;
  state.vehicle.heading = 0.42;
  state.player.heading = 1.4;
  state.player.target = { lat: origin.lat + 0.001, lng: origin.lng };
  state.effects.push({
    id: "qa-player-fire",
    type: "actor-action",
    actorId: "player",
    animation: "fire",
    heading: 2.2,
    from: { ...origin },
    to: { ...origin },
    ttl: 0.2,
    maxTtl: 0.34
  });
  const { ctx, calls } = createCanvasContextSpy();
  installSpriteAtlasForTests("vehicle", vehicleImage);
  try {
    drawGameOverlay(ctx, projectAround(origin), state, { width: 1000, height: 720 }, { zoom: 18 });
    const drawIndex = calls.findIndex(([name, image]) => name === "drawImage" && image === vehicleImage);
    assert.ok(drawIndex > 0);
    assert.deepEqual(calls[drawIndex - 1], ["rotate", state.vehicle.heading]);
  } finally {
    resetSpriteAtlasesForTests();
  }
});

test("une mort dans le fourgon affiche le survivant tombé et non le véhicule actif", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const state = createInitialState({ start: origin, difficultyId: "normal", seed: 9191 });
  const playerImage = { width: 576, height: 4032 };
  const vehicleImage = { width: 576, height: 384 };
  state.vehicle.discovered = true;
  state.vehicle.repaired = true;
  state.vehicle.active = true;
  state.vehicle.condition = 95;
  state.player.health = 0;
  state.status = "gameover";
  state.effects.push({
    id: "qa-player-death",
    type: "actor-action",
    actorId: "player",
    animation: "death",
    heading: 0.7,
    from: { ...origin },
    to: { ...origin },
    ttl: 0.8,
    maxTtl: 1.2
  });
  const { ctx, calls } = createCanvasContextSpy();
  installSpriteAtlasForTests("player", playerImage);
  installSpriteAtlasForTests("vehicle", vehicleImage);
  try {
    drawGameOverlay(ctx, projectAround(origin), state, { width: 1000, height: 720 }, { zoom: 18 });
    assert.ok(calls.some(([name, image]) => name === "drawImage" && image === playerImage));
    assert.equal(calls.some(([name, image]) => name === "drawImage" && image === vehicleImage), false);
  } finally {
    resetSpriteAtlasesForTests();
  }
});

test("le repère de sélection de départ se dessine sans dépendance navigateur", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const { ctx, calls } = createCanvasContextSpy();
  assert.doesNotThrow(() => drawSelectionOverlay(ctx, projectAround(origin), origin, { width: 1000, height: 720 }));
  assert.ok(calls.some(([name]) => name === "arc"));
  assert.ok(calls.some(([name]) => name === "stroke"));
});

test("les overlays peuvent préserver un fond déjà dessiné avec clear:false", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const state = createInitialState({ start: origin, difficultyId: "normal", realPois: [] });
  const selectionSpy = createCanvasContextSpy();
  const gameSpy = createCanvasContextSpy();

  drawSelectionOverlay(
    selectionSpy.ctx,
    projectAround(origin),
    origin,
    { width: 390, height: 844 },
    { clear: false }
  );
  drawGameOverlay(
    gameSpy.ctx,
    projectAround(origin),
    state,
    { width: 390, height: 844 },
    { zoom: 18, clear: false }
  );

  assert.equal(selectionSpy.calls.some(([name]) => name === "clearRect"), false);
  assert.equal(gameSpy.calls.some(([name]) => name === "clearRect"), false);
});

test("la carte de secours compose le terrain avant un overlay non destructif", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const { ctx, calls } = createCanvasContextSpy();
  const adapter = Object.create(FallbackMapAdapter.prototype);
  adapter.ctx = ctx;
  adapter.width = 390;
  adapter.height = 844;
  adapter.dpr = 1;
  adapter.mode = "select";
  adapter.selection = origin;
  adapter.project = () => ({ x: 195, y: 422 });
  adapter.drawProceduralTerrain = () => calls.push(["terrain"]);

  adapter.render();

  assert.ok(calls.some(([name]) => name === "terrain"));
  assert.equal(calls.some(([name]) => name === "clearRect"), false);
  assert.ok(calls.findIndex(([name]) => name === "terrain") < calls.findIndex(([name]) => name === "arc"));
});
