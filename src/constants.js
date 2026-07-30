export const APP_VERSION = "2.2.0";
export const GAME_VERSION = 2;
export const SAVE_KEY = "dead-ground-save-v2";
export const BACKUP_SAVE_KEY = "dead-ground-save-v2-backup";
export const LEGACY_SAVE_KEYS = Object.freeze(["dead-ground-save-v1"]);
export const SETTINGS_KEY = "dead-ground-settings-v1";

export const DEFAULT_CENTER = Object.freeze({ lat: 43.2965, lng: 5.3698 });
export const STARTING_CLOCK_MINUTES = 8 * 60;
export const MINUTES_PER_REAL_SECOND = 2.4;
export const BASE_RADIUS_METERS = 34;
export const MAX_LOG_ENTRIES = 140;
export const CAMPAIGN_SIGNAL_PARTS_REQUIRED = 3;
export const VEHICLE_INTERACTION_RANGE_METERS = 48;

export const DIFFICULTIES = Object.freeze({
  easy: {
    id: "easy",
    label: "Reconnaissance",
    description: "Plus de ressources, zombies moins agressifs.",
    spawnRate: 0.72,
    zombieDamage: 0.72,
    zombieHealth: 0.82,
    loot: 1.28,
    playerDamage: 1.15,
    infectionRate: 0.72,
    missionDuration: 1.25,
    startingResources: {
      food: 30,
      water: 36,
      wood: 42,
      metal: 30,
      ammo: 70,
      medicine: 7,
      fuel: 18,
      parts: 8,
      intel: 2
    }
  },
  normal: {
    id: "normal",
    label: "Survie",
    description: "Équilibre entre exploration et défense.",
    spawnRate: 1,
    zombieDamage: 1,
    zombieHealth: 1,
    loot: 1,
    playerDamage: 1,
    infectionRate: 1,
    missionDuration: 1,
    startingResources: {
      food: 24,
      water: 28,
      wood: 32,
      metal: 22,
      ammo: 50,
      medicine: 5,
      fuel: 12,
      parts: 5,
      intel: 1
    }
  },
  hard: {
    id: "hard",
    label: "Cauchemar",
    description: "Peu de ressources, nuits très dangereuses.",
    spawnRate: 1.38,
    zombieDamage: 1.3,
    zombieHealth: 1.22,
    loot: 0.78,
    playerDamage: 0.9,
    infectionRate: 1.32,
    missionDuration: 0.82,
    startingResources: {
      food: 18,
      water: 22,
      wood: 24,
      metal: 16,
      ammo: 36,
      medicine: 3,
      fuel: 8,
      parts: 3,
      intel: 0
    }
  }
});

export const RESOURCE_META = Object.freeze({
  food: { label: "Nourriture", icon: "🥫" },
  water: { label: "Eau", icon: "💧" },
  wood: { label: "Bois", icon: "🪵" },
  metal: { label: "Métal", icon: "🔩" },
  ammo: { label: "Munitions", icon: "◉" },
  medicine: { label: "Médicaments", icon: "✚" },
  fuel: { label: "Carburant", icon: "⛽" },
  parts: { label: "Pièces", icon: "⚙" },
  intel: { label: "Renseignements", icon: "⌁" }
});

