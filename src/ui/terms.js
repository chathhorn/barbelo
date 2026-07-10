// The glossary: term definitions, tooltip attributes, table-header and
// term markup helpers, and the tooltip runtime.
import { average, escapeHtml } from "../core/format.js";
import { col } from "./csvExport.js";

const TERM_DEFINITIONS = {
  "accepted results": "Traveler result rows that the BWS scanner recognized as usable played-board records.",
  "actual contract": "The contract actually played at the table, when the PBN or uploaded result file supplies it.",
  "actual declarer": "The player or seat that declared the actual contract in the PBN tags.",
  "actual result": "The number of tricks made or defeated for the actual contract.",
  "actual scores vs par": "Compares uploaded table scores with the PBN par score. Actual averages can be above or below par because par assumes optimal bidding and play.",
  "all ff pages": "Jet database pages filled with 0xFF bytes. Large runs can indicate erased, unused, or unreadable areas.",
  "avg abs par": "Average absolute distance from par, ignoring whether the result was above or below par.",
  "avg board": "The selected pair's average board percentage across its played boards.",
  "avg pair hcp": "Average high-card points for the North-South and East-West partnerships.",
  "avg result": "Average score from the uploaded traveler rows for that board.",
  "avg vs par": "Average difference between actual result scores and the PBN par score.",
  "average dd delta": "Average trick difference between actual play and double-dummy expectation.",
  "average hcp": "Average high-card points across the loaded boards.",
  "average ns score": "Average score from North-South's perspective across all results for the board.",
  "below field": "Boards where the selected pair scored materially below the field average.",
  "below average board": "A board below average for the selected pair, but not severe enough to be tagged as a low board.",
  "below par": "The pair's score was worse than the theoretical par score by a meaningful amount.",
  "best fit": "The longest combined partnership suit length.",
  "bidding judgment": "Auction decisions about level, strain, invites, signoffs, game tries, slam tries, and whether to stop or continue.",
  "board": "A deal number in the session. Each board has a dealer, vulnerability, four hands, and optional result data.",
  "board explorer": "The per-board browser for deals, par, double-dummy data, and traveler rows.",
  "board result summary": "One aggregate row per board, summarizing all uploaded traveler scores for that board.",
  "boards": "Loaded PBN boards, optionally filtered to boards that do or do not appear in uploaded results.",
  "bws": "Bridgemate result database file. The app scans it in-browser for traveler rows and player rows.",
  "bws import diagnostics": "Troubleshooting details from the in-browser Bridgemate BWS database scan.",
  "csv builder": "Configurable export tool for converting PBN and result analysis into CSV rows and columns.",
  "csv rows": "Rows read from a CSV result import.",
  "contract": "The final bridge contract: level, strain, and any doubled/redoubled state.",
  "contract class": "Broad contract category such as partscore, game-level, slam-level, passout, or unknown.",
  "contract selection": "Matchpoint losses where same-direction peers scored better by reaching a different contract.",
  "contract summary": "Most common contracts found in the traveler rows for a board.",
  "controls": "Quick honor-control count: aces count 2 and kings count 1.",
  "competitive auction": "Matchpoint losses where deciding whether to compete, defend, double, or sell out appears central to the score difference.",
  "competitive auctions": "Competitive bidding decisions such as balancing, competing, defending, doubling, or selling out.",
  "confidence": "How strongly the traveler evidence supports the app's diagnosis. High confidence usually means same-direction peers offer a close comparison.",
  "data pages": "Jet database pages that look like table data pages during the BWS scan.",
  "data quality": "Checks for missing tags, invalid deals, result mismatches, and import warnings.",
  "dd": "Double dummy: the theoretical result with all four hands visible and best play by both sides.",
  "dd effect": "For the selected pair, how many tricks were gained or lost relative to double-dummy expectation.",
  "dd exact": "Number of result rows where actual tricks matched the double-dummy trick estimate.",
  "dd trick losses": "Boards where the selected pair appears to have lost at least one trick versus double-dummy expectation.",
  "dealer": "The seat that opens the auction on the board.",
  "decl": "Declarer, abbreviated. This is the seat that played the contract.",
  "declarer": "The player or seat that plays the contract after winning the auction.",
  "declarer play": "Boards where the likely review focus is card play by declarer: timing, entries, safety plays, and overtricks.",
  "declarer tricks": "Matchpoint losses where same-direction peers in comparable declaring spots took more tricks.",
  "declarer trick loss vs dd": "The declaring side took one fewer trick than double-dummy analysis suggests was available.",
  "declarer pair": "The partnership, NS or EW, that declared the contract.",
  "defensive tricks": "Matchpoint losses where same-direction peers defended comparable contracts more successfully.",
  "defensive trick loss vs dd": "The defending side allowed one more trick than double-dummy analysis suggests was necessary.",
  "declarer score": "The contract score from declarer's perspective before converting to NS perspective.",
  "decision type summary": "Lost matchpoints grouped into broader bridge decision areas such as bidding judgment, declarer play, defense, and competitive auctions.",
  "defense": "Boards where the likely review focus is opening lead, signaling, shifts, cash-out timing, and defensive communication.",
  "denomination": "The contract strain: notrump, spades, hearts, diamonds, or clubs.",
  "distribution points": "Extra hand-value estimate from short suits, used as a rough distribution measure.",
  "double dummy": "Theoretical best-play analysis assuming all four hands are visible.",
  "double dummy trick checks": "Boards where actual tricks were below double-dummy expectation and should be replayed before checking best-play lines.",
  "duplicate results": "Repeated BWS rows for the same board/table/round result that were ignored.",
  "ew": "East-West partnership.",
  "ew boards": "Boards where the pair or partnership sat East-West in the uploaded results.",
  "ew known players": "Number of East-West player identities recovered from BWS PlayerNumbers rows.",
  "ew matchpoints": "Matchpoints awarded to East-West for the traveler row.",
  "ew percent": "East-West matchpoint score as a percentage of the board top.",
  "ew score": "Score from East-West's perspective. In NS-perspective fields this is the negative of the NS score.",
  "field avg": "Average score achieved by the field on the same board, from the selected pair's perspective.",
  "file size": "Size of the uploaded result file.",
  "form": "Small visual meter showing the pair's session percentage.",
  "competitive auction review": "The auction may be worth reviewing because the opponents reached or bought a strong contract.",
  "failed contract": "The declaring side did not take enough tricks to make its contract.",
  "failed doubled contract": "A doubled contract failed; these often create large score swings.",
  "far below field": "The pair scored much worse than the field average on that board.",
  "game available": "Whether double-dummy analysis says a game contract can be made.",
  "game-level": "A contract that reaches game bonus level: 3NT, 4H/4S, or 5C/5D.",
  "games": "Boards where the PBN par contract is classified as game-level.",
  "hand": "The cards held by one seat on a board.",
  "hcp": "High-card points: ace 4, king 3, queen 2, jack 1.",
  "hcp delta ns": "North-South HCP minus East-West HCP.",
  "hcp heat map": "Per-board high-card point intensity for each seat.",
  "header info": "PBN preamble directives and common tags found in the hand record.",
  "invalid row bounds": "A scanned Jet row pointer referred outside the usable page bounds, so the row slice was rejected.",
  "jet signature": "Header bytes that identify the file as a Microsoft Jet database, the format used by BWS files.",
  "known players": "Player identities recovered as names or member numbers, not generated placeholders.",
  "large matchpoint loss": "The pair lost at least half of the available matchpoints on that board.",
  "lead card": "Opening lead card recorded in the result file, when available.",
  "long suits": "Suits with seven or more cards in one hand.",
  "low board": "A board where the selected pair scored 35 percent or worse.",
  "low board triage": "A first-pass review of the selected pair's lowest-scoring boards to identify the initial auction, play, or defense swing.",
  "low boards": "Boards where the selected pair scored 35 percent or worse.",
  "loss themes": "Number of matchpoint-loss categories found in the selected pair's same-direction comparison ledger.",
  "lost mp": "Matchpoints not won against same-direction peers on boards the selected pair played.",
  "major fit": "Best combined partnership length in spades or hearts.",
  "makeable": "A contract or trick count that can be achieved with best play.",
  "makeable level": "Contract level implied by double-dummy tricks, such as 4 when ten tricks are available.",
  "manual review": "A comparison with a real matchpoint loss where the app could not confidently assign a narrower cause.",
  "maintain the baseline": "No dominant loss pattern was found; use the report to preserve strengths and identify smaller recurring edges.",
  "matchpoints": "Duplicate scoring points earned by comparing a result against other results on the same board.",
  "loss bar": "In the matchpoint loss ledger, each bar shows that category's share of the selected pair's total lost MP. It is a percentage of lost matchpoints, not a board or session percentage.",
  "matchpoint loss ledger": "A breakdown of the selected pair's lost matchpoints by comparing each board with same-direction peer results.",
  "missed game/slam": "Matchpoint losses where same-direction peers reached a game or slam bonus that the selected pair did not.",
  "minor fit": "Best combined partnership length in diamonds or clubs.",
  "mp": "Matchpoints. Higher is better; a board top is the maximum available on that board.",
  "multiple trick loss vs dd": "The selected pair appears to have lost two or more tricks relative to double-dummy expectation.",
  "named players": "Player rows where the BWS file supplied an actual name.",
  "no edge": "No clear par-score advantage, or the advantage could not be determined.",
  "notable boards": "Outlier deals worth a quick look, such as large par swings, slams, voids, or unusual HCP imbalance.",
  "ns": "North-South partnership.",
  "ns boards": "Boards where the pair or partnership sat North-South in the uploaded results.",
  "ns known players": "Number of North-South player identities recovered from BWS PlayerNumbers rows.",
  "ns matchpoints": "Matchpoints awarded to North-South for the traveler row.",
  "ns percent": "North-South matchpoint score as a percentage of the board top.",
  "ns score": "Score from North-South's perspective. Positive favors NS; negative favors EW.",
  "nt": "No-trump: a contract strain with no trump suit.",
  "optimum": "Best theoretical score for the deal, usually derived from PBN par or double-dummy data.",
  "optimum score": "The PBN score for best theoretical play and bidding on the board.",
  "optimum side": "The side, NS or EW, favored by the optimum score.",
  "other notable boards": "Additional boards worth reviewing after the highest-priority boards have been separated out.",
  "overreach": "Matchpoint losses where the selected pair appears to have bid too high, sacrificed too expensively, or declared a contract that same-direction peers avoided.",
  "page size": "Jet database page size tested during the BWS scan.",
  "pages": "Candidate Jet database pages scanned inside the BWS file.",
  "pair": "A bridge partnership, usually the two players sitting NS or EW for a board.",
  "pair ew": "The East-West pair number in the result row.",
  "pair hcp": "Combined high-card points for a partnership.",
  "pair improvement report": "A prioritized review list for one pair, based on matchpoint losses, field results, par, and double-dummy comparison.",
  "pair profile": "A compact strength and weakness summary for the selected pair based on board percentages and loss categories.",
  "pair ns": "The North-South pair number in the result row.",
  "pair score": "The selected pair's score on that board, shown from that pair's perspective.",
  "pair standings": "Session ranking by total matchpoints and percentage.",
  "par": "The theoretical best contract and score if both sides bid and play optimally.",
  "par class": "Par contract category: partscore, game-level, slam-level, or unknown.",
  "par contract": "The contract or contracts that produce the theoretical par result.",
  "par edge": "Which side is favored by the par score.",
  "par level": "The level of the par contract, such as 3, 4, or 6.",
  "par score by board": "The PBN par score for each board from North-South's perspective.",
  "par side": "The side, NS or EW, that can achieve the par contract.",
  "par strain": "The denomination of the par contract: NT, spades, hearts, diamonds, or clubs.",
  "par strains": "Distribution of par-contract denominations across the file.",
  "partscore": "A contract below game level.",
  "partscore battle": "Matchpoint losses in small-score competitive or overtrick situations below game level.",
  "passout": "A board where all players pass and no contract is played.",
  "pbn": "Portable Bridge Notation, a text format for bridge deals and related tags.",
  "pbn match": "A compatibility score estimating whether the uploaded results file appears to belong with the loaded PBN.",
  "penalty double decisions": "Matchpoint losses involving doubled contracts, sacrifices, penalty opportunities, or large set decisions.",
  "pct": "Percentage of available matchpoints earned.",
  "percent": "Percentage of available matchpoints earned.",
  "played in results": "Only boards that appear in the uploaded result file.",
  "player rows": "BWS PlayerNumbers rows used to recover player names, member numbers, seats, and tables.",
  "players": "Recovered names, member numbers, or generated placeholders for a partnership.",
  "practice priorities": "A short improvement plan based on the selected pair's largest matchpoint-loss patterns.",
  "rank": "Position in the pair standings after sorting by percentage.",
  "recognized jet": "Whether the file header looks like a Microsoft Jet database.",
  "recognized results": "CSV rows that contained enough result fields to import.",
  "record index": "The board record's position in the PBN file.",
  "rejected row slices": "Scanned byte ranges that did not match the expected BWS result-row layout.",
  "review candidate": "A board worth reviewing because one or more indicators suggest avoidable matchpoint loss.",
  "result": "Trick outcome for the contract, such as making exactly, plus overtricks, or down tricks.",
  "result file": "Uploaded BWS or CSV traveler data that can be joined to the PBN hands.",
  "result contracts": "Count of uploaded traveler contracts grouped by contract class.",
  "result count": "Number of uploaded result rows for a board.",
  "result rows": "Traveler rows imported from BWS or CSV, usually one table result per board.",
  "results": "Uploaded traveler results or played-result tags found in the PBN.",
  "row slices": "Candidate row-sized byte ranges scanned inside Jet database pages.",
  "row slots": "Potential row locations identified inside scanned Jet data pages.",
  "rows": "The CSV export grain: whether each row represents a board, hand, pair, traveler result, or summary.",
  "section": "Result-file section number, when supplied by the scoring system.",
  "selected page size": "Jet page size chosen by the BWS scanner because it produced the best-looking rows.",
  "session": "The selected pair's overall matchpoint percentage in the uploaded results.",
  "shape": "Suit lengths in spades-hearts-diamonds-clubs order, such as 4-4-3-2.",
  "same direction": "Other pairs who sat the same way, North-South or East-West, on the same board.",
  "same-direction peer comparison": "A traveler comparison against other pairs who played the same board in the same direction.",
  "slam-level": "A contract at level 6 or 7.",
  "slam potential": "Double-dummy analysis suggests a slam may have been available, but the table result did not reach it.",
  "small loss": "A modest below-average board with no single stronger diagnostic reason.",
  "small edges": "Thin matchpoint gains from overtricks, extra undertricks, partscore judgment, and avoiding tied comparisons.",
  "swing explanation": "A short explanation of why one board produced a meaningful matchpoint difference against same-direction peers.",
  "board swing explanation": "Board-by-board explanations of meaningful matchpoint swings, using same-direction peer comparisons where available.",
  "tail": "Trailing bytes at the end of the file after dividing it into candidate Jet pages.",
  "table": "Physical table number for a result row.",
  "tag": "A bracketed PBN field such as Event, Dealer, Deal, or Vulnerable.",
  "tag types": "Distinct PBN tag names found across the loaded records.",
  "top": "Board top: the maximum matchpoints available to one side on that board.",
  "top boards to review": "The highest-priority boards for the selected pair based on severity, matchpoint loss, and diagnostic clues.",
  "top ew pairs": "East-West pairs with the best score on a board.",
  "top ns pairs": "North-South pairs with the best score on a board.",
  "traveler": "The set of table results for a board.",
  "travelers": "Uploaded result rows for a board.",
  "tricks": "Number of tricks taken or available.",
  "tie splits": "Half-matchpoint losses from tying a same-direction peer instead of beating that score.",
  "valid deal": "Whether the deal contains exactly 52 unique cards.",
  "voids": "Suits where a hand has zero cards.",
  "vulnerability": "The scoring condition that increases game/slam bonuses and undertrick penalties.",
  "vulnerable": "Which side, if any, is vulnerable on the board.",
  "vs field avg": "Difference between the selected pair's score and the board's field average.",
  "vs par": "Difference between an actual result and the theoretical par score.",
  "well below par": "The pair's score was far worse than the theoretical par score.",
  "wrong strain": "Matchpoint losses where same-direction peers scored better in a different denomination.",
  "wrong row type or short": "A rejected BWS row slice that was not the expected table row type or was too short to parse.",
  "unknown": "A value the app could not recover, parse, or classify confidently from the loaded file."
};

