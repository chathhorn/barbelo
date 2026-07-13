import { GENERIC_SCENARIO } from "./content.js";
import { coachEntityFor } from "./core/coach.js";
import { getAuthoredLevel } from "./core/level.js";
import { assertValidLevel } from "./core/validateLevel.js";
import {
  FIXED_DT,
  createSimulation,
  drainSimulationEvents,
  getSimulationSnapshot,
  restartRun,
  simulationStats,
  stepSimulation,
} from "./core/simulation.js";
import { createAudioController } from "./runtime/audio.js";
import { fpsCapability } from "./runtime/capability.js";
import {
  createGameShell,
  renderChalkboard,
  renderDebrief,
  renderHelp,
  renderMatchOver,
  renderPause,
  renderPreflight,
  renderReducedEffectsOffer,
  renderSettings,
  updateHud,
} from "./runtime/hud.js";
import { createInputController } from "./runtime/input.js";
import { createSlowFrameMonitor } from "./runtime/performance.js";
import { createSimulatorRenderer } from "./runtime/renderer.js";
import { loadSettings, mouseSensitivity, saveSettings } from "./runtime/settings.js";
import { disposeSpriteTextures, preloadSpriteTextures } from "./runtime/sprites.js";

const MAX_FRAME_DELTA = 0.25;

function assetResolver(base, version) {
  const root = new URL(base, document.baseURI);
  return (path) => {
    const url = new URL(path, root);
    if (version) url.searchParams.set("v", version);
    return url.href;
  };
}

function focusableWithin(container) {
  return [...container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.getClientRects().length && !element.closest("[hidden]"));
}

class SimulatorApp {
  constructor(host, scenario, level, textures, assetUrl, options) {
    this.host = host;
    this.scenario = scenario;
    this.level = level;
    this.textures = textures;
    this.assetUrl = assetUrl;
    this.options = options;
    this.settings = loadSettings();
    // showPreflight() measures capability after the app is fully wired. Keep
    // construction side-effect free so Firefox does not create and discard two
    // WebGL probe contexts back-to-back during startup.
    this.capability = null;
    this.state = null;
    this.elements = null;
    this.renderer = null;
    this.input = null;
    this.audio = null;
    this.raf = 0;
    this.lastFrame = 0;
    this.accumulator = 0;
    this.paused = false;
    this.pauseReason = "";
    this.destroyed = false;
    this.modalKind = "";
    this.modalReturnFocus = null;
    this.helpReturnKind = "";
    this.settingsReturnKind = "";
    this.launchError = "";
    this.timers = new Set();
    this.captionTimer = 0;
    this.damageTimer = 0;
    this.capabilityTimer = 0;
    this.slowFrameMonitor = createSlowFrameMonitor();
    this.boundClick = (event) => this.handleClick(event);
    this.boundChange = (event) => this.handleSettingChange(event);
    this.boundKeydown = (event) => this.handleKeydown(event);
    this.boundViewportChange = () => this.scheduleCapabilityRefresh();
    this.boundVisibility = () => {
      if (document.hidden) this.pause("tab-hidden");
    };
    this.boundBlur = () => this.pause("window-blur");
    this.boundContextLost = (event) => {
      event.preventDefault();
      this.pause("context-lost", { force: true });
      this.showCaption("WebGL context lost. Return to preflight to create a fresh renderer.", 6000);
    };
    this.host.addEventListener("click", this.boundClick);
    this.host.addEventListener("change", this.boundChange);
    this.host.addEventListener("keydown", this.boundKeydown, true);
    document.addEventListener("visibilitychange", this.boundVisibility);
    window.addEventListener("blur", this.boundBlur);
    window.addEventListener("resize", this.boundViewportChange);
    window.visualViewport?.addEventListener("resize", this.boundViewportChange);
    this.applyDisplaySettings();
    this.showPreflight();
  }

  requiredSlips() {
    return this.level.objectives.requiredSlipCount;
  }

  scheduleCapabilityRefresh() {
    if (this.destroyed) return;
    if (this.capabilityTimer) window.clearTimeout(this.capabilityTimer);
    // Debounce window drags and browser zoom so the WebGL capability probe is
    // not recreated for every intermediate resize event.
    this.capabilityTimer = window.setTimeout(() => {
      this.capabilityTimer = 0;
      this.refreshCapability({ refreshPreflight: true });
    }, 100);
  }

