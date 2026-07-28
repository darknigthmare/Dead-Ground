import test from "node:test";
import assert from "node:assert/strict";

import { GameUI } from "../src/ui.js";

function createSettingsHarness(state) {
  const calls = [];
  const attributes = new Map();
  const source = {
    isConnected: true,
    focus: () => calls.push("restore-focus")
  };
  const elements = {
    "#settings-modal": { hidden: true },
    "#google-key-input": {
      value: "",
      type: "password",
      focus: () => calls.push("focus-key")
    },
    '[data-action="toggle-key"]': {
      setAttribute: (name, value) => attributes.set(name, value)
    },
    "#sound-setting": { checked: false },
    "#motion-setting": { checked: false }
  };
  const ui = Object.create(GameUI.prototype);
  Object.assign(ui, {
    root: {
      ownerDocument: { activeElement: source },
      querySelector: (selector) => elements[selector]
    },
    phase: "game",
    settings: {
      googleMapsApiKey: "clé-test",
      soundEnabled: true,
      reducedMotion: false
    },
    latestGameState: state,
    settingsPausedGame: false,
    settingsReturnFocus: null,
    callbacks: {
      pause: () => {
        calls.push("pause");
        state.paused = true;
      },
      resume: () => {
        calls.push("resume");
        state.paused = false;
      }
    }
  });
  return { ui, calls, elements, attributes };
}

test("les paramètres ne reprennent que la pause qu’ils ont initiée", async (t) => {
  await t.test("une partie active est suspendue puis reprise", () => {
    const state = { status: "playing", paused: false, tutorialVisible: false };
    const { ui, calls } = createSettingsHarness(state);

    ui.openSettings();
    ui.closeSettings();

    assert.deepEqual(calls, ["pause", "focus-key", "resume", "restore-focus"]);
    assert.equal(state.paused, false);
  });

  await t.test("une pause antérieure reste en pause", () => {
    const state = { status: "playing", paused: true, tutorialVisible: false };
    const { ui, calls } = createSettingsHarness(state);

    ui.openSettings();
    ui.closeSettings();

    assert.deepEqual(calls, ["focus-key", "restore-focus"]);
    assert.equal(state.paused, true);
  });

  for (const terminalState of [
    { label: "le tutoriel", status: "playing", tutorialVisible: true },
    { label: "la fin de partie", status: "gameover", tutorialVisible: false }
  ]) {
    await t.test(`la fermeture ne reprend jamais ${terminalState.label}`, () => {
      const state = { status: "playing", paused: false, tutorialVisible: false };
      const { ui, calls } = createSettingsHarness(state);

      ui.openSettings();
      state.status = terminalState.status;
      state.tutorialVisible = terminalState.tutorialVisible;
      ui.closeSettings();

      assert.equal(calls.includes("pause"), true);
      assert.equal(calls.includes("resume"), false);
    });
  }
});

test("l'ouverture du tutoriel place immédiatement le focus dans la modale", () => {
  const calls = [];
  const body = {};
  const title = { textContent: "" };
  const copy = { textContent: "" };
  const progress = { innerHTML: "" };
  const next = {
    textContent: "",
    focus() {
      calls.push("focus-next");
      documentState.activeElement = next;
    }
  };
  const modal = {
    hidden: true,
    contains: (element) => element === next,
    querySelector: () => next
  };
  const elements = {
    "#tutorial-modal": modal,
    "#tutorial-title": title,
    "#tutorial-body": copy,
    "#tutorial-progress": progress
  };
  const documentState = { activeElement: body };
  const ui = Object.create(GameUI.prototype);
  ui.root = {
    ownerDocument: documentState,
    querySelector: (selector) => elements[selector]
  };

  ui.renderTutorial({ tutorialVisible: true, tutorialIndex: 0 });

  assert.equal(modal.hidden, false);
  assert.deepEqual(calls, ["focus-next"]);
  assert.equal(documentState.activeElement, next);
});

test("la pause prend puis rend le focus au contrôle qui l'a ouverte", () => {
  const calls = [];
  const pauseButton = {
    isConnected: true,
    focus() {
      calls.push("focus-pause");
      documentState.activeElement = pauseButton;
    }
  };
  const resume = {
    focus() {
      calls.push("focus-resume");
      documentState.activeElement = resume;
    }
  };
  const modal = {
    hidden: true,
    contains: (element) => element === resume,
    querySelector: () => resume
  };
  const documentState = { activeElement: pauseButton };
  const ui = Object.create(GameUI.prototype);
  Object.assign(ui, {
    root: {
      ownerDocument: documentState,
      querySelector: (selector) => selector === "#pause-modal" ? modal : pauseButton
    },
    pauseReturnFocus: null
  });
  const state = { paused: true, status: "playing", tutorialVisible: false };

  ui.renderPause(state);
  assert.equal(documentState.activeElement, resume);

  state.paused = false;
  ui.renderPause(state);
  assert.equal(documentState.activeElement, pauseButton);
  assert.deepEqual(calls, ["focus-resume", "focus-pause"]);
});

for (const terminal of [
  { label: "défaite", method: "renderGameOver", status: "gameover" },
  { label: "victoire", method: "renderVictory", status: "victory" }
]) {
  test(`la modale de ${terminal.label} place le focus sur l'action principale`, () => {
    const restart = { focusCalled: false, focus() { this.focusCalled = true; } };
    const modal = {
      hidden: true,
      contains: () => false,
      querySelector: () => restart
    };
    const elements = {
      [terminal.method === "renderGameOver" ? "#gameover-modal" : "#victory-modal"]: modal,
      "#gameover-title": { textContent: "" },
      "#gameover-stats": { innerHTML: "" },
      "#victory-stats": { innerHTML: "" }
    };
    const ui = Object.create(GameUI.prototype);
    Object.assign(ui, {
      root: {
        ownerDocument: { activeElement: {} },
        querySelector: (selector) => elements[selector]
      },
      renderEndStats: () => ""
    });
    const state = {
      status: terminal.status,
      player: { infection: 0, health: terminal.status === "gameover" ? 0 : 100 }
    };

    ui[terminal.method](state);

    assert.equal(modal.hidden, false);
    assert.equal(restart.focusCalled, true);
  });
}