export const POI_TYPES = Object.freeze({
  house: {
    label: "Maison abandonnée",
    icon: "⌂",
    danger: 1,
    weight: 18,
    outpostYield: { food: 1, water: 1 },
    loot: { food: [1, 5], water: [1, 5], wood: [0, 4], medicine: [0, 1] }
  },
  market: {
    label: "Supérette pillée",
    icon: "▣",
    danger: 2,
    weight: 10,
    outpostYield: { food: 2, water: 1 },
    loot: { food: [4, 11], water: [3, 9], medicine: [0, 2] }
  },
  pharmacy: {
    label: "Pharmacie",
    icon: "✚",
    danger: 2,
    weight: 8,
    outpostYield: { medicine: 1 },
    loot: { medicine: [2, 7], water: [0, 3], parts: [0, 2] }
  },
  police: {
    label: "Poste de police",
    icon: "★",
    danger: 4,
    weight: 6,
    outpostYield: { ammo: 3 },
    loot: { ammo: [8, 24], metal: [1, 6], medicine: [0, 2], parts: [1, 4], intel: [0, 2] }
  },
  warehouse: {
    label: "Entrepôt",
    icon: "▥",
    danger: 3,
    weight: 10,
    outpostYield: { wood: 2, metal: 1 },
    loot: { wood: [6, 15], metal: [4, 13], parts: [1, 5], fuel: [0, 4] }
  },
  fuel: {
    label: "Station-service",
    icon: "⛽",
    danger: 3,
    weight: 7,
    outpostYield: { fuel: 1 },
    loot: { fuel: [5, 15], parts: [0, 4], food: [0, 3], water: [0, 3] }
  },
  clinic: {
    label: "Centre médical",
    icon: "✚",
    danger: 4,
    weight: 5,
    outpostYield: { medicine: 1, water: 1 },
    loot: { medicine: [4, 10], water: [2, 6], ammo: [0, 5], parts: [1, 4], intel: [0, 2] }
  },
  hardware: {
    label: "Magasin de bricolage",
    icon: "⚒",
    danger: 3,
    weight: 8,
    outpostYield: { metal: 1, parts: 1 },
    loot: { wood: [5, 13], metal: [5, 12], parts: [2, 7] }
  },
  school: {
    label: "École évacuée",
    icon: "▤",
    danger: 2,
    weight: 7,
    outpostYield: { food: 1, water: 2 },
    loot: { food: [1, 6], water: [2, 7], wood: [1, 5], medicine: [0, 2], intel: [0, 1] }
  },
  bunker: {
    label: "Abri civil",
    icon: "⬢",
    danger: 5,
    weight: 3,
    outpostYield: { ammo: 2, parts: 1 },
    loot: { food: [5, 12], water: [5, 12], ammo: [8, 20], medicine: [2, 6], parts: [2, 7], intel: [1, 3] }
  }
});

export const ZOMBIE_TYPES = Object.freeze({
  walker: {
    label: "Rôdeur",
    speed: 0.9,
    health: 44,
    damage: 5,
    attackEvery: 1.35,
    detection: 100,
    infection: 2.2,
    score: 10,
    radius: 5
  },
  runner: {
    label: "Coureur",
    speed: 1.75,
    health: 32,
    damage: 4,
    attackEvery: 0.85,
    detection: 145,
    infection: 2.8,
    score: 16,
    radius: 4
  },
  brute: {
    label: "Colosse",
    speed: 0.62,
    health: 130,
    damage: 13,
    attackEvery: 1.75,
    detection: 90,
    infection: 4.2,
    score: 40,
    radius: 8
  },
  screamer: {
    label: "Hurleur",
    speed: 1.05,
    health: 48,
    damage: 3,
    attackEvery: 1.2,
    detection: 180,
    infection: 3,
    score: 28,
    radius: 6
  },
  spitter: {
    label: "Cracheur",
    speed: 0.78,
    health: 58,
    damage: 7,
    attackEvery: 2.35,
    detection: 170,
    infection: 7,
    rangedRange: 58,
    score: 38,
    radius: 6
  },
  armored: {
    label: "Blindé",
    speed: 0.52,
    health: 205,
    damage: 12,
    attackEvery: 1.7,
    detection: 115,
    infection: 4,
    armor: 0.42,
    score: 64,
    radius: 9
  },
  alpha: {
    label: "Alpha de la horde",
    speed: 0.88,
    health: 430,
    damage: 20,
    attackEvery: 1.45,
    detection: 220,
    infection: 11,
    armor: 0.18,
    boss: true,
    score: 220,
    radius: 12
  }
});

export const STRUCTURES = Object.freeze({
  wall: {
    label: "Palissade",
    icon: "▥",
    description: "Absorbe les dégâts avant le centre de commandement.",
    maxLevel: 3,
    costs: [
      { wood: 20, metal: 6 },
      { wood: 34, metal: 18, parts: 2 },
      { wood: 52, metal: 34, parts: 5 }
    ]
  },
  watchtower: {
    label: "Tour de guet",
    icon: "⌁",
    description: "Tire automatiquement sur les infectés proches.",
    maxLevel: 3,
    costs: [
      { wood: 16, metal: 12, parts: 1 },
      { wood: 24, metal: 24, parts: 3 },
      { wood: 34, metal: 40, parts: 6 }
    ]
  },
  workshop: {
    label: "Atelier",
    icon: "⚒",
    description: "Débloque l’artisanat et réduit les coûts de réparation.",
    maxLevel: 3,
    costs: [
      { wood: 18, metal: 14, parts: 2 },
      { wood: 28, metal: 28, parts: 4 },
      { wood: 40, metal: 46, parts: 7 }
    ]
  },
  infirmary: {
    label: "Infirmerie",
    icon: "✚",
    description: "Soigne blessures et infection à la base.",
    maxLevel: 3,
    costs: [
      { wood: 16, metal: 10, medicine: 2 },
      { wood: 24, metal: 20, medicine: 4, parts: 2 },
      { wood: 34, metal: 32, medicine: 7, parts: 4 }
    ]
  },
  garden: {
    label: "Potager filtrant",
    icon: "♧",
    description: "Produit nourriture et eau chaque matin.",
    maxLevel: 3,
    costs: [
      { wood: 18, water: 6 },
      { wood: 30, metal: 8, water: 10 },
      { wood: 44, metal: 18, water: 14, parts: 3 }
    ]
  },
  generator: {
    label: "Générateur",
    icon: "ϟ",
    description: "Renforce les défenses nocturnes en consommant du carburant.",
    maxLevel: 3,
    costs: [
      { metal: 16, fuel: 4, parts: 2 },
      { metal: 30, fuel: 7, parts: 4 },
      { metal: 48, fuel: 10, parts: 7 }
    ]
  },
  radio: {
    label: "Radio longue portée",
    icon: "⌁",
    description: "Révèle des lieux, reçoit des missions et prépare l’évacuation.",
    maxLevel: 3,
    costs: [
      { metal: 12, parts: 3 },
      { metal: 24, parts: 5, fuel: 2 },
      { metal: 38, parts: 8, fuel: 4 }
    ]
  }
});

