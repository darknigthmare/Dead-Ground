import { drawGameOverlay, drawSelectionOverlay } from "../renderer.js";
import {
  latLngFromLocalMeters,
  localMeters
} from "../geo.js";
import { stableNoise } from "../rng.js";

export class FallbackMapAdapter {
  constructor({ container, center, onClick, onStatus, seed = 1337 }) {
    this.container = container;
    this.origin = { ...center };
    this.center = { ...center };
    this.selection = { ...center };
    this.snapshot = null;
    this.mode = "select";
    this.onClick = onClick ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.seed = seed >>> 0;
    this.pixelsPerMeter = 1.05;
    this.dragging = false;
    this.dragMoved = false;
    this.pointerStart = null;
    this.centerStart = null;
    this.destroyed = false;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "map-surface fallback-map-surface";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "Carte procédurale de secours");
    this.container.replaceChildren(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this.boundPointerDown = (event) => this.pointerDown(event);
    this.boundPointerMove = (event) => this.pointerMove(event);
    this.boundPointerUp = (event) => this.pointerUp(event);
    this.boundWheel = (event) => this.wheel(event);
    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointercancel", this.boundPointerUp);
    this.canvas.addEventListener("wheel", this.boundWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.onStatus({ provider: "fallback", ready: true, label: "Terrain de secours procédural" });

    const animate = () => {
      if (this.destroyed) return;
      this.render();
      this.frameHandle = requestAnimationFrame(animate);
    };
    this.frameHandle = requestAnimationFrame(animate);
  }

  setMode(mode) {
    this.mode = mode;
  }

  setSelection(position) {
    this.selection = { ...position };
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
  }

  panTo(position, zoom) {
    this.center = { ...position };
    if (Number.isFinite(zoom)) {
      this.pixelsPerMeter = Math.max(0.45, Math.min(2.4, (zoom - 14) * 0.34));
    }
  }

  getCenter() {
    return { ...this.center };
  }

  async geocode() {
    throw new Error("La recherche d’adresse nécessite Google Maps.");
  }

  async searchNearbyPois() {
    return [];
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  project(position) {
    const local = localMeters(this.center, position);
    return {
      x: this.width / 2 + local.x * this.pixelsPerMeter,
      y: this.height / 2 - local.y * this.pixelsPerMeter
    };
  }

  unproject(x, y) {
    const localX = (x - this.width / 2) / this.pixelsPerMeter;
    const localY = -(y - this.height / 2) / this.pixelsPerMeter;
    return latLngFromLocalMeters(this.center, localX, localY);
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawProceduralTerrain();
    if (this.mode === "select") {
      drawSelectionOverlay(this.ctx, (position) => this.project(position), this.selection, {
        width: this.width,
        height: this.height
      });
    } else {
      drawGameOverlay(
        this.ctx,
        (position) => this.project(position),
        this.snapshot,
        { width: this.width, height: this.height },
        { zoom: 17 + this.pixelsPerMeter }
      );
    }
  }

  drawProceduralTerrain() {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#273226";
    ctx.fillRect(0, 0, width, height);

    const centerFromOrigin = localMeters(this.origin, this.center);
    const halfWorldX = width / (2 * this.pixelsPerMeter);
    const halfWorldY = height / (2 * this.pixelsPerMeter);
    const cellSize = 150;
    const minCellX = Math.floor((centerFromOrigin.x - halfWorldX) / cellSize) - 1;
    const maxCellX = Math.ceil((centerFromOrigin.x + halfWorldX) / cellSize) + 1;
    const minCellY = Math.floor((centerFromOrigin.y - halfWorldY) / cellSize) - 1;
    const maxCellY = Math.ceil((centerFromOrigin.y + halfWorldY) / cellSize) + 1;

    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const noise = stableNoise(cellX, cellY, this.seed);
        const x = width / 2 + (cellX * cellSize - centerFromOrigin.x) * this.pixelsPerMeter;
        const y = height / 2 - ((cellY + 1) * cellSize - centerFromOrigin.y) * this.pixelsPerMeter;
        const sizePx = cellSize * this.pixelsPerMeter + 1;
        const green = Math.round(37 + noise * 24);
        const red = Math.round(33 + noise * 18);
        const blue = Math.round(27 + noise * 12);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(x, y, sizePx, sizePx);

        if (noise > 0.54) this.drawCellBuildings(ctx, cellX, cellY, x, y, sizePx, noise);
      }
    }

    this.drawRoads(ctx, centerFromOrigin);
    this.drawVignette(ctx, width, height);
  }

