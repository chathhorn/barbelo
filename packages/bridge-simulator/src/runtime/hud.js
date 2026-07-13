import { SIMULATOR_ASSET_PATHS } from "../assets.js";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizedSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => String(segment || "").trim())
    .filter(Boolean);
}

function segmentText(segments) {
  return normalizedSegments(segments).join(" ");
}

function renderSegments(segments, className = "") {
  const content = normalizedSegments(segments)
    .map((text) => `<span>${escapeHtml(text)}</span>`)
    .join(" ");
  return `<p${className ? ` class="${escapeHtml(className)}"` : ""}>${content}</p>`;
}

function cardGlyph(card) {
  const suit = String(card && card.suit || "").toUpperCase();
  const glyph = { S: "♠", H: "♥", D: "♦", C: "♣" }[suit] || "?";
  return { glyph, rank: String(card && card.rank || "?"), red: suit === "H" || suit === "D" };
}

function handLabel(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => {
    const { glyph, rank } = cardGlyph(card);
    return `${rank}${glyph}`;
  }).join(" ");
}

function renderHand(cards, used = 0) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const { glyph, rank, red } = cardGlyph(card);
    const classes = ["simulator-card", red ? "red" : "", index < used ? "used" : "", index === used ? "next" : ""]
      .filter(Boolean).join(" ");
    return `<span class="${classes}" aria-hidden="true">${escapeHtml(rank)}${glyph}</span>`;
  }).join("");
}

function minimapMarkup(level) {
  const spaces = Array.isArray(level && level.spaces) ? level.spaces : [];
  const points = spaces.flatMap((space) => Array.isArray(space.polygon) ? space.polygon : []);
  const xCoordinates = points.map((point) => Number(point.x) || 0);
  const zCoordinates = points.map((point) => Number(point.z) || 0);
  const minX = xCoordinates.length ? Math.min(...xCoordinates) : 0;
  const minZ = zCoordinates.length ? Math.min(...zCoordinates) : 0;
  const maxX = xCoordinates.length ? Math.max(...xCoordinates) : 1;
  const maxZ = zCoordinates.length ? Math.max(...zCoordinates) : 1;
  const padding = 1.5;
  const viewBox = `${minX - padding} ${minZ - padding} ${maxX - minX + padding * 2} ${maxZ - minZ + padding * 2}`;
  const rooms = spaces.map((space) => {
    const polygon = (space.polygon || []).map((point) => `${Number(point.x) || 0},${Number(point.z) || 0}`).join(" ");
    return `<polygon class="simulator-minimap-room" points="${polygon}"></polygon>`;
  }).join("");
  const portals = (Array.isArray(level && level.portals) ? level.portals : []).map((portal) => {
    const a = portal.segment && portal.segment.a || {};
    const b = portal.segment && portal.segment.b || {};
    return `<line class="simulator-minimap-portal" x1="${Number(a.x) || 0}" y1="${Number(a.z) || 0}" x2="${Number(b.x) || 0}" y2="${Number(b.z) || 0}"></line>`;
  }).join("");
  return `
    <svg viewBox="${viewBox}" aria-hidden="true" focusable="false">
      <g>${rooms}</g>
      <g>${portals}</g>
      <g data-minimap-hostiles></g>
      <path class="simulator-minimap-player" data-minimap-player d="M 0 -1.8 L 1.25 1.25 L 0 0.7 L -1.25 1.25 Z"></path>
    </svg>`;
}

function renderSettingsControls(settings) {
  return `
    <div class="simulator-settings">
      <label class="simulator-setting">Input mode
        <select data-simulator-setting="inputMode">
          <option value="mouse"${settings.inputMode === "mouse" ? " selected" : ""}>Mouse Lock</option>
          <option value="keyboard"${settings.inputMode === "keyboard" ? " selected" : ""}>Keyboard Look</option>
        </select>
      </label>
      <label class="simulator-setting">Field of view <span data-fov-value>${escapeHtml(settings.fov)}°</span>
        <input type="range" min="55" max="90" step="1" value="${escapeHtml(settings.fov)}" data-simulator-setting="fov">
      </label>
      <label class="simulator-setting">Mouse sensitivity
        <input type="range" min="1" max="10" step="1" value="${escapeHtml(settings.sensitivity)}" data-simulator-setting="sensitivity">
      </label>
      <label class="simulator-setting">Effects volume
        <input type="range" min="0" max="100" step="5" value="${escapeHtml(settings.volume)}" data-simulator-setting="volume">
      </label>
      <label class="simulator-checkbox"><input type="checkbox" data-simulator-setting="reducedEffects"${settings.reducedEffects ? " checked" : ""}> Reduced effects</label>
      <label class="simulator-checkbox"><input type="checkbox" data-simulator-setting="highContrast"${settings.highContrast ? " checked" : ""}> High contrast</label>
      <label class="simulator-checkbox"><input type="checkbox" data-simulator-setting="muted"${settings.muted ? " checked" : ""}> Mute effects</label>
    </div>
  `;
}