export const SURVIVOR_ROLES = Object.freeze({
  idle: {
    label: "Disponible",
    icon: "○",
    description: "Aucune affectation permanente."
  },
  guard: {
    label: "Garde",
    icon: "⌖",
    description: "Participe aux tirs défensifs et renforce la base."
  },
  medic: {
    label: "Médecin",
    icon: "✚",
    description: "Accélère les soins et ralentit l’infection."
  },
  engineer: {
    label: "Ingénieur",
    icon: "⚙",
    description: "Réduit les coûts de construction et de réparation."
  },
  scout: {
    label: "Éclaireur",
    icon: "◎",
    description: "Étend la portée, révèle les lieux et améliore le butin."
  },
  farmer: {
    label: "Producteur",
    icon: "♧",
    description: "Augmente les rations produites chaque matin."
  }
});

export const WEATHER_TYPES = Object.freeze({
  clear: {
    label: "Ciel clair",
    icon: "☀",
    description: "Conditions stables.",
    movement: 1,
    stamina: 1,
    playerNoise: 1,
    zombieDetection: 1,
    spawnRate: 1,
    accuracy: 1
  },
  rain: {
    label: "Pluie",
    icon: "☂",
    description: "Le bruit est masqué mais le sol ralentit les déplacements.",
    movement: 0.92,
    stamina: 1.08,
    playerNoise: 0.68,
    zombieDetection: 0.78,
    spawnRate: 0.92,
    accuracy: 0.94
  },
  fog: {
    label: "Brouillard",
    icon: "≋",
    description: "Visibilité et précision réduites.",
    movement: 0.9,
    stamina: 1.12,
    playerNoise: 0.9,
    zombieDetection: 0.62,
    spawnRate: 1.08,
    accuracy: 0.76
  },
  storm: {
    label: "Orage violent",
    icon: "ϟ",
    description: "Déplacement pénible et défenses électroniques instables.",
    movement: 0.78,
    stamina: 1.38,
    playerNoise: 0.58,
    zombieDetection: 0.74,
    spawnRate: 1.18,
    accuracy: 0.82,
    turretEfficiency: 0.68
  },
  heat: {
    label: "Canicule",
    icon: "☼",
    description: "L’endurance se vide rapidement.",
    movement: 0.88,
    stamina: 1.55,
    playerNoise: 1.08,
    zombieDetection: 1.05,
    spawnRate: 0.9,
    accuracy: 0.98
  }
});

export const RESEARCH_TECHS = Object.freeze({
  ballistics: {
    label: "Balistique de terrain",
    icon: "◉",
    cost: 4,
    description: "+22 % de dégâts avec les armes à feu.",
    prerequisites: []
  },
  triage: {
    label: "Triage d’urgence",
    icon: "✚",
    cost: 4,
    description: "Les soins sont plus efficaces et les blessures moins graves.",
    prerequisites: []
  },
  mechanics: {
    label: "Mécanique de récupération",
    icon: "⚙",
    cost: 5,
    description: "Permet de réparer le fourgon d’expédition.",
    prerequisites: []
  },
  radioNetwork: {
    label: "Réseau radio maillé",
    icon: "⌁",
    cost: 6,
    description: "Augmente la portée et le nombre de missions disponibles.",
    prerequisites: []
  },
  fortification: {
    label: "Fortifications modulaires",
    icon: "▥",
    cost: 6,
    description: "Tours, gardes et pièges infligent davantage de dégâts.",
    prerequisites: ["ballistics"]
  },
  virology: {
    label: "Virologie appliquée",
    icon: "⌬",
    cost: 7,
    description: "Débloque l’antidote et réduit la contamination.",
    prerequisites: ["triage"]
  },
  logistics: {
    label: "Logistique de secteur",
    icon: "▣",
    cost: 7,
    description: "Réduit la consommation du véhicule et améliore les avant-postes.",
    prerequisites: ["mechanics"]
  },
  evacuationProtocol: {
    label: "Protocole d’évacuation",
    icon: "△",
    cost: 8,
    description: "Autorise la construction de la balise et la bataille finale.",
    prerequisites: ["radioNetwork", "virology"]
  }
});

