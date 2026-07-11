// Shared JSDoc typedefs for the shapes passed between parser, core, and
// UI modules. This file contains no runtime code; import the types with
// `import("./types.js").TypeName` inside JSDoc annotations.
//
// Field lists are derived from the constructing functions named next to
// each typedef; keep them in sync when those constructors change.

/**
 * Output of `parseBwsBuffer` (src/parsers/bws.js) and `parseResultsCsv`
 * (src/parsers/csv.js): raw traveler rows before scoring/normalization.
 *
 * @typedef {Object} RawResults
 * @property {string} fileName
 * @property {string} sourceType "BWS" or "CSV".
 * @property {Array<Object<string, *>>} receivedData Raw result rows keyed
 *   by source column name (Board, PairNS, Contract, Result, ...).
 * @property {Array<Object<string, *>>} playerNumbers Raw PlayerNumbers
 *   rows (BWS only; empty for CSV).
 * @property {{ signature?: string, pageSize?: number, diagnostics?: Object<string, *> }} metadata
 * @property {string[]} warnings
 */

/**
 * Result of `parsePlayedContract` (src/core/contracts.js).
 *
 * @typedef {Object} ParsedContract
 * @property {string} raw Normalized contract text ("3 NT X", "PASS", "").
 * @property {boolean} passout
 * @property {number|null} level 1-7, or null when unparseable/passout.
 * @property {string} strain "N", "S", "H", "D", "C", or "".
 * @property {string} doubled "", "X", or "XX".
 * @property {string} className "Partscore", "Game-level", "Slam-level",
 *   "Passout", or "Unknown".
 */

/**
 * Director adjustment parsed from a Remarks field by
 * `parseScoreAdjustment` (src/core/results.js), e.g. "40%-60%" or "A+".
 *
 * @typedef {Object} ScoreAdjustment
 * @property {number} nsPercent
 * @property {number} ewPercent
 */

/**
 * Result of `parseDeal` (src/parsers/pbn.js).
 *
 * @typedef {Object} Deal
 * @property {string} raw
 * @property {string} firstSeat
 * @property {Object<string, Object<string, string>>} hands Seat -> suit
 *   key ("S"/"H"/"D"/"C") -> sorted holding string.
 * @property {boolean} valid
 * @property {string[]} issues
 */

/**
 * Result of `analyzeHand` (src/core/boards.js).
 *
 * @typedef {Object} HandAnalysis
 * @property {Object<string, string>} cards Suit key -> sorted holding.
 * @property {Object<string, number>} lengths Suit key -> suit length.
 * @property {number} hcp
 * @property {Object<string, number>} hcpBySuit
 * @property {number} controls
 * @property {number} distributionPoints
 * @property {string} shape "5-3-3-2" style, S-H-D-C order.
 * @property {string} longestSuit
 * @property {number} longestLength
 * @property {string[]} voids
 * @property {string[]} singletons
 * @property {string} display "AKQ2.T98.65.J432" style.
 */

/**
 * Result of `combinePairStats` (src/core/boards.js).
 *
 * @typedef {Object} PairStats
 * @property {string} pair "NS" or "EW".
 * @property {string[]} seats
 * @property {number} hcp
 * @property {Object<string, number>} lengths Combined suit lengths.
 * @property {Object<string, string>} holdings Combined holdings.
 * @property {string} bestFitSuit
 * @property {number} bestFitLength
 * @property {number} majorFit
 * @property {number} minorFit
 */

/**
 * Result of `parseOptimumScore` (src/parsers/pbn.js).
 *
 * @typedef {Object} OptimumScore
 * @property {string} side "NS", "EW", a seat letter, or "".
 * @property {string} pair "NS", "EW", or "".
 * @property {string} [raw] Absent on fallback (no-PBN) boards.
 * @property {number|null} [score] From the quoted side's perspective;
 *   absent on fallback boards.
 * @property {number|null} nsPerspective Score sign-flipped to NS view.
 * @property {string} edge "NS", "EW", or "Flat".
 */

