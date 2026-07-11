// "Table Time" rendering: the reveal-spine quiz cards and the biscuit
// jar. All interactivity is event delegation on the report body; the
// reveal content is pre-rendered and hidden so answering is a pure
// class toggle - no re-render, no state outside the DOM.

import { contractGlyphHtml, escapeHtml } from "../core/format.js";
import { buildPairExercises } from "../core/exercises.js";
import { renderBoardJump } from "./dom.js";
import { renderLossAdvice, renderReportSubsection } from "./reportView.js";

const BISCUIT_SVG = `<svg viewBox="0 0 24 14" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M 5 3 A 2.6 2.6 0 0 1 8.4 5.2 L 15.6 5.2 A 2.6 2.6 0 1 1 19 8.8 A 2.6 2.6 0 1 1 15.6 8.8 L 8.4 8.8 A 2.6 2.6 0 1 1 5 5.2 A 2.6 2.6 0 0 1 5 3 Z" transform="translate(0 1)"/></svg>`;

function renderQuizCard(card) {
  const heading = card.maskBoard && card.dealLabel ? card.dealLabel : card.boardNo != null ? `Board ${card.boardNo}` : "";
  const columnHtml = card.prompt.column ? `
    <ul class="quiz-column" aria-label="Other scores on this deal">
      ${card.prompt.column.map((score) => `<li>${escapeHtml(score)}</li>`).join("")}
    </ul>
  ` : "";
  const notes = card.optionNotes || {};
  return `
    <article class="quiz-card" data-quiz-card="${escapeHtml(card.id)}" data-quiz-answer="${escapeHtml(card.answerKey)}">
      <header class="quiz-card-head">
        <strong>${escapeHtml(card.title)}</strong>
        <span>${escapeHtml(heading)}</span>
      </header>
      <p class="quiz-lead">${contractGlyphHtml(card.prompt.lead)}</p>
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
        ${jar}
      </div>
      <div class="quiz-card-grid">
        ${quiz.cards.map(renderQuizCard).join("")}
      </div>
  `, note, { id: "rs-quiz" });
}

/**
 * Delegated click handler for quiz options; wired once in setupEvents.
 * Returns true when the click was handled.
 */
function handleQuizClick(event) {
  const button = event.target.closest("[data-quiz-option]");
  if (!button) return false;
  const cardEl = button.closest("[data-quiz-card]");
  if (!cardEl || cardEl.classList.contains("answered")) return true;
  cardEl.classList.add("answered");
  const chosen = button.getAttribute("data-quiz-option");
  const answer = cardEl.getAttribute("data-quiz-answer");
  const correct = chosen === answer;
  cardEl.querySelectorAll("[data-quiz-option]").forEach((option) => {
    const key = option.getAttribute("data-quiz-option");
    option.disabled = true;
    option.setAttribute("aria-pressed", String(option === button));
    if (key === answer) option.classList.add("is-answer");
    if (option === button && !correct) option.classList.add("is-missed");
    const note = option.querySelector(".quiz-option-note");
    if (note) note.classList.remove("hidden");
  });
  const reveal = cardEl.querySelector(".quiz-reveal");
  reveal.classList.remove("hidden");
  const verdict = reveal.querySelector("[data-quiz-verdict]");
  verdict.textContent = correct ? "Right!" : "Not quite -";
  verdict.classList.add(correct ? "right" : "missed");
  reveal.querySelector(correct ? ".quiz-coach-right" : ".quiz-coach-wrong").classList.remove("hidden");
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
  handleQuizClick,
};
