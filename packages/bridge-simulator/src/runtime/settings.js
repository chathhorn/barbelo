const SETTINGS_KEY = "bridgeSimulator.settings.v1";

function safeLocalStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function defaultSettings() {
  const reduced = typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    inputMode: "mouse",
    fov: 72,
    sensitivity: 5,
    volume: 45,
    reducedEffects: reduced,
    highContrast: false,
    muted: false,
  };
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function loadSettings() {
  const defaults = defaultSettings();
  try {
    const storage = safeLocalStorage();
    const parsed = storage ? JSON.parse(storage.getItem(SETTINGS_KEY) || "null") : null;
    if (!parsed || typeof parsed !== "object") return defaults;
    return {
      inputMode: parsed.inputMode === "keyboard" ? "keyboard" : "mouse",
      fov: boundedNumber(parsed.fov, defaults.fov, 55, 90),
      sensitivity: boundedNumber(parsed.sensitivity, defaults.sensitivity, 1, 10),
      volume: boundedNumber(parsed.volume, defaults.volume, 0, 100),
      reducedEffects: Boolean(parsed.reducedEffects),
      highContrast: Boolean(parsed.highContrast),
      muted: Boolean(parsed.muted),
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  try {
    safeLocalStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Preferences are optional and contain no game-progress state.
  }
}

function mouseSensitivity(settings) {
  return 0.00075 + settings.sensitivity * 0.00045;
}

export {
  SETTINGS_KEY,
  defaultSettings,
  loadSettings,
  mouseSensitivity,
  saveSettings,
};