export const CRAFTING_RECIPES = Object.freeze({
  ammoCrate: {
    label: "Caisse de munitions",
    icon: "◉",
    description: "Produit 20 munitions.",
    minWorkshop: 1,
    cost: { metal: 4, parts: 1 },
    result: { type: "resource", id: "ammo", amount: 20 }
  },
  fieldKit: {
    label: "Kit de terrain",
    icon: "✚",
    description: "Soin puissant, stoppe le saignement et réduit la blessure.",
    minWorkshop: 0,
    cost: { medicine: 2, water: 1 },
    result: { type: "item", id: "fieldKit", amount: 1 }
  },
  repairKit: {
    label: "Kit de réparation",
    icon: "⚒",
    description: "Répare le véhicule ou renforce rapidement une défense.",
    minWorkshop: 1,
    cost: { wood: 4, metal: 4, parts: 1 },
    result: { type: "item", id: "repairKit", amount: 1 }
  },
  trap: {
    label: "Piège de périmètre",
    icon: "◇",
    description: "Peut être déployé autour de la base contre une cible.",
    minWorkshop: 1,
    cost: { wood: 6, metal: 5, fuel: 1 },
    result: { type: "item", id: "trap", amount: 1 }
  },
  antidote: {
    label: "Antidote expérimental",
    icon: "⌬",
    description: "Réduit fortement le niveau d’infection.",
    minWorkshop: 2,
    research: "virology",
    cost: { medicine: 3, water: 2, intel: 1 },
    result: { type: "item", id: "antidote", amount: 1 }
  }
});

export const MISSION_TYPES = Object.freeze({
  rescue: {
    label: "Appel de détresse",
    icon: "✚",
    description: "Secourir une personne bloquée dans la zone."
  },
  supply: {
    label: "Réserve signalée",
    icon: "▣",
    description: "Sécuriser une réserve avant qu’elle ne soit perdue."
  },
  nest: {
    label: "Nid infecté",
    icon: "⌬",
    description: "Détruire un foyer qui alimente la menace locale."
  },
  intel: {
    label: "Archives prioritaires",
    icon: "⌁",
    description: "Récupérer des renseignements exploitables."
  },
  vehicle: {
    label: "Fourgon abandonné",
    icon: "▰",
    description: "Retrouver un véhicule encore réparable."
  }
});

export const VEHICLE_DEFINITION = Object.freeze({
  label: "Fourgon d’expédition",
  icon: "▰",
  speed: 16,
  fuelPerKilometer: 1.65,
  damageReduction: 0.55,
  repairCost: { metal: 18, parts: 8, fuel: 4 }
});

export const WAVE_RECOVERY_REWARDS = Object.freeze({
  metalBase: 3,
  metalDayFactor: 0.75,
  fuelBase: 1,
  fuelEveryDays: 3
});

export const OUTPOST_CLAIM_COST = Object.freeze({ wood: 12, metal: 6, parts: 1 });
export const EVACUATION_BEACON_COST = Object.freeze({ metal: 30, parts: 10, fuel: 8, intel: 4 });

export const TUTORIAL_STEPS = Object.freeze([
  {
    title: "Votre quartier est tombé",
    body: "Cliquez sur la carte pour vous déplacer. Les distances correspondent au terrain réel lorsque Google Maps est activé."
  },
  {
    title: "Préparez une expédition",
    body: "Sélectionnez un lieu, rejoignez-le puis fouillez-le. Les nids doivent être nettoyés avant de pouvoir établir un avant-poste."
  },
  {
    title: "Organisez les survivants",
    body: "Affectez gardes, médecins, ingénieurs, éclaireurs et producteurs. Chaque rôle modifie réellement la simulation."
  },
  {
    title: "Construisez une issue",
    body: "Récupérez trois modules de signal, recherchez le protocole d’évacuation puis survivez à la dernière horde."
  }
]);
