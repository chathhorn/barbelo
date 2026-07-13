// JSDoc-only contracts for the self-contained Bridge Simulator package.

/**
 * @typedef {Object} SimulatorCard
 * @property {"S"|"H"|"D"|"C"} suit
 * @property {string} rank
 */

/**
 * @typedef {Object} SimulatorWing
 * @property {string} slot
 * @property {string} title
 * @property {string} encounterSkin
 * @property {{ summary: string[], details: string[] }} coachFeedback
 */

/**
 * Immutable, generic content used by every run. It contains no analyzer,
 * uploaded-file, pair, result-row, or report data.
 *
 * @typedef {Object} SimulatorScenario
 * @property {number} schemaVersion
 * @property {string} seed
 * @property {{ bark: string[] }} briefing
 * @property {{ key: string }} palette
 * @property {{ cards: SimulatorCard[] }} hand
 * @property {SimulatorWing[]} wings
 * @property {{ title: string, encounterSkin: string }} boss
 * @property {{ notes: string[], nextTableHabit: string[] }} debrief
 */

export {};
