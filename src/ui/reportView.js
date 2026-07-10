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
import { buildPairImprovementReport, decisionTypeInfoForCategory, peerDisplayName } from "../core/report.js";
import { defaultReportPair, rowContractText } from "../core/results.js";
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
    return;
  }

  const summary = report.summary;
  caption.textContent = `${summary.players || `Pair ${report.pairNo}`} - ${plural(summary.boards, "board")} reviewed.`;
  body.innerHTML = `
    <nav class="report-nav" aria-label="Report sections">
      <a href="#rs-summary">Summary</a>
      <a href="#rs-profile">Profile</a>
      <a href="#rs-themes">Loss Themes</a>
      <a href="#rs-boards">Boards To Review</a>
    </nav>
    <div class="report-summary-grid" id="rs-summary">
      <div class="result-summary-card"><strong>${escapeHtml(summary.percent == null ? "n/a" : `${summary.percent.toFixed(1)}%`)}</strong><span>Session</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(summary.averageBoardPercent == null ? "n/a" : `${summary.averageBoardPercent.toFixed(1)}%`)}</strong><span>Avg Board</span></div>
      <div class="result-summary-card"><strong class="term-tip"${tooltipAttrs("Matchpoints given up to same-direction peers: for each board, one MP per peer pair that beat this result and half an MP per tie.")}>${escapeHtml(formatMp(summary.lostMatchpoints))}</strong><span>Lost MP</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(summary.lossCategories)}</strong><span>Loss Themes</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(summary.lowBoards)}</strong><span>Low Boards</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(summary.averageVsPar == null ? "n/a" : formatSigned(Math.round(summary.averageVsPar)))}</strong><span>Avg Vs Par</span></div>
      <div class="result-summary-card"><strong>${escapeHtml(summary.trickLossBoards)}</strong><span>DD Trick Losses</span></div>
    </div>
    ${renderPairProfile(report)}
    ${renderLossThemes(report)}
    ${renderTopReviewPriorities(report)}
    ${renderSwingReview(report)}
    ${renderReviewQueue(report)}
  `;
  panel.classList.remove("hidden");
  annotateTermTooltips(panel);
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
  const totalLoss = ledger.totalLoss || sum(types.map((type) => type.totalLoss));
  const categoriesByType = new Map();
  (ledger.categories || []).forEach((category) => {
    const typeKey = decisionTypeInfoForCategory(category.key).key;
    if (!categoriesByType.has(typeKey)) categoriesByType.set(typeKey, []);
    categoriesByType.get(typeKey).push(category);
  });
  const summary = `
    <p>
      <span>${escapeHtml(formatMp(ledger.totalLoss))} lost MP across ${escapeHtml(plural(ledger.boardCount, "board"))}; ${escapeHtml(formatMp(ledger.outrightLoss))} from beaten comparisons and ${escapeHtml(formatMp(ledger.tieLoss))} from tie splits.</span>
    </p>
  `;
  const body = `
      <div class="decision-type-grid">
        ${types.map((type, index) => {
          const width = totalLoss ? (type.totalLoss / totalLoss) * 100 : 0;
          const basis = `${type.label}: ${formatMp(type.totalLoss)} of ${formatMp(totalLoss)} lost MP in this report (${width.toFixed(0)}%). One MP per beaten same-direction comparison, half per tie.`;
          const categories = categoriesByType.get(type.key) || [];
          return `
            <article class="decision-type-card ${escapeHtml(type.tone || "")}">
              <div class="decision-type-head">
                <div>
                  <strong>${term(type.label)}</strong>
                  <span>${escapeHtml(plural(type.boardCount, "board"))} / ${escapeHtml(plural(type.comparisonCount, "comparison"))}</span>
                </div>
                <b class="term-tip"${tooltipAttrs(basis)}>${escapeHtml(formatMp(type.totalLoss))} MP</b>
              </div>
              <div class="loss-bar" role="img" aria-label="${escapeHtml(basis)}"><span style="width:${width.toFixed(1)}%"></span></div>
              ${type.boards.length ? `<div class="cell-note">Boards: ${renderBoardJumpList(type.boards, 8)}</div>` : ""}
              ${renderLossAdvice(type.advice)}
              ${categories.length ? `
              <details class="theme-detail">
                <summary>${escapeHtml(plural(categories.length, "contributing pattern"))} with examples</summary>
                ${categories.map((category) => `
                  <div class="theme-category">
                    <div class="theme-category-head">
                      <strong>${term(category.label)}</strong>
                      <span>${escapeHtml(formatMp(category.totalLoss))} MP &middot; ${escapeHtml(plural(category.comparisonCount, "comparison"))}</span>
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
      ${renderLossAdvice(profile.focus)}
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
          return `
            <article class="priority-card">
              <div class="priority-rank">${escapeHtml(index + 1)}</div>
              <div class="priority-card-body">
                <div class="priority-card-head">
                  <strong>${renderBoardJump(row.boardNo)} - <span class="contract">${contractGlyphHtml(contractText)}</span></strong>
                  <span>${escapeHtml(item.declared ? "Declaring" : "Defending")} / ${escapeHtml(pctText)}</span>
                </div>
                <div class="reason-list">
                  ${item.reasons.slice(0, 3).map((reason) => `<span class="reason-chip ${escapeHtml(reason.tone)}">${escapeHtml(reason.label)}</span>`).join("")}
                  ${renderConfidenceChip(item.diagnosis.confidence)}
                </div>
                ${renderLossAdvice(item.diagnosis.explanation)}
                <div class="priority-mini-stats">
                  <span><b>${escapeHtml(mpText)}</b> MP</span>
                  <span><b>${escapeHtml(item.fieldDelta == null ? "n/a" : formatSigned(Math.round(item.fieldDelta)))}</b> field</span>
                  <span><b>${escapeHtml(item.vsPar == null ? "n/a" : formatSigned(item.vsPar))}</b> par</span>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
  `, "", { id: "rs-boards" });
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

