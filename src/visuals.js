const SURVIVOR_PORTRAITS = Object.freeze([
  "./src/assets/visuals/survivor-01.webp",
  "./src/assets/visuals/survivor-02.webp",
  "./src/assets/visuals/survivor-03.webp",
  "./src/assets/visuals/survivor-04.webp",
  "./src/assets/visuals/survivor-05.webp",
  "./src/assets/visuals/survivor-06.webp"
]);

export const VISUAL_ASSETS = Object.freeze({
  menu: "./src/assets/visuals/menu-sector-fall.webp",
  missions: "./src/assets/visuals/missions-radio-desk.webp",
  vehicle: "./src/assets/visuals/vehicle-expedition-top.webp",
  gameOver: "./src/assets/visuals/ending-zone-fallen.webp",
  victory: "./src/assets/visuals/ending-convoy-evacuation.webp",
  survivors: SURVIVOR_PORTRAITS
});

export const VISUAL_ASSET_PATHS = Object.freeze([
  VISUAL_ASSETS.menu,
  VISUAL_ASSETS.missions,
  ...SURVIVOR_PORTRAITS,
  VISUAL_ASSETS.vehicle,
  VISUAL_ASSETS.gameOver,
  VISUAL_ASSETS.victory
]);

/**
 * Assigne un portrait stable sans ajouter de champ aux sauvegardes.
 * @param {string} survivorId
 * @returns {string}
 */
export function portraitForSurvivor(survivorId) {
  const value = String(survivorId ?? "");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return SURVIVOR_PORTRAITS[hash % SURVIVOR_PORTRAITS.length];
}
