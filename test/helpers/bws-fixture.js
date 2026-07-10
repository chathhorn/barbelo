"use strict";

// Builds minimal in-memory Bridgemate .BWS (Microsoft Jet3 / Access 97 MDB)
// byte buffers for parser tests: a database definition page followed by
// Jet3 data pages with real row directories, fixed columns, variable-column
// trailers (including the >255-byte jump-table scheme), and null bitmasks.
// The row packer mirrors mdbtools' mdb_pack_row3().

const PAGE_SIZE = 2048;
const RECEIVED_COLUMNS = 23;
const RECEIVED_VAR_COLUMNS = 5;
const PLAYER_COLUMNS_NAMED = 9;
const PLAYER_COLUMNS_PLACEHOLDER = 8;
const PLAYER_VAR_COLUMNS = 3;
const DELETED_FLAG = 0x4000;
const LOOKUP_FLAG = 0x8000;

const CP1252_REVERSE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

function encodeCp1252(text) {
  const bytes = [];
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (CP1252_REVERSE.has(code)) bytes.push(CP1252_REVERSE.get(code));
    else bytes.push(0x3f); // "?"
  }
  return Uint8Array.from(bytes);
}

function writeUInt16LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeUInt32LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function writeDoubleLE(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 8).setFloat64(0, value, true);
}

// Faithful port of mdbtools' mdb_pack_row3(). `varValues` entries are
// Uint8Array data or null for SQL NULL; `nullBits` holds one bit per column
// (1 = present / boolean true, 0 = null / boolean false).
function packJet3Row(columnCount, fixedBytes, varValues, nullBits) {
  const buf = new Uint8Array(4096);
  let pos = 0;
  buf[pos++] = columnCount;
  buf.set(fixedBytes, pos);
  pos += fixedBytes.length;

  const varCols = varValues.length;
  const offsets = [];
  for (const value of varValues) {
    offsets.push(pos);
    if (value != null) {
      buf.set(value, pos);
      pos += value.length;
    }
  }

  const offsetHigh = [pos >> 8];
  buf[pos] = pos & 0xff; // end-of-data marker
  pos += 1;
  for (let i = varCols - 1; i >= 0; i -= 1) {
    buf[pos++] = offsets[i] & 0xff;
    offsetHigh.push(offsets[i] >> 8);
  }
  const bitmaskSize = Math.floor((columnCount + 7) / 8);
  if (offsetHigh[0] < Math.floor((pos + bitmaskSize - 1) / 255)) {
    buf[pos++] = 0xff; // dummy jump-table entry
  }
  for (let i = 0; i < varCols; i += 1) {
    if (offsetHigh[i] > offsetHigh[i + 1]) buf[pos++] = varCols - i;
  }
  buf[pos++] = varCols;

  let bit = 0;
  let byte = 0;
  for (let i = 0; i < columnCount; i += 1) {
    if (nullBits[i]) byte |= 1 << bit;
    bit += 1;
    if (bit === 8) {
      buf[pos++] = byte;
      bit = 0;
      byte = 0;
    }
  }
  if (bit) buf[pos++] = byte;

  return buf.slice(0, pos);
}

function textVar(value) {
  return value == null ? null : encodeCp1252(value);
}

// ReceivedData row (23 columns). Text fields may be strings or null (SQL
// NULL). `dateSerial`/`timeSerial` are Access date serials; boolean fields
// default to 0.
function buildReceivedRow(fields) {
  const fixed = new Uint8Array(36);
  writeUInt32LE(fixed, 0, fields.id);
  writeUInt16LE(fixed, 4, fields.section);
  writeUInt16LE(fixed, 6, fields.table);
  writeUInt16LE(fixed, 8, fields.round);
  writeUInt16LE(fixed, 10, fields.board);
  writeUInt16LE(fixed, 12, fields.pairNS);
  writeUInt16LE(fixed, 14, fields.pairEW);
  writeUInt16LE(fixed, 16, fields.declarer);
  if (fields.dateSerial != null) writeDoubleLE(fixed, 18, fields.dateSerial);
  if (fields.timeSerial != null) writeDoubleLE(fixed, 26, fields.timeSerial);
  writeUInt16LE(fixed, 34, fields.suspiciousContract || 0);

  const varValues = [
    textVar(fields.nsEw),
    textVar(fields.contract),
    textVar(fields.result),
    textVar(fields.leadCard),
    textVar(fields.remarks)
  ];
  const nullBits = [
    1, 1, 1, 1, 1, 1, 1, 1,
    fields.nsEw != null ? 1 : 0,
    fields.contract != null ? 1 : 0,
    fields.result != null ? 1 : 0,
    fields.leadCard != null ? 1 : 0,
    fields.remarks != null ? 1 : 0,
    fields.dateSerial != null ? 1 : 0,
    fields.timeSerial != null ? 1 : 0,
    fields.processed ? 1 : 0,
    fields.processed1 ? 1 : 0,
    fields.processed2 ? 1 : 0,
    fields.processed3 ? 1 : 0,
    fields.processed4 ? 1 : 0,
    fields.erased ? 1 : 0,
    fields.externalUpdate ? 1 : 0,
    1
  ];
  return packJet3Row(RECEIVED_COLUMNS, fixed, varValues, nullBits);
}