function renderSwingReview(report) {
  const items = report.reviewItems
    .filter((item) => item.peerComparison && item.peerComparison.rows.length > 1)
    .slice(0, 5);
  if (!items.length) return "";
  return renderReportSubsection("swing-review", "Board Swing Explanation", `
      <div class="swing-card-list">
        ${items.map((item, index) => renderSwingCard(item, index)).join("")}
      </div>
  `, "", { open: false });
}

function renderSwingCard(item, index) {
  const row = item.row;
  const contractText = `${row.declarerSide || ""} ${row.contract || ""}${row.result || ""}`.trim() || "No contract";
  const mpText = item.matchpoints == null || row.boardTop == null ? "n/a" : `${item.matchpoints.toFixed(1)} / ${row.boardTop.toFixed(1)}`;
  const bestPeer = item.peerComparison ? item.peerComparison.rows.find((entry) => !entry.isTarget) : null;
  const peerCount = item.peerComparison ? item.peerComparison.peerCount : 0;
  return `
    <article class="swing-card">
      <div class="swing-card-head">
        <div>
          <h4>${renderBoardJump(row.boardNo)} - <span class="contract">${contractGlyphHtml(contractText)}</span></h4>
          <span>${escapeHtml(item.declared ? "Declaring" : "Defending")} ${escapeHtml(item.side)} / ${escapeHtml(formatResultPercent(item.percent))}</span>
        </div>
        ${renderConfidenceChip(item.diagnosis.confidence)}
      </div>
      <div class="swing-facts">
        <div class="review-stat"><span>Selected Score</span><strong>${escapeHtml(item.pairScore == null ? "n/a" : formatSigned(item.pairScore))}</strong></div>
        <div class="review-stat"><span>Matchpoints</span><strong>${escapeHtml(mpText)}</strong></div>
        <div class="review-stat"><span>Diagnosis</span><strong>${escapeHtml(item.diagnosis.categoryLabel)}</strong></div>
        <div class="review-stat"><span>Lost MP</span><strong>${escapeHtml(formatMp(item.mpLoss))}</strong></div>
      </div>
      ${bestPeer ? `
      <div class="swing-diff">
        <div class="swing-diff-row"><span>You</span><span class="contract">${contractGlyphHtml(rowContractText(row))}</span><b>${escapeHtml(item.pairScore == null ? "n/a" : formatSigned(item.pairScore))}</b></div>
        <div class="swing-diff-row"><span>Best peer</span><span class="contract">${contractGlyphHtml(bestPeer.contract)}</span><b>${escapeHtml(formatSigned(bestPeer.score))}</b><i>${escapeHtml(peerDisplayName(bestPeer.pairNo, bestPeer.players))}</i></div>
      </div>` : ""}
      ${renderLossAdvice(item.diagnosis.explanation)}
      <div class="swing-actions">${renderBoardJump(row.boardNo, `Open board ${row.boardNo} traveler (${peerCount} peer${peerCount === 1 ? "" : "s"})`)}</div>
    </article>
  `;
}

