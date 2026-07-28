import { POI_TYPES, ZOMBIE_TYPES } from "./constants.js";
import { distanceMeters, offsetMeters } from "./geo.js";

const COLORS = Object.freeze({
  player: "#d8ff7a",
  playerInner: "#10170f",
  base: "#74f59d",
  wall: "#a8d76b",
  danger: "#ff4b55",
  dangerDark: "#661a21",
  selected: "#ffcf5a",
  poi: "#dbe8d8",
  looted: "#718078",
  tracer: "#ffe9a4",
  hit: "#ff6670",
  nest: "#ff635f",
  outpost: "#73f2aa",
  mission: "#72cfff",
  signal: "#ffd45d",
  vehicle: "#f3b968",
  poison: "#84ff75",
  armored: "#9ba6a5",
  alpha: "#ff3868",
  shadow: "rgba(0, 0, 0, .72)"
});

export function drawGameOverlay(ctx, project, state, viewport, options = {}) {
  const width = viewport.width;
  const height = viewport.height;
  if (options.clear !== false) ctx.clearRect(0, 0, width, height);
  if (!state) return;

  const visible = (point, padding = 70) =>
    point && point.x >= -padding && point.y >= -padding && point.x <= width + padding && point.y <= height + padding;

  drawWeatherBackdrop(ctx, state, viewport);
  drawBase(ctx, project, state, visible);
  drawTravelPath(ctx, project, state);
  drawPois(ctx, project, state, visible, options);
  drawVehicle(ctx, project, state, visible);
  drawZombies(ctx, project, state, visible);
  drawEffects(ctx, project, state, visible);
  drawPlayer(ctx, project, state, visible);
  drawWeatherForeground(ctx, state, viewport);
}

