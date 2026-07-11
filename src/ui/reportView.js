// Rendering for the Pair Improvement Report: section chrome, loss
// themes, review cards, and swing explanations.
import {
  contractGlyphHtml,
  escapeHtml,
  formatMp,
  formatSigned,
  numericPairSort,
  plural,
  sum,
} from "../core/format.js";
import { buildPairImprovementReport, decisionTypeInfoForCategory, dominantBoardLoss, peerDisplayName } from "../core/report.js";
import { defaultReportPair, rowContractText } from "../core/results.js";
import { SUITS } from "../core/constants.js";
import { prepareQuiz, renderQuizLaunch } from "./quizView.js";
import { assetUrl, renderBoardJump, renderBoardJumpList } from "./dom.js";
import { STATE } from "./state.js";
import { annotateTermTooltips, term, tooltipAttrs } from "./terms.js";

function renderPairImprovementReport(results) {
  const panel = document.getElementById("pairReportPanel");
  const select = document.getElementById("reportPairSelect");
  const caption = document.getElementById("pairReportCaption");
  const body = document.getElementById("pairReportBody");
  if (!results || !results.pairStandings.length) {
    select.innerHTML = "";
    caption.textContent = "";
    body.innerHTML = "";
    panel.classList.add("hidden");
    prepareQuiz(null, null);
    return;
  }

  const pairOptions = [...results.pairStandings]
    .sort((a, b) => numericPairSort(a.pairNo, b.pairNo));
  if (!STATE.reportPair || !pairOptions.some((entry) => String(entry.key) === String(STATE.reportPair))) {
    STATE.reportPair = defaultReportPair(results);
  }

  select.innerHTML = pairOptions.map((standing) => {
    const pct = standing.percent == null ? "" : ` (${standing.percent.toFixed(1)}%)`;
    const players = standing.players ? ` - ${standing.players}` : "";
    return `<option value="${escapeHtml(standing.key)}">Pair ${escapeHtml(standing.pairNo)}${escapeHtml(players)}${escapeHtml(pct)}</option>`;
  }).join("");
  select.value = String(STATE.reportPair);

  const report = buildPairImprovementReport(results, STATE.reportPair);
  if (!report) {
    caption.textContent = "No traveler rows for the selected pair.";
    body.innerHTML = `<div class="empty-state">Choose a pair with played boards.</div>`;
    panel.classList.remove("hidden");
    prepareQuiz(null, null);
    return;
  }
  prepareQuiz(results, report);

  const summary = report.summary;
  caption.textContent = `${summary.players || `Pair ${report.pairNo}`} - ${plural(summary.boards, "board")} reviewed. ${sessionToneSentence(summary, report.reviewItems.length)}`;
  body.innerHTML = `
    <nav class="report-nav" aria-label="Report sections">
      <a href="#rs-summary">Summary</a>
      <a href="#rs-profile">Profile</a>
      <a href="#rs-bidding">Bidding</a>
      <a href="#rs-declared">Declaring</a>
      <a href="#rs-defended">Defending</a>
      <a href="#rs-themes">Loss Themes</a>
      <a href="#rs-boards">Top Boards</a>
      <a href="#rs-more">More Boards</a>
      <a href="#rs-field">Field</a>
    </nav>
    ${renderThisWeek(report)}
    <div class="report-summary-grid" id="rs-summary">
      <div class="result-summary-card"><strong>${escapeHtml(summary.percent == null ? "n/a" : `${summary.percent.toFixed(1)}%`)}</strong><span>Session</span></div>
      <div class="result-summary-card"><strong class="term-tip"${tooltipAttrs("Matchpoints earned minus the field-average expectation (half the top on every board). Positive means an above-average session.")}>${escapeHtml(formatSignedMp(summary.mpVsAverage))}</strong><span>MP Vs Average</span></div>
      <a class="result-summary-card" href="#rs-boards"><strong>${escapeHtml(summary.lowBoards)}</strong><span>Low Boards</span></a>
      <a class="result-summary-card" href="#rs-themes"><strong>${escapeHtml(report.decisionTypes.length)}</strong><span>Loss Themes</span></a>
    </div>
    ${renderPairProfile(report)}
    ${renderBiddingScorecard(report)}
    ${renderDeclaredScorecard(report)}
    ${renderDefendedScorecard(report)}
    ${renderLossThemes(report)}
    ${renderTopReviewPriorities(report)}
    ${renderReviewQueue(report)}
    ${renderFieldContext(report)}
  `;
  panel.classList.remove("hidden");
  annotateTermTooltips(panel);
}