function renderClipboardContents({ requiredSlips = 3, bossTitle = "The Bottom Board", cards = [] } = {}) {
  return `
    <p>Recover ${escapeHtml(requiredSlips)} Review ${requiredSlips === 1 ? "Slip" : "Slips"}, enter the Traveler Vault, defeat ${escapeHtml(bossTitle)}, and move for the next round.</p>
    <p><strong>Throwing hand:</strong> ${escapeHtml(handLabel(cards))}</p>
    <ul>
      <li>WASD moves; mouse or arrow keys turn.</li>
      <li>Click or Space throws the next card. R shuffles early; empty hands shuffle automatically.</li>
      <li>Walk over Review Slips to open them. E or Enter reopens collected slips and activates nearby controls.</li>
      <li>M toggles the minimap. H reopens this clipboard. Escape pauses.</li>
      <li>Composure is your health.</li>
    </ul>
  `;
}

function renderPreflight(host, scenario, assetUrl, {
  fpsAvailable = true,
  requiredSlips = scenario.wings ? scenario.wings.length : 3,
  unavailableReason = "This device or viewport cannot run the FPS safely.",
} = {}) {
  const bark = segmentText(scenario.briefing && scenario.briefing.bark);
  const unavailable = fpsAvailable ? "" : `
    <div class="simulator-capability-note" role="status">
      ${escapeHtml(unavailableReason)} Start is unavailable on this device or viewport.
    </div>`;
  host.innerHTML = `
    <section class="simulator-preflight" aria-labelledby="simulator-preflight-title">
      <div class="simulator-preflight-copy">
        <div class="simulator-title-lockup">
          <span>One level. Thirteen cards. Questionable honor.</span>
          <h1 id="simulator-preflight-title">The Lost<br>Matchpoints</h1>
        </div>
        <span class="simulator-mission-chip">Bridge fundamentals · Training deal</span>
        <article class="simulator-coach-card">
          <img src="${escapeHtml(assetUrl(SIMULATOR_ASSET_PATHS.coachIdle))}" alt="Upright Border Collie Bridge Coach wearing a trenchcoat">
          <div>
            <strong>Border Collie Bridge Coach</strong>
            <p>${escapeHtml(bark || "The traveler is in the vault. Fetch.")}</p>
          </div>
        </article>
      </div>
      <div class="simulator-preflight-panel">
        <h2>Mission preflight</h2>
        ${unavailable}
        <section class="simulator-clipboard" aria-labelledby="simulator-clipboard-title">
          <h3 id="simulator-clipboard-title">Coach's clipboard</h3>
          ${renderClipboardContents({
            requiredSlips,
            bossTitle: scenario.boss && scenario.boss.title,
            cards: scenario.hand && scenario.hand.cards,
          })}
        </section>
        <div class="simulator-actions">
          <button type="button" class="primary" data-simulator-start${fpsAvailable ? "" : " disabled"}>Start!</button>
          <button type="button" data-simulator-settings>Settings</button>
        </div>
      </div>
    </section>
  `;
}

function renderSettings(host, settings, { returnToPause = false } = {}) {
  host.hidden = false;
  host.innerHTML = `
    <section class="simulator-modal simulator-settings-screen" aria-labelledby="simulator-settings-title">
      <h2 id="simulator-settings-title" tabindex="-1">Settings</h2>
      ${renderSettingsControls(settings)}
      <div class="simulator-modal-actions">
        <button type="button" class="primary" data-simulator-settings-close>${returnToPause ? "Back to pause" : "Back to preflight"}</button>
      </div>
    </section>
  `;
  host.querySelector("#simulator-settings-title")?.focus();
}