  refreshCapability({ refreshPreflight = false } = {}) {
    const previous = this.capability;
    const next = fpsCapability();
    const changed = !previous || previous.available !== next.available || previous.reason !== next.reason;
    this.capability = next;

    // Resizing never destroys or replaces an active run. The newly measured
    // capability governs the next launch, and only a currently visible
    // preflight is rerendered immediately.
    if (!refreshPreflight || !changed || !this.host.querySelector(".simulator-preflight")) return;
    const active = document.activeElement instanceof HTMLElement && this.host.contains(document.activeElement)
      ? document.activeElement
      : null;
    let focusSelector = "";
    if (active?.hasAttribute("data-simulator-start")) {
      focusSelector = "[data-simulator-start]";
    } else if (active?.hasAttribute("data-simulator-settings")) {
      focusSelector = "[data-simulator-settings]";
    }
    this.renderPreflightView({ focusSelector });
  }

  renderPreflightView({ focusFirst = false, focusSelector = "" } = {}) {
    const fpsAvailable = this.capability.available && !this.launchError;
    renderPreflight(this.host, this.scenario, this.assetUrl, {
      fpsAvailable,
      requiredSlips: this.requiredSlips(),
      unavailableReason: this.launchError || this.capability.reason,
    });
    this.options.onStatus?.(fpsAvailable ? "Ready for preflight" : "3D mission unavailable");

    let target = focusSelector ? this.host.querySelector(focusSelector) : null;
    if (!target || target.disabled) {
      target = focusFirst || focusSelector
        ? this.host.querySelector("[data-simulator-start]:not([disabled]), [data-simulator-settings]")
        : null;
    }
    target?.focus();
  }

  showPreflight({ preserveLaunchError = false, focusSettings = false } = {}) {
    this.stopGame();
    this.modalKind = "";
    this.settingsReturnKind = "";
    if (!preserveLaunchError) this.launchError = "";
    this.refreshCapability();
    this.renderPreflightView({ focusFirst: true, focusSelector: focusSettings ? "[data-simulator-settings]" : "" });
  }

  showSettings({ returnToPause = false } = {}) {
    this.settingsReturnKind = returnToPause ? "pause" : "preflight";
    this.modalKind = "settings";
    if (returnToPause && this.elements) {
      renderSettings(this.elements.modal, this.settings, { returnToPause: true });
    } else {
      renderSettings(this.host, this.settings);
    }
    this.options.onStatus?.("Settings");
  }

  applyDisplaySettings() {
    this.host.classList.toggle("reduced-effects", this.settings.reducedEffects);
    this.host.classList.toggle("high-contrast", this.settings.highContrast);
  }

  toggleMinimap() {
    if (!this.elements?.minimapPanel || !this.elements.minimapToggle) return;
    const visible = this.elements.minimapPanel.hidden;
    this.elements.minimapPanel.hidden = !visible;
    this.elements.minimapToggle.setAttribute("aria-pressed", String(visible));
    this.elements.minimapToggle.innerHTML = `Map: ${visible ? "on" : "off"} <kbd>M</kbd>`;
    this.elements.minimapToggle.title = `${visible ? "Hide" : "Show"} minimap (M)`;
    this.elements.live.textContent = `Minimap ${visible ? "shown" : "hidden"}.`;
  }

  handleSettingChange(event) {
    const control = event.target.closest("[data-simulator-setting]");
    if (!control) return;
    const key = control.dataset.simulatorSetting;
    if (["reducedEffects", "highContrast", "muted"].includes(key)) {
      this.settings[key] = control.checked;
    } else if (key === "inputMode") {
      this.settings.inputMode = control.value === "keyboard" ? "keyboard" : "mouse";
    } else {
      this.settings[key] = Number(control.value);
    }
    if (key === "fov") {
      const value = this.host.querySelector("[data-fov-value]");
      if (value) value.textContent = `${this.settings.fov}°`;
      if (this.renderer) this.renderer.setFov(this.settings.fov);
    }
    if (key === "muted" && this.audio) this.audio.setMuted(this.settings.muted);
    if (key === "volume" && this.audio) this.audio.setVolume(this.settings.volume / 100);
    if (key === "inputMode" && this.input) this.input.setMode(this.settings.inputMode);
    if (key === "sensitivity" && this.input) this.input.setSensitivity(this.mouseSensitivity());
    this.applyDisplaySettings();
    saveSettings(this.settings);
  }

  mouseSensitivity() {
    return mouseSensitivity(this.settings);
  }

