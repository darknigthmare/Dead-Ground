import test from "node:test";
import assert from "node:assert/strict";

import { drawGameOverlay, drawSelectionOverlay } from "../src/renderer.js";
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
    createLinearGradient: () => gradient
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

test("le repère de sélection de départ se dessine sans dépendance navigateur", () => {
  const origin = { lat: 43.2965, lng: 5.3698 };
  const { ctx, calls } = createCanvasContextSpy();
  assert.doesNotThrow(() => drawSelectionOverlay(ctx, projectAround(origin), origin, { width: 1000, height: 720 }));
  assert.ok(calls.some(([name]) => name === "arc"));
  assert.ok(calls.some(([name]) => name === "stroke"));
});