function renderLossAdvice(advice) {
  return `
    <div class="loss-advice">
      <span class="collie-head" aria-hidden="true">
        <img src="${escapeHtml(assetUrl("assets/bc-avatar.png"))}" alt="" loading="lazy" decoding="async">
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
      <span>Selected <span class="contract">${contractGlyphHtml(example.targetContract)}</span> (${escapeHtml(formatSigned(example.targetScore))}${escapeHtml(percent)}). Peers: <span class="contract">${contractGlyphHtml(peerSummaries.join("; "))}</span>${escapeHtml(extra)}. Loss ${escapeHtml(formatMp(example.loss))} MP.</span>
    </li>
  `;
}

function renderReviewQueue(report) {
  const items = report.reviewItems.slice(3);
  if (!items.length) {
    return renderReportSubsection("priority-review", "Other Notable Boards", `
      <div class="empty-state">No additional notable boards found for this pair.</div>
    `, "", { open: false });
  }
  return renderReportSubsection("priority-review", "Other Notable Boards", `
      <div class="review-list">
        ${items.map(renderReviewItem).join("")}
      </div>
  `, "", { open: false });
}

function renderReviewItem(item) {
  const row = item.row;
  const contractText = `${row.declarerSide || ""} ${row.contract || ""}${row.result || ""}`.trim();
  const role = item.declared ? "Declaring" : "Defending";
  const pctText = item.percent == null ? "n/a" : `${item.percent.toFixed(1)}%`;
  const mpText = item.matchpoints == null || row.boardTop == null ? "n/a" : `${item.matchpoints.toFixed(1)} / ${row.boardTop.toFixed(1)}`;
  const reasons = item.reasons.length ? item.reasons : [{ label: "review candidate", tone: "", weight: 0 }];
  const ddText = item.trickDeltaForPair == null ? "n/a" : `${formatSigned(item.trickDeltaForPair)} trick${Math.abs(item.trickDeltaForPair) === 1 ? "" : "s"}`;
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
        <div class="review-stat"><span>Pair Score</span><strong>${escapeHtml(item.pairScore == null ? "n/a" : formatSigned(item.pairScore))}</strong></div>
        <div class="review-stat"><span>Matchpoints</span><strong>${escapeHtml(mpText)}</strong></div>
        <div class="review-stat"><span>Vs Field Avg</span><strong>${escapeHtml(item.fieldDelta == null ? "n/a" : formatSigned(Math.round(item.fieldDelta)))}</strong></div>
        <div class="review-stat"><span>Vs Par</span><strong>${escapeHtml(item.vsPar == null ? "n/a" : formatSigned(item.vsPar))}</strong></div>
        <div class="review-stat"><span>DD Effect</span><strong>${escapeHtml(ddText)}</strong></div>
        <div class="review-stat"><span>Makeable</span><strong class="contract">${contractGlyphHtml(item.bestMakeable.text || item.bestMakeable.className)}</strong></div>
      </div>
      ${row.declarerName ? `<div class="cell-note">Declarer: ${escapeHtml(row.declarerName)}</div>` : ""}
    </article>
  `;
}

export {
  renderPairImprovementReport,
  renderReportSubsection,
  renderPracticeCards,
  renderLossThemes,
  renderProfileMetric,
  renderPairProfile,
  renderTopReviewPriorities,
  renderConfidenceChip,
  formatResultPercent,
  formatSignedMp,
  renderSwingReview,
  renderSwingCard,
  renderLossAdvice,
  renderLossPeerSummary,
  renderLossExample,
  renderReviewQueue,
  renderReviewItem,
};
