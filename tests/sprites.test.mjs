import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { GameEngine } from "../src/engine.js";
import { destinationPoint } from "../src/geo.js";
import {
  directionIndexForHeading,
  drawSpriteFrame,
  frameIndexForClip,
  installSpriteAtlasForTests,
  resetSpriteAtlasesForTests,
  SPRITE_ASSET_PATHS,
  SPRITE_ATLASES,
  spriteScaleForZoom
} from "../src/sprites.js";
import { createInitialState } from "../src/world.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const start = { lat: 43.2965, lng: 5.3698 };

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function paethPredictor(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodeRgbaPng(buffer) {
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "signature PNG"
  );
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "profondeur PNG");
      assert.equal(data[9], 6, "PNG RGBA");
      assert.equal(data[12], 0, "PNG non entrelacé");
    }
    if (type === "IDAT") compressed.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }

  const packed = inflateSync(Buffer.concat(compressed));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  assert.equal(packed.length, height * (stride + 1));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let packedOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset];
    packedOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = packed[packedOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[rowOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowOffset + x - stride - bytesPerPixel]
        : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
      else assert.equal(filter, 0, `filtre PNG inconnu ${filter}`);
      pixels[rowOffset + x] = (value + predictor) & 255;
    }
    packedOffset += stride;
  }
  return { width, height, pixels };
}

function inspectCell(image, cell, column, row) {
  let visible = 0;
  let boundary = 0;
  let hash = 2166136261;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const pixel = (((row * cell + y) * image.width) + column * cell + x) * 4;
      const alpha = image.pixels[pixel + 3];
      if (alpha > 8) {
        visible += 1;
        if (x === 0 || y === 0 || x === cell - 1 || y === cell - 1) boundary += 1;
      }
      for (let channel = 0; channel < 4; channel += 1) {
        hash ^= image.pixels[pixel + channel];
        hash = Math.imul(hash, 16777619);
      }
    }
  }
  return { visible, boundary, hash: hash >>> 0 };
}

test("le catalogue livre neuf atlas PNG uniques, bornés et conformes au manifeste", async () => {
  assert.equal(SPRITE_ASSET_PATHS.length, 9);
  assert.equal(new Set(SPRITE_ASSET_PATHS).size, 9);
  const manifest = JSON.parse(await readFile(path.join(root, "src/assets/sprites/atlas-manifest.json"), "utf8"));
  assert.equal(manifest.format, "dead-ground-sprite-atlas-v1");
  assert.deepEqual(Object.keys(manifest.atlases).sort(), Object.keys(SPRITE_ATLASES).sort());

  let totalBytes = 0;
  for (const [id, atlas] of Object.entries(SPRITE_ATLASES)) {
    const relative = atlas.src.slice(2);
    const [asset, buffer] = await Promise.all([
      stat(path.join(root, relative)),
      readFile(path.join(root, relative))
    ]);
    const dimensions = pngDimensions(buffer);
    const expectedWidth = Math.max(...Object.values(atlas.clips).map((clip) => clip.frames)) * atlas.cell;
    const expectedHeight = atlas.directions * Object.keys(atlas.clips).length * atlas.cell;
    assert.deepEqual(dimensions, { width: expectedWidth, height: expectedHeight }, `${id}: dimensions`);
    assert.ok(Math.max(dimensions.width, dimensions.height) <= 4096, `${id}: texture trop grande`);
    assert.ok(asset.size > 20_000, `${id}: atlas probablement vide`);
    assert.ok(asset.size < 1_000_000, `${id}: atlas trop lourd`);
    totalBytes += asset.size;

    const declared = manifest.atlases[id];
    assert.equal(declared.assetPath, atlas.src);
    assert.equal(declared.cell, atlas.cell);
    assert.equal(declared.directions.length, atlas.directions);
    assert.deepEqual(declared.clips, atlas.clips);
    assert.equal(
      declared.animationSource,
      id === "vehicle"
        ? "OpenAI-generated rigid orthographic master"
        : "OpenAI-generated articulated 3x3 key poses"
    );
  }
  assert.ok(totalBytes < 5_500_000, `poids total atlas ${totalBytes}`);
});

