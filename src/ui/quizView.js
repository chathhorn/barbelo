// "Table Time" rendering: a one-question-at-a-time quiz overlay opened
// from the This Week card. The deck lives in module state (rebuilt per
// pair render); answers persist across navigation so flipping back
// shows the revealed card. Reveal content is pre-rendered and hidden,
// so answering is a pure class toggle.

import { contractGlyphHtml, escapeHtml, plural } from "../core/format.js";
import { SUITS } from "../core/constants.js";
import { buildPairExercises } from "../core/exercises.js";
import { renderBoardJump } from "./dom.js";
import { renderHandBlock } from "./boardsView.js";
import { renderLossAdvice } from "./reportView.js";

const BISCUIT_SVG = `<svg viewBox="0 0 24 14" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M 5 3 A 2.6 2.6 0 0 1 8.4 5.2 L 15.6 5.2 A 2.6 2.6 0 1 1 19 8.8 A 2.6 2.6 0 1 1 15.6 8.8 L 8.4 8.8 A 2.6 2.6 0 1 1 5 5.2 A 2.6 2.6 0 0 1 5 3 Z" transform="translate(0 1)"/></svg>`;

let quizState = null;

/**
 * Builds the quiz deck for the current pair and resets progress.
 * Returns the number of cards (0 hides the launch button).
 */
function prepareQuiz(results, report) {
  closeQuizOverlay({ restoreFocus: false });
  quizState = null;
  if (!results || !report) return 0;
  const quiz = buildPairExercises(results, report);
  if (!quiz.cards.length) return 0;
  quizState = {
    cards: quiz.cards,
    report,
    index: 0,
    answers: quiz.cards.map(() => null)
  };
  return quiz.cards.length;
}

function renderQuizLaunch() {
  if (!quizState) return "";
  const count = quizState.cards.length;
  return `
    <button type="button" class="quiz-launch" data-quiz-open>
      <span class="quiz-launch-title">Table Time - take the quiz <span aria-hidden="true">&rsaquo;</span></span>
      <span class="quiz-launch-note">${escapeHtml(`${plural(count, "quick question")} from your own boards. Commit an answer first; the room, the computer, and your table follow. A biscuit for every question you finish.`)}</span>
    </button>
  `;
}

function renderFitStrip(fit) {
  if (!fit || !fit.length) return "";
  return `
    <div class="quiz-fit" aria-label="Combined suit lengths">
      ${fit.map((entry) => {
        const suit = SUITS.find((meta) => meta.key === entry.suit);
        return `<span><span class="suit-glyph ${escapeHtml(suit.className)}">${suit.html}</span> ${escapeHtml(entry.lengths.join("-"))}</span>`;
      }).join("")}
    </div>
  `;
}

