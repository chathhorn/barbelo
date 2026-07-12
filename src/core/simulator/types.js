// JSDoc-only data contracts for the dependency-free simulator scenario
// layer. Runtime game/renderer types belong outside src/core/simulator.

/**
 * Stable identity for one played result row. Board numbers alone are not
 * unique because replays and multi-section events are supported.
 *
 * @typedef {Object} SimulatorRowIdentity
 * @property {number|string} rowIndex
 * @property {string} fieldKey
 * @property {number|null} boardNo
 * @property {string} key
 */

/**
 * One independently attributable piece of copy. Mixed factual/comedic
 * prose is represented as multiple segments rather than assigning a false
 * provenance to the whole sentence.
 *
 * @typedef {Object} SimulatorContentSegment
 * @property {string} text
 * @property {"report"|"static"|"fiction"} claimKind
 * @property {string[]} sourceFields
 * @property {SimulatorRowIdentity|null} rowIdentity
 * @property {string|null} contentId
 * @property {{ level: string, label: string, detail: string }|null} confidence
 * @property {string|null} transform
 */

/**
 * @typedef {Object} SimulatorCard
 * @property {"S"|"H"|"D"|"C"} suit
 * @property {string} rank
 */

/**
 * Flat, neutral evidence about a featured board. It intentionally contains
 * no player names or raw result-row references.
 *
 * @typedef {Object} SimulatorFeaturedBoard
 * @property {SimulatorRowIdentity} rowIdentity
 * @property {number|null} boardNo
 * @property {string} side
 * @property {boolean} declared
 * @property {string} contract
 * @property {string} result
 * @property {string} contractText
 * @property {number|null} pairScore
 * @property {number|null} percent
 * @property {string} categoryKey
 * @property {string} categoryLabel
 * @property {{ level: string, label: string, detail: string }|null} confidence
 * @property {string} vulnerability
 * @property {{ label: string, contract: string, score: number|null, percent: number|null }|null} betterPeer
 */

/**
 * Serializable scenario produced from a selected pair's completed report.
 *
 * @typedef {Object} SimulatorScenario
 * @property {number} schemaVersion
 * @property {string} seed
 * @property {{ pairKey: string, pairLabel: string, players: string }} identity
 * @property {"restore-honor"|"defend-crown"} mode
 * @property {{ bark: SimulatorContentSegment[], fullText: SimulatorContentSegment[] }} briefing
 * @property {{ key: string, vulnerability: string }} palette
 * @property {{ source: "pbn"|"practice", rowIdentity: SimulatorRowIdentity|null, boardNo: number|null, seat: string|null, cards: SimulatorCard[], provenanceNote: SimulatorContentSegment[] }} representativeHand
 * @property {Array<Object<string, *>>} wings
 * @property {Array<Object<string, *>>} rivals
 * @property {Array<Object<string, *>>} terminals
 * @property {Object<string, *>} boss
 * @property {Object<string, *>} debrief
 * @property {Object<string, *>} coaching
 * @property {Object<string, *>} provenance
 */

export {};
