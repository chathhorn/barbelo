// "Table Time" rendering: the reveal-spine quiz cards and the biscuit
// jar. All interactivity is event delegation on the report body; the
// reveal content is pre-rendered and hidden so answering is a pure
// class toggle - no re-render, no state outside the DOM.

import { contractGlyphHtml, escapeHtml } from "../core/format.js";
import { SUITS } from "../core/constants.js";
import { buildPairExercises } from "../core/exercises.js";
import { renderBoardJump } from "./dom.js";
import { renderHandBlock } from "./boardsView.js";
import { renderLossAdvice, renderReportSubsection } from "./reportView.js";

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

const BISCUIT_SVG = `<svg viewBox="0 0 24 14" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M 5 3 A 2.6 2.6 0 0 1 8.4 5.2 L 15.6 5.2 A 2.6 2.6 0 1 1 19 8.8 A 2.6 2.6 0 1 1 15.6 8.8 L 8.4 8.8 A 2.6 2.6 0 1 1 5 5.2 A 2.6 2.6 0 0 1 5 3 Z" transform="translate(0 1)"/></svg>`;

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
    <article class="quiz-card${card.hands ? " has-hands" : ""}" data-quiz-card="${escapeHtml(card.id)}" data-quiz-answer="${escapeHtml(card.answerKey)}"${card.neutral ? ` data-quiz-neutral="1"` : ""}>
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

function renderTableTime(results, report) {
  const quiz = buildPairExercises(results, report);
  if (!quiz.cards.length) return "";
  const jar = `
    <div class="biscuit-jar" role="img" aria-label="Quiz progress: 0 of ${quiz.cards.length} answered">
      ${quiz.cards.map(() => `<span class="biscuit">${BISCUIT_SVG}</span>`).join("")}
    </div>
  `;
  const note = `<span class="subsection-note">${escapeHtml(`${quiz.cards.length} quick questions from your own boards - answers appear after you choose`)}</span>`;
  return renderReportSubsection("table-time", "Table Time", `
      <div class="quiz-intro-row">
        <p class="quiz-intro">Have another go before reading the details below - nothing is graded by luck, only by the room and the arithmetic.</p>
        <div class="quiz-intro-actions">
          ${jar}
          <button type="button" class="ghost" data-quiz-print>Print partner sheet</button>
        </div>
      </div>
      <div class="quiz-card-grid">
        ${quiz.cards.map(renderQuizCard).join("")}
      </div>
      ${renderQuizPrintSheet(quiz.cards, report)}
  `, note, { id: "rs-quiz" });
}

/**
 * Delegated click handler for quiz options; wired once in setupEvents.
 * Returns true when the click was handled.
 */
function handleQuizClick(event) {
  const printButton = event.target.closest("[data-quiz-print]");
  if (printButton) {
    const section = printButton.closest(".table-time");
    const sheet = section ? section.querySelector(".quiz-print-sheet") : null;
    const mount = document.getElementById("quizPrintMount");
    if (!sheet || !mount) return true;
    // The sheet is copied to a body-level mount so print layout never
    // depends on the panel it happens to be nested in.
    mount.innerHTML = sheet.outerHTML;
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
  cardEl.classList.add("answered");
  const chosen = button.getAttribute("data-quiz-option");
  const answer = cardEl.getAttribute("data-quiz-answer");
  // Neutral cards are genuine judgment calls: no answer is wrong.
  const neutral = cardEl.getAttribute("data-quiz-neutral") === "1";
  const correct = !neutral && chosen === answer;
  cardEl.querySelectorAll("[data-quiz-option]").forEach((option) => {
    const key = option.getAttribute("data-quiz-option");
    option.disabled = true;
    option.setAttribute("aria-pressed", String(option === button));
    if (neutral) {
      if (option === button) option.classList.add("is-chosen");
    } else {
      if (key === answer) option.classList.add("is-answer");
      if (option === button && !correct) option.classList.add("is-missed");
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
  // Fill the next biscuit: completion is the reward, right or wrong.
  const section = cardEl.closest(".table-time");
  if (section) {
    const empty = section.querySelector(".biscuit:not(.earned)");
    if (empty) empty.classList.add("earned");
    const jar = section.querySelector(".biscuit-jar");
    if (jar) {
      const total = jar.querySelectorAll(".biscuit").length;
      const earned = jar.querySelectorAll(".biscuit.earned").length;
      jar.setAttribute("aria-label", `Quiz progress: ${earned} of ${total} answered`);
    }
  }
  return true;
}

export {
  renderTableTime,
  renderQuizCard,
  renderQuizPrintSheet,
  handleQuizClick,
};