function renderQuizCard(card) {
  const heading = card.maskBoard && card.dealLabel ? card.dealLabel : card.boardNo != null ? `Board ${card.boardNo}` : "";
  const columnHtml = card.prompt.column ? `
    <ul class="quiz-column" aria-label="Other scores on this deal">
      ${card.prompt.column.map((score) => `<li>${escapeHtml(score)}</li>`).join("")}
    </ul>
  ` : "";
  const notes = card.optionNotes || {};
  const handsHtml = card.hands ? `
    <div class="quiz-hands">
      ${card.hands.seats.map((seat) => renderHandBlock(card.hands.board, seat)).join("")}
    </div>
  ` : "";
  return `
    <article class="quiz-card" data-quiz-card="${escapeHtml(card.id)}" data-quiz-answer="${escapeHtml(card.answerKey)}"${card.neutral ? ` data-quiz-neutral="1"` : ""}>
      <header class="quiz-card-head">
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(heading)}</span>
      </header>
      <p class="quiz-lead">${contractGlyphHtml(card.prompt.lead)}</p>
      ${handsHtml}
      ${renderFitStrip(card.prompt.fit)}
      ${columnHtml}
      <p class="quiz-question">${escapeHtml(card.prompt.question)}</p>
      <div class="quiz-options" role="group" aria-label="${escapeHtml(card.prompt.question)}">
        ${card.options.map((option) => `
          <button type="button" class="quiz-option" data-quiz-option="${escapeHtml(option.key)}" aria-pressed="false">
            ${escapeHtml(option.label)}
            ${notes[option.key] ? `<span class="quiz-option-note hidden">${escapeHtml(notes[option.key])}</span>` : ""}
          </button>
        `).join("")}
      </div>
      <div class="quiz-reveal hidden" aria-live="polite">
        <div class="quiz-verdict" data-quiz-verdict></div>
        ${card.reveal.room ? `<div class="quiz-rung"><span class="quiz-rung-label">The room</span><p>${escapeHtml(card.reveal.room)}</p></div>` : ""}
        ${card.reveal.dd ? `<div class="quiz-rung"><span class="quiz-rung-label">The computer</span><p>${escapeHtml(card.reveal.dd)}</p></div>` : ""}
        <div class="quiz-rung">
          <span class="quiz-rung-label">Your table</span>
          <p>${contractGlyphHtml(card.reveal.yours)}${card.boardNo != null ? ` ${renderBoardJump(card.boardNo)}` : ""}</p>
        </div>
        <div class="quiz-coach quiz-coach-right hidden">${renderLossAdvice(card.reveal.coachRight)}</div>
        <div class="quiz-coach quiz-coach-wrong hidden">${renderLossAdvice(card.reveal.coachWrong)}</div>
      </div>
    </article>
  `;
}

/**
 * Applies the answered state to a rendered card: option styling, the
 * reveal ladder, and the verdict. Used both on first answer and when
 * navigating back to an already-answered question.
 */
function revealAnswer(cardEl, chosen) {
  cardEl.classList.add("answered");
  const answer = cardEl.getAttribute("data-quiz-answer");
  const neutral = cardEl.getAttribute("data-quiz-neutral") === "1";
  const correct = !neutral && chosen === answer;
  cardEl.querySelectorAll("[data-quiz-option]").forEach((option) => {
    const key = option.getAttribute("data-quiz-option");
    option.disabled = true;
    option.setAttribute("aria-pressed", String(key === chosen));
    if (neutral) {
      if (key === chosen) option.classList.add("is-chosen");
    } else {
      if (key === answer) option.classList.add("is-answer");
      if (key === chosen && !correct) option.classList.add("is-missed");
    }
    const note = option.querySelector(".quiz-option-note");
    if (note) note.classList.remove("hidden");
  });
  const reveal = cardEl.querySelector(".quiz-reveal");
  reveal.classList.remove("hidden");
  const verdict = reveal.querySelector("[data-quiz-verdict]");
  verdict.textContent = neutral ? "Judgment call -" : correct ? "Right!" : "Not quite -";
  verdict.classList.add(neutral ? "neutral" : correct ? "right" : "missed");
  reveal.querySelector(neutral || correct ? ".quiz-coach-right" : ".quiz-coach-wrong").classList.remove("hidden");
}

function quizOverlayElements() {
  return {
    overlay: document.getElementById("quizOverlay"),
    body: document.getElementById("quizOverlayBody"),
    jar: document.getElementById("quizOverlayJar"),
    countLabel: document.getElementById("quizOverlayCount"),
    prev: document.getElementById("quizPrevButton"),
    next: document.getElementById("quizNextButton")
  };
}

