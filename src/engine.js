import {
  CRAFTING_RECIPES,
  DIFFICULTIES,
  EVACUATION_BEACON_COST,
  MAX_LOG_ENTRIES,
  MINUTES_PER_REAL_SECOND,
  MISSION_TYPES,
  OUTPOST_CLAIM_COST,
  POI_TYPES,
  RESEARCH_TECHS,
  STRUCTURES,
  SURVIVOR_ROLES,
  TUTORIAL_STEPS,
  VEHICLE_DEFINITION,
  VEHICLE_INTERACTION_RANGE_METERS,
  WEATHER_TYPES,
  WAVE_RECOVERY_REWARDS,
  ZOMBIE_TYPES
} from "./constants.js";
import {
  bearingRadians,
  clamp,
  closestEntity,
  crossedMinute,
  destinationPoint,
  distanceMeters,
  gameDay,
  isNight,
  moveToward
} from "./geo.js";
import {
  createLog,
  createMission,
  createSurvivor,
  createZombie,
  poiById,
  rollPoiLoot
} from "./world.js";

const PLAYER_WALK_SPEED = 4.8;
const PLAYER_SPRINT_SPEED = 8.8;
const PLAYER_FIRE_RANGE = 82;
const PLAYER_MELEE_RANGE = 4.4;
const POI_INTERACTION_RANGE = 27;
const OUTPOST_SAFE_RADIUS = 48;
const MAX_ZOMBIES = 125;

export class GameEngine {
  constructor(state, hooks = {}) {
    this.state = state;
    this.hooks = {
      onFrame: hooks.onFrame ?? (() => {}),
      onChange: hooks.onChange ?? (() => {}),
      onAutosave: hooks.onAutosave ?? (() => {}),
      onSound: hooks.onSound ?? (() => {})
    };
    this.running = false;
    this.lastFrameAt = 0;
    this.frameHandle = null;
    this.ensureVehicleLocation();
  }

  setHooks(hooks = {}) {
    Object.assign(this.hooks, hooks);
  }

