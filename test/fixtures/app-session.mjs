import { Buffer } from "node:buffer";

import {
  buildBwsFile,
  buildReceivedRow,
} from "../helpers/bws-fixture.js";

const DEAL = "N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";
const DOUBLE_DUMMY_ROWS = Object.freeze([
  "N NT 9", "N S 10", "N H 8", "N D 8", "N C 8",
  "S NT 9", "S S 10", "S H 8", "S D 8", "S C 8",
  "E NT 4", "E S 3", "E H 5", "E D 5", "E C 5",
  "W NT 4", "W S 3", "W H 5", "W D 5", "W C 5",
]);

const BOARD_RESULTS = Object.freeze([
  Object.freeze([
    { pairNS: 1, pairEW: 5, direction: "N", contract: "3 NT", result: "=" },
    { pairNS: 2, pairEW: 6, direction: "N", contract: "3 NT", result: "+1" },
    { pairNS: 3, pairEW: 7, direction: "N", contract: "3 NT", result: "+1" },
    { pairNS: 4, pairEW: 8, direction: "N", contract: "3 NT", result: "-1" },
  ]),
  Object.freeze([
    { pairNS: 1, pairEW: 5, direction: "N", contract: "2 S", result: "+1" },
    { pairNS: 2, pairEW: 6, direction: "N", contract: "4 S", result: "=" },
    { pairNS: 3, pairEW: 7, direction: "N", contract: "4 S", result: "=" },
    { pairNS: 4, pairEW: 8, direction: "N", contract: "3 S", result: "+1" },
  ]),
  Object.freeze([
    { pairNS: 1, pairEW: 5, direction: "N", contract: "3 H X", result: "-2" },
    { pairNS: 2, pairEW: 6, direction: "N", contract: "2 S", result: "=" },
    { pairNS: 3, pairEW: 7, direction: "N", contract: "2 S", result: "+1" },
    { pairNS: 4, pairEW: 8, direction: "N", contract: "2 S", result: "=" },
  ]),
]);

const APP_PBN_TEXT = BOARD_RESULTS.map((_, index) => {
  const boardNo = index + 1;
  const dealers = ["N", "E", "S"];
  const vulnerabilities = ["None", "NS", "EW"];
  return [
    '[Event "Synthetic browser fixture"]',
    '[Site "Local test"]',
    '[Date "2026.07.13"]',
    `[Board "${boardNo}"]`,
    `[Dealer "${dealers[index]}"]`,
    `[Vulnerable "${vulnerabilities[index]}"]`,
    `[Deal "${DEAL}"]`,
    '[OptimumScore "NS 420"]',
    '[ParContract "NS 4S"]',
    '[OptimumResultTable "Declarer;Denomination\\2R;Result\\2R"]',
    ...DOUBLE_DUMMY_ROWS,
  ].join("\n");
}).join("\n\n");

const receivedRows = BOARD_RESULTS.flatMap((rows, boardIndex) => rows.map((row, tableIndex) =>
  buildReceivedRow({
    id: boardIndex * rows.length + tableIndex + 1,
    section: 1,
    table: tableIndex + 1,
    round: boardIndex + 1,
    board: boardIndex + 1,
    pairNS: row.pairNS,
    pairEW: row.pairEW,
    declarer: row.pairNS,
    nsEw: row.direction,
    contract: row.contract,
    result: row.result,
    leadCard: tableIndex % 2 ? "S2" : "H3",
    remarks: "",
  })
));

const APP_BWS_BYTES = buildBwsFile({ pages: [receivedRows] });
const APP_EXPECTED_PAIR_COUNT = 8;

function appPbnInput() {
  return {
    name: "synthetic-session.pbn",
    mimeType: "text/plain",
    buffer: Buffer.from(APP_PBN_TEXT, "utf8"),
  };
}

function appBwsInput() {
  return {
    name: "synthetic-session.BWS",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(APP_BWS_BYTES),
  };
}

export {
  APP_BWS_BYTES,
  APP_EXPECTED_PAIR_COUNT,
  APP_PBN_TEXT,
  appBwsInput,
  appPbnInput,
};