  handleClick(event) {
    const start = event.target.closest("[data-simulator-start]");
    if (start) {
      this.startGame();
      return;
    }
    if (event.target.closest("[data-simulator-minimap-toggle]")) {
      this.toggleMinimap();
      return;
    }
    if (event.target.closest("[data-simulator-settings-close]")) {
      const returnToPause = this.settingsReturnKind === "pause";
      this.settingsReturnKind = "";
      if (returnToPause) this.showPause();
      else this.showPreflight({ preserveLaunchError: Boolean(this.launchError), focusSettings: true });
      return;
    }
    if (event.target.closest("[data-simulator-settings]")) {
      this.showSettings({ returnToPause: Boolean(this.elements && this.modalKind === "pause") });
      return;
    }
    if (event.target.closest("[data-simulator-close]")) {
      this.options.onRequestClose?.();
      return;
    }
    if (event.target.closest("[data-simulator-back-preflight]")) {
      this.showPreflight();
      return;
    }
    if (event.target.closest("[data-simulator-resume]")) {
      this.resume();
      return;
    }
    if (event.target.closest("[data-simulator-try-again]")) {
      this.resume();
      return;
    }
    if (event.target.closest("[data-simulator-enable-reduced-effects]")) {
      this.resolveReducedEffectsOffer(true);
      return;
    }
    if (event.target.closest("[data-simulator-keep-effects]")) {
      this.resolveReducedEffectsOffer(false);
      return;
    }
    if (event.target.closest("[data-simulator-help]")) {
      this.showHelp({ returnToPause: this.modalKind === "pause" });
      return;
    }
    if (event.target.closest("[data-simulator-help-close]")) {
      if (this.helpReturnKind === "pause") {
        this.helpReturnKind = "";
        this.showPause();
      } else {
        this.resume();
      }
      return;
    }
    if (event.target.closest("[data-simulator-restart]")) {
      if (this.state) {
        this.slowFrameMonitor.resetRun();
        restartRun(this.state);
        drainSimulationEvents(this.state);
        if (this.elements) this.resume();
        else this.startGame();
      } else {
        this.startGame();
      }
      return;
    }
    if (event.target.closest("[data-simulator-chalkboard-close]")) {
      this.closeModal({ resume: true });
    }
  }

  handleKeydown(event) {
    const activeModal = this.elements && this.elements.modal && !this.elements.modal.hidden
      ? this.elements.modal.querySelector('[role="dialog"]')
      : null;
    if (event.key === "Tab" && activeModal) {
      const focusable = focusableWithin(activeModal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== "Escape" || !this.state || this.state.status !== "running") return;
    if (this.pauseReason === "context-lost") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.modalKind === "reduced-effects" || this.modalKind === "match-over") return;
    if (this.modalKind === "settings" && this.settingsReturnKind === "pause") {
      this.settingsReturnKind = "";
      this.showPause();
    } else if (this.modalKind === "help" && this.helpReturnKind === "pause") {
      this.helpReturnKind = "";
      this.showPause();
    } else if (this.modalKind === "chalkboard") this.closeModal({ resume: true });
    else if (this.paused) this.resume();
    else this.pause("escape");
  }

  startGame() {
    this.refreshCapability();
    if (!this.capability.available || this.launchError) {
      this.showPreflight({ preserveLaunchError: Boolean(this.launchError) });
      return;
    }
    this.stopGame();
    this.slowFrameMonitor.resetRun();
    try {
      this.launchError = "";
      this.state = createSimulation({ scenario: this.scenario, level: this.level });
      this.elements = createGameShell(this.host, this.scenario, this.level);
      this.audio = createAudioController({ volume: this.settings.volume / 100, muted: this.settings.muted });
      this.renderer = createSimulatorRenderer({
        canvas: this.elements.canvas,
        level: this.level,
        textures: this.textures,
        palette: this.scenario.palette,
        fov: this.settings.fov,
        reducedEffects: this.settings.reducedEffects,
        highContrast: this.settings.highContrast,
      });
      this.input = createInputController({
        canvas: this.elements.canvas,
        mode: this.settings.inputMode,
        sensitivity: this.mouseSensitivity(),
        onPause: () => this.pause("pointer-lock"),
        onHelp: () => this.showHelp(),
        onMinimapToggle: () => this.toggleMinimap(),
        onPointerLockUnavailable: () => {
          this.showCaption("Mouse Lock unavailable. Arrow keys turn, and click or Space still throws.", 4500);
        },
      });
      this.elements.canvas.addEventListener("webglcontextlost", this.boundContextLost);
      this.audio.resume().catch(() => {});
      this.paused = true;
      this.pauseReason = "";
      this.lastFrame = performance.now();
      this.accumulator = 0;
      this.options.onStatus?.("Mission starting");
      const snapshot = this.renderSnapshot();
      this.renderer.render(snapshot);
      updateHud(this.elements, snapshot, this.scenario);
      this.resume();
    } catch (error) {
      this.stopGame();
      const detail = error && error.message ? ` ${error.message}` : "";
      this.launchError = `The 3D mission could not start.${detail}`;
      this.showPreflight({ preserveLaunchError: true });
    }
  }

