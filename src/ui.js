import {
  CRAFTING_RECIPES,
  DIFFICULTIES,
  EVACUATION_BEACON_COST,
  MISSION_TYPES,
  OUTPOST_CLAIM_COST,
  POI_TYPES,
  RESEARCH_TECHS,
  RESOURCE_META,
  STRUCTURES,
  SURVIVOR_ROLES,
  TUTORIAL_STEPS,
  VEHICLE_DEFINITION,
  WEATHER_TYPES,
  ZOMBIE_TYPES
} from "./constants.js";
import {
  distanceMeters,
  formatClock,
  formatDistance,
  gameDay,
  isNight
} from "./geo.js";

export class GameUI {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.activeTab = "base";
    this.selectedDifficulty = "normal";
    this.lastPanelRender = 0;
    this.phase = "setup";
    this.settings = null;
    this.mapStatus = { provider: "fallback", label: "Terrain de secours procédural" };
    this.mount();
    this.bindEvents();
  }

  mount() {
    this.root.innerHTML = `
      <main id="game-shell" class="game-shell" data-phase="setup">
        <div id="map-root" class="map-root" aria-label="Carte du monde"></div>
        <div id="map-atmosphere" class="map-atmosphere" aria-hidden="true"></div>
        <div class="screen-noise" aria-hidden="true"></div>

        <div id="provider-badge" class="provider-badge">
          <span class="status-dot"></span>
          <span id="provider-label">Initialisation de la carte…</span>
        </div>

        <section id="setup-panel" class="setup-panel glass-panel" aria-labelledby="setup-title">
          <div class="brand-lockup">
            <span class="brand-kicker">SURVIE GÉOLOCALISÉE</span>
            <h1 id="setup-title">DEAD GROUND</h1>
            <p>Choisissez n’importe quel point du monde, fortifiez votre position puis explorez les alentours envahis.</p>
          </div>

          <div class="setup-block">
            <div class="section-heading">
              <span>01</span>
              <div><strong>Point de départ</strong><small>Cliquez directement sur la carte</small></div>
            </div>
            <form id="location-search-form" class="search-row">
              <label class="sr-only" for="location-search">Adresse ou ville</label>
              <input id="location-search" type="search" autocomplete="street-address" placeholder="Ville, adresse, lieu…" />
              <button class="icon-button" type="submit" aria-label="Rechercher">⌕</button>
            </form>
            <div class="coordinate-card">
              <div><span>LAT</span><strong id="selected-lat">—</strong></div>
              <div><span>LNG</span><strong id="selected-lng">—</strong></div>
              <button id="locate-me" class="secondary-button compact" type="button">◎ Ma position</button>
            </div>
          </div>

          <div class="setup-block">
            <div class="section-heading">
              <span>02</span>
              <div><strong>Niveau de menace</strong><small>Modifie ressources, dégâts et densité</small></div>
            </div>
            <div class="difficulty-grid" role="radiogroup" aria-label="Difficulté">
              ${Object.values(DIFFICULTIES).map((difficulty) => `
                <button class="difficulty-card ${difficulty.id === "normal" ? "selected" : ""}" type="button" data-difficulty="${difficulty.id}" role="radio" aria-checked="${difficulty.id === "normal"}">
                  <strong>${escapeHtml(difficulty.label)}</strong>
                  <small>${escapeHtml(difficulty.description)}</small>
                </button>
              `).join("")}
            </div>
          </div>

          <div id="map-provider-note" class="provider-note"></div>

          <div class="setup-actions">
            <button id="start-game" class="primary-button" type="button"><span>Établir la base</span><b>→</b></button>
            <button id="continue-game" class="secondary-button" type="button" hidden>Continuer la sauvegarde</button>
            <button id="open-settings" class="text-button" type="button">⚙ Paramètres Google Maps</button>
          </div>
        </section>

        <header id="top-hud" class="top-hud game-only" aria-label="Informations de partie">
          <div class="clock-card hud-card">
            <div class="clock-main"><span id="day-label">JOUR 1</span><strong id="clock-label">08:00</strong></div>
            <div id="day-state" class="state-chip">JOUR</div>
          </div>
          <div id="resource-strip" class="resource-strip hud-card"></div>
          <div id="weather-card" class="weather-card hud-card" title="Conditions météo">
            <span id="weather-icon">☀</span><div><small>MÉTÉO</small><strong id="weather-label">Ciel clair</strong></div>
          </div>
          <div class="hud-tools hud-card">
            <button type="button" data-action="toggle-sound" class="hud-icon" aria-label="Activer ou couper le son">◖</button>
            <button type="button" data-action="pause" class="hud-icon" aria-label="Mettre en pause">Ⅱ</button>
          </div>
        </header>

        <aside id="side-panel" class="side-panel game-only glass-panel" aria-label="Gestion de la survie">
          <nav class="panel-tabs" aria-label="Sections">
            <button class="active" type="button" data-tab="base">BASE</button>
            <button type="button" data-tab="expeditions">EXPÉDITIONS</button>
            <button type="button" data-tab="survivors">SURVIVANTS</button>
            <button type="button" data-tab="workshop">ATELIER</button>
            <button type="button" data-tab="research">RECHERCHE</button>
            <button type="button" data-tab="missions">MISSIONS</button>
            <button type="button" data-tab="journal">JOURNAL</button>
          </nav>
          <div id="panel-content" class="panel-content"></div>
        </aside>

        <button id="mobile-panel-toggle" class="mobile-panel-toggle game-only" type="button" data-action="mobile-panel">☰ Gestion</button>

        <section id="player-card" class="player-card hud-card game-only" aria-label="État du survivant">
          <div class="player-card-heading">
            <div><span>SURVIVANT</span><strong id="player-status-label">OPÉRATIONNEL</strong></div>
            <span id="distance-home" class="distance-chip">BASE</span>
          </div>
          <div class="vital-row"><span>VIE</span><div class="meter"><i id="health-meter"></i></div><b id="health-value">100</b></div>
          <div class="vital-row"><span>END</span><div class="meter stamina"><i id="stamina-meter"></i></div><b id="stamina-value">100</b></div>
          <div class="vital-row infection-row"><span>INF</span><div class="meter infection"><i id="infection-meter"></i></div><b id="infection-value">0</b></div>
          <div id="condition-chips" class="condition-chips"></div>
          <div class="signal-grid">
            <div><span>BRUIT</span><b id="noise-value">0</b></div>
            <div><span>MENACE</span><b id="threat-value">0</b></div>
            <div><span>INFECTÉS</span><b id="zombie-value">0</b></div>
          </div>
        </section>

        <section id="action-dock" class="action-dock hud-card game-only" aria-label="Actions">
          <button type="button" data-action="fire"><span>◉</span><b>TIRER</b><small>Espace</small></button>
          <button type="button" data-action="melee"><span>⌁</span><b>FRAPPER</b><small>F</small></button>
          <button type="button" data-action="heal"><span>✚</span><b>SOIGNER</b><small>1</small></button>
          <button type="button" data-action="antidote"><span>⌬</span><b>ANTIDOTE</b><small>2</small></button>
          <button id="sprint-button" type="button" data-action="sprint"><span>»</span><b>SPRINT</b><small>Shift</small></button>
          <button id="auto-fire-button" class="active" type="button" data-action="auto-fire"><span>⌖</span><b>AUTO</b><small>A</small></button>
          <button type="button" data-action="return-base"><span>⌂</span><b>RETOUR</b><small>R</small></button>
        </section>

        <section id="poi-card" class="poi-card glass-panel game-only" hidden></section>
        <section id="activity-card" class="activity-card hud-card game-only" hidden></section>
        <div id="notifications" class="notifications" aria-live="polite"></div>

        <div id="tutorial-modal" class="modal-backdrop game-only" hidden>
          <section class="modal-card tutorial-card" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
            <span class="modal-kicker">PROTOCOLE DE SURVIE</span>
            <h2 id="tutorial-title"></h2>
            <p id="tutorial-body"></p>
            <div class="tutorial-progress" id="tutorial-progress"></div>
            <div class="modal-actions">
              <button type="button" data-action="skip-tutorial" class="text-button">Ignorer</button>
              <button type="button" data-action="next-tutorial" class="primary-button compact">Suivant →</button>
            </div>
          </section>
        </div>

        <div id="pause-modal" class="modal-backdrop" hidden>
          <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
            <span class="modal-kicker">PARTIE SUSPENDUE</span>
            <h2 id="pause-title">Pause tactique</h2>
            <p>La simulation et les vagues sont arrêtées.</p>
            <div class="modal-menu">
              <button type="button" data-action="resume" class="primary-button">Reprendre</button>
              <button type="button" data-action="export-save" class="secondary-button">Exporter la sauvegarde</button>
              <label class="secondary-button file-button">Importer une sauvegarde<input id="import-save-input" type="file" accept="application/json" hidden /></label>
              <button type="button" data-action="settings" class="secondary-button">Paramètres</button>
              <button type="button" data-action="quit-menu" class="danger-button">Quitter vers le menu</button>
            </div>
          </section>
        </div>

        <div id="settings-modal" class="modal-backdrop" hidden>
          <section class="modal-card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <span class="modal-kicker">CONFIGURATION</span>
            <h2 id="settings-title">Google Maps & accessibilité</h2>
            <label class="field-label" for="google-key-input">Clé Maps JavaScript API</label>
            <div class="password-row">
              <input id="google-key-input" type="password" spellcheck="false" autocomplete="off" placeholder="AIza…" />
              <button type="button" data-action="toggle-key" class="icon-button" aria-label="Afficher la clé">◉</button>
            </div>
            <p class="field-help">La clé reste dans ce navigateur. Elle doit autoriser Maps JavaScript API, Places API (New) et, pour la recherche d’adresse, Geocoding API. Restreignez-la à vos domaines.</p>
            <label class="toggle-row"><input id="sound-setting" type="checkbox" /><span>Effets sonores procéduraux</span></label>
            <label class="toggle-row"><input id="motion-setting" type="checkbox" /><span>Réduire les animations</span></label>
            <div class="provider-note strong">Sans clé valide, le jeu utilise automatiquement son terrain procédural de secours.</div>
            <div class="modal-actions">
              <button type="button" data-action="close-settings" class="secondary-button">Annuler</button>
              <button type="button" data-action="save-settings" class="primary-button compact">Enregistrer</button>
            </div>
          </section>
        </div>

        <div id="gameover-modal" class="modal-backdrop" hidden>
          <section class="modal-card gameover-card" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
            <span class="modal-kicker">TRANSMISSION PERDUE</span>
            <h2 id="gameover-title">La zone est tombée</h2>
            <div id="gameover-stats" class="gameover-stats"></div>
            <div class="modal-menu">
              <button type="button" data-action="restart" class="primary-button">Recommencer ici</button>
              <button type="button" data-action="quit-menu" class="secondary-button">Choisir un autre lieu</button>
            </div>
          </section>
        </div>

        <div id="victory-modal" class="modal-backdrop" hidden>
          <section class="modal-card victory-card" role="dialog" aria-modal="true" aria-labelledby="victory-title">
            <span class="modal-kicker">CONVOI D’ÉVACUATION</span>
            <h2 id="victory-title">Le secteur a survécu</h2>
            <p>La dernière horde est tombée. Votre communauté rejoint une zone d’extraction sécurisée.</p>
            <div id="victory-stats" class="gameover-stats"></div>
            <div class="modal-menu">
              <button type="button" data-action="restart" class="primary-button">Nouvelle campagne ici</button>
              <button type="button" data-action="quit-menu" class="secondary-button">Choisir un autre lieu</button>
            </div>
          </section>
        </div>

        <div id="loading-overlay" class="loading-overlay">
          <div class="loading-mark"></div>
          <strong>Initialisation de la zone</strong>
          <span>Chargement du moteur cartographique…</span>
        </div>
      </main>
    `;

    this.shell = this.root.querySelector("#game-shell");
    this.mapRoot = this.root.querySelector("#map-root");
    this.setupPanel = this.root.querySelector("#setup-panel");
    this.panelContent = this.root.querySelector("#panel-content");
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => {
      const difficultyButton = event.target.closest("[data-difficulty]");
      if (difficultyButton) {
        this.selectDifficulty(difficultyButton.dataset.difficulty);
        return;
      }

      const tabButton = event.target.closest("[data-tab]");
      if (tabButton) {
        this.activeTab = tabButton.dataset.tab;
        this.root.querySelectorAll("[data-tab]").forEach((button) => {
          button.classList.toggle("active", button === tabButton);
        });
        this.lastPanelRender = 0;
        this.callbacks.requestRender?.();
        return;
      }

      const poiButton = event.target.closest("[data-poi-id]");
      if (poiButton) {
        const poiId = poiButton.dataset.poiId;
        const command = poiButton.dataset.command;
        if (command === "travel") this.callbacks.travelToPoi?.(poiId);
        else this.callbacks.selectPoi?.(poiId);
        return;
      }

      const structureButton = event.target.closest("[data-structure-id]");
      if (structureButton) {
        this.callbacks.buildStructure?.(structureButton.dataset.structureId);
        return;
      }

      const recipeButton = event.target.closest("[data-recipe-id]");
      if (recipeButton) {
        this.callbacks.craftItem?.(recipeButton.dataset.recipeId);
        return;
      }

      const researchButton = event.target.closest("[data-research-id]");
      if (researchButton) {
        this.callbacks.researchTech?.(researchButton.dataset.researchId);
        return;
      }

      const outpostButton = event.target.closest("[data-outpost-poi]");
      if (outpostButton) {
        this.callbacks.claimOutpost?.(outpostButton.dataset.outpostPoi);
        return;
      }

      const notificationButton = event.target.closest("[data-notification-id]");
      if (notificationButton) {
        this.callbacks.dismissNotification?.(notificationButton.dataset.notificationId);
        return;
      }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action) this.handleAction(action);
    });

    this.root.querySelector("#start-game").addEventListener("click", () => {
      this.callbacks.startNew?.(this.selectedDifficulty);
    });
    this.root.querySelector("#continue-game").addEventListener("click", () => this.callbacks.continueGame?.());
    this.root.querySelector("#open-settings").addEventListener("click", () => this.openSettings());
    this.root.querySelector("#locate-me").addEventListener("click", () => this.callbacks.locate?.());
    this.root.querySelector("#location-search-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const query = this.root.querySelector("#location-search").value.trim();
      if (query) this.callbacks.searchLocation?.(query);
    });
    this.root.querySelector("#import-save-input").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) this.callbacks.importSave?.(file);
      event.target.value = "";
    });

    this.root.addEventListener("change", (event) => {
      const roleSelect = event.target.closest("[data-survivor-role]");
      if (roleSelect) {
        this.callbacks.assignSurvivorRole?.(roleSelect.dataset.survivorRole, roleSelect.value);
      }
    });
  }

  handleAction(action) {
    const handlers = {
      pause: () => this.callbacks.pause?.(),
      resume: () => this.callbacks.resume?.(),
      fire: () => this.callbacks.fire?.(),
      melee: () => this.callbacks.melee?.(),
      heal: () => this.callbacks.heal?.(),
      antidote: () => this.callbacks.useAntidote?.(),
      sprint: () => this.callbacks.toggleSprint?.(),
      "auto-fire": () => this.callbacks.toggleAutoFire?.(),
      "return-base": () => this.callbacks.returnToBase?.(),
      scavenge: () => this.callbacks.scavenge?.(),
      "clear-nest": () => this.callbacks.clearNest?.(),
      "cancel-activity": () => this.callbacks.cancelActivity?.(),
      "repair-wall": () => this.callbacks.repairBase?.("wall"),
      "repair-base": () => this.callbacks.repairBase?.("base"),
      "repair-vehicle": () => this.callbacks.repairVehicle?.(),
      "repair-vehicle-kit": () => this.callbacks.repairVehicleWithKit?.(),
      "toggle-vehicle": () => this.callbacks.toggleVehicle?.(),
      "deploy-trap": () => this.callbacks.deployTrap?.(),
      "use-field-kit": () => this.callbacks.useFieldKit?.(),
      "build-beacon": () => this.callbacks.buildBeacon?.(),
      "call-evacuation": () => this.callbacks.callEvacuation?.(),
      "toggle-sound": () => this.callbacks.toggleSound?.(),
      "next-tutorial": () => this.callbacks.nextTutorial?.(),
      "skip-tutorial": () => this.callbacks.skipTutorial?.(),
      "export-save": () => this.callbacks.exportSave?.(),
      settings: () => this.openSettings(),
      "close-settings": () => this.closeSettings(),
      "save-settings": () => this.saveSettingsFromForm(),
      "toggle-key": () => this.toggleKeyVisibility(),
      "quit-menu": () => this.callbacks.quitToMenu?.(),
      restart: () => this.callbacks.restart?.(),
      "mobile-panel": () => this.root.querySelector("#side-panel").classList.toggle("mobile-open")
    };
    handlers[action]?.();
  }

  selectDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.selectedDifficulty = id;
    this.root.querySelectorAll("[data-difficulty]").forEach((button) => {
      const selected = button.dataset.difficulty === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  }

  setLoading(loading, label = "Chargement du moteur cartographique…") {
    const overlay = this.root.querySelector("#loading-overlay");
    overlay.hidden = !loading;
    overlay.querySelector("span").textContent = label;
  }

  setPhase(phase) {
    this.phase = phase;
    this.shell.dataset.phase = phase;
    if (phase === "setup") {
      this.root.querySelector("#pause-modal").hidden = true;
      this.root.querySelector("#gameover-modal").hidden = true;
      this.root.querySelector("#victory-modal").hidden = true;
      this.root.querySelector("#side-panel").classList.remove("mobile-open");
    }
  }

  setMapStatus(status) {
    this.mapStatus = status;
    this.shell.dataset.mapProvider = status.provider;
    const label = this.root.querySelector("#provider-label");
    label.textContent = status.label;
    const badge = this.root.querySelector("#provider-badge");
    badge.dataset.provider = status.provider;
    const note = this.root.querySelector("#map-provider-note");
    if (status.provider === "google") {
      note.innerHTML = `<strong>IMAGERIE SATELLITE ACTIVE</strong><span>Les éléments du jeu sont synchronisés à la carte réelle.</span>`;
    } else {
      note.innerHTML = `<strong>MODE DE SECOURS ACTIF</strong><span>Ajoutez une clé Google Maps pour afficher les photos satellite.</span>`;
    }
  }

  renderSetup({ selectedStart, hasSave, settings }) {
    this.settings = settings;
    this.root.querySelector("#selected-lat").textContent = selectedStart.lat.toFixed(6);
    this.root.querySelector("#selected-lng").textContent = selectedStart.lng.toFixed(6);
    this.root.querySelector("#continue-game").hidden = !hasSave;
    this.root.querySelector("#google-key-input").value = settings.googleMapsApiKey ?? "";
    this.root.querySelector("#sound-setting").checked = settings.soundEnabled !== false;
    this.root.querySelector("#motion-setting").checked = settings.reducedMotion === true;
    this.shell.classList.toggle("reduce-motion", settings.reducedMotion === true);
  }

  renderGame(state, settings) {
    if (!state) return;
    this.settings = settings;
    this.setPhase("game");
    const day = gameDay(state.totalMinutes);
    const night = isNight(state.totalMinutes);
    const wave = state.wave.active;

    this.root.querySelector("#day-label").textContent = `JOUR ${day}`;
    this.root.querySelector("#clock-label").textContent = formatClock(state.totalMinutes);
    const stateChip = this.root.querySelector("#day-state");
    stateChip.textContent = wave ? `VAGUE ${state.wave.number}` : night ? "NUIT" : "JOUR";
    stateChip.dataset.state = wave ? "wave" : night ? "night" : "day";
    this.root.querySelector("#map-atmosphere").style.setProperty("--night-opacity", night ? (wave ? "0.5" : "0.38") : "0.08");
    this.shell.classList.toggle("wave-active", wave);
    this.shell.classList.toggle("night-active", night);
    for (const id of Object.keys(WEATHER_TYPES)) this.shell.classList.toggle(`weather-${id}`, state.weather?.type === id);
    const weather = WEATHER_TYPES[state.weather?.type] ?? WEATHER_TYPES.clear;
    this.root.querySelector("#weather-icon").textContent = weather.icon;
    this.root.querySelector("#weather-label").textContent = weather.label;
    this.root.querySelector("#weather-card").title = `${weather.description} · encore ${Math.max(1, Math.round(state.weather?.remainingMinutes ?? 0))} min de jeu`;

    this.renderResources(state.resources);
    this.renderVitals(state);
    this.renderActions(state);
    this.renderPoiCard(state);
    this.renderActivity(state);
    this.renderNotifications(state.notifications);
    this.renderTutorial(state);
    this.renderPause(state);
    this.renderGameOver(state);
    this.renderVictory(state);

    const now = performance.now();
    if (now - this.lastPanelRender > 550) {
      this.lastPanelRender = now;
      this.renderPanel(state);
    }
  }

  renderResources(resources) {
    const strip = this.root.querySelector("#resource-strip");
    strip.innerHTML = Object.entries(RESOURCE_META).map(([id, meta]) => `
      <div class="resource-item" title="${escapeHtml(meta.label)}">
        <span>${meta.icon}</span><b>${Math.floor(resources[id] ?? 0)}</b><small>${escapeHtml(meta.label)}</small>
      </div>
    `).join("");
  }

  renderVitals(state) {
    const player = state.player;
    setMeter(this.root.querySelector("#health-meter"), player.health / player.maxHealth);
    setMeter(this.root.querySelector("#stamina-meter"), player.stamina / player.maxStamina);
    setMeter(this.root.querySelector("#infection-meter"), player.infection / 100);
    this.root.querySelector("#health-value").textContent = Math.ceil(player.health);
    this.root.querySelector("#stamina-value").textContent = Math.ceil(player.stamina);
    this.root.querySelector("#infection-value").textContent = Math.ceil(player.infection);
    this.root.querySelector("#noise-value").textContent = Math.round(state.noise);
    this.root.querySelector("#threat-value").textContent = Math.round(state.threat);
    this.root.querySelector("#zombie-value").textContent = state.zombies.filter((zombie) => !zombie.dead).length;
    const distance = distanceMeters(player.pos, state.base.pos);
    this.root.querySelector("#distance-home").textContent = player.atBase
      ? "À LA BASE"
      : player.atOutpostId
        ? "AVANT-POSTE"
        : formatDistance(distance);
    const conditions = [];
    if (player.bleeding) conditions.push('<span class="danger">SAIGNEMENT</span>');
    if (player.injury === "sprain") conditions.push('<span class="warning">ENTORSE</span>');
    if (player.injury === "fracture") conditions.push('<span class="danger">FRACTURE</span>');
    if (state.vehicle.active) conditions.push(`<span class="vehicle">▰ FOURGON ${Math.ceil(state.vehicle.condition)}%</span>`);
    this.root.querySelector("#condition-chips").innerHTML = conditions.join("");
    this.root.querySelector("#player-status-label").textContent =
      player.infection >= 75 ? "CONTAMINÉ" :
      player.health < 25 ? "CRITIQUE" :
      player.health < 55 ? "BLESSÉ" :
      state.activity ? "OCCUPÉ" :
      state.vehicle.active ? "MOTORISÉ" : "OPÉRATIONNEL";
  }

  renderActions(state) {
    const actionDock = this.root.querySelector("#action-dock");
    const fire = actionDock.querySelector('[data-action="fire"]');
    const melee = actionDock.querySelector('[data-action="melee"]');
    const heal = actionDock.querySelector('[data-action="heal"]');
    const antidote = actionDock.querySelector('[data-action="antidote"]');
    fire.disabled = state.resources.ammo <= 0 || state.player.fireCooldown > 0 || Boolean(state.activity);
    melee.disabled = state.player.stamina < 9 || state.player.meleeCooldown > 0 || Boolean(state.activity) || state.vehicle.active;
    heal.disabled = (state.resources.medicine <= 0 && state.inventory.fieldKit <= 0) || (state.player.health >= state.player.maxHealth && !state.player.bleeding && state.player.injury === "none");
    antidote.disabled = state.inventory.antidote <= 0 || state.player.infection <= 0;
    antidote.querySelector("small").textContent = `2 · ${state.inventory.antidote}`;
    this.root.querySelector("#sprint-button").classList.toggle("active", state.movementMode === "sprint");
    this.root.querySelector("#sprint-button").disabled = state.vehicle.active;
    this.root.querySelector("#auto-fire-button").classList.toggle("active", state.autoFire);
  }

  renderPoiCard(state) {
    const card = this.root.querySelector("#poi-card");
    const poi = state.pois.find((item) => item.id === state.selectedPoiId);
    if (!poi) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const config = POI_TYPES[poi.type] ?? POI_TYPES.house;
    const distance = distanceMeters(state.player.pos, poi.pos);
    const nearby = distance <= 27 && !state.activity;
    const canClear = poi.nest?.active && nearby;
    const canScavenge = !poi.nest?.active && !poi.looted && nearby;
    const canClaim = !poi.nest?.active && poi.looted && !poi.outpost && nearby;
    const markers = [
      poi.realPlace ? '<span class="poi-tag real">LIEU RÉEL</span>' : "",
      poi.nest?.active ? `<span class="poi-tag danger">NID NIVEAU ${poi.nest.strength}</span>` : "",
      poi.outpost ? '<span class="poi-tag safe">AVANT-POSTE</span>' : "",
      poi.missionMarker ? `<span class="poi-tag mission">${escapeHtml(MISSION_TYPES[poi.missionMarker]?.label ?? "MISSION")}</span>` : "",
      poi.campaignSignalPart && !poi.signalPartCollected ? '<span class="poi-tag signal">MODULE DE SIGNAL</span>' : "",
      poi.vehicleWreck && !state.vehicle.discovered ? '<span class="poi-tag vehicle">FOURGON SIGNALÉ</span>' : ""
    ].filter(Boolean).join("");

    card.innerHTML = `
      <button class="close-card" type="button" data-action="clear-poi" aria-label="Fermer">×</button>
      <span class="poi-icon">${poi.outpost ? "⌂" : poi.nest?.active ? "⌬" : config.icon}</span>
      <div class="poi-copy">
        <small>${poi.looted ? "ZONE SÉCURISÉE" : "OBJECTIF D’EXPÉDITION"}</small>
        <strong>${escapeHtml(poi.name)}</strong>
        <span>${formatDistance(distance)} · Danger ${"◆".repeat(poi.danger)}${"◇".repeat(5 - poi.danger)}</span>
        ${poi.address ? `<span class="poi-address">${escapeHtml(poi.address)}</span>` : ""}
        <div class="poi-tags">${markers}</div>
      </div>
      <div class="poi-actions">
        <button type="button" data-poi-id="${poi.id}" data-command="travel" class="secondary-button compact">Y aller</button>
        ${poi.nest?.active ? `<button type="button" data-action="clear-nest" class="danger-button compact" ${canClear ? "" : "disabled"}>Détruire le nid</button>` : ""}
        ${!poi.looted && !poi.nest?.active ? `<button type="button" data-action="scavenge" class="primary-button compact" ${canScavenge ? "" : "disabled"}>Fouiller</button>` : ""}
        ${poi.looted && !poi.outpost && !poi.nest?.active ? `<button type="button" data-outpost-poi="${poi.id}" class="primary-button compact" ${canClaim ? "" : "disabled"}>Avant-poste · ${formatCost(OUTPOST_CLAIM_COST)}</button>` : ""}
      </div>
    `;
    const close = card.querySelector('[data-action="clear-poi"]');
    close?.addEventListener("click", () => this.callbacks.selectPoi?.(null), { once: true });
  }

  renderActivity(state) {
    const card = this.root.querySelector("#activity-card");
    if (!state.activity) {
      card.hidden = true;
      return;
    }
    const progress = Math.min(1, state.activity.elapsed / state.activity.duration);
    const poi = state.pois.find((item) => item.id === state.activity.poiId);
    const nest = state.activity.type === "clearNest";
    card.hidden = false;
    card.innerHTML = `
      <div><small>${nest ? "DESTRUCTION DU NID" : "FOUILLE EN COURS"}</small><strong>${escapeHtml(poi?.name ?? "Zone")}</strong></div>
      <div class="activity-meter ${nest ? "danger" : ""}"><i style="width:${Math.round(progress * 100)}%"></i></div>
      <b>${state.activity.blocked ? "MENACES À ÉLIMINER" : `${Math.ceil(state.activity.duration - state.activity.elapsed)} s`}</b>
      <button type="button" data-action="cancel-activity" class="text-button">Interrompre</button>
    `;
  }

  renderNotifications(notifications) {
    this.root.querySelector("#notifications").innerHTML = notifications.slice(0, 4).map((notification) => `
      <button type="button" class="notification ${notification.type}" data-notification-id="${notification.id}">
        <span></span>
        <div><strong>${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.text)}</small></div>
        <b>×</b>
      </button>
    `).join("");
  }

  renderTutorial(state) {
    const modal = this.root.querySelector("#tutorial-modal");
    if (!state.tutorialVisible) {
      modal.hidden = true;
      return;
    }
    const step = TUTORIAL_STEPS[Math.min(state.tutorialIndex, TUTORIAL_STEPS.length - 1)];
    modal.hidden = false;
    this.root.querySelector("#tutorial-title").textContent = step.title;
    this.root.querySelector("#tutorial-body").textContent = step.body;
    this.root.querySelector("#tutorial-progress").innerHTML = TUTORIAL_STEPS.map((_, index) => `<i class="${index <= state.tutorialIndex ? "active" : ""}"></i>`).join("");
    const next = modal.querySelector('[data-action="next-tutorial"]');
    next.textContent = state.tutorialIndex >= TUTORIAL_STEPS.length - 1 ? "Commencer →" : "Suivant →";
  }

  renderPause(state) {
    this.root.querySelector("#pause-modal").hidden = !(state.paused && state.status === "playing");
  }

  renderGameOver(state) {
    const modal = this.root.querySelector("#gameover-modal");
    if (state.status !== "gameover") {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;
    const reason = state.player.infection >= 100
      ? "La contamination est irréversible"
      : state.player.health <= 0
        ? "Le survivant est tombé"
        : "La base a été détruite";
    this.root.querySelector("#gameover-title").textContent = reason;
    this.root.querySelector("#gameover-stats").innerHTML = this.renderEndStats(state);
  }

  renderVictory(state) {
    const modal = this.root.querySelector("#victory-modal");
    if (state.status !== "victory") {
      modal.hidden = true;
      return;
    }
    modal.hidden = false;
    this.root.querySelector("#victory-stats").innerHTML = this.renderEndStats(state);
  }

  renderEndStats(state) {
    return `
      <div><span>Jour atteint</span><b>${gameDay(state.totalMinutes)}</b></div>
      <div><span>Infectés éliminés</span><b>${state.kills}</b></div>
      <div><span>Alphas éliminés</span><b>${state.bossKills ?? 0}</b></div>
      <div><span>Nids détruits</span><b>${state.nestsCleared ?? 0}</b></div>
      <div><span>Missions</span><b>${state.missionsCompleted ?? 0}</b></div>
      <div><span>Avant-postes</span><b>${state.pois.filter((poi) => poi.outpost).length}</b></div>
      <div><span>Distance parcourue</span><b>${formatDistance(state.distanceTravelled)}</b></div>
      <div><span>Score final</span><b>${Math.round(state.score)}</b></div>
    `;
  }

  renderPanel(state) {
    const panels = {
      base: () => this.renderBasePanel(state),
      expeditions: () => this.renderExpeditionPanel(state),
      survivors: () => this.renderSurvivorPanel(state),
      workshop: () => this.renderWorkshopPanel(state),
      research: () => this.renderResearchPanel(state),
      missions: () => this.renderMissionPanel(state),
      journal: () => this.renderJournalPanel(state)
    };
    (panels[this.activeTab] ?? panels.base)();
  }

  renderBasePanel(state) {
    const base = state.base;
    const baseRatio = base.health / base.maxHealth;
    const wallRatio = base.wallMaxHealth > 0 ? base.wallHealth / base.wallMaxHealth : 0;
    const campaign = state.campaign;
    const hasProtocol = state.research.unlocked.includes("evacuationProtocol");
    const canBuildBeacon = state.player.atBase && campaign.signalParts >= campaign.requiredSignalParts && base.structures.radio >= 2 && hasProtocol && !campaign.beaconBuilt;
    const canCall = state.player.atBase && campaign.beaconBuilt && !campaign.evacuationCalled && !state.wave.active && !isNight(state.totalMinutes);
    this.panelContent.innerHTML = `
      <section class="campaign-card ${campaign.evacuationCalled ? "final" : ""}">
        <div class="panel-title"><div><small>CAMPAGNE D’ÉVACUATION</small><h2>${campaign.evacuationCalled ? "Dernière ligne de défense" : campaign.beaconBuilt ? "Balise prête" : "Rétablir un signal"}</h2></div><span>${campaign.signalParts}/${campaign.requiredSignalParts} modules</span></div>
        <div class="campaign-progress">${Array.from({ length: campaign.requiredSignalParts }, (_, index) => `<i class="${index < campaign.signalParts ? "active" : ""}"></i>`).join("")}</div>
        <p>${campaign.evacuationCalled ? "La balise attire la horde finale. Éliminez toutes les signatures pour gagner." : "Fouillez les zones marquées, développez la radio et recherchez le protocole d’évacuation."}</p>
        <div class="requirement-chips">
          <span class="${campaign.signalParts >= campaign.requiredSignalParts ? "done" : ""}">Modules ${campaign.signalParts}/${campaign.requiredSignalParts}</span>
          <span class="${base.structures.radio >= 2 ? "done" : ""}">Radio Niv. 2</span>
          <span class="${hasProtocol ? "done" : ""}">Protocole</span>
        </div>
        ${!campaign.beaconBuilt ? `<button type="button" data-action="build-beacon" class="primary-button" ${canBuildBeacon ? "" : "disabled"}>Construire la balise · ${formatCost(EVACUATION_BEACON_COST)}</button>` : ""}
        ${campaign.beaconBuilt && !campaign.evacuationCalled ? `<button type="button" data-action="call-evacuation" class="danger-button" ${canCall ? "" : "disabled"}>Appeler l’évacuation — déclenche le siège final</button>` : ""}
      </section>
      <section class="base-overview">
        <div class="panel-title"><div><small>CENTRE DE COMMANDEMENT</small><h2>Position fortifiée</h2></div><span>${base.survivors} survivants</span></div>
        <div class="base-stat"><span>Structure</span><div class="meter"><i style="width:${baseRatio * 100}%"></i></div><b>${Math.ceil(base.health)}/${base.maxHealth}</b></div>
        <div class="base-stat"><span>Palissade</span><div class="meter wall"><i style="width:${wallRatio * 100}%"></i></div><b>${base.wallMaxHealth > 0 ? `${Math.ceil(base.wallHealth)}/${base.wallMaxHealth}` : "ABSENTE"}</b></div>
        <div class="base-stat"><span>Moral</span><div class="meter morale"><i style="width:${base.morale}%"></i></div><b>${Math.round(base.morale)}%</b></div>
        <div class="base-badges"><span class="${base.generatorOnline ? "online" : ""}">ϟ ${base.generatorOnline ? "Générateur actif" : "Générateur hors ligne"}</span><span>◇ ${base.traps} piège(s)</span><span>⌂ ${state.pois.filter((poi) => poi.outpost).length} avant-poste(s)</span></div>
        <div class="repair-row">
          <button type="button" data-action="repair-wall" class="secondary-button compact" ${!base.wallMaxHealth || base.wallHealth >= base.wallMaxHealth || !state.player.atBase ? "disabled" : ""}>Réparer palissade</button>
          <button type="button" data-action="repair-base" class="secondary-button compact" ${base.health >= base.maxHealth || !state.player.atBase ? "disabled" : ""}>Réparer centre</button>
        </div>
      </section>
      <section class="structure-list">
        <div class="panel-subtitle"><strong>INFRASTRUCTURES</strong><span>${state.player.atBase ? "Construction disponible" : "Revenez à la base"}</span></div>
        ${Object.entries(STRUCTURES).map(([id, definition]) => {
          const level = base.structures[id] ?? 0;
          const maxed = level >= definition.maxLevel;
          const cost = maxed ? null : definition.costs[level];
          const affordable = cost ? canAfford(state.resources, cost) : false;
          return `
            <article class="structure-card ${maxed ? "maxed" : ""}">
              <span class="structure-icon">${definition.icon}</span>
              <div class="structure-copy"><strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(definition.description)}</small><div class="level-pips">${Array.from({ length: definition.maxLevel }, (_, index) => `<i class="${index < level ? "active" : ""}"></i>`).join("")}</div></div>
              <div class="structure-action">
                ${maxed ? `<b>MAX</b>` : `<small>${formatCost(cost)}</small><button type="button" data-structure-id="${id}" ${!state.player.atBase || !affordable ? "disabled" : ""}>NIV. ${level + 1}</button>`}
              </div>
            </article>
          `;
        }).join("")}
      </section>
    `;
  }

  renderExpeditionPanel(state) {
    const pois = state.pois
      .filter((poi) => poi.discovered)
      .sort((a, b) => {
        const aPriority = Number(Boolean(a.missionMarker)) * 5 + Number(Boolean(a.nest?.active)) * 4 + Number(Boolean(a.campaignSignalPart && !a.signalPartCollected)) * 3 + Number(Boolean(a.outpost)) * 2;
        const bPriority = Number(Boolean(b.missionMarker)) * 5 + Number(Boolean(b.nest?.active)) * 4 + Number(Boolean(b.campaignSignalPart && !b.signalPartCollected)) * 3 + Number(Boolean(b.outpost)) * 2;
        if (aPriority !== bPriority) return bPriority - aPriority;
        if (a.looted !== b.looted) return a.looted ? 1 : -1;
        return distanceMeters(state.player.pos, a.pos) - distanceMeters(state.player.pos, b.pos);
      });
    const scouts = state.base.roster.filter((survivor) => survivor.role === "scout" && survivor.health > 20).length;
    const radioRange = 1450 + state.base.structures.radio * 350 + scouts * 90 + (state.research.unlocked.includes("radioNetwork") ? 320 : 0);
    this.panelContent.innerHTML = `
      <div class="panel-title"><div><small>CARTE TACTIQUE</small><h2>Expéditions</h2></div><span>${pois.filter((poi) => !poi.looted || poi.nest?.active).length} zones actives · ${state.pois.filter((poi) => poi.realPlace).length} réelles</span></div>
      <div class="expedition-summary"><span>Portée radio</span><b>${formatDistance(radioRange)}</b><span>Butins</span><b>${state.locationsLooted}</b><span>Nids</span><b>${state.pois.filter((poi) => poi.nest?.active).length}</b><span>Avant-postes</span><b>${state.pois.filter((poi) => poi.outpost).length}</b></div>
      <div class="expedition-list">
        ${pois.map((poi) => {
          const config = POI_TYPES[poi.type] ?? POI_TYPES.house;
          const distance = distanceMeters(state.player.pos, poi.pos);
          const status = poi.nest?.active ? `NID ${poi.nest.strength}` : poi.outpost ? "AVANT-POSTE" : poi.missionMarker ? "MISSION" : poi.campaignSignalPart && !poi.signalPartCollected ? "SIGNAL" : poi.looted ? "VIDE" : "BUTIN";
          return `
            <article class="expedition-card ${poi.id === state.selectedPoiId ? "selected" : ""} ${poi.looted ? "looted" : ""} ${poi.nest?.active ? "nest" : ""} ${poi.outpost ? "outpost" : ""}" data-poi-id="${poi.id}">
              <span class="expedition-icon">${poi.outpost ? "⌂" : poi.nest?.active ? "⌬" : poi.looted ? "✓" : config.icon}</span>
              <div><strong>${escapeHtml(poi.name)}</strong><small>${formatDistance(distance)} · ${"◆".repeat(poi.danger)}${"◇".repeat(5 - poi.danger)}${poi.realPlace ? " · RÉEL" : ""}</small><em>${status}</em></div>
              <button type="button" data-poi-id="${poi.id}" data-command="travel">PARTIR</button>
            </article>
          `;
        }).join("") || `<div class="empty-state">Aucun lieu détecté. Explorez ou améliorez la radio.</div>`}
      </div>
    `;
  }

  renderSurvivorPanel(state) {
    const roleCounts = Object.fromEntries(Object.keys(SURVIVOR_ROLES).map((id) => [id, state.base.roster.filter((survivor) => survivor.role === id).length]));
    this.panelContent.innerHTML = `
      <div class="panel-title"><div><small>COMMUNAUTÉ</small><h2>Survivants & affectations</h2></div><span>${state.base.roster.length} personnes</span></div>
      <div class="role-summary">${Object.entries(SURVIVOR_ROLES).filter(([id]) => id !== "idle").map(([id, role]) => `<span title="${escapeHtml(role.description)}">${role.icon} ${roleCounts[id] ?? 0}</span>`).join("")}</div>
      <p class="panel-description">Les rôles modifient directement défense, soins, coûts, exploration et production. Les affectations se changent uniquement à la base.</p>
      <div class="survivor-list">
        ${state.base.roster.map((survivor) => {
          const role = SURVIVOR_ROLES[survivor.role] ?? SURVIVOR_ROLES.idle;
          return `<article class="survivor-card ${survivor.injured ? "injured" : ""}">
            <div class="survivor-avatar">${role.icon}</div>
            <div class="survivor-copy"><strong>${escapeHtml(survivor.name)}</strong><small>Arrivé jour ${survivor.joinedDay} · Moral ${Math.round(survivor.morale)}%</small><div class="mini-meter"><i style="width:${survivor.health}%"></i></div></div>
            <select data-survivor-role="${survivor.id}" aria-label="Rôle de ${escapeHtml(survivor.name)}" ${!state.player.atBase ? "disabled" : ""}>
              ${Object.entries(SURVIVOR_ROLES).map(([id, definition]) => `<option value="${id}" ${id === survivor.role ? "selected" : ""}>${definition.icon} ${escapeHtml(definition.label)}</option>`).join("")}
            </select>
          </article>`;
        }).join("")}
      </div>
    `;
  }

  renderWorkshopPanel(state) {
    const vehicle = state.vehicle;
    const vehicleCost = VEHICLE_DEFINITION.repairCost;
    this.panelContent.innerHTML = `
      <div class="panel-title"><div><small>FABRICATION & LOGISTIQUE</small><h2>Atelier de survie</h2></div><span>Niveau ${state.base.structures.workshop}</span></div>
      <div class="inventory-grid">
        <div><span>✚ Kits terrain</span><b>${state.inventory.fieldKit}</b><button type="button" data-action="use-field-kit" ${state.inventory.fieldKit <= 0 ? "disabled" : ""}>UTILISER</button></div>
        <div><span>⚒ Kits réparation</span><b>${state.inventory.repairKit}</b><button type="button" data-action="repair-vehicle-kit" ${state.inventory.repairKit <= 0 || !vehicle.repaired || vehicle.condition >= vehicle.maxCondition ? "disabled" : ""}>RÉPARER</button></div>
        <div><span>◇ Pièges stockés</span><b>${state.inventory.trap}</b><button type="button" data-action="deploy-trap" ${state.inventory.trap <= 0 || !state.player.atBase ? "disabled" : ""}>DÉPLOYER</button></div>
        <div><span>⌬ Antidotes</span><b>${state.inventory.antidote}</b><button type="button" data-action="antidote" ${state.inventory.antidote <= 0 || state.player.infection <= 0 ? "disabled" : ""}>INJECTER</button></div>
      </div>
      <article class="vehicle-card ${vehicle.active ? "active" : ""}">
        <div class="vehicle-visual">▰</div>
        <div><small>VÉHICULE D’EXPÉDITION</small><strong>${escapeHtml(VEHICLE_DEFINITION.label)}</strong><p>${!vehicle.discovered ? "Localisez l’épave grâce à la transmission radio." : !vehicle.repaired ? "L’épave est revenue à la base. Recherchez la mécanique puis réparez-la." : `État ${Math.round(vehicle.condition)} % · ${formatDistance(vehicle.distanceTravelled)} parcourus`}</p></div>
        <div class="vehicle-actions">
          ${vehicle.discovered && !vehicle.repaired ? `<button type="button" data-action="repair-vehicle" class="primary-button compact" ${!state.player.atBase || !state.research.unlocked.includes("mechanics") || !canAfford(state.resources, vehicleCost) ? "disabled" : ""}>Réparer · ${formatCost(vehicleCost)}</button>` : ""}
          ${vehicle.repaired ? `<button type="button" data-action="toggle-vehicle" class="${vehicle.active ? "danger-button" : "primary-button"} compact" ${vehicle.condition <= 0 || (!vehicle.active && state.resources.fuel <= 0) ? "disabled" : ""}>${vehicle.active ? "Arrêter" : "Démarrer"} · V</button>` : ""}
        </div>
      </article>
      <div class="panel-subtitle"><strong>RECETTES</strong><span>Ingénieurs : coûts réduits</span></div>
      <div class="recipe-list">
        ${Object.entries(CRAFTING_RECIPES).map(([id, recipe]) => {
          const researchId = "research" in recipe ? recipe.research : null;
          const workshopOk = state.base.structures.workshop >= recipe.minWorkshop;
          const researchOk = !researchId || state.research.unlocked.includes(researchId);
          const affordable = canAfford(state.resources, recipe.cost);
          return `<article class="recipe-card ${workshopOk && researchOk ? "" : "locked"}"><span>${recipe.icon}</span><div><strong>${escapeHtml(recipe.label)}</strong><small>${escapeHtml(recipe.description)}</small><em>${!workshopOk ? `Atelier niveau ${recipe.minWorkshop} requis` : !researchOk ? `Recherche ${escapeHtml(RESEARCH_TECHS[researchId]?.label ?? researchId)}` : formatCost(recipe.cost)}</em></div><button type="button" data-recipe-id="${id}" ${!state.player.atBase || !workshopOk || !researchOk || !affordable ? "disabled" : ""}>FABRIQUER</button></article>`;
        }).join("")}
      </div>
    `;
  }

  renderResearchPanel(state) {
    this.panelContent.innerHTML = `
      <div class="panel-title"><div><small>CENTRE D’ANALYSE</small><h2>Arbre de recherche</h2></div><span>⌁ ${Math.floor(state.resources.intel)} renseignements</span></div>
      <p class="panel-description">Les renseignements viennent des missions, nids, sites sensibles et alphas. Chaque technologie applique un bonus permanent.</p>
      <div class="research-grid">
        ${Object.entries(RESEARCH_TECHS).map(([id, tech]) => {
          const unlocked = state.research.unlocked.includes(id);
          const missing = tech.prerequisites.filter((prerequisite) => !state.research.unlocked.includes(prerequisite));
          const affordable = state.resources.intel >= tech.cost;
          return `<article class="research-card ${unlocked ? "unlocked" : missing.length ? "locked" : ""}"><span>${tech.icon}</span><div><strong>${escapeHtml(tech.label)}</strong><small>${escapeHtml(tech.description)}</small><em>${unlocked ? "RECHERCHE TERMINÉE" : missing.length ? `Prérequis : ${missing.map((item) => escapeHtml(RESEARCH_TECHS[item]?.label ?? item)).join(", ")}` : `Coût : ⌁ ${tech.cost}`}</em></div><button type="button" data-research-id="${id}" ${unlocked || missing.length || !affordable || !state.player.atBase ? "disabled" : ""}>${unlocked ? "ACQUIS" : "RECHERCHER"}</button></article>`;
        }).join("")}
      </div>
    `;
  }

  renderMissionPanel(state) {
    const missions = state.missions.active.slice().sort((a, b) => a.expiresAtMinutes - b.expiresAtMinutes);
    this.panelContent.innerHTML = `
      <div class="panel-title"><div><small>TRANSMISSIONS RADIO</small><h2>Missions actives</h2></div><span>${missions.length} active(s)</span></div>
      <p class="panel-description">Les missions expirent. La radio et le réseau maillé augmentent le nombre de transmissions disponibles chaque matin.</p>
      <div class="mission-list">
        ${missions.map((mission) => {
          const definition = MISSION_TYPES[mission.type] ?? MISSION_TYPES.supply;
          const poi = state.pois.find((item) => item.id === mission.poiId);
          const remaining = Math.max(0, mission.expiresAtMinutes - state.totalMinutes);
          return `<article class="mission-card"><span>${definition.icon}</span><div><strong>${escapeHtml(mission.title)}</strong><small>${escapeHtml(mission.description)}</small><em>Expire dans ${formatGameDuration(remaining)} · ${poi ? formatDistance(distanceMeters(state.player.pos, poi.pos)) : "zone perdue"}</em></div>${poi ? `<button type="button" data-poi-id="${poi.id}" data-command="travel">PARTIR</button>` : ""}</article>`;
        }).join("") || `<div class="empty-state">Aucune transmission active. La radio écoute le secteur.</div>`}
      </div>
      <div class="panel-subtitle"><strong>HISTORIQUE RÉCENT</strong><span>${state.missionsCompleted} mission(s) réussie(s)</span></div>
      <div class="mission-history">${state.missions.history.slice(0, 8).map((mission) => `<span>${MISSION_TYPES[mission.type]?.icon ?? "✓"} ${escapeHtml(mission.title)}</span>`).join("") || "Aucune mission terminée."}</div>
    `;
  }

  renderJournalPanel(state) {
    this.panelContent.innerHTML = `
      <div class="panel-title"><div><small>ARCHIVES RADIO</small><h2>Journal de zone</h2></div><span>Score ${Math.round(state.score)}</span></div>
      <div class="statistics-grid">
        <div><span>Éliminations</span><b>${state.kills}</b></div>
        <div><span>Alphas</span><b>${state.bossKills ?? 0}</b></div>
        <div><span>Distance</span><b>${formatDistance(state.distanceTravelled)}</b></div>
        <div><span>Vague</span><b>${state.wave.number}</b></div>
        <div><span>Lieux</span><b>${state.locationsLooted}/${state.pois.length}</b></div>
        <div><span>Nids</span><b>${state.nestsCleared ?? 0}</b></div>
        <div><span>Missions</span><b>${state.missionsCompleted ?? 0}</b></div>
        <div><span>Météos</span><b>${state.weather.changes}</b></div>
      </div>
      <div class="journal-list">
        ${state.logs.map((entry) => `
          <article><time>J${gameDay(entry.totalMinutes)} · ${formatClock(entry.totalMinutes)}</time><span class="log-dot ${entry.category}"></span><p>${escapeHtml(entry.text)}</p></article>
        `).join("")}
      </div>
    `;
  }

  openSettings() {
    const modal = this.root.querySelector("#settings-modal");
    const settings = this.settings ?? {};
    this.root.querySelector("#google-key-input").value = settings.googleMapsApiKey ?? "";
    this.root.querySelector("#sound-setting").checked = settings.soundEnabled !== false;
    this.root.querySelector("#motion-setting").checked = settings.reducedMotion === true;
    modal.hidden = false;
  }

  closeSettings() {
    this.root.querySelector("#settings-modal").hidden = true;
  }

  saveSettingsFromForm() {
    const nextSettings = {
      ...(this.settings ?? {}),
      googleMapsApiKey: this.root.querySelector("#google-key-input").value.trim(),
      soundEnabled: this.root.querySelector("#sound-setting").checked,
      reducedMotion: this.root.querySelector("#motion-setting").checked
    };
    this.callbacks.saveSettings?.(nextSettings);
    this.closeSettings();
  }

  toggleKeyVisibility() {
    const input = this.root.querySelector("#google-key-input");
    input.type = input.type === "password" ? "text" : "password";
  }

  showToast(type, title, text) {
    const id = `local-${Date.now()}`;
    const container = this.root.querySelector("#notifications");
    const element = document.createElement("button");
    element.type = "button";
    element.className = `notification ${type}`;
    element.dataset.notificationId = id;
    element.innerHTML = `<span></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(text)}</small></div><b>×</b>`;
    element.addEventListener("click", () => element.remove());
    container.prepend(element);
    window.setTimeout(() => element.remove(), 6500);
  }
}

function setMeter(element, ratio) {
  element.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
}

function formatCost(cost) {
  return Object.entries(cost)
    .map(([resource, amount]) => `${RESOURCE_META[resource]?.icon ?? resource} ${amount}`)
    .join(" ");
}

function canAfford(resources, cost) {
  return Object.entries(cost ?? {}).every(([resource, amount]) => (resources[resource] ?? 0) >= amount);
}

function formatGameDuration(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${rest} min`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
