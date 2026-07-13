import assert from "node:assert/strict";
import test from "node:test";

import {
  SETTINGS_KEY,
  defaultSettings,
  loadSettings,
  mouseSensitivity,
  saveSettings,
} from "../src/runtime/settings.js";

function withGlobalProperty(name, value, callback) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
  try {
    return callback();
  } finally {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  }
}

function withStorage(initialValue, callback) {
  let stored = initialValue;
  const storage = {
    getItem(key) {
      return key === SETTINGS_KEY ? stored : null;
    },
    setItem(key, value) {
      assert.equal(key, SETTINGS_KEY);
      stored = value;
    },
  };
  return withGlobalProperty("localStorage", storage, () => callback(() => stored));
}

test("settings defaults are complete and sensitivity has one canonical conversion", () => {
  withGlobalProperty("matchMedia", () => ({ matches: false }), () => {
    const defaults = defaultSettings();
    assert.deepEqual(defaults, {
      inputMode: "mouse",
      fov: 72,
      sensitivity: 5,
      volume: 45,
      reducedEffects: false,
      highContrast: false,
      muted: false,
    });
    assert.equal(mouseSensitivity(defaults), 0.003);
  });
});

test("stored settings are normalized at the persistence boundary", () => {
  withStorage(JSON.stringify({
    inputMode: "unsupported",
    fov: 500,
    sensitivity: -4,
    volume: "not-a-number",
    reducedEffects: 1,
    highContrast: 0,
    muted: "yes",
  }), () => {
    assert.deepEqual(loadSettings(), {
      inputMode: "mouse",
      fov: 90,
      sensitivity: 1,
      volume: 45,
      reducedEffects: true,
      highContrast: false,
      muted: true,
    });
  });
});

test("saving preferences writes only the package-owned settings record", () => {
  const settings = { ...defaultSettings(), inputMode: "keyboard", volume: 20 };
  withStorage(null, (storedValue) => {
    saveSettings(settings);
    assert.deepEqual(JSON.parse(storedValue()), settings);
  });
});