const TERM_ALIASES = {
  "accepted rows": "accepted results",
  "average board percent": "avg board",
  "average score": "avg result",
  "average vs par": "avg vs par",
  "avg abs vs par": "avg abs par",
  "avg field": "field avg",
  "avg ns plus": "average ns score",
  "avg ns minus": "average ns score",
  "board top": "top",
  "dd delta": "dd effect",
  "dd tricks": "double dummy",
  "double dummy tricks": "double dummy",
  "ew mp": "ew matchpoints",
  "ew partnership": "pair ew",
  "ew players": "players",
  "ew score": "ns score",
  "ew score perspective": "ew score",
  "game level": "game-level",
  "hcp delta": "hcp delta ns",
  "missed game slam": "missed game/slam",
  "no trump": "nt",
  "notrump": "nt",
  "ns ew": "declarer",
  "ns mp": "ns matchpoints",
  "ns partnership": "pair ns",
  "ns players": "players",
  "pair results": "pair standings",
  "pass out": "passout",
  "passed out": "passout",
  "pbn par contract": "par contract",
  "pbn par ns score": "par",
  "player": "players",
  "results file": "result file",
  "row id": "result rows",
  "scored count": "result count",
  "scored rows": "result rows",
  "selected page profile": "selected page size",
  "slam level": "slam-level",
  "source": "result file",
  "top received data rejections": "rejected row slices",
  "tricks taken": "tricks"
};