// PlayerNumbers row. Named rows (0x09) carry all nine columns including
// TimeLog; placeholder rows (0x08, `placeholder: true`) predate the TimeLog
// column and carry eight.
function buildPlayerRow(fields) {
  if (fields.placeholder) {
    const fixed = new Uint8Array(6);
    writeUInt16LE(fixed, 0, fields.section);
    writeUInt16LE(fixed, 2, fields.table);
    writeUInt16LE(fixed, 4, fields.round || 0);
    const varValues = [textVar(fields.direction), textVar(fields.number), textVar(fields.name)];
    const nullBits = [
      1, 1,
      fields.direction != null ? 1 : 0,
      fields.number != null ? 1 : 0,
      fields.name != null ? 1 : 0,
      1,
      fields.updated ? 1 : 0,
      fields.processed ? 1 : 0
    ];
    return packJet3Row(PLAYER_COLUMNS_PLACEHOLDER, fixed, varValues, nullBits);
  }

  const fixed = new Uint8Array(14);
  writeUInt16LE(fixed, 0, fields.section);
  writeUInt16LE(fixed, 2, fields.table);
  writeUInt16LE(fixed, 4, fields.round || 0);
  if (fields.timeSerial != null) writeDoubleLE(fixed, 6, fields.timeSerial);
  const varValues = [textVar(fields.direction), textVar(fields.number), textVar(fields.name)];
  const nullBits = [
    1, 1,
    fields.direction != null ? 1 : 0,
    fields.number != null ? 1 : 0,
    fields.name != null ? 1 : 0,
    1,
    fields.updated ? 1 : 0,
    fields.processed ? 1 : 0,
    fields.timeSerial != null ? 1 : 0
  ];
  return packJet3Row(PLAYER_COLUMNS_NAMED, fixed, varValues, nullBits);
}

// One Jet3 data page: 0x0101 marker, row count at +8, row-directory entries
// (offset | flags) from +10, row data packed downward from the page end.
// `rows` entries are Uint8Array row images or { bytes, flags }.
function buildDataPage(rows) {
  const page = new Uint8Array(PAGE_SIZE);
  page[0] = 0x01;
  page[1] = 0x01;
  writeUInt16LE(page, 8, rows.length);
  let cursor = PAGE_SIZE;
  rows.forEach((row, index) => {
    const bytes = row instanceof Uint8Array ? row : row.bytes;
    const flags = row instanceof Uint8Array ? 0 : row.flags || 0;
    cursor -= bytes.length;
    page.set(bytes, cursor);
    writeUInt16LE(page, 10 + index * 2, cursor | flags);
  });
  writeUInt16LE(page, 2, cursor - (10 + rows.length * 2)); // free space
  return page;
}

function buildHeaderPage(jetVersion) {
  const page = new Uint8Array(PAGE_SIZE);
  page[0] = 0x00;
  page[1] = 0x01;
  const signature = encodeCp1252("Standard Jet DB");
  page.set(signature, 4);
  page[0x14] = jetVersion == null ? 0x00 : jetVersion;
  return page;
}

// Assembles a whole BWS byte buffer: header page + one data page per
// `pages` entry (each an array accepted by buildDataPage).
function buildBwsFile(options) {
  const pages = (options && options.pages) || [];
  const parts = [buildHeaderPage(options && options.jetVersion)];
  for (const rows of pages) parts.push(buildDataPage(rows));
  const file = new Uint8Array(parts.length * PAGE_SIZE);
  parts.forEach((page, index) => file.set(page, index * PAGE_SIZE));
  return file;
}

module.exports = {
  PAGE_SIZE,
  DELETED_FLAG,
  LOOKUP_FLAG,
  encodeCp1252,
  packJet3Row,
  buildReceivedRow,
  buildPlayerRow,
  buildDataPage,
  buildHeaderPage,
  buildBwsFile
};