function createGameShell(host, scenario, level) {
  const cards = scenario.hand && scenario.hand.cards || [];
  host.innerHTML = `
    <section class="simulator-game" aria-label="Bridge Simulator game">
      <div class="simulator-viewport">
        <canvas class="simulator-canvas" width="320" height="200" tabindex="0"
          aria-label="First-person cardroom. Use WASD to move, mouse or arrow keys to turn, Space to throw a card, R to shuffle, M to toggle the minimap, and E to interact."
          aria-describedby="simulator-objective simulator-live-status"></canvas>
        <span class="simulator-crosshair" aria-hidden="true"></span>
        <div class="simulator-objective-banner" id="simulator-objective">Find the first coaching wing.</div>
        <div class="simulator-boss-meter" data-hud-boss hidden>
          <span data-hud-boss-label>The Bottom Board</span>
          <progress data-hud-boss-health max="100" value="100">100%</progress>
          <span data-hud-boss-phase>Phase 1</span>
        </div>
        <aside class="simulator-minimap" aria-label="Minimap" data-simulator-minimap>
          <button type="button" data-simulator-minimap-toggle aria-pressed="true" title="Hide minimap (M)">Map: on <kbd>M</kbd></button>
          <div class="simulator-minimap-panel" data-simulator-minimap-panel role="img" aria-label="Minimap showing the player and active opponents">
            ${minimapMarkup(level)}
          </div>
        </aside>
        <div class="simulator-caption" data-simulator-caption hidden></div>
        <div class="simulator-damage-flash" data-simulator-damage aria-hidden="true"></div>
      </div>
      <div class="simulator-hud" aria-label="Player status">
        <div class="simulator-hud-stat"><span>Composure</span><strong data-hud-composure>100</strong></div>
        <div class="simulator-hand-wrap">
          <div class="simulator-card-hand" data-hud-hand role="group" aria-label="Throwing hand: ${escapeHtml(handLabel(cards))}">${renderHand(cards)}</div>
          <span class="simulator-shuffle-label" data-hud-shuffle aria-hidden="true" hidden>Shuffling…</span>
        </div>
        <div class="simulator-hud-stat"><span>Honor · Slips</span><strong><span data-hud-honor>0</span> · <span data-hud-slips>0</span></strong></div>
      </div>
      <div class="simulator-modal-backdrop" data-simulator-modal hidden></div>
      <div class="simulator-sr-only" id="simulator-live-status" data-simulator-live role="status" aria-live="polite"></div>
    </section>
  `;
  return {
    game: host.querySelector(".simulator-game"),
    viewport: host.querySelector(".simulator-viewport"),
    canvas: host.querySelector(".simulator-canvas"),
    objective: host.querySelector("#simulator-objective"),
    bossMeter: host.querySelector("[data-hud-boss]"),
    bossLabel: host.querySelector("[data-hud-boss-label]"),
    bossHealth: host.querySelector("[data-hud-boss-health]"),
    bossPhase: host.querySelector("[data-hud-boss-phase]"),
    minimap: host.querySelector("[data-simulator-minimap]"),
    minimapPanel: host.querySelector("[data-simulator-minimap-panel]"),
    minimapToggle: host.querySelector("[data-simulator-minimap-toggle]"),
    minimapPlayer: host.querySelector("[data-minimap-player]"),
    minimapHostiles: host.querySelector("[data-minimap-hostiles]"),
    minimapHostileDots: new Map(),
    caption: host.querySelector("[data-simulator-caption]"),
    damage: host.querySelector("[data-simulator-damage]"),
    modal: host.querySelector("[data-simulator-modal]"),
    live: host.querySelector("[data-simulator-live]"),
    composure: host.querySelector("[data-hud-composure]"),
    hand: host.querySelector("[data-hud-hand]"),
    shuffle: host.querySelector("[data-hud-shuffle]"),
    honor: host.querySelector("[data-hud-honor]"),
    slips: host.querySelector("[data-hud-slips]"),
  };
}

