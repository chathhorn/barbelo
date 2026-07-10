// Results-file CSV parsing: header mapping and RFC-ish quoting, shared
// by direct .csv uploads.
import { pickField } from "../core/format.js";

function normalizeText(text) {
  return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function parseCsvRows(text) {
  const source = normalizeText(text);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses a results CSV export into the same raw shape as the BWS parser.
 *
 * @param {string} text Decoded CSV text.
 * @param {string} [fileName]
 * @param {number} [fileSize] Original byte size, for diagnostics.
 * @returns {import("../core/types.js").RawResults}
 */
function parseResultsCsv(text, fileName, fileSize) {
  const rows = parseCsvRows(text);
  const warnings = [];
  if (!rows.length) {
    return {
      fileName: fileName || "results.csv",
      sourceType: "CSV",
      receivedData: [],
      playerNumbers: [],
      metadata: {
        diagnostics: {
          sourceType: "CSV",
          fileSize: fileSize == null ? text.length : fileSize,
          csvRows: 0,
          dataRows: 0,
          recognizedRows: 0,
          headers: []
        }
      },
      warnings: ["No CSV rows were found."]
    };
  }

  const headers = rows[0].map((header) => String(header || "").replace(/^\uFEFF/, "").trim());
  const receivedData = rows.slice(1)
    .filter((row) => row.some((field) => String(field || "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] == null ? "" : row[index]])))
    .filter((row) => pickField(row, ["Board", "board", "Board Number", "board_number"]) || pickField(row, ["Contract", "contract"]));

  if (!receivedData.length) warnings.push("The CSV did not contain recognizable result rows.");
  return {
    fileName: fileName || "results.csv",
    sourceType: "CSV",
    receivedData,
    playerNumbers: [],
    metadata: {
      diagnostics: {
        sourceType: "CSV",
        fileSize: fileSize == null ? text.length : fileSize,
        csvRows: rows.length,
        dataRows: Math.max(0, rows.length - 1),
        recognizedRows: receivedData.length,
        headers
      }
    },
    warnings
  };
}

export { parseResultsCsv, parseCsvRows };