function normalizeTerm(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_/-]+/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function termKey(value) {
  const normalized = normalizeTerm(value);
  if (!normalized) return "";
  if (TERM_DEFINITIONS[normalized]) return normalized;
  if (TERM_ALIASES[normalized]) return TERM_ALIASES[normalized];
  const withoutPbn = normalized.replace(/^pbn\s+/, "");
  if (TERM_DEFINITIONS[withoutPbn]) return withoutPbn;
  if (normalized.startsWith("tag ")) return "tag";
  if (normalized.startsWith("dd ")) return "double dummy";
  if (normalized.includes("matchpoint") || normalized.endsWith(" mp")) return "matchpoints";
  if (normalized.includes("percent") || normalized === "pct") return "percent";
  if (normalized.includes("vs par")) return "vs par";
  if (normalized.includes("hcp")) return "hcp";
  if (normalized.includes("vulnerab")) return "vulnerability";
  if (normalized.includes("declarer")) return "declarer";
  if (normalized.includes("contract")) return normalized.includes("par") ? "par contract" : "contract";
  if (normalized.includes("player")) return "players";
  if (normalized.includes("pair")) return "pair";
  if (normalized.includes("score")) return "ns score";
  if (normalized.includes("trick")) return "tricks";
  if (normalized.includes("board")) return "board";
  return "";
}

