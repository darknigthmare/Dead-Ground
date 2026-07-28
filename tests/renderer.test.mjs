import test from "node:test";
import assert from "node:assert/strict";

import { drawGameOverlay, drawSelectionOverlay } from "../src/renderer.js";
import { FallbackMapAdapter } from "../src/maps/fallback-map.js";
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