  renderSnapshot() {
    const snapshot = getSimulationSnapshot(this.state);
    const coach = coachEntityFor(this.state);
    return coach ? { ...snapshot, entities: [...snapshot.entities, coach] } : snapshot;
  }

  frame(now) {
    if (this.destroyed || !this.state || !this.renderer) return;
    this.raf = 0;
    const frameDelta = Math.max(0, (now - this.lastFrame) / 1000);
    const delta = Math.min(MAX_FRAME_DELTA, frameDelta);
    this.lastFrame = now;
    if (this.recordFramePerformance(frameDelta)) return;
    if (!this.paused && this.state.status === "running") {
      this.accumulator = Math.min(MAX_FRAME_DELTA, this.accumulator + delta);
      while (this.accumulator >= FIXED_DT && !this.paused && this.state.status === "running") {
        const input = this.input.sample(FIXED_DT);
        stepSimulation(this.state, input, FIXED_DT);
        this.processEvents(drainSimulationEvents(this.state));
        this.accumulator -= FIXED_DT;
      }
    }
    if (this.state && this.renderer && this.elements) {
      const snapshot = this.renderSnapshot();
      this.renderer.render(snapshot);
      updateHud(this.elements, snapshot, this.scenario);
    }
    if (!this.destroyed && !this.paused && this.state && this.renderer) {
      this.raf = requestAnimationFrame((time) => this.frame(time));
    }
  }

  recordFramePerformance(deltaSeconds) {
    if (this.settings.reducedEffects) {
      this.slowFrameMonitor.resetStreak();
      return false;
    }
    const shouldOffer = this.slowFrameMonitor.sample(deltaSeconds, {
      active: Boolean(!this.paused && this.state && this.state.status === "running"),
      visible: !document.hidden,
    });
    if (shouldOffer) this.showReducedEffectsOffer();
    return shouldOffer;
  }

  processEvents(events) {
    for (const event of events) {
      if (event.type === "card-thrown") this.audio?.play("throw");
      else if (event.type === "shuffle-started") this.audio?.play("shuffle");
      else if (event.type === "enemy-hit") this.audio?.play("hit");
      else if (event.type === "enemy-defeated") this.audio?.play("enemy-down");
      else if (event.type === "coach-hit") this.showCaption("Partner! I’m on your side.");
      else if (event.type === "player-hit") {
        if ((event.composureLost || 0) > 0) {
          this.audio?.play("hurt");
          this.flashDamage();
          this.showCaption(`Score slip hit: Composure -${event.composureLost}.`);
        }
      } else if (event.type === "pickup-collected") {
        this.audio?.play("pickup");
        this.showCaption(`${event.kind} +${event.amount}`);
      } else if (event.type === "review-slip") {
        this.audio?.play("slip");
        this.openChalkboard(event.wingId);
      } else if (event.type === "review-slip-reopened") {
        this.openChalkboard(event.wingId, { reopened: true });
      } else if (event.type === "portal-opened") {
        this.audio?.play("door");
      } else if (event.type === "lift-called") {
        this.showCaption("The lift is shuffling into position.");
      } else if (event.type === "lift-ready") {
        if (!event.alreadyReady) this.audio?.play("door");
        this.showCaption("Lift ready. Mind the duplicate-board gap.");
      } else if (event.type === "interaction-blocked") {
        this.showCaption(event.reason === "lift-locked"
          ? "The lift call stays locked until this coaching wing is complete."
          : "The Coach points at the remaining opponents. Reseat them first.");
      } else if (event.type === "interaction-empty") {
        this.showCaption("Nothing to review here. Try the chalkboard or the exit.");
      } else if (event.type === "boss-activated") {
        this.audio?.play("door");
        this.showCaption(`${this.scenario.boss.title} enters the traveler.`, 3500);
      } else if (event.type === "boss-defeated") {
        this.audio?.play("victory");
        this.showCaption(`${this.scenario.boss.title} has been sent to the coffee table.`, 4500);
      } else if (event.type === "player-defeated") {
        this.showMatchOver();
      } else if (event.type === "run-complete") {
        this.finishRun();
        break;
      }
    }
  }