function termDefinition(value) {
  const key = termKey(value);
  return key ? TERM_DEFINITIONS[key] || "" : "";
}

function tooltipAttrs(definition) {
  if (!definition) return "";
  return ` data-tooltip="${escapeHtml(definition)}" aria-describedby="termTooltip" tabindex="0"`;
}

function term(value, definition) {
  const text = String(value == null ? "" : value);
  const help = definition || termDefinition(text);
  return help ? `<span class="term-tip"${tooltipAttrs(help)}>${escapeHtml(text)}</span>` : escapeHtml(text);
}

function th(label, className, definition) {
  const help = definition || termDefinition(label);
  const classes = [className || "", help ? "term-tip" : ""].filter(Boolean).join(" ");
  return `<th scope="col"${classes ? ` class="${escapeHtml(classes)}"` : ""}${tooltipAttrs(help)}>${escapeHtml(label)}</th>`;
}

function annotateTermTooltips(root) {
  if (!root) return;
  const noisySelector = [
    "h2.term-tip",
    "h3.term-tip",
    "label.term-tip",
    ".metric .label.term-tip",
    ".count-tile span.term-tip",
    ".side-chip.term-tip",
    ".legend-item.term-tip"
  ].join(",");
  root.querySelectorAll(noisySelector).forEach((element) => {
    element.classList.remove("term-tip");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("aria-describedby");
    if (element.getAttribute("tabindex") === "0") element.removeAttribute("tabindex");
  });
  const selector = [
    "th",
    ".metadata-item .key",
    ".result-summary-card span",
    ".board-stat span",
    ".review-stat span",
    ".contract-chip",
    ".reason-chip"
  ].join(",");
  root.querySelectorAll(selector).forEach((element) => {
    if (element.hasAttribute("data-tooltip") || element.querySelector("[data-tooltip]")) return;
    const text = element.textContent.trim();
    if (!text || text.length > 80) return;
    const help = termDefinition(text);
    if (!help) return;
    element.classList.add("term-tip");
    element.setAttribute("data-tooltip", help);
    element.setAttribute("aria-describedby", "termTooltip");
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
  });
}

