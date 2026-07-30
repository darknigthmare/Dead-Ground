import { drawGameOverlay, drawSelectionOverlay } from "../renderer.js";
import { REAL_PLACE_SEARCH_TYPES } from "../real-places.js";

let googleMapsPromise = null;
let googleAuthFailure = null;
let googleMapsLoaderCancel = null;
let googleMapsRequiresReload = false;
const googleAuthFailureListeners = new Set();
let googleAuthFailureHookInstalled = false;

function googleAuthenticationError() {
  return new Error("Google Maps a refusé l’authentification de la clé. Vérifiez le domaine, les API autorisées et la facturation.");
}

function installGoogleAuthFailureHook() {
  if (googleAuthFailureHookInstalled) return;
  const previousHandler = window.gm_authFailure;
  window.gm_authFailure = () => {
    googleAuthFailure = googleAuthenticationError();
    for (const listener of [...googleAuthFailureListeners]) listener(googleAuthFailure);
    if (typeof previousHandler === "function") {
      try {
        previousHandler();
      } catch {
        // Le gestionnaire de l’hôte ne doit pas empêcher le fallback du jeu.
      }
    }
  };
  googleAuthFailureHookInstalled = true;
}

function subscribeGoogleAuthFailure(listener) {
  installGoogleAuthFailureHook();
  googleAuthFailureListeners.add(listener);
  if (googleAuthFailure) listener(googleAuthFailure);
  return () => googleAuthFailureListeners.delete(listener);
}

function googleMapsReloadRequiredError() {
  return Object.assign(
    new Error(
      "La clé Google Maps a changé alors que l’API était déjà chargée. Rechargez la page pour appliquer la nouvelle clé."
    ),
    { code: "GOOGLE_MAPS_RELOAD_REQUIRED" }
  );
}

/**
 * Retire le chargeur courant avant l'initialisation avec une autre clé.
 * L'API Google déjà installée dans window ne peut pas être déchargée proprement :
 * dans ce cas le résultat exige un rechargement, et loadGoogleMaps refusera de
 * réutiliser silencieusement l'ancienne clé.
 */
export function resetGoogleMapsLoader({ reloadIfLoaded = false } = {}) {
  const requiresReload = Boolean(window.google?.maps);
  googleMapsLoaderCancel?.();
  googleMapsLoaderCancel = null;
  document.getElementById("dead-ground-google-maps")?.remove();
  googleMapsPromise = null;
  googleAuthFailure = null;
  googleMapsRequiresReload = requiresReload;

  if (requiresReload && reloadIfLoaded) {
    window.location.reload();
    return { requiresReload: true, reloading: true };
  }

  return {
    requiresReload,
    reloading: false,
    error: requiresReload ? googleMapsReloadRequiredError() : null
  };
}