test("les pixels des atlas sont propres et chaque clip contient de vraies poses sans débordement", async () => {
  for (const [id, atlas] of Object.entries(SPRITE_ATLASES)) {
    const image = decodeRgbaPng(await readFile(path.join(root, atlas.src.slice(2))));
    let hiddenRgb = 0;
    let chroma = 0;
    for (let pixel = 0; pixel < image.pixels.length; pixel += 4) {
      const red = image.pixels[pixel];
      const green = image.pixels[pixel + 1];
      const blue = image.pixels[pixel + 2];
      const alpha = image.pixels[pixel + 3];
      if (alpha === 0 && (red !== 0 || green !== 0 || blue !== 0)) hiddenRgb += 1;
      if (alpha > 0 && red > 210 && green < 80 && blue > 190) chroma += 1;
    }
    assert.equal(hiddenRgb, 0, `${id}: RGB caché sous alpha nul`);
    assert.equal(chroma, 0, `${id}: résidu chroma`);

    const clipCount = Object.keys(atlas.clips).length;
    for (const [clipId, clip] of Object.entries(atlas.clips)) {
      const hashes = new Set();
      for (let direction = 0; direction < atlas.directions; direction += 1) {
        for (let frame = 0; frame < clip.frames; frame += 1) {
          const row = direction * clipCount + clip.row;
          const cell = inspectCell(image, atlas.cell, frame, row);
          assert.ok(cell.visible > 80, `${id}/${clipId}/${direction}/${frame}: case vide`);
          assert.equal(cell.boundary, 0, `${id}/${clipId}/${direction}/${frame}: sprite rogné`);
          if (direction === 0) hashes.add(cell.hash);
        }
      }
      if (clip.frames > 1) {
        assert.ok(hashes.size >= 2, `${id}/${clipId}: poses identiques`);
      }
    }
  }
});

test("la quantification couvre exactement les huit directions avec bouclage", () => {
  const step = Math.PI / 4;
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => directionIndexForHeading(index * step)),
    [0, 1, 2, 3, 4, 5, 6, 7]
  );
  assert.equal(directionIndexForHeading(-step), 7);
  assert.equal(directionIndexForHeading(Math.PI * 2), 0);
  assert.equal(directionIndexForHeading(step * .49), 0);
  assert.equal(directionIndexForHeading(step * .51), 1);
});

test("l'échelle tactique est bornée aux zooms extrêmes", () => {
  assert.equal(spriteScaleForZoom(15), .72);
  assert.equal(spriteScaleForZoom(18), .96);
  assert.equal(spriteScaleForZoom(20), 1.12);
  assert.equal(spriteScaleForZoom(-100), .72);
  assert.equal(spriteScaleForZoom(100), 1.12);
});

test("les boucles avancent, les actions tiennent leur dernière pose et la réduction de mouvement est stable", () => {
  const loop = { frames: 4, fps: 5, loop: true };
  const action = { frames: 8, fps: 10, loop: false };
  assert.equal(frameIndexForClip(loop, 0), 0);
  assert.equal(frameIndexForClip(loop, 200), 1);
  assert.equal(frameIndexForClip(action, 500), 7);
  assert.equal(frameIndexForClip(action, 0, { progress: .5 }), 4);
  assert.equal(frameIndexForClip(loop, 900, { reducedMotion: true }), 0);
  assert.equal(frameIndexForClip(action, 0, { reducedMotion: true }), 7);
});

test("l'échantillonneur emploie le bloc direction-major et revient au vectoriel si l'image manque", () => {
  resetSpriteAtlasesForTests();
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args])
  };
  assert.equal(drawSpriteFrame(ctx, "player", "walk", 0, 0), false);

  const fakeImage = { width: 576, height: 4032 };
  installSpriteAtlasForTests("player", fakeImage);
  assert.equal(drawSpriteFrame(ctx, "player", "walk", Math.PI / 2, 0, { progress: .5 }), true);
  const draw = calls.find(([name]) => name === "drawImage");
  assert.equal(draw[1], fakeImage);
  assert.equal(draw[2], 4 * 72);
  assert.equal(draw[3], (2 * 7 + 1) * 72);
  assert.equal(draw[4], 72);
  assert.equal(draw[5], 72);
  resetSpriteAtlasesForTests();
});

test("les événements d'animation restent transitoires et ne consomment aucun RNG de gameplay", () => {
  const state = createInitialState({ start, difficultyId: "normal", seed: 777 });
  const engine = new GameEngine(state);
  const randomBefore = state.randomState;
  engine.addEffect("actor-action", start, start, .4, {
    actorId: "player",
    animation: "fire",
    heading: 0
  });
  assert.equal(state.randomState, randomBefore);
  assert.equal(state.effects.at(-1).actorId, "player");
  assert.equal(state.effects.at(-1).animation, "fire");

  const zombie = {
    id: "sprite-death-target",
    type: "spitter",
    pos: destinationPoint(start, Math.PI / 2, 8),
    health: 1,
    maxHealth: 58,
    attackCooldown: 0,
    screamCooldown: 10,
    target: "player",
    heading: Math.PI / 2,
    wave: false,
    stagger: 0,
    dead: false
  };
  state.zombies.push(zombie);
  engine.damageZombie(zombie, 999, "gun");
  const death = state.effects.find((effect) => effect.type === "kill");
  assert.equal(death.entityType, "spitter");
  assert.equal(death.actorId, zombie.id);
  assert.equal(death.animation, "death");
  assert.equal(death.heading, Math.PI / 2);
  assert.ok(death.maxTtl >= .8);
});