function sessionToneSentence(summary, shownCount) {
  if (summary.percent == null) return "";
  const pct = summary.percent;
  const tone = pct >= 60
    ? "A strong session"
    : pct >= 55
      ? "An above-average session"
      : pct >= 45
        ? "A middle-of-the-field session"
        : "A tough session";
  const flaggedCount = summary.flaggedBoards != null ? summary.flaggedBoards : shownCount;
  const flagged = flaggedCount
    ? ` ${plural(flaggedCount, "board")} flagged for review${flaggedCount > shownCount ? ` (top ${shownCount} shown)` : ""}.`
    : " No boards needed flagging.";
  return `${tone}.${flagged}`;
}

function renderThisWeek(report) {
  const priorities = (report.practicePriorities || []).slice(0, 3);
  const focus = report.profile ? report.profile.focus : "";
  if (!focus && !priorities.length) return "";
  const list = priorities.length ? `
    <ol class="this-week-list">
      ${priorities.map((priority) => `
        <li>
          <strong>${term(priority.title)}</strong>
          <span>${escapeHtml(priority.metric)} - ${escapeHtml(priority.detail)}</span>
          ${priority.boards && priority.boards.length ? `<span class="cell-note">Boards: ${renderBoardJumpList(priority.boards, 4)}</span>` : ""}
        </li>
      `).join("")}
    </ol>
  ` : "";
  return `
    <section class="this-week-card" aria-label="This week's focus">
      <div class="this-week-head"><strong>This Week</strong><span>What to look at before the next session.</span></div>
      ${renderQuizLaunch()}
      ${renderLossAdvice(focus)}
      ${list}
    </section>
  `;
}

function formatLeadHtml(leadCard) {
  const raw = String(leadCard || "").trim();
  if (!raw) return "";
  const match = /^([SHDC])\s*(10|[AKQJT98765432])$/i.exec(raw);
  if (!match) return escapeHtml(raw);
  const suit = SUITS.find((entry) => entry.key === match[1].toUpperCase());
  return `<span class="suit-glyph ${escapeHtml(suit.className)}">${suit.html}</span>${escapeHtml(match[2].toUpperCase())}`;
}

function renderReportSubsection(className, title, bodyHtml, summaryExtra = "", options = {}) {
  return `
    <details class="report-subsection ${escapeHtml(className)}"${options.open === false ? "" : " open"}${options.id ? ` id="${escapeHtml(options.id)}"` : ""}>
      <summary class="section-kicker">
        <h3>${term(title)}</h3>
        ${summaryExtra}
      </summary>
      <div class="report-subsection-body">
        ${bodyHtml}
      </div>
    </details>
  `;
}

function renderPracticeCards(priorities) {
  return `
      <div class="practice-card-grid">
        ${priorities.map((priority, index) => `
          <article class="practice-card">
            <div class="priority-rank">${escapeHtml(index + 1)}</div>
            <div class="practice-card-body">
              <div class="practice-card-head">
                <strong>${term(priority.title)}</strong>
                <span>${escapeHtml(priority.metric)} - ${escapeHtml(priority.detail)}</span>
              </div>
              ${priority.boards && priority.boards.length ? `<div class="cell-note">Boards: ${renderBoardJumpList(priority.boards, 6)}</div>` : ""}
              ${renderLossAdvice(priority.advice)}
            </div>
          </article>
        `).join("")}
      </div>
  `;
}

