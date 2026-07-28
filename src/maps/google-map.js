import { drawGameOverlay, drawSelectionOverlay } from "../renderer.js";
import { REAL_PLACE_SEARCH_TYPES } from "../real-places.js";

let googleMapsPromise = null;

export function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  if (!apiKey) return Promise.reject(new Error("Clé Google Maps absente."));

  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = `__deadGroundMapsReady_${Date.now().toString(36)}`;
    const script = document.createElement("script");
    let timeout = 0;

    const cleanup = () => {
      window.clearTimeout(timeout);
      script.onerror = null;
      try {
        delete window[callbackName];
      } catch {
        window[callbackName] = undefined;
      }
    };

    const fail = (message) => {
      cleanup();
      script.remove();
      googleMapsPromise = null;
      reject(new Error(message));
    };

    timeout = window.setTimeout(() => {
      fail("Le chargement de Google Maps a expiré.");
    }, 18_000);

    window[callbackName] = () => {
      cleanup();
      if (window.google?.maps) resolve(window.google.maps);
      else fail("Google Maps ne s’est pas initialisé.");
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
    return new GoogleMapAdapter(options);
  }

  constructor({ container, center, onClick, onStatus }) {
    this.container = container;
    this.onClick = onClick ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.snapshot = null;
    this.selection = center;
    this.mode = "select";
    this.projection = null;
    this.destroyed = false;
    this.canvas = null;
    this.ctx = null;
    this.overlay = null;
    this.listeners = [];
    this.resizeObserver = null;

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
        this.onStatus({ provider: "google", ready: true, label: "Satellite Google Maps" });
      })
    ];

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.surface);
    this.onStatus({ provider: "google", ready: true, label: "Satellite Google Maps" });
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
      fields: [
        "id",
        "displayName",
        "location",
        "formattedAddress",
        "primaryType",
        "types",
        "googleMapsURI"
      ],
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
      drawGameOverlay(this.ctx, project, this.snapshot, { width, height }, { zoom: this.map.getZoom() ?? 17 });
    }
  }

  destroy() {
    this.destroyed = true;
    this.listeners?.forEach((listener) => listener.remove());
    this.resizeObserver?.disconnect();
    this.overlay?.setMap(null);
    this.container.replaceChildren();
  }
}