/**
 * One double-dummy row from `parseOptimumRows` or
 * `parseDoubleDummyTricks` (src/parsers/pbn.js).
 *
 * @typedef {Object} OptimumRow
 * @property {string} declarer Seat letter.
 * @property {string} pair "NS" or "EW".
 * @property {string} denomination "N", "S", "H", "D", or "C".
 * @property {number} tricks
 * @property {number} makeableLevel max(0, tricks - 6).
 */

/**
 * One par-contract piece from `parseParContracts` (src/parsers/pbn.js).
 *
 * @typedef {Object} ParContract
 * @property {string} raw
 * @property {string} side
 * @property {string} pair
 * @property {number|null} level
 * @property {string} strain
 * @property {string} doubled
 * @property {string} result
 * @property {string} className
 */

/**
 * One analyzed PBN board from `normalizeBoard` (src/core/boards.js).
 * `fallbackResultBoard` builds a reduced Board (standard dealer and
 * vulnerability only) for result rows with no PBN board, so the
 * deal-derived fields are optional.
 *
 * @typedef {Object} Board
 * @property {number} boardNo
 * @property {string} dealer Seat letter, possibly inferred from boardNo.
 * @property {string} vulnerable "None", "NS", "EW", or "All".
 * @property {Object<string, string>} tags Raw PBN tag values.
 * @property {OptimumScore} optimum
 * @property {OptimumRow[]} optimumRows Double-dummy table (may be empty).
 * @property {string} className Par contract class, or "Unknown".
 * @property {string[]} issues
 * @property {number} [index] Record index in the PBN file.
 * @property {Object} [record] The raw parsed PBN record.
 * @property {Deal} [deal]
 * @property {Object<string, HandAnalysis>} [hands] Keyed by seat letter.
 * @property {{ NS: PairStats, EW: PairStats }} [pairs]
 * @property {number} [hcpNS]
 * @property {number} [hcpEW]
 * @property {number} [hcpDeltaNS]
 * @property {ParContract[]} [parContracts]
 * @property {ParContract|null} [primaryPar]
 * @property {string[]} [voids] "N S" style seat + suit entries.
 * @property {string[]} [longSuits]
 * @property {boolean} [validDeal]
 */

/**
 * Result of `buildAnalysis` (src/core/boards.js); `emptyAnalysis`
 * returns the same shape with empty collections and a reduced summary.
 *
 * @typedef {Object} PbnAnalysis
 * @property {{ fileName: string, directives: Array<Object>, warnings: string[], records?: Array<Object> }} parsed
 * @property {Board[]} boards
 * @property {string[]} tagKeys
 * @property {Map<string, string[]>} directiveMap
 * @property {Object<string, *>} summary Aggregate counts and outlier
 *   lists (boardCount, validDeals, parEdges, classes, ...).
 */