  start() {
    if (this.running || typeof requestAnimationFrame !== "function") return;
    this.running = true;
    this.lastFrameAt = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this.lastFrameAt) / 1000, 0, 0.12);
      this.lastFrameAt = now;
      this.step(dt);
      this.hooks.onFrame(this.state);
      this.frameHandle = requestAnimationFrame(frame);
    };
    this.frameHandle = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    if (this.frameHandle != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = null;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const state = this.state;
    if (state.status !== "playing" || state.paused) {
      this.updateTransient(dt);
      return;
    }

    const clampedDt = clamp(dt, 0, 0.25);
    const previousMinutes = state.totalMinutes;
    const gameMinutesDelta = clampedDt * MINUTES_PER_REAL_SECOND;
    state.totalMinutes += gameMinutesDelta;
    state.updatedAt = Date.now();

    state.player.fireCooldown = Math.max(0, state.player.fireCooldown - clampedDt);
    state.player.meleeCooldown = Math.max(0, state.player.meleeCooldown - clampedDt);
    state.player.invulnerability = Math.max(0, state.player.invulnerability - clampedDt);
    state.base.turretCooldown = Math.max(0, state.base.turretCooldown - clampedDt);
    state.base.guardCooldown = Math.max(0, state.base.guardCooldown - clampedDt);
    state.base.trapCooldown = Math.max(0, state.base.trapCooldown - clampedDt);

    this.updateWeather(gameMinutesDelta);
    this.updateMovement(clampedDt);
    this.updateActivity(clampedDt);
    this.updateDiscoveries();
    this.updateMissions();
    this.updateDailySystems(previousMinutes, state.totalMinutes, gameMinutesDelta);
    this.updateSpawning(clampedDt);
    this.updateZombies(clampedDt);
    this.updateAutomatedDefense();
    this.updateTraps();
    this.updateHealthConditions(clampedDt);
    this.updateThreatAndNoise(clampedDt);
    this.updateTransient(clampedDt);
    this.checkEndConditions();
    if (state.status === "playing") this.resolveWaveCompletion();

    state.timers.uiPulse += clampedDt;
    state.timers.savePulse += clampedDt;
    if (state.timers.uiPulse >= 0.16) {
      state.timers.uiPulse = 0;
      this.hooks.onChange(state);
    }
    if (state.timers.savePulse >= 5) {
      state.timers.savePulse = 0;
      this.hooks.onAutosave(state);
    }
  }

  random() {
    let value = (this.state.randomState >>> 0) || 0x9e3779b9;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state.randomState = value >>> 0;
    return (this.state.randomState >>> 0) / 4294967296;
  }

  randomBetween(min, max) {
    return min + (max - min) * this.random();
  }

  randomInt(min, maxInclusive) {
    return Math.floor(this.randomBetween(min, maxInclusive + 1));
  }

  pause(value = true) {
    if (this.state.status !== "playing") return;
    this.state.paused = Boolean(value);
    if (this.state.paused) this.state.movementMode = "walk";
    this.hooks.onChange(this.state);
  }

  togglePause() {
    this.pause(!this.state.paused);
  }

  moveTo(position) {
    if (!this.canAcceptCommand() || this.state.activity) return false;
    if (!this.isPositionInCoverage(position)) {
      this.notify("warning", "Hors du réseau", "Améliorez la radio ou établissez un avant-poste plus proche.");
      return false;
    }
    this.state.player.target = { lat: position.lat, lng: position.lng };
    this.log("movement", this.state.vehicle.active ? "Itinéraire motorisé défini." : "Nouveau point de déplacement défini.");
    return true;
  }

  travelToPoi(poiId) {
    const poi = poiById(this.state, poiId);
    if (!poi || !this.canAcceptCommand()) return false;
    poi.discovered = true;
    this.state.selectedPoiId = poi.id;
    return this.moveTo(poi.pos);
  }

  returnToBase() {
    if (!this.canAcceptCommand() || this.state.activity) return false;
    this.state.selectedPoiId = null;
    this.state.player.target = { ...this.state.base.pos };
    this.notify("info", "Retour à la base", "Trajet vers le centre de commandement engagé.");
    return true;
  }

  returnToVehicle() {
    const vehicle = this.state.vehicle;
    if (!vehicle?.repaired || vehicle.active || !vehicle.pos) return false;
    if (!this.moveTo(vehicle.pos)) return false;
    this.state.selectedPoiId = null;
    this.notify(
      "info",
      "REJOINDRE LE FOURGON",
      `${Math.round(distanceMeters(this.state.player.pos, vehicle.pos))} m jusqu’au véhicule garé.`
    );
    return true;
  }

  selectPoi(poiId) {
    const poi = poiById(this.state, poiId);
    if (!poi) return false;
    poi.discovered = true;
    this.state.selectedPoiId = poi.id;
    this.hooks.onChange(this.state);
    return true;
  }

  setMovementMode(mode) {
    if (!this.canAcceptCommand() || !["walk", "sprint"].includes(mode)) return false;
    if (this.state.vehicle.active && mode === "sprint") return false;
    this.state.movementMode = mode;
    this.hooks.onChange(this.state);
    return true;
  }

  releaseSprint() {
    if (this.state.status !== "playing" || this.state.movementMode !== "sprint") return false;
    this.state.movementMode = "walk";
    this.hooks.onChange(this.state);
    return true;
  }

  toggleAutoFire() {
    if (!this.canAcceptCommand()) return false;
    this.state.autoFire = !this.state.autoFire;
    this.notify(
      "info",
      this.state.autoFire ? "Tir automatique actif" : "Tir automatique coupé",
      this.state.autoFire ? "Le survivant engage les menaces proches." : "Les munitions sont conservées."
    );
    return true;
  }

  fire() {
    return this.performShot({ automated: false });
  }

  melee() {
    const state = this.state;
    if (!this.canAcceptCommand() || state.player.meleeCooldown > 0 || state.player.stamina < 9 || state.vehicle.active) return false;
    const nearest = closestEntity(
      state.player.pos,
      state.zombies,
      (zombie) => !zombie.dead && distanceMeters(state.player.pos, zombie.pos) <= PLAYER_MELEE_RANGE
    );
    if (!nearest) {
      this.notify("warning", "Aucune cible", "Approchez-vous à moins de 4 mètres.");
      return false;
    }

    const damage = 31 + state.base.structures.workshop * 4 + (this.hasResearch("ballistics") ? 5 : 0);
    state.player.stamina = Math.max(0, state.player.stamina - 9);
    state.player.meleeCooldown = 0.72;
    state.noise = clamp(state.noise + 4, 0, 100);
    this.damageZombie(nearest.entity, damage, "melee");
    this.addEffect("melee", state.player.pos, nearest.entity.pos, 0.18);
    this.hooks.onSound("melee");
    return true;
  }

  heal() {
    const { state } = this;
    const needsStabilization = state.player.bleeding || state.player.injury !== "none";
    if (!this.canAcceptCommand() || (state.player.health >= state.player.maxHealth && !needsStabilization)) return false;
    if (state.inventory.fieldKit > 0) return this.useFieldKit();
    if (state.resources.medicine <= 0) return false;

    state.resources.medicine -= 1;
    const triageBonus = this.hasResearch("triage") ? 12 : 0;
    const amount = 34 + state.base.structures.infirmary * 4 + triageBonus;
    state.player.health = Math.min(state.player.maxHealth, state.player.health + amount);
    if (state.player.bleeding && this.random() < 0.55 + (this.hasResearch("triage") ? 0.25 : 0)) {
      state.player.bleeding = false;
    }
    this.notify("success", "Soin appliqué", `+${amount} points de vie.`);
    this.hooks.onSound("heal");
    return true;
  }

  useFieldKit() {
    const { state } = this;
    if (!this.canAcceptCommand() || state.inventory.fieldKit <= 0) return false;
    if (state.player.health >= state.player.maxHealth && !state.player.bleeding && state.player.injury === "none") return false;
    state.inventory.fieldKit -= 1;
    const amount = this.hasResearch("triage") ? 68 : 55;
    state.player.health = Math.min(state.player.maxHealth, state.player.health + amount);
    state.player.bleeding = false;
    state.player.injury = state.player.injury === "fracture" ? "sprain" : "none";
    state.player.infection = Math.max(0, state.player.infection - 5);
    this.notify("success", "Kit de terrain utilisé", `Santé +${amount}, blessures stabilisées.`);
    this.hooks.onSound("heal");
    return true;
  }

  useAntidote() {
    const { state } = this;
    if (!this.canAcceptCommand() || state.inventory.antidote <= 0 || state.player.infection <= 0) return false;
    state.inventory.antidote -= 1;
    const reduction = this.hasResearch("virology") ? 45 : 34;
    state.player.infection = Math.max(0, state.player.infection - reduction);
    this.notify("success", "Antidote injecté", `Contamination réduite de ${reduction} points.`);
    this.hooks.onSound("heal");
    return true;
  }

  beginScavenge() {
    const { state } = this;
    const poi = poiById(state, state.selectedPoiId);
    if (!poi || poi.looted || state.activity || !this.canAcceptCommand()) return false;
    if (poi.nest?.active) {
      this.notify("danger", "Nid encore actif", "Nettoyez le foyer infecté avant de fouiller le bâtiment.");
      return false;
    }
    const distance = distanceMeters(state.player.pos, poi.pos);
    if (distance > POI_INTERACTION_RANGE) {
      this.notify("warning", "Trop loin", "Rejoignez d’abord le lieu sélectionné.");
      return false;
    }

    const defenderState = this.poiDefenderState(poi, "scavenge");
    if (!defenderState.spawnedBefore && state.zombies.length >= MAX_ZOMBIES) {
      this.notify("warning", "Zone saturée", "Éliminez des infectés avant de lancer cette fouille.");
      return false;
    }
    state.player.target = null;
    this.parkVehicleAtPlayer();
    poi.visited = true;
    poi.discovered = true;
    const scouts = this.roleCount("scout");
    state.activity = {
      type: "scavenge",
      poiId: poi.id,
      elapsed: 0,
      duration: Math.max(3.5, 5.5 + poi.danger * 1.15 - scouts * 0.35),
      blocked: false
    };
    state.noise = clamp(state.noise + 18 + poi.danger * 3, 0, 100);
    state.threat = clamp(state.threat + poi.danger * 1.3, 0, 100);
    this.spawnPoiDefenders(poi, false);
    this.recallPoiDefenders(poi);
    state.activity.blocked = this.hasLivingPoiDefenders(poi.id);
    this.notify(
      "warning",
      "Fouille en cours",
      state.activity.blocked
        ? "Éliminez les défenseurs associés avant de terminer la fouille."
        : "Le périmètre est sécurisé, la récupération peut commencer."
    );
    this.hooks.onSound("search");
    return true;
  }

  beginClearNest() {
    const { state } = this;
    const poi = poiById(state, state.selectedPoiId);
    if (!poi?.nest?.active || state.activity || !this.canAcceptCommand()) return false;
    if (distanceMeters(state.player.pos, poi.pos) > POI_INTERACTION_RANGE) {
      this.notify("warning", "Trop loin", "Rejoignez le nid avant de lancer le nettoyage.");
      return false;
    }
    const defenderState = this.poiDefenderState(poi, "clearNest");
    if (!defenderState.spawnedBefore && state.zombies.length >= MAX_ZOMBIES) {
      this.notify("warning", "Zone saturée", "Éliminez des infectés avant d’exposer les défenseurs du nid.");
      return false;
    }
    state.player.target = null;
    this.parkVehicleAtPlayer();
    poi.visited = true;
    state.activity = {
      type: "clearNest",
      poiId: poi.id,
      elapsed: 0,
      duration: 7 + poi.nest.strength * 2.5,
      blocked: true
    };
    state.noise = clamp(state.noise + 30, 0, 100);
    state.threat = clamp(state.threat + 4, 0, 100);
    this.spawnPoiDefenders(poi, true);
    this.recallPoiDefenders(poi);
    state.activity.blocked = this.hasLivingPoiDefenders(poi.id);
    this.notify(
      "danger",
      "NETTOYAGE DU NID",
      state.activity.blocked
        ? "Éliminez les défenseurs pour reprendre la destruction du foyer."
        : "Le foyer est exposé, sa destruction peut commencer."
    );
    this.hooks.onSound("wave");
    return true;
  }

  cancelActivity() {
    if (!this.state.activity) return false;
    this.state.activity = null;
    this.notify("info", "Action interrompue", "Vous pouvez vous déplacer de nouveau.");
    return true;
  }

  buildStructure(structureId) {
    const { state } = this;
    const definition = STRUCTURES[structureId];
    if (!definition || !this.canAcceptCommand() || !state.player.atBase) return false;
    const currentLevel = state.base.structures[structureId] ?? 0;
    if (currentLevel >= definition.maxLevel) return false;

    const baseCost = definition.costs[currentLevel];
    const cost = this.discountCost(baseCost, structureId === "workshop" ? 0 : this.engineerDiscount());
    if (!this.hasResources(cost)) {
      this.notify("warning", "Ressources insuffisantes", this.formatCost(cost));
      return false;
    }

    this.consumeResources(cost);
    state.base.structures[structureId] = currentLevel + 1;
    this.applyStructureUpgrade(structureId, currentLevel + 1);
    this.log("base", `${definition.label} amélioré au niveau ${currentLevel + 1}.`);
    this.notify("success", definition.label, `Niveau ${currentLevel + 1} opérationnel.`);
    state.score += 40 * (currentLevel + 1);
    this.hooks.onSound("build");
    this.hooks.onChange(state);
    return true;
  }

  repairBase(target = "wall") {
    const { state } = this;
    if (!this.canAcceptCommand() || !state.player.atBase) return false;
    const discount = 1 - Math.min(0.38, state.base.structures.workshop * 0.08 + this.engineerDiscount());

    if (target === "wall" && state.base.wallMaxHealth > 0 && state.base.wallHealth < state.base.wallMaxHealth) {
      const amount = Math.min(90 + state.base.structures.workshop * 20, state.base.wallMaxHealth - state.base.wallHealth);
      const cost = {
        wood: Math.max(1, Math.ceil((amount / 18) * discount)),
        metal: Math.max(1, Math.ceil((amount / 45) * discount))
      };
      if (!this.hasResources(cost)) {
        this.notify("warning", "Réparation impossible", this.formatCost(cost));
        return false;
      }
      this.consumeResources(cost);
      state.base.wallHealth += amount;
      this.notify("success", "Palissade réparée", `+${Math.round(amount)} intégrité.`);
      this.hooks.onSound("build");
      return true;
    }

    if (target === "base" && state.base.health < state.base.maxHealth) {
      const amount = Math.min(70 + state.base.structures.workshop * 18, state.base.maxHealth - state.base.health);
      const cost = {
        wood: Math.max(1, Math.ceil((amount / 24) * discount)),
        metal: Math.max(1, Math.ceil((amount / 30) * discount)),
        parts: Math.max(1, Math.ceil(amount / 100))
      };
      if (!this.hasResources(cost)) {
        this.notify("warning", "Réparation impossible", this.formatCost(cost));
        return false;
      }
      this.consumeResources(cost);
      state.base.health += amount;
      this.notify("success", "Centre réparé", `+${Math.round(amount)} intégrité.`);
      this.hooks.onSound("build");
      return true;
    }

    return false;
  }

  craftItem(recipeId) {
    const { state } = this;
    const recipe = CRAFTING_RECIPES[recipeId];
    if (!recipe || !this.canAcceptCommand() || !state.player.atBase) return false;
    if (state.base.structures.workshop < recipe.minWorkshop) {
      this.notify("warning", "Atelier insuffisant", `Niveau ${recipe.minWorkshop} requis.`);
      return false;
    }
    if (recipe.research && !this.hasResearch(recipe.research)) {
      this.notify("warning", "Recherche requise", RESEARCH_TECHS[recipe.research]?.label ?? recipe.research);
      return false;
    }
    const cost = this.discountCost(recipe.cost, this.engineerDiscount() * 0.5);
    if (!this.hasResources(cost)) {
      this.notify("warning", "Composants manquants", this.formatCost(cost));
      return false;
    }
    this.consumeResources(cost);
    if (recipe.result.type === "resource") {
      state.resources[recipe.result.id] = (state.resources[recipe.result.id] ?? 0) + recipe.result.amount;
    } else {
      state.inventory[recipe.result.id] = (state.inventory[recipe.result.id] ?? 0) + recipe.result.amount;
    }
    state.score += 20;
    this.log("craft", `${recipe.label} fabriqué.`);
    this.notify("success", "Fabrication terminée", recipe.label);
    this.hooks.onSound("build");
    return true;
  }

  deployTrap() {
    const { state } = this;
    if (!this.canAcceptCommand() || !state.player.atBase || state.inventory.trap <= 0) return false;
    state.inventory.trap -= 1;
    state.base.traps += 1;
    this.notify("success", "Piège déployé", `${state.base.traps} piège(s) protègent désormais le périmètre.`);
    this.hooks.onSound("build");
    return true;
  }

  researchTech(techId) {
    const { state } = this;
    const tech = RESEARCH_TECHS[techId];
    if (!tech || !this.canAcceptCommand() || !state.player.atBase || this.hasResearch(techId)) return false;
    const missingPrerequisite = tech.prerequisites.find((id) => !this.hasResearch(id));
    if (missingPrerequisite) {
      this.notify("warning", "Prérequis manquant", RESEARCH_TECHS[missingPrerequisite]?.label ?? missingPrerequisite);
      return false;
    }
    if (state.resources.intel < tech.cost) {
      this.notify("warning", "Renseignements insuffisants", `${tech.cost} points requis.`);
      return false;
    }
    state.resources.intel -= tech.cost;
    state.research.unlocked.push(techId);
    state.research.completed = state.research.unlocked.length;
    state.score += 100;
    this.log("research", `Recherche terminée : ${tech.label}.`);
    this.notify("success", "RECHERCHE TERMINÉE", tech.label);
    this.hooks.onSound("build");
    return true;
  }

  assignSurvivorRole(survivorId, roleId) {
    const { state } = this;
    if (!this.canAcceptCommand() || !state.player.atBase || !SURVIVOR_ROLES[roleId]) return false;
    const survivor = state.base.roster.find((item) => item.id === survivorId);
    if (!survivor) return false;
    survivor.role = roleId;
    this.log("survivor", `${survivor.name} est maintenant ${SURVIVOR_ROLES[roleId].label.toLowerCase()}.`);
    this.notify("success", "Affectation mise à jour", `${survivor.name} — ${SURVIVOR_ROLES[roleId].label}`);
    return true;
  }

  claimOutpost(poiId = this.state.selectedPoiId) {
    const { state } = this;
    const poi = poiById(state, poiId);
    if (!poi || !this.canAcceptCommand() || poi.outpost || !poi.looted || poi.nest?.active) return false;
    if (distanceMeters(state.player.pos, poi.pos) > POI_INTERACTION_RANGE) {
      this.notify("warning", "Trop loin", "Rejoignez le lieu pour installer l’avant-poste.");
      return false;
    }
    const cost = this.discountCost(OUTPOST_CLAIM_COST, this.engineerDiscount());
    if (!this.hasResources(cost)) {
      this.notify("warning", "Matériel insuffisant", this.formatCost(cost));
      return false;
    }
    this.consumeResources(cost);
    poi.outpost = true;
    poi.outpostClaimedDay = gameDay(state.totalMinutes);
    state.player.atOutpostId = poi.id;
    state.base.morale = Math.min(100, state.base.morale + 4);
    state.score += 140;
    this.log("outpost", `Avant-poste établi : ${poi.name}.`);
    this.notify("success", "AVANT-POSTE ACTIF", "La portée et la production du secteur augmentent.");
    this.hooks.onSound("build");
    return true;
  }

  repairVehicle() {
    const { state } = this;
    if (!this.canAcceptCommand() || !state.player.atBase || !state.vehicle.discovered || state.vehicle.repaired) return false;
    if (!this.hasResearch("mechanics")) {
      this.notify("warning", "Compétence manquante", "Recherchez Mécanique de récupération.");
      return false;
    }
    const cost = this.discountCost(VEHICLE_DEFINITION.repairCost, this.engineerDiscount());
    if (!this.hasResources(cost)) {
      this.notify("warning", "Réparation impossible", this.formatCost(cost));
      return false;
    }
    this.consumeResources(cost);
    state.vehicle.repaired = true;
    state.vehicle.condition = state.vehicle.maxCondition;
    state.vehicle.pos = { ...state.base.pos };
    state.vehicle.parkedAt = "base";
    state.score += 180;
    this.log("vehicle", "Le fourgon d’expédition est remis en état.");
    this.notify("success", "FOURGON OPÉRATIONNEL", "Activez-le pour accélérer les déplacements.");
    this.hooks.onSound("build");
    return true;
  }

  repairVehicleWithKit() {
    const { state } = this;
    if (!this.canAcceptCommand() || state.activity || state.inventory.repairKit <= 0) return false;
    const canRepairVehicle =
      state.vehicle.repaired &&
      !state.vehicle.active &&
      state.vehicle.condition < state.vehicle.maxCondition &&
      this.isPlayerNearVehicle();
    const canRepairWall =
      state.player.atBase &&
      state.base.wallMaxHealth > 0 &&
      state.base.wallHealth < state.base.wallMaxHealth;
    const canRepairBase =
      state.player.atBase &&
      state.base.health < state.base.maxHealth;
    if (!canRepairVehicle && !canRepairWall && !canRepairBase) return false;

    state.inventory.repairKit -= 1;
    if (canRepairVehicle) {
      state.vehicle.condition = Math.min(state.vehicle.maxCondition, state.vehicle.condition + 42);
      this.notify("success", "Véhicule réparé", `État : ${Math.round(state.vehicle.condition)} %.`);
    } else if (canRepairWall) {
      state.base.wallHealth = Math.min(state.base.wallMaxHealth, state.base.wallHealth + 115);
      this.notify("success", "Défense renforcée", `Palissade : ${Math.round(state.base.wallHealth)}/${state.base.wallMaxHealth}.`);
    } else {
      state.base.health = Math.min(state.base.maxHealth, state.base.health + 85);
      this.notify("success", "Centre renforcé", `Structure : ${Math.round(state.base.health)}/${state.base.maxHealth}.`);
    }
    this.hooks.onSound("build");
    return true;
  }

  toggleVehicle() {
    const { state } = this;
    if (!this.canAcceptCommand() || !state.vehicle.repaired || state.vehicle.condition <= 0 || state.activity) return false;
    if (!state.vehicle.active && state.resources.fuel <= 0) {
      this.notify("warning", "Réservoir vide", "Trouvez du carburant avant de démarrer.");
      return false;
    }
    if (!state.vehicle.active && !this.isPlayerNearVehicle()) {
      this.notify("warning", "Fourgon trop éloigné", "Rejoignez le véhicule garé avant de le démarrer.");
      return false;
    }
    state.vehicle.active = !state.vehicle.active;
    if (state.vehicle.active) {
      state.movementMode = "walk";
      state.vehicle.pos = { ...state.player.pos };
      state.vehicle.parkedAt = "mobile";
    } else {
      state.vehicle.pos = { ...state.player.pos };
      this.updateVehicleParking();
    }
    this.notify("info", state.vehicle.active ? "Fourgon démarré" : "Fourgon arrêté", state.vehicle.active ? "Vitesse et protection accrues, bruit important." : "Déplacement à pied rétabli.");
    return true;
  }

  buildEvacuationBeacon() {
    const { state } = this;
    const campaign = state.campaign;
    if (!this.canAcceptCommand() || !state.player.atBase || campaign.beaconBuilt) return false;
    if (campaign.signalParts < campaign.requiredSignalParts || state.base.structures.radio < 2 || !this.hasResearch("evacuationProtocol")) {
      this.notify("warning", "Balise indisponible", "Il faut 3 modules, une radio niveau 2 et le protocole d’évacuation.");
      return false;
    }
    const cost = this.discountCost(EVACUATION_BEACON_COST, this.engineerDiscount());
    if (!this.hasResources(cost)) {
      this.notify("warning", "Composants insuffisants", this.formatCost(cost));
      return false;
    }
    this.consumeResources(cost);
    campaign.beaconBuilt = true;
    campaign.phase = "beacon";
    state.score += 350;
    this.log("campaign", "La balise d’évacuation est construite.");
    this.notify("success", "BALISE PRÊTE", "Appelez l’évacuation de jour lorsque la base est prête.");
    this.hooks.onSound("build");
    return true;
  }

  callEvacuation() {
    const { state } = this;
    if (!this.canAcceptCommand() || !state.player.atBase || !state.campaign.beaconBuilt || state.campaign.evacuationCalled) return false;
    if (isNight(state.totalMinutes) || state.wave.active) {
      this.notify("warning", "Transmission impossible", "Lancez l’appel de jour, hors vague active.");
      return false;
    }
    state.campaign.evacuationCalled = true;
    state.campaign.phase = "final";
    this.startFinalSiege();
    return true;
  }

  dismissNotification(id) {
    this.state.notifications = this.state.notifications.filter((item) => item.id !== id);
  }

  advanceTutorial() {
    this.state.tutorialIndex += 1;
    if (this.state.tutorialIndex >= TUTORIAL_STEPS.length) {
      this.state.tutorialVisible = false;
    }
    this.hooks.onChange(this.state);
  }

  hideTutorial() {
    this.state.tutorialVisible = false;
    this.hooks.onChange(this.state);
  }

  canAcceptCommand() {
    return this.state.status === "playing" && !this.state.paused;
  }

  poiDefenderState(poi, activityType) {
    const raw = poi?.defendersSpawned;
    return {
      spawnedBefore: raw && typeof raw === "object"
        ? Boolean(raw[activityType])
        : Boolean(raw)
    };
  }

  recallPoiDefenders(poi) {
    const defenders = this.state.zombies.filter(
      (zombie) => !zombie.dead && zombie.defenderPoiId === poi.id
    );
    defenders.forEach((zombie, index) => {
      if (distanceMeters(zombie.pos, poi.pos) <= 125) return;
      const angle = (index / Math.max(1, defenders.length)) * Math.PI * 2;
      zombie.pos = destinationPoint(poi.pos, angle, 48 + (index % 3) * 9);
      zombie.target = "player";
    });
    return defenders.length;
  }

  ensureVehicleLocation() {
    const { state } = this;
    const vehicle = state.vehicle;
    if (!vehicle) return;

    const positionIsValid =
      vehicle.pos?.lat != null &&
      vehicle.pos?.lng != null &&
      vehicle.pos.lat !== "" &&
      vehicle.pos.lng !== "" &&
      Number.isFinite(Number(vehicle.pos?.lat)) &&
      Number.isFinite(Number(vehicle.pos?.lng));
    if (!positionIsValid) {
      vehicle.pos = {
        ...(vehicle.active ? state.player.pos : state.base.pos)
      };
    } else {
      vehicle.pos = {
        lat: Number(vehicle.pos.lat),
        lng: Number(vehicle.pos.lng)
      };
    }

    if (vehicle.active) vehicle.pos = { ...state.player.pos };
    this.updateVehicleParking();
  }

  parkVehicleAtPlayer() {
    const vehicle = this.state.vehicle;
    if (!vehicle?.active) return;
    vehicle.active = false;
    vehicle.pos = { ...this.state.player.pos };
    this.updateVehicleParking();
  }

  updateVehicleParking() {
    const { state } = this;
    const vehicle = state.vehicle;
    if (!vehicle?.pos) return;
    if (vehicle.active) {
      vehicle.parkedAt = "mobile";
      return;
    }
    if (!vehicle.discovered) {
      vehicle.parkedAt = vehicle.parkedAt ?? "wreck";
      return;
    }

    if (distanceMeters(vehicle.pos, state.base.pos) <= VEHICLE_INTERACTION_RANGE_METERS) {
      vehicle.parkedAt = "base";
      return;
    }
    const nearbyOutpost = state.pois.find(
      (poi) => poi.outpost && distanceMeters(vehicle.pos, poi.pos) <= VEHICLE_INTERACTION_RANGE_METERS
    );
    vehicle.parkedAt = nearbyOutpost?.id ?? "field";
  }

  isPlayerNearVehicle() {
    this.ensureVehicleLocation();
    return (
      Boolean(this.state.vehicle?.pos) &&
      distanceMeters(this.state.player.pos, this.state.vehicle.pos) <= VEHICLE_INTERACTION_RANGE_METERS
    );
  }

  hasLivingPoiDefenders(poiId) {
    return this.state.zombies.some(
      (zombie) => !zombie.dead && zombie.defenderPoiId === poiId
    );
  }

  autosaveNow() {
    if (this.state.timers) this.state.timers.savePulse = 0;
    this.hooks.onAutosave(this.state);
  }

  isPositionInCoverage(position) {
    const { state } = this;
    const baseRange = 1450 + state.base.structures.radio * 350 + this.roleCount("scout") * 90 + (this.hasResearch("radioNetwork") ? 320 : 0);
    if (distanceMeters(state.base.pos, position) <= baseRange) return true;
    const outpostRange = 650 + state.base.structures.radio * 100 + (this.hasResearch("logistics") ? 180 : 0);
    return state.pois.some((poi) => poi.outpost && distanceMeters(poi.pos, position) <= outpostRange);
  }

  updateMovement(dt) {
    const { state } = this;
    const player = state.player;
    const target = player.target;
    const weather = this.weatherConfig();
    this.ensureVehicleLocation();
    const injuryMultiplier = player.injury === "fracture" ? 0.62 : player.injury === "sprain" ? 0.82 : 1;
    const sprinting = !state.vehicle.active && state.movementMode === "sprint" && player.stamina > 4;
    const baseSpeed = state.vehicle.active ? VEHICLE_DEFINITION.speed : sprinting ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
    const speed = baseSpeed * weather.movement * injuryMultiplier;

    if (target && !state.activity) {
      const before = { ...player.pos };
      const movement = moveToward(player.pos, target, speed * dt);
      player.pos = movement.position;
      player.heading = bearingRadians(before, player.pos);
      state.distanceTravelled += movement.travelled;

      if (state.vehicle.active) {
        const efficiency = this.hasResearch("logistics") ? 0.72 : 1;
        const fuelUsed = (movement.travelled / 1000) * VEHICLE_DEFINITION.fuelPerKilometer * efficiency;
        state.resources.fuel = Math.max(0, state.resources.fuel - fuelUsed);
        state.vehicle.distanceTravelled += movement.travelled;
        state.vehicle.condition = Math.max(0, state.vehicle.condition - movement.travelled / 3800);
        state.vehicle.pos = { ...player.pos };
        state.vehicle.parkedAt = "mobile";
        state.noise = clamp(state.noise + dt * 9.5 * weather.playerNoise, 0, 100);
        player.stamina = Math.min(player.maxStamina, player.stamina + dt * 3);
        if (state.resources.fuel <= 0 || state.vehicle.condition <= 0) {
          state.vehicle.active = false;
          state.vehicle.pos = { ...player.pos };
          this.notify("danger", state.resources.fuel <= 0 ? "Carburant épuisé" : "Véhicule immobilisé", "Le trajet continue à pied.");
        }
      } else if (sprinting) {
        player.stamina = Math.max(0, player.stamina - dt * 10.5 * weather.stamina);
        state.noise = clamp(state.noise + dt * 5.5 * weather.playerNoise, 0, 100);
      } else {
        player.stamina = Math.min(player.maxStamina, player.stamina + dt * 2.5 / weather.stamina);
        state.noise = clamp(state.noise + dt * 1.1 * weather.playerNoise, 0, 100);
      }

      if (movement.reached) {
        player.target = null;
        const poi = poiById(state, state.selectedPoiId);
        if (poi && distanceMeters(player.pos, poi.pos) <= POI_INTERACTION_RANGE) {
          poi.visited = true;
          poi.discovered = true;
          const text = poi.nest?.active
            ? "Nid actif détecté. Nettoyage requis."
            : poi.looted
              ? (poi.outpost ? "Avant-poste sécurisé." : "Le lieu a déjà été fouillé.")
              : "Position atteinte. Vous pouvez fouiller.";
          this.notify(poi.nest?.active ? "danger" : "info", poi.name, text);
        }
      }
    } else {
      player.stamina = Math.min(player.maxStamina, player.stamina + dt * (player.atBase ? 9 : player.atOutpostId ? 7 : 6) / weather.stamina);
    }

    player.atBase = distanceMeters(player.pos, state.base.pos) <= state.base.radius + 8;
    const nearbyOutpost = state.pois.find((poi) => poi.outpost && distanceMeters(player.pos, poi.pos) <= OUTPOST_SAFE_RADIUS);
    player.atOutpostId = nearbyOutpost?.id ?? null;
    if (state.vehicle.active) state.vehicle.pos = { ...player.pos };
    this.updateVehicleParking();
  }

  updateActivity(dt) {
    const { state } = this;
    const activity = state.activity;
    if (!activity) return;
    const poi = poiById(state, activity.poiId);
    if (!poi) {
      state.activity = null;
      return;
    }

    activity.blocked = this.hasLivingPoiDefenders(poi.id);
    if (!activity.blocked) activity.elapsed += dt;
    state.noise = clamp(state.noise + dt * (activity.type === "clearNest" ? 3.8 : 2.5), 0, 100);

    if (activity.elapsed >= activity.duration) {
      if (activity.type === "scavenge" && !poi.looted) this.completeScavenge(poi);
      if (activity.type === "clearNest" && poi.nest?.active) this.completeNestClearance(poi);
      state.activity = null;
    }
  }

  completeScavenge(poi) {
    const { state } = this;
    const vehicleSupport =
      state.vehicle.repaired &&
      this.isPlayerNearVehicle();
    const scoutBonus = 1 + this.roleCount("scout") * 0.05 + (vehicleSupport ? 0.15 : 0);
    const loot = rollPoiLoot(poi, state.difficultyId, scoutBonus);
    for (const [resource, amount] of Object.entries(loot)) {
      state.resources[resource] = (state.resources[resource] ?? 0) + amount;
    }
    poi.looted = true;
    poi.currentThreat = 0;
    state.locationsLooted += 1;
    state.score += 70 + poi.danger * 20;
    const summary = Object.entries(loot)
      .map(([resource, amount]) => `${resource} +${amount}`)
      .join(", ");
    this.log("loot", `${poi.name} fouillé : ${summary || "rien d’utilisable"}.`);
    this.notify("success", "Expédition réussie", summary || "Aucun matériel récupérable.");
    this.hooks.onSound("loot");

    if (poi.campaignSignalPart && !poi.signalPartCollected) {
      poi.signalPartCollected = true;
      state.campaign.signalParts += 1;
      state.resources.intel += 1;
      state.campaign.phase = state.campaign.signalParts >= state.campaign.requiredSignalParts ? "research" : "signal";
      this.log("campaign", `Module de signal récupéré (${state.campaign.signalParts}/${state.campaign.requiredSignalParts}).`);
      this.notify("success", "MODULE DE SIGNAL", `${state.campaign.signalParts}/${state.campaign.requiredSignalParts} récupérés.`);
    }

    if (poi.vehicleWreck && !state.vehicle.discovered) {
      state.vehicle.discovered = true;
      state.vehicle.pos = { ...state.base.pos };
      state.vehicle.parkedAt = "base";
      this.log("vehicle", "Un fourgon réparable a été remorqué jusqu’à la base.");
      this.notify("success", "VÉHICULE RÉCUPÉRÉ", "Recherchez la mécanique puis réparez-le à la base.");
    }

    this.completeMissionsForPoi(poi, "scavenge");

    if ((poi.type === "school" || poi.type === "bunker") && this.random() < 0.08 + this.roleCount("scout") * 0.02) {
      this.addSurvivor("Un survivant isolé rejoint spontanément la base.");
    }
  }

  completeNestClearance(poi) {
    const { state } = this;
    const strength = poi.nest.strength;
    poi.nest.active = false;
    poi.currentThreat = 0;
    state.nestsCleared += 1;
    const intel = strength + (this.hasResearch("virology") ? 2 : 1);
    state.resources.intel += intel;
    state.threat = Math.max(0, state.threat - 5 * strength);
    state.score += 140 + strength * 80;
    this.log("nest", `Nid détruit à ${poi.name}.`);
    this.notify("success", "NID ÉRADIQUÉ", `Menace réduite, +${intel} renseignements.`);
    this.completeMissionsForPoi(poi, "nest");
    this.hooks.onSound("victory");
  }

  updateDiscoveries() {
    const { state } = this;
    const revealDistance = 170 + state.base.structures.radio * 220 + this.roleCount("scout") * 90 + (this.hasResearch("radioNetwork") ? 180 : 0);
    for (const poi of state.pois) {
      const nearPlayer = distanceMeters(state.player.pos, poi.pos) <= revealDistance;
      const nearOutpost = state.pois.some(
        (outpost) => outpost.outpost && distanceMeters(outpost.pos, poi.pos) <= 380
      );
      if (!poi.discovered && (nearPlayer || nearOutpost)) {
        poi.discovered = true;
        this.log("radio", `Lieu repéré : ${poi.name}.`);
      }
    }
  }

  updateWeather(gameMinutesDelta) {
    const { state } = this;
    state.weather.remainingMinutes -= gameMinutesDelta;
    if (state.weather.remainingMinutes > 0) return;
    const options = Object.keys(WEATHER_TYPES).filter((id) => id !== state.weather.type);
    const day = gameDay(state.totalMinutes);
    const weighted = options.map((id) => ({
      id,
      weight: id === "storm" ? Math.min(1.8, 0.45 + day * 0.08) : id === "clear" ? 2.4 : 1.3
    }));
    let cursor = this.random() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let selected = weighted[0].id;
    for (const entry of weighted) {
      cursor -= entry.weight;
      if (cursor <= 0) {
        selected = entry.id;
        break;
      }
    }
    state.weather.type = selected;
    state.weather.remainingMinutes = selected === "storm" ? this.randomInt(150, 300) : this.randomInt(260, 620);
    state.weather.changes += 1;
    const weather = WEATHER_TYPES[selected];
    this.log("weather", `Météo : ${weather.label}.`);
    this.notify(selected === "storm" ? "warning" : "info", weather.label.toUpperCase(), weather.description);
  }

  updateMissions() {
    const { state } = this;
    const expired = state.missions.active.filter((mission) => state.totalMinutes >= mission.expiresAtMinutes);
    if (expired.length === 0) return;
    for (const mission of expired) {
      mission.status = "expired";
      state.missions.history.unshift(mission);
      const poi = poiById(state, mission.poiId);
      if (poi && poi.missionMarker === mission.type) poi.missionMarker = null;
      this.log("mission", `Mission expirée : ${mission.title}.`);
    }
    state.missions.active = state.missions.active.filter((mission) => mission.status === "active");
    state.missions.history = state.missions.history.slice(0, 30);
  }

  updateDailySystems(previousMinutes, currentMinutes, gameMinutesDelta) {
    const { state } = this;
    const currentDay = gameDay(currentMinutes);

    if (crossedMinute(previousMinutes, currentMinutes, 6 * 60)) {
      const level = state.base.structures.garden;
      const farmers = this.roleCount("farmer");
      if (level > 0 || farmers > 0) {
        const food = 3 + level * 4 + farmers * 3;
        const water = 4 + level * 5 + farmers * 2;
        state.resources.food += food;
        state.resources.water += water;
        this.log("base", `Production matinale : ${food} nourriture et ${water} eau.`);
        this.notify("success", "Récolte matinale", `+${food} nourriture, +${water} eau.`);
      }
      state.lastGardenProductionDay = currentDay;
    }

    if (crossedMinute(previousMinutes, currentMinutes, 6 * 60 + 20)) {
      this.produceOutpostResources(currentDay);
    }

    if (crossedMinute(previousMinutes, currentMinutes, 7 * 60)) {
      const survivorCount = state.base.roster.length;
      state.base.survivors = survivorCount;
      const foodNeed = Math.max(2, survivorCount * 2);
      const waterNeed = Math.max(3, survivorCount * 3);
      const missingFood = Math.max(0, foodNeed - state.resources.food);
      const missingWater = Math.max(0, waterNeed - state.resources.water);
      state.resources.food = Math.max(0, state.resources.food - foodNeed);
      state.resources.water = Math.max(0, state.resources.water - waterNeed);
      if (missingFood || missingWater) {
        state.base.morale = Math.max(0, state.base.morale - 8 - missingFood - missingWater);
        state.player.health = Math.max(1, state.player.health - missingFood * 1.5 - missingWater * 2);
        for (const survivor of state.base.roster) survivor.morale = Math.max(0, survivor.morale - 8);
        this.notify("danger", "Rations insuffisantes", "Le moral et la santé se dégradent.");
      } else {
        state.base.morale = Math.min(100, state.base.morale + 2);
        for (const survivor of state.base.roster) survivor.morale = Math.min(100, survivor.morale + 1);
        this.log("base", `Rations distribuées à ${survivorCount} survivants.`);
      }
      state.lastDailyConsumptionDay = currentDay;
    }

    if (crossedMinute(previousMinutes, currentMinutes, 9 * 60)) {
      this.generateDailyMissions(currentDay);
    }

    if (crossedMinute(previousMinutes, currentMinutes, 18 * 60)) {
      const activeNests = state.pois.filter((poi) => poi.nest?.active).length;
      if (activeNests > 0) {
        state.threat = clamp(state.threat + activeNests * 2.5, 0, 100);
        this.log("nest", `${activeNests} nid(s) alimentent la menace du secteur.`);
      }
    }

    if (crossedMinute(previousMinutes, currentMinutes, 20 * 60) && !state.campaign.finalSiegeStarted) {
      this.startNightWave(currentDay);
    }

    const generatorLevel = state.base.structures.generator;
    const shouldRunGenerator = isNight(currentMinutes) && generatorLevel > 0 && state.resources.fuel > 0;
    state.base.generatorOnline = shouldRunGenerator;
    if (shouldRunGenerator) {
      state.timers.generatorFuelPulse += gameMinutesDelta;
      const consumptionPeriod = 105 + generatorLevel * 18;
      const consumedFuel = Math.min(
        state.resources.fuel,
        Math.floor(state.timers.generatorFuelPulse / consumptionPeriod)
      );
      state.timers.generatorFuelPulse -= consumedFuel * consumptionPeriod;
      state.resources.fuel = Math.max(0, state.resources.fuel - consumedFuel);
    } else {
      state.timers.generatorFuelPulse = Math.min(state.timers.generatorFuelPulse, 30);
    }
  }

  produceOutpostResources(currentDay) {
    const { state } = this;
    const outposts = state.pois.filter((poi) => poi.outpost);
    if (outposts.length === 0) return;
    const multiplier = this.hasResearch("logistics") ? 1.5 : 1;
    const total = {};
    for (const poi of outposts) {
      const yields = POI_TYPES[poi.type]?.outpostYield ?? { food: 1 };
      for (const [resource, amount] of Object.entries(yields)) {
        const produced = Math.max(1, Math.round(amount * multiplier));
        state.resources[resource] = (state.resources[resource] ?? 0) + produced;
        total[resource] = (total[resource] ?? 0) + produced;
      }
    }
    state.lastOutpostProductionDay = currentDay;
    const summary = Object.entries(total).map(([id, amount]) => `${id} +${amount}`).join(", ");
    this.log("outpost", `Production des avant-postes : ${summary}.`);
    this.notify("success", "RÉSEAU D’AVANT-POSTES", summary);
  }

  generateDailyMissions(day) {
    const { state } = this;
    if (state.missions.lastGeneratedDay >= day) return;
    state.missions.lastGeneratedDay = day;
    const maxActive = Math.min(5, 2 + state.base.structures.radio + (this.hasResearch("radioNetwork") ? 1 : 0));
    const occupied = new Set(state.missions.active.map((mission) => mission.poiId));

    while (state.missions.active.length < maxActive) {
      const options = [];
      if (!state.vehicle.discovered) {
        const poi = state.pois.find((item) => item.vehicleWreck && !item.looted && !occupied.has(item.id));
        if (poi) options.push({ type: "vehicle", poi, weight: 3 });
      }
      const nestPois = state.pois.filter((poi) => poi.nest?.active && !occupied.has(poi.id));
      if (nestPois.length) options.push({ type: "nest", poi: nestPois[this.randomInt(0, nestPois.length - 1)], weight: 3 });
      const rescuePois = state.pois.filter((poi) => !poi.looted && ["house", "school", "bunker"].includes(poi.type) && !occupied.has(poi.id));
      if (rescuePois.length) options.push({ type: "rescue", poi: rescuePois[this.randomInt(0, rescuePois.length - 1)], weight: 2 });
      const intelPois = state.pois.filter((poi) => !poi.looted && ["police", "clinic", "bunker"].includes(poi.type) && !occupied.has(poi.id));
      if (intelPois.length) options.push({ type: "intel", poi: intelPois[this.randomInt(0, intelPois.length - 1)], weight: 2 });
      const supplyPois = state.pois.filter((poi) => !poi.looted && !occupied.has(poi.id));
      if (supplyPois.length) options.push({ type: "supply", poi: supplyPois[this.randomInt(0, supplyPois.length - 1)], weight: 4 });
      if (options.length === 0) break;

      let cursor = this.random() * options.reduce((sum, option) => sum + option.weight, 0);
      let selected = options[0];
      for (const option of options) {
        cursor -= option.weight;
        if (cursor <= 0) {
          selected = option;
          break;
        }
      }
      selected.poi.discovered = true;
      selected.poi.missionMarker = selected.type;
      const mission = createMission({
        type: selected.type,
        poi: selected.poi,
        totalMinutes: state.totalMinutes,
        difficultyId: state.difficultyId,
        index: state.missions.active.length + state.missions.history.length
      });
      state.missions.active.push(mission);
      occupied.add(selected.poi.id);
    }

    if (state.missions.active.length > 0) {
      this.notify("info", "NOUVELLES TRANSMISSIONS", `${state.missions.active.length} mission(s) active(s).`);
    }
  }

  completeMissionsForPoi(poi, trigger) {
    const { state } = this;
    const completed = state.missions.active.filter((mission) => {
      if (mission.poiId !== poi.id) return false;
      return mission.type === "nest" ? trigger === "nest" : trigger === "scavenge";
    });
    for (const mission of completed) {
      mission.status = "completed";
      mission.completedAtMinutes = state.totalMinutes;
      state.missionsCompleted += 1;
      state.score += 180;
      this.applyMissionReward(mission);
      state.missions.history.unshift(mission);
      if (poi.missionMarker === mission.type) poi.missionMarker = null;
      this.log("mission", `Mission accomplie : ${mission.title}.`);
    }
    if (completed.length > 0) {
      state.missions.active = state.missions.active.filter((mission) => mission.status === "active");
      state.missions.history = state.missions.history.slice(0, 30);
    }
  }

  applyMissionReward(mission) {
    const { state } = this;
    if (mission.type === "rescue") {
      this.addSurvivor("La personne secourue rejoint la communauté.");
      state.resources.intel += 1;
    } else if (mission.type === "supply") {
      const food = 6 + this.randomInt(0, 6);
      const water = 6 + this.randomInt(0, 6);
      const ammo = 5 + this.randomInt(0, 8);
      state.resources.food += food;
      state.resources.water += water;
      state.resources.ammo += ammo;
      this.notify("success", "RÉSERVE SÉCURISÉE", `+${food} nourriture, +${water} eau, +${ammo} munitions.`);
    } else if (mission.type === "intel") {
      const intel = 3 + this.roleCount("scout");
      state.resources.intel += intel;
      this.notify("success", "ARCHIVES RÉCUPÉRÉES", `+${intel} renseignements.`);
    } else if (mission.type === "vehicle") {
      state.vehicle.discovered = true;
      state.vehicle.pos = { ...state.base.pos };
      state.vehicle.parkedAt = "base";
      state.resources.parts += 3;
      this.notify("success", "FOURGON LOCALISÉ", "Le véhicule est disponible dans l’atelier de la base.");
    } else if (mission.type === "nest") {
      state.resources.intel += 2;
      state.base.morale = Math.min(100, state.base.morale + 6);
      this.notify("success", "SECTEUR ASSAINI", "+2 renseignements et moral renforcé.");
    }
  }

  addSurvivor(message) {
    const { state } = this;
    const survivor = createSurvivor(() => this.random(), state.base.roster.length, "idle");
    survivor.joinedDay = gameDay(state.totalMinutes);
    state.base.roster.push(survivor);
    state.base.survivors = state.base.roster.length;
    state.base.morale = Math.min(100, state.base.morale + 8);
    this.log("survivor", `${survivor.name} rejoint la base.`);
    this.notify("success", "SURVIVANT SECOURU", `${survivor.name} — ${message}`);
    return survivor;
  }

  startNightWave(day) {
    const { state } = this;
    if (state.wave.active || state.campaign.finalSiegeStarted) return;
    const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.normal;
    const count = Math.ceil((9 + day * 5 + state.threat * 0.12) * difficulty.spawnRate);
    const bossQueued = day >= 3 && day % 3 === 0 ? 1 : 0;
    state.wave = {
      active: true,
      number: day,
      queued: count,
      total: count,
      spawned: 0,
      defeated: 0,
      nextSpawnIn: 0,
      announcedDay: day,
      bossQueued,
      final: false
    };
    state.threat = clamp(state.threat + 8, 0, 100);
    this.log("wave", `Vague nocturne ${day} détectée : environ ${count} infectés.`);
    this.notify("danger", `VAGUE ${day}`, `${count} signatures convergent vers la base${bossQueued ? ", dont un alpha" : ""}.`);
    this.hooks.onSound("wave");
  }

  startFinalSiege() {
    const { state } = this;
    const day = gameDay(state.totalMinutes);
    const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.normal;
    const count = Math.ceil((36 + day * 6 + state.threat * 0.2) * difficulty.spawnRate);
    state.campaign.finalSiegeStarted = true;
    state.wave = {
      active: true,
      number: day,
      queued: count,
      total: count,
      spawned: 0,
      defeated: 0,
      nextSpawnIn: 0,
      announcedDay: day,
      bossQueued: 2,
      final: true
    };
    state.threat = 100;
    this.log("campaign", `Appel d’évacuation envoyé. Dernière horde : ${count} signatures.`);
    this.notify("danger", "SIÈGE FINAL", "La balise attire toute la horde. Tenez jusqu’à l’arrivée du convoi.");
    this.hooks.onSound("wave");
  }

  updateSpawning(dt) {
    const { state } = this;
    const day = gameDay(state.totalMinutes);
    const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.normal;
    const weather = this.weatherConfig();

    if (state.wave.active && state.wave.queued > 0 && state.zombies.length < MAX_ZOMBIES) {
      state.wave.nextSpawnIn -= dt;
      if (state.wave.nextSpawnIn <= 0) {
        const forceBoss = state.wave.bossQueued > 0 && (state.wave.queued <= state.wave.bossQueued || state.wave.spawned >= 3 && this.random() < 0.22);
        const zombie = this.makeZombie(state.base.pos, day, true, forceBoss ? "alpha" : undefined);
        state.zombies.push(zombie);
        state.wave.queued -= 1;
        state.wave.spawned += 1;
        if (forceBoss) state.wave.bossQueued -= 1;
        state.wave.nextSpawnIn = this.randomBetween(0.42, 1.05) / Math.max(0.7, difficulty.spawnRate * weather.spawnRate);
      }
    }

    if (state.wave.final) return;

    state.timers.ambientSpawn -= dt;
    const ambientCap = Math.min(44, Math.ceil((8 + day * 3 + state.threat * 0.1) * difficulty.spawnRate * weather.spawnRate));
    const ambientCount = state.zombies.filter((zombie) => !zombie.wave && !zombie.dead).length;
    if (
      state.timers.ambientSpawn <= 0 &&
      ambientCount < ambientCap &&
      state.zombies.length < MAX_ZOMBIES &&
      (!state.wave.active || this.random() < 0.25)
    ) {
      const activeNests = state.pois.filter((poi) => poi.nest?.active);
      const nestOrigin = activeNests.length > 0 && this.random() < 0.45
        ? activeNests[this.randomInt(0, activeNests.length - 1)].pos
        : null;
      const origin = nestOrigin ?? (this.random() < 0.55 ? state.player.pos : state.base.pos);
      state.zombies.push(this.makeZombie(origin, day, false));
      const nightFactor = isNight(state.totalMinutes) ? 0.62 : 1;
      state.timers.ambientSpawn = this.randomBetween(5.5, 10.5) * nightFactor / (difficulty.spawnRate * weather.spawnRate);
    }

    state.timers.nestSpawn -= dt;
    if (state.timers.nestSpawn <= 0) {
      const activeNests = state.pois.filter((poi) => poi.nest?.active && poi.discovered);
      if (activeNests.length > 0 && state.zombies.length < MAX_ZOMBIES) {
        const nest = activeNests[this.randomInt(0, activeNests.length - 1)];
        const zombie = this.makeZombie(nest.pos, day, false, nest.nest.strength >= 2 && this.random() < 0.4 ? "spitter" : undefined);
        zombie.pos = destinationPoint(nest.pos, this.randomBetween(0, Math.PI * 2), this.randomBetween(25, 65));
        state.zombies.push(zombie);
      }
      state.timers.nestSpawn = this.randomBetween(20, 38);
    }
  }

  makeZombie(origin, day, wave, typeId) {
    return createZombie({
      origin,
      random: () => this.random(),
      day,
      difficultyId: this.state.difficultyId,
      wave,
      typeId
    });
  }

  spawnPoiDefenders(poi, nestAssault = false) {
    const { state } = this;
    const activityType = nestAssault ? "clearNest" : "scavenge";
    const rawSpawned = poi.defendersSpawned;
    poi.defendersSpawned = rawSpawned && typeof rawSpawned === "object"
      ? {
          scavenge: Boolean(rawSpawned.scavenge),
          clearNest: Boolean(rawSpawned.clearNest)
        }
      : {
          scavenge: Boolean(rawSpawned),
          clearNest: Boolean(rawSpawned)
        };
    if (poi.defendersSpawned[activityType]) return 0;
    const day = gameDay(state.totalMinutes);
    const strength = nestAssault ? poi.nest?.strength ?? 1 : 0;
    const count = Math.min(11, 1 + poi.danger + strength * 2 + this.randomInt(0, 2));
    let spawned = 0;
    for (let index = 0; index < count && state.zombies.length < MAX_ZOMBIES; index += 1) {
      let typeId;
      if (nestAssault && index === 0 && strength >= 2) typeId = "spitter";
      if (nestAssault && index === 1 && strength >= 3) typeId = "armored";
      const zombie = this.makeZombie(poi.pos, day, false, typeId);
      const angle = this.randomBetween(0, Math.PI * 2);
      zombie.pos = destinationPoint(poi.pos, angle, this.randomBetween(28, 82));
      zombie.defenderPoiId = poi.id;
      state.zombies.push(zombie);
      spawned += 1;
    }
    if (spawned > 0) poi.defendersSpawned[activityType] = true;
    return spawned;
  }

  updateZombies(dt) {
    const { state } = this;
    const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.normal;
    const weather = this.weatherConfig();
    const generatorDefense = state.base.generatorOnline ? 0.78 : 1;

    for (const zombie of state.zombies) {
      if (zombie.dead) continue;
      const config = ZOMBIE_TYPES[zombie.type] ?? ZOMBIE_TYPES.walker;
      zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);
      zombie.stagger = Math.max(0, zombie.stagger - dt);
      zombie.screamCooldown = Math.max(0, zombie.screamCooldown - dt);

      const distanceToPlayer = distanceMeters(zombie.pos, state.player.pos);
      const distanceToBase = distanceMeters(zombie.pos, state.base.pos);
      const playerSafeAtOutpost = Boolean(state.player.atOutpostId) && distanceToPlayer > 18;
      const detection = (config.detection + state.noise * 1.65 + (isNight(state.totalMinutes) ? 25 : 0)) * weather.zombieDetection;
      const targetPlayer = !playerSafeAtOutpost && distanceToPlayer < detection && (distanceToPlayer < distanceToBase + 45 || !state.player.atBase);
      zombie.target = targetPlayer ? "player" : "base";

      if (zombie.type === "screamer" && zombie.screamCooldown <= 0 && distanceToPlayer < 155) {
        zombie.screamCooldown = this.randomBetween(15, 23);
        state.noise = clamp(state.noise + 18, 0, 100);
        state.threat = clamp(state.threat + 4, 0, 100);
        if (state.zombies.length < MAX_ZOMBIES) {
          const summoned = this.makeZombie(zombie.pos, gameDay(state.totalMinutes), false, "walker");
          summoned.pos = destinationPoint(zombie.pos, this.randomBetween(0, Math.PI * 2), this.randomBetween(45, 90));
          state.zombies.push(summoned);
        }
        this.addEffect("scream", zombie.pos, zombie.pos, 0.55);
        this.hooks.onSound("scream");
      }

      if (zombie.target === "player") {
        const attackDistance = 1.7 + config.radius * 0.11;
        if (zombie.type === "spitter" && distanceToPlayer <= config.rangedRange && distanceToPlayer > attackDistance + 3) {
          if (zombie.attackCooldown <= 0) {
            zombie.attackCooldown = config.attackEvery;
            this.damagePlayer(config.damage * difficulty.zombieDamage, zombie.type);
            this.addEffect("spit", zombie.pos, state.player.pos, 0.34);
          }
        } else if (distanceToPlayer <= attackDistance) {
          if (zombie.attackCooldown <= 0) {
            zombie.attackCooldown = config.attackEvery;
            this.damagePlayer(config.damage * difficulty.zombieDamage, zombie.type);
          }
        } else if (zombie.stagger <= 0) {
          const move = moveToward(zombie.pos, state.player.pos, config.speed * dt);
          zombie.heading = bearingRadians(zombie.pos, move.position);
          zombie.pos = move.position;
        }
      } else {
        const wallPresent = state.base.wallMaxHealth > 0 && state.base.wallHealth > 0;
        const attackDistance = wallPresent ? state.base.radius + 1.5 : 4.5;
        const targetPos = state.base.pos;
        if (zombie.type === "spitter" && distanceToBase <= config.rangedRange && distanceToBase > attackDistance + 4) {
          if (zombie.attackCooldown <= 0) {
            zombie.attackCooldown = config.attackEvery;
            const damage = config.damage * difficulty.zombieDamage * generatorDefense;
            if (wallPresent) state.base.wallHealth = Math.max(0, state.base.wallHealth - damage);
            else state.base.health = Math.max(0, state.base.health - damage);
            this.addEffect("spit", zombie.pos, targetPos, 0.34);
          }
        } else if (distanceToBase <= attackDistance) {
          if (zombie.attackCooldown <= 0) {
            zombie.attackCooldown = config.attackEvery;
            const damage = config.damage * difficulty.zombieDamage * generatorDefense;
            if (wallPresent) {
              state.base.wallHealth = Math.max(0, state.base.wallHealth - damage);
              this.addEffect("impact", zombie.pos, state.base.pos, 0.22);
            } else {
              state.base.health = Math.max(0, state.base.health - damage);
              this.addEffect("impact", zombie.pos, state.base.pos, 0.22);
            }
          }
        } else if (zombie.stagger <= 0) {
          const move = moveToward(zombie.pos, targetPos, config.speed * dt);
          zombie.heading = bearingRadians(zombie.pos, move.position);
          zombie.pos = move.position;
        }
      }
    }

    state.zombies = state.zombies.filter((zombie) => !zombie.dead);

    this.checkEndConditions();
    if (state.status !== "playing") return;

    if (state.autoFire && state.player.fireCooldown <= 0) {
      const nearest = closestEntity(
        state.player.pos,
        state.zombies,
        (zombie) => !zombie.dead && distanceMeters(state.player.pos, zombie.pos) <= PLAYER_FIRE_RANGE
      );
      if (nearest) this.performShot({ automated: true, target: nearest.entity });
    }

    state.zombies = state.zombies.filter((zombie) => !zombie.dead);
    this.resolveWaveCompletion();
  }

  resolveWaveCompletion() {
    const { state } = this;
    if (!state.wave.active || state.wave.queued > 0) return false;
    const hostileAlive = state.wave.final
      ? state.zombies.some((zombie) => !zombie.dead)
      : state.zombies.some((zombie) => zombie.wave && !zombie.dead);
    if (hostileAlive) return false;
    return this.completeWave();
  }

  completeWave() {
    const { state } = this;
    const wasFinal = state.wave.final;
    this.checkEndConditions();
    if (state.status !== "playing") return false;
    if (wasFinal && state.zombies.some((zombie) => !zombie.dead)) return false;
    state.wave.active = false;
    if (wasFinal) {
      state.campaign.finalSiegeDefeated = true;
      state.campaign.phase = "victory";
      state.campaign.victoryAt = state.totalMinutes;
      state.status = "victory";
      state.paused = true;
      state.score += 2500;
      this.log("campaign", "La horde finale est détruite. Le convoi d’évacuation atteint la base.");
      this.notify("success", "ÉVACUATION RÉUSSIE", `Campagne terminée au jour ${gameDay(state.totalMinutes)}.`);
      this.hooks.onSound("victory");
      this.hooks.onChange(state);
      this.autosaveNow();
      return true;
    }

    const rewardAmmo = 8 + state.wave.number * 2;
    const rewardParts = 1 + Math.floor(state.wave.number / 2);
    const rewardIntel = state.wave.number % 3 === 0 ? 2 : 1;
    const rewardMetal = WAVE_RECOVERY_REWARDS.metalBase + Math.ceil(state.wave.number * WAVE_RECOVERY_REWARDS.metalDayFactor);
    const rewardFuel = WAVE_RECOVERY_REWARDS.fuelBase + Math.floor(state.wave.number / WAVE_RECOVERY_REWARDS.fuelEveryDays);
    state.resources.ammo += rewardAmmo;
    state.resources.parts += rewardParts;
    state.resources.intel += rewardIntel;
    state.resources.metal += rewardMetal;
    state.resources.fuel += rewardFuel;
    state.score += 250 + state.wave.number * 100;
    state.base.morale = Math.min(100, state.base.morale + 10);
    this.resolveSurvivorWaveRisk();
    this.log("wave", `Vague ${state.wave.number} repoussée.`);
    this.notify(
      "success",
      "AUBE SÉCURISÉE",
      `Récupération : +${rewardAmmo} munitions, +${rewardParts} pièces, +${rewardMetal} métal, +${rewardFuel} carburant, +${rewardIntel} renseignement(s).`
    );
    this.hooks.onSound("victory");
    return true;
  }

  resolveSurvivorWaveRisk() {
    const { state } = this;
    const damageRatio = 1 - state.base.health / state.base.maxHealth;
    const wallRatio = state.base.wallMaxHealth > 0 ? 1 - state.base.wallHealth / state.base.wallMaxHealth : 0.55;
    const risk = clamp((damageRatio + wallRatio) * 0.22 - this.roleCount("guard") * 0.025, 0, 0.38);
    if (state.base.roster.length > 1 && this.random() < risk) {
      const candidates = state.base.roster.filter((survivor) => !survivor.injured);
      const survivor = candidates[this.randomInt(0, Math.max(0, candidates.length - 1))];
      if (survivor) {
        survivor.injured = true;
        survivor.health = Math.max(35, survivor.health - this.randomInt(20, 45));
        this.log("survivor", `${survivor.name} a été blessé pendant la défense.`);
        this.notify("warning", "SURVIVANT BLESSÉ", `${survivor.name} nécessite des soins.`);
      }
    }
  }

  updateAutomatedDefense() {
    const { state } = this;
    const weather = this.weatherConfig();
    const fortification = this.hasResearch("fortification") ? 1.35 : 1;
    const ballistics = this.hasResearch("ballistics") ? 1.22 : 1;

    const towerLevel = state.base.structures.watchtower;
    if (towerLevel > 0 && state.base.turretCooldown <= 0 && state.resources.ammo > 0) {
      const range = 72 + towerLevel * 24;
      const nearest = closestEntity(
        state.base.pos,
        state.zombies,
        (zombie) => !zombie.dead && distanceMeters(state.base.pos, zombie.pos) <= range
      );
      if (nearest) {
        const generatorMultiplier = state.base.generatorOnline ? 1.35 : 1;
        const stormEfficiency = weather.turretEfficiency ?? 1;
        const damage = (24 + towerLevel * 14) * generatorMultiplier * fortification * stormEfficiency;
        state.resources.ammo -= 1;
        state.base.turretCooldown = Math.max(0.28, 1.42 - towerLevel * 0.26) / stormEfficiency;
        this.damageZombie(nearest.entity, damage, "turret");
        this.addEffect("tracer", state.base.pos, nearest.entity.pos, 0.16);
        this.hooks.onSound("turret");
      }
    }

    const guards = this.roleCount("guard");
    if (guards > 0 && state.base.guardCooldown <= 0 && state.resources.ammo > 0) {
      const range = 82 + guards * 7;
      const nearest = closestEntity(
        state.base.pos,
        state.zombies,
        (zombie) => !zombie.dead && distanceMeters(state.base.pos, zombie.pos) <= range
      );
      if (nearest) {
        state.resources.ammo -= 1;
        state.base.guardCooldown = Math.max(0.48, 1.75 - guards * 0.16);
        this.damageZombie(nearest.entity, (14 + guards * 2.8) * ballistics * fortification, "guard");
        this.addEffect("tracer", state.base.pos, nearest.entity.pos, 0.14);
        this.hooks.onSound("turret");
      }
    }
  }

  updateTraps() {
    const { state } = this;
    if (state.base.traps <= 0 || state.base.trapCooldown > 0) return;
    const range = state.base.radius + 18;
    const nearest = closestEntity(
      state.base.pos,
      state.zombies,
      (zombie) => !zombie.dead && distanceMeters(state.base.pos, zombie.pos) <= range
    );
    if (!nearest) return;
    state.base.traps -= 1;
    state.base.trapCooldown = 0.8;
    const damage = this.hasResearch("fortification") ? 145 : 105;
    this.damageZombie(nearest.entity, damage, "trap");
    this.addEffect("explosion", nearest.entity.pos, nearest.entity.pos, 0.48);
    state.noise = clamp(state.noise + 12, 0, 100);
    this.hooks.onSound("kill");
  }

  performShot(options = {}) {
    const { automated = false, target = null } = options;
    const { state } = this;
    if (!this.canAcceptCommand() || state.player.fireCooldown > 0 || state.resources.ammo <= 0) {
      if (!automated && state.resources.ammo <= 0) this.notify("danger", "Chargeur vide", "Trouvez des munitions.");
      return false;
    }

    const nearest = target
      ? { entity: target, distance: distanceMeters(state.player.pos, target.pos) }
      : closestEntity(
          state.player.pos,
          state.zombies,
          (zombie) => !zombie.dead && distanceMeters(state.player.pos, zombie.pos) <= PLAYER_FIRE_RANGE
        );

    if (!nearest || nearest.distance > PLAYER_FIRE_RANGE) {
      if (!automated) this.notify("warning", "Aucune cible", "Aucun infecté à portée de tir.");
      return false;
    }

    const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.normal;
    const weather = this.weatherConfig();
    const workshopBonus = state.base.structures.workshop * 3.5;
    const researchMultiplier = this.hasResearch("ballistics") ? 1.22 : 1;
    const critical = this.random() < 0.12 + state.base.structures.workshop * 0.025;
    const hitChance = clamp(weather.accuracy + (this.hasResearch("ballistics") ? 0.08 : 0), 0.55, 1);
    const damage = (34 + workshopBonus) * difficulty.playerDamage * researchMultiplier * (critical ? 1.8 : 1);
    state.resources.ammo -= 1;
    state.player.fireCooldown = automated ? 0.68 : 0.42;
    state.noise = clamp(state.noise + (automated ? 7 : 10) * weather.playerNoise, 0, 100);
    state.threat = clamp(state.threat + 0.35, 0, 100);

    if (this.random() <= hitChance) {
      this.damageZombie(nearest.entity, damage, "gun");
      this.addEffect("tracer", state.player.pos, nearest.entity.pos, 0.14);
    } else {
      const miss = destinationPoint(nearest.entity.pos, this.randomBetween(0, Math.PI * 2), this.randomBetween(5, 13));
      this.addEffect("tracer", state.player.pos, miss, 0.14);
      if (!automated) this.notify("warning", "Tir manqué", `${WEATHER_TYPES[state.weather.type].label} réduit la précision.`);
    }
    this.hooks.onSound("shot");
    return true;
  }

  damageZombie(zombie, amount, source) {
    if (!zombie || zombie.dead) return;
    const config = ZOMBIE_TYPES[zombie.type] ?? ZOMBIE_TYPES.walker;
    const armor = source === "trap" ? 0 : config.armor ?? 0;
    zombie.health -= amount * (1 - armor);
    zombie.stagger = source === "melee" ? 0.35 : source === "trap" ? 0.55 : 0.14;
    this.addEffect("hit", zombie.pos, zombie.pos, 0.2);

    if (zombie.health <= 0) {
      zombie.dead = true;
      this.state.kills += 1;
      this.state.score += config.score;
      if (config.boss) {
        this.state.bossKills += 1;
        this.state.resources.intel += 2;
        this.notify("success", "ALPHA ÉLIMINÉ", "+2 renseignements récupérés sur la mutation.");
      }
      if (zombie.wave) this.state.wave.defeated += 1;
      if (this.random() < 0.08) this.state.resources.ammo += 1;
      this.addEffect("kill", zombie.pos, zombie.pos, config.boss ? 0.8 : 0.45);
      this.hooks.onSound("kill");
    }
  }

  damagePlayer(amount, zombieType = "walker") {
    const { state } = this;
    if (state.player.invulnerability > 0) return;
    const config = ZOMBIE_TYPES[zombieType] ?? ZOMBIE_TYPES.walker;
    let incoming = amount;
    if (state.vehicle.active && state.vehicle.condition > 0) {
      const absorbed = incoming * VEHICLE_DEFINITION.damageReduction;
      incoming -= absorbed;
      state.vehicle.condition = Math.max(0, state.vehicle.condition - absorbed * 0.9);
      if (state.vehicle.condition <= 0) {
        state.vehicle.active = false;
        state.vehicle.pos = { ...state.player.pos };
        this.updateVehicleParking();
        this.notify("danger", "FOURGON HORS SERVICE", "Le blindage a cédé. Réparez-le avec un kit.");
      }
    }
    const armorReduction = clamp(state.player.armor / 100, 0, 0.55);
    const damage = Math.max(1, incoming * (1 - armorReduction));
    state.player.health = Math.max(0, state.player.health - damage);
    state.player.invulnerability = 0.32;
    state.base.morale = Math.max(0, state.base.morale - 0.25);

    const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.normal;
    let infectionResistance = this.hasResearch("virology") ? 0.58 : this.hasResearch("triage") ? 0.78 : 1;
    if (state.base.structures.infirmary >= 3) infectionResistance *= 0.88;
    const infectionGain = config.infection * difficulty.infectionRate * infectionResistance * this.randomBetween(0.65, 1.2);
    state.player.infection = clamp(state.player.infection + infectionGain, 0, 100);

    const injuryResistance = this.hasResearch("triage") ? 0.55 : 1;
    if (damage >= 9 && this.random() < 0.18 * injuryResistance) state.player.bleeding = true;
    if (["brute", "armored", "alpha"].includes(zombieType) && damage >= 10 && this.random() < 0.16 * injuryResistance) {
      state.player.injury = zombieType === "alpha" || damage >= 16 ? "fracture" : "sprain";
    }

    this.addEffect("player-hit", state.player.pos, state.player.pos, 0.35);
    this.hooks.onSound("hurt");
  }

  updateHealthConditions(dt) {
    const { state } = this;
    const player = state.player;
    if (player.bleeding) player.health = Math.max(0, player.health - dt * 0.34);
    if (player.infection >= 65) player.health = Math.max(0, player.health - dt * ((player.infection - 60) / 90));

    const medics = this.roleCount("medic");
    const safe = player.atBase || Boolean(player.atOutpostId);
    if (safe) {
      const infirmary = player.atBase ? state.base.structures.infirmary : 0;
      const healRate = 0.05 + infirmary * 0.17 + medics * 0.08;
      player.health = Math.min(player.maxHealth, player.health + dt * healRate);
      const infectionRecovery = (infirmary * 0.025 + medics * 0.018) * (this.hasResearch("virology") ? 1.6 : 1);
      player.infection = Math.max(0, player.infection - dt * infectionRecovery);
    }

    const rosterHealRate = state.base.structures.infirmary * 0.025 + medics * 0.045;
    if (rosterHealRate > 0) {
      for (const survivor of state.base.roster) {
        if (!survivor.injured) continue;
        survivor.health = Math.min(100, survivor.health + dt * rosterHealRate);
        if (survivor.health >= 95) survivor.injured = false;
      }
    }
  }

  updateThreatAndNoise(dt) {
    const { state } = this;
    const weather = this.weatherConfig();
    const safeBonus = state.player.atBase || state.player.atOutpostId ? 1.35 : 1;
    state.noise = clamp(state.noise - dt * (state.player.atBase ? 3.2 : 2.1) * safeBonus / Math.max(0.5, weather.playerNoise), 0, 100);
    const activeNests = state.pois.filter((poi) => poi.nest?.active).length;
    const baseline = 5 + gameDay(state.totalMinutes) * 2.5 + activeNests * 1.2;
    if (state.threat > baseline) state.threat = Math.max(baseline, state.threat - dt * 0.045);
    if (state.base.morale < 25) state.threat = clamp(state.threat + dt * 0.02, 0, 100);
  }

  updateTransient(dt) {
    const { state } = this;
    for (const effect of state.effects) effect.ttl -= dt;
    state.effects = state.effects.filter((effect) => effect.ttl > 0);
    for (const notification of state.notifications) {
      notification.ttl = (notification.ttl ?? 7) - dt;
    }
    state.notifications = state.notifications.filter((notification) => notification.ttl > 0);
  }

  checkEndConditions() {
    const { state } = this;
    if (state.status !== "playing") return;
    if (state.player.health <= 0) {
      state.status = "gameover";
      state.paused = true;
      this.log("gameover", "Le survivant a succombé aux infectés.");
      this.notify("danger", "VOUS ÊTES MORT", `Jour ${gameDay(state.totalMinutes)} — score ${Math.round(state.score)}.`);
      this.hooks.onSound("gameover");
      this.hooks.onChange(state);
      this.autosaveNow();
    } else if (state.player.infection >= 100) {
      state.status = "gameover";
      state.paused = true;
      this.log("gameover", "La contamination a atteint un stade irréversible.");
      this.notify("danger", "INFECTION TOTALE", `Jour ${gameDay(state.totalMinutes)} — score ${Math.round(state.score)}.`);
      this.hooks.onSound("gameover");
      this.hooks.onChange(state);
      this.autosaveNow();
    } else if (state.base.health <= 0) {
      state.status = "gameover";
      state.paused = true;
      this.log("gameover", "Le centre de commandement a été détruit.");
      this.notify("danger", "LA BASE EST TOMBÉE", `Jour ${gameDay(state.totalMinutes)} — score ${Math.round(state.score)}.`);
      this.hooks.onSound("gameover");
      this.hooks.onChange(state);
      this.autosaveNow();
    }
  }

  applyStructureUpgrade(structureId, level) {
    const { state } = this;
    if (structureId === "wall") {
      const previousMax = state.base.wallMaxHealth;
      state.base.wallMaxHealth = 180 + level * 170;
      state.base.wallHealth = Math.min(state.base.wallMaxHealth, state.base.wallHealth + (state.base.wallMaxHealth - previousMax) + 110);
      state.base.radius = 34 + level * 4;
    }
    if (structureId === "workshop") {
      state.player.armor = Math.min(45, state.player.armor + 6);
    }
    if (structureId === "infirmary") {
      state.player.maxHealth += 6;
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 20);
    }
    if (structureId === "radio") {
      const revealCount = 3 + level * 2;
      const hidden = state.pois.filter((poi) => !poi.discovered).sort(
        (a, b) => distanceMeters(state.base.pos, a.pos) - distanceMeters(state.base.pos, b.pos)
      );
      hidden.slice(0, revealCount).forEach((poi) => {
        poi.discovered = true;
      });
    }
  }

  weatherConfig() {
    return WEATHER_TYPES[this.state.weather?.type] ?? WEATHER_TYPES.clear;
  }

  hasResearch(id) {
    return this.state.research?.unlocked?.includes(id) ?? false;
  }

  roleCount(roleId) {
    return this.state.base.roster.filter(
      (survivor) =>
        survivor.role === roleId &&
        survivor.health > 20 &&
        survivor.morale > 20 &&
        !survivor.injured
    ).length;
  }

  engineerDiscount() {
    return Math.min(0.24, this.roleCount("engineer") * 0.04 + this.state.base.structures.workshop * 0.025);
  }

  discountCost(cost, discount = 0) {
    return Object.fromEntries(
      Object.entries(cost).map(([resource, value]) => [resource, Math.max(1, Math.ceil(value * (1 - clamp(discount, 0, 0.45))))])
    );
  }

  hasResources(cost) {
    return Object.entries(cost).every(([resource, amount]) => (this.state.resources[resource] ?? 0) >= amount);
  }

  consumeResources(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
      this.state.resources[resource] = Math.max(0, (this.state.resources[resource] ?? 0) - amount);
    }
  }

  formatCost(cost) {
    return Object.entries(cost)
      .map(([resource, amount]) => `${resource} ${amount}`)
      .join(" · ");
  }

  log(category, text) {
    this.state.logs.unshift(createLog(this.state.totalMinutes, category, text));
    if (this.state.logs.length > MAX_LOG_ENTRIES) this.state.logs.length = MAX_LOG_ENTRIES;
  }

  notify(type, title, text) {
    this.state.notifications.unshift({
      id: `notice-${Date.now().toString(36)}-${Math.floor(this.random() * 1e6).toString(36)}`,
      type,
      title,
      text,
      ttl: type === "danger" ? 9 : 6.5
    });
    if (this.state.notifications.length > 5) this.state.notifications.length = 5;
  }

  addEffect(type, from, to, ttl) {
    this.state.effects.push({
      id: `fx-${Date.now().toString(36)}-${Math.floor(this.random() * 1e6).toString(36)}`,
      type,
      from: { ...from },
      to: { ...to },
      ttl,
      maxTtl: ttl
    });
  }
}