  setGameInert(inert) {
    if (!this.elements) return;
    this.elements.viewport.inert = inert;
    const hud = this.elements.game.querySelector(".simulator-hud");
    if (hud) hud.inert = inert;
  }

  openChalkboard(wingId, { reopened = false } = {}) {
    const index = this.level.objectives.wingIds.indexOf(wingId);
    const wing = this.scenario.wings[Math.max(0, index)] || this.scenario.wings[0];
    this.paused = true;
    this.input?.clear();
    this.input?.releasePointerLock();
    this.modalKind = "chalkboard";
    this.modalReturnFocus = this.elements.canvas;
    this.setGameInert(true);
    renderChalkboard(this.elements.modal, wing);
    this.elements.live.textContent = reopened ? `Review reopened. ${wing.title}.` : `Review Slip recovered. ${wing.title}.`;
  }

  showPause() {
    if (!this.elements) return;
    this.modalKind = "pause";
    this.setGameInert(true);
    renderPause(this.elements.modal, {
      cards: this.scenario.hand.cards,
      reason: this.pauseReason,
    });
  }

  showMatchOver() {
    if (!this.state || !this.elements) return;
    this.slowFrameMonitor.resetStreak();
    this.paused = true;
    this.pauseReason = "defeat";
    this.input?.clear();
    this.input?.releasePointerLock();
    this.audio?.suspend();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.modalKind = "match-over";
    this.modalReturnFocus = this.elements.canvas;
    this.setGameInert(true);
    renderMatchOver(this.elements.modal);
    this.options.onStatus?.("Match over");
    this.elements.live.textContent = "Match over. Composure reached zero. Try the encounter again.";
  }

  showReducedEffectsOffer() {
    if (!this.state || !this.elements || this.paused || this.settings.reducedEffects) return;
    this.paused = true;
    this.pauseReason = "sustained-slow-frames";
    this.input?.clear();
    this.input?.releasePointerLock();
    this.audio?.suspend();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.modalKind = "reduced-effects";
    this.modalReturnFocus = this.elements.canvas;
    this.setGameInert(true);
    renderReducedEffectsOffer(this.elements.modal);
    this.options.onStatus?.("Reduced Effects available");
    this.elements.live.textContent = "Sustained slow rendering detected. Reduced Effects is available. Simulation paused; game rules are unchanged.";
  }

  resolveReducedEffectsOffer(enable) {
    if (this.modalKind !== "reduced-effects" || !this.elements) return;
    if (enable) {
      this.settings.reducedEffects = true;
      this.renderer?.setReducedEffects(true);
      this.applyDisplaySettings();
      saveSettings(this.settings);
    }
    this.resume();
    if (this.elements) {
      this.elements.live.textContent = enable
        ? "Reduced Effects enabled. Simulation resumed; combat and game rules are unchanged."
        : "Current effects kept. Simulation resumed; combat and game rules are unchanged.";
    }
  }

  showHelp({ returnToPause = false } = {}) {
    if (!this.state || !this.elements) return;
    this.paused = true;
    if (!this.pauseReason) this.pauseReason = "help";
    this.helpReturnKind = returnToPause ? "pause" : "";
    this.input?.clear();
    this.input?.releasePointerLock();
    this.modalKind = "help";
    this.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : this.elements.canvas;
    this.setGameInert(true);
    renderHelp(this.elements.modal, {
      requiredSlips: this.requiredSlips(),
      bossTitle: this.scenario.boss && this.scenario.boss.title,
      cards: this.scenario.hand.cards,
    });
  }

  pause(reason = "pause", { force = false } = {}) {
    if (!this.state || (!force && this.paused) || this.state.status !== "running") return;
    this.slowFrameMonitor.resetStreak();
    this.paused = true;
    this.pauseReason = reason;
    this.input?.clear();
    this.input?.releasePointerLock();
    this.audio?.suspend();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.options.onStatus?.("Paused");
    this.showPause();
    if (this.elements) this.elements.live.textContent = `Simulation paused: ${reason}.`;
  }