test("les commandes et attaques réelles publient les clips attendus avec leur acteur", () => {
  const state = createInitialState({ start, difficultyId: "normal", seed: 991 });
  state.tutorialVisible = false;
  const engine = new GameEngine(state);
  const makeZombie = (type, id, bearing, distance, overrides = {}) => {
    const maximum = { walker: 44, runner: 32, screamer: 48, spitter: 58 }[type];
    return {
      id,
      type,
      pos: destinationPoint(start, bearing, distance),
      health: maximum,
      maxHealth: maximum,
      attackCooldown: 0,
      screamCooldown: 99,
      target: "player",
      heading: 0,
      wave: false,
      stagger: 0,
      dead: false,
      ...overrides
    };
  };

  const firearmTarget = makeZombie("runner", "qa-fire-target", Math.PI / 2, 14);
  state.zombies = [firearmTarget];
  assert.equal(engine.fire(), true);
  const firearm = state.effects.find((effect) => effect.actorId === "player" && effect.animation === "fire");
  assert.ok(firearm);
  assert.ok(Math.abs(firearm.heading - Math.PI / 2) < .001);

  state.effects = [];
  state.player.fireCooldown = 0;
  const meleeTarget = makeZombie("walker", "qa-melee-target", Math.PI, 3);
  state.zombies = [meleeTarget];
  assert.equal(engine.melee(), true);
  assert.ok(state.effects.some((effect) => effect.actorId === "player" && effect.animation === "melee"));

  state.effects = [];
  state.player.invulnerability = 0;
  const walker = makeZombie("walker", "qa-walker-attack", 0, 1);
  const screamer = makeZombie("screamer", "qa-screamer-special", Math.PI / 2, 24, { screamCooldown: 0, attackCooldown: 99 });
  const spitter = makeZombie("spitter", "qa-spitter-special", Math.PI, 22);
  state.zombies = [walker, screamer, spitter];
  engine.updateZombies(.01);
  assert.ok(state.effects.some((effect) => effect.actorId === walker.id && effect.animation === "attack"));
  assert.ok(state.effects.some((effect) => effect.actorId === screamer.id && effect.animation === "special"));
  assert.ok(state.effects.some((effect) => effect.actorId === spitter.id && effect.animation === "special"));
});

test("le cri du Hurleur occupe son tick sans être masqué par une attaque de mêlée", () => {
  const state = createInitialState({ start, difficultyId: "normal", seed: 31337 });
  state.autoFire = false;
  const engine = new GameEngine(state);
  const screamer = {
    id: "qa-close-screamer",
    type: "screamer",
    pos: destinationPoint(start, 0, 1),
    health: 48,
    maxHealth: 48,
    attackCooldown: 0,
    screamCooldown: 0,
    target: "player",
    heading: 0,
    wave: false,
    stagger: 0,
    dead: false
  };
  state.zombies = [screamer];
  engine.updateZombies(.01);
  const actorAnimations = state.effects
    .filter((effect) => effect.actorId === screamer.id)
    .map((effect) => effect.animation);
  assert.deepEqual(actorAnimations, ["special"]);
});

test("la pause manuelle fige l'horloge et les actions, mais une animation terminale peut finir", () => {
  const state = createInitialState({ start, difficultyId: "normal", seed: 4242 });
  const engine = new GameEngine(state);
  engine.addEffect("actor-action", start, start, .6, {
    actorId: "player",
    animation: "fire",
    heading: 0
  });
  state.paused = true;
  engine.step(.2);
  assert.equal(engine.animationTime, 0);
  assert.equal(state.effects.at(-1).ttl, .6);

  state.status = "gameover";
  engine.step(.2);
  assert.equal(engine.animationTime, .2);
  assert.ok(Math.abs(state.effects.at(-1).ttl - .4) < .000001);
});

test("la chute de la base ne déclenche jamais la mort visuelle du joueur", () => {
  const state = createInitialState({ start, difficultyId: "normal", seed: 5150 });
  state.base.health = 0;
  const engine = new GameEngine(state);
  engine.checkEndConditions();
  assert.equal(state.status, "gameover");
  assert.equal(state.player.health, state.player.maxHealth);
  assert.equal(state.effects.some((effect) => effect.actorId === "player" && effect.animation === "death"), false);
});