function renderQuizStage() {
  const { body, jar, countLabel, prev, next } = quizOverlayElements();
  if (!quizState || !body) return;
  const { cards, index, answers } = quizState;
  if (jar) {
    jar.innerHTML = cards.map((card, i) =>
      `<span class="biscuit${answers[i] ? " earned" : ""}${i === index ? " current" : ""}">${BISCUIT_SVG}</span>`).join("");
    const earned = answers.filter(Boolean).length;
    jar.setAttribute("aria-label", `Quiz progress: ${earned} of ${cards.length} answered`);
  }
  if (countLabel) countLabel.textContent = `Question ${index + 1} of ${cards.length}`;
  if (prev) prev.disabled = index === 0;
  if (next) next.disabled = index === cards.length - 1;
  body.innerHTML = renderQuizCard(cards[index]);
  const answer = answers[index];
  if (answer) {
    const cardEl = body.querySelector("[data-quiz-card]");
    if (cardEl) revealAnswer(cardEl, answer.chosen);
  }
  body.scrollTop = 0;
}

function openQuizOverlay() {
  if (!quizState) return;
  const { overlay } = quizOverlayElements();
  if (!overlay) return;
  openQuizOverlay.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.remove("hidden");
  document.body.classList.add("modal-open");
  const appShell = document.querySelector(".app-shell");
  if (appShell) appShell.inert = true;
  renderQuizStage();
  const closeButton = document.getElementById("quizOverlayClose");
  if (closeButton) closeButton.focus();
}

function closeQuizOverlay({ restoreFocus = true } = {}) {
  const { overlay, body } = quizOverlayElements();
  if (!overlay || overlay.classList.contains("hidden")) return;
  overlay.classList.add("hidden");
  const appShell = document.querySelector(".app-shell");
  if (appShell) appShell.inert = false;
  if (body) body.innerHTML = "";
  document.body.classList.remove("modal-open");
  if (restoreFocus && openQuizOverlay.returnFocus && document.contains(openQuizOverlay.returnFocus)) {
    openQuizOverlay.returnFocus.focus();
  }
  openQuizOverlay.returnFocus = null;
}

function quizOverlayIsOpen() {
  const { overlay } = quizOverlayElements();
  return Boolean(overlay && !overlay.classList.contains("hidden"));
}

function navigateQuiz(delta) {
  if (!quizState) return;
  const next = quizState.index + delta;
  if (next < 0 || next >= quizState.cards.length) return;
  quizState.index = next;
  renderQuizStage();
}

