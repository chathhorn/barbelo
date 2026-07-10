(function () {
  "use strict";

  // Static bridge vocabulary, glossary content, and app-wide state.
  const SEATS = ["N", "E", "S", "W"];
  const PAIRS = { N: "NS", S: "NS", E: "EW", W: "EW" };
  const SUITS = [
    { key: "S", label: "Spades", short: "S", html: "&spades;", className: "spade" },
    { key: "H", label: "Hearts", short: "H", html: "&hearts;", className: "heart" },
    { key: "D", label: "Diamonds", short: "D", html: "&diams;", className: "diamond" },
    { key: "C", label: "Clubs", short: "C", html: "&clubs;", className: "club" }
  ];
  const DENOMS = [
    { key: "N", label: "NT", color: "#2457a6" },
    { key: "S", label: "Spades", color: "#1d2b3a" },
    { key: "H", label: "Hearts", color: "#bb3f45" },
    { key: "D", label: "Diamonds", color: "#d08a20" },
    { key: "C", label: "Clubs", color: "#0f7b6c" }
  ];
  const RANK_ORDER = "AKQJT98765432";
  const HCP_VALUE = { A: 4, K: 3, Q: 2, J: 1 };
  const PARSER_ROOT = typeof window !== "undefined" ? window : globalThis;
  const PBN_PARSER = PARSER_ROOT.BarbeloPbnParser || {};
  const BWS_PARSER = PARSER_ROOT.BarbeloBwsParser || {};
  const {
    parsePbn,
    parseDeal,
    parseOptimumScore,
    parseParContracts,
    parseOptimumRows,
    parseDoubleDummyTricks,
    classifyContract
  } = PBN_PARSER;
  const {
    parseBwsBuffer,
    parseResultsCsv
  } = BWS_PARSER;
  const LOSS_CATEGORY_INFO = {
    declarerTricks: {
      label: "Declarer Tricks",
      tone: "gold",
      advice: "Review card play, timing, safety plays, and overtrick chances in contracts your side also declared."
    },
    defensiveTricks: {
      label: "Defensive Tricks",
      tone: "gold",
      advice: "Review opening lead, signaling, shifts, and cash-out decisions on boards your side defended."
    },
    contractSelection: {
      label: "Contract Selection",
      tone: "gold",
      advice: "Compare the auction with peers who reached a better-scoring contract; focus on level, strain, and stopping decisions."
    },
    missedGameSlam: {
      label: "Missed Game/Slam",
      tone: "red",
      advice: "Review game tries, slam tries, invites, and acceptance decisions where peers reached a bonus contract."
    },
    overreach: {
      label: "Overreach",
      tone: "red",
      advice: "Look for auctions where passing, signing off, or defending would have protected the score."
    },
    wrongStrain: {
      label: "Wrong Strain",
      tone: "gold",
      advice: "Compare why peers found a better strain, especially NT versus major/minor and major-fit choices."
    },
    penaltyDouble: {
      label: "Penalty / Double Decisions",
      tone: "red",
      advice: "Review penalty doubles, redoubles, sacrifice judgment, and opportunities to collect a larger set."
    },
    partscoreBattle: {
      label: "Partscore Battle",
      tone: "",
      advice: "Focus on competitive bidding, partscore protection, and small-score overtricks."
    },
    competitiveAuction: {
      label: "Competitive Auction",
      tone: "gold",
      advice: "Review whether to compete, defend, double, or sell out when peers won the auction more profitably."
    },
    tieSplit: {
      label: "Tie Splits",
      tone: "",
      advice: "These are shared results; look for small overtricks or partscore edges needed to turn shared boards into tops."
    },
    outlier: {
      label: "Manual Review",
      tone: "",
      advice: "The score swing is real, but the simple heuristics do not identify one clear cause."
    }
  };
  const LOSS_CATEGORY_ORDER = [
    "missedGameSlam",
    "overreach",
    "penaltyDouble",
    "declarerTricks",
    "defensiveTricks",
    "wrongStrain",
    "contractSelection",
    "competitiveAuction",
    "partscoreBattle",
    "tieSplit",
    "outlier"
  ];
  const DECISION_TYPE_INFO = {
    biddingJudgment: {
      label: "Bidding Judgment",
      tone: "gold",
      categories: ["missedGameSlam", "overreach", "wrongStrain", "contractSelection"],
      advice: "Use these boards for auction review: level, strain, invitation, signoff, and partnership agreement decisions are the likely swing points."
    },
    declarerPlay: {
      label: "Declarer Play",
      tone: "gold",
      categories: ["declarerTricks"],
      advice: "Replay the contract card by card before checking double-dummy; look for timing, entries, safety plays, and overtrick chances."
    },
    defense: {
      label: "Defense",
      tone: "gold",
      categories: ["defensiveTricks"],
      advice: "Review opening lead, count signals, suit preference, shifts, and cash-out timing against the traveler contracts."
    },
    competitiveAuction: {
      label: "Competitive Auctions",
      tone: "gold",
      categories: ["competitiveAuction", "partscoreBattle"],
      advice: "Focus on vulnerability, total-tricks judgment, balancing, selling out, and whether competing protected or damaged the score."
    },
    penaltyDouble: {
      label: "Penalty / Double Decisions",
      tone: "red",
      categories: ["penaltyDouble"],
      advice: "Review doubles, redoubles, sacrifices, and penalty passes as separate decisions; these boards often swing more than one normal partscore."
    },
    smallEdges: {
      label: "Small Edges",
      tone: "",
      categories: ["tieSplit"],
      advice: "Tied comparisons point to thin overtricks, extra undertricks, and partscore details that convert shared boards into above-average scores."
    },
    manualReview: {
      label: "Manual Review",
      tone: "",
      categories: ["outlier"],
      advice: "The score loss is real, but the app cannot identify a single cause from the traveler alone; compare the auction and play record manually."
    }
  };
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

  const STATE = {
    parsed: null,
    analysis: null,
    rawResults: null,
    results: null,
    reportPair: "",
    activeView: "overview",
    selectedBoardNo: "",
    scoreOutliersOnly: false,
    rowMode: "boards",
    selectedColumns: new Set(),
    filters: {
      search: "",
      side: "all",
      className: "all",
      vulnerability: "all",
      played: "all"
    }
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function deployedVersion() {
    const meta = document.querySelector('meta[name="barbelo-version"]');
    const version = meta ? meta.getAttribute("content") || "" : "";
    return version && !version.includes("__") ? version : "";
  }

  function assetUrl(path) {
    const version = deployedVersion();
    if (!version) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}v=${encodeURIComponent(version)}`;
  }

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
    return `<th${classes ? ` class="${escapeHtml(classes)}"` : ""}${tooltipAttrs(help)}>${escapeHtml(label)}</th>`;
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

  const CONTRACT_TOKEN_RE = /([1-7])\s?(NT|[SHDCN])\s?(XX|X)?(?![A-Za-z])/g;

  function contractGlyphHtml(text) {
    const escaped = escapeHtml(String(text == null ? "" : text));
    return escaped.replace(CONTRACT_TOKEN_RE, (match, level, strain, doubled) => {
      const suit = strain === "NT" || strain === "N" ? null : SUITS.find((entry) => entry.key === strain);
      const strainHtml = suit ? `<span class="suit-glyph ${suit.className}">${suit.html}</span>` : "NT";
      const doubledHtml = doubled ? `<span class="dbl">${doubled === "XX" ? "&times;&times;" : "&times;"}</span>` : "";
      return `${level}${strainHtml}${doubledHtml}`;
    });
  }

  function formatSigned(value) {
    if (value == null || Number.isNaN(value)) return "";
    return value > 0 ? `+${value}` : String(value);
  }

  function formatMp(value) {
    if (value == null || Number.isNaN(value)) return "n/a";
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function plural(value, singular, pluralText) {
    return `${value} ${value === 1 ? singular : pluralText || `${singular}s`}`;
  }

  function sum(values) {
    return values.reduce((acc, value) => acc + value, 0);
  }

  function average(values) {
    return values.length ? sum(values) / values.length : 0;
  }

  function safeNumber(value) {
    if (value == null) return null;
    if (typeof value === "string" && !value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }

  function directiveMap(directives) {
    const map = new Map();
    directives.forEach((directive) => {
      if (!map.has(directive.key)) map.set(directive.key, []);
      map.get(directive.key).push(directive.value);
    });
    return map;
  }

  function firstDirective(analysis, keys) {
    const map = analysis.directiveMap;
    for (const key of keys) {
      const values = map.get(key);
      if (values && values.length) return values[0];
    }
    return "";
  }

  function normalizeSuitHolding(value) {
    const text = String(value == null ? "" : value).trim().toUpperCase();
    return text === "-" ? "" : text;
  }

  function sortHolding(holding) {
    return normalizeSuitHolding(holding)
      .split("")
      .filter(Boolean)
      .sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
      .join("");
  }

  function analyzeHand(hand) {
    const normalized = {};
    SUITS.forEach((suit) => {
      normalized[suit.key] = sortHolding(hand && hand[suit.key]);
    });

    const lengths = {};
    const hcpBySuit = {};
    let hcp = 0;
    let controls = 0;
    let distributionPoints = 0;

    SUITS.forEach((suit) => {
      const holding = normalized[suit.key];
      lengths[suit.key] = holding.length;
      hcpBySuit[suit.key] = 0;
      holding.split("").forEach((rank) => {
        const points = HCP_VALUE[rank] || 0;
        hcp += points;
        hcpBySuit[suit.key] += points;
        if (rank === "A") controls += 2;
        if (rank === "K") controls += 1;
      });
      if (holding.length === 0) distributionPoints += 3;
      if (holding.length === 1) distributionPoints += 2;
      if (holding.length === 2) distributionPoints += 1;
    });

    const shape = SUITS.map((suit) => lengths[suit.key]).join("-");
    const longest = SUITS
      .map((suit) => ({ suit: suit.key, length: lengths[suit.key] }))
      .sort((a, b) => b.length - a.length || SUITS.findIndex((suit) => suit.key === a.suit) - SUITS.findIndex((suit) => suit.key === b.suit))[0];
    const voids = SUITS.filter((suit) => lengths[suit.key] === 0).map((suit) => suit.key);
    const singletons = SUITS.filter((suit) => lengths[suit.key] === 1).map((suit) => suit.key);
    const display = SUITS.map((suit) => normalized[suit.key] || "-").join(".");

    return {
      cards: normalized,
      lengths,
      hcp,
      hcpBySuit,
      controls,
      distributionPoints,
      shape,
      longestSuit: longest ? longest.suit : "",
      longestLength: longest ? longest.length : 0,
      voids,
      singletons,
      display
    };
  }

  function combinePairStats(hands, pair) {
    const seats = pair === "NS" ? ["N", "S"] : ["E", "W"];
    const lengths = {};
    const holdings = {};
    SUITS.forEach((suit) => {
      holdings[suit.key] = seats.map((seat) => hands[seat] ? hands[seat].cards[suit.key] : "").join("");
      lengths[suit.key] = holdings[suit.key].length;
    });

    const bestFit = SUITS
      .map((suit) => ({ suit: suit.key, length: lengths[suit.key] }))
      .sort((a, b) => b.length - a.length || SUITS.findIndex((suit) => suit.key === a.suit) - SUITS.findIndex((suit) => suit.key === b.suit))[0];

    return {
      pair,
      seats,
      hcp: seats.reduce((acc, seat) => acc + (hands[seat] ? hands[seat].hcp : 0), 0),
      lengths,
      holdings,
      bestFitSuit: bestFit ? bestFit.suit : "",
      bestFitLength: bestFit ? bestFit.length : 0,
      majorFit: Math.max(lengths.S || 0, lengths.H || 0),
      minorFit: Math.max(lengths.D || 0, lengths.C || 0)
    };
  }

  function normalizeVulnerability(value) {
    const text = String(value || "").trim();
    if (/^(none|love)$/i.test(text) || text === "-") return "None";
    if (/^(all|both)$/i.test(text)) return "All";
    if (/^n-?s$/i.test(text)) return "NS";
    if (/^e-?w$/i.test(text)) return "EW";
    return "";
  }

  function standardDealer(boardNo) {
    const board = Number(boardNo);
    if (!Number.isFinite(board) || board < 1) return "";
    return SEATS[(board - 1) % 4];
  }

  function standardVulnerability(boardNo) {
    const cycle = ["None", "NS", "EW", "All", "NS", "EW", "All", "None", "EW", "All", "None", "NS", "All", "None", "NS", "EW"];
    const board = Number(boardNo);
    if (!Number.isFinite(board) || board < 1) return "";
    return cycle[(board - 1) % cycle.length];
  }

  function fallbackResultBoard(boardNo) {
    return {
      boardNo,
      dealer: standardDealer(boardNo),
      vulnerable: standardVulnerability(boardNo),
      tags: {},
      optimum: { nsPerspective: null, edge: "Flat", pair: "", side: "" },
      optimumRows: [],
      className: "Unknown",
      issues: []
    };
  }

  function getDoubleDummyTricks(board, declarer, denomination) {
    const row = board.optimumRows.find((entry) => entry.declarer === declarer && entry.denomination === denomination);
    return row ? row.tricks : "";
  }

  function normalizeBoard(record, index) {
    const tags = record.tags;
    const boardNo = safeNumber(tags.Board) || index + 1;
    const dealerTag = String(tags.Dealer || "").toUpperCase();
    const dealer = SEATS.includes(dealerTag) ? dealerTag : standardDealer(boardNo);
    const vulnerable = normalizeVulnerability(tags.Vulnerable) || standardVulnerability(boardNo);
    const deal = parseDeal(tags.Deal);
    const hands = {};
    SEATS.forEach((seat) => {
      hands[seat] = analyzeHand(deal.hands[seat]);
    });
    const pairs = {
      NS: combinePairStats(hands, "NS"),
      EW: combinePairStats(hands, "EW")
    };
    const parContracts = parseParContracts(tags.ParContract);
    const primaryPar = parContracts[0] || null;
    const optimum = parseOptimumScore(tags.OptimumScore);
    const optimumRows = parseOptimumRows(record.sections.OptimumResultTable);
    const doubleDummyRows = optimumRows.length ? optimumRows : parseDoubleDummyTricks(tags.DoubleDummyTricks);
    const voids = [];
    const longSuits = [];

    if (deal.valid) {
      SEATS.forEach((seat) => {
        hands[seat].voids.forEach((suit) => voids.push(`${seat} ${suit}`));
        if (hands[seat].longestLength >= 7) longSuits.push(`${seat} ${hands[seat].longestLength}${hands[seat].longestSuit}`);
      });
    }

    const issues = [...deal.issues];
    if (!tags.Deal) issues.push("No deal to analyze");
    if (!tags.ParContract) issues.push("No par contract");
    if (!tags.OptimumScore) issues.push("No optimum score");

    return {
      index,
      record,
      tags,
      boardNo,
      dealer,
      vulnerable,
      deal,
      hands,
      pairs,
      hcpNS: pairs.NS.hcp,
      hcpEW: pairs.EW.hcp,
      hcpDeltaNS: pairs.NS.hcp - pairs.EW.hcp,
      parContracts,
      primaryPar,
      optimum,
      optimumRows: doubleDummyRows,
      voids,
      longSuits,
      issues,
      validDeal: deal.valid,
      className: primaryPar ? primaryPar.className : "Unknown"
    };
  }

  function countBy(values) {
    const counts = {};
    values.forEach((value) => {
      const key = value || "Unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function buildAnalysis(parsed) {
    const boards = parsed.records.map((record, index) => normalizeBoard(record, index));
    const tags = uniqueSorted(parsed.records.flatMap((record) => Object.keys(record.tags)));
    const map = directiveMap(parsed.directives);
    const parContractPieces = boards.flatMap((board) => board.parContracts);
    const validDeals = boards.filter((board) => board.validDeal).length;
    const boardsWithActualResults = boards.filter((board) => board.tags.Contract || board.tags.Declarer || board.tags.Result).length;
    const nsPerspectiveScores = boards.map((board) => board.optimum.nsPerspective).filter((value) => value != null);
    const largestScores = [...boards]
      .filter((board) => board.optimum.nsPerspective != null)
      .sort((a, b) => Math.abs(b.optimum.nsPerspective) - Math.abs(a.optimum.nsPerspective))
      .slice(0, 5);

    const summary = {
      boardCount: boards.length,
      validDeals,
      invalidDeals: boards.length - validDeals,
      dealers: countBy(boards.map((board) => board.dealer)),
      vulnerabilities: countBy(boards.map((board) => board.vulnerable)),
      parEdges: countBy(boards.map((board) => board.optimum.edge)),
      parContractSides: countBy(parContractPieces.map((contract) => contract.pair || contract.side)),
      classes: countBy(boards.map((board) => board.className)),
      levels: countBy(parContractPieces.map((contract) => contract.level ? String(contract.level) : "")),
      strains: countBy(parContractPieces.map((contract) => contract.strain)),
      boardsWithActualResults,
      boardsMissingActualResults: boards.length - boardsWithActualResults,
      averageHcpBySeat: Object.fromEntries(SEATS.map((seat) => [seat, average(boards.map((board) => board.hands[seat].hcp))])),
      averageHcpByPair: {
        NS: average(boards.map((board) => board.hcpNS)),
        EW: average(boards.map((board) => board.hcpEW))
      },
      maxAbsScore: nsPerspectiveScores.length ? Math.max(...nsPerspectiveScores.map((value) => Math.abs(value))) : 0,
      largestScores,
      slamLevelBoards: boards.filter((board) => board.parContracts.some((contract) => contract.level >= 6)),
      voidBoards: boards.filter((board) => board.voids.length),
      longSuitBoards: boards.filter((board) => board.longSuits.length),
      hcpImbalanceBoards: [...boards].sort((a, b) => Math.abs(b.hcpDeltaNS) - Math.abs(a.hcpDeltaNS)).slice(0, 5)
    };

    return {
      parsed,
      boards,
      tagKeys: tags,
      directiveMap: map,
      summary
    };
  }

  function pickField(row, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== "") return row[key];
    }
    return "";
  }

  function normalizeResultSide(value) {
    const text = String(value || "").trim().toUpperCase();
    if (SEATS.includes(text)) return text;
    return "";
  }

  function normalizePlayedContractText(value) {
    const text = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!text) return "";
    if (/^(PASS|AP|ALL PASS|PASSED OUT)$/.test(text)) return "PASS";
    const match = text.match(/^([1-7])\s*(NT|N|[SHDC])(?:\s*(XX|X))?$/i);
    if (!match) return text;
    const denomination = match[2].toUpperCase() === "N" || match[2].toUpperCase() === "NT" ? "NT" : match[2].toUpperCase();
    const doubled = match[3] ? ` ${match[3].toUpperCase()}` : "";
    return `${match[1]} ${denomination}${doubled}`;
  }

  function normalizeResultValue(value) {
    return String(value == null ? "" : value).trim().toUpperCase();
  }

  function parseScoreAdjustment(remarks) {
    const text = String(remarks || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!text) return null;
    const tokenPercent = (token) => {
      if (/^\d{1,3}%$/.test(token)) {
        const percent = Number(token.slice(0, -1));
        return percent > 100 ? null : percent;
      }
      if (/^(AVE|AVG|A)$/.test(token)) return 50;
      if (/^(AVE|AVG|A)\+$/.test(token)) return 60;
      if (/^(AVE|AVG|A)-$/.test(token)) return 40;
      return null;
    };
    const tokenPattern = "\\d{1,3}%|AVE[+-]?|AVG[+-]?|A[+-]?";
    const pairMatch = text.match(new RegExp(`^(${tokenPattern})[-/](${tokenPattern})$`));
    const nsToken = pairMatch ? pairMatch[1] : text;
    const ewToken = pairMatch ? pairMatch[2] : text;
    const nsPercent = tokenPercent(nsToken);
    const ewPercent = tokenPercent(ewToken);
    if (nsPercent == null || ewPercent == null) return null;
    return { nsPercent, ewPercent };
  }

  function parsePlayedContract(value) {
    const text = normalizePlayedContractText(value);
    if (!text) return { raw: "", passout: false, level: null, strain: "", doubled: "", className: "Unknown" };
    if (text === "PASS") return { raw: text, passout: true, level: null, strain: "", doubled: "", className: "Passout" };
    const match = text.match(/^([1-7])\s*(NT|[SHDC])(?:\s*(XX|X))?$/i);
    if (!match) return { raw: text, passout: false, level: null, strain: "", doubled: "", className: "Unknown" };
    const strain = match[2].toUpperCase() === "NT" ? "N" : match[2].toUpperCase();
    const level = Number(match[1]);
    return {
      raw: text,
      passout: false,
      level,
      strain,
      doubled: (match[3] || "").toUpperCase(),
      className: classifyContract(level, strain)
    };
  }

  function contractTrickScore(contract) {
    if (!contract || !contract.level || !contract.strain) return 0;
    if (contract.strain === "N") return 40 + (contract.level - 1) * 30;
    if (contract.strain === "S" || contract.strain === "H") return contract.level * 30;
    return contract.level * 20;
  }

  function overtrickValue(contract) {
    if (contract.strain === "C" || contract.strain === "D") return 20;
    return 30;
  }

  function isVulnerable(vulnerable, pair) {
    const normalized = normalizeVulnerability(vulnerable);
    if (normalized === "All") return true;
    if (normalized === "NS") return pair === "NS";
    if (normalized === "EW") return pair === "EW";
    return false;
  }

  function resultToTricks(contract, resultText) {
    if (!contract || contract.passout) return 0;
    if (!contract.level) return null;
    const target = contract.level + 6;
    const result = normalizeResultValue(resultText);
    if (!result) return null;
    let tricks = null;
    if (result === "=") tricks = target;
    else {
      const offset = result.match(/^([+-])\s*(\d+)$/);
      if (offset) tricks = target + (offset[1] === "+" ? 1 : -1) * Number(offset[2]);
      else if (/^\d+$/.test(result)) tricks = Number(result);
    }
    if (tricks == null || tricks < 0 || tricks > 13) return null;
    return tricks;
  }

  function undertrickPenalty(undertricks, vulnerable, doubled) {
    if (!doubled) return undertricks * (vulnerable ? 100 : 50);
    let penalty = 0;
    for (let index = 1; index <= undertricks; index += 1) {
      if (vulnerable) penalty += index === 1 ? 200 : 300;
      else penalty += index === 1 ? 100 : index <= 3 ? 200 : 300;
    }
    return doubled === "XX" ? penalty * 2 : penalty;
  }

  function scoreDuplicateContract(contractText, resultText, declarerSide, vulnerable, declarerPairOverride) {
    const contract = parsePlayedContract(contractText);
    if (contract.passout) {
      return { contract, tricks: 0, scoreDeclarer: 0, scoreNS: 0, error: "" };
    }
    const declarerPair = PAIRS[declarerSide] || declarerPairOverride || "";
    const tricks = resultToTricks(contract, resultText);
    if (!contract.level || !declarerPair || tricks == null) {
      return { contract, tricks, scoreDeclarer: null, scoreNS: null, error: "Could not score the contract." };
    }

    const target = contract.level + 6;
    const vulnerablePair = isVulnerable(vulnerable, declarerPair);
    const madeBy = tricks - target;
    let scoreDeclarer = 0;

    if (madeBy < 0) {
      scoreDeclarer = -undertrickPenalty(Math.abs(madeBy), vulnerablePair, contract.doubled);
    } else {
      const multiplier = contract.doubled === "XX" ? 4 : contract.doubled === "X" ? 2 : 1;
      const trickScore = contractTrickScore(contract) * multiplier;
      const gameBonus = trickScore >= 100 ? (vulnerablePair ? 500 : 300) : 50;
      const slamBonus = contract.level === 6 ? (vulnerablePair ? 750 : 500) : contract.level === 7 ? (vulnerablePair ? 1500 : 1000) : 0;
      const insult = contract.doubled === "XX" ? 100 : contract.doubled === "X" ? 50 : 0;
      let overtricks = 0;
      if (madeBy > 0) {
        if (contract.doubled) {
          const doubledOvertrick = vulnerablePair ? 200 : 100;
          overtricks = madeBy * (contract.doubled === "XX" ? doubledOvertrick * 2 : doubledOvertrick);
        } else {
          overtricks = madeBy * overtrickValue(contract);
        }
      }
      scoreDeclarer = trickScore + gameBonus + slamBonus + insult + overtricks;
    }

    return {
      contract,
      tricks,
      scoreDeclarer,
      scoreNS: declarerPair === "NS" ? scoreDeclarer : -scoreDeclarer,
      error: ""
    };
  }

  function boardMapByNumber(analysis) {
    return new Map((analysis ? analysis.boards : []).map((board) => [String(board.boardNo), board]));
  }

  function normalizeResultRow(row, index, analysis, boardMap) {
    const boardNo = safeNumber(pickField(row, ["Board", "board", "Board Number", "board_number"]));
    if (boardNo == null) return null;
    const pairNS = safeNumber(pickField(row, ["PairNS", "Pair NS", "NSPair", "NS Pair", "pair_ns"]));
    const pairEW = safeNumber(pickField(row, ["PairEW", "Pair EW", "EWPair", "EW Pair", "pair_ew"]));
    const declarerNumber = safeNumber(pickField(row, ["Declarer", "declarer"]));
    const declarerSide = normalizeResultSide(pickField(row, ["NS/EW", "NSEW", "Direction", "DeclarerSide", "Declarer Side", "declarer_side"]));
    const contract = normalizePlayedContractText(pickField(row, ["Contract", "contract", "Actual Contract"]));
    const result = normalizeResultValue(pickField(row, ["Result", "result", "Tricks Result"]));
    const board = boardMap.get(String(boardNo));
    const resultBoard = board || fallbackResultBoard(boardNo);
    const declarerPairOverride = declarerNumber != null && declarerNumber === pairNS
      ? "NS"
      : declarerNumber != null && declarerNumber === pairEW
        ? "EW"
        : "";
    const remarks = pickField(row, ["Remarks", "remarks"]);
    const adjustment = parseScoreAdjustment(remarks);
    const scored = scoreDuplicateContract(contract, result, declarerSide, resultBoard.vulnerable, declarerPairOverride);
    const parNS = board && board.optimum.nsPerspective != null ? board.optimum.nsPerspective : null;
    const ddTricksRaw = board && scored.contract.strain && declarerSide ? getDoubleDummyTricks(board, declarerSide, scored.contract.strain) : "";
    const ddTricks = ddTricksRaw === "" ? null : Number(ddTricksRaw);
    const erased = safeNumber(pickField(row, ["Erased", "erased", "Deleted", "deleted"])) || 0;

    return {
      index,
      id: pickField(row, ["ID", "id"]),
      section: safeNumber(pickField(row, ["Section", "section"])),
      tableNo: safeNumber(pickField(row, ["Table", "table"])),
      round: safeNumber(pickField(row, ["Round", "round"])),
      boardNo,
      pairNS,
      pairEW,
      declarerNumber,
      declarerSide,
      declarerPair: PAIRS[declarerSide] || declarerPairOverride,
      contract,
      result,
      parsedContract: scored.contract,
      contractClass: scored.contract.className,
      tricks: scored.tricks,
      scoreDeclarer: scored.scoreDeclarer,
      scoreNS: scored.scoreNS,
      parNS,
      vsParNS: scored.scoreNS != null && parNS != null ? scored.scoreNS - parNS : null,
      ddTricks,
      ddDelta: scored.tricks != null && ddTricks != null ? scored.tricks - ddTricks : null,
      leadCard: pickField(row, ["LeadCard", "Lead Card", "lead_card"]),
      remarks,
      adjustment,
      dateLog: pickField(row, ["DateLog", "Date Log", "date_log"]),
      timeLog: pickField(row, ["TimeLog", "Time Log", "time_log"]),
      erased,
      scoringError: adjustment ? "" : scored.error,
      board: resultBoard,
      hasPbnBoard: !!board
    };
  }

  function normalizePlayerNumbers(rows) {
    return (rows || [])
      .map((row) => {
        const player = {
          section: safeNumber(pickField(row, ["Section", "section"])),
          tableNo: safeNumber(pickField(row, ["Table", "table"])),
          direction: normalizeResultSide(pickField(row, ["Direction", "direction", "Seat", "seat"])),
          number: String(pickField(row, ["Number", "number", "PlayerNumber", "player_number"]) || "").trim(),
          name: String(pickField(row, ["Name", "name", "Player", "player"]) || "").trim(),
          round: safeNumber(pickField(row, ["Round", "round"])) || 0
        };
        player.placeholder = playerHasIdentity(player) ? "" : playerPlaceholder(player);
        return player;
      })
      .filter((row) => row.section != null && row.tableNo != null && row.direction);
  }

  function playerHasIdentity(player) {
    return !!(player && (player.name || player.number));
  }

  function playerPlaceholder(player) {
    if (!player || player.tableNo == null || !player.direction) return "";
    return `Table ${player.tableNo} ${seatName(player.direction)}`;
  }

  function playerDisplay(player) {
    if (!player) return "";
    return player.name || player.number || player.placeholder || "";
  }

  function pairRosterKey(pairNo, side) {
    return side ? `${pairNo}:${side}` : String(pairNo);
  }

  function ensurePairRoster(pairRosters, pairNo, side) {
    const key = pairRosterKey(pairNo, side);
    if (!pairRosters.has(key)) {
      pairRosters.set(key, { pairNo, side: side || "", playersBySeat: {}, players: [], label: "" });
    }
    return pairRosters.get(key);
  }

  function rosterTableKey(section, tableNo, multiSection) {
    return `${multiSection && section != null ? section : ""}|${tableNo}`;
  }

  function rosterPairId(section, pairNo, multiSection) {
    if (pairNo == null) return null;
    return multiSection && section != null ? `S${section}:${pairNo}` : String(pairNo);
  }

  function buildPairRosters(playerNumbers, rows, multiSection) {
    const roundsByTable = new Map();
    rows.forEach((row) => {
      if (row.tableNo == null) return;
      const key = rosterTableKey(row.section, row.tableNo, multiSection);
      if (!roundsByTable.has(key)) roundsByTable.set(key, new Map());
      const byRound = roundsByTable.get(key);
      const round = row.round == null ? 0 : row.round;
      if (!byRound.has(round)) byRound.set(round, row);
    });

    const assignmentFor = (player) => {
      const byRound = roundsByTable.get(rosterTableKey(player.section, player.tableNo, multiSection));
      if (!byRound) return null;
      const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
      const target = player.round || 0;
      const chosen = rounds.find((round) => round >= target);
      return byRound.get(chosen != null ? chosen : rounds[rounds.length - 1]);
    };

    const assignSeat = (roster, player) => {
      const existing = roster.playersBySeat[player.direction];
      if (!existing || (playerHasIdentity(player) && !playerHasIdentity(existing))) {
        roster.playersBySeat[player.direction] = player;
      }
    };

    const pairRosters = new Map();
    playerNumbers.forEach((player) => {
      const tableRow = assignmentFor(player);
      if (!tableRow) return;
      const side = player.direction === "N" || player.direction === "S" ? "NS" : "EW";
      const pairNo = side === "NS" ? tableRow.pairNS : tableRow.pairEW;
      const pairId = rosterPairId(tableRow.section, pairNo, multiSection);
      if (pairId == null) return;
      assignSeat(ensurePairRoster(pairRosters, pairId, side), player);
      assignSeat(ensurePairRoster(pairRosters, pairId), player);
    });

    pairRosters.forEach((roster) => {
      roster.players = SEATS.map((seat) => roster.playersBySeat[seat]).filter((player) => player && playerDisplay(player));
      roster.knownPlayers = roster.players.filter(playerHasIdentity);
      roster.placeholderPlayers = roster.players.filter((player) => player && !playerHasIdentity(player));
      roster.label = roster.players.map(playerDisplay).join(" / ");
    });
    pairRosters.profile = summarizePairRosters(pairRosters);
    return pairRosters;
  }

  function summarizePairRosters(pairRosters) {
    const groups = Array.from(pairRosters.values()).filter((roster) => !roster.side);
    const sideRosters = Array.from(pairRosters.values()).filter((roster) => roster.side);
    const teamLikeGroups = groups.filter((roster) => {
      const ns = pairRosters.get(pairRosterKey(roster.pairNo, "NS"));
      const ew = pairRosters.get(pairRosterKey(roster.pairNo, "EW"));
      return ns && ns.players.length && ew && ew.players.length;
    });
    const incompleteSideRosters = sideRosters.filter((roster) => roster.players.length > 0 && roster.knownPlayers.length < 2);
    return {
      groupCount: groups.length,
      teamLikeGroups: teamLikeGroups.length,
      maxPlayersPerNumber: groups.length ? Math.max(...groups.map((roster) => roster.players.length)) : 0,
      incompleteSideRosters: incompleteSideRosters.length,
      incompleteSideRosterLabels: incompleteSideRosters.map((roster) => `${roster.pairNo} ${roster.side}`).slice(0, 6)
    };
  }

  function fallbackPairSeatLabel(pairNo, seat) {
    if (pairNo == null || pairNo === "" || !seat) return "";
    return `Pair ${pairNo} ${seatName(seat)}`;
  }

  function fallbackPairLabel(pairNo, side) {
    if (pairNo == null || pairNo === "") return "";
    if (side === "NS") return ["N", "S"].map((seat) => fallbackPairSeatLabel(pairNo, seat)).join(" / ");
    if (side === "EW") return ["E", "W"].map((seat) => fallbackPairSeatLabel(pairNo, seat)).join(" / ");
    return `Pair ${pairNo} Player 1 / Pair ${pairNo} Player 2`;
  }

  function pairRosterLabel(pairRosters, pairNo, side, sideOnly) {
    const sideRoster = side ? pairRosters.get(pairRosterKey(pairNo, side)) : null;
    if (sideRoster && sideRoster.label) return sideRoster.label;
    if (!sideOnly) {
      const roster = pairRosters.get(pairRosterKey(pairNo));
      if (roster && roster.label) return roster.label;
    }
    return fallbackPairLabel(pairNo, side);
  }

  function pairSeatPlayer(pairRosters, pairNo, seat, side, sideOnly) {
    const sideRoster = side ? pairRosters.get(pairRosterKey(pairNo, side)) : null;
    const roster = sideRoster || (sideOnly ? null : pairRosters.get(pairRosterKey(pairNo)));
    const player = roster ? playerDisplay(roster.playersBySeat[seat]) : "";
    return player || fallbackPairSeatLabel(pairNo, seat);
  }

  function pairRosterKnownCount(pairRosters, pairNo, side, sideOnly) {
    const sideRoster = side ? pairRosters.get(pairRosterKey(pairNo, side)) : null;
    if (sideRoster) return sideRoster.knownPlayers ? sideRoster.knownPlayers.length : 0;
    if (sideOnly) return 0;
    const roster = pairRosters.get(pairRosterKey(pairNo));
    return roster && roster.knownPlayers ? roster.knownPlayers.length : 0;
  }

  function participantKeyFor(pairNo, side, useSidePartnerships) {
    if (pairNo == null) return "";
    return useSidePartnerships ? pairRosterKey(pairNo, side) : String(pairNo);
  }

  function participantLabelFor(pairNo, side, useSidePartnerships) {
    if (pairNo == null) return "";
    return useSidePartnerships ? `${pairNo} ${side}` : String(pairNo);
  }

  function attachPlayerNames(rows, pairRosters, useSidePartnerships, multiSection) {
    rows.forEach((row) => {
      const nsPairId = rosterPairId(row.section, row.pairNS, multiSection);
      const ewPairId = rosterPairId(row.section, row.pairEW, multiSection);
      row.nsPlayers = pairRosterLabel(pairRosters, nsPairId, "NS", useSidePartnerships);
      row.ewPlayers = pairRosterLabel(pairRosters, ewPairId, "EW", useSidePartnerships);
      row.nsParticipantKey = participantKeyFor(nsPairId, "NS", useSidePartnerships);
      row.ewParticipantKey = participantKeyFor(ewPairId, "EW", useSidePartnerships);
      row.nsParticipantNo = participantLabelFor(nsPairId, "NS", useSidePartnerships);
      row.ewParticipantNo = participantLabelFor(ewPairId, "EW", useSidePartnerships);
      row.nsParticipantPlayers = useSidePartnerships ? row.nsPlayers : pairRosterLabel(pairRosters, nsPairId);
      row.ewParticipantPlayers = useSidePartnerships ? row.ewPlayers : pairRosterLabel(pairRosters, ewPairId);
      row.nsKnownPlayers = pairRosterKnownCount(pairRosters, nsPairId, "NS", useSidePartnerships);
      row.ewKnownPlayers = pairRosterKnownCount(pairRosters, ewPairId, "EW", useSidePartnerships);
      row.nsParticipantKnownPlayers = useSidePartnerships ? row.nsKnownPlayers : pairRosterKnownCount(pairRosters, nsPairId);
      row.ewParticipantKnownPlayers = useSidePartnerships ? row.ewKnownPlayers : pairRosterKnownCount(pairRosters, ewPairId);
      row.declarerName = row.declarerSide === "N" || row.declarerSide === "S"
        ? pairSeatPlayer(pairRosters, nsPairId, row.declarerSide, "NS", useSidePartnerships)
        : pairSeatPlayer(pairRosters, ewPairId, row.declarerSide, "EW", useSidePartnerships);
    });
  }

  function addPairStanding(map, side, row) {
    if (row.nsMatchpoints == null || row.boardTop == null) return;
    const key = side === "NS" ? row.nsParticipantKey : row.ewParticipantKey;
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        key,
        pairNo: side === "NS" ? row.nsParticipantNo : row.ewParticipantNo,
        sourcePairNo: side === "NS" ? row.pairNS : row.pairEW,
        rosterSide: side,
        players: side === "NS" ? row.nsParticipantPlayers : row.ewParticipantPlayers,
        knownPlayers: side === "NS" ? row.nsParticipantKnownPlayers : row.ewParticipantKnownPlayers,
        matchpoints: 0,
        top: 0,
        boards: 0,
        nsBoards: 0,
        ewBoards: 0,
        scores: []
      });
    }
    const standing = map.get(key);
    if (!standing.players) standing.players = side === "NS" ? row.nsParticipantPlayers : row.ewParticipantPlayers;
    standing.knownPlayers = Math.max(standing.knownPlayers || 0, side === "NS" ? row.nsParticipantKnownPlayers : row.ewParticipantKnownPlayers);
    const mp = side === "NS" ? row.nsMatchpoints : row.ewMatchpoints;
    standing.matchpoints += mp;
    standing.top += row.boardTop;
    standing.boards += 1;
    if (row.scoreNS != null) standing.scores.push(side === "NS" ? row.scoreNS : -row.scoreNS);
    if (side === "NS") standing.nsBoards += 1;
    else standing.ewBoards += 1;
  }

  function applyMatchpoints(rowsByField) {
    rowsByField.forEach((rows) => {
      const scoredRows = rows.filter((row) => row.scoreNS != null);
      const top = Math.max(0, scoredRows.length - 1);
      scoredRows.forEach((row) => {
        let mp = 0;
        scoredRows.forEach((other) => {
          if (other === row) return;
          if (row.scoreNS > other.scoreNS) mp += 1;
          else if (row.scoreNS === other.scoreNS) mp += 0.5;
        });
        row.boardTop = top;
        row.nsMatchpoints = mp;
        row.ewMatchpoints = top - mp;
        row.nsPercent = top ? (mp / top) * 100 : null;
        row.ewPercent = top ? ((top - mp) / top) * 100 : null;
      });
      rows.forEach((row) => {
        if (!row.adjustment || row.scoreNS != null) return;
        row.boardTop = top;
        row.nsMatchpoints = (row.adjustment.nsPercent / 100) * top;
        row.ewMatchpoints = (row.adjustment.ewPercent / 100) * top;
        row.nsPercent = row.adjustment.nsPercent;
        row.ewPercent = row.adjustment.ewPercent;
      });
    });
  }

  function summarizeResultBoard(boardNo, rows, board) {
    const scored = rows.filter((row) => row.scoreNS != null);
    const scores = scored.map((row) => row.scoreNS);
    const ddDeltas = rows.map((row) => row.ddDelta).filter((value) => value != null);
    const parNS = board && board.optimum.nsPerspective != null ? board.optimum.nsPerspective : null;
    const maxScore = scores.length ? Math.max(...scores) : null;
    const minScore = scores.length ? Math.min(...scores) : null;
    const topNs = maxScore == null ? [] : scored.filter((row) => row.scoreNS === maxScore).map((row) => row.nsParticipantNo || row.pairNS).filter((value) => value != null && value !== "");
    const topEw = minScore == null ? [] : scored.filter((row) => row.scoreNS === minScore).map((row) => row.ewParticipantNo || row.pairEW).filter((value) => value != null && value !== "");
    const averageNsScore = scores.length ? average(scores) : null;
    const contractCounts = countBy(rows.map((row) => row.contract || "Unknown"));
    const contractSummary = Object.entries(contractCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))
      .slice(0, 4)
      .map(([contract, count]) => `${contract} (${count})`)
      .join(", ");

    return {
      boardNo,
      board,
      rows,
      resultCount: rows.length,
      scoredCount: scored.length,
      parNS,
      averageNsScore,
      averageVsPar: averageNsScore != null && parNS != null ? averageNsScore - parNS : null,
      minNsScore: minScore,
      maxNsScore: maxScore,
      scoreSpread: maxScore != null && minScore != null ? maxScore - minScore : null,
      averageDdDelta: ddDeltas.length ? average(ddDeltas) : null,
      contractSummary,
      topNs: uniqueSorted(topNs.map(String)),
      topEw: uniqueSorted(topEw.map(String))
    };
  }

  function normalizedDateKey(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const ymd = text.match(/\b([12]\d{3})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);
    if (ymd) return `${ymd[1]}${ymd[2].padStart(2, "0")}${ymd[3].padStart(2, "0")}`;
    const mdy = text.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
    if (!mdy) return "";
    let year = Number(mdy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return `${String(year).padStart(4, "0")}${mdy[1].padStart(2, "0")}${mdy[2].padStart(2, "0")}`;
  }

  function dateKeyLabel(key) {
    if (!key || key.length !== 8) return "";
    return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}`;
  }

  function compatibilityPercent(value) {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  }

  function assessPbnResultsCompatibility(analysis, rows, boardSummaries) {
    const hasPbn = analysis && analysis.boards && analysis.boards.length;
    const resultBoardNumbers = new Set(boardSummaries.map((summary) => String(summary.boardNo)));
    const resultBoardCount = resultBoardNumbers.size;
    if (!hasPbn) {
      return {
        status: "unknown",
        label: "No PBN to compare",
        score: null,
        details: ["Open a PBN to compare board numbers, event date, par, and double-dummy clues."],
        metrics: {}
      };
    }

    const pbnBoardNumbers = new Set(analysis.boards.map((board) => String(board.boardNo)));
    const overlapBoards = [...resultBoardNumbers].filter((boardNo) => pbnBoardNumbers.has(boardNo)).sort(numericPairSort);
    const extraBoards = [...resultBoardNumbers].filter((boardNo) => !pbnBoardNumbers.has(boardNo)).sort(numericPairSort);
    const missingBoards = [...pbnBoardNumbers].filter((boardNo) => !resultBoardNumbers.has(boardNo)).sort(numericPairSort);
    const overlapRatio = resultBoardCount ? overlapBoards.length / resultBoardCount : 0;
    const pbnCoverageRatio = pbnBoardNumbers.size ? overlapBoards.length / pbnBoardNumbers.size : 0;
    const commonRows = rows.filter((row) => row.hasPbnBoard);
    const completeContractRows = commonRows.filter((row) => row.contract && row.result && row.declarerSide).length;
    const contractCoverage = commonRows.length ? completeContractRows / commonRows.length : 0;
    const ddDeltas = commonRows.map((row) => row.ddDelta).filter((value) => value != null);
    const vsPar = commonRows.map((row) => row.vsParNS).filter((value) => value != null);
    const avgAbsDd = ddDeltas.length ? average(ddDeltas.map((value) => Math.abs(value))) : null;
    const avgAbsVsPar = vsPar.length ? average(vsPar.map((value) => Math.abs(value))) : null;
    const pbnDateKey = normalizedDateKey(pbnHeaderDetails(analysis).date);
    const resultDateKeys = uniqueSorted(rows.map((row) => normalizedDateKey(row.dateLog)).filter(Boolean));
    const dateMismatch = Boolean(pbnDateKey && resultDateKeys.length && !resultDateKeys.includes(pbnDateKey));
    let score = 100;
    const details = [];
    const concerns = [];

    if (!resultBoardCount) {
      return {
        status: "unknown",
        label: "No comparable result boards",
        score: null,
        details: ["The results file did not yield any playable board numbers to compare with the loaded PBN."],
        metrics: {
          pbnBoards: pbnBoardNumbers.size,
          resultBoards: 0,
          overlapBoards: 0,
          overlapRatio: 0,
          pbnCoverageRatio: 0,
          pbnDate: dateKeyLabel(pbnDateKey),
          resultDates: resultDateKeys.map(dateKeyLabel)
        }
      };
    }

    score -= (1 - overlapRatio) * 70;
    if (dateMismatch) score -= 35;
    if (contractCoverage && contractCoverage < 0.75) score -= 12;
    if (avgAbsDd != null && ddDeltas.length >= 12 && avgAbsDd > 3.5) score -= avgAbsDd > 5 ? 30 : 16;
    if (avgAbsVsPar != null && vsPar.length >= 12 && avgAbsVsPar > 650) score -= avgAbsVsPar > 900 ? 24 : 12;
    score = Math.max(0, Math.round(score));

    details.push(`${overlapBoards.length} of ${resultBoardCount} result boards overlap the PBN (${compatibilityPercent(overlapRatio)}).`);
    details.push(`${overlapBoards.length} of ${pbnBoardNumbers.size} PBN boards have uploaded results (${compatibilityPercent(pbnCoverageRatio)}).`);
    if (overlapRatio < 0.85) concerns.push(`Only ${compatibilityPercent(overlapRatio)} of result boards overlap the PBN.`);
    if (extraBoards.length) {
      const text = `Result-only boards: ${extraBoards.slice(0, 12).join(", ")}${extraBoards.length > 12 ? ", ..." : ""}.`;
      details.push(text);
      concerns.push(text);
    }
    if (missingBoards.length) details.push(`PBN boards without results: ${missingBoards.slice(0, 12).join(", ")}${missingBoards.length > 12 ? ", ..." : ""}.`);
    if (pbnDateKey || resultDateKeys.length) {
      const text = `PBN date ${dateKeyLabel(pbnDateKey) || "unknown"}; result date${resultDateKeys.length === 1 ? "" : "s"} ${resultDateKeys.map(dateKeyLabel).join(", ") || "unknown"}.`;
      details.push(text);
      if (dateMismatch) concerns.push(text);
    }
    if (commonRows.length) details.push(`${compatibilityPercent(contractCoverage)} of joined result rows include contract, result, and declarer direction.`);
    if (avgAbsDd != null && ddDeltas.length >= 12) {
      const text = `Average absolute DD trick delta on joined rows is ${avgAbsDd.toFixed(1)}.`;
      details.push(text);
      if (avgAbsDd > 3.5) concerns.push(text);
    }
    if (avgAbsVsPar != null && vsPar.length >= 12) {
      const text = `Average absolute score-vs-par on joined rows is ${Math.round(avgAbsVsPar)}.`;
      details.push(text);
      if (avgAbsVsPar > 650) concerns.push(text);
    }

    let status = "match";
    let label = "Looks compatible";
    if (overlapRatio === 0 || overlapRatio < 0.5 || score < 35) {
      status = "mismatch";
      label = "Likely mismatch";
    } else if (dateMismatch || overlapRatio < 0.85 || score < 70) {
      status = "warning";
      label = "Possible mismatch";
    } else if (pbnCoverageRatio < 0.65) {
      status = "partial";
      label = "Partial but plausible";
    }

    return {
      status,
      label,
      score,
      primaryConcern: concerns[0] || details[0] || "",
      details,
      metrics: {
        pbnBoards: pbnBoardNumbers.size,
        resultBoards: resultBoardCount,
        overlapBoards: overlapBoards.length,
        extraBoards: extraBoards.length,
        missingBoards: missingBoards.length,
        overlapRatio,
        pbnCoverageRatio,
        contractCoverage,
        avgAbsDd,
        avgAbsVsPar,
        pbnDate: dateKeyLabel(pbnDateKey),
        resultDates: resultDateKeys.map(dateKeyLabel)
      }
    };
  }

  // Result normalization, matchpoint scoring, standings, and pair-improvement analysis.
  function buildResultsAnalysis(rawResults, analysis) {
    analysis = analysis || emptyAnalysis();
    const boardMap = boardMapByNumber(analysis);
    const warnings = [...(rawResults.warnings || [])];
    const hasPbn = analysis.boards.length > 0;
    if (!hasPbn) {
      warnings.push("No PBN hand record is loaded; par, double-dummy, deal, and HCP analysis will be added after a PBN is opened. Dealer and vulnerability are inferred from standard board numbering for scoring.");
    }
    const playerNumbers = normalizePlayerNumbers(rawResults.playerNumbers || []);
    const normalizedRows = (rawResults.receivedData || [])
      .map((row, index) => normalizeResultRow(row, index, analysis, boardMap))
      .filter(Boolean);
    const skippedNoBoard = (rawResults.receivedData || []).length - normalizedRows.length;
    if (skippedNoBoard) {
      warnings.push(`${plural(skippedNoBoard, "result row had", "result rows had")} no recognizable board number and ${skippedNoBoard === 1 ? "was" : "were"} skipped.`);
    }
    const erasedRowCount = normalizedRows.filter((row) => row.erased).length;
    if (erasedRowCount) {
      warnings.push(`${plural(erasedRowCount, "erased (corrected) result row was", "erased (corrected) result rows were")} excluded from scoring.`);
    }
    const rows = normalizedRows.filter((row) => !row.erased);
    const sectionNumbers = uniqueSorted(rows.map((row) => row.section).filter((value) => value != null));
    const multiSection = sectionNumbers.length > 1;
    if (multiSection) {
      warnings.push(`${sectionNumbers.length} sections detected; boards are matchpointed within each section and pair numbers are section-scoped.`);
    }
    rows.forEach((row) => {
      row.fieldKey = multiSection ? `${row.section == null ? "?" : row.section}|${row.boardNo}` : String(row.boardNo);
    });
    const adjustedCount = rows.filter((row) => row.adjustment && row.scoreNS == null).length;
    if (adjustedCount) {
      warnings.push(`${plural(adjustedCount, "director-adjusted row was", "director-adjusted rows were")} applied as percentage awards instead of scored contracts.`);
    }
    const pairRosters = buildPairRosters(playerNumbers, rows, multiSection);
    const rosterProfile = pairRosters.profile || {};
    const sidePairCollision = detectSidePairCollision(rows);
    const useSidePartnerships = !!rosterProfile.teamLikeGroups || sidePairCollision;
    if (rosterProfile.teamLikeGroups) {
      warnings.push(`${rosterProfile.teamLikeGroups} result numbers have both NS-side and EW-side player rosters; pair standings and reports are split into side-specific partnerships.`);
    } else if (sidePairCollision) {
      warnings.push("Pair numbers repeat across the NS and EW directions (Mitchell-style movement); each direction is treated as a separate partnership in standings and reports.");
    }
    const numberOnlyPlayers = playerNumbers.filter((player) => player.number && !player.name).length;
    if (numberOnlyPlayers) {
      warnings.push(`${plural(numberOnlyPlayers, "PlayerNumbers record has", "PlayerNumbers records have")} a member number but no player name; the member number is shown where no name was available.`);
    }
    attachPlayerNames(rows, pairRosters, useSidePartnerships, multiSection);
    const rowsByBoard = new Map();
    const rowsByField = new Map();
    rows.forEach((row) => {
      const key = String(row.boardNo);
      if (!rowsByBoard.has(key)) rowsByBoard.set(key, []);
      rowsByBoard.get(key).push(row);
      if (!rowsByField.has(row.fieldKey)) rowsByField.set(row.fieldKey, []);
      rowsByField.get(row.fieldKey).push(row);
    });

    applyMatchpoints(rowsByField);

    const pairMap = new Map();
    rows.forEach((row) => {
      addPairStanding(pairMap, "NS", row);
      addPairStanding(pairMap, "EW", row);
      if (row.scoringError) warnings.push(`Board ${row.boardNo}, row ${row.id || row.index + 1}: ${row.scoringError}`);
    });

    const pairStandings = Array.from(pairMap.values())
      .map((standing) => ({
        ...standing,
        averageScore: standing.scores.length ? average(standing.scores) : 0,
        percent: standing.top ? (standing.matchpoints / standing.top) * 100 : null
      }))
      .sort((a, b) => (b.percent || 0) - (a.percent || 0) || String(a.pairNo).localeCompare(String(b.pairNo), undefined, { numeric: true }))
      .map((standing, index) => ({ ...standing, rank: index + 1 }));
    const partialRosterStandings = pairStandings.filter((standing) => standing.boards && standing.knownPlayers > 0 && standing.knownPlayers < 2);
    if (partialRosterStandings.length) {
      const examples = partialRosterStandings.map((standing) => standing.pairNo).sort(numericPairSort).slice(0, 8).join(", ");
      warnings.push(`${plural(partialRosterStandings.length, "active partnership has", "active partnerships have")} only one recovered player name or member number${examples ? ` (${examples})` : ""}; placeholder labels are used for missing members.`);
    }
    const missingRosterStandings = pairStandings.filter((standing) => standing.boards && !standing.knownPlayers);
    if (missingRosterStandings.length) {
      const examples = missingRosterStandings.map((standing) => standing.pairNo).sort(numericPairSort).slice(0, 8).join(", ");
      warnings.push(`${plural(missingRosterStandings.length, "active partnership has", "active partnerships have")} no recovered player names or member numbers${examples ? ` (${examples})` : ""}; placeholder labels are used where table, seat, or pair context is available.`);
    }

    const boardSummaries = Array.from(rowsByBoard.entries())
      .map(([boardNo, boardRows]) => summarizeResultBoard(Number(boardNo), boardRows, boardMap.get(String(boardNo))))
      .sort((a, b) => a.boardNo - b.boardNo);
    const boardsByNumber = new Map(boardSummaries.map((summary) => [String(summary.boardNo), summary]));
    const pbnBoardNumbers = new Set(analysis.boards.map((board) => String(board.boardNo)));
    const resultBoardNumbers = new Set(boardSummaries.map((summary) => String(summary.boardNo)));
    const vsPar = rows.map((row) => row.vsParNS).filter((value) => value != null);
    const ddDeltas = rows.map((row) => row.ddDelta).filter((value) => value != null);
    const compatibility = assessPbnResultsCompatibility(analysis, rows, boardSummaries);
    if (hasPbn && ["warning", "mismatch"].includes(compatibility.status)) {
      warnings.push(`${compatibility.label}: the results file may not correspond to the loaded PBN. ${compatibility.primaryConcern || compatibility.details[0] || ""}`);
    }

    return {
      fileName: rawResults.fileName,
      sourceType: rawResults.sourceType,
      metadata: rawResults.metadata || {},
      raw: rawResults,
      rows,
      playerNumbers,
      pairRosters,
      rosterProfile,
      participantMode: useSidePartnerships ? "side" : "pair",
      hasPbn,
      rowsByBoard,
      rowsByField,
      boardSummaries,
      boardsByNumber,
      pairStandings,
      warnings,
      summary: {
        resultCount: rows.length,
        scoredCount: rows.filter((row) => row.scoreNS != null).length,
        boardsCovered: boardSummaries.length,
        tables: uniqueSorted(rows.map((row) => row.tableNo)).length,
        rounds: uniqueSorted(rows.map((row) => row.round)).length,
        pairs: pairStandings.length,
        playerRecords: playerNumbers.length,
        namedPlayers: playerNumbers.filter((player) => player.name).length,
        contractClasses: countBy(rows.map((row) => row.contractClass)),
        declarerSides: countBy(rows.map((row) => row.declarerSide)),
        missingResultBoards: analysis.boards.filter((board) => !resultBoardNumbers.has(String(board.boardNo))).map((board) => board.boardNo),
        extraResultBoards: boardSummaries.filter((summary) => !pbnBoardNumbers.has(String(summary.boardNo))).map((summary) => summary.boardNo),
        compatibility,
        averageVsPar: vsPar.length ? average(vsPar) : null,
        averageAbsVsPar: vsPar.length ? average(vsPar.map((value) => Math.abs(value))) : null,
        ddExact: ddDeltas.filter((value) => value === 0).length,
        ddCompared: ddDeltas.length
      }
    };
  }

  function numericPairSort(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function detectSidePairCollision(rows) {
    const nsKeys = new Set();
    const ewKeys = new Set();
    const relevant = rows.filter((row) => row.scoreNS != null || row.adjustment);
    for (const row of relevant) {
      const validNS = row.pairNS != null && row.pairNS > 0;
      const validEW = row.pairEW != null && row.pairEW > 0;
      if (validNS && validEW && row.pairNS === row.pairEW) return true;
      const sectionKey = row.section == null ? "" : row.section;
      if (validNS) nsKeys.add(`${sectionKey}|${row.boardNo}|${row.pairNS}`);
      if (validEW) ewKeys.add(`${sectionKey}|${row.boardNo}|${row.pairEW}`);
    }
    for (const key of nsKeys) {
      if (ewKeys.has(key)) return true;
    }
    return false;
  }

  function defaultReportPair(results) {
    if (!results || !results.pairStandings.length) return "";
    const first = [...results.pairStandings].sort((a, b) => numericPairSort(a.pairNo, b.pairNo))[0];
    return first ? String(first.key) : "";
  }

  function contractClassRank(className) {
    if (className === "Slam-level") return 3;
    if (className === "Game-level") return 2;
    if (className === "Partscore") return 1;
    return 0;
  }

  function bestMakeableForPair(board, pair) {
    if (!board || !board.optimumRows.length) return { className: "Unknown", rank: 0, text: "" };
    const pairRows = board.optimumRows.filter((row) => row.pair === pair);
    if (!pairRows.length) return { className: "Unknown", rank: 0, text: "" };
    const best = pairRows
      .filter((row) => row.makeableLevel >= 1)
      .map((row) => {
        const className = classifyContract(row.makeableLevel, row.denomination);
        return {
          ...row,
          className,
          rank: contractClassRank(className),
          text: `${row.declarer} ${row.makeableLevel} ${row.denomination === "N" ? "NT" : row.denomination}`
        };
      })
      .sort((a, b) => b.rank - a.rank || b.makeableLevel - a.makeableLevel)[0];
    return best || { className: "None", rank: 0, text: "Nothing makes" };
  }

  function contractTarget(contract) {
    return contract && contract.level ? contract.level + 6 : null;
  }

  function pairResultView(results, row, participantKey) {
    const pairKey = String(participantKey);
    const isNS = String(row.nsParticipantKey) === pairKey;
    const isEW = String(row.ewParticipantKey) === pairKey;
    if (!isNS && !isEW) return null;
    const side = isNS ? "NS" : "EW";
    const boardRows = results.rowsByField.get(row.fieldKey) || [];
    const pairScore = row.scoreNS == null ? null : isNS ? row.scoreNS : -row.scoreNS;
    const fieldScores = boardRows
      .map((entry) => entry.scoreNS == null ? null : isNS ? entry.scoreNS : -entry.scoreNS)
      .filter((value) => value != null);
    const fieldAverage = fieldScores.length ? average(fieldScores) : null;
    const parScore = row.parNS == null ? null : isNS ? row.parNS : -row.parNS;
    const matchpoints = isNS ? row.nsMatchpoints : row.ewMatchpoints;
    const percent = isNS ? row.nsPercent : row.ewPercent;
    const declared = row.declarerPair === side;
    const trickDeltaForPair = row.ddDelta == null ? null : declared ? row.ddDelta : -row.ddDelta;
    const bestMakeable = bestMakeableForPair(row.board, side);
    const fieldDelta = pairScore != null && fieldAverage != null ? pairScore - fieldAverage : null;
    const vsPar = pairScore != null && parScore != null ? pairScore - parScore : null;

    return {
      row,
      side,
      participantKey: pairKey,
      participantNo: isNS ? row.nsParticipantNo : row.ewParticipantNo,
      players: isNS ? row.nsParticipantPlayers : row.ewParticipantPlayers,
      declared,
      pairScore,
      matchpoints,
      percent,
      mpLoss: row.boardTop == null || matchpoints == null ? null : row.boardTop - matchpoints,
      fieldAverage,
      fieldDelta,
      parScore,
      vsPar,
      trickDeltaForPair,
      bestMakeable
    };
  }

  function addReviewReason(reasons, label, tone, weight) {
    reasons.push({ label, tone: tone || "", weight: weight || 0 });
  }

  function analyzeReviewItem(view) {
    const row = view.row;
    const reasons = [];
    let severity = 0;
    const pct = view.percent == null ? 100 : view.percent;
    const mpLoss = view.mpLoss || 0;
    const fieldLoss = view.fieldDelta == null ? 0 : Math.max(0, -view.fieldDelta);
    const parLoss = view.vsPar == null ? 0 : Math.max(0, -view.vsPar);
    const actualRank = view.declared ? contractClassRank(row.contractClass) : 0;
    const target = contractTarget(row.parsedContract);
    const failedContract = view.declared && target != null && row.tricks != null && row.tricks < target;

    if (pct <= 25) addReviewReason(reasons, "low board", "red", 35);
    else if (pct <= 40) addReviewReason(reasons, "below average board", "gold", 18);

    if (row.boardTop && mpLoss >= row.boardTop * 0.5) addReviewReason(reasons, "large matchpoint loss", "red", 28);
    if (fieldLoss >= 500) addReviewReason(reasons, "far below field", "red", 26);
    else if (fieldLoss >= 200) addReviewReason(reasons, "below field", "gold", 14);

    if (parLoss >= 500) addReviewReason(reasons, "well below par", "red", 24);
    else if (parLoss >= 200) addReviewReason(reasons, "below par", "gold", 12);

    if (view.trickDeltaForPair != null && view.trickDeltaForPair <= -2) addReviewReason(reasons, "multiple trick loss vs DD", "red", 24);
    else if (view.trickDeltaForPair === -1) addReviewReason(reasons, view.declared ? "declarer trick loss vs DD" : "defensive trick loss vs DD", "gold", 13);

    if (failedContract) {
      addReviewReason(reasons, row.parsedContract.doubled ? "failed doubled contract" : "failed contract", "red", row.parsedContract.doubled ? 28 : 18);
    }

    if (view.bestMakeable.rank >= 3 && actualRank < 3 && pct < 60) addReviewReason(reasons, "slam potential", "gold", 20);
    else if (view.bestMakeable.rank >= 2 && actualRank < 2 && pct < 60) addReviewReason(reasons, "game available", "gold", 16);

    if (!view.declared && view.bestMakeable.rank >= 2 && pct < 45) {
      addReviewReason(reasons, "competitive auction review", "gold", 14);
    }

    if (!reasons.length && pct < 50) addReviewReason(reasons, "small loss", "", 6);

    severity += Math.max(0, 100 - pct) * 0.7;
    severity += mpLoss * 4;
    severity += Math.min(35, fieldLoss / 25);
    severity += Math.min(35, parLoss / 25);
    if (view.trickDeltaForPair != null && view.trickDeltaForPair < 0) severity += Math.abs(view.trickDeltaForPair) * 14;
    severity += reasons.reduce((acc, reason) => acc + reason.weight, 0);

    return {
      ...view,
      reasons,
      severity
    };
  }

  function lossCategoryInfo(key) {
    return LOSS_CATEGORY_INFO[key] || LOSS_CATEGORY_INFO.outlier;
  }

  function decisionTypeInfoForCategory(categoryKey) {
    return Object.entries(DECISION_TYPE_INFO)
      .map(([key, info]) => ({ key, ...info }))
      .find((info) => info.categories.includes(categoryKey)) || { key: "manualReview", ...DECISION_TYPE_INFO.manualReview };
  }

  function buildDecisionTypeSummary(lossLedger) {
    const typeMap = new Map();
    if (!lossLedger || !lossLedger.categories) return [];

    lossLedger.categories.forEach((category) => {
      const info = decisionTypeInfoForCategory(category.key);
      if (!typeMap.has(info.key)) {
        typeMap.set(info.key, {
          key: info.key,
          label: info.label,
          tone: info.tone,
          advice: info.advice,
          totalLoss: 0,
          boardCount: 0,
          comparisonCount: 0,
          boards: new Set(),
          categoryLabels: [],
          comparisons: []
        });
      }
      const type = typeMap.get(info.key);
      type.totalLoss += category.totalLoss;
      type.comparisonCount += category.comparisonCount;
      category.boards.forEach((boardNo) => type.boards.add(String(boardNo)));
      type.categoryLabels.push(category.label);
      type.comparisons.push(...category.comparisons);
    });

    return Array.from(typeMap.values())
      .map((type) => ({
        ...type,
        boardCount: type.boards.size,
        boards: Array.from(type.boards).sort(numericPairSort),
        categoryLabels: uniqueSorted(type.categoryLabels),
        examples: buildLossExamples(type.comparisons)
      }))
      .sort((a, b) => b.totalLoss - a.totalLoss || a.label.localeCompare(b.label));
  }

  function sideScore(row, side) {
    if (!row || row.scoreNS == null) return null;
    return side === "NS" ? row.scoreNS : -row.scoreNS;
  }

  function sideMatchpoints(row, side) {
    return side === "NS" ? row.nsMatchpoints : row.ewMatchpoints;
  }

  function sidePercent(row, side) {
    return side === "NS" ? row.nsPercent : row.ewPercent;
  }

  function sideParticipantKey(row, side) {
    return side === "NS" ? row.nsParticipantKey : row.ewParticipantKey;
  }

  function sideParticipantNo(row, side) {
    return side === "NS" ? row.nsParticipantNo || row.pairNS : row.ewParticipantNo || row.pairEW;
  }

  function sideParticipantPlayers(row, side) {
    return side === "NS" ? row.nsParticipantPlayers || row.nsPlayers : row.ewParticipantPlayers || row.ewPlayers;
  }

  function rowContractText(row) {
    if (!row) return "No contract";
    if (row.adjustment && row.scoreNS == null) return `Adjusted ${row.adjustment.nsPercent}%/${row.adjustment.ewPercent}%`;
    return `${row.declarerSide || ""} ${row.contract || ""}${row.result || ""}`.trim() || "No contract";
  }

  function dominantBoardLoss(boardItem) {
    if (!boardItem || !boardItem.comparisons || !boardItem.comparisons.length) return null;
    const map = new Map();
    boardItem.comparisons.forEach((comparison) => {
      if (!map.has(comparison.categoryKey)) {
        const info = lossCategoryInfo(comparison.categoryKey);
        map.set(comparison.categoryKey, {
          key: comparison.categoryKey,
          label: info.label,
          loss: 0,
          comparisons: []
        });
      }
      const entry = map.get(comparison.categoryKey);
      entry.loss += comparison.loss;
      entry.comparisons.push(comparison);
    });
    return Array.from(map.values())
      .sort((a, b) => b.loss - a.loss || b.comparisons.length - a.comparisons.length)[0] || null;
  }

  function comparisonSameContract(comparison) {
    return samePlayedContract(
      comparison && comparison.targetRow ? comparison.targetRow.parsedContract : null,
      comparison && comparison.peerRow ? comparison.peerRow.parsedContract : null
    );
  }

  function diagnosisConfidence(item, boardItem, dominant) {
    if (!boardItem || !dominant) {
      return {
        level: "low",
        label: "Low Confidence",
        detail: "No same-direction peer loss was found, so this is a general review suggestion."
      };
    }

    const sameContractCount = dominant.comparisons.filter(comparisonSameContract).length;
    const maxDelta = Math.max(...dominant.comparisons.map((comparison) => comparison.scoreDelta || 0));
    if (["declarerTricks", "defensiveTricks"].includes(dominant.key) && sameContractCount) {
      return {
        level: "high",
        label: "High Confidence",
        detail: "Same-direction peers produced a better score in the same or directly comparable contract."
      };
    }
    if (["missedGameSlam", "overreach", "penaltyDouble"].includes(dominant.key) && (dominant.loss >= 2 || maxDelta >= 300)) {
      return {
        level: "high",
        label: "High Confidence",
        detail: "Multiple peer comparisons or a large score gap point to the same decision area."
      };
    }
    if (dominant.key === "outlier") {
      return {
        level: "low",
        label: "Low Confidence",
        detail: "The traveler shows a loss, but contract and trick clues do not isolate one clear cause."
      };
    }
    if (dominant.key === "tieSplit") {
      return {
        level: "medium",
        label: "Medium Confidence",
        detail: "The loss comes from tied peer comparisons, usually thin overtrick or undertrick edges."
      };
    }
    if (dominant.loss >= 1.5 || dominant.comparisons.length >= 2 || item.severity >= 60) {
      return {
        level: "medium",
        label: "Medium Confidence",
        detail: "The same-direction traveler supports the diagnosis, but the exact auction or play decision still needs review."
      };
    }
    return {
      level: "low",
      label: "Low Confidence",
      detail: "Treat this as a review prompt rather than a firm diagnosis."
    };
  }

  function peerDisplayName(pairNo, players) {
    const pair = pairNo == null || pairNo === "" ? "Peer" : `Pair ${pairNo}`;
    return players ? `${pair} - ${players}` : pair;
  }

  function buildSwingDiagnosis(item, boardItem) {
    const dominant = dominantBoardLoss(boardItem);
    const confidence = diagnosisConfidence(item, boardItem, dominant);
    if (!boardItem || !dominant) {
      return {
        categoryKey: "",
        categoryLabel: "Review Candidate",
        lostMp: item.mpLoss || 0,
        confidence,
        explanation: reviewPriorityAdvice(item)
      };
    }

    const comparisons = [...dominant.comparisons].sort((a, b) => b.scoreDelta - a.scoreDelta || b.loss - a.loss);
    const bestPeer = comparisons[0];
    const peerName = bestPeer ? peerDisplayName(bestPeer.peerPair, bestPeer.peerPlayers) : "A same-direction peer";
    const targetText = `${boardItem.targetContract} for ${formatSigned(boardItem.targetScore)}`;
    const peerText = bestPeer ? `${bestPeer.peerContract} for ${formatSigned(bestPeer.peerScore)}` : "a better score";
    const lossText = `${formatMp(dominant.loss)} MP`;
    let explanation;

    if (dominant.key === "declarerTricks") {
      explanation = `This pair lost ${lossText} mainly because same-direction peers took more tricks in the same contract family. Compare ${targetText} with ${peerName}'s ${peerText}.`;
    } else if (dominant.key === "defensiveTricks") {
      explanation = `This pair lost ${lossText} on defense. Same-direction peers defended the same or similar contract more profitably; start with opening lead, shifts, and cash-out timing.`;
    } else if (dominant.key === "missedGameSlam") {
      explanation = `This pair lost ${lossText} because peers reached a game or slam bonus that this table did not. Compare the auction with ${peerName}'s ${peerText}.`;
    } else if (dominant.key === "overreach") {
      explanation = `This pair lost ${lossText} after landing too high or in a costly contract. Check whether stopping lower, passing, or defending would have protected the matchpoints.`;
    } else if (dominant.key === "wrongStrain") {
      explanation = `This pair lost ${lossText} to strain choice. Compare ${targetText} with ${peerName}'s ${peerText} and look for the auction clue that found the better denomination.`;
    } else if (dominant.key === "penaltyDouble") {
      explanation = `This pair lost ${lossText} around a doubled, redoubled, penalty, or sacrifice decision. Review the vulnerability and whether the double or sacrifice was earning its keep.`;
    } else if (dominant.key === "competitiveAuction" || dominant.key === "partscoreBattle") {
      explanation = `This pair lost ${lossText} in a competitive or partscore position. Compare who bought the contract, at what level, and whether an extra trick changed the board.`;
    } else if (dominant.key === "tieSplit") {
      explanation = `${lossText} came from tied same-direction comparisons. Look for small overtrick, undertrick, or partscore details that could turn ties into wins.`;
    } else {
      explanation = `This pair lost ${lossText} against same-direction peers, but the traveler does not isolate one clear cause. Use the peer table to compare contracts and scores.`;
    }

    return {
      categoryKey: dominant.key,
      categoryLabel: dominant.label,
      lostMp: dominant.loss,
      confidence,
      explanation
    };
  }

  function buildSameDirectionPeerComparison(results, view) {
    const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
    const rows = boardRows
      .map((row) => {
        const score = sideScore(row, view.side);
        if (score == null) return null;
        const matchpoints = sideMatchpoints(row, view.side);
        const percent = sidePercent(row, view.side);
        const pairNo = sideParticipantNo(row, view.side);
        const players = sideParticipantPlayers(row, view.side);
        return {
          row,
          isTarget: row === view.row,
          pairNo,
          players,
          contract: rowContractText(row),
          score,
          matchpoints,
          percent,
          scoreDelta: view.pairScore == null ? null : score - view.pairScore,
          mpDelta: view.matchpoints == null || matchpoints == null ? null : matchpoints - view.matchpoints
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || numericPairSort(a.pairNo, b.pairNo));
    const targetIndex = rows.findIndex((entry) => entry.isTarget);
    return {
      boardNo: view.row.boardNo,
      side: view.side,
      rows,
      targetRank: targetIndex >= 0 ? targetIndex + 1 : null,
      peerCount: Math.max(0, rows.length - 1)
    };
  }

  function samePlayedContract(a, b) {
    if (!a || !b) return false;
    if (a.passout || b.passout) return a.passout && b.passout;
    return !!a.level &&
      a.level === b.level &&
      a.strain === b.strain &&
      (a.doubled || "") === (b.doubled || "");
  }

  function contractMadeByRow(row) {
    const target = contractTarget(row && row.parsedContract);
    if (target == null || row.tricks == null) return null;
    return row.tricks >= target;
  }

  function classifyLossComparison(view, peerRow, peerScore, scoreDelta, loss) {
    const row = view.row;
    const side = view.side;
    const targetContract = row.parsedContract || {};
    const peerContract = peerRow.parsedContract || {};
    const targetDeclared = view.declared;
    const peerDeclared = peerRow.declarerPair === side;
    const targetMade = contractMadeByRow(row);
    const peerMade = contractMadeByRow(peerRow);
    const targetRank = targetDeclared ? contractClassRank(row.contractClass) : 0;
    const peerRank = peerDeclared ? contractClassRank(peerRow.contractClass) : 0;
    const targetContractRank = contractClassRank(row.contractClass);
    const peerContractRank = contractClassRank(peerRow.contractClass);
    const sameContract = samePlayedContract(targetContract, peerContract);
    const targetFailed = targetDeclared && targetMade === false;
    const smallScoreContext = Math.max(Math.abs(view.pairScore || 0), Math.abs(peerScore || 0)) <= 220;
    const partscoreContext = targetContractRank <= 1 && peerContractRank <= 1;

    if (loss === 0.5 && scoreDelta === 0) return { key: "tieSplit" };
    if (sameContract && targetDeclared && peerDeclared && row.tricks != null && peerRow.tricks != null && peerRow.tricks > row.tricks) {
      return { key: "declarerTricks" };
    }
    if (sameContract && !targetDeclared && !peerDeclared) return { key: "defensiveTricks" };
    if (targetContract.doubled || peerContract.doubled) return { key: "penaltyDouble" };
    if (targetFailed && (scoreDelta >= 200 || peerMade || !peerDeclared)) return { key: "overreach" };
    if (peerDeclared && peerRank >= 2 && peerRank > targetRank && peerMade !== false) return { key: "missedGameSlam" };

    if (targetDeclared && peerDeclared && targetContract.strain && peerContract.strain && targetContract.strain !== peerContract.strain) {
      const levelGap = Math.abs((targetContract.level || 0) - (peerContract.level || 0));
      if (levelGap <= 1) return { key: "wrongStrain" };
    }

    if ((smallScoreContext || partscoreContext) && targetContractRank <= 1 && peerContractRank <= 1) {
      return { key: "partscoreBattle" };
    }
    if (targetDeclared && peerDeclared && !sameContract) return { key: "contractSelection" };
    if (targetDeclared !== peerDeclared) return { key: "competitiveAuction" };
    if (!targetDeclared) return { key: "competitiveAuction" };
    return { key: "outlier" };
  }

  function buildBoardLossItem(results, view) {
    const boardRows = results.rowsByField.get(view.row.fieldKey) || [];
    if (view.pairScore == null) return null;
    const comparisons = [];

    boardRows.forEach((peerRow) => {
      if (peerRow === view.row || peerRow.scoreNS == null) return;
      if (String(sideParticipantKey(peerRow, view.side)) === String(view.participantKey)) return;
      const peerScore = sideScore(peerRow, view.side);
      if (peerScore == null) return;
      const scoreDelta = peerScore - view.pairScore;
      const loss = scoreDelta > 0 ? 1 : scoreDelta === 0 ? 0.5 : 0;
      if (!loss) return;
      const classification = classifyLossComparison(view, peerRow, peerScore, scoreDelta, loss);
      const info = lossCategoryInfo(classification.key);
      comparisons.push({
        boardNo: view.row.boardNo,
        side: view.side,
        categoryKey: classification.key,
        categoryLabel: info.label,
        loss,
        scoreDelta,
        targetRow: view.row,
        targetScore: view.pairScore,
        targetContract: rowContractText(view.row),
        targetPercent: view.percent,
        peerRow,
        peerScore,
        peerContract: rowContractText(peerRow),
        peerPair: sideParticipantNo(peerRow, view.side),
        peerPlayers: sideParticipantPlayers(peerRow, view.side)
      });
    });

    if (!comparisons.length) return null;
    return {
      boardNo: view.row.boardNo,
      side: view.side,
      row: view.row,
      targetScore: view.pairScore,
      targetContract: rowContractText(view.row),
      targetPercent: view.percent,
      matchpoints: view.matchpoints,
      boardTop: view.row.boardTop,
      totalLoss: sum(comparisons.map((comparison) => comparison.loss)),
      comparisons
    };
  }

  function buildLossExamples(comparisons) {
    const examplesByBoard = new Map();
    comparisons.forEach((comparison) => {
      const key = String(comparison.boardNo);
      if (!examplesByBoard.has(key)) {
        examplesByBoard.set(key, {
          boardNo: comparison.boardNo,
          side: comparison.side,
          targetScore: comparison.targetScore,
          targetContract: comparison.targetContract,
          targetPercent: comparison.targetPercent,
          loss: 0,
          maxDelta: 0,
          comparisons: []
        });
      }
      const example = examplesByBoard.get(key);
      example.loss += comparison.loss;
      example.maxDelta = Math.max(example.maxDelta, comparison.scoreDelta);
      example.comparisons.push(comparison);
    });

    return Array.from(examplesByBoard.values())
      .map((example) => ({
        ...example,
        comparisons: example.comparisons.sort((a, b) => b.scoreDelta - a.scoreDelta || b.loss - a.loss)
      }))
      .sort((a, b) => b.loss - a.loss || b.maxDelta - a.maxDelta || a.boardNo - b.boardNo);
  }

  function buildPairLossLedger(results, views) {
    const boardItems = views
      .map((view) => buildBoardLossItem(results, view))
      .filter(Boolean)
      .sort((a, b) => b.totalLoss - a.totalLoss || a.boardNo - b.boardNo);
    const categoryMap = new Map();
    let totalLoss = 0;
    let tieLoss = 0;
    let outrightLoss = 0;

    boardItems.forEach((boardItem) => {
      boardItem.comparisons.forEach((comparison) => {
        const info = lossCategoryInfo(comparison.categoryKey);
        if (!categoryMap.has(comparison.categoryKey)) {
          categoryMap.set(comparison.categoryKey, {
            key: comparison.categoryKey,
            label: info.label,
            tone: info.tone,
            advice: info.advice,
            totalLoss: 0,
            comparisonCount: 0,
            boards: new Set(),
            comparisons: []
          });
        }
        const category = categoryMap.get(comparison.categoryKey);
        category.totalLoss += comparison.loss;
        category.comparisonCount += 1;
        category.boards.add(String(comparison.boardNo));
        category.comparisons.push(comparison);
        totalLoss += comparison.loss;
        if (comparison.loss === 0.5 && comparison.scoreDelta === 0) tieLoss += comparison.loss;
        else outrightLoss += comparison.loss;
      });
    });

    const orderIndex = new Map(LOSS_CATEGORY_ORDER.map((key, index) => [key, index]));
    const categories = Array.from(categoryMap.values())
      .map((category) => ({
        ...category,
        boardCount: category.boards.size,
        examples: buildLossExamples(category.comparisons),
        boards: Array.from(category.boards)
      }))
      .sort((a, b) => {
        return b.totalLoss - a.totalLoss ||
          (orderIndex.get(a.key) ?? 99) - (orderIndex.get(b.key) ?? 99);
      });

    return {
      totalLoss,
      outrightLoss,
      tieLoss,
      boardCount: boardItems.length,
      categoryCount: categories.length,
      boardItems,
      categories
    };
  }

  function averagePercentForViews(views) {
    const percents = views.map((view) => view.percent).filter((value) => value != null);
    return percents.length ? average(percents) : null;
  }

  function buildViewStat(label, views) {
    const percent = averagePercentForViews(views);
    const losses = views.map((view) => view.mpLoss).filter((value) => value != null);
    return {
      label,
      count: views.length,
      percent,
      averageLoss: losses.length ? average(losses) : null
    };
  }

  function bestStat(stats) {
    return stats
      .filter((stat) => stat.count >= 2 && stat.percent != null)
      .sort((a, b) => b.percent - a.percent || b.count - a.count)[0] || null;
  }

  function weakestStat(stats) {
    return stats
      .filter((stat) => stat.count >= 2 && stat.percent != null)
      .sort((a, b) => a.percent - b.percent || b.count - a.count)[0] || null;
  }

  function buildPairProfile(views, lossLedger, decisionTypes) {
    const roleStats = [
      buildViewStat("Declaring", views.filter((view) => view.declared)),
      buildViewStat("Defending", views.filter((view) => !view.declared))
    ];
    const classGroups = new Map();
    views.forEach((view) => {
      const label = view.row.contractClass || "Unknown";
      if (!classGroups.has(label)) classGroups.set(label, []);
      classGroups.get(label).push(view);
    });
    const contractStats = Array.from(classGroups.entries()).map(([label, group]) => buildViewStat(label, group));
    const strongestRole = bestStat(roleStats);
    const weakestRole = weakestStat(roleStats);
    const strongestContract = bestStat(contractStats);
    const weakestContract = weakestStat(contractStats);
    const topCategory = lossLedger && lossLedger.categories ? lossLedger.categories[0] : null;
    const topDecisionType = decisionTypes && decisionTypes.length ? decisionTypes[0] : null;
    const highBoards = views.filter((view) => view.percent != null && view.percent >= 65).length;
    const lowBoards = views.filter((view) => view.percent != null && view.percent <= 35).length;
    const strengths = [];
    const weaknesses = [];

    if (strongestRole && strongestRole.percent >= 50) {
      strengths.push({
        label: "Best Role",
        value: `${strongestRole.label} ${strongestRole.percent.toFixed(1)}%`,
        detail: `${plural(strongestRole.count, "board")} in this role.`
      });
    }
    if (strongestContract && strongestContract.percent >= 50 && (!strongestRole || strongestContract.label !== strongestRole.label)) {
      strengths.push({
        label: "Best Contract Class",
        value: `${strongestContract.label} ${strongestContract.percent.toFixed(1)}%`,
        detail: `${plural(strongestContract.count, "result")} in this class.`
      });
    }
    if (highBoards) {
      strengths.push({
        label: "High Boards",
        value: plural(highBoards, "board"),
        detail: "Boards at 65% or better show where the pair converted chances."
      });
    }

    if (topCategory) {
      weaknesses.push({
        label: "Biggest Loss Theme",
        value: topCategory.label,
        detail: `${formatMp(topCategory.totalLoss)} lost MP on ${plural(topCategory.boardCount, "board")}.`
      });
    }
    if (weakestRole && weakestRole.percent < 50) {
      weaknesses.push({
        label: "Weakest Role",
        value: `${weakestRole.label} ${weakestRole.percent.toFixed(1)}%`,
        detail: `${plural(weakestRole.count, "board")} in this role.`
      });
    }
    if (weakestContract && weakestContract.percent < 50) {
      weaknesses.push({
        label: "Weakest Contract Class",
        value: `${weakestContract.label} ${weakestContract.percent.toFixed(1)}%`,
        detail: `${plural(weakestContract.count, "result")} in this class.`
      });
    }
    if (lowBoards) {
      weaknesses.push({
        label: "Low Boards",
        value: plural(lowBoards, "board"),
        detail: "Boards at 35% or worse are the best candidates for detailed partnership review."
      });
    }

    const focus = topDecisionType
      ? `The largest improvement area is ${topDecisionType.label.toLowerCase()}, worth ${formatMp(topDecisionType.totalLoss)} lost MP across ${plural(topDecisionType.boardCount, "board")}. ${topDecisionType.advice}`
      : "No same-direction loss pattern stands out. Review the lowest boards first and look for small scoring edges.";

    return {
      strengths: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 3),
      roleStats,
      contractStats,
      focus
    };
  }

  function buildPracticePriorities(lossLedger, decisionTypes, views) {
    const priorities = [];
    decisionTypes.slice(0, 5).forEach((type) => {
      priorities.push({
        title: type.label,
        metric: `${formatMp(type.totalLoss)} lost MP`,
        detail: `${plural(type.boardCount, "board")} / ${plural(type.comparisonCount, "comparison")}`,
        advice: type.advice,
        boards: type.examples.slice(0, 4).map((example) => example.boardNo)
      });
    });

    if (priorities.length < 3) {
      const lowBoards = views.filter((view) => view.percent != null && view.percent <= 35);
      if (lowBoards.length) {
        priorities.push({
          title: "Low-Board Triage",
          metric: plural(lowBoards.length, "board"),
          detail: "Boards at 35% or worse",
          advice: "Start with the lowest boards and ask whether the first swing came from the auction, opening lead, declarer plan, or defense.",
          boards: lowBoards.slice(0, 4).map((view) => view.row.boardNo)
        });
      }
    }

    if (priorities.length < 3) {
      const trickLosses = views.filter((view) => view.trickDeltaForPair != null && view.trickDeltaForPair < 0);
      if (trickLosses.length) {
        priorities.push({
          title: "Double-Dummy Trick Checks",
          metric: plural(trickLosses.length, "board"),
          detail: "Actual tricks below double-dummy expectation",
          advice: "Use double-dummy only after replaying the hand yourself; then compare where best play finds the missing trick.",
          boards: trickLosses.slice(0, 4).map((view) => view.row.boardNo)
        });
      }
    }

    if (!priorities.length) {
      priorities.push({
        title: "Maintain The Baseline",
        metric: "No major loss pattern",
        detail: "Same-direction traveler losses are limited",
        advice: "Use the review queue to look for thin overtricks, judgment calls, and partnership agreement refinements.",
        boards: views.slice(0, 4).map((view) => view.row.boardNo)
      });
    }

    return priorities.slice(0, 5);
  }

  function buildPairImprovementReport(results, participantKey) {
    if (!results || !participantKey) return null;
    const key = String(participantKey);
    const standing = results.pairStandings.find((entry) => String(entry.key) === key);
    const views = results.rows
      .map((row) => pairResultView(results, row, key))
      .filter(Boolean);
    if (!views.length) return null;

    const lossLedger = buildPairLossLedger(results, views);
    const boardLossItemsByNo = new Map(lossLedger.boardItems.map((item) => [String(item.boardNo), item]));
    const analyzed = views.map(analyzeReviewItem).map((item) => {
      const boardLossItem = boardLossItemsByNo.get(String(item.row.boardNo)) || null;
      return {
        ...item,
        boardLossItem,
        peerComparison: buildSameDirectionPeerComparison(results, item),
        diagnosis: buildSwingDiagnosis(item, boardLossItem)
      };
    });
    const candidates = analyzed.filter((item) =>
      (item.reasons.length || item.severity >= 20) &&
      !(item.row.adjustment && item.row.scoreNS == null));
    const reviewed = candidates
      .sort((a, b) => b.severity - a.severity || (a.percent || 0) - (b.percent || 0))
      .slice(0, 10);
    const percents = views.map((view) => view.percent).filter((value) => value != null);
    const vsParValues = views.map((view) => view.vsPar).filter((value) => value != null);
    const trickLosses = views.filter((view) => view.trickDeltaForPair != null && view.trickDeltaForPair < 0);
    const lowBoards = views.filter((view) => view.percent != null && view.percent <= 35);
    const fieldLosses = views.filter((view) => view.fieldDelta != null && view.fieldDelta <= -200);
    const decisionTypes = buildDecisionTypeSummary(lossLedger);
    const profile = buildPairProfile(views, lossLedger, decisionTypes);
    const practicePriorities = buildPracticePriorities(lossLedger, decisionTypes, views);

    return {
      pairKey: key,
      pairNo: standing ? standing.pairNo : key,
      standing,
      rows: views,
      reviewItems: reviewed,
      lossLedger,
      decisionTypes,
      practicePriorities,
      profile,
      summary: {
        boards: views.length,
        players: standing ? standing.players : views[0].players,
        percent: standing && standing.percent != null ? standing.percent : percents.length ? average(percents) : null,
        averageBoardPercent: percents.length ? average(percents) : null,
        lowBoards: lowBoards.length,
        fieldLosses: fieldLosses.length,
        averageVsPar: vsParValues.length ? average(vsParValues) : null,
        lostMatchpoints: lossLedger.totalLoss,
        lossCategories: lossLedger.categoryCount,
        trickLossBoards: trickLosses.length,
        declaredBoards: views.filter((view) => view.declared).length,
        defendedBoards: views.filter((view) => !view.declared).length
      }
    };
  }

  function suitMeta(key) {
    return SUITS.find((suit) => suit.key === key) || SUITS[0];
  }

  function denomMeta(key) {
    return DENOMS.find((denom) => denom.key === key) || DENOMS[0];
  }

  function sideClass(edge) {
    return edge === "NS" ? "ns" : edge === "EW" ? "ew" : "";
  }

  function boardSearchText(board) {
    const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
    return [
      board.boardNo,
      board.dealer,
      board.vulnerable,
      board.tags.ParContract,
      board.tags.OptimumScore,
      board.deal.raw,
      board.voids.join(" "),
      board.longSuits.join(" "),
      resultSummary ? resultSummary.rows.map((row) => `${row.contract} ${row.result} ${row.pairNS} ${row.pairEW} ${row.scoreNS} ${row.nsPlayers} ${row.ewPlayers} ${row.declarerName}`).join(" ") : ""
    ].join(" ").toLowerCase();
  }

  function defaultFilters() {
    return {
      search: "",
      side: "all",
      className: "all",
      vulnerability: "all",
      played: "all"
    };
  }

  function emptyAnalysis() {
    return {
      parsed: { fileName: "", directives: [], warnings: [] },
      directiveMap: new Map(),
      boards: [],
      tagKeys: [],
      summary: {
        boardCount: 0,
        validDeals: 0,
        boardsWithActualResults: 0,
        boardsMissingActualResults: 0,
        parEdges: {},
        classes: {},
        slamLevelBoards: [],
        averageHcpByPair: { NS: 0, EW: 0 }
      }
    };
  }

  function setCurrentPbn(text, fileName) {
    const parsed = parsePbn(text, fileName);
    const analysis = buildAnalysis(parsed);
    STATE.parsed = parsed;
    STATE.analysis = analysis;
    STATE.results = STATE.rawResults ? buildResultsAnalysis(STATE.rawResults, analysis) : null;
    STATE.reportPair = STATE.results ? defaultReportPair(STATE.results) : "";
    STATE.activeView = STATE.results ? "improve" : "overview";
    STATE.selectedBoardNo = analysis.boards[0] ? String(analysis.boards[0].boardNo) : "";
    STATE.rowMode = STATE.results ? "results" : "boards";
    STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, analysis));
    STATE.filters = defaultFilters();
    if (STATE.results) STATE.filters.played = "played";
    renderAll();
    showToast(`Loaded ${plural(analysis.summary.boardCount, "board")}${STATE.results ? ` and joined ${plural(STATE.results.summary.resultCount, "result")}` : ""}.`);
  }

  function clearLoadedData() {
    const hadData = Boolean(STATE.analysis || STATE.rawResults || STATE.results);
    STATE.parsed = null;
    STATE.analysis = null;
    STATE.rawResults = null;
    STATE.results = null;
    STATE.reportPair = "";
    STATE.activeView = "overview";
    STATE.selectedBoardNo = "";
    STATE.scoreOutliersOnly = false;
    STATE.rowMode = "boards";
    STATE.selectedColumns = new Set();
    STATE.filters = defaultFilters();
    document.getElementById("fileSubtitle").textContent = "Open a Portable Bridge Notation hand record.";
    renderAll();
    showToast(hadData ? "Cleared loaded files." : "No loaded files to clear.");
  }

  function pbnHeaderDetails(analysis) {
    if (!analysis) return { event: "", date: "" };
    const firstBoard = analysis && analysis.boards ? analysis.boards[0] || { tags: {} } : { tags: {} };
    return {
      event: firstDirective(analysis, ["HRTitleEvent"]) || firstBoard.tags.Event || "",
      date: firstDirective(analysis, ["HRTitleDate"]) || firstBoard.tags.Date || ""
    };
  }

  function appSubtitle(analysis, results) {
    if (!analysis) {
      return results
        ? `${results.fileName || "Results"} - ${plural(results.summary.resultCount, "result")} loaded; open a PBN to add deal and par analysis.`
        : "Open a Portable Bridge Notation hand record or a results file.";
    }
    const details = pbnHeaderDetails(analysis);
    const pieces = [];
    const event = String(details.event || "").replace(/\s+/g, " ").trim();
    const date = String(details.date || "").replace(/\s+/g, " ").trim();
    if (event) pieces.push(event);
    if (date) pieces.push(date);
    pieces.push(`${analysis.parsed.fileName} - ${plural(analysis.summary.boardCount, "board")}${results ? `, ${plural(results.summary.resultCount, "result")}` : ""}`);
    return pieces.join(" | ");
  }

  function setCurrentResults(rawResults) {
    const results = buildResultsAnalysis(rawResults, STATE.analysis);
    STATE.rawResults = rawResults;
    STATE.results = results;
    STATE.reportPair = defaultReportPair(results);
    STATE.activeView = "improve";
    STATE.rowMode = "results";
    STATE.selectedColumns = new Set(defaultColumnKeys("results", STATE.analysis));
    if (STATE.analysis) STATE.filters.played = "played";
    renderAll();
    showToast(`Loaded ${plural(results.summary.resultCount, "result")} from ${rawResults.sourceType}${STATE.analysis ? "" : "; open a PBN to add deal analysis"}.`);
  }

  function showToast(message, type) {
    showToast.queue = showToast.queue || [];
    showToast.queue.push({ message, type });
    if (!showToast.active) drainToastQueue();
  }

  function drainToastQueue() {
    const next = showToast.queue && showToast.queue.shift();
    if (!next) {
      showToast.active = false;
      return;
    }
    showToast.active = true;
    const toast = document.getElementById("toast");
    toast.textContent = next.message;
    toast.className = `toast${next.type === "error" ? " error" : ""}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.add("hidden");
      drainToastQueue();
    }, next.type === "error" ? 5200 : 1500);
  }

  function setElementHidden(id, hidden) {
    const element = document.getElementById(id);
    if (element) element.classList.toggle("hidden", !!hidden);
  }

  function updateDropZone(analysis, results) {
    const hasLoadedData = Boolean(analysis || results);
    document.body.classList.toggle("has-loaded-data", hasLoadedData);
    const heading = document.querySelector("#dropZone .drop-copy h2");
    const copy = document.querySelector("#dropZone .drop-copy p");
    if (!heading || !copy) return;
    if (hasLoadedData) {
      heading.textContent = "Drop another PBN, BWS, or CSV file here.";
      copy.textContent = "Loaded files stay active until you replace them or clear the session.";
    } else {
      heading.textContent = "Turn bridge deals and travelers into a readable session report.";
      copy.textContent = "Drop a PBN hand record, BWS database, or CSV results file here. Results can be opened before or after the PBN.";
    }
  }

  function availableTaskViews(analysis, results) {
    return {
      overview: Boolean(analysis),
      improve: Boolean(results && results.pairStandings.length),
      boards: Boolean(analysis),
      results: Boolean(results),
      export: Boolean(analysis || results),
      diagnostics: Boolean(analysis || results)
    };
  }

  function ensureActiveView(analysis, results) {
    const available = availableTaskViews(analysis, results);
    if (available[STATE.activeView]) return;
    if (available.improve) STATE.activeView = "improve";
    else if (available.overview) STATE.activeView = "overview";
    else if (available.results) STATE.activeView = "results";
    else if (available.export) STATE.activeView = "export";
    else STATE.activeView = "overview";
  }

  function renderTaskNav(analysis, results) {
    const nav = document.getElementById("taskNav");
    if (!nav) return;
    const hasLoadedData = Boolean(analysis || results);
    nav.classList.toggle("hidden", !hasLoadedData);
    if (!hasLoadedData) return;

    const available = availableTaskViews(analysis, results);
    nav.querySelectorAll("[data-task-view]").forEach((button) => {
      const view = button.getAttribute("data-task-view");
      const enabled = Boolean(available[view]);
      button.classList.toggle("active", view === STATE.activeView);
      button.disabled = !enabled;
      button.setAttribute("aria-current", view === STATE.activeView ? "page" : "false");
    });
  }

  function applyActiveView() {
    document.querySelectorAll("#dashboard [data-views]").forEach((element) => {
      const views = String(element.getAttribute("data-views") || "").split(/\s+/).filter(Boolean);
      element.classList.toggle("view-hidden", !views.includes(STATE.activeView));
    });
  }

  function updateFileStatus() {
    const pbnCard = document.getElementById("pbnStatusCard");
    const pbnTitle = document.getElementById("pbnStatusTitle");
    const pbnDetail = document.getElementById("pbnStatusDetail");
    const resultsCard = document.getElementById("resultsStatusCard");
    const resultsTitle = document.getElementById("resultsStatusTitle");
    const resultsDetail = document.getElementById("resultsStatusDetail");

    if (STATE.analysis) {
      const details = pbnHeaderDetails(STATE.analysis);
      const event = String(details.event || "").replace(/\s+/g, " ").trim();
      const date = String(details.date || "").replace(/\s+/g, " ").trim();
      pbnCard.className = "file-status-card loaded";
      pbnTitle.textContent = STATE.analysis.parsed.fileName || "PBN loaded";
      pbnDetail.textContent = [plural(STATE.analysis.summary.boardCount, "board"), event, date].filter(Boolean).join(" | ");
    } else {
      pbnCard.className = "file-status-card missing";
      pbnTitle.textContent = "No PBN opened";
      pbnDetail.textContent = STATE.results
        ? "Results are loaded; open a PBN to add deal, par, HCP, and double-dummy analysis."
        : "Open a PBN to enable deal, par, HCP, and double-dummy analysis.";
    }

    if (STATE.results) {
      resultsCard.className = "file-status-card loaded";
      resultsTitle.textContent = STATE.results.fileName || "Results loaded";
      resultsDetail.textContent = `${STATE.results.sourceType} | ${plural(STATE.results.summary.resultCount, "result")} | ${plural(STATE.results.summary.boardsCovered, "board")} | ${plural(STATE.results.summary.pairs, "pair")}`;
    } else {
      resultsCard.className = "file-status-card missing";
      resultsTitle.textContent = "No results uploaded";
      resultsDetail.textContent = "Open a BWS or CSV traveler file at any time.";
    }
  }

  function renderResultOnlyMetrics(results) {
    const metrics = [
      { label: "Result Rows", value: results.summary.resultCount, note: `${results.summary.scoredCount} scored` },
      { label: "Boards", value: results.summary.boardsCovered, note: "covered by results" },
      { label: "Pairs", value: results.summary.pairs, note: results.participantMode === "side" ? "side partnerships" : "pair numbers" },
      { label: "Named Players", value: results.summary.namedPlayers || 0, note: `${results.summary.playerRecords} player rows` }
    ];

    document.getElementById("metricGrid").innerHTML = metrics.map((metric) => `
      <div class="metric">
        <div class="label">${escapeHtml(metric.label)}</div>
        <div class="value">${escapeHtml(metric.value)}</div>
        <div class="note">${escapeHtml(metric.note)}</div>
      </div>
    `).join("");
  }

  function renderResultsOnlyDashboard(results) {
    setElementHidden("pbnInfoGrid", true);
    setElementHidden("pbnCharts", true);
    setElementHidden("pbnSupplementGrid", true);
    setElementHidden("boardExplorerPanel", true);
    setElementHidden("resultsPanel", false);
    setElementHidden("importDiagnosticsPanel", false);
    setElementHidden("csvPanel", false);
    document.getElementById("metricGrid").setAttribute("data-views", "overview results improve");

    if (!["results", "boardResults", "pairResults"].includes(STATE.rowMode)) {
      STATE.rowMode = "results";
      STATE.selectedColumns = new Set(defaultColumnKeys("results", null));
    }

    renderResultOnlyMetrics(results);
    renderResultsPanel(null, results);
    renderImportDiagnosticsPanel(results);
    renderResultsCharts(null, results);
    renderPairImprovementReport(results);
    renderCsvControls();
    applyActiveView();
  }

  // DOM rendering for dashboard panels, charts, reports, boards, and CSV export.
  function renderAll() {
    const analysis = STATE.analysis;
    const results = STATE.results;
    const dashboard = document.getElementById("dashboard");
    updateDropZone(analysis, results);
    ensureActiveView(analysis, results);
    updateFileStatus();
    renderTaskNav(analysis, results);
    document.getElementById("fileSubtitle").textContent = appSubtitle(analysis, results);
    if (!analysis && !results) {
      dashboard.classList.add("hidden");
      renderTaskNav(null, null);
      return;
    }

    dashboard.classList.remove("hidden");
    if (!analysis) {
      renderResultsOnlyDashboard(results);
      annotateTermTooltips(dashboard);
      return;
    }

    setElementHidden("pbnInfoGrid", false);
    setElementHidden("pbnCharts", false);
    setElementHidden("pbnSupplementGrid", false);
    setElementHidden("boardExplorerPanel", false);
    setElementHidden("resultsPanel", false);
    setElementHidden("importDiagnosticsPanel", false);
    setElementHidden("csvPanel", false);
    document.getElementById("metricGrid").setAttribute("data-views", "overview");

    document.getElementById("boardSearch").value = STATE.filters.search;
    document.getElementById("sideFilter").value = STATE.filters.side;
    document.getElementById("classFilter").value = STATE.filters.className;
    document.getElementById("vulFilter").value = STATE.filters.vulnerability;
    document.getElementById("playedFilter").value = STATE.filters.played;
    document.getElementById("rowMode").value = STATE.rowMode;
    document.getElementById("scoreOutlierToggle").checked = STATE.scoreOutliersOnly;

    renderMetrics(analysis);
    renderMetadata(analysis);
    renderQuality(analysis);
    renderResultsPanel(analysis, STATE.results);
    renderImportDiagnosticsPanel(STATE.results);
    renderCharts(analysis, STATE.results);
    renderResultsCharts(analysis, STATE.results);
    renderPairImprovementReport(STATE.results);
    renderNotables(analysis, visualBoards(analysis, STATE.results));
    renderBoards();
    renderCsvControls();
    applyActiveView();
    annotateTermTooltips(dashboard);
  }

  function renderMetrics(analysis) {
    const summary = analysis.summary;
    const results = STATE.results;
    const edgeNS = summary.parEdges.NS || 0;
    const edgeEW = summary.parEdges.EW || 0;
    const slamCount = summary.slamLevelBoards.length;
    const gameCount = summary.classes["Game-level"] || 0;
    const partCount = summary.classes.Partscore || 0;
    const avgVsPar = results && results.summary.averageVsPar != null
      ? formatSigned(Math.round(results.summary.averageVsPar))
      : null;

    const metrics = [
      { label: "Boards", value: summary.boardCount, note: `${summary.validDeals} valid deals` },
      {
        label: "Results",
        value: results ? results.summary.resultCount : summary.boardsWithActualResults,
        note: results
          ? `${results.summary.boardsCovered} boards, ${results.summary.pairs} pairs`
          : "Played contracts found"
      },
      results
        ? { label: "Avg Vs Par", value: avgVsPar, note: "NS average result" }
        : { label: "Par Edge", value: `${edgeNS}/${edgeEW}`, note: "NS / EW boards" },
      { label: "Shape Of Set", value: `${gameCount}/${slamCount}`, note: `${partCount} partscores; games / slams` }
    ];

    document.getElementById("metricGrid").innerHTML = metrics.map((metric) => `
      <div class="metric">
        <div class="label">${escapeHtml(metric.label)}</div>
        <div class="value">${escapeHtml(metric.value)}</div>
        <div class="note">${escapeHtml(metric.note)}</div>
      </div>
    `).join("");
  }

  function renderMetadata(analysis) {
    const parsed = analysis.parsed;
    const firstBoard = analysis.boards[0] || { tags: {} };
    const title = firstDirective(analysis, ["HRTitleEvent"]) || firstBoard.tags.Event || "";
    const date = firstDirective(analysis, ["HRTitleDate"]) || firstBoard.tags.Date || "";
    const items = [
      ["File", parsed.fileName],
      ["PBN", firstDirective(analysis, ["PBN"]) || "Unspecified"],
      ["Content Type", firstDirective(analysis, ["Content-type"]) || "Unspecified"],
      ["Creator", firstDirective(analysis, ["Creator"]) || firstDirective(analysis, ["Generator"]) || firstBoard.tags.Generator || "Unspecified"],
      ["Created", firstDirective(analysis, ["Created"]) || "Unspecified"],
      ["Event", title || "Blank in records"],
      ["Date", date || "Blank in records"],
      ["Set ID", firstDirective(analysis, ["HRTitleSetID"]) || "Unspecified"],
      ["Tag Types", analysis.tagKeys.length],
      ["Directives", parsed.directives.length]
    ];

    document.getElementById("headerCaption").textContent = `${plural(parsed.directives.length, "directive")} and ${plural(analysis.tagKeys.length, "tag type")}.`;
    document.getElementById("metadataGrid").innerHTML = items.map(([key, value]) => `
      <div class="metadata-item">
        <div class="key">${escapeHtml(key)}</div>
        <div class="val">${escapeHtml(value)}</div>
      </div>
    `).join("");
  }

  function renderBoardJump(boardNo, label) {
    const text = label == null ? `Board ${boardNo}` : label;
    return `<button type="button" class="board-jump" data-board-jump="${escapeHtml(boardNo)}">${escapeHtml(text)}</button>`;
  }

  function renderBoardJumpList(boardNos, limit = 8) {
    const visible = boardNos.slice(0, limit).map((boardNo) => renderBoardJump(boardNo)).join(", ");
    const more = boardNos.length > limit ? `, +${escapeHtml(boardNos.length - limit)} more` : "";
    return `${visible}${more}`;
  }

  function renderQuality(analysis) {
    const summary = analysis.summary;
    const results = STATE.results;
    const parseWarnings = analysis.parsed.warnings.length;
    const boardsMissingActualTags = analysis.boards
      .filter((board) => !(board.tags.Contract || board.tags.Declarer || board.tags.Result))
      .map((board) => board.boardNo);
    const issueBoardNos = analysis.boards.filter((board) => board.issues.length).map((board) => board.boardNo);
    const issueBoards = issueBoardNos.length;
    const quality = [
      {
        tone: summary.invalidDeals ? "red" : "",
        text: `${summary.validDeals} of ${summary.boardCount} deals have 52 unique cards.`
      },
      {
        tone: summary.boardsMissingActualResults ? "gold" : "",
        text: "Played contract and result fields are present.",
        html: boardsMissingActualTags.length
          ? `${escapeHtml(summary.boardsMissingActualResults)} PBN records do not contain played contract, declarer, or result tags (${renderBoardJumpList(boardsMissingActualTags)}).`
          : ""
      },
      {
        tone: parseWarnings ? "gold" : "",
        text: parseWarnings ? `${parseWarnings} preamble or parse warnings were recorded.` : "No parser warnings."
      },
      {
        tone: issueBoards ? "gold" : "",
        text: "Every board has deal, par, and optimum score fields.",
        html: issueBoards ? `${escapeHtml(issueBoards)} boards have missing par, score, or deal analysis fields (${renderBoardJumpList(issueBoardNos)}).` : ""
      }
    ];

    if (results) {
      const compatibility = results.summary.compatibility;
      const compatibilityTone = compatibility.status === "mismatch" ? "red" : compatibility.status === "warning" || compatibility.status === "partial" || compatibility.status === "unknown" ? "gold" : "";
      quality.push({
        tone: compatibilityTone,
        text: `${compatibility.label}.`,
        html: `${escapeHtml(compatibility.label)}${compatibility.score == null ? "" : ` (${escapeHtml(compatibility.score)}/100)`}: ${escapeHtml(compatibility.primaryConcern || compatibility.details[0] || "No compatibility details available.")}`
      });
      quality.push({
        tone: results.summary.extraResultBoards.length ? "gold" : "",
        text: results.summary.extraResultBoards.length
          ? `${results.summary.extraResultBoards.length} result boards do not appear in the PBN.`
          : "Every result board maps to a PBN board."
      });
      quality.push({
        tone: results.summary.missingResultBoards.length ? "gold" : "",
        text: "Every PBN board has uploaded results.",
        html: results.summary.missingResultBoards.length
          ? `${escapeHtml(results.summary.missingResultBoards.length)} PBN boards have no uploaded result (${renderBoardJumpList(results.summary.missingResultBoards)}).`
          : ""
      });
      quality.push({
        tone: results.warnings.length ? "gold" : "",
        text: results.warnings.length ? `${results.warnings.length} result import or scoring warnings.` : "No result import warnings."
      });
    }

    document.getElementById("qualityCaption").textContent = results
      ? `${results.summary.resultCount} uploaded traveler rows are joined to the hand record.`
      : summary.boardsWithActualResults
        ? `${summary.boardsWithActualResults} boards include played-result fields.`
        : "This looks like a hand record rather than a result file.";
    document.getElementById("qualityList").innerHTML = quality.map((item) => `
      <li><span class="dot ${escapeHtml(item.tone)}"></span><span>${item.html || escapeHtml(item.text)}</span></li>
    `).join("");
  }

  function renderResultsPanel(analysis, results) {
    const caption = document.getElementById("resultsCaption");
    const body = document.getElementById("resultsSummary");
    if (!results) {
      caption.textContent = "Optional Bridgemate BWS or CSV traveler import.";
      body.innerHTML = `<div class="empty-state">Use Open Results at the top of the page, or drag in a BWS database or CSV export with Board, PairNS, PairEW, NS/EW, Contract, and Result columns.</div>`;
      return;
    }

    const avgVsPar = results.summary.averageVsPar == null ? "n/a" : formatSigned(Math.round(results.summary.averageVsPar));
    const avgAbsVsPar = results.summary.averageAbsVsPar == null ? "n/a" : Math.round(results.summary.averageAbsVsPar);
    const ddText = results.summary.ddCompared ? `${results.summary.ddExact}/${results.summary.ddCompared}` : "n/a";
    const compatibility = results.summary.compatibility;
    const compatibilityScore = compatibility.score == null ? "n/a" : `${compatibility.score}/100`;
    caption.textContent = `${results.fileName || "Results"} - ${results.sourceType}${results.metadata && results.metadata.pageSize ? `, ${results.metadata.pageSize} byte pages` : ""}${results.summary.namedPlayers ? `, ${results.summary.namedPlayers} named players` : ""}${results.hasPbn ? "" : ", not yet joined to a PBN"}.`;
    body.innerHTML = `
      <div class="result-summary-grid">
        <div class="result-summary-card"><strong>${escapeHtml(results.summary.resultCount)}</strong><span>Result Rows</span></div>
        <div class="result-summary-card"><strong>${escapeHtml(results.summary.boardsCovered)}</strong><span>Boards</span></div>
        <div class="result-summary-card"><strong>${escapeHtml(results.summary.pairs)}</strong><span>Pairs</span></div>
        <div class="result-summary-card"><strong>${escapeHtml(results.summary.namedPlayers || 0)}</strong><span>Named Players</span></div>
        <div class="result-summary-card compatibility ${escapeHtml(compatibility.status)}"><strong>${escapeHtml(compatibilityScore)}</strong><span>PBN Match</span></div>
        <div class="result-summary-card"><strong>${escapeHtml(avgVsPar)}</strong><span>Avg Vs Par</span></div>
        <div class="result-summary-card"><strong>${escapeHtml(avgAbsVsPar)}</strong><span>Avg Abs Par</span></div>
        <div class="result-summary-card"><strong>${escapeHtml(ddText)}</strong><span>DD Exact</span></div>
      </div>
      ${renderCompatibilityPanel(compatibility)}
      <section class="results-subsection">
        <div>
          <h3>Result Contracts</h3>
          <p>Traveler contracts grouped by contract class.</p>
        </div>
        <div id="resultContractChart">${renderResultContractChart(results)}</div>
      </section>
    `;
  }

  function renderCompatibilityPanel(compatibility) {
    const tone = compatibility.status === "mismatch" ? "red" : compatibility.status === "match" ? "" : "gold";
    return `
      <section class="compatibility-panel ${escapeHtml(tone)}">
        <div>
          <h3>PBN / Results Compatibility</h3>
          <p>${escapeHtml(compatibility.label)}${compatibility.score == null ? "" : ` - ${escapeHtml(compatibility.score)}/100`}</p>
        </div>
        <ul>
          ${compatibility.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
        </ul>
      </section>
    `;
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function renderImportDiagnostics(results) {
    const diagnostics = results && results.metadata ? results.metadata.diagnostics : null;
    if (!diagnostics) return "";
    if (diagnostics.sourceType === "BWS") return renderBwsDiagnostics(diagnostics, results);
    if (diagnostics.sourceType === "CSV") return renderCsvDiagnostics(diagnostics, results);
    return "";
  }

  function renderImportDiagnosticsPanel(results) {
    const panel = document.getElementById("importDiagnosticsPanel");
    const title = document.getElementById("importDiagnosticsTitle");
    const caption = document.getElementById("importDiagnosticsCaption");
    const body = document.getElementById("importDiagnosticsSummary");
    const diagnostics = results && results.metadata ? results.metadata.diagnostics : null;
    if (!panel || !title || !caption || !body) return;
    if (!diagnostics) {
      panel.classList.add("hidden");
      title.textContent = "BWS Import Diagnostics";
      caption.textContent = "";
      body.innerHTML = "";
      return;
    }

    panel.classList.remove("hidden");
    const sourceType = diagnostics.sourceType || results.sourceType || "Import";
    title.textContent = sourceType === "BWS" ? "BWS Import Diagnostics" : `${sourceType} Import Diagnostics`;
    caption.textContent = `${results.fileName || "Results"} - ${sourceType} scan details.`;
    body.innerHTML = renderImportDiagnostics(results);
    annotateTermTooltips(panel);
  }

  function renderCsvDiagnostics(diagnostics, results) {
    const headerText = diagnostics.headers && diagnostics.headers.length
      ? diagnostics.headers.slice(0, 12).join(", ")
      : "No headers";
    const warningText = results && results.warnings && results.warnings.length
      ? `<ul class="rejection-list">${results.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : `<div class="diagnostics-note">No import warnings.</div>`;
    return `
      <div class="diagnostics-panel">
        <div class="diagnostics-grid">
          <div class="metadata-item"><div class="key">Source</div><div class="val">CSV</div></div>
          <div class="metadata-item"><div class="key">File Size</div><div class="val">${escapeHtml(formatBytes(diagnostics.fileSize))}</div></div>
          <div class="metadata-item"><div class="key">CSV Rows</div><div class="val">${escapeHtml(diagnostics.csvRows)}</div></div>
          <div class="metadata-item"><div class="key">Recognized Results</div><div class="val">${escapeHtml(diagnostics.recognizedRows)}</div></div>
        </div>
        <div class="diagnostics-note">Headers: ${escapeHtml(headerText)}</div>
        ${warningText}
      </div>
    `;
  }

  function rejectionSummary(rejections) {
    const entries = Object.entries(rejections || {})
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6);
    if (!entries.length) return "none";
    return entries.map(([key, value]) => `${term(key)}: ${escapeHtml(value)}`).join("; ");
  }

  function formatPageTypes(pageTypes) {
    const entries = Object.entries(pageTypes || {})
      .sort((a, b) => Number.parseInt(a[0], 16) - Number.parseInt(b[0], 16));
    if (!entries.length) return "none";
    return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
  }

  function renderBwsDiagnostics(diagnostics, results) {
    const selected = diagnostics.candidates.find((candidate) => candidate.pageSize === diagnostics.selectedPageSize) || diagnostics.candidates[0];
    const received = selected ? selected.received : {};
    const pageProfile = diagnostics.pageProfile || {};
    const erasedRuns = pageProfile.allFfRuns && pageProfile.allFfRuns.length ? pageProfile.allFfRuns.join(", ") : "none";
    const candidateRows = diagnostics.candidates.map((candidate) => `
      <tr>
        <td>${escapeHtml(candidate.pageSize)}</td>
        <td class="numeric">${escapeHtml(candidate.received.filePages)}</td>
        <td class="numeric">${escapeHtml(formatBytes(candidate.received.trailingBytes))}</td>
        <td class="numeric">${escapeHtml(candidate.received.dataPages)}</td>
        <td class="numeric">${escapeHtml(candidate.received.rowSlots)}</td>
        <td class="numeric">${escapeHtml(candidate.received.rowSlices)}</td>
        <td class="numeric">${escapeHtml(candidate.received.acceptedRows)}</td>
        <td class="numeric">${escapeHtml(candidate.players.acceptedRows)}</td>
        <td>${rejectionSummary(candidate.received.rejections)}</td>
      </tr>
    `).join("");
    const warningText = results.warnings.length
      ? `<ul class="rejection-list">${results.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : `<div class="diagnostics-note">No import warnings.</div>`;
    const summaryText = `${diagnostics.acceptedReceivedRows} results, ${diagnostics.acceptedPlayerRows} player rows, ${diagnostics.selectedPageSize} byte pages`;
    return `
      <div class="diagnostics-panel">
        <div class="diagnostics-summary">${escapeHtml(summaryText)}</div>
        <div class="diagnostics-grid bws-diagnostics-grid">
          <div class="metadata-item"><div class="key">${term("File Size")}</div><div class="val">${escapeHtml(formatBytes(diagnostics.fileSize))}</div></div>
          <div class="metadata-item"><div class="key">${term("Jet Signature")}</div><div class="val">${escapeHtml(diagnostics.signature || "Missing")}</div></div>
          <div class="metadata-item"><div class="key">${term("Recognized Jet")}</div><div class="val">${escapeHtml(diagnostics.recognizedJet ? "yes" : "no")}</div></div>
          <div class="metadata-item"><div class="key">${term("Selected Page Size")}</div><div class="val">${escapeHtml(diagnostics.selectedPageSize)}</div></div>
          <div class="metadata-item"><div class="key">${term("Accepted Results")}</div><div class="val">${escapeHtml(diagnostics.acceptedReceivedRows)}</div></div>
          <div class="metadata-item"><div class="key">${term("Player Rows")}</div><div class="val">${escapeHtml(diagnostics.acceptedPlayerRows)}</div></div>
          <div class="metadata-item"><div class="key">${term("Duplicate Results")}</div><div class="val">${escapeHtml(diagnostics.duplicateReceivedRows)}</div></div>
          <div class="metadata-item"><div class="key">${term("Erased Results")}</div><div class="val">${escapeHtml(diagnostics.erasedRows || 0)}</div></div>
          <div class="metadata-item"><div class="key">${term("Deleted Row Slots")}</div><div class="val">${escapeHtml(diagnostics.deletedRowSlots || 0)}</div></div>
          <div class="metadata-item"><div class="key">${term("Rejected Row Slices")}</div><div class="val">${escapeHtml(received.rejectedRows || 0)}</div></div>
          <div class="metadata-item"><div class="key">${term("All-FF Pages")}</div><div class="val">${escapeHtml(pageProfile.allFfPageCount || 0)}</div></div>
        </div>
        <div class="preview-wrap">
          <table>
            <thead>
              <tr>
                ${th("Page Size")}
                ${th("Pages", "numeric")}
                ${th("Tail", "numeric")}
                ${th("Data Pages", "numeric")}
                ${th("Row Slots", "numeric")}
                ${th("Row Slices", "numeric")}
                ${th("Results", "numeric")}
                ${th("Players", "numeric")}
                ${th("Top ReceivedData Rejections")}
              </tr>
            </thead>
            <tbody>${candidateRows}</tbody>
          </table>
        </div>
        <div class="diagnostics-note">Selected-page profile: ${escapeHtml(formatPageTypes(pageProfile.pageTypes))}.</div>
        <div class="diagnostics-note">All-FF page runs: ${escapeHtml(erasedRuns)}.</div>
        <div class="diagnostics-note">Rejected row slices include non-result rows from other Jet tables and deleted row slots, so nonzero rejection counts are expected.</div>
        ${warningText}
      </div>
    `;
  }

  function renderResultsCharts(analysis, results) {
    const section = document.getElementById("resultsCharts");
    if (!results) {
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
    document.getElementById("pairStandings").innerHTML = renderPairStandings(results);
    annotateTermTooltips(section);
  }

  function resultScoreOutlierSummaries(summaries) {
    const flagged = summaries.filter((summary) => Math.abs(summary.averageVsPar || 0) >= 200 || (summary.scoreSpread || 0) >= 800);
    const chosen = flagged.length
      ? flagged
      : [...summaries]
        .sort((a, b) => Math.max(Math.abs(b.averageVsPar || 0), (b.scoreSpread || 0) / 4) - Math.max(Math.abs(a.averageVsPar || 0), (a.scoreSpread || 0) / 4))
        .slice(0, Math.min(8, summaries.length));
    return [...chosen].sort((a, b) => a.boardNo - b.boardNo);
  }

  function renderResultScoreChart(results, outliersOnly = false) {
    let summaries = results.boardSummaries.filter((summary) => summary.averageNsScore != null);
    if (outliersOnly) summaries = resultScoreOutlierSummaries(summaries);
    if (!summaries.length) return `<div class="empty-state">No scored results to chart.</div>`;
    const width = Math.max(860, summaries.length * 28 + 92);
    const height = 310;
    const left = 48;
    const right = 22;
    const top = 20;
    const bottom = 44;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxAbs = Math.max(100, ...summaries.flatMap((summary) => [Math.abs(summary.averageNsScore || 0), Math.abs(summary.parNS || 0)]));
    const zeroY = top + plotHeight / 2;
    const step = plotWidth / summaries.length;
    const barWidth = Math.max(7, step - 6);
    const yFor = (value) => zeroY - (value / maxAbs) * (plotHeight / 2);
    const gridValues = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
    const grid = gridValues.map((value) => {
      const y = yFor(value);
      return `
        <line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" stroke="${value === 0 ? "#8ca0b2" : "#e1e7ed"}" stroke-width="${value === 0 ? 1.4 : 1}" />
        <text x="${left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#607083" font-size="11">${escapeHtml(Math.round(value))}</text>
      `;
    }).join("");
    const bars = summaries.map((summary, index) => {
      const value = summary.averageNsScore || 0;
      const x = left + index * step + (step - barWidth) / 2;
      const y = Math.min(zeroY, yFor(value));
      const h = Math.abs(yFor(value) - zeroY);
      const parY = summary.parNS == null ? null : yFor(summary.parNS);
      const color = value >= 0 ? "#0f7b6c" : "#bb3f45";
      return `
        <g class="chart-board-mark" data-board-jump="${escapeHtml(summary.boardNo)}">
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" rx="2" fill="${color}">
            <title>Board ${escapeHtml(summary.boardNo)}: average NS ${escapeHtml(Math.round(value))}${summary.parNS == null ? "" : `, par ${escapeHtml(summary.parNS)}`}</title>
          </rect>
          ${parY == null ? "" : `<line x1="${(x - 2).toFixed(2)}" x2="${(x + barWidth + 2).toFixed(2)}" y1="${parY.toFixed(2)}" y2="${parY.toFixed(2)}" stroke="#17212b" stroke-width="2"><title>Par ${escapeHtml(summary.parNS)}</title></line>`}
        </g>
      `;
    }).join("");
    const labels = summaries.map((summary, index) => {
      if (index % Math.ceil(summaries.length / 12) !== 0 && index !== summaries.length - 1) return "";
      const x = left + index * step + step / 2;
      return `<text class="chart-board-label" data-board-jump="${escapeHtml(summary.boardNo)}" x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle" fill="#607083" font-size="11">${escapeHtml(summary.boardNo)}</text>`;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Actual average scores versus par by board">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
        ${grid}
        ${bars}
        ${labels}
        <text x="${left}" y="${height - 4}" fill="#607083" font-size="11">Board</text>
      </svg>
      <div class="legend">
        <span class="legend-item"><span class="swatch" style="background:#0f7b6c"></span>Avg NS plus</span>
        <span class="legend-item"><span class="swatch" style="background:#bb3f45"></span>Avg NS minus</span>
        <span class="legend-item"><span class="swatch" style="background:#17212b"></span>PBN par</span>
      </div>
    `;
  }

  function renderContractClassLabel(label) {
    const definition = termDefinition(label);
    const classes = definition ? "contract-type-label term-tip" : "contract-type-label";
    return `<div class="${classes}"${tooltipAttrs(definition)}>${escapeHtml(label)}</div>`;
  }

  function renderResultContractChart(results) {
    const counts = results.summary.contractClasses;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return `<div class="empty-state">No contracts were found.</div>`;
    return `
      <div class="count-grid">
        ${entries.map(([key, value]) => `
          <div class="count-tile">
            <strong>${escapeHtml(value)}</strong>
            ${renderContractClassLabel(key)}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderPairStandings(results) {
    const standings = results.pairStandings;
    if (!standings.length) return `<div class="empty-state">No pair standings could be calculated.</div>`;
    return `
      <table class="standings-table">
        <thead><tr><th>Rank</th><th>Pair</th><th>Players</th><th class="numeric">MP</th><th class="numeric">Pct</th><th>Form</th></tr></thead>
        <tbody>
          ${standings.map((standing) => `
            <tr>
              <td>${escapeHtml(standing.rank)}</td>
              <td>${escapeHtml(standing.pairNo)}</td>
              <td>${escapeHtml(standing.players || "")}</td>
              <td class="numeric">${escapeHtml(standing.matchpoints.toFixed(1))}</td>
              <td class="numeric">${escapeHtml(standing.percent == null ? "" : `${standing.percent.toFixed(1)}%`)}</td>
              <td><div class="mp-meter"><div class="mp-meter-fill" style="width:${Math.max(0, Math.min(100, standing.percent || 0)).toFixed(1)}%"></div></div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

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
                ${renderLossAdvice(priority.advice, { avatar: index === 0 })}
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
                ${renderLossAdvice(type.advice, { avatar: index === 0 })}
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

  function reviewPriorityAdvice(item) {
    const labels = item.reasons.map((reason) => reason.label);
    if (labels.some((label) => label.includes("trick loss"))) {
      return item.declared
        ? "Replay the play card by card against double-dummy: locate the trick where the contract slipped."
        : "Review opening lead, signal, shift, and cash-out choices before looking at the full traveler.";
    }
    if (labels.some((label) => label.includes("failed"))) {
      return "Check whether the contract was sound, then identify whether the failure came from auction judgment or declarer play.";
    }
    if (labels.some((label) => label.includes("game") || label.includes("slam"))) {
      return "Compare your auction to pairs who reached the higher-scoring level in the same direction.";
    }
    if (labels.some((label) => label.includes("below field") || label.includes("far below field"))) {
      return "Start with field comparison: look for contract, strain, or doubling decisions that separated the result.";
    }
    return "Use the traveler to compare same-direction results and isolate the first decision that changed the matchpoint outcome.";
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
                  ${renderLossAdvice(item.diagnosis.explanation, { avatar: index === 0 })}
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
        ${renderLossAdvice(item.diagnosis.explanation, { avatar: index === 0 })}
        <div class="swing-actions">${renderBoardJump(row.boardNo, `Open board ${row.boardNo} traveler (${peerCount} peer${peerCount === 1 ? "" : "s"})`)}</div>
      </article>
    `;
  }




  function renderLossAdvice(advice, options = {}) {
    const avatar = options.avatar !== false;
    return `
      <div class="loss-advice${avatar ? "" : " no-avatar"}">
        ${avatar ? `<span class="collie-head" aria-hidden="true">
          <img src="${escapeHtml(assetUrl("assets/bc-avatar.png"))}" alt="" loading="lazy" decoding="async">
        </span>` : ""}
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

  function visualBoards(analysis, results) {
    if (!results) return analysis.boards;
    return analysis.boards.filter((board) => results.boardsByNumber.has(String(board.boardNo)));
  }

  function renderCharts(analysis, results) {
    const boards = visualBoards(analysis, results);
    const scoreTitle = document.getElementById("scoreChartTitle");
    const scoreCaption = document.getElementById("scoreChartCaption");
    if (results) {
      setTermElementText(scoreTitle, "Actual Scores Vs Par");
      scoreCaption.textContent = STATE.scoreOutliersOnly
        ? "Outlier played boards where field average or score spread most diverged from PBN par."
        : "Average table result by played board, scored from the NS perspective. The black tick is theoretical PBN par, not a cap on actual results.";
      document.getElementById("scoreChart").innerHTML = renderResultScoreChart(results, STATE.scoreOutliersOnly);
    } else {
      setTermElementText(scoreTitle, "Par Score By Board");
      scoreCaption.textContent = STATE.scoreOutliersOnly
        ? "Largest theoretical par swings and slam-level boards."
        : "Positive bars favor NS, negative bars favor EW.";
      document.getElementById("scoreChart").innerHTML = renderScoreChart(boards, STATE.scoreOutliersOnly);
    }
    document.getElementById("strainChart").innerHTML = renderStrainChart(boards);
    document.getElementById("hcpChart").innerHTML = renderHcpChart(boards);
    document.getElementById("heatMap").innerHTML = renderHeatMap(boards);
  }

  function scoreOutlierBoards(boards) {
    const flagged = boards
      .filter((board) => Math.abs(board.optimum.nsPerspective || 0) >= 500 || board.parContracts.some((contract) => contract.level >= 6));
    const chosen = flagged.length
      ? flagged
      : [...boards]
        .sort((a, b) => Math.abs(b.optimum.nsPerspective || 0) - Math.abs(a.optimum.nsPerspective || 0))
        .slice(0, Math.min(8, boards.length));
    return [...chosen].sort((a, b) => a.boardNo - b.boardNo);
  }

  function renderScoreChart(boards, outliersOnly = false) {
    if (outliersOnly) boards = scoreOutlierBoards(boards);
    if (!boards.length) return `<div class="empty-state">No boards to chart.</div>`;
    const width = Math.max(860, boards.length * 23 + 90);
    const height = 300;
    const left = 46;
    const right = 20;
    const top = 20;
    const bottom = 42;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxAbs = Math.max(100, ...boards.map((board) => Math.abs(board.optimum.nsPerspective || 0)));
    const zeroY = top + plotHeight / 2;
    const barGap = 3;
    const step = plotWidth / boards.length;
    const barWidth = Math.max(5, step - barGap);
    const yFor = (value) => zeroY - (value / maxAbs) * (plotHeight / 2);
    const gridValues = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

    const grid = gridValues.map((value) => {
      const y = yFor(value);
      return `
        <line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}" stroke="${value === 0 ? "#8ca0b2" : "#e1e7ed"}" stroke-width="${value === 0 ? 1.4 : 1}" />
        <text x="${left - 8}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="#607083" font-size="11">${escapeHtml(Math.round(value))}</text>
      `;
    }).join("");

    const bars = boards.map((board, index) => {
      const value = board.optimum.nsPerspective || 0;
      const x = left + index * step + barGap / 2;
      const y = Math.min(zeroY, yFor(value));
      const h = Math.abs(yFor(value) - zeroY);
      const color = value >= 0 ? "#0f7b6c" : "#bb3f45";
      return `
        <g class="chart-board-mark" data-board-jump="${escapeHtml(board.boardNo)}">
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" rx="2" fill="${color}">
            <title>Board ${escapeHtml(board.boardNo)}: NS ${escapeHtml(formatSigned(value))}; ${escapeHtml(board.tags.ParContract || "No par contract")}</title>
          </rect>
        </g>
      `;
    }).join("");

    const labels = boards.map((board, index) => {
      if (index % Math.ceil(boards.length / 12) !== 0 && index !== boards.length - 1) return "";
      const x = left + index * step + barWidth / 2;
      return `<text class="chart-board-label" data-board-jump="${escapeHtml(board.boardNo)}" x="${x.toFixed(2)}" y="${height - 18}" text-anchor="middle" fill="#607083" font-size="11">${escapeHtml(board.boardNo)}</text>`;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Par score by board">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
        ${grid}
        ${bars}
        ${labels}
        <text x="${left}" y="${height - 4}" fill="#607083" font-size="11">Board</text>
      </svg>
      <div class="legend">
        <span class="legend-item"><span class="swatch" style="background:#0f7b6c"></span>NS score</span>
        <span class="legend-item"><span class="swatch" style="background:#bb3f45"></span>EW score</span>
      </div>
    `;
  }

  function renderStrainChart(boards) {
    const parContracts = boards.flatMap((board) => board.parContracts || []);
    const counts = DENOMS.map((denom) => ({
      ...denom,
      count: parContracts.filter((contract) => contract.strain === denom.key).length
    })).filter((entry) => entry.count > 0);
    const total = sum(counts.map((entry) => entry.count));
    if (!total) return `<div class="empty-state">No par strains found for the current board set.</div>`;
    const radius = 58;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const circles = counts.map((entry) => {
      const length = (entry.count / total) * circumference;
      const circle = `
        <circle cx="88" cy="88" r="${radius}" fill="none" stroke="${entry.color}" stroke-width="30"
          stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 88 88)">
          <title>${escapeHtml(entry.label)}: ${entry.count}</title>
        </circle>`;
      offset += length;
      return circle;
    }).join("");

    const legend = counts.map((entry) => `
      <span class="legend-item">
        <span class="swatch" style="background:${entry.color}"></span>${term(entry.label)} ${escapeHtml(entry.count)}
      </span>
    `).join("");

    return `
      <svg viewBox="0 0 176 176" role="img" aria-label="Par strain distribution" style="margin:auto">
        <circle cx="88" cy="88" r="${radius}" fill="none" stroke="#edf1f5" stroke-width="30"></circle>
        ${circles}
        <text x="88" y="83" text-anchor="middle" font-size="24" font-weight="800" fill="#17212b">${total}</text>
        <text x="88" y="104" text-anchor="middle" font-size="12" fill="#607083">contracts</text>
      </svg>
      <div class="legend">${legend}</div>
    `;
  }

  function renderHcpChart(boards) {
    if (!boards.length) return `<div class="empty-state">No boards to summarize.</div>`;
    const entries = [
      ...SEATS.map((seat) => ({ label: seat, value: average(boards.map((board) => board.hands[seat].hcp)), max: 20 })),
      { label: "NS", value: average(boards.map((board) => board.pairs.NS.hcp)), max: 40 },
      { label: "EW", value: average(boards.map((board) => board.pairs.EW.hcp)), max: 40 }
    ];

    return `
      <div class="hcp-bars">
        ${entries.map((entry) => `
          <div class="hcp-bar">
            <strong>${escapeHtml(entry.label)}</strong>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (entry.value / entry.max) * 100).toFixed(1)}%"></div></div>
            <span>${entry.value.toFixed(1)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function hcpColor(hcp) {
    const t = Math.max(0, Math.min(1, hcp / 22));
    const low = [237, 242, 247];
    const high = [15, 123, 108];
    const rgb = low.map((component, index) => Math.round(component + (high[index] - component) * t));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function renderHeatMap(boards) {
    if (!boards.length) return `<div class="empty-state">No boards to map.</div>`;
    const cellW = 22;
    const cellH = 23;
    const left = 34;
    const top = 16;
    const width = left + boards.length * cellW + 18;
    const height = top + SEATS.length * cellH + 36;
    const cells = [];
    SEATS.forEach((seat, row) => {
      cells.push(`<text x="8" y="${top + row * cellH + 16}" fill="#607083" font-size="12" font-weight="700">${seat}</text>`);
      boards.forEach((board, col) => {
        const hcp = board.hands[seat].hcp;
        const x = left + col * cellW;
        const y = top + row * cellH;
        cells.push(`
          <rect class="chart-board-mark" data-board-jump="${escapeHtml(board.boardNo)}" x="${x}" y="${y}" width="18" height="18" rx="3" fill="${hcpColor(hcp)}" stroke="#ffffff">
            <title>Board ${escapeHtml(board.boardNo)} ${seat}: ${hcp} HCP</title>
          </rect>
        `);
      });
    });

    boards.forEach((board, index) => {
      if (index % Math.ceil(boards.length / 12) !== 0 && index !== boards.length - 1) return;
      const x = left + index * cellW + 9;
      cells.push(`<text class="chart-board-label" data-board-jump="${escapeHtml(board.boardNo)}" x="${x}" y="${height - 8}" fill="#607083" font-size="10" text-anchor="middle">${escapeHtml(board.boardNo)}</text>`);
    });

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="HCP heat map by board and seat">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>
        ${cells.join("")}
      </svg>
    `;
  }

  function renderNotables(analysis, boards) {
    const currentBoards = boards || analysis.boards;
    const groups = [];
    const boardByNo = new Map(currentBoards.map((board) => [String(board.boardNo), board]));
    const row = (boardNo, detail) => `
      <li>
        ${renderBoardJump(boardNo)}
        <span>${detail}</span>
      </li>
    `;
    const addGroup = (title, summary, rows, tone = "") => {
      const visibleRows = rows.filter(Boolean).slice(0, 6);
      if (!visibleRows.length) return;
      groups.push({ title, summary, rows: visibleRows, tone });
    };

    const largestScores = [...currentBoards]
      .filter((board) => board.optimum.nsPerspective != null)
      .sort((a, b) => Math.abs(b.optimum.nsPerspective || 0) - Math.abs(a.optimum.nsPerspective || 0))
      .slice(0, 5);
    const parSwingRows = largestScores.map((board) => {
      const edge = board.optimum.edge === "NS" ? "NS" : board.optimum.edge === "EW" ? "EW" : "flat";
      return row(
        board.boardNo,
        `High theoretical swing: ${escapeHtml(edge)} ${escapeHtml(Math.abs(board.optimum.nsPerspective || 0))}, ${escapeHtml(board.tags.ParContract || "no par")}.`
      );
    });

    const slamBoards = currentBoards
      .filter((board) => board.parContracts.some((contract) => contract.level >= 6))
      .slice(0, 6)
      .map((board) => row(board.boardNo, `Slam-level par: ${escapeHtml(board.tags.ParContract || "no par")}. Check whether the field bid enough.`));

    const resultOutliers = STATE.results
      ? [...STATE.results.boardSummaries]
        .filter((summary) => summary.averageVsPar != null && boardByNo.has(String(summary.boardNo)))
        .sort((a, b) => Math.abs(b.averageVsPar || 0) - Math.abs(a.averageVsPar || 0))
        .slice(0, 6)
        .map((summary) => row(
          summary.boardNo,
          `Field average was ${escapeHtml(formatSigned(Math.round(summary.averageVsPar)))} from PBN par; spread ${escapeHtml(summary.scoreSpread == null ? "n/a" : summary.scoreSpread)}.`
        ))
      : [];

    addGroup(
      "Review Bidding Choices",
      "Boards where contract level, strain, or field-vs-par divergence is likely to matter.",
      [...resultOutliers, ...slamBoards, ...parSwingRows],
      "gold"
    );

    const voidBoards = currentBoards
      .filter((board) => board.voids.length)
      .slice(0, 6)
      .map((board) => row(board.boardNo, `Voids: ${escapeHtml(board.voids.join(", "))}. Expect unusual auction and play choices.`));

    const longSuitBoards = currentBoards
      .filter((board) => board.longSuits.length)
      .slice(0, 6)
      .map((board) => row(board.boardNo, `Seven-card or longer suit: ${escapeHtml(board.longSuits.join(", "))}. Check preempts, competition, and suit establishment.`));

    const imbalances = [...currentBoards]
      .sort((a, b) => Math.abs(b.hcpDeltaNS) - Math.abs(a.hcpDeltaNS))
      .filter((board) => Math.abs(board.hcpDeltaNS) >= 12)
      .slice(0, 5)
      .map((board) => row(board.boardNo, `Large HCP imbalance: NS-EW ${escapeHtml(`${board.hcpNS}-${board.hcpEW}`)}.`));

    addGroup(
      "Inspect Play And Defense",
      "Distributional boards where opening lead, timing, and safety plays can create large swings.",
      [...voidBoards, ...longSuitBoards, ...imbalances]
    );

    const dataIssueRows = currentBoards
      .filter((board) => board.issues.length)
      .slice(0, 6)
      .map((board) => row(board.boardNo, `Data issue: ${escapeHtml(board.issues.join("; "))}.`));
    addGroup(
      "Check Data Quality",
      "Boards where missing PBN fields may affect downstream analysis.",
      dataIssueRows,
      "red"
    );

    if (!groups.length) {
      document.getElementById("notableList").innerHTML = `<div class="empty-state">${escapeHtml(currentBoards.length ? "No notable outliers found in the current board set." : "No played PBN boards are available for this view.")}</div>`;
      return;
    }

    document.getElementById("notableList").innerHTML = groups.map((group) => `
      <article class="notable-group ${escapeHtml(group.tone)}">
        <div class="notable-group-head">
          <span class="dot ${escapeHtml(group.tone)}"></span>
          <div>
            <h3>${escapeHtml(group.title)}</h3>
            <p>${escapeHtml(group.summary)}</p>
          </div>
        </div>
        <ul>${group.rows.join("")}</ul>
      </article>
    `).join("");
  }

  function renderBoards() {
    const analysis = STATE.analysis;
    if (!analysis) return;

    const search = STATE.filters.search.trim().toLowerCase();
    const filtered = analysis.boards.filter((board) => {
      const hasResult = Boolean(STATE.results && STATE.results.boardsByNumber.has(String(board.boardNo)));
      if (search && !boardSearchText(board).includes(search)) return false;
      if (STATE.filters.side !== "all" && board.optimum.edge !== STATE.filters.side) return false;
      if (STATE.filters.className !== "all" && board.className !== STATE.filters.className) return false;
      if (STATE.filters.vulnerability !== "all" && board.vulnerable !== STATE.filters.vulnerability) return false;
      if (STATE.filters.played === "played" && !hasResult) return false;
      if (STATE.filters.played === "unplayed" && hasResult) return false;
      return true;
    });

    document.getElementById("boardCountCaption").textContent = `${plural(filtered.length, "board")} shown from ${analysis.summary.boardCount}.`;
    const selected = filtered.find((board) => String(board.boardNo) === String(STATE.selectedBoardNo)) || filtered[0] || null;
    STATE.selectedBoardNo = selected ? String(selected.boardNo) : "";
    document.getElementById("boardGrid").innerHTML = filtered.length
      ? `
        <div class="board-workspace">
          <div class="board-list-panel">
            ${renderBoardList(filtered, selected)}
          </div>
          <div class="board-detail-panel">
            ${selected ? renderBoardCard(selected) : `<div class="empty-state">Select a board to inspect.</div>`}
          </div>
        </div>
      `
      : `<div class="empty-state">No boards match the current filters.</div>`;
    annotateTermTooltips(document.getElementById("boardGrid"));
  }

  function renderBoardList(boards, selected) {
    return `
      <div class="board-list-wrap">
        <table class="board-list-table">
          <thead>
            <tr>
              <th scope="col">Board</th>
              <th scope="col">D &middot; Vul</th>
              <th scope="col">Par</th>
              <th scope="col" class="numeric">NS</th>
              <th scope="col" class="numeric">#</th>
              <th scope="col" class="numeric">Avg</th>
            </tr>
          </thead>
          <tbody>
            ${boards.map((board) => renderBoardListRow(board, selected)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderBoardListRow(board, selected) {
    const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
    const selectedClass = selected && String(selected.boardNo) === String(board.boardNo) ? " selected" : "";
    const vulShort = { None: "-", NS: "NS", EW: "EW", All: "Both" }[board.vulnerable] || "?";
    const vul = vulSides(board.vulnerable);
    return `
      <tr class="${selectedClass}">
        <td><button type="button" class="board-row-button" data-board-select="${escapeHtml(board.boardNo)}">Board ${escapeHtml(board.boardNo)}</button></td>
        <td class="board-dv">${escapeHtml(board.dealer || "?")} &middot; <span class="${vul.ns || vul.ew ? "vul-text" : ""}">${escapeHtml(vulShort)}</span></td>
        <td class="contract">${contractGlyphHtml((board.tags.ParContract || "No par").replace(/\b(NS|EW|[NSEW])\s+(?=[1-7])/gi, ""))}</td>
        <td class="numeric">${escapeHtml(board.optimum.nsPerspective == null ? "" : formatSigned(board.optimum.nsPerspective))}</td>
        <td class="numeric">${escapeHtml(resultSummary ? resultSummary.resultCount : "")}</td>
        <td class="numeric">${escapeHtml(resultSummary && resultSummary.averageNsScore != null ? formatSigned(Math.round(resultSummary.averageNsScore)) : "")}</td>
      </tr>
    `;
  }

  function boardElementId(boardNo) {
    const safe = String(boardNo == null ? "" : boardNo).replace(/[^A-Za-z0-9_-]+/g, "-");
    return `board-explorer-${safe || "unknown"}`;
  }

  function vulSides(vulnerable) {
    return {
      ns: vulnerable === "NS" || vulnerable === "All",
      ew: vulnerable === "EW" || vulnerable === "All"
    };
  }

  function vulLabel(vulnerable) {
    if (vulnerable === "None") return "None vul";
    if (vulnerable === "NS") return "NS vul";
    if (vulnerable === "EW") return "EW vul";
    if (vulnerable === "All") return "Both vul";
    return "Vul unknown";
  }

  function makeableSummary(board, pair) {
    if (!board.optimumRows.length) return "";
    const best = new Map();
    board.optimumRows.forEach((row) => {
      if (row.pair !== pair || row.makeableLevel < 1) return;
      const current = best.get(row.denomination) || 0;
      if (row.makeableLevel > current) best.set(row.denomination, row.makeableLevel);
    });
    if (!best.size) return "nothing";
    const denomOrder = ["N", "S", "H", "D", "C"];
    return Array.from(best.entries())
      .sort((a, b) => b[1] - a[1] || denomOrder.indexOf(a[0]) - denomOrder.indexOf(b[0]))
      .slice(0, 4)
      .map(([denom, level]) => contractGlyphHtml(`${level} ${denom === "N" ? "NT" : denom}`))
      .join(", ");
  }

  function mostPlayedSummary(resultSummary) {
    if (!resultSummary) return "";
    const played = resultSummary.rows.filter((row) => row.contract && row.contract !== "PASS");
    if (!played.length) return "";
    const counts = countBy(played.map((row) => `${row.contract} by ${row.declarerSide || "?"}`));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return `${contractGlyphHtml(top[0])} (${escapeHtml(top[1])}&times;)`;
  }

  function parChipHtml(board) {
    const parText = String(board.tags.ParContract || "").trim();
    const score = board.optimum.nsPerspective;
    if (score == null && !parText) return "";
    const scorePart = score == null ? "" : `Par NS ${formatSigned(score)}`;
    const contractPart = parText ? contractGlyphHtml(parText.replace(/\b(NS|EW|[NSEW])\s+(?=[1-7])/gi, "")) : "";
    return `<span class="contract-chip">${[scorePart, contractPart].filter(Boolean).join(" &middot; ")}</span>`;
  }

  function renderBoardCard(board, options = {}) {
    const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
    const cardId = options.id || boardElementId(board.boardNo);
    const className = options.className ? ` ${options.className}` : "";
    const vul = vulSides(board.vulnerable);
    const boardTop = resultSummary ? Math.max(0, ...resultSummary.rows.map((row) => row.boardTop || 0)) : 0;
    const travelerLabel = resultSummary
      ? `Traveler - ${plural(resultSummary.resultCount, "result")}${boardTop ? `, top ${formatMp(boardTop)}` : ""}`
      : "";
    return `
      <article class="board-card${escapeHtml(className)}" id="${escapeHtml(cardId)}" data-board-no="${escapeHtml(board.boardNo)}" tabindex="-1">
        <div class="board-card-header">
          <div class="board-placard">
            <strong class="board-no">Board ${escapeHtml(board.boardNo)}</strong>
            <span class="board-dealer">Dealer <b>${escapeHtml(seatName(board.dealer) || "?")}</b></span>
            <span class="vul-chip${vul.ns || vul.ew ? " vul" : ""}"><span class="dot" aria-hidden="true"></span>${escapeHtml(vulLabel(board.vulnerable))}</span>
          </div>
          ${parChipHtml(board)}
        </div>
        <div class="board-card-body">
          ${renderDealDiagram(board, resultSummary)}
          ${resultSummary ? `
          <div class="board-section">
            <div class="board-section-label">${escapeHtml(travelerLabel)}</div>
            ${renderBoardTraveler(board)}
          </div>` : ""}
          ${board.optimumRows.length ? `
          <div class="board-section">
            <div class="board-section-label">Double dummy - tricks by declarer</div>
            ${renderDoubleDummyTable(board)}
          </div>` : ""}
          <details class="board-details">
            <summary>Raw PBN tags</summary>
            ${renderBoardTagTable(board)}
          </details>
        </div>
      </article>
    `;
  }

  function syncBoardFilterControls() {
    const controls = [
      ["boardSearch", "search"],
      ["sideFilter", "side"],
      ["classFilter", "className"],
      ["vulFilter", "vulnerability"],
      ["playedFilter", "played"]
    ];
    controls.forEach(([id, key]) => {
      const element = document.getElementById(id);
      if (element) element.value = STATE.filters[key];
    });
  }

  function selectBoardInExplorer(boardNo, options = {}) {
    STATE.selectedBoardNo = String(boardNo);
    renderBoards();
    const target = document.getElementById(boardElementId(boardNo));
    if (!target) {
      if (options.showError) showToast(`Board ${boardNo} could not be shown in the explorer.`, "error");
      return null;
    }
    document.querySelectorAll(".board-card.board-card-target").forEach((card) => {
      card.classList.remove("board-card-target");
    });
    target.classList.add("board-card-target");
    if (options.scroll !== false) target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
    return target;
  }

  function boardByNumber(boardNo) {
    if (!STATE.analysis) return null;
    const key = String(boardNo);
    return STATE.analysis.boards.find((board) => String(board.boardNo) === key) || null;
  }

  function showBoardOverlay(boardNo) {
    const board = boardByNumber(boardNo);
    if (!board) {
      showToast(STATE.analysis ? `Board ${boardNo} is not in the loaded PBN.` : "Open a PBN to preview a board.", "error");
      return;
    }
    const overlay = document.getElementById("boardOverlay");
    const body = document.getElementById("boardOverlayBody");
    const title = document.getElementById("boardOverlayTitle");
    const closeButton = document.getElementById("boardOverlayClose");
    if (!overlay || !body || !title || !closeButton) return;

    showBoardOverlay.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.setAttribute("data-board-no", String(board.boardNo));
    title.textContent = "Board Preview";
    body.innerHTML = renderBoardCard(board, {
      id: `board-overlay-${String(board.boardNo).replace(/[^A-Za-z0-9_-]+/g, "-") || "unknown"}`,
      className: "overlay-board-card"
    });
    overlay.classList.remove("hidden");
    document.body.classList.add("modal-open");
    annotateTermTooltips(body);
    closeButton.focus();
  }

  function closeBoardOverlay({ restoreFocus = true } = {}) {
    const overlay = document.getElementById("boardOverlay");
    const body = document.getElementById("boardOverlayBody");
    if (!overlay || overlay.classList.contains("hidden")) return;
    overlay.classList.add("hidden");
    overlay.removeAttribute("data-board-no");
    if (body) body.innerHTML = "";
    document.body.classList.remove("modal-open");
    if (restoreFocus && showBoardOverlay.returnFocus && document.contains(showBoardOverlay.returnFocus)) {
      showBoardOverlay.returnFocus.focus();
    }
    showBoardOverlay.returnFocus = null;
  }

  function revealBoardInExplorer(boardNo) {
    if (!STATE.analysis) {
      showToast("Open a PBN to jump to a board in the explorer.", "error");
      return;
    }

    const boardKey = String(boardNo);
    const boardExists = STATE.analysis.boards.some((board) => String(board.boardNo) === boardKey);
    if (!boardExists) {
      showToast(`Board ${boardKey} is not in the loaded PBN.`, "error");
      return;
    }

    setElementHidden("boardExplorerPanel", false);
    const disclosure = document.getElementById("boardExplorerDisclosure");
    if (disclosure) disclosure.open = true;
    STATE.activeView = "boards";
    renderTaskNav(STATE.analysis, STATE.results);
    applyActiveView();

    STATE.filters.search = "";
    STATE.filters.side = "all";
    STATE.filters.className = "all";
    STATE.filters.vulnerability = "all";
    STATE.filters.played = "all";
    syncBoardFilterControls();
    selectBoardInExplorer(boardNo, { showError: true });
  }

  function renderBoardTraveler(board) {
    const resultSummary = STATE.results ? STATE.results.boardsByNumber.get(String(board.boardNo)) : null;
    if (!resultSummary) return `<div class="empty-state">No uploaded traveler rows for this board.</div>`;
    const rows = [...resultSummary.rows].sort((a, b) =>
      (b.scoreNS == null ? -1e9 : b.scoreNS) - (a.scoreNS == null ? -1e9 : a.scoreNS) ||
      (a.tableNo || 0) - (b.tableNo || 0));
    const scored = rows.filter((row) => row.scoreNS != null);
    const rankByScore = new Map();
    scored.forEach((row, index) => {
      if (!rankByScore.has(row.scoreNS)) rankByScore.set(row.scoreNS, index + 1);
    });
    const tieCounts = countBy(scored.map((row) => String(row.scoreNS)));
    const hasPar = rows.some((row) => row.vsParNS != null);
    const reportKey = STATE.reportPair == null ? "" : String(STATE.reportPair);
    return `
      <div class="traveler-wrap">
        <table class="traveler-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Contract</th>
              <th scope="col">By</th>
              <th scope="col">Result</th>
              <th scope="col" class="numeric">NS Score</th>
              <th scope="col" class="numeric">NS MP</th>
              ${hasPar ? `<th scope="col" class="numeric">Vs Par</th>` : ""}
              <th scope="col">Pairs</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const rank = row.scoreNS == null
                ? ""
                : `${rankByScore.get(row.scoreNS)}${tieCounts[String(row.scoreNS)] > 1 ? "=" : ""}`;
              const isTop = row.scoreNS != null && rankByScore.get(row.scoreNS) === 1;
              const isReport = reportKey && (String(row.nsParticipantKey) === reportKey || String(row.ewParticipantKey) === reportKey);
              const mpPct = row.boardTop && row.nsMatchpoints != null ? (row.nsMatchpoints / row.boardTop) * 100 : null;
              const contractCell = row.adjustment && row.scoreNS == null
                ? escapeHtml(`Adjusted ${row.adjustment.nsPercent}%/${row.adjustment.ewPercent}%`)
                : contractGlyphHtml(row.contract || "-");
              const names = [row.nsPlayers, row.ewPlayers].filter(Boolean).join(" vs ");
              return `
              <tr class="${[isTop ? "traveler-top" : "", isReport ? "traveler-selected" : ""].filter(Boolean).join(" ")}">
                <td class="numeric">${escapeHtml(rank)}</td>
                <td class="contract">${contractCell}</td>
                <td>${escapeHtml(row.declarerSide || "")}${row.declarerName ? `<span class="cell-note">${escapeHtml(row.declarerName)}</span>` : ""}</td>
                <td>${escapeHtml(row.result || "")}</td>
                <td class="numeric score ${row.scoreNS > 0 ? "pos" : row.scoreNS < 0 ? "neg" : ""}">${escapeHtml(row.scoreNS == null ? "" : formatSigned(row.scoreNS))}</td>
                <td class="numeric">${row.nsMatchpoints == null ? "" : `${escapeHtml(formatMp(row.nsMatchpoints))}${mpPct == null ? "" : `<span class="mp-bar" aria-hidden="true"><i style="width:${mpPct.toFixed(0)}%"></i></span>`}`}</td>
                ${hasPar ? `<td class="numeric">${escapeHtml(row.vsParNS == null ? "" : formatSigned(row.vsParNS))}</td>` : ""}
                <td class="traveler-pairs">${escapeHtml(row.pairNS == null ? "" : row.pairNS)} v ${escapeHtml(row.pairEW == null ? "" : row.pairEW)}${isReport ? `<span class="cell-note">Selected pair</span>` : ""}${names ? `<span class="cell-note pair-names" title="${escapeHtml(names)}">${escapeHtml(names)}</span>` : ""}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderDealDiagram(board, resultSummary) {
    if (!board.deal || !board.deal.raw) {
      return `<div class="deal-missing">No deal recorded for this board.</div>`;
    }
    const vul = vulSides(board.vulnerable);
    const dealerClass = { N: "n", E: "e", S: "s", W: "w" }[board.dealer] || "";
    const nsMakeable = makeableSummary(board, "NS");
    const ewMakeable = makeableSummary(board, "EW");
    const hcpTotal = (board.hcpNS + board.hcpEW) || 1;
    const makeableCorner = nsMakeable || ewMakeable
      ? `<div class="deal-corner corner-nw"><b>Makeable</b><br>NS: ${nsMakeable || "?"} &middot; EW: ${ewMakeable || "?"}</div>`
      : `<div class="deal-corner corner-nw"></div>`;
    const mostPlayed = mostPlayedSummary(resultSummary);
    return `
      <div class="deal-diagram">
        ${makeableCorner}
        <div class="deal-corner corner-ne">
          <b>HCP</b> <span class="num">NS ${escapeHtml(board.hcpNS)} &middot; EW ${escapeHtml(board.hcpEW)}</span>
          <div class="hcp-bar" role="img" aria-label="High-card points: NS ${escapeHtml(board.hcpNS)}, EW ${escapeHtml(board.hcpEW)}"><span class="ns" style="width:${((board.hcpNS / hcpTotal) * 100).toFixed(1)}%"></span><span class="ew" style="width:${((board.hcpEW / hcpTotal) * 100).toFixed(1)}%"></span></div>
        </div>
        ${renderHandBlock(board, "N")}
        ${renderHandBlock(board, "W")}
        <div class="deal-table" role="img" aria-label="Board ${escapeHtml(board.boardNo)}, dealer ${escapeHtml(seatName(board.dealer) || "unknown")}, ${escapeHtml(vulLabel(board.vulnerable))}">
          <span class="band ns top${vul.ns ? " vul" : ""}"></span>
          <span class="band ns bottom${vul.ns ? " vul" : ""}"></span>
          <span class="band ew left${vul.ew ? " vul" : ""}"></span>
          <span class="band ew right${vul.ew ? " vul" : ""}"></span>
          ${dealerClass ? `<span class="dealer-pip ${dealerClass}" aria-hidden="true">D</span>` : ""}
          <span class="deal-table-center"><b>${escapeHtml(board.boardNo)}</b>${escapeHtml(vulLabel(board.vulnerable))}</span>
        </div>
        ${renderHandBlock(board, "E")}
        ${renderHandBlock(board, "S")}
        <div class="deal-corner corner-sw">${resultSummary ? `<b>Field</b><br>${escapeHtml(plural(resultSummary.resultCount, "table"))}${resultSummary.averageNsScore == null ? "" : ` &middot; avg NS <span class="num">${escapeHtml(formatSigned(Math.round(resultSummary.averageNsScore)))}</span>`}` : ""}</div>
        <div class="deal-corner corner-se">${mostPlayed ? `<b>Most played</b><br>${mostPlayed}` : ""}</div>
      </div>
    `;
  }

  function renderHandBlock(board, seat) {
    const hand = board.hands[seat];
    const player = board.tags[seatName(seat)] || "";
    const shapeText = hand.shape ? hand.shape.replace(/-/g, "=") : "";
    return `
      <div class="hand-block seat-${seat.toLowerCase()}">
        <div class="hand-head">
          <span class="hand-seat">${escapeHtml(seatName(seat).toUpperCase())}${player ? ` &middot; ${escapeHtml(player)}` : ""}</span>
          <span class="hand-hcp">${escapeHtml(hand.hcp)} <span>HCP</span></span>
        </div>
        ${SUITS.map((suit) => `
          <div class="hand-suit">
            <span class="suit-glyph ${suit.className}">${suit.html}</span>
            ${hand.cards[suit.key]
              ? `<span class="hand-cards">${escapeHtml(hand.cards[suit.key])}</span>`
              : `<span class="hand-void">void</span>`}
          </div>
        `).join("")}
        <div class="hand-shape">${shapeText ? `${escapeHtml(shapeText)} &middot; ` : ""}${escapeHtml(plural(hand.controls, "control"))}</div>
      </div>
    `;
  }

  function seatName(seat) {
    return { N: "North", E: "East", S: "South", W: "West" }[seat] || seat;
  }

  function renderDoubleDummyTable(board) {
    if (!board.optimumRows.length) return `<div class="empty-state">No double-dummy table found for this board.</div>`;
    const gameTricks = { N: 9, S: 10, H: 10, D: 11, C: 11 };
    const ddSeats = ["N", "S", "E", "W"];
    return `
      <div class="dd-wrap">
        <table class="dd-table">
          <thead>
            <tr>
              <th scope="col">Declarer</th>
              ${DENOMS.map((denom) => `<th scope="col">${denom.key === "N" ? "NT" : `<span class="suit-glyph ${suitMeta(denom.key).className}">${suitMeta(denom.key).html}</span>`}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${ddSeats.map((seat) => `
              <tr>
                <th scope="row">${seat}</th>
                ${DENOMS.map((denom) => {
                  const tricks = getDoubleDummyTricks(board, seat, denom.key);
                  const value = tricks === "" ? null : Number(tricks);
                  const cellClass = value == null ? "" : value >= gameTricks[denom.key] ? " class=\"dd-game\"" : value >= 7 ? " class=\"dd-part\"" : "";
                  return `<td${cellClass}>${escapeHtml(tricks)}</td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="dd-note">Shaded cells make a contract; gold marks a game or slam. Faded cells go down.</div>
    `;
  }

  function renderBoardTagTable(board) {
    const visibleKeys = ["Event", "Site", "Date", "Dealer", "Vulnerable", "Deal", "Declarer", "Contract", "Result", "ParContract", "OptimumScore"];
    const rows = visibleKeys
      .map((key) => [key, board.tags[key]])
      .filter(([, value]) => value != null && String(value).trim() !== "");
    if (board.issues.length) rows.push(["Issues", board.issues.join("; ")]);
    if (!rows.length) return `<div class="empty-state">No PBN tags recorded for this board.</div>`;
    return `
      <table>
        <thead><tr><th scope="col">Tag</th><th scope="col">Value</th></tr></thead>
        <tbody>
          ${rows.map(([key, value]) => `
            <tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function pbnFileName(analysis) {
    return analysis && analysis.parsed ? analysis.parsed.fileName || "" : "";
  }

  function defaultColumnKeys(mode, analysis) {
    const defaults = {
      boards: ["board", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score", "par_class", "hcp_ns", "hcp_ew", "hcp_delta_ns", "shape_n", "shape_e", "shape_s", "shape_w", "valid_deal"],
      hands: ["board", "dealer", "vulnerable", "seat", "pair", "hand", "hcp", "shape", "spades", "hearts", "diamonds", "clubs", "voids", "longest_suit"],
      pairs: ["board", "dealer", "vulnerable", "pair", "hcp", "hcp_delta_ns", "spades", "hearts", "diamonds", "clubs", "best_fit", "major_fit", "minor_fit", "par_contract", "ns_score"],
      doubleDummy: ["board", "dealer", "vulnerable", "declarer", "pair", "denomination", "tricks", "makeable_level"],
      tags: ["record_index", "board", ...((analysis && analysis.tagKeys) || []).slice(0, 12).map((key) => `tag_${key}`)],
      results: ["board", "round", "table", "pair_ns", "ns_players", "pair_ew", "ew_players", "declarer_side", "declarer_name", "contract", "result", "score_ns", "par_ns", "vs_par_ns", "ns_matchpoints", "ns_percent", "dd_delta"],
      boardResults: ["board", "result_count", "par_ns", "average_ns_score", "average_vs_par", "score_spread", "contract_summary", "top_ns", "top_ew"],
      pairResults: ["rank", "pair", "players", "matchpoints", "top", "percent", "boards", "ns_boards", "ew_boards", "average_score"]
    };
    return defaults[mode] || defaults.boards;
  }

  function getColumnDefs(mode, analysis, results) {
    const boardCols = [
      col("file_name", "File Name", (ctx) => pbnFileName(analysis)),
      col("record_index", "Record Index", (ctx) => ctx.board.index + 1),
      col("board", "Board", (ctx) => ctx.board.boardNo),
      col("event", "Event", (ctx) => ctx.board.tags.Event || ""),
      col("site", "Site", (ctx) => ctx.board.tags.Site || ""),
      col("date", "Date", (ctx) => ctx.board.tags.Date || firstDirective(analysis, ["HRTitleDate"])),
      col("dealer", "Dealer", (ctx) => ctx.board.dealer),
      col("vulnerable", "Vulnerable", (ctx) => ctx.board.vulnerable),
      col("deal", "Deal", (ctx) => ctx.board.deal.raw),
      col("par_contract", "Par Contract", (ctx) => ctx.board.tags.ParContract || ""),
      col("par_side", "Par Side", (ctx) => ctx.board.primaryPar ? ctx.board.primaryPar.pair || ctx.board.primaryPar.side : ""),
      col("par_level", "Par Level", (ctx) => ctx.board.primaryPar ? ctx.board.primaryPar.level : ""),
      col("par_strain", "Par Strain", (ctx) => ctx.board.primaryPar ? ctx.board.primaryPar.strain : ""),
      col("par_class", "Par Class", (ctx) => ctx.board.className),
      col("optimum_score", "Optimum Score", (ctx) => ctx.board.tags.OptimumScore || ""),
      col("optimum_side", "Optimum Side", (ctx) => ctx.board.optimum.pair || ctx.board.optimum.side),
      col("ns_score", "NS Perspective Score", (ctx) => ctx.board.optimum.nsPerspective),
      col("par_edge", "Par Edge", (ctx) => ctx.board.optimum.edge),
      col("actual_contract", "Actual Contract", (ctx) => ctx.board.tags.Contract || ""),
      col("actual_declarer", "Actual Declarer", (ctx) => ctx.board.tags.Declarer || ""),
      col("actual_result", "Actual Result", (ctx) => ctx.board.tags.Result || ""),
      col("hcp_n", "HCP N", (ctx) => ctx.board.hands.N.hcp),
      col("hcp_e", "HCP E", (ctx) => ctx.board.hands.E.hcp),
      col("hcp_s", "HCP S", (ctx) => ctx.board.hands.S.hcp),
      col("hcp_w", "HCP W", (ctx) => ctx.board.hands.W.hcp),
      col("hcp_ns", "HCP NS", (ctx) => ctx.board.hcpNS),
      col("hcp_ew", "HCP EW", (ctx) => ctx.board.hcpEW),
      col("hcp_delta_ns", "HCP Delta NS", (ctx) => ctx.board.hcpDeltaNS),
      col("shape_n", "Shape N", (ctx) => ctx.board.hands.N.shape),
      col("shape_e", "Shape E", (ctx) => ctx.board.hands.E.shape),
      col("shape_s", "Shape S", (ctx) => ctx.board.hands.S.shape),
      col("shape_w", "Shape W", (ctx) => ctx.board.hands.W.shape),
      col("voids", "Voids", (ctx) => ctx.board.voids.join("; ")),
      col("long_suits", "Long Suits", (ctx) => ctx.board.longSuits.join("; ")),
      col("valid_deal", "Valid Deal", (ctx) => ctx.board.validDeal ? "yes" : "no"),
      col("issues", "Issues", (ctx) => ctx.board.issues.join("; "))
    ];

    DENOMS.forEach((denom) => {
      SEATS.forEach((seat) => {
        boardCols.push(col(`dd_${seat}_${denom.key}`, `DD ${seat} ${denom.label}`, (ctx) => getDoubleDummyTricks(ctx.board, seat, denom.key)));
      });
    });

    if (mode === "boards") return boardCols;

    if (mode === "hands") {
      return [
        ...boardCols.filter((entry) => ["file_name", "record_index", "board", "event", "site", "date", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score"].includes(entry.key)),
        col("seat", "Seat", (ctx) => ctx.seat),
        col("pair", "Pair", (ctx) => PAIRS[ctx.seat]),
        col("player", "Player", (ctx) => ctx.board.tags[seatName(ctx.seat)] || ""),
        col("is_dealer", "Is Dealer", (ctx) => ctx.board.dealer === ctx.seat ? "yes" : "no"),
        col("hand", "Hand", (ctx) => ctx.hand.display),
        col("spades", "Spades", (ctx) => ctx.hand.cards.S),
        col("hearts", "Hearts", (ctx) => ctx.hand.cards.H),
        col("diamonds", "Diamonds", (ctx) => ctx.hand.cards.D),
        col("clubs", "Clubs", (ctx) => ctx.hand.cards.C),
        col("hcp", "HCP", (ctx) => ctx.hand.hcp),
        col("controls", "Controls", (ctx) => ctx.hand.controls),
        col("distribution_points", "Distribution Points", (ctx) => ctx.hand.distributionPoints),
        col("shape", "Shape", (ctx) => ctx.hand.shape),
        col("length_spades", "Length Spades", (ctx) => ctx.hand.lengths.S),
        col("length_hearts", "Length Hearts", (ctx) => ctx.hand.lengths.H),
        col("length_diamonds", "Length Diamonds", (ctx) => ctx.hand.lengths.D),
        col("length_clubs", "Length Clubs", (ctx) => ctx.hand.lengths.C),
        col("voids", "Voids", (ctx) => ctx.hand.voids.join("; ")),
        col("singletons", "Singletons", (ctx) => ctx.hand.singletons.join("; ")),
        col("longest_suit", "Longest Suit", (ctx) => `${ctx.hand.longestLength}${ctx.hand.longestSuit}`)
      ];
    }

    if (mode === "pairs") {
      return [
        ...boardCols.filter((entry) => ["file_name", "record_index", "board", "event", "site", "date", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score", "par_edge"].includes(entry.key)),
        col("pair", "Pair", (ctx) => ctx.pair),
        col("hcp", "Pair HCP", (ctx) => ctx.pairStats.hcp),
        col("hcp_delta_ns", "HCP Delta NS", (ctx) => ctx.board.hcpDeltaNS),
        col("spades", "Spades", (ctx) => ctx.pairStats.lengths.S),
        col("hearts", "Hearts", (ctx) => ctx.pairStats.lengths.H),
        col("diamonds", "Diamonds", (ctx) => ctx.pairStats.lengths.D),
        col("clubs", "Clubs", (ctx) => ctx.pairStats.lengths.C),
        col("best_fit", "Best Fit", (ctx) => `${ctx.pairStats.bestFitLength}${ctx.pairStats.bestFitSuit}`),
        col("major_fit", "Major Fit", (ctx) => ctx.pairStats.majorFit),
        col("minor_fit", "Minor Fit", (ctx) => ctx.pairStats.minorFit),
        col("combined_spades", "Combined Spades", (ctx) => ctx.pairStats.holdings.S),
        col("combined_hearts", "Combined Hearts", (ctx) => ctx.pairStats.holdings.H),
        col("combined_diamonds", "Combined Diamonds", (ctx) => ctx.pairStats.holdings.D),
        col("combined_clubs", "Combined Clubs", (ctx) => ctx.pairStats.holdings.C)
      ];
    }

    if (mode === "doubleDummy") {
      return [
        ...boardCols.filter((entry) => ["file_name", "record_index", "board", "event", "site", "date", "dealer", "vulnerable", "par_contract", "optimum_score", "ns_score"].includes(entry.key)),
        col("declarer", "Declarer", (ctx) => ctx.dd.declarer),
        col("pair", "Pair", (ctx) => ctx.dd.pair),
        col("denomination", "Denomination", (ctx) => denomMeta(ctx.dd.denomination).label),
        col("denomination_code", "Denomination Code", (ctx) => ctx.dd.denomination),
        col("tricks", "Tricks", (ctx) => ctx.dd.tricks),
        col("makeable_level", "Makeable Level", (ctx) => ctx.dd.makeableLevel),
        col("game_available", "Game Available", (ctx) => isGameAvailable(ctx.dd) ? "yes" : "no")
      ];
    }

    if (mode === "tags") {
      if (!analysis) return [];
      return [
        col("file_name", "File Name", () => pbnFileName(analysis)),
        col("record_index", "Record Index", (ctx) => ctx.board.index + 1),
        col("board", "Board", (ctx) => ctx.board.boardNo),
        ...analysis.tagKeys.map((key) => col(`tag_${key}`, key, (ctx) => ctx.board.tags[key] || ""))
      ];
    }

    if (mode === "results") {
      return [
        col("pbn_file", "PBN File", () => pbnFileName(analysis)),
        col("result_file", "Result File", () => results ? results.fileName : ""),
        col("result_source", "Result Source", () => results ? results.sourceType : ""),
        col("row_id", "Row ID", (ctx) => ctx.result.id),
        col("board", "Board", (ctx) => ctx.result.boardNo),
        col("section", "Section", (ctx) => ctx.result.section),
        col("round", "Round", (ctx) => ctx.result.round),
        col("table", "Table", (ctx) => ctx.result.tableNo),
        col("pair_ns", "Pair NS", (ctx) => ctx.result.pairNS),
        col("ns_partnership", "NS Partnership", (ctx) => ctx.result.nsParticipantNo),
        col("ns_players", "NS Players", (ctx) => ctx.result.nsPlayers),
        col("ns_known_players", "NS Known Players", (ctx) => ctx.result.nsKnownPlayers),
        col("pair_ew", "Pair EW", (ctx) => ctx.result.pairEW),
        col("ew_partnership", "EW Partnership", (ctx) => ctx.result.ewParticipantNo),
        col("ew_players", "EW Players", (ctx) => ctx.result.ewPlayers),
        col("ew_known_players", "EW Known Players", (ctx) => ctx.result.ewKnownPlayers),
        col("declarer_number", "Declarer Number", (ctx) => ctx.result.declarerNumber),
        col("declarer_side", "Declarer Side", (ctx) => ctx.result.declarerSide),
        col("declarer_name", "Declarer Name", (ctx) => ctx.result.declarerName),
        col("declarer_pair", "Declarer Pair", (ctx) => ctx.result.declarerPair),
        col("contract", "Contract", (ctx) => ctx.result.contract),
        col("result", "Result", (ctx) => ctx.result.result),
        col("contract_class", "Contract Class", (ctx) => ctx.result.contractClass),
        col("tricks", "Tricks Taken", (ctx) => ctx.result.tricks),
        col("score_declarer", "Declarer Score", (ctx) => ctx.result.scoreDeclarer),
        col("score_ns", "NS Score", (ctx) => ctx.result.scoreNS),
        col("par_contract", "PBN Par Contract", (ctx) => ctx.board ? ctx.board.tags.ParContract || "" : ""),
        col("par_ns", "PBN Par NS Score", (ctx) => ctx.result.parNS),
        col("vs_par_ns", "NS Score Vs Par", (ctx) => ctx.result.vsParNS),
        col("dd_tricks", "Double Dummy Tricks", (ctx) => ctx.result.ddTricks),
        col("dd_delta", "Tricks Vs Double Dummy", (ctx) => ctx.result.ddDelta),
        col("ns_matchpoints", "NS Matchpoints", (ctx) => ctx.result.nsMatchpoints == null ? "" : ctx.result.nsMatchpoints.toFixed(1)),
        col("ns_percent", "NS Percent", (ctx) => ctx.result.nsPercent == null ? "" : ctx.result.nsPercent.toFixed(1)),
        col("ew_matchpoints", "EW Matchpoints", (ctx) => ctx.result.ewMatchpoints == null ? "" : ctx.result.ewMatchpoints.toFixed(1)),
        col("ew_percent", "EW Percent", (ctx) => ctx.result.ewPercent == null ? "" : ctx.result.ewPercent.toFixed(1)),
        col("date_log", "Date Log", (ctx) => ctx.result.dateLog),
        col("time_log", "Time Log", (ctx) => ctx.result.timeLog),
        col("lead_card", "Lead Card", (ctx) => ctx.result.leadCard),
        col("remarks", "Remarks", (ctx) => ctx.result.remarks)
      ];
    }

    if (mode === "boardResults") {
      return [
        col("pbn_file", "PBN File", () => pbnFileName(analysis)),
        col("result_file", "Result File", () => results ? results.fileName : ""),
        col("board", "Board", (ctx) => ctx.boardSummary.boardNo),
        col("dealer", "Dealer", (ctx) => ctx.boardSummary.board ? ctx.boardSummary.board.dealer : ""),
        col("vulnerable", "Vulnerable", (ctx) => ctx.boardSummary.board ? ctx.boardSummary.board.vulnerable : ""),
        col("result_count", "Result Count", (ctx) => ctx.boardSummary.resultCount),
        col("scored_count", "Scored Count", (ctx) => ctx.boardSummary.scoredCount),
        col("par_contract", "PBN Par Contract", (ctx) => ctx.boardSummary.board ? ctx.boardSummary.board.tags.ParContract || "" : ""),
        col("par_ns", "PBN Par NS Score", (ctx) => ctx.boardSummary.parNS),
        col("average_ns_score", "Average NS Score", (ctx) => ctx.boardSummary.averageNsScore == null ? "" : Math.round(ctx.boardSummary.averageNsScore)),
        col("average_vs_par", "Average NS Vs Par", (ctx) => ctx.boardSummary.averageVsPar == null ? "" : Math.round(ctx.boardSummary.averageVsPar)),
        col("min_ns_score", "Min NS Score", (ctx) => ctx.boardSummary.minNsScore),
        col("max_ns_score", "Max NS Score", (ctx) => ctx.boardSummary.maxNsScore),
        col("score_spread", "Score Spread", (ctx) => ctx.boardSummary.scoreSpread),
        col("average_dd_delta", "Average DD Delta", (ctx) => ctx.boardSummary.averageDdDelta == null ? "" : ctx.boardSummary.averageDdDelta.toFixed(2)),
        col("contract_summary", "Contract Summary", (ctx) => ctx.boardSummary.contractSummary),
        col("top_ns", "Top NS Pairs", (ctx) => ctx.boardSummary.topNs.join("; ")),
        col("top_ew", "Top EW Pairs", (ctx) => ctx.boardSummary.topEw.join("; "))
      ];
    }

    if (mode === "pairResults") {
      return [
        col("pbn_file", "PBN File", () => pbnFileName(analysis)),
        col("result_file", "Result File", () => results ? results.fileName : ""),
        col("rank", "Rank", (ctx) => ctx.pairStanding.rank),
        col("pair", "Pair", (ctx) => ctx.pairStanding.pairNo),
        col("players", "Players", (ctx) => ctx.pairStanding.players || ""),
        col("known_players", "Known Players", (ctx) => ctx.pairStanding.knownPlayers),
        col("matchpoints", "Matchpoints", (ctx) => ctx.pairStanding.matchpoints.toFixed(1)),
        col("top", "Top", (ctx) => ctx.pairStanding.top.toFixed(1)),
        col("percent", "Percent", (ctx) => ctx.pairStanding.percent == null ? "" : ctx.pairStanding.percent.toFixed(2)),
        col("boards", "Boards", (ctx) => ctx.pairStanding.boards),
        col("ns_boards", "NS Boards", (ctx) => ctx.pairStanding.nsBoards),
        col("ew_boards", "EW Boards", (ctx) => ctx.pairStanding.ewBoards),
        col("average_score", "Average Score", (ctx) => ctx.pairStanding.averageScore.toFixed(1))
      ];
    }

    return boardCols;
  }

  function col(key, label, value) {
    return { key, label, value, description: termDefinition(label) };
  }

  function isGameAvailable(dd) {
    if (!dd || dd.tricks == null) return false;
    if (dd.denomination === "N") return dd.tricks >= 9;
    if (dd.denomination === "S" || dd.denomination === "H") return dd.tricks >= 10;
    return dd.tricks >= 11;
  }

  function getCsvContexts(mode, analysis, results) {
    if (mode === "results") {
      return results ? results.rows.map((result) => ({ result, board: result.board })) : [];
    }
    if (mode === "boardResults") {
      return results ? results.boardSummaries.map((boardSummary) => ({ boardSummary, board: boardSummary.board })) : [];
    }
    if (mode === "pairResults") {
      return results ? results.pairStandings.map((pairStanding) => ({ pairStanding })) : [];
    }
    if (!analysis) return [];
    if (mode === "hands") {
      return analysis.boards.flatMap((board) => SEATS.map((seat) => ({ board, seat, hand: board.hands[seat] })));
    }
    if (mode === "pairs") {
      return analysis.boards.flatMap((board) => ["NS", "EW"].map((pair) => ({ board, pair, pairStats: board.pairs[pair] })));
    }
    if (mode === "doubleDummy") {
      return analysis.boards.flatMap((board) => board.optimumRows.map((dd) => ({ board, dd })));
    }
    return analysis.boards.map((board) => ({ board }));
  }

  function updateRowModeOptions() {
    const select = document.getElementById("rowMode");
    if (!select) return;
    const hasPbn = !!STATE.analysis;
    const resultModes = new Set(["results", "boardResults", "pairResults"]);
    Array.from(select.options).forEach((option) => {
      option.disabled = !hasPbn && !resultModes.has(option.value);
    });
  }

  function renderCsvControls() {
    const analysis = STATE.analysis;
    if (!analysis && !STATE.results) return;
    if (!analysis && !["results", "boardResults", "pairResults"].includes(STATE.rowMode)) {
      STATE.rowMode = "results";
      STATE.selectedColumns = new Set(defaultColumnKeys("results", analysis));
    }
    const defs = getColumnDefs(STATE.rowMode, analysis, STATE.results);
    const selected = STATE.selectedColumns;
    updateRowModeOptions();
    document.getElementById("rowMode").value = STATE.rowMode;

    document.getElementById("csvCaption").textContent = `${plural(getCsvContexts(STATE.rowMode, analysis, STATE.results).length, "row")} available.`;
    document.getElementById("columnList").innerHTML = defs.map((entry) => `
      <label class="column-check${entry.description ? " term-tip" : ""}"${entry.description ? ` data-tooltip="${escapeHtml(entry.description)}" aria-describedby="termTooltip" tabindex="0"` : ""}>
        <input type="checkbox" data-column-key="${escapeHtml(entry.key)}" ${selected.has(entry.key) ? "checked" : ""}>
        <span>${escapeHtml(entry.label)}</span>
      </label>
    `).join("");
    renderCsvPreview();
    annotateTermTooltips(document.getElementById("columnList"));
  }

  function selectedColumnDefs() {
    const analysis = STATE.analysis;
    const defs = getColumnDefs(STATE.rowMode, analysis, STATE.results);
    return defs.filter((entry) => STATE.selectedColumns.has(entry.key));
  }

  function renderCsvPreview() {
    const analysis = STATE.analysis;
    const columns = selectedColumnDefs();
    const contexts = getCsvContexts(STATE.rowMode, analysis, STATE.results).slice(0, 12);
    if (!columns.length) {
      document.getElementById("csvPreview").innerHTML = `<div class="empty-state">Choose at least one column.</div>`;
      return;
    }
    if (!contexts.length) {
      document.getElementById("csvPreview").innerHTML = `<div class="empty-state">This row mode has no rows for the current file.</div>`;
      return;
    }

    document.getElementById("csvPreview").innerHTML = `
      <table>
        <thead><tr>${columns.map((colDef) => th(colDef.label, "", colDef.description)).join("")}</tr></thead>
        <tbody>
          ${contexts.map((ctx) => `
            <tr>${columns.map((colDef) => `<td>${escapeHtml(colDef.value(ctx))}</td>`).join("")}</tr>
          `).join("")}
        </tbody>
      </table>
    `;
    annotateTermTooltips(document.getElementById("csvPreview"));
  }

  function makeCsv() {
    const analysis = STATE.analysis;
    const columns = selectedColumnDefs();
    const contexts = getCsvContexts(STATE.rowMode, analysis, STATE.results);
    if (!columns.length) throw new Error("Choose at least one CSV column.");
    const rows = [
      columns.map((entry) => csvCell(entry.label)).join(","),
      ...contexts.map((ctx) => columns.map((entry) => csvCell(entry.value(ctx))).join(","))
    ];
    return rows.join("\r\n");
  }

  function csvCell(value) {
    let text = String(value == null ? "" : value);
    const formulaLike = (/^[=@\t\r]/.test(text) && text !== "=") || /^[+-][A-Za-z(@]/.test(text);
    if (formulaLike) text = `'${text}`;
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function downloadCsv() {
    try {
      const csv = makeCsv();
      const baseName = STATE.analysis && STATE.analysis.parsed.fileName
        ? STATE.analysis.parsed.fileName
        : STATE.results && STATE.results.fileName
          ? STATE.results.fileName
          : "bridge";
      const base = baseName
        .replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "bridge";
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}-${STATE.rowMode}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("CSV downloaded.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  // Browser file I/O, drag-and-drop, event wiring, and startup.
  function decodeTextBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  }

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCurrentPbn(decodeTextBuffer(reader.result), file.name);
    };
    reader.onerror = () => {
      showToast("Could not read the selected file.", "error");
    };
    reader.readAsArrayBuffer(file);
  }

  function readResultsFile(file) {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = lowerName.endsWith(".bws")
          ? parseBwsBuffer(reader.result, file.name)
          : parseResultsCsv(decodeTextBuffer(reader.result), file.name, file.size);
        setCurrentResults(raw);
      } catch (error) {
        showToast(`Could not import results: ${error.message}`, "error");
      }
    };
    reader.onerror = () => {
      showToast("Could not read the selected results file.", "error");
    };
    reader.readAsArrayBuffer(file);
  }

  function droppedFileKind(file) {
    const name = String(file && file.name || "").toLowerCase();
    if (name.endsWith(".bws") || name.endsWith(".csv")) return "results";
    if (name.endsWith(".pbn") || name.endsWith(".txt")) return "pbn";
    if (file && file.type === "text/csv") return "results";
    if (file && /^text\//i.test(file.type)) return "pbn";
    return "";
  }

  function readDroppedFiles(files) {
    const dropped = Array.from(files || []).filter(Boolean);
    if (!dropped.length) return;
    let pbnFile = null;
    let resultsFile = null;
    const ignored = [];
    dropped.forEach((file) => {
      const kind = droppedFileKind(file);
      if (kind === "pbn" && !pbnFile) pbnFile = file;
      else if (kind === "results" && !resultsFile) resultsFile = file;
      else ignored.push(file.name);
    });
    if (!pbnFile && !resultsFile) {
      showToast("Drop a PBN hand record or a BWS/CSV results file.", "error");
      return;
    }
    if (pbnFile) readFile(pbnFile);
    if (resultsFile) readResultsFile(resultsFile);
    if (ignored.length) {
      showToast(`Ignored ${plural(ignored.length, "extra file")}: ${ignored.join(", ")}`, "error");
    }
  }

  function setupSummaryControls() {
    const selector = [
      "summary.panel-header .summary-control",
      "summary.panel-header button",
      "summary.panel-header select",
      "summary.panel-header input",
      "summary.panel-header label"
    ].join(",");
    const controls = document.querySelectorAll(selector);
    controls.forEach((control) => {
      ["click", "mousedown", "pointerdown", "keydown"].forEach((eventName) => {
        control.addEventListener(eventName, (event) => {
          event.stopPropagation();
        });
      });
    });
  }

  function setupEvents() {
    setupSummaryControls();

    const fileInputs = [document.getElementById("pbnFile")];
    fileInputs.forEach((input) => {
      input.addEventListener("change", (event) => {
        readFile(event.target.files[0]);
        event.target.value = "";
      });
    });

    const resultInputs = [document.getElementById("resultsFile")];
    resultInputs.forEach((input) => {
      input.addEventListener("change", (event) => {
        readResultsFile(event.target.files[0]);
        event.target.value = "";
      });
    });

    const dropZone = document.getElementById("dropZone");
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragging");
      });
    });
    dropZone.addEventListener("drop", (event) => {
      readDroppedFiles(event.dataTransfer.files);
    });

    document.getElementById("clearAppButton").addEventListener("click", clearLoadedData);
    document.getElementById("boardOverlayClose").addEventListener("click", () => closeBoardOverlay());
    document.getElementById("boardOverlay").addEventListener("click", (event) => {
      if (event.target.closest("[data-board-overlay-close]")) closeBoardOverlay();
    });
    document.getElementById("boardOverlayOpenExplorer").addEventListener("click", () => {
      const boardNo = document.getElementById("boardOverlay").getAttribute("data-board-no");
      closeBoardOverlay({ restoreFocus: false });
      if (boardNo) revealBoardInExplorer(boardNo);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeBoardOverlay();
    });
    document.getElementById("taskNav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-task-view]");
      if (!button || button.disabled) return;
      STATE.activeView = button.getAttribute("data-task-view");
      renderTaskNav(STATE.analysis, STATE.results);
      applyActiveView();
    });

    document.getElementById("boardSearch").addEventListener("input", (event) => {
      STATE.filters.search = event.target.value;
      renderBoards();
    });
    document.getElementById("sideFilter").addEventListener("change", (event) => {
      STATE.filters.side = event.target.value;
      renderBoards();
    });
    document.getElementById("classFilter").addEventListener("change", (event) => {
      STATE.filters.className = event.target.value;
      renderBoards();
    });
    document.getElementById("vulFilter").addEventListener("change", (event) => {
      STATE.filters.vulnerability = event.target.value;
      renderBoards();
    });
    document.getElementById("playedFilter").addEventListener("change", (event) => {
      STATE.filters.played = event.target.value;
      renderBoards();
    });
    document.getElementById("scoreOutlierToggle").addEventListener("change", (event) => {
      STATE.scoreOutliersOnly = event.target.checked;
      if (STATE.analysis) renderCharts(STATE.analysis, STATE.results);
    });
    document.getElementById("boardGrid").addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-board-select]");
      if (!trigger) return;
      event.preventDefault();
      selectBoardInExplorer(trigger.getAttribute("data-board-select"));
    });
    document.getElementById("reportPairSelect").addEventListener("change", (event) => {
      STATE.reportPair = event.target.value;
      renderPairImprovementReport(STATE.results);
    });
    document.getElementById("dashboard").addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-board-jump]");
      if (!trigger) return;
      event.preventDefault();
      const boardNo = trigger.getAttribute("data-board-jump");
      if (trigger.closest("#boardExplorerPanel")) revealBoardInExplorer(boardNo);
      else showBoardOverlay(boardNo);
    });

    document.getElementById("rowMode").addEventListener("change", (event) => {
      STATE.rowMode = event.target.value;
      STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, STATE.analysis));
      renderCsvControls();
    });

    document.getElementById("columnList").addEventListener("change", (event) => {
      const key = event.target.getAttribute("data-column-key");
      if (!key) return;
      if (event.target.checked) STATE.selectedColumns.add(key);
      else STATE.selectedColumns.delete(key);
      renderCsvPreview();
    });

    document.getElementById("selectDefaultColumns").addEventListener("click", () => {
      STATE.selectedColumns = new Set(defaultColumnKeys(STATE.rowMode, STATE.analysis));
      renderCsvControls();
    });
    document.getElementById("selectAllColumns").addEventListener("click", () => {
      STATE.selectedColumns = new Set(getColumnDefs(STATE.rowMode, STATE.analysis, STATE.results).map((entry) => entry.key));
      renderCsvControls();
    });
    document.getElementById("clearColumns").addEventListener("click", () => {
      STATE.selectedColumns = new Set();
      renderCsvControls();
    });
    document.getElementById("downloadCsvButton").addEventListener("click", downloadCsv);
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

    window.addEventListener("scroll", () => {
      if (activeTarget) positionTooltip(tooltip, activeTarget);
    }, true);
    window.addEventListener("resize", () => {
      if (activeTarget) positionTooltip(tooltip, activeTarget);
    });
  }

  function init() {
    initAppVersion();
    setupTooltips();
    setupEvents();
    renderAll();
    annotateTermTooltips(document.body);
  }

  function initAppVersion() {
    const element = document.getElementById("appVersion");
    if (!element) return;
    const version = element.getAttribute("data-version") || "";
    if (version && !version.includes("__")) {
      element.textContent = `v${version}`;
    }
  }

  if (typeof window !== "undefined") {
    window.PBNAnalyzer = {
      parsePbn,
      buildAnalysis,
      parseBwsBuffer,
      parseResultsCsv,
      buildResultsAnalysis,
      buildPairImprovementReport,
      scoreDuplicateContract,
      parseDeal,
      getColumnDefs,
      getCsvContexts,
      csvCell,
      decodeTextBuffer,
      contractGlyphHtml
    };
    window.addEventListener("DOMContentLoaded", init);
  }
}());