/**
 * One normalized, scored traveler row from `normalizeResultRow`
 * (src/core/results.js). Scores are stored NS-perspective in `scoreNS`
 * (EW score = -scoreNS). Fields marked optional are attached later in
 * `buildResultsAnalysis` (fieldKey), `attachPlayerNames` (names and
 * participant keys), and `applyMatchpoints` (matchpoint fields).
 *
 * @typedef {Object} ResultRow
 * @property {number} index Position in the raw receivedData array.
 * @property {string|number} id Source row ID, or "".
 * @property {number|null} section
 * @property {number|null} tableNo
 * @property {number|null} round
 * @property {number} boardNo
 * @property {number|null} pairNS
 * @property {number|null} pairEW
 * @property {number|null} declarerNumber Declarer's pair number.
 * @property {string} declarerSide Seat letter, or "".
 * @property {string} declarerPair "NS", "EW", or "".
 * @property {string} contract Normalized contract text.
 * @property {string} result Normalized result text ("=", "+1", "-2", ...).
 * @property {ParsedContract} parsedContract
 * @property {string} contractClass
 * @property {number|null} tricks Tricks taken by declarer.
 * @property {number|null} scoreDeclarer Score from declarer's view.
 * @property {number|null} scoreNS Score from NS's view (EW = -scoreNS).
 * @property {number|null} parNS PBN par from NS's view.
 * @property {number|null} vsParNS scoreNS - parNS.
 * @property {number|null} ddTricks Double-dummy tricks for the contract.
 * @property {number|null} ddDelta tricks - ddTricks.
 * @property {string} leadCard
 * @property {string} remarks
 * @property {ScoreAdjustment|null} adjustment Director percentage award.
 * @property {string} dateLog
 * @property {string} timeLog
 * @property {number} erased 1 when the row was corrected/erased.
 * @property {string} scoringError
 * @property {Board} board The PBN board, or a fallback stub.
 * @property {boolean} hasPbnBoard
 * @property {string} [fieldKey] Matchpointing field: boardNo, section-
 *   scoped ("2|7") in multi-section events.
 * @property {string} [nsPlayers]
 * @property {string} [ewPlayers]
 * @property {string} [nsParticipantKey] "N" in pair mode, "N:NS" in side
 *   mode, "S<section>:N"-prefixed when multi-section.
 * @property {string} [ewParticipantKey]
 * @property {string} [nsParticipantNo] Display label for the key.
 * @property {string} [ewParticipantNo]
 * @property {string} [nsParticipantPlayers]
 * @property {string} [ewParticipantPlayers]
 * @property {number} [nsKnownPlayers]
 * @property {number} [ewKnownPlayers]
 * @property {number} [nsParticipantKnownPlayers]
 * @property {number} [ewParticipantKnownPlayers]
 * @property {string} [declarerName]
 * @property {number} [boardTop] Scored results on the board minus 1.
 * @property {number} [nsMatchpoints]
 * @property {number} [ewMatchpoints]
 * @property {number|null} [nsPercent]
 * @property {number|null} [ewPercent]
 */

/**
 * One player from `normalizePlayerNumbers` (src/core/results.js).
 *
 * @typedef {Object} PlayerRecord
 * @property {number|null} section
 * @property {number|null} tableNo
 * @property {string} direction Seat letter.
 * @property {string} number Member number, or "".
 * @property {string} name
 * @property {number} round
 * @property {string} placeholder "Table 3 North" style label when the
 *   row has no name or number.
 */

/**
 * One participant's session standing, accumulated in `addPairStanding`
 * and finalized (averageScore/percent/rank) in `buildResultsAnalysis`
 * (src/core/results.js).
 *
 * @typedef {Object} PairStanding
 * @property {string} key Participant key ("4", "4:EW", "S2:4", ...).
 * @property {string|number} pairNo Display pair label.
 * @property {number|null} sourcePairNo Raw pair number from the row.
 * @property {string} rosterSide "NS" or "EW" (first side seen).
 * @property {string} players
 * @property {number} knownPlayers
 * @property {number} matchpoints
 * @property {number} top Sum of board tops for played boards.
 * @property {number} boards
 * @property {number} nsBoards
 * @property {number} ewBoards
 * @property {number[]} scores Per-board scores from this pair's view.
 * @property {number} [averageScore]
 * @property {number|null} [percent] 100 * matchpoints / top.
 * @property {number} [rank]
 */

/**
 * One aggregate board summary from `summarizeResultBoard`
 * (src/core/results.js).
 *
 * @typedef {Object} BoardSummary
 * @property {number} boardNo
 * @property {Board} [board] The PBN board, when loaded.
 * @property {ResultRow[]} rows
 * @property {number} resultCount
 * @property {number} scoredCount
 * @property {number|null} parNS
 * @property {number|null} averageNsScore
 * @property {number|null} averageVsPar
 * @property {number|null} minNsScore
 * @property {number|null} maxNsScore
 * @property {number|null} scoreSpread
 * @property {number|null} averageDdDelta
 * @property {string} contractSummary "3 NT (5), 4 S (2)" style.
 * @property {string[]} topNs Participants sharing the top NS score.
 * @property {string[]} topEw
 */