  resume() {
    if (!this.state || !this.elements || this.state.status !== "running") return;
    this.slowFrameMonitor.resetStreak();
    this.closeModal({ resume: false });
    this.paused = false;
    this.pauseReason = "";
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.audio?.resume().catch(() => {});
    this.options.onStatus?.("Mission running");
    this.elements.live.textContent = "Simulation resumed.";
    this.elements.canvas.focus();
    if (this.settings.inputMode === "mouse") this.input?.requestPointerLock();
    if (!this.raf) this.raf = requestAnimationFrame((time) => this.frame(time));
  }

  closeModal({ resume = false } = {}) {
    if (!this.elements) return;
    this.elements.modal.hidden = true;
    this.elements.modal.innerHTML = "";
    this.setGameInert(false);
    this.modalKind = "";
    const focus = this.modalReturnFocus;
    this.modalReturnFocus = null;
    if (resume) this.resume();
    else if (focus && document.contains(focus)) focus.focus();
  }

  showCaption(text, duration = 2400) {
    if (!this.elements || !this.elements.caption) return;
    this.elements.caption.textContent = text;
    this.elements.caption.hidden = false;
    this.elements.live.textContent = text;
    this.replaceTimer("captionTimer", () => {
      if (this.elements && this.elements.caption) this.elements.caption.hidden = true;
    }, duration);
  }

  flashDamage() {
    if (!this.elements || this.settings.reducedEffects) return;
    this.elements.damage.classList.remove("active");
    void this.elements.damage.offsetWidth;
    this.elements.damage.classList.add("active");
    this.replaceTimer("damageTimer", () => {
      this.elements?.damage.classList.remove("active");
    }, 250);
  }

  replaceTimer(property, callback, duration) {
    const previous = this[property];
    if (previous) {
      window.clearTimeout(previous);
      this.timers.delete(previous);
    }
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (this[property] === timer) this[property] = 0;
      callback();
    }, duration);
    this[property] = timer;
    this.timers.add(timer);
  }

  finishRun() {
    if (!this.state) return;
    const stats = simulationStats(this.state);
    this.stopGame({ keepState: true });
    renderDebrief(this.host, this.scenario, stats, this.assetUrl);
    this.options.onStatus?.("Mission complete");
  }

  stopGame({ keepState = false } = {}) {
    this.slowFrameMonitor.resetStreak();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
    this.captionTimer = 0;
    this.damageTimer = 0;
    if (this.elements && this.elements.canvas) this.elements.canvas.removeEventListener("webglcontextlost", this.boundContextLost);
    this.input?.destroy();
    this.input = null;
    this.audio?.destroy();
    this.audio = null;
    this.renderer?.destroy({ loseContext: true });
    this.renderer = null;
    this.elements = null;
    this.paused = false;
    this.pauseReason = "";
    this.modalKind = "";
    this.helpReturnKind = "";
    this.settingsReturnKind = "";
    if (!keepState) this.state = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.capabilityTimer) window.clearTimeout(this.capabilityTimer);
    this.capabilityTimer = 0;
    this.stopGame();
    disposeSpriteTextures(this.textures);
    this.textures = {};
    this.host.removeEventListener("click", this.boundClick);
    this.host.removeEventListener("change", this.boundChange);
    this.host.removeEventListener("keydown", this.boundKeydown, true);
    document.removeEventListener("visibilitychange", this.boundVisibility);
    window.removeEventListener("blur", this.boundBlur);
    window.removeEventListener("resize", this.boundViewportChange);
    window.visualViewport?.removeEventListener("resize", this.boundViewportChange);
    this.host.innerHTML = "";
    this.host.classList.remove("bridge-simulator-root", "reduced-effects", "high-contrast");
  }
}

async function launch(host, options = {}) {
  if (!host || typeof host.replaceChildren !== "function" || !host.classList) {
    throw new Error("Simulator host element is required.");
  }
  if (!options.assetBaseUrl) throw new Error("Simulator assetBaseUrl is required.");
  const scenario = GENERIC_SCENARIO;
  const level = getAuthoredLevel(options.levelId || "full");
  assertValidLevel(level);
  const assetUrl = assetResolver(options.assetBaseUrl, options.version || "");
  host.classList.add("bridge-simulator-root");
  options.onStatus?.("Loading original simulator art...");
  let textures;
  try {
    textures = await preloadSpriteTextures(assetUrl, (progress) => {
      options.onStatus?.(`Loading simulator art ${Math.round(progress * 100)}%`);
    });
    return new SimulatorApp(host, scenario, level, textures, assetUrl, options);
  } catch (error) {
    if (textures) disposeSpriteTextures(textures);
    host.classList.remove("bridge-simulator-root", "reduced-effects", "high-contrast");
    throw error;
  }
}

export { launch };