function renderLossThemes(report) {
  const types = report.decisionTypes || [];
  const ledger = report.lossLedger;
  if (!types.length) {
    const fallback = report.practicePriorities && report.practicePriorities.length
      ? renderPracticeCards(report.practicePriorities)
      : `<div class="empty-state">No same-direction matchpoint losses found for this pair.</div>`;
    return renderReportSubsection("loss-themes", "Loss Themes", fallback, "", { id: "rs-themes" });
  }
  const conceded = ledger.outrightLoss || sum(types.map((type) => type.totalLoss));
  const categoriesByType = new Map();
  (ledger.categories || []).forEach((category) => {
    const typeKey = decisionTypeInfoForCategory(category.key).key;
    if (!categoriesByType.has(typeKey)) categoriesByType.set(typeKey, []);
    categoriesByType.get(typeKey).push(category);
  });
  const tieNote = ledger.tieCount
    ? ` ${plural(ledger.tieCount, "tied comparison")} counted as shared results, not losses.`
    : "";
  // One home per board: a board lists under the theme that carried its
  // biggest loss. Replayed boards keep one dominant per play, so a
  // board number may legitimately be home to two themes.
  const dominantByBoard = new Map();
  (ledger.boardItems || []).forEach((item) => {
    const dominant = dominantBoardLoss(item);
    if (!dominant) return;
    const key = String(item.boardNo);
    if (!dominantByBoard.has(key)) dominantByBoard.set(key, new Set());
    dominantByBoard.get(key).add(dominant.key);
  });
  const summary = `
    <span class="subsection-note">${escapeHtml(formatMp(conceded))} MP conceded to same-direction tables that beat this pair, across ${escapeHtml(plural(ledger.outrightBoardCount != null ? ledger.outrightBoardCount : ledger.boardCount, "board"))}.${escapeHtml(tieNote)}</span>
  `;
  const body = `
      <div class="decision-type-grid">
        ${types.map((type, index) => {
          const width = conceded ? (type.totalLoss / conceded) * 100 : 0;
          const basis = `${type.label}: ${formatMp(type.totalLoss)} of ${formatMp(conceded)} MP conceded in this report (${width.toFixed(0)}%). One MP for each same-direction table that beat this pair.`;
          const categories = categoriesByType.get(type.key) || [];
          const categoryKeys = new Set(categories.map((category) => category.key));
          const homeBoards = type.boards.filter((boardNo) => {
            const dominants = dominantByBoard.get(String(boardNo));
            return dominants && [...dominants].some((key) => categoryKeys.has(key));
          });
          const sharedCount = type.boards.length - homeBoards.length;
          const boardsLine = homeBoards.length
            ? `<div class="cell-note">Boards: ${renderBoardJumpList(homeBoards, 8)}${sharedCount ? `<span class="muted-note"> +${escapeHtml(plural(sharedCount, "board"))} shared with other themes</span>` : ""}</div>`
            : sharedCount
              ? `<div class="cell-note"><span class="muted-note">No board has this as its main story; ${escapeHtml(plural(sharedCount, "shared board"))} contributed.</span></div>`
              : "";
          return `
            <article class="decision-type-card ${escapeHtml(type.tone || "")}">
              <div class="decision-type-head">
                <div>
                  <strong>${term(type.label)}</strong>
                  <span>${escapeHtml(plural(type.boardCount, "board"))}, ${escapeHtml(plural(type.comparisonCount, "lost head-to-head"))}</span>
                </div>
                <b class="term-tip"${tooltipAttrs(basis)}>${escapeHtml(formatMp(type.totalLoss))} MP</b>
              </div>
              <div class="loss-bar" role="img" aria-label="${escapeHtml(basis)}"><span style="width:${width.toFixed(1)}%"></span></div>
              ${boardsLine}
              ${renderLossAdvice(type.advice)}
              ${categories.length ? `
              <details class="theme-detail">
                <summary>${escapeHtml(plural(categories.length, "contributing pattern"))} with examples</summary>
                ${categories.map((category) => `
                  <div class="theme-category">
                    <div class="theme-category-head">
                      <strong>${term(category.label)}</strong>
                      <span>${escapeHtml(formatMp(category.totalLoss))} MP &middot; ${escapeHtml(plural(category.comparisonCount, "lost head-to-head"))}</span>
                    </div>
                    <ul class="loss-example-list">
                      ${category.examples.slice(0, 2).map(renderLossExample).join("")}
                    </ul>
                  </div>
                `).join("")}
              </details>` : ""}
            </article>
          `;
        }).join("")}
      </div>
  `;
  return renderReportSubsection("loss-themes", "Loss Themes", body, summary, { id: "rs-themes" });
}

function renderProfileMetric(item) {
  return `
    <div class="profile-metric">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </div>
  `;
}

function renderPairProfile(report) {
  const profile = report.profile;
  if (!profile) return "";
  return renderReportSubsection("pair-profile", "Pair Profile", `
      <div class="profile-grid">
        <article class="profile-card">
          <h4>Strengths</h4>
          <div class="profile-metric-list">
            ${(profile.strengths.length ? profile.strengths : [{ label: "Baseline", value: "No standout strength", detail: "Review more sessions to establish a clearer pattern." }]).map(renderProfileMetric).join("")}
          </div>
        </article>
        <article class="profile-card">
          <h4>Weaknesses</h4>
          <div class="profile-metric-list">
            ${(profile.weaknesses.length ? profile.weaknesses : [{ label: "Baseline", value: "No standout weakness", detail: "Same-direction loss patterns are limited in this file." }]).map(renderProfileMetric).join("")}
          </div>
        </article>
      </div>
  `, "", { id: "rs-profile" });
}