/**
 * Result of `buildResultsAnalysis` (src/core/results.js): the fully
 * scored session used by every downstream view.
 *
 * @typedef {Object} ResultsAnalysis
 * @property {string} fileName
 * @property {string} sourceType
 * @property {Object<string, *>} metadata
 * @property {RawResults} raw
 * @property {ResultRow[]} rows Normalized rows, erased rows excluded.
 * @property {PlayerRecord[]} playerNumbers
 * @property {Map<string, Object>} pairRosters Roster per participant
 *   key, plus a `profile` summary expando.
 * @property {Object<string, *>} rosterProfile
 * @property {string} participantMode "pair" or "side".
 * @property {boolean} hasPbn
 * @property {Map<string, ResultRow[]>} rowsByBoard Keyed by boardNo.
 * @property {Map<string, ResultRow[]>} rowsByField Keyed by fieldKey;
 *   the comparison groups used for matchpointing.
 * @property {BoardSummary[]} boardSummaries
 * @property {Map<string, BoardSummary>} boardsByNumber
 * @property {PairStanding[]} pairStandings Sorted by percent, ranked.
 * @property {string[]} warnings
 * @property {Object<string, *>} summary Session totals (resultCount,
 *   scoredCount, boardsCovered, pairs, compatibility, averageVsPar, ...).
 */

/**
 * One board seen from a specific pair's perspective, from
 * `pairResultView` (src/core/report.js). Scores here are from the
 * selected pair's own seat direction, not NS-perspective.
 *
 * @typedef {Object} ReportView
 * @property {ResultRow} row
 * @property {string} side "NS" or "EW".
 * @property {string} participantKey
 * @property {string} participantNo
 * @property {string} players
 * @property {boolean} declared Whether this pair declared the board.
 * @property {number|null} pairScore
 * @property {number} matchpoints
 * @property {number|null} percent
 * @property {number|null} mpLoss boardTop - matchpoints.
 * @property {number|null} fieldAverage Same-direction field average.
 * @property {number|null} fieldDelta pairScore - fieldAverage.
 * @property {number|null} parScore Par from this pair's view.
 * @property {number|null} vsPar
 * @property {number|null} trickDeltaForPair ddDelta from this pair's
 *   view (negated when defending).
 * @property {number|null} fieldDdDelta Average peer ddDelta on the board.
 * @property {number|null} relativeTrickDelta trickDeltaForPair minus the
 *   field's expected DD deviation (club fields run below double-dummy).
 * @property {{ className: string, rank: number, text: string }} bestMakeable
 *   Best makeable contract for this pair from the double-dummy table.
 */

/**
 * Result of `buildPairImprovementReport` (src/core/report.js): the full
 * coaching report for one pair.
 *
 * @typedef {Object} Report
 * @property {string} pairKey
 * @property {string|number} pairNo
 * @property {PairStanding} [standing]
 * @property {ReportView[]} rows One view per board the pair played.
 * @property {Array<Object<string, *>>} reviewItems Top boards to review:
 *   ReportView plus reasons, severity, boardLossItem, peerComparison,
 *   and diagnosis.
 * @property {Object<string, *>} lossLedger Same-direction matchpoint
 *   losses: totalLoss, outrightLoss, tieLoss, boardItems, categories.
 * @property {Array<Object<string, *>>} decisionTypes Loss categories
 *   rolled up into decision areas, sorted by lost MP.
 * @property {Array<Object<string, *>>} practicePriorities
 * @property {Object<string, *>} profile Strengths, weaknesses, role and
 *   contract-class stats, and a focus sentence.
 * @property {Object<string, *>} biddingScorecard Game/slam decisions on
 *   boards where double-dummy gives the pair's side a game.
 * @property {Object<string, *>} declaredScorecard Same-contract cohort
 *   verdicts for declared boards, with failure triage.
 * @property {Object<string, *>} defendedScorecard Tricks conceded vs
 *   the room on defended boards.
 * @property {Object<string, *>} overtrickMeter Matchpoint price of one
 *   trick more or fewer on made contracts.
 * @property {Object<string, *>} summary Report-level totals (boards,
 *   percent, mpVsAverage, mpConceded, lowBoards, declaredBoards, ...).
 */

export {};
