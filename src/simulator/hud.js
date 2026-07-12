function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function segmentText(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => String(segment && segment.text || "").trim())
    .filter(Boolean)
    .join(" ");
}

function renderSegments(segments, className = "") {
  const content = (Array.isArray(segments) ? segments : [])
    .filter((segment) => segment && segment.text)
    .map((segment) => `<span data-claim-kind="${escapeHtml(segment.claimKind || "static")}">${escapeHtml(segment.text)}</span>`)
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

function renderPreflight(host, scenario, settings, assetUrl, {
  fpsAvailable = true,
  requiredSlips = scenario.wings ? scenario.wings.length : 3,
  unavailableReason = "This device or viewport cannot run the FPS safely.",
} = {}) {
  const pair = scenario.identity || {};
  const mode = scenario.mode === "defend-crown" ? "Defend the Crown" : "Restore Honor";
  const bark = segmentText(scenario.briefing && scenario.briefing.bark);
  const provenance = segmentText(scenario.representativeHand && scenario.representativeHand.provenanceNote);
  const unavailable = fpsAvailable ? "" : `
    <div class="simulator-provenance" role="status">
      ${escapeHtml(unavailableReason)} The complete Coach-only briefing remains available.
    </div>`;
  host.innerHTML = `
    <section class="simulator-preflight" aria-labelledby="simulator-preflight-title">
      <div class="simulator-preflight-copy">
        <div class="simulator-title-lockup">
          <span>One level. Thirteen cards. Questionable honor.</span>
          <h1 id="simulator-preflight-title">The Lost<br>Matchpoints</h1>
        </div>
        <span class="simulator-mission-chip">${escapeHtml(pair.pairLabel || "Selected pair")} · ${escapeHtml(mode)}</span>
        <article class="simulator-coach-card">
          <img src="${escapeHtml(assetUrl("coach/coach-idle-talk.svg"))}" alt="Full-body Border Collie Bridge Coach">
          <div>
            <strong>Border Collie Bridge Coach</strong>
            <p>${escapeHtml(bark || "The traveler is in the vault. Fetch.")}</p>
          </div>
        </article>
      </div>
      <div class="simulator-preflight-panel">
        <h2>Mission preflight</h2>
        ${pair.players ? `<p>${escapeHtml(pair.players)}: this greeting stays local and never appears on a hostile.</p>` : ""}
        <div class="simulator-provenance">${escapeHtml(provenance || "Practice Deck")}</div>
        ${unavailable}
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
          <label class="simulator-checkbox"><input type="checkbox" data-simulator-setting="skipTutorial"${settings.skipTutorial ? " checked" : ""}> Skip tutorial</label>
          <label class="simulator-checkbox"><input type="checkbox" data-simulator-setting="muted"${settings.muted ? " checked" : ""}> Mute effects</label>
        </div>
        <div class="simulator-actions">
          <button type="button" class="primary" data-simulator-start="standard"${fpsAvailable ? "" : " disabled"}>Start Standard</button>
          <button type="button" data-simulator-start="practice"${fpsAvailable ? "" : " disabled"}>Practice Mode</button>
          <button type="button" data-simulator-start="coach">Coach-only</button>
        </div>
        <details class="simulator-controls-summary">
          <summary>Controls and objective</summary>
          <p>Recover ${escapeHtml(requiredSlips)} Review ${requiredSlips === 1 ? "Slip" : "Slips"}, open the Traveler Vault, reseat ${escapeHtml(scenario.boss && scenario.boss.title || "The Bottom Board")}, and leave through Move for the Next Round.</p>
          <p>Mouse Lock captures the pointer after Start; Escape releases it and opens Pause. If the browser refuses the lock, the arrow keys still turn.</p>
          <ul>
            <li>WASD: move</li><li>Mouse / ← →: turn</li>
            <li>Click / Space: throw</li><li>E / Enter: interact</li>
            <li>H: help</li><li>Escape: pause</li>
            <li>R: reset encounter</li><li>M: mute</li>
          </ul>
        </details>
      </div>
    </section>
  `;
}

function createGameShell(host, scenario, assetUrl) {
  const cards = scenario.representativeHand && scenario.representativeHand.cards || [];
  host.innerHTML = `
    <section class="simulator-game" aria-label="Bridge Simulator game">
      <div class="simulator-viewport">
        <canvas class="simulator-canvas" width="320" height="200" tabindex="0"
          aria-label="First-person cardroom. Use WASD to move, mouse or arrow keys to turn, Space to throw a card, and E to interact."
          aria-describedby="simulator-objective simulator-live-status"></canvas>
        <span class="simulator-crosshair" aria-hidden="true"></span>
        <div class="simulator-objective-banner" id="simulator-objective">Find the first coaching wing.</div>
        <div class="simulator-boss-meter" data-hud-boss hidden>
          <span data-hud-boss-label>The Bottom Board</span>
          <progress data-hud-boss-health max="100" value="100">100%</progress>
          <span data-hud-boss-phase>Phase 1</span>
        </div>
        <div class="simulator-caption" data-simulator-caption hidden></div>
        <div class="simulator-damage-flash" data-simulator-damage aria-hidden="true"></div>
      </div>
      <div class="simulator-hud" aria-label="Player status">
        <div class="simulator-hud-stat"><span>Composure</span><strong data-hud-composure>100</strong></div>
        <div class="simulator-hud-stat"><span>System Notes</span><strong data-hud-notes>0</strong></div>
        <div class="simulator-hand-wrap">
          <div class="simulator-card-hand" data-hud-hand role="group" aria-label="Throwing hand: ${escapeHtml(handLabel(cards))}">${renderHand(cards)}</div>
          <span class="simulator-shuffle-label" data-hud-shuffle hidden>Shuffle</span>
        </div>
        <img class="simulator-hud-coach" src="${escapeHtml(assetUrl("coach/coach-idle-talk.svg"))}" alt="Coach status: attentive">
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
    caption: host.querySelector("[data-simulator-caption]"),
    damage: host.querySelector("[data-simulator-damage]"),
    modal: host.querySelector("[data-simulator-modal]"),
    live: host.querySelector("[data-simulator-live]"),
    composure: host.querySelector("[data-hud-composure]"),
    notes: host.querySelector("[data-hud-notes]"),
    hand: host.querySelector("[data-hud-hand]"),
    shuffle: host.querySelector("[data-hud-shuffle]"),
    honor: host.querySelector("[data-hud-honor]"),
    slips: host.querySelector("[data-hud-slips]"),
  };
}

function valueFrom(snapshot, paths, fallback = 0) {
  for (const path of paths) {
    const parts = path.split(".");
    let value = snapshot;
    for (const part of parts) value = value == null ? undefined : value[part];
    if (value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function updateHud(elements, snapshot, scenario) {
  const cards = scenario.representativeHand && scenario.representativeHand.cards || [];
  const composure = valueFrom(snapshot, ["player.composure", "player.health", "hud.composure"], 100);
  const notes = valueFrom(snapshot, ["player.systemNotes", "player.armor", "hud.systemNotes"], 0);
  const honor = valueFrom(snapshot, ["player.honor", "score.honor", "stats.honor", "hud.honor"], 0);
  const slips = valueFrom(snapshot, ["objectives.slips", "progress.slips", "stats.slips", "hud.slips"], 0);
  const used = valueFrom(snapshot, ["weapon.cardIndex", "weapon.used", "player.cardIndex", "hud.cardIndex"], 0);
  elements.composure.textContent = String(Math.max(0, Math.round(composure)));
  elements.notes.textContent = String(Math.max(0, Math.round(notes)));
  elements.honor.textContent = String(Math.max(0, Math.round(honor)));
  elements.slips.textContent = String(Math.max(0, Math.round(slips)));
  elements.hand.innerHTML = renderHand(cards, Math.max(0, Math.min(cards.length, used)));
  const shuffling = Boolean(snapshot.weapon && snapshot.weapon.shuffling);
  const wasShuffling = elements.hand.dataset.shuffling === "true";
  elements.hand.dataset.shuffling = String(shuffling);
  elements.hand.setAttribute("aria-label", `Throwing hand: ${handLabel(cards)}${shuffling ? ". Shuffling" : ""}`);
  elements.shuffle.hidden = !shuffling;
  if (shuffling && !wasShuffling) elements.live.textContent = "Shuffling the throwing hand.";

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
  const objective = snapshot.objectiveText || snapshot.hud && snapshot.hud.objective || "Recover the Review Slips.";
  if (elements.objective.textContent !== objective) {
    elements.objective.textContent = objective;
    elements.live.textContent = `Objective: ${objective}`;
  }
}

function evidenceRows(board) {
  if (!board) return "";
  const rows = [
    ["Board", board.boardNo == null ? "Not board-specific" : board.boardNo],
    ["Your table", board.contractText || "Not available"],
    ["Score", board.pairScore == null ? "Not available" : board.pairScore],
    ["Board %", board.percent == null ? "Not available" : `${Number(board.percent).toFixed(1)}%`],
    ["Review category", board.categoryLabel || "Manual review"],
    ["Confidence", board.confidence && board.confidence.label || "Manual review"],
  ];
  if (board.betterPeer) rows.push(["Same-direction comparison", `${board.betterPeer.contract || "Result"} · ${board.betterPeer.score == null ? "score unavailable" : board.betterPeer.score}`]);
  return `<dl>${rows.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

function renderChalkboard(modal, wing, { reopened = false } = {}) {
  const feedback = wing && wing.coachFeedback || {};
  modal.hidden = false;
  modal.innerHTML = `
    <article class="simulator-chalkboard" role="dialog" aria-modal="true" aria-labelledby="simulator-chalkboard-title">
      <h2 id="simulator-chalkboard-title">${escapeHtml(wing && wing.title || "Coach's Chalkboard")}</h2>
      ${renderSegments(feedback.summary, "simulator-chalkboard-summary")}
      <details class="simulator-evidence" open>
        <summary>Session evidence</summary>
        ${evidenceRows(wing && wing.featuredBoard)}
        ${renderSegments(feedback.details)}
      </details>
      <div class="simulator-modal-actions">
        <button type="button" class="primary" data-simulator-chalkboard-close>${reopened ? "Return to mission" : "Take Review Slip and continue"}</button>
      </div>
    </article>
  `;
  const close = modal.querySelector("[data-simulator-chalkboard-close]");
  if (close) close.focus();
}

function renderPause(modal, { muted = false, cards = [], reason = "pause" } = {}) {
  const contextLost = reason === "context-lost";
  const contextNote = contextLost
    ? "WebGL context was lost. Return to preflight to create a fresh renderer, or continue with Coach-only mode."
    : "The director has stopped the clock. Your Review Slips are safe.";
  const gameActions = contextLost ? "" : `
        <button type="button" class="primary" data-simulator-resume>Resume</button>
        <button type="button" data-simulator-reset>Reset encounter</button>
        <button type="button" data-simulator-restart>Restart run</button>`;
  modal.hidden = false;
  modal.innerHTML = `
    <section class="simulator-modal" role="dialog" aria-modal="true" aria-labelledby="simulator-pause-title">
      <h2 id="simulator-pause-title">Paused at the table</h2>
      <p>${escapeHtml(contextNote)}</p>
      <p><strong>Throwing hand:</strong> ${escapeHtml(handLabel(cards))}</p>
      <div class="simulator-modal-actions">
        ${gameActions}
        <button type="button" data-simulator-help>Help</button>
        <button type="button" data-simulator-mute>${muted ? "Unmute" : "Mute"}</button>
        <button type="button"${contextLost ? ' class="primary"' : ""} data-simulator-back-preflight>Return to preflight</button>
        <button type="button" data-simulator-start="coach">Coach-only</button>
        <button type="button" data-simulator-close>Exit to report</button>
      </div>
    </section>
  `;
  const first = modal.querySelector(contextLost ? "[data-simulator-back-preflight]" : "[data-simulator-resume]");
  if (first) first.focus();
}

function renderHelp(modal, { requiredSlips = 3, bossTitle = "The Bottom Board", cards = [] } = {}) {
  modal.hidden = false;
  modal.innerHTML = `
    <section class="simulator-modal" role="dialog" aria-modal="true" aria-labelledby="simulator-help-title">
      <h2 id="simulator-help-title">Coach's clipboard</h2>
      <p>Recover ${escapeHtml(requiredSlips)} Review ${requiredSlips === 1 ? "Slip" : "Slips"}, enter the Traveler Vault, defeat ${escapeHtml(bossTitle)}, and move for the next round.</p>
      <p><strong>Throwing hand:</strong> ${escapeHtml(handLabel(cards))}</p>
      <ul>
        <li>WASD moves; mouse or arrow keys turn.</li>
        <li>Click or Space throws the next card. The hand shuffles forever.</li>
        <li>E or Enter interacts with chalkboards and doors.</li>
        <li>Escape pauses. R resets the current encounter. M mutes.</li>
        <li>Composure is health. System Notes absorb half of incoming damage.</li>
      </ul>
      <div class="simulator-modal-actions"><button type="button" class="primary" data-simulator-help-close>Back</button></div>
    </section>
  `;
  modal.querySelector("[data-simulator-help-close]").focus();
}

function renderCoachOnly(host, scenario, assetUrl) {
  const briefing = segmentText(scenario.briefing && scenario.briefing.fullText);
  host.innerHTML = `
    <section class="simulator-coach-only" aria-labelledby="simulator-coach-only-title">
      <h2 id="simulator-coach-only-title" tabindex="-1">Coach-only mission review</h2>
      <article class="simulator-coach-card">
        <img src="${escapeHtml(assetUrl("coach/coach-point.svg"))}" alt="Border Collie Bridge Coach pointing at the review">
        <div><strong>Briefing</strong><p>${escapeHtml(briefing || segmentText(scenario.briefing && scenario.briefing.bark))}</p></div>
      </article>
      <div class="simulator-coaching-list">
        ${(scenario.wings || []).map((wing) => `
          <article class="simulator-coaching-card">
            <h3>${escapeHtml(wing.title)}</h3>
            ${renderSegments(wing.coachFeedback && wing.coachFeedback.summary)}
            <details class="simulator-evidence"><summary>Expand evidence</summary>${evidenceRows(wing.featuredBoard)}${renderSegments(wing.coachFeedback && wing.coachFeedback.details)}</details>
          </article>
        `).join("")}
      </div>
      <article class="simulator-coaching-card">
        <h3>Practice action</h3>
        ${renderSegments(scenario.debrief && scenario.debrief.practiceAction)}
      </article>
      <div class="simulator-modal-actions">
        <button type="button" data-simulator-back-preflight>Back to preflight</button>
        <button type="button" class="primary" data-simulator-close>Return to report</button>
      </div>
    </section>
  `;
  const first = host.querySelector("#simulator-coach-only-title");
  if (first) first.focus();
}

function renderDebrief(host, scenario, stats = {}, assetUrl) {
  const sessionFacts = scenario.debrief && scenario.debrief.sessionFacts || [];
  host.innerHTML = `
    <section class="simulator-debrief" aria-labelledby="simulator-debrief-title">
      <h2 id="simulator-debrief-title" tabindex="-1">Honor simulated. Evidence preserved.</h2>
      <article class="simulator-coach-card">
        <img src="${escapeHtml(assetUrl("coach/coach-victory.svg"))}" alt="Victorious Border Collie Bridge Coach">
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
            <dt>Secrets</dt><dd>${escapeHtml(stats.secrets || 0)}</dd>
            <dt>Honor Reclaimed</dt><dd>${escapeHtml(stats.honor || 0)} suit tokens</dd>
          </dl>
        </section>
        <section class="simulator-debrief-panel">
          <h3>Your Actual Session</h3>
          ${(sessionFacts || []).map((fact) => renderSegments(fact.segments)).join("")}
          <strong>Practice action</strong>
          ${renderSegments(scenario.debrief && scenario.debrief.practiceAction)}
        </section>
      </div>
      <p class="simulator-provenance">Honor Reclaimed is fictional game score. It does not change or restore real matchpoints.</p>
      <div class="simulator-modal-actions">
        <button type="button" data-simulator-restart>Play again</button>
        <button type="button" class="primary" data-simulator-close>Return to report</button>
      </div>
    </section>
  `;
  host.querySelector("#simulator-debrief-title").focus();
}

export {
  escapeHtml,
  handLabel,
  segmentText,
  renderSegments,
  renderPreflight,
  createGameShell,
  updateHud,
  renderChalkboard,
  renderPause,
  renderHelp,
  renderCoachOnly,
  renderDebrief,
};