function renderTopReviewPriorities(report) {
  const items = report.reviewItems.slice(0, 3);
  if (!items.length) {
    return renderReportSubsection("review-priority-strip", "Top Boards To Review", `
      <div class="empty-state">No boards were flagged for review; no significant matchpoint losses stood out for this pair.</div>
    `, "", { id: "rs-boards" });
  }
  return renderReportSubsection("review-priority-strip", "Top Boards To Review", `
      <div class="priority-card-grid">
        ${items.map((item, index) => {
          const row = item.row;
          const contractText = `${row.declarerSide || ""} ${row.contract || ""}${row.result || ""}`.trim() || "No contract";
          const pctText = item.percent == null ? "n/a" : `${item.percent.toFixed(1)}%`;
          const mpText = item.matchpoints == null || row.boardTop == null ? "n/a" : `${item.matchpoints.toFixed(1)} / ${row.boardTop.toFixed(1)}`;
          const bestPeer = item.peerComparison ? item.peerComparison.rows.find((entry) => !entry.isTarget) : null;
          const peerCount = item.peerComparison ? item.peerComparison.peerCount : 0;
          const lead = formatLeadHtml(row.leadCard);
          return `
            <article class="priority-card">
              <div class="priority-rank">${escapeHtml(index + 1)}</div>
              <div class="priority-card-body">
                <div class="priority-card-head">
                  <strong>${renderBoardJump(row.boardNo)} - <span class="contract">${contractGlyphHtml(contractText)}</span></strong>
                  <span>${escapeHtml(item.declared ? "Declaring" : "Defending")} / ${escapeHtml(pctText)}${peerCount ? ` &middot; vs ${escapeHtml(peerCount)} other table${peerCount === 1 ? "" : "s"}` : ""}</span>
                </div>
                <div class="reason-list">
                  ${item.reasons.slice(0, 3).map((reason) => `<span class="reason-chip ${escapeHtml(reason.tone)}">${escapeHtml(reason.label)}</span>`).join("")}
                  ${renderConfidenceChip(item.diagnosis.confidence)}
                </div>
                ${renderLossAdvice(item.diagnosis.explanation)}
                ${bestPeer ? `
                <div class="swing-diff">
                  <div class="swing-diff-row"><span>You</span><span class="contract">${contractGlyphHtml(rowContractText(row))}</span><b>${escapeHtml(item.pairScore == null ? "n/a" : formatSigned(item.pairScore))}</b></div>
                  <div class="swing-diff-row"><span>Best peer</span><span class="contract">${contractGlyphHtml(bestPeer.contract)}</span><b>${escapeHtml(formatSigned(bestPeer.score))}</b><i>${escapeHtml(peerDisplayName(bestPeer.pairNo, bestPeer.players))}</i></div>
                </div>` : ""}
                <div class="priority-mini-stats">
                  <span><b>${escapeHtml(mpText)}</b> MP</span>
                  <span><b>${escapeHtml(item.fieldDelta == null ? "n/a" : formatSigned(Math.round(item.fieldDelta)))}</b> vs field avg</span>
                  <span><b>${escapeHtml(item.vsPar == null ? "n/a" : formatSigned(item.vsPar))}</b> vs par</span>
                  ${lead ? `<span><b>${lead}</b> lead</span>` : ""}
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
  `, "", { id: "rs-boards" });
}

const GAME_BUCKET_INFO = {
  bidMade: { label: "bid & made", tone: "green" },
  bidFailed: { label: "bid, went down", tone: "gold" },
  missed: { label: "missed game", tone: "red" },
  beatGame: { label: "beat the game score", tone: "green" },
  stayedLow: { label: "stayed low with the field", tone: "" },
  competitive: { label: "competitive board", tone: "" }
};

function roundTenth(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function renderBiddingScorecard(report) {
  const card = report.biddingScorecard;
  if (!card || !card.hasDd) {
    return renderReportSubsection("bidding-scorecard", "Bidding Scorecard", `
      <div class="empty-state">Open a PBN hand record to enable the bidding scorecard; it needs the double-dummy table.</div>
    `, "", { id: "rs-bidding", open: false });
  }
  if (!card.gamesAvailable) {
    return renderReportSubsection("bidding-scorecard", "Bidding Scorecard", `
      <div class="empty-state">Double-dummy found no makeable game for this pair's side on the boards they played.</div>
    `, "", { id: "rs-bidding", open: false });
  }
  const stats = `
    <div class="scorecard-stats">
      <div class="review-stat"><span>Games Available</span><strong>${escapeHtml(card.gamesAvailable)}</strong></div>
      <div class="review-stat"><span>Bid &amp; Made</span><strong>${escapeHtml(card.bidMade)}</strong></div>
      <div class="review-stat"><span>Bid, Went Down</span><strong>${escapeHtml(card.bidFailed)}</strong></div>
      <div class="review-stat"><span>Missed</span><strong>${escapeHtml(card.missed)}</strong></div>
      <div class="review-stat"><span>Stayed Low</span><strong>${escapeHtml(card.stayedLow + card.beatGame)}</strong></div>
      <div class="review-stat"><span>Net MP On These</span><strong>${escapeHtml(formatSignedMp(card.netMp))}</strong></div>
    </div>
  `;
  const rows = card.gameBoards.map((board) => {
    const bucket = GAME_BUCKET_INFO[board.bucket] || GAME_BUCKET_INFO.stayedLow;
    const fieldText = board.peersInGame
      ? `${board.peersMadeGame} of ${board.peersInGame} in game made it`
      : board.sidePeers ? "nobody else bid game" : "no other tables";
    return `
      <tr>
        <td>${renderBoardJump(board.boardNo)}</td>
        <td>${escapeHtml(board.vulnerable ? "Vul" : "Not vul")}</td>
        <td class="contract">${contractGlyphHtml(board.bestText || "")}</td>
        <td class="contract">${contractGlyphHtml(board.contractText)}</td>
        <td>${escapeHtml(fieldText)}</td>
        <td><span class="reason-chip ${escapeHtml(bucket.tone)}">${escapeHtml(bucket.label)}</span></td>
        <td class="numeric">${escapeHtml(formatSignedMp(board.mpVsAverage))}</td>
      </tr>
    `;
  }).join("");
  const slamNote = card.slams.length ? `
    <div class="cell-note">Slam-strength boards: ${card.slams.map((slam) => {
      const outcome = slam.bidSlam
        ? (slam.made === false ? "bid, went down" : "bid and made")
        : slam.percent != null && slam.percent >= 60
          ? "scored well without bidding it"
          : "stopped short";
      return `${renderBoardJump(slam.boardNo)} (<span class="contract">${contractGlyphHtml(slam.bestText)}</span> makes) - ${escapeHtml(outcome)}`;
    }).join("; ")}.</div>
  ` : "";
  const missedNote = card.missed
    ? `<p class="cell-note">"Missed" only counts boards where another same-direction table bid the game and made it.</p>`
    : "";
  return renderReportSubsection("bidding-scorecard", "Bidding Scorecard", `
      ${stats}
      <div class="scorecard-table">
        <table>
          <thead><tr><th scope="col">Board</th><th scope="col">Vul</th><th scope="col">Makeable</th><th scope="col">Your Table</th><th scope="col">Same-Direction Field</th><th scope="col">Verdict</th><th scope="col" class="numeric">MP Vs Avg</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${missedNote}
      ${slamNote}
  `, "", { id: "rs-bidding" });
}

function renderDeclaredScorecard(report) {
  const card = report.declaredScorecard;
  if (!card || !card.declares) {
    return renderReportSubsection("declared-scorecard", "When You Declared", `
      <div class="empty-state">This pair never declared a board in this session.</div>
    `, "", { id: "rs-declared", open: false });
  }
  const stats = `
    <div class="scorecard-stats">
      <div class="review-stat"><span>Declared</span><strong>${escapeHtml(card.declares)}</strong></div>
      <div class="review-stat"><span>Made</span><strong>${escapeHtml(card.madeCount)} / ${escapeHtml(card.madeCount + card.failedCount)}</strong></div>
      <div class="review-stat term-tip"${tooltipAttrs("Trick results against other tables that declared the identical contract - the fairest benchmark, same cards and real defenders.")}><span>Vs Same Contract</span><strong>${escapeHtml(card.beat)} up / ${escapeHtml(card.matched)} even / ${escapeHtml(card.trailed)} down</strong></div>
      <div class="review-stat"><span>Benchmarked</span><strong>${escapeHtml(card.cohortCovered)} of ${escapeHtml(card.declares)}</strong></div>
    </div>
  `;
  const rows = card.boards.map((board) => {
    const verdict = board.verdict == null ? "" : board.verdict === "beat"
      ? `<span class="reason-chip green">took more tricks</span>`
      : board.verdict === "trailed"
        ? `<span class="reason-chip gold">took fewer tricks</span>`
        : `<span class="reason-chip">matched</span>`;
    const basisNote = board.basis === "dd" ? " vs double-dummy" : "";
    const cohortText = board.cohortSize
      ? `${plural(board.cohortSize, "table")}, median ${roundTenth(board.cohortMedian)}`
      : board.basis === "dd" ? "none - DD benchmark" : "none";
    const triage = board.triage
      ? `<span class="reason-chip ${escapeHtml(board.triage.tone)} term-tip"${tooltipAttrs(board.triage.detail)}>${escapeHtml(board.triage.label)}</span>`
      : "";
    return `
      <tr>
        <td>${renderBoardJump(board.boardNo)}</td>
        <td class="contract">${contractGlyphHtml(board.contractText)}</td>
        <td class="numeric">${escapeHtml(board.tricks == null ? "n/a" : `${board.tricks}${board.target == null ? "" : ` / ${board.target}`}`)}</td>
        <td>${escapeHtml(cohortText)}</td>
        <td>${verdict}${escapeHtml(verdict ? basisNote : "")}</td>
        <td>${triage}</td>
      </tr>
    `;
  }).join("");
  return renderReportSubsection("declared-scorecard", "When You Declared", `
      ${stats}
      <div class="scorecard-table">
        <table>
          <thead><tr><th scope="col">Board</th><th scope="col">Contract</th><th scope="col" class="numeric">Tricks / Needed</th><th scope="col">Same Contract Elsewhere</th><th scope="col">Verdict</th><th scope="col">If It Failed</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderOvertrickMeter(report)}
  `, "", { id: "rs-declared" });
}

function renderOvertrickMeter(report) {
  const meter = report.overtrickMeter;
  if (!meter || !meter.boards.length) return "";
  const flagged = meter.flaggedBoards;
  const flaggedList = flagged.length ? `
    <ul class="loss-example-list">
      ${flagged.map((board) => `
        <li><strong>${renderBoardJump(board.boardNo)}</strong>
        <span>In <span class="contract">${contractGlyphHtml(board.contractText)}</span>, one more trick was worth ${escapeHtml(formatSignedMp(board.mpIfUp))} MP - a same-contract table took it.</span></li>
      `).join("")}
    </ul>
  ` : "";
  const headline = flagged.length
    ? `Overtricks left on the table were worth ${formatSignedMp(meter.pushWorth)} MP this session.`
    : "No field-proven overtricks were missed in made contracts.";
  const safetyNote = meter.freeSafetyCount
    ? ` On ${plural(meter.freeSafetyCount, "board")} a safety play was free: even one fewer trick would have cost nothing.`
    : "";
  return `
    <div class="overtrick-meter">
      <strong class="term-tip"${tooltipAttrs("For every made contract: the score is recomputed with one trick more and one trick fewer, then re-ranked against the board's actual results to price the trick in matchpoints.")}>Overtrick meter</strong>
      <p>${escapeHtml(headline)}${escapeHtml(safetyNote)}</p>
      ${flaggedList}
    </div>
  `;
}

function renderDefendedScorecard(report) {
  const card = report.defendedScorecard;
  if (!card || !card.defends) {
    return renderReportSubsection("defended-scorecard", "When You Defended", `
      <div class="empty-state">This pair declared every board in this session.</div>
    `, "", { id: "rs-defended", open: false });
  }
  const netText = card.netTricks == null ? "n/a" : `${formatSigned(roundTenth(card.netTricks))} tricks`;
  const stats = `
    <div class="scorecard-stats">
      <div class="review-stat"><span>Defended</span><strong>${escapeHtml(card.defends)}</strong></div>
      <div class="review-stat term-tip"${tooltipAttrs("Tricks conceded compared with other tables defending the identical contract (or, without one, with the field's double-dummy-relative norm). Positive means the room conceded more than this pair.")}><span>Net Tricks Vs Room</span><strong>${escapeHtml(netText)}</strong></div>
      <div class="review-stat"><span>Benchmarked</span><strong>${escapeHtml(card.cohortCovered)} of ${escapeHtml(card.defends)} same contract</strong></div>
      <div class="review-stat"><span>Flagged</span><strong>${escapeHtml(card.flaggedCount)}</strong></div>
    </div>
  `;
  const rows = card.boards.map((board) => {
    const edge = roundTenth(board.edge);
    const chip = edge == null ? "" : edge >= 1
      ? `<span class="reason-chip green">${escapeHtml(formatSigned(edge))}</span>`
      : edge <= -2
        ? `<span class="reason-chip red">${escapeHtml(formatSigned(edge))}</span>`
        : edge <= -1
          ? `<span class="reason-chip gold">${escapeHtml(formatSigned(edge))}</span>`
          : `<span class="reason-chip">${escapeHtml(formatSigned(edge))}</span>`;
    const basisText = board.basis === "cohort"
      ? `${plural(board.cohortSize, "table")}, median ${roundTenth(board.cohortMedian)}`
      : board.basis === "field-dd" ? "field DD norm" : "no benchmark";
    return `
      <tr>
        <td>${renderBoardJump(board.boardNo)}</td>
        <td class="contract">${contractGlyphHtml(board.contractText)}</td>
        <td class="numeric">${escapeHtml(board.conceded == null ? "n/a" : board.conceded)}</td>
        <td>${escapeHtml(basisText)}</td>
        <td>${chip}</td>
      </tr>
    `;
  }).join("");
  return renderReportSubsection("defended-scorecard", "When You Defended", `
      ${stats}
      <div class="scorecard-table">
        <table>
          <thead><tr><th scope="col">Board</th><th scope="col">Opponents' Contract</th><th scope="col" class="numeric">Tricks Conceded</th><th scope="col">Benchmark</th><th scope="col">Trick Edge</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
  `, "", { id: "rs-defended" });
}

function renderConfidenceChip(confidence) {
  if (!confidence) return "";
  return `<span class="confidence-chip ${escapeHtml(confidence.level)} term-tip"${tooltipAttrs(confidence.detail)}>${escapeHtml(confidence.label)}</span>`;
}

function formatResultPercent(value) {
  return value == null ? "n/a" : `${value.toFixed(1)}%`;
}

function formatSignedMp(value) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return value > 0 ? `+${formatMp(value)}` : formatMp(value);
}

function renderFieldContext(report) {
  const context = report.fieldContext;
  if (!context || (!context.rivals.length && !context.opponents.length)) return "";
  const rivalRows = context.rivals.map((rival) => `
    <tr>
      <td>${escapeHtml(peerDisplayName(rival.pairNo, rival.players))}</td>
      <td class="numeric">${escapeHtml(rival.wins)}-${escapeHtml(rival.losses)}-${escapeHtml(rival.ties)}</td>
      <td class="numeric">${escapeHtml(formatSignedMp(rival.netMp))}</td>
      <td>${rival.costliest.length ? rival.costliest.map((entry) => renderBoardJump(entry.boardNo)).join(", ") : "-"}</td>
    </tr>
  `).join("");
  const opponentRows = context.opponents.map((opponent) => `
    <tr>
      <td>${escapeHtml(peerDisplayName(opponent.pairNo, opponent.players))}</td>
      <td class="numeric">${escapeHtml(opponent.boardCount)}</td>
      <td class="numeric">${escapeHtml(formatResultPercent(opponent.averagePercent))}</td>
      <td class="numeric">${escapeHtml(opponent.delta == null ? "n/a" : `${formatSigned(Math.round(opponent.delta))} pts`)}</td>
    </tr>
  `).join("");
  return renderReportSubsection("field-context", "Field Context", `
      <div class="field-context-grid">
        <div>
          <h4 class="term-tip"${tooltipAttrs("At matchpoints, scores are compared with every pair sitting the same direction - these are the pairs matchpoints are actually won from. Wins-losses-ties count board-by-board score comparisons; net MP is the swing against an even split.")}>Same-Direction Rivals</h4>
          <div class="scorecard-table">
            <table>
              <thead><tr><th scope="col">Rival</th><th scope="col" class="numeric">W-L-T</th><th scope="col" class="numeric">Net MP</th><th scope="col">Costliest Boards</th></tr></thead>
              <tbody>${rivalRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h4>Opponents At Your Table</h4>
          <div class="scorecard-table">
            <table>
              <thead><tr><th scope="col">Opponents</th><th scope="col" class="numeric">Boards</th><th scope="col" class="numeric">Avg Board</th><th scope="col" class="numeric">Vs Session Avg</th></tr></thead>
              <tbody>${opponentRows}</tbody>
            </table>
          </div>
        </div>
      </div>
  `, "", { id: "rs-field", open: false });
}

const COLLIE_VARIANTS = 20;

// Deterministic per-advice pick: the coach's pose varies across cards but
// never flickers between renders of the same advice.
function collieVariant(seed) {
  const text = String(seed || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return String((hash % COLLIE_VARIANTS) + 1).padStart(2, "0");
}

function renderLossAdvice(advice) {
  return `
    <div class="loss-advice">
      <span class="collie-head" aria-hidden="true">
        <img src="${escapeHtml(assetUrl(`assets/collie-${collieVariant(advice)}.svg`))}" alt="" loading="lazy" decoding="async">
      </span>
      <p>${escapeHtml(advice)}</p>
    </div>
  `;
}

function renderLossPeerSummary(comparison) {
  const pair = comparison.peerPair == null || comparison.peerPair === "" ? "Peer" : `Pair ${comparison.peerPair}`;
  return `${pair} ${comparison.peerContract} (${formatSigned(comparison.peerScore)})`;
}

function renderLossExample(example) {
  const peerSummaries = example.comparisons.slice(0, 3).map(renderLossPeerSummary);
  const extra = example.comparisons.length > peerSummaries.length ? `; +${example.comparisons.length - peerSummaries.length} more` : "";
  const percent = example.targetPercent == null ? "" : `, ${example.targetPercent.toFixed(1)}%`;
  return `
    <li>
      <strong>${renderBoardJump(example.boardNo)}</strong>
      <span>Selected <span class="contract">${contractGlyphHtml(example.targetContract)}</span> (${escapeHtml(formatSigned(example.targetScore))}${escapeHtml(percent)}). Peers: ${contractGlyphHtml(peerSummaries.join("; "))}${escapeHtml(extra)}. Loss ${escapeHtml(formatMp(example.loss))} MP.</span>
    </li>
  `;
}

function renderReviewQueue(report) {
  const items = report.reviewItems.slice(3);
  if (!items.length) {
    return renderReportSubsection("priority-review", "Other Notable Boards", `
      <div class="empty-state">No additional notable boards found for this pair.</div>
    `, "", { open: false, id: "rs-more" });
  }
  const countNote = `<span class="subsection-note">${escapeHtml(plural(items.length, "more flagged board"))}</span>`;
  return renderReportSubsection("priority-review", "Other Notable Boards", `
      <div class="review-list">
        ${items.map(renderReviewItem).join("")}
      </div>
  `, countNote, { open: false, id: "rs-more" });
}

function renderReviewItem(item) {
  const row = item.row;
  const contractText = `${row.declarerSide || ""} ${row.contract || ""}${row.result || ""}`.trim();
  const role = item.declared ? "Declaring" : "Defending";
  const pctText = item.percent == null ? "n/a" : `${item.percent.toFixed(1)}%`;
  const mpText = item.matchpoints == null || row.boardTop == null ? "n/a" : `${item.matchpoints.toFixed(1)} / ${row.boardTop.toFixed(1)}`;
  const reasons = item.reasons.length ? item.reasons : [{ label: "review candidate", tone: "", weight: 0 }];
  const relTricks = item.relativeTrickDelta == null ? null : Math.round(item.relativeTrickDelta * 10) / 10;
  const ddText = relTricks == null ? "n/a" : `${formatSigned(relTricks)} trick${Math.abs(relTricks) === 1 ? "" : "s"}`;
  const lead = formatLeadHtml(row.leadCard);
  return `
    <article class="review-item">
      <div class="review-head">
        <strong>${renderBoardJump(row.boardNo)} - <span class="contract">${contractGlyphHtml(contractText || "No contract")}</span></strong>
        <span>${escapeHtml(role)} / ${escapeHtml(pctText)}</span>
      </div>
      <div class="reason-list">
        ${reasons.map((reason) => `<span class="reason-chip ${escapeHtml(reason.tone)}">${escapeHtml(reason.label)}</span>`).join("")}
      </div>
      <div class="review-stats">
        <div class="review-stat"><span>Your Score</span><strong>${escapeHtml(item.pairScore == null ? "n/a" : formatSigned(item.pairScore))}</strong></div>
        <div class="review-stat"><span>Matchpoints</span><strong>${escapeHtml(mpText)}</strong></div>
        <div class="review-stat"><span>Vs Field Avg</span><strong>${escapeHtml(item.fieldDelta == null ? "n/a" : formatSigned(Math.round(item.fieldDelta)))}</strong></div>
        <div class="review-stat"><span>Vs Par</span><strong>${escapeHtml(item.vsPar == null ? "n/a" : formatSigned(item.vsPar))}</strong></div>
        <div class="review-stat"><span>Tricks Vs Field</span><strong>${escapeHtml(ddText)}</strong></div>
        <div class="review-stat"><span>Makeable</span><strong class="contract">${contractGlyphHtml(item.bestMakeable.text || item.bestMakeable.className)}</strong></div>
        ${lead ? `<div class="review-stat"><span>Lead</span><strong>${lead}</strong></div>` : ""}
      </div>
      ${row.declarerName ? `<div class="cell-note">Declarer: ${escapeHtml(row.declarerName)}</div>` : ""}
    </article>
  `;
}

export {
  collieVariant,
  renderPairImprovementReport,
  renderReportSubsection,
  renderPracticeCards,
  renderThisWeek,
  sessionToneSentence,
  formatLeadHtml,
  renderLossThemes,
  renderProfileMetric,
  renderPairProfile,
  renderBiddingScorecard,
  renderDeclaredScorecard,
  renderDefendedScorecard,
  renderOvertrickMeter,
  renderFieldContext,
  renderTopReviewPriorities,
  renderConfidenceChip,
  formatResultPercent,
  formatSignedMp,
  renderLossAdvice,
  renderLossPeerSummary,
  renderLossExample,
  renderReviewQueue,
  renderReviewItem,
};