  drawCellBuildings(ctx, cellX, cellY, x, y, sizePx, noise) {
    const count = 2 + Math.floor(noise * 5);
    for (let index = 0; index < count; index += 1) {
      const n1 = stableNoise(cellX * 11 + index, cellY * 17 - index, this.seed ^ 0x55aa);
      const n2 = stableNoise(cellX * 23 - index, cellY * 7 + index, this.seed ^ 0xaa55);
      const bx = x + (0.1 + n1 * 0.76) * sizePx;
      const by = y + (0.12 + n2 * 0.72) * sizePx;
      const bw = Math.max(4, (10 + n2 * 20) * this.pixelsPerMeter);
      const bh = Math.max(4, (8 + n1 * 18) * this.pixelsPerMeter);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate((n1 - 0.5) * 0.35);
      ctx.fillStyle = noise > 0.78 ? "rgba(127,119,100,.58)" : "rgba(92,92,78,.55)";
      ctx.strokeStyle = "rgba(18,21,17,.62)";
      ctx.lineWidth = 1;
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.restore();
    }
  }

  drawRoads(ctx, centerFromOrigin) {
    const width = this.width;
    const height = this.height;
    const p = this.pixelsPerMeter;
    const worldToScreen = (x, y) => ({
      x: width / 2 + (x - centerFromOrigin.x) * p,
      y: height / 2 - (y - centerFromOrigin.y) * p
    });

    const roads = [
      { a: [-2200, -260], b: [2200, 440], width: 18 },
      { a: [-480, -2200], b: [190, 2200], width: 13 },
      { a: [-2200, 760], b: [2200, 920], width: 9 },
      { a: [-1500, -1250], b: [1450, 1550], width: 8 }
    ];

    for (const road of roads) {
      const a = worldToScreen(road.a[0], road.a[1]);
      const b = worldToScreen(road.b[0], road.b[1]);
      ctx.strokeStyle = "rgba(18,20,18,.72)";
      ctx.lineWidth = road.width * p + 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(88,91,84,.88)";
      ctx.lineWidth = road.width * p;
      ctx.stroke();
      ctx.strokeStyle = "rgba(184,174,121,.45)";
      ctx.lineWidth = Math.max(1, p);
      ctx.setLineDash([12 * p, 10 * p]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  drawVignette(ctx, width, height) {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.18,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,.42)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  pointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.dragging = true;
    this.dragMoved = false;
    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.centerStart = { ...this.center };
  }

  pointerMove(event) {
    if (!this.dragging || !this.pointerStart || !this.centerStart) return;
    const dx = event.clientX - this.pointerStart.x;
    const dy = event.clientY - this.pointerStart.y;
    if (Math.hypot(dx, dy) > 4) this.dragMoved = true;
    const east = -dx / this.pixelsPerMeter;
    const north = dy / this.pixelsPerMeter;
    this.center = latLngFromLocalMeters(this.centerStart, east, north);
  }

  pointerUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {}
    if (!this.dragMoved) {
      const rect = this.canvas.getBoundingClientRect();
      this.onClick(this.unproject(event.clientX - rect.left, event.clientY - rect.top));
    }
  }

  wheel(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const before = this.unproject(x, y);
    const factor = Math.exp(-event.deltaY * 0.0012);
    this.pixelsPerMeter = Math.max(0.38, Math.min(2.8, this.pixelsPerMeter * factor));
    const after = this.unproject(x, y);
    const delta = localMeters(after, before);
    this.center = latLngFromLocalMeters(this.center, delta.x, delta.y);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundPointerUp);
    this.canvas.removeEventListener("wheel", this.boundWheel);
    this.container.replaceChildren();
  }
}