function renderQuizPrintSheet(cards, report) {
  const pairName = report.summary.players || `Pair ${report.pairNo}`;
  const front = cards.map((card, index) => `
    <section class="quiz-print-card">
      <h3>${escapeHtml(index + 1)}. ${escapeHtml(card.title)}${card.maskBoard && card.dealLabel ? ` - ${escapeHtml(card.dealLabel)}` : card.boardNo != null ? ` - Board ${escapeHtml(card.boardNo)}` : ""}</h3>
      <p>${contractGlyphHtml(card.prompt.lead)}</p>
      ${card.hands ? `<div class="quiz-hands">${card.hands.seats.map((seat) => renderHandBlock(card.hands.board, seat)).join("")}</div>` : ""}
      ${renderFitStrip(card.prompt.fit)}
      ${card.prompt.column ? `<p class="quiz-print-column">Other results: ${card.prompt.column.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      <p><strong>${escapeHtml(card.prompt.question)}</strong></p>
      <ul class="quiz-print-options">
        ${card.options.map((option) => `<li><span class="print-box"></span>${escapeHtml(option.label)}</li>`).join("")}
      </ul>
      <p class="quiz-print-talk">Talk it over with partner before checking the back page.</p>
    </section>
  `).join("");
  const answers = cards.map((card, index) => {
    const label = card.neutral || !card.answerKey
      ? "Judgment call - the room split too; see the evidence."
      : (card.options.find((option) => option.key === card.answerKey) || {}).label || card.answerKey;
    return `
      <section class="quiz-print-answer">
        <h4>${escapeHtml(index + 1)}. ${escapeHtml(card.title)}: ${escapeHtml(label)}</h4>
        ${card.reveal.room ? `<p>The room: ${contractGlyphHtml(card.reveal.room)}</p>` : ""}
        ${card.reveal.dd ? `<p>The computer: ${contractGlyphHtml(card.reveal.dd)}</p>` : ""}
        <p>Your table: ${contractGlyphHtml(card.reveal.yours)}${card.boardNo != null ? ` (board ${escapeHtml(card.boardNo)})` : ""}</p>
      </section>
    `;
  }).join("");
  return `
    <div class="quiz-print-sheet" aria-hidden="true">
      <header class="quiz-print-head">
        <h2>Table Time - ${escapeHtml(pairName)}</h2>
        <p>${escapeHtml(`${cards.length} questions from your own boards. Answers are on the back page - fold it away until you have talked each one over.`)}</p>
      </header>
      ${front}
      <div class="quiz-print-answers">
        <h2>Answers &amp; evidence</h2>
        ${answers}
      </div>
    </div>
  `;
}

/**
 * Delegated click handler for the quiz launch button, overlay chrome,
 * navigation, options, and printing. Returns true when handled.
 */
function handleQuizClick(event) {
  if (event.target.closest("[data-quiz-open]")) {
    openQuizOverlay();
    return true;
  }
  if (event.target.closest("[data-quiz-overlay-close]") || event.target.closest("#quizOverlayClose")) {
    closeQuizOverlay();
    return true;
  }
  const navButton = event.target.closest("[data-quiz-nav]");
  if (navButton) {
    navigateQuiz(Number(navButton.getAttribute("data-quiz-nav")));
    return true;
  }
  const printButton = event.target.closest("[data-quiz-print]");
  if (printButton) {
    const mount = document.getElementById("quizPrintMount");
    if (!quizState || !mount) return true;
    mount.innerHTML = renderQuizPrintSheet(quizState.cards, quizState.report);
    document.body.classList.add("printing-quiz");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-quiz"), { once: true });
    setTimeout(() => document.body.classList.remove("printing-quiz"), 2000);
    window.print();
    return true;
  }
  const button = event.target.closest("[data-quiz-option]");
  if (!button) return false;
  const cardEl = button.closest("[data-quiz-card]");
  if (!cardEl || cardEl.classList.contains("answered")) return true;
  const chosen = button.getAttribute("data-quiz-option");
  if (quizState) quizState.answers[quizState.index] = { chosen };
  revealAnswer(cardEl, chosen);
  renderJarOnly();
  return true;
}

function renderJarOnly() {
  const { jar } = quizOverlayElements();
  if (!quizState || !jar) return;
  const { cards, index, answers } = quizState;
  jar.innerHTML = cards.map((card, i) =>
    `<span class="biscuit${answers[i] ? " earned" : ""}${i === index ? " current" : ""}">${BISCUIT_SVG}</span>`).join("");
  const earned = answers.filter(Boolean).length;
  jar.setAttribute("aria-label", `Quiz progress: ${earned} of ${cards.length} answered`);
}

/**
 * Keyboard support while the overlay is open: arrows navigate, Escape
 * closes (unless the board-preview overlay is stacked on top - that
 * one closes first). Returns true when the key was handled.
 */
function handleQuizKeydown(event) {
  if (!quizOverlayIsOpen()) return false;
  const boardOverlay = document.getElementById("boardOverlay");
  if (boardOverlay && !boardOverlay.classList.contains("hidden")) return false;
  if (event.key === "ArrowRight") {
    navigateQuiz(1);
    return true;
  }
  if (event.key === "ArrowLeft") {
    navigateQuiz(-1);
    return true;
  }
  if (event.key === "Escape") {
    closeQuizOverlay();
    return true;
  }
  return false;
}

export {
  prepareQuiz,
  renderQuizLaunch,
  renderQuizCard,
  renderQuizPrintSheet,
  openQuizOverlay,
  closeQuizOverlay,
  navigateQuiz,
  handleQuizClick,
  handleQuizKeydown,
};