function setTermElementText(element, text) {
  if (!element) return;
  element.textContent = text;
  const help = termDefinition(text);
  const heading = ["H1", "H2", "H3", "LABEL"].includes(element.tagName);
  if (heading) {
    element.classList.remove("term-tip");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("aria-describedby");
    element.removeAttribute("tabindex");
    return;
  }
  element.classList.toggle("term-tip", !!help);
  if (help) {
    element.setAttribute("data-tooltip", help);
    element.setAttribute("aria-describedby", "termTooltip");
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
  } else {
    element.removeAttribute("data-tooltip");
    element.removeAttribute("aria-describedby");
    element.removeAttribute("tabindex");
  }
}

function positionTooltip(tooltip, target) {
  const rect = target.getBoundingClientRect();
  tooltip.classList.remove("hidden");
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 12;
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  let top = rect.bottom + 8;
  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - tooltipRect.height - 8);
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function setupTooltips() {
  const tooltip = document.getElementById("termTooltip");
  if (!tooltip) return;
  let activeTarget = null;

  const show = (target) => {
    const text = target && target.getAttribute("data-tooltip");
    if (!text) return;
    activeTarget = target;
    tooltip.textContent = text;
    positionTooltip(tooltip, target);
  };

  const hide = (target) => {
    if (target && activeTarget && target !== activeTarget) return;
    activeTarget = null;
    tooltip.classList.add("hidden");
  };

  document.addEventListener("mouseover", (event) => {
    const target = event.target.closest("[data-tooltip]");
    if (target) show(target);
  });

  document.addEventListener("mouseout", (event) => {
    const target = event.target.closest("[data-tooltip]");
    if (!target || target.contains(event.relatedTarget)) return;
    hide(target);
  });

  document.addEventListener("focusin", (event) => {
    const target = event.target.closest("[data-tooltip]");
    if (target) show(target);
  });

  document.addEventListener("focusout", (event) => {
    const target = event.target.closest("[data-tooltip]");
    if (target) hide(target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeTarget) {
      activeTarget = null;
      tooltip.classList.add("hidden");
    }
  });

  tooltip.addEventListener("mouseleave", () => {
    activeTarget = null;
    tooltip.classList.add("hidden");
  });

  window.addEventListener("scroll", () => {
    if (activeTarget) positionTooltip(tooltip, activeTarget);
  }, true);
  window.addEventListener("resize", () => {
    if (activeTarget) positionTooltip(tooltip, activeTarget);
  });
}

export {
  TERM_DEFINITIONS,
  TERM_ALIASES,
  normalizeTerm,
  termKey,
  termDefinition,
  tooltipAttrs,
  term,
  th,
  annotateTermTooltips,
  setTermElementText,
  positionTooltip,
  setupTooltips,
};
