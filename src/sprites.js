const SPRITE_ROOT = "./src/assets/sprites";

export const SPRITE_DIRECTIONS = Object.freeze(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

const actorClips = Object.freeze({
  idle: Object.freeze({ row: 0, frames: 4, fps: 4, loop: true }),
  move: Object.freeze({ row: 1, frames: 8, fps: 8, loop: true }),
  attack: Object.freeze({ row: 2, frames: 6, fps: 8, loop: false }),
  hurt: Object.freeze({ row: 3, frames: 4, fps: 14, loop: false }),
  death: Object.freeze({ row: 4, frames: 8, fps: 10, loop: false })
});

function infectedAtlas(id, displaySize, overrides = {}) {
  return Object.freeze({
    id,
    src: `${SPRITE_ROOT}/infected-${id}.png`,
    cell: 72,
    directions: 8,
    displaySize,
    anchorY: 0.52,
    clips: Object.freeze({
      ...actorClips,
      ...overrides
    })
  });
}

export const SPRITE_ATLASES = Object.freeze({
  player: Object.freeze({
    id: "player",
    src: `${SPRITE_ROOT}/player-survivor.png`,
    cell: 72,
    directions: 8,
    displaySize: 48,
    anchorY: 0.53,
    clips: Object.freeze({
      idle: Object.freeze({ row: 0, frames: 4, fps: 5, loop: true }),
      walk: Object.freeze({ row: 1, frames: 8, fps: 10, loop: true }),
      sprint: Object.freeze({ row: 2, frames: 8, fps: 14, loop: true }),
      fire: Object.freeze({ row: 3, frames: 6, fps: 18, loop: false }),
      melee: Object.freeze({ row: 4, frames: 8, fps: 14, loop: false }),
      hurt: Object.freeze({ row: 5, frames: 4, fps: 14, loop: false }),
      death: Object.freeze({ row: 6, frames: 8, fps: 10, loop: false })
    })
  }),
  walker: infectedAtlas("walker", 36),
  runner: infectedAtlas("runner", 34, {
    idle: Object.freeze({ row: 0, frames: 4, fps: 6, loop: true }),
    move: Object.freeze({ row: 1, frames: 8, fps: 14, loop: true }),
    attack: Object.freeze({ row: 2, frames: 6, fps: 12, loop: false }),
    hurt: Object.freeze({ row: 3, frames: 4, fps: 16, loop: false }),
    death: Object.freeze({ row: 4, frames: 8, fps: 12, loop: false })
  }),
  brute: infectedAtlas("brute", 48, {
    idle: Object.freeze({ row: 0, frames: 4, fps: 3, loop: true }),
    move: Object.freeze({ row: 1, frames: 8, fps: 6, loop: true }),
    attack: Object.freeze({ row: 2, frames: 8, fps: 8, loop: false }),
    hurt: Object.freeze({ row: 3, frames: 4, fps: 12, loop: false })
  }),
  screamer: infectedAtlas("screamer", 42, {
    move: Object.freeze({ row: 1, frames: 8, fps: 9, loop: true }),
    attack: Object.freeze({ row: 2, frames: 6, fps: 10, loop: false }),
    special: Object.freeze({ row: 5, frames: 8, fps: 14, loop: false })
  }),
  spitter: infectedAtlas("spitter", 42, {
    move: Object.freeze({ row: 1, frames: 8, fps: 7, loop: true }),
    attack: Object.freeze({ row: 2, frames: 6, fps: 9, loop: false }),
    special: Object.freeze({ row: 5, frames: 8, fps: 14, loop: false })
  }),
  armored: infectedAtlas("armored", 52, {
    idle: Object.freeze({ row: 0, frames: 4, fps: 3, loop: true }),
    move: Object.freeze({ row: 1, frames: 8, fps: 5, loop: true }),
    attack: Object.freeze({ row: 2, frames: 8, fps: 8, loop: false }),
    hurt: Object.freeze({ row: 3, frames: 5, fps: 12, loop: false }),
    death: Object.freeze({ row: 4, frames: 8, fps: 9, loop: false })
  }),
  alpha: infectedAtlas("alpha", 66, {
    idle: Object.freeze({ row: 0, frames: 6, fps: 4, loop: true }),
    move: Object.freeze({ row: 1, frames: 8, fps: 7, loop: true }),
    attack: Object.freeze({ row: 2, frames: 8, fps: 10, loop: false }),
    hurt: Object.freeze({ row: 3, frames: 5, fps: 14, loop: false }),
    death: Object.freeze({ row: 4, frames: 12, fps: 10, loop: false })
  }),
  vehicle: Object.freeze({
    id: "vehicle",
    src: `${SPRITE_ROOT}/vehicle-expedition.png`,
    cell: 96,
    directions: 1,
    displaySize: 62,
    anchorY: 0.5,
    clips: Object.freeze({
      parked: Object.freeze({ row: 0, frames: 1, fps: 1, loop: false }),
      idle: Object.freeze({ row: 1, frames: 4, fps: 6, loop: true }),
      drive: Object.freeze({ row: 2, frames: 6, fps: 12, loop: true }),
      disabled: Object.freeze({ row: 3, frames: 1, fps: 1, loop: false })
    })
  })
});

export const SPRITE_ASSET_PATHS = Object.freeze(
  Object.values(SPRITE_ATLASES).map((atlas) => atlas.src)
);

const imageRecords = new Map();

function startImageLoad(atlas) {
  const existing = imageRecords.get(atlas.id);
  if (existing) return existing.promise;
  if (typeof Image === "undefined") return Promise.resolve(null);

  const image = new Image();
  image.decoding = "async";
  const record = { image, ready: false, failed: false, promise: null };
  record.promise = new Promise((resolve) => {
    image.addEventListener("load", () => {
      record.ready = true;
      resolve(image);
    }, { once: true });
    image.addEventListener("error", () => {
      record.failed = true;
      resolve(null);
    }, { once: true });
  });
  imageRecords.set(atlas.id, record);
  image.src = atlas.src;
  return record.promise;
}

export function preloadSpriteAtlases() {
  return Promise.all(Object.values(SPRITE_ATLASES).map(startImageLoad));
}

export function spriteAtlasStatus() {
  const records = Object.values(SPRITE_ATLASES).map((atlas) => {
    const record = imageRecords.get(atlas.id);
    return {
      id: atlas.id,
      src: atlas.src,
      ready: record?.ready === true,
      failed: record?.failed === true
    };
  });
  return {
    total: records.length,
    ready: records.filter((item) => item.ready).length,
    failed: records.filter((item) => item.failed).length,
    records
  };
}

export function installSpriteAtlasForTests(id, image) {
  imageRecords.set(id, {
    image,
    ready: true,
    failed: false,
    promise: Promise.resolve(image)
  });
}

export function resetSpriteAtlasesForTests() {
  imageRecords.clear();
}

export function directionIndexForHeading(heading) {
  const fullTurn = Math.PI * 2;
  const normalized = ((Number(heading) || 0) % fullTurn + fullTurn) % fullTurn;
  return Math.round(normalized / (Math.PI / 4)) % 8;
}

export function stableAnimationOffset(id) {
  const text = String(id ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function spriteScaleForZoom(zoom) {
  const normalized = Number(zoom ?? 17);
  return Math.max(0.72, Math.min(1.12, 0.88 + (normalized - 17) * 0.08));
}

export function frameIndexForClip(clip, nowMs, options = {}) {
  if (!clip || clip.frames <= 1) return 0;
  if (options.reducedMotion) return clip.loop ? 0 : clip.frames - 1;
  if (Number.isFinite(options.progress)) {
    const progress = Math.max(0, Math.min(0.999999, options.progress));
    return Math.min(clip.frames - 1, Math.floor(progress * clip.frames));
  }
  if (!clip.loop) return clip.frames - 1;
  const offset = Number(options.offset) || 0;
  return Math.floor((nowMs / 1000 + offset) * clip.fps) % clip.frames;
}

export function drawSpriteFrame(ctx, atlasId, clipId, heading, nowMs, options = {}) {
  const atlas = SPRITE_ATLASES[atlasId];
  const clip = atlas?.clips?.[clipId];
  const record = atlas ? imageRecords.get(atlas.id) : null;
  if (!atlas || !clip || !record?.ready || !record.image || typeof ctx.drawImage !== "function") return false;

  const direction = atlas.directions === 1 ? 0 : directionIndexForHeading(heading);
  const clipCount = Object.keys(atlas.clips).length;
  const row = direction * clipCount + clip.row;
  const frame = frameIndexForClip(clip, nowMs, options);
  const displaySize = options.displaySize ?? atlas.displaySize;
  const anchorY = options.anchorY ?? atlas.anchorY;

  ctx.save();
  if (Number.isFinite(options.alpha)) ctx.globalAlpha = (Number(ctx.globalAlpha) || 1) * options.alpha;
  if (options.tint) {
    ctx.shadowColor = options.tint;
    ctx.shadowBlur = options.shadowBlur ?? 8;
  }
  ctx.imageSmoothingEnabled = true;
  if (atlas.directions === 1 && Number.isFinite(heading)) ctx.rotate(heading);
  try {
    ctx.drawImage(
      record.image,
      frame * atlas.cell,
      row * atlas.cell,
      atlas.cell,
      atlas.cell,
      -displaySize / 2,
      -displaySize * anchorY,
      displaySize,
      displaySize
    );
  } catch {
    ctx.restore();
    return false;
  }
  ctx.restore();
  return true;
}
