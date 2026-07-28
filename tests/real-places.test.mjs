import test from "node:test";
import assert from "node:assert/strict";
import { mapGooglePlaceType, normalizeGooglePlaces } from "../src/real-places.js";
import { destinationPoint } from "../src/geo.js";
import { createInitialState } from "../src/world.js";

const START = { lat: 43.2965, lng: 5.3698 };

test("convertit les catégories Google en catégories de jeu", () => {
  assert.equal(mapGooglePlaceType("pharmacy"), "pharmacy");
  assert.equal(mapGooglePlaceType("gas_station"), "fuel");
  assert.equal(mapGooglePlaceType("hospital"), "clinic");
  assert.equal(mapGooglePlaceType("supermarket"), "market");
  assert.equal(mapGooglePlaceType("unknown", ["hardware_store"]), "hardware");
});

test("normalise les lieux Google et conserve leurs métadonnées", () => {
  const places = normalizeGooglePlaces([
    {
      id: "pharma-1",
      displayName: "Pharmacie du Port",
      location: { lat: 43.3002, lng: 5.3712 },
      formattedAddress: "1 quai du Port, Marseille",
      primaryType: "pharmacy",
      types: ["pharmacy", "store"],
      googleMapsURI: "https://maps.google.test/pharma-1"
    }
  ], START);

  assert.equal(places.length, 1);
  assert.equal(places[0].type, "pharmacy");
  assert.equal(places[0].name, "Pharmacie du Port");
  assert.equal(places[0].realPlace, true);
  assert.equal(places[0].source, "google-places");
  assert.match(places[0].address, /Marseille/);
});

test("crée un monde hybride complété par des lieux procéduraux", () => {
  const realPois = normalizeGooglePlaces([
    {
      id: "fuel-1",
      displayName: "Station République",
      location: { lat: 43.299, lng: 5.372 },
      formattedAddress: "Marseille",
      primaryType: "gas_station",
      types: ["gas_station"]
    }
  ], START);
  const state = createInitialState({ start: START, seed: 1234, realPois });
  assert.equal(state.pois.length, 22);
  assert.equal(state.pois.filter((poi) => poi.realPlace).length, 1);
  assert.ok(state.pois.some((poi) => poi.source === "procedural"));
});

test("compte seulement les lieux réels effectivement acceptés dans le monde", () => {
  const tooClose = {
    id: "too-close",
    type: "pharmacy",
    name: "Pharmacie sur la base",
    pos: { ...START },
    danger: 2,
    source: "google-places",
    realPlace: true
  };
  const accepted = {
    id: "accepted-real",
    type: "market",
    name: "Marché réel",
    pos: destinationPoint(START, 0.4, 260),
    danger: 2,
    source: "google-places",
    realPlace: true
  };
  const state = createInitialState({
    start: START,
    difficultyId: "normal",
    seed: 42,
    realPois: [tooClose, accepted]
  });
  assert.equal(state.realPlaceCount, 1);
  assert.equal(state.worldSource, "hybrid-google-places");
  assert.equal(state.pois.some((poi) => poi.id === "too-close"), false);
  assert.equal(state.pois.some((poi) => poi.id === "accepted-real"), true);
});