export function drawSelectionOverlay(ctx, project, position, viewport, options = {}) {
  if (options.clear !== false) ctx.clearRect(0, 0, viewport.width, viewport.height);
  if (!position) return;
  const point = project(position);
  if (!point) return;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.strokeStyle = COLORS.selected;
  ctx.fillStyle = "rgba(255, 207, 90, .16)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(-46, 0);
  ctx.lineTo(-12, 0);
  ctx.moveTo(12, 0);
  ctx.lineTo(46, 0);
  ctx.moveTo(0, -46);
  ctx.lineTo(0, -12);
  ctx.moveTo(0, 12);
  ctx.lineTo(0, 46);
  ctx.stroke();
  ctx.fillStyle = COLORS.selected;
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBase(ctx, project, state, visible) {
  const center = project(state.base.pos);
  if (!center || !visible(center, 220)) return;
  const east = project(offsetMeters(state.base.pos, state.base.radius, 0));
  const radius = east ? Math.max(12, Math.hypot(east.x - center.x, east.y - center.y)) : 45;

  ctx.save();
  ctx.translate(center.x, center.y);
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius * 1.5);
  gradient.addColorStop(0, state.base.generatorOnline ? "rgba(214,255,129,.24)" : "rgba(98,220,130,.18)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = state.wave.active ? COLORS.danger : COLORS.base;
  ctx.lineWidth = 2.5;
  ctx.setLineDash(state.base.wallMaxHealth > 0 ? [] : [8, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (state.base.wallMaxHealth > 0) {
    const healthRatio = Math.max(0, state.base.wallHealth / state.base.wallMaxHealth);
    ctx.strokeStyle = "rgba(0,0,0,.72)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 5, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = healthRatio < 0.25 ? COLORS.danger : COLORS.wall;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthRatio);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(10, 20, 13, .9)";
  ctx.strokeStyle = COLORS.base;
  ctx.lineWidth = 2;
  polygon(ctx, 0, 0, 14, 6, Math.PI / 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.base;
  ctx.font = "bold 14px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", 0, 0);

  if (state.wave.active) {
    const pulse = 1 + Math.sin(performanceNow() * 0.006) * 0.08;
    ctx.strokeStyle = "rgba(255,75,85,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.28 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTravelPath(ctx, project, state) {
  const target = state.player.target;
  if (!target) return;
  const start = project(state.player.pos);
  const end = project(target);
  if (!start || !end) return;
  ctx.save();
  ctx.strokeStyle = "rgba(216,255,122,.72)";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPois(ctx, project, state, visible, options) {
  const zoom = options.zoom ?? 17;
  for (const poi of state.pois) {
    if (!poi.discovered) continue;
    const point = project(poi.pos);
    if (!point || !visible(point)) continue;
    const config = POI_TYPES[poi.type] ?? POI_TYPES.house;
    const selected = poi.id === state.selectedPoiId;
    const radius = selected ? 16 : 12;
    const hasNest = Boolean(poi.nest?.active);
    const hasSignal = Boolean(poi.campaignSignalPart && !poi.signalPartCollected);

    ctx.save();
    ctx.translate(point.x, point.y);

    if (poi.outpost) {
      const safePulse = 25 + Math.sin(performanceNow() * 0.002 + point.x) * 3;
      ctx.fillStyle = "rgba(116,245,157,.06)";
      ctx.strokeStyle = "rgba(116,245,157,.42)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, safePulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (hasNest) {
      const pulse = 1 + Math.sin(performanceNow() * 0.006 + point.y) * 0.13;
      ctx.strokeStyle = "rgba(255,75,85,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, (radius + 7) * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (hasSignal || poi.missionMarker) {
      ctx.strokeStyle = hasSignal ? "rgba(255,207,90,.75)" : "rgba(108,167,255,.75)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 5 + Math.sin(performanceNow() * 0.004) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (selected) {
      ctx.strokeStyle = COLORS.selected;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.shadowColor = COLORS.shadow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = poi.outpost
      ? "rgba(11,46,24,.94)"
      : hasNest
        ? "rgba(75,12,20,.94)"
        : poi.looted
          ? "rgba(35,44,40,.86)"
          : "rgba(15,24,18,.92)";
    ctx.strokeStyle = poi.outpost
      ? COLORS.base
      : hasNest
        ? COLORS.danger
        : poi.looted
          ? COLORS.looted
          : selected
            ? COLORS.selected
            : hasSignal
              ? COLORS.selected
              : COLORS.poi;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = poi.outpost ? COLORS.base : hasNest ? "#ff9aa1" : poi.looted ? COLORS.looted : selected || hasSignal ? COLORS.selected : COLORS.poi;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const icon = poi.outpost ? "⌂" : hasNest ? "⌬" : poi.vehicleWreck && !state.vehicle.discovered ? "▰" : poi.looted ? "✓" : config.icon;
    ctx.fillText(icon, 0, 0);

    if (selected || zoom >= 18.2) {
      const text = poi.outpost ? "Avant-poste" : hasNest ? `Nid infecté ${poi.nest.strength}` : poi.looted ? "Fouillé" : config.label;
      ctx.font = "600 11px system-ui, sans-serif";
      const metrics = ctx.measureText(text);
      const boxWidth = metrics.width + 12;
      ctx.fillStyle = "rgba(5,9,7,.86)";
      roundRect(ctx, -boxWidth / 2, radius + 7, boxWidth, 20, 5);
      ctx.fill();
      ctx.fillStyle = hasNest ? "#ff9aa1" : selected ? COLORS.selected : "#f0f5eb";
      ctx.fillText(text, 0, radius + 17);
    }
    ctx.restore();
  }
}

function drawZombies(ctx, project, state, visible) {
  const typeColors = {
    walker: "#c5303b",
    runner: "#e14a3b",
    brute: "#db6c48",
    screamer: "#b13ac6",
    spitter: "#70bd4d",
    armored: "#757c83",
    alpha: "#ff223d"
  };
  for (const zombie of state.zombies) {
    if (zombie.dead) continue;
    const point = project(zombie.pos);
    if (!point || !visible(point)) continue;
    const config = ZOMBIE_TYPES[zombie.type] ?? ZOMBIE_TYPES.walker;
    const size = config.radius;
    const hurt = zombie.health < zombie.maxHealth;

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(zombie.heading || 0);
    ctx.shadowColor = config.boss ? "rgba(255,34,61,.9)" : "rgba(0,0,0,.8)";
    ctx.shadowBlur = config.boss ? 18 : 7;
    ctx.fillStyle = zombie.wave && zombie.type === "walker" ? "#ff3948" : typeColors[zombie.type] ?? "#c5303b";
    ctx.strokeStyle = config.boss ? "#ffcf5a" : "#320a0e";
    ctx.lineWidth = config.boss ? 2.4 : 1.5;

    if (zombie.type === "runner") {
      ctx.beginPath();
      ctx.moveTo(0, -size - 3);
      ctx.lineTo(size, size + 3);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, size + 3);
      ctx.closePath();
    } else if (zombie.type === "brute" || zombie.type === "armored") {
      polygon(ctx, 0, 0, size + 2, zombie.type === "armored" ? 8 : 6, Math.PI / 6);
    } else if (zombie.type === "screamer") {
      polygon(ctx, 0, 0, size + 1, 4, Math.PI / 4);
    } else if (zombie.type === "spitter") {
      polygon(ctx, 0, 0, size + 1, 5, -Math.PI / 2);
    } else if (zombie.type === "alpha") {
      polygon(ctx, 0, 0, size + 2, 7, -Math.PI / 2);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (zombie.type === "armored") {
      ctx.strokeStyle = "rgba(225,235,239,.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-size * .65, -size * .2);
      ctx.lineTo(size * .65, -size * .2);
      ctx.stroke();
    }

    ctx.fillStyle = zombie.type === "spitter" ? "#d6ff9b" : "#f7e7c5";
    ctx.beginPath();
    ctx.arc(-2, -1, 1.1, 0, Math.PI * 2);
    ctx.arc(2, -1, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (hurt || ["brute", "armored", "alpha"].includes(zombie.type)) {
      const ratio = Math.max(0, zombie.health / zombie.maxHealth);
      const barWidth = config.boss ? 36 : 22;
      ctx.fillStyle = "rgba(0,0,0,.78)";
      ctx.fillRect(point.x - barWidth / 2, point.y - size - 11, barWidth, 4);
      ctx.fillStyle = ratio < 0.3 ? "#ff4b55" : config.boss ? "#ffcf5a" : "#d9ef79";
      ctx.fillRect(point.x - barWidth / 2, point.y - size - 11, barWidth * ratio, 4);
    }
  }
}

function drawVehicle(ctx, project, state, visible) {
  if (!state.vehicle?.repaired || state.vehicle.active) return;
  const parkedPosition = state.vehicle.pos;
  if (!parkedPosition) return;
  const point = project(parkedPosition);
  if (!point || !visible(point, 40)) return;

  const conditionRatio = Math.max(0, Math.min(1, state.vehicle.condition / Math.max(1, state.vehicle.maxCondition)));
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-0.32);
  ctx.shadowColor = "rgba(0,0,0,.8)";
  ctx.shadowBlur = 9;
  ctx.fillStyle = conditionRatio <= 0 ? "#4b5457" : COLORS.vehicle;
  ctx.strokeStyle = conditionRatio < 0.25 ? COLORS.danger : "rgba(27,18,8,.92)";
  ctx.lineWidth = 1.8;
  roundRect(ctx, -7, -12, 14, 24, 4);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(20,30,34,.84)";
  roundRect(ctx, -4.8, -8.5, 9.6, 6.5, 1.8);
  ctx.fill();
  ctx.fillStyle = "rgba(245,231,190,.85)";
  ctx.fillRect(-4.5, 4.5, 9, 3.2);
  ctx.fillStyle = "#15191b";
  ctx.fillRect(-9, -8, 2.5, 6);
  ctx.fillRect(6.5, -8, 2.5, 6);
  ctx.fillRect(-9, 3, 2.5, 6);
  ctx.fillRect(6.5, 3, 2.5, 6);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.78)";
  ctx.fillRect(point.x - 12, point.y + 16, 24, 4);
  ctx.fillStyle = conditionRatio < 0.25 ? COLORS.danger : COLORS.vehicle;
  ctx.fillRect(point.x - 12, point.y + 16, 24 * conditionRatio, 4);
  ctx.restore();
}

function drawPlayer(ctx, project, state, visible) {
  const point = project(state.player.pos);
  if (!point || !visible(point)) return;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(state.player.heading || 0);
  ctx.shadowColor = state.vehicle.active ? "rgba(108,167,255,.9)" : "rgba(216,255,122,.8)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = state.vehicle.active ? "#80b5ff" : COLORS.player;
  ctx.strokeStyle = "rgba(0,0,0,.9)";
  ctx.lineWidth = 2;
  if (state.vehicle.active) {
    roundRect(ctx, -10, -15, 20, 30, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(8,20,35,.8)";
    ctx.fillRect(-7, -9, 14, 7);
    ctx.fillStyle = "#d7e8ff";
    ctx.fillRect(-12, -9, 3, 7);
    ctx.fillRect(9, -9, 3, 7);
    ctx.fillRect(-12, 5, 3, 7);
    ctx.fillRect(9, 5, 3, 7);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 6);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = COLORS.playerInner;
    ctx.beginPath();
    ctx.arc(0, 1, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (state.player.infection > 55) {
    ctx.strokeStyle = `rgba(212,51,74,${Math.min(.8, state.player.infection / 120)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 19 + Math.sin(performanceNow() * .005) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.player.invulnerability > 0) {
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 16 + state.player.invulnerability * 9, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEffects(ctx, project, state, visible) {
  for (const effect of state.effects) {
    const from = project(effect.from);
    const to = project(effect.to);
    if (!from || !to || (!visible(from) && !visible(to))) continue;
    const progress = 1 - effect.ttl / effect.maxTtl;
    const alpha = Math.max(0, effect.ttl / effect.maxTtl);
    ctx.save();
    ctx.globalAlpha = alpha;

    if (effect.type === "tracer") {
      ctx.strokeStyle = COLORS.tracer;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (effect.type === "melee") {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(from.x, from.y, 12 + progress * 14, -1.2, 1.2);
      ctx.stroke();
    } else if (effect.type === "spit") {
      ctx.strokeStyle = COLORS.poison;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      ctx.fillStyle = COLORS.poison;
      ctx.beginPath();
      ctx.arc(x, y, 4 + progress * 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect.type === "explosion") {
      const radius = 8 + progress * 34;
      ctx.fillStyle = `rgba(255,184,70,${Math.max(0, .28 - progress * .2)})`;
      ctx.strokeStyle = progress < .45 ? "#fff2aa" : "#ff8757";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = (ray / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(to.x + Math.cos(angle) * radius * .45, to.y + Math.sin(angle) * radius * .45);
        ctx.lineTo(to.x + Math.cos(angle) * radius * 1.3, to.y + Math.sin(angle) * radius * 1.3);
        ctx.stroke();
      }
    } else if (["hit", "kill", "impact", "player-hit", "scream"].includes(effect.type)) {
      const baseRadius = effect.type === "scream" ? 18 : effect.type === "explosion" ? 12 : effect.type === "kill" ? 10 : 6;
      const growth = effect.type === "scream" ? 55 : effect.type === "explosion" ? 38 : 18;
      ctx.strokeStyle = effect.type === "player-hit" ? "#ffffff" : effect.type === "explosion" ? "#ffcf5a" : COLORS.hit;
      ctx.lineWidth = effect.type === "scream" || effect.type === "explosion" ? 3 : 2;
      ctx.beginPath();
      ctx.arc(to.x, to.y, baseRadius + progress * growth, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawWeatherBackdrop(ctx, state, viewport) {
  const type = state.weather?.type ?? "clear";
  if (type === "clear") return;
  ctx.save();
  if (type === "fog") {
    ctx.fillStyle = "rgba(205,220,216,.12)";
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  } else if (type === "heat") {
    ctx.fillStyle = "rgba(255,130,45,.07)";
    ctx.fillRect(0, 0, viewport.width, viewport.height);
  } else if (type === "storm") {
    const flash = Math.sin(performanceNow() * .0007) > .992 ? .16 : 0;
    if (flash > 0) {
      ctx.fillStyle = `rgba(220,235,255,${flash})`;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
    }
  }
  ctx.restore();
}

function drawWeatherForeground(ctx, state, viewport) {
  const type = state.weather?.type ?? "clear";
  if (!["rain", "storm", "fog"].includes(type)) return;
  const now = performanceNow();
  ctx.save();
  if (type === "fog") {
    ctx.globalAlpha = .12;
    for (let index = 0; index < 7; index += 1) {
      const y = ((index * 97 + now * .012) % (viewport.height + 160)) - 80;
      const gradient = ctx.createLinearGradient(0, y, viewport.width, y + 50);
      gradient.addColorStop(0, "rgba(220,230,227,0)");
      gradient.addColorStop(.5, "rgba(220,230,227,.55)");
      gradient.addColorStop(1, "rgba(220,230,227,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, viewport.width, 58);
    }
  } else {
    const count = type === "storm" ? 120 : 72;
    ctx.strokeStyle = type === "storm" ? "rgba(205,228,255,.42)" : "rgba(195,225,255,.3)";
    ctx.lineWidth = type === "storm" ? 1.4 : 1;
    for (let index = 0; index < count; index += 1) {
      const x = (index * 83 + now * .17) % (viewport.width + 160) - 80;
      const y = (index * 151 + now * (type === "storm" ? .42 : .28)) % (viewport.height + 100) - 50;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (type === "storm" ? 12 : 8), y + (type === "storm" ? 30 : 20));
      ctx.stroke();
    }
  }
  ctx.restore();
}

function polygon(ctx, x, y, radius, sides, rotation = 0) {
  ctx.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function performanceNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