function numericValue(value, fallback = 0) {
  return value != null && Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function updateHandCards(hand, used) {
  const cards = [...hand.querySelectorAll(".simulator-card")];
  const nextUsed = String(used);
  if (hand.dataset.used === nextUsed) return cards;
  cards.forEach((card, index) => {
    card.classList.toggle("used", index < used);
    card.classList.toggle("next", index === used);
  });
  hand.dataset.used = nextUsed;
  return cards;
}

function prepareHandShuffle(hand, label, cards, duration) {
  const handBox = hand.getBoundingClientRect();
  const handCenter = handBox.left + handBox.width / 2;
  cards.forEach((card) => {
    const cardBox = card.getBoundingClientRect();
    const cardCenter = cardBox.left + cardBox.width / 2;
    card.style.setProperty("--shuffle-gather-x", `${(handCenter - cardCenter).toFixed(2)}px`);
  });
  const animationDuration = `${Math.max(0.01, duration)}s`;
  hand.style.setProperty("--simulator-shuffle-duration", animationDuration);
  label.style.setProperty("--simulator-shuffle-duration", animationDuration);
}

function updateHud(elements, snapshot, scenario) {
  const cards = scenario.hand && scenario.hand.cards || [];
  const composure = numericValue(snapshot.player && snapshot.player.composure, 100);
  const honor = numericValue(snapshot.player && snapshot.player.honor, 0);
  const slips = numericValue(snapshot.progress && snapshot.progress.slips, 0);
  const used = numericValue(snapshot.weapon && snapshot.weapon.cardIndex, 0);
  elements.composure.textContent = String(Math.max(0, Math.round(composure)));
  elements.honor.textContent = String(Math.max(0, Math.round(honor)));
  elements.slips.textContent = String(Math.max(0, Math.round(slips)));
  const clampedUsed = Math.max(0, Math.min(cards.length, used));
  const handCards = updateHandCards(elements.hand, clampedUsed);
  const shuffling = Boolean(snapshot.weapon && snapshot.weapon.shuffling);
  const wasShuffling = elements.hand.dataset.shuffling === "true";
  elements.hand.setAttribute("aria-label", `Throwing hand: ${handLabel(cards)}${shuffling ? ". Shuffling" : ""}`);
  if (shuffling && !wasShuffling) {
    const shuffleDuration = numericValue(snapshot.weapon && snapshot.weapon.shuffleDuration, 1);
    prepareHandShuffle(elements.hand, elements.shuffle, handCards, shuffleDuration);
    elements.hand.dataset.shuffling = "true";
    elements.shuffle.hidden = false;
    elements.live.textContent = "Shuffling the throwing hand.";
  } else if (!shuffling && (wasShuffling || elements.hand.dataset.shuffling !== "false")) {
    elements.hand.dataset.shuffling = "false";
    elements.shuffle.hidden = true;
  }

  const player = snapshot.player || {};
  const playerPosition = player.position || player;
  const x = Number(playerPosition.x) || 0;
  const z = Number(playerPosition.z) || 0;
  const yaw = Number(player.yaw != null ? player.yaw : player.angle) || 0;
  const playerRotation = yaw * 180 / Math.PI + 90;
  if (elements.minimapPlayer) {
    elements.minimapPlayer.setAttribute("transform", `translate(${x} ${z}) rotate(${playerRotation})`);
  }
  const hostiles = (snapshot.entities || []).filter((entity) =>
    entity && entity.kind === "enemy" && entity.alive !== false && entity.active !== false);
  if (elements.minimapHostiles) {
    const seen = new Set();
    hostiles.forEach((enemy, index) => {
      const id = String(enemy.id || `enemy-${index}`);
      seen.add(id);
      let dot = elements.minimapHostileDots.get(id);
      if (!dot) {
        dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        elements.minimapHostileDots.set(id, dot);
        elements.minimapHostiles.append(dot);
      }
      const position = enemy.position || enemy;
      const enemyX = Number(position.x) || 0;
      const enemyZ = Number(position.z) || 0;
      const boss = enemy.archetype === "bottom-board";
      dot.setAttribute("class", `simulator-minimap-hostile${boss ? " boss" : ""}`);
      dot.setAttribute("cx", String(enemyX));
      dot.setAttribute("cy", String(enemyZ));
      dot.setAttribute("r", String(boss ? 1.1 : 0.7));
    });
    elements.minimapHostileDots.forEach((dot, id) => {
      if (seen.has(id)) return;
      dot.remove();
      elements.minimapHostileDots.delete(id);
    });
  }
  if (elements.minimapPanel) {
    elements.minimapPanel.setAttribute("aria-label", `Minimap showing the player and ${hostiles.length} active ${hostiles.length === 1 ? "opponent" : "opponents"}`);
  }

  const boss = (snapshot.entities || []).find((entity) => entity.archetype === "bottom-board" && entity.alive !== false);
  const bossActive = Boolean(snapshot.progress && snapshot.progress.bossActive && boss);
  elements.bossMeter.hidden = !bossActive;
  if (bossActive) {
    const title = boss.title || scenario.boss && scenario.boss.title || "The Bottom Board";
    const health = Math.max(0, Number(boss.health) || 0);
    const maxHealth = Math.max(1, Number(boss.maxHealth) || 1);
    const phase = Math.max(1, Number(boss.phase) || 1);
    elements.bossLabel.textContent = title;
    elements.bossHealth.max = maxHealth;
    elements.bossHealth.value = health;
    elements.bossHealth.textContent = `${Math.round(health / maxHealth * 100)}%`;
    elements.bossPhase.textContent = `Phase ${phase}`;
    if (elements.bossMeter.dataset.phase && elements.bossMeter.dataset.phase !== String(phase)) {
      elements.live.textContent = `${title}: phase ${phase}.`;
    }
    elements.bossMeter.dataset.phase = String(phase);
    elements.bossMeter.setAttribute("aria-label", `${title}, phase ${phase}, ${Math.round(health / maxHealth * 100)} percent remaining`);
  } else {
    elements.bossMeter.dataset.phase = "";
  }
  const objective = snapshot.objectiveText || "Recover the Review Slips.";
  if (elements.objective.textContent !== objective) {
    elements.objective.textContent = objective;
    elements.live.textContent = `Objective: ${objective}`;
  }
}

function renderChalkboard(modal, wing) {
  const feedback = wing && wing.coachFeedback || {};
  modal.hidden = false;
  modal.innerHTML = `
    <article class="simulator-chalkboard" aria-labelledby="simulator-chalkboard-title">
      <h2 id="simulator-chalkboard-title">${escapeHtml(wing && wing.title || "Coach's Chalkboard")}</h2>
      ${renderSegments(feedback.summary, "simulator-chalkboard-summary")}
      <section class="simulator-evidence" aria-labelledby="simulator-coach-notes-title">
        <h3 id="simulator-coach-notes-title">Coach's notes</h3>
        ${renderSegments(feedback.details)}
      </section>
      <div class="simulator-modal-actions">
        <button type="button" class="primary" data-simulator-chalkboard-close>Return to mission</button>
      </div>
    </article>
  `;
  const close = modal.querySelector("[data-simulator-chalkboard-close]");
  if (close) close.focus();
}

function renderReducedEffectsOffer(modal) {
  modal.hidden = false;
  modal.innerHTML = `
    <section class="simulator-modal" aria-labelledby="simulator-reduced-effects-title" aria-describedby="simulator-reduced-effects-copy">
      <h2 id="simulator-reduced-effects-title">Smooth out the cardroom?</h2>
      <p id="simulator-reduced-effects-copy">Rendering has stayed below the smooth-play target for about four seconds.</p>
      <p><strong>Reduced Effects changes presentation only.</strong> It shortens visual effects and lightens fog. Card timing, movement, opponents, damage, scoring, and all game rules stay exactly the same.</p>
      <div class="simulator-modal-actions">
        <button type="button" class="primary" data-simulator-enable-reduced-effects>Enable Reduced Effects</button>
        <button type="button" data-simulator-keep-effects>Keep Current Effects</button>
      </div>
    </section>
  `;
  modal.querySelector("[data-simulator-enable-reduced-effects]").focus();
}

function renderPause(modal, { cards = [], reason = "pause" } = {}) {
  const contextLost = reason === "context-lost";
  const contextNote = contextLost
    ? "WebGL context was lost. Return to preflight to create a fresh renderer, or exit the simulator."
    : "The director has stopped the clock. Your Review Slips are safe.";
  const gameActions = contextLost ? "" : `
        <button type="button" class="primary" data-simulator-resume>Resume</button>`;
  modal.hidden = false;
  modal.innerHTML = `
    <section class="simulator-modal" aria-labelledby="simulator-pause-title">
      <h2 id="simulator-pause-title">Paused at the table</h2>
      <p>${escapeHtml(contextNote)}</p>
      <p><strong>Throwing hand:</strong> ${escapeHtml(handLabel(cards))}</p>
      <div class="simulator-modal-actions">
        ${gameActions}
        <button type="button" data-simulator-help>Help</button>
        <button type="button" data-simulator-settings>Settings</button>
        <button type="button"${contextLost ? ' class="primary"' : ""} data-simulator-back-preflight>Return to preflight</button>
      </div>
    </section>
  `;
  const first = modal.querySelector(contextLost ? "[data-simulator-back-preflight]" : "[data-simulator-resume]");
  if (first) first.focus();
}

function renderHelp(modal, { requiredSlips = 3, bossTitle = "The Bottom Board", cards = [] } = {}) {
  modal.hidden = false;
  modal.innerHTML = `
    <section class="simulator-modal" aria-labelledby="simulator-help-title">
      <h2 id="simulator-help-title">Coach's clipboard</h2>
      ${renderClipboardContents({ requiredSlips, bossTitle, cards })}
      <div class="simulator-modal-actions"><button type="button" class="primary" data-simulator-help-close>Back</button></div>
    </section>
  `;
  modal.querySelector("[data-simulator-help-close]").focus();
}

function renderMatchOver(modal) {
  modal.hidden = false;
  modal.innerHTML = `
    <section class="simulator-modal simulator-match-over" aria-labelledby="simulator-match-over-title">
      <h2 id="simulator-match-over-title">Match over!</h2>
      <p>Your Composure reached zero.</p>
      <div class="simulator-modal-actions">
        <button type="button" class="primary" data-simulator-try-again>Try again?</button>
      </div>
    </section>
  `;
  modal.querySelector("[data-simulator-try-again]")?.focus();
}

function renderDebrief(host, scenario, stats = {}, assetUrl) {
  const notes = scenario.debrief && scenario.debrief.notes || [];
  host.innerHTML = `
    <section class="simulator-debrief" aria-labelledby="simulator-debrief-title">
      <h2 id="simulator-debrief-title" tabindex="-1">Matchpoints recovered.</h2>
      <article class="simulator-coach-card">
        <img src="${escapeHtml(assetUrl(SIMULATOR_ASSET_PATHS.coachVictory))}" alt="Victorious upright Border Collie Bridge Coach in a trenchcoat">
        <div><strong>Coach's verdict</strong><p>You cannot outgun a bad auction. Fortunately, this was a simulator.</p></div>
      </article>
      <div class="simulator-debrief-grid">
        <section class="simulator-debrief-panel">
          <h3>The Simulation</h3>
          <dl>
            <dt>Time</dt><dd>${escapeHtml(stats.timeLabel || "—")}</dd>
            <dt>Card accuracy</dt><dd>${escapeHtml(stats.accuracyLabel || "—")}</dd>
            <dt>Enemies reseated</dt><dd>${escapeHtml(stats.enemiesDefeated || 0)}</dd>
            <dt>Biscuits found</dt><dd>${escapeHtml(stats.biscuits || 0)}</dd>
            <dt>Honor Reclaimed</dt><dd>${escapeHtml(stats.honor || 0)} suit tokens</dd>
          </dl>
        </section>
        <section class="simulator-debrief-panel">
          <h3>Coach's Notes</h3>
          ${renderSegments(notes)}
          <strong>Next table habit</strong>
          ${renderSegments(scenario.debrief && scenario.debrief.nextTableHabit)}
        </section>
      </div>
      <div class="simulator-modal-actions">
        <button type="button" data-simulator-restart>Play again</button>
        <button type="button" class="primary" data-simulator-close>Exit simulator</button>
      </div>
    </section>
  `;
  host.querySelector("#simulator-debrief-title").focus();
}

export {
  renderPreflight,
  renderSettings,
  createGameShell,
  updateHud,
  renderChalkboard,
  renderReducedEffectsOffer,
  renderPause,
  renderHelp,
  renderMatchOver,
  renderDebrief,
};