export function loadGoogleMaps(apiKey) {
  installGoogleAuthFailureHook();
  if (googleMapsRequiresReload) return Promise.reject(googleMapsReloadRequiredError());
  if (googleAuthFailure) return Promise.reject(googleAuthFailure);
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  if (!apiKey) return Promise.reject(new Error("Clé Google Maps absente."));

  googleAuthFailure = null;
  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = `__deadGroundMapsReady_${Date.now().toString(36)}`;
    const script = document.createElement("script");
    let timeout = 0;
    let settled = false;
    const unsubscribeAuthFailure = subscribeGoogleAuthFailure((error) => fail(error));

    const cleanup = () => {
      window.clearTimeout(timeout);
      unsubscribeAuthFailure();
      googleMapsLoaderCancel = null;
      script.onerror = null;
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    };

    function fail(reason) {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      googleMapsPromise = null;
      reject(reason instanceof Error ? reason : new Error(reason));
    }

    googleMapsLoaderCancel = () => {
      fail(new Error("Le chargement de Google Maps a été réinitialisé."));
    };

    timeout = window.setTimeout(() => {
      fail("Le chargement de Google Maps a expiré.");
    }, 18_000);

    window[callbackName] = () => {
      if (settled) return;
      if (!window.google?.maps) {
        fail("Google Maps ne s’est pas initialisé.");
        return;
      }
      settled = true;
      cleanup();
      resolve(window.google.maps);
    };

    script.id = "dead-ground-google-maps";
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      fail("Impossible de charger le script Google Maps.");
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&language=fr&region=FR&callback=${callbackName}`;
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export class GoogleMapAdapter {
  static async create(options) {
    await loadGoogleMaps(options.apiKey);
    if (googleAuthFailure) throw googleAuthFailure;
    const adapter = new GoogleMapAdapter(options);
    try {
      await adapter.whenReady();
      return adapter;
    } catch (error) {
      adapter.destroy();
      throw error;
    }
  }

  constructor({ container, center, onClick, onStatus, reducedMotion = false }) {
    this.container = container;
    this.onClick = onClick ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.snapshot = null;
    this.selection = center;
    this.mode = "select";
    this.reducedMotion = Boolean(reducedMotion);
    this.animationTimeMs = 0;
    this.projection = null;
    this.destroyed = false;
    this.canvas = null;
    this.ctx = null;
    this.overlay = null;
    this.listeners = [];
    this.resizeObserver = null;
    this.ready = false;
    this.readyTimeout = 0;
    this.resolveReady = null;
    this.rejectReady = null;
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.unsubscribeAuthFailure = subscribeGoogleAuthFailure((error) => this.failReady(error));

    this.surface = document.createElement("div");
    this.surface.className = "map-surface google-map-surface";
    this.container.replaceChildren(this.surface);

    this.map = new google.maps.Map(this.surface, {
      center,
      zoom: 18,
      minZoom: 15,
      maxZoom: 20,
      mapTypeId: google.maps.MapTypeId.SATELLITE,
      disableDefaultUI: true,
      zoomControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
      keyboardShortcuts: false,
      tilt: 0,
      heading: 0,
      backgroundColor: "#0a0e0b"
    });

    const adapter = this;
    class GameCanvasOverlay extends google.maps.OverlayView {
      onAdd() {
        adapter.canvas = document.createElement("canvas");
        adapter.canvas.className = "google-game-overlay";
        adapter.canvas.setAttribute("aria-hidden", "true");
        adapter.surface.appendChild(adapter.canvas);
        adapter.ctx = adapter.canvas.getContext("2d");
      }

      draw() {
        adapter.projection = this.getProjection();
        adapter.render();
      }

      onRemove() {
        adapter.canvas?.remove();
        adapter.canvas = null;
        adapter.ctx = null;
        adapter.projection = null;
      }
    }

    this.overlay = new GameCanvasOverlay();
    this.overlay.setMap(this.map);
    this.listeners = [
      this.map.addListener("click", (event) => {
        if (!event.latLng) return;
        this.onClick({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      }),
      this.map.addListener("bounds_changed", () => this.render()),
      this.map.addListener("zoom_changed", () => this.render()),
      this.map.addListener("idle", () => {
        this.render();
        this.markReady();
      })
    ];

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.surface);
    if (!this.ready) {
      this.readyTimeout = window.setTimeout(() => {
        this.failReady(new Error("Google Maps n’a pas terminé le chargement de la carte."));
      }, 18_000);
    }
  }

  whenReady() {
    return this.readyPromise;
  }

  markReady() {
    if (this.ready || this.destroyed) return;
    this.ready = true;
    window.clearTimeout(this.readyTimeout);
    this.onStatus({ provider: "google", ready: true, label: "Satellite Google Maps" });
    this.resolveReady?.();
    this.resolveReady = null;
    this.rejectReady = null;
  }

  failReady(error) {
    if (this.ready || this.destroyed) return;
    window.clearTimeout(this.readyTimeout);
    this.rejectReady?.(error instanceof Error ? error : googleAuthenticationError());
    this.resolveReady = null;
    this.rejectReady = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.render();
  }

  setSelection(position) {
    this.selection = { ...position };
    this.render();
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.render();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    this.render();
  }

  setAnimationTime(value) {
    if (Number.isFinite(value)) this.animationTimeMs = value;
  }

  panTo(position, zoom) {
    this.map.panTo(position);
    if (Number.isFinite(zoom)) this.map.setZoom(zoom);
  }

  getCenter() {
    const center = this.map.getCenter();
    return center ? { lat: center.lat(), lng: center.lng() } : null;
  }

  async geocode(query) {
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();
    const response = await geocoder.geocode({ address: query, region: "FR" });
    const result = response.results?.[0];
    if (!result) return null;
    const location = result.geometry.location;
    return {
      position: { lat: location.lat(), lng: location.lng() },
      label: result.formatted_address
    };
  }

  async searchNearbyPois(center, { radius = 1500, maxResultCount = 20 } = {}) {
    const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary("places");
    const request = {
      fields: ["id", "location"],
      locationRestriction: { center, radius: Math.min(50000, Math.max(100, radius)) },
      includedPrimaryTypes: REAL_PLACE_SEARCH_TYPES,
      maxResultCount: Math.min(20, Math.max(1, maxResultCount)),
      rankPreference: SearchNearbyRankPreference?.POPULARITY ?? "POPULARITY",
      language: "fr",
      region: "FR"
    };
    const { places = [] } = await Place.searchNearby(request);
    return places;
  }

  render() {
    if (this.destroyed || !this.ctx || !this.canvas || !this.projection) return;
    const rect = this.surface.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const project = (position) => {
      const point = this.projection.fromLatLngToContainerPixel(
        new google.maps.LatLng(position.lat, position.lng)
      );
      return point ? { x: point.x, y: point.y } : null;
    };

    if (this.mode === "select") {
      drawSelectionOverlay(this.ctx, project, this.selection, { width, height });
    } else {
      drawGameOverlay(this.ctx, project, this.snapshot, { width, height }, {
        zoom: this.map.getZoom() ?? 17,
        reducedMotion: this.reducedMotion,
        animationTimeMs: this.animationTimeMs
      });
    }
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.readyTimeout);
    this.unsubscribeAuthFailure?.();
    this.listeners?.forEach((listener) => listener.remove());
    this.resizeObserver?.disconnect();
    this.overlay?.setMap(null);
    this.container.replaceChildren();
  }
}
