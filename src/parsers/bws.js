import { safeNumber } from "../core/format.js";
import { normalizePlayedContractText } from "../core/contracts.js";
import { parseResultsCsv } from "./csv.js";

  const SEATS = ["N", "E", "S", "W"];
  const JET3_ROW_OFFSET_MASK = 0x1fff;
  const JET3_ROW_DELETED_FLAG = 0x4000;
  const JET_VERSION_JET3 = 0x00;
  const JET_VERSION_MAX_KNOWN = 0x06;
  const JET3_PAGE_SIZE = 2048;
  const JET4_PAGE_SIZE = 4096;
  const CP1252_C1 = [
    0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
    0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
    0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178
  ];







  function parseBwsBuffer(buffer, fileName) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const signature = decodeAscii(bytes.subarray(4, 68)).trim();
    const recognizedJet = /Jet DB|Standard Jet/i.test(signature);
    const jetVersion = bytes.length > 0x14 ? bytes[0x14] : null;
    const warnings = [];
    let candidates;

    if (jetVersion === JET_VERSION_JET3) {
      candidates = [makeBwsScanCandidate(bytes, JET3_PAGE_SIZE)];
    } else if (jetVersion != null && jetVersion >= 0x01 && jetVersion <= JET_VERSION_MAX_KNOWN) {
      warnings.push("Access 2000+ (Jet4) .BWS files are not supported. Export the Bridgemate results as an Access 97 (Jet3) .bws file, or import a CSV export instead.");
      candidates = [makeEmptyScanCandidate(bytes, JET4_PAGE_SIZE)];
    } else {
      warnings.push("The file's Jet database version byte was not recognized; a heuristic BWS scan was attempted.");
      candidates = [JET3_PAGE_SIZE, JET4_PAGE_SIZE].map((pageSize) => makeBwsScanCandidate(bytes, pageSize));
    }
    const best = candidates.slice().sort((a, b) => b.receivedData.length - a.receivedData.length)[0];

    if (!recognizedJet) {
      warnings.push("The file does not advertise itself as a Microsoft Jet database, but a BWS scan was attempted.");
    }
    if (!best.receivedData.length) {
      warnings.push("No Bridgemate ReceivedData rows were found in the BWS file.");
    }

    const seen = new Set();
    const receivedData = best.receivedData
      .filter((row) => {
        const key = row.ID ? `id:${row.ID}` : `${row._page}:${row._row}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => safeNumber(a.ID) - safeNumber(b.ID));
    const pageProfile = profileBwsPages(bytes, best.pageSize);
    if (pageProfile.allFfPageCount) {
      warnings.push(`${pageProfile.allFfPageCount} database pages are filled with 0xFF bytes; result or player tables may be missing, erased, or unreadable.`);
    }
    const erasedRows = receivedData.reduce((count, row) => count + (row.Erased ? 1 : 0), 0);
    const deletedRowSlots = (best.diagnostics.received.rejections.deleted_row || 0);
    const diagnostics = {
      sourceType: "BWS",
      fileSize: bytes.length,
      signature,
      recognizedJet,
      jetVersion,
      selectedPageSize: best.pageSize,
      acceptedReceivedRows: receivedData.length,
      duplicateReceivedRows: Math.max(0, best.receivedData.length - receivedData.length),
      acceptedPlayerRows: best.playerNumbers.length,
      erasedRows,
      deletedRowSlots,
      pageProfile,
      candidates: candidates.map((candidate) => candidate.diagnostics)
    };

    return {
      fileName: fileName || "results.BWS",
      sourceType: "BWS",
      receivedData,
      playerNumbers: best.playerNumbers,
      metadata: {
        signature,
        pageSize: best.pageSize,
        diagnostics
      },
      warnings
    };
  }

  function makeBwsScanCandidate(bytes, pageSize) {
    const receivedStats = makeBwsScanStats(bytes, pageSize, "ReceivedData");
    const playerStats = makeBwsScanStats(bytes, pageSize, "PlayerNumbers");
    const receivedData = scanBwsReceivedRows(bytes, pageSize, receivedStats);
    const playerNumbers = scanBwsPlayerNumberRows(bytes, pageSize, playerStats);
    receivedStats.acceptedRows = receivedData.length;
    playerStats.acceptedRows = playerNumbers.length;
    return {
      pageSize,
      receivedData,
      playerNumbers,
      diagnostics: {
        pageSize,
        received: receivedStats,
        players: playerStats
      }
    };
  }

  function makeEmptyScanCandidate(bytes, pageSize) {
    return {
      pageSize,
      receivedData: [],
      playerNumbers: [],
      diagnostics: {
        pageSize,
        received: makeBwsScanStats(bytes, pageSize, "ReceivedData"),
        players: makeBwsScanStats(bytes, pageSize, "PlayerNumbers")
      }
    };
  }

  function profileBwsPages(bytes, pageSize) {
    const filePages = Math.floor(bytes.length / pageSize);
    const pageTypes = {};
    const ffPages = [];
    const allFfPages = [];

    for (let pageNo = 0; pageNo < filePages; pageNo += 1) {
      const pageStart = pageNo * pageSize;
      const firstByte = bytes[pageStart];
      const key = `0x${firstByte.toString(16).padStart(2, "0")}`;
      pageTypes[key] = (pageTypes[key] || 0) + 1;
      if (firstByte === 0xff) ffPages.push(pageNo);

      let allFf = firstByte === 0xff;
      for (let index = pageStart + 1; allFf && index < pageStart + pageSize; index += 1) {
        if (bytes[index] !== 0xff) allFf = false;
      }
      if (allFf) allFfPages.push(pageNo);
    }

    return {
      pageSize,
      filePages,
      trailingBytes: bytes.length % pageSize,
      pageTypes,
      ffPageCount: ffPages.length,
      ffRuns: summarizeNumberRuns(ffPages),
      allFfPageCount: allFfPages.length,
      allFfRuns: summarizeNumberRuns(allFfPages)
    };
  }

  function summarizeNumberRuns(values) {
    if (!values.length) return [];
    const runs = [];
    let start = values[0];
    let previous = values[0];
    for (let index = 1; index < values.length; index += 1) {
      const value = values[index];
      if (value === previous + 1) {
        previous = value;
        continue;
      }
      runs.push(start === previous ? String(start) : `${start}-${previous}`);
      start = value;
      previous = value;
    }
    runs.push(start === previous ? String(start) : `${start}-${previous}`);
    return runs;
  }

  function makeBwsScanStats(bytes, pageSize, tableName) {
    return {
      tableName,
      pageSize,
      filePages: Math.floor(bytes.length / pageSize),
      trailingBytes: bytes.length % pageSize,
      dataPages: 0,
      rowDirectories: 0,
      rowSlots: 0,
      rowSlices: 0,
      acceptedRows: 0,
      rejectedRows: 0,
      rejections: {}
    };
  }

  function addScanRejection(stats, reason) {
    if (!stats) return;
    stats.rejectedRows += 1;
    stats.rejections[reason] = (stats.rejections[reason] || 0) + 1;
  }

  function scanBwsTableRows(bytes, pageSize, stats, parseRowDetailed) {
    const rows = [];
    for (let pageStart = 0, pageNo = 0; pageStart + pageSize <= bytes.length; pageStart += pageSize, pageNo += 1) {
      if (bytes[pageStart] !== 0x01) continue;
      if (stats) stats.dataPages += 1;
      const rowCount = readUInt16LE(bytes, pageStart + 8);
      if (!rowCount || 10 + rowCount * 2 >= pageSize) {
        addScanRejection(stats, "invalid_row_directory");
        continue;
      }
      if (stats) {
        stats.rowDirectories += 1;
        stats.rowSlots += rowCount;
      }
      const rawOffsets = [];
      for (let index = 0; index < rowCount; index += 1) {
        rawOffsets.push(readUInt16LE(bytes, pageStart + 10 + index * 2));
      }

      rawOffsets.forEach((rawOffset, index) => {
        // Jet3 row-directory entries carry flag bits above the offset:
        // 0x8000 marks an index lookup row (still read, as mdbtools does)
        // and 0x4000 marks a deleted row (skipped, as mdbtools does).
        const offset = rawOffset & JET3_ROW_OFFSET_MASK;
        const end = index === 0 ? pageSize : rawOffsets[index - 1] & JET3_ROW_OFFSET_MASK;
        if (offset >= pageSize || end <= offset || end > pageSize) {
          addScanRejection(stats, "invalid_row_bounds");
          return;
        }
        if (rawOffset & JET3_ROW_DELETED_FLAG) {
          addScanRejection(stats, "deleted_row");
          return;
        }
        const row = bytes.subarray(pageStart + offset, pageStart + end);
        if (stats) stats.rowSlices += 1;
        const parsed = parseRowDetailed(row, pageNo, index, offset);
        if (parsed.row) rows.push(parsed.row);
        else addScanRejection(stats, parsed.reason);
      });
    }
    return rows;
  }

  function scanBwsPlayerNumberRows(bytes, pageSize, stats) {
    const rows = scanBwsTableRows(bytes, pageSize, stats, parseBwsPlayerNumberRowDetailed);
    return rows.sort((a, b) => a.Table - b.Table || SEATS.indexOf(a.Direction) - SEATS.indexOf(b.Direction));
  }

  function scanBwsReceivedRows(bytes, pageSize, stats) {
    return scanBwsTableRows(bytes, pageSize, stats, parseBwsReceivedRowDetailed);
  }

  // Cracks one Jet3 (Access 97) data row: first byte is the column count,
  // the tail holds (in order) the variable-column offset bytes, an optional
  // jump table for rows longer than 255 bytes, the variable-column count
  // byte, and the null bitmask. Mirrors mdbtools' mdb_crack_row3().
  // Returns { offsets, nullMask } or null when the trailer is inconsistent.
  function crackJet3Row(row, columnCount, varColumnCount, fixedEnd) {
    if (!row.length || row[0] !== columnCount) return null;
    const bitmaskSize = (columnCount + 7) >> 3;
    if (row.length < fixedEnd + varColumnCount + 2 + bitmaskSize) return null;
    const varCountPos = row.length - bitmaskSize - 1;
    if (row[varCountPos] !== varColumnCount) return null;

    let numJumps = Math.floor((row.length - 1) / 256);
    const colPtr = varCountPos - numJumps - 1;
    if (colPtr < varColumnCount) return null;
    if (Math.floor((colPtr - varColumnCount) / 256) < numJumps) numJumps -= 1;

    const offsets = [];
    let jumpsUsed = 0;
    for (let index = 0; index <= varColumnCount; index += 1) {
      while (jumpsUsed < numJumps && row[varCountPos - jumpsUsed - 1] === index) jumpsUsed += 1;
      offsets.push(row[colPtr - index] + jumpsUsed * 256);
    }

    if (offsets[0] !== fixedEnd) return null;
    for (let index = 1; index <= varColumnCount; index += 1) {
      if (offsets[index] < offsets[index - 1]) return null;
    }
    if (offsets[varColumnCount] !== colPtr - varColumnCount) return null;

    return {
      offsets,
      nullMask: row.subarray(row.length - bitmaskSize)
    };
  }

  // Jet3 null-mask bit for a column: 1 = value present (or boolean true),
  // 0 = null (or boolean false). Boolean columns occupy no row bytes; the
  // mask bit IS their value.
  function jet3ColumnBit(cracked, columnIndex) {
    return (cracked.nullMask[columnIndex >> 3] >> (columnIndex & 7)) & 1;
  }

  function jet3VarColumnText(row, cracked, varIndex, columnIndex) {
    if (!jet3ColumnBit(cracked, columnIndex)) return "";
    return decodeCp1252(row.subarray(cracked.offsets[varIndex], cracked.offsets[varIndex + 1])).trim();
  }

  function parseBwsPlayerNumberRow(row, pageNo, rowIndex, offset) {
    return parseBwsPlayerNumberRowDetailed(row, pageNo, rowIndex, offset).row || null;
  }

  // PlayerNumbers columns (Jet3 column order):
  // 0 Section i16, 1 Table i16, 2 Direction text, 3 Number text, 4 Name text,
  // 5 Round i16, 6 Updated bool, 7 Processed bool, 8 TimeLog datetime.
  // Placeholder rows predate the TimeLog column and carry 8 columns (0x08);
  // named rows carry all 9 (0x09). Fixed data: Section@1 Table@3 Round@5
  // and, for 9-column rows, TimeLog@7.
  function parseBwsPlayerNumberRowDetailed(row, pageNo, rowIndex, offset) {
    if (!row.length || (row[0] !== 0x08 && row[0] !== 0x09)) return { reason: "wrong_row_type_or_short" };
    const named = row[0] === 0x09;
    const cracked = crackJet3Row(row, named ? 9 : 8, 3, named ? 15 : 7);
    if (!cracked) return { reason: named ? "invalid_named_row_structure" : "invalid_placeholder_row_structure" };

    const section = readInt16LE(row, 1);
    const tableNo = readInt16LE(row, 3);
    const round = readInt16LE(row, 5);
    if (section < 1 || section > 50 || tableNo < 1 || tableNo > 200 || round < 0 || round > 200) return { reason: "invalid_section_table_round" };
    const direction = jet3VarColumnText(row, cracked, 0, 2);
    if (!SEATS.includes(direction)) return { reason: "invalid_direction" };

    if (!named) {
      return {
        row: {
          Section: section,
          Table: tableNo,
          Direction: direction,
          Number: "",
          Name: "",
          Round: round,
          _page: pageNo,
          _row: rowIndex,
          _offset: offset
        }
      };
    }

    let timeLog = "";
    if (jet3ColumnBit(cracked, 8)) {
      const dateSerial = readDoubleLE(row, 7);
      if (!Number.isFinite(dateSerial) || dateSerial < 20000 || dateSerial > 80000) return { reason: "invalid_datetime_serial" };
      timeLog = formatAccessDate(dateSerial, "datetime");
    }
    return {
      row: {
        Section: section,
        Table: tableNo,
        Direction: direction,
        Number: jet3VarColumnText(row, cracked, 1, 3),
        Name: jet3VarColumnText(row, cracked, 2, 4),
        Round: round,
        TimeLog: timeLog,
        _page: pageNo,
        _row: rowIndex,
        _offset: offset
      }
    };
  }

  function parseBwsReceivedRow(row, pageNo, rowIndex, offset) {
    return parseBwsReceivedRowDetailed(row, pageNo, rowIndex, offset).row || null;
  }

  // ReceivedData columns (Jet3 column order):
  // 0 ID i32, 1 Section i16, 2 Table i16, 3 Round i16, 4 Board i16,
  // 5 PairNS i16, 6 PairEW i16, 7 Declarer i16, 8 NS/EW text, 9 Contract
  // text, 10 Result text, 11 LeadCard text, 12 Remarks text, 13 DateLog
  // datetime, 14 TimeLog datetime, 15-21 booleans (Processed..Processed4,
  // Erased, ExternalUpdate), 22 SuspiciousContract i16. Fixed data: ID@1,
  // int16s@5..17, DateLog@19, TimeLog@27, SuspiciousContract@35; the five
  // text columns follow at offset 37.
  function parseBwsReceivedRowDetailed(row, pageNo, rowIndex, offset) {
    if (!row.length || row[0] !== 0x17) return { reason: "wrong_row_type_or_short" };
    const cracked = crackJet3Row(row, 23, 5, 37);
    if (!cracked) return { reason: "invalid_row_structure" };

    const id = readUInt32LE(row, 1);
    const section = readInt16LE(row, 5);
    const tableNo = readInt16LE(row, 7);
    const round = readInt16LE(row, 9);
    const board = readInt16LE(row, 11);
    const pairNS = readInt16LE(row, 13);
    const pairEW = readInt16LE(row, 15);
    const declarer = readInt16LE(row, 17);

    if (!id || id > 100000 || section < 1 || section > 200 || tableNo < 1 || tableNo > 200) return { reason: "invalid_id_section_table" };
    if (round < 1 || round > 200 || board < 1 || board > 512) return { reason: "invalid_round_board" };

    let dateLog = "";
    if (jet3ColumnBit(cracked, 13)) {
      const dateSerial = readDoubleLE(row, 19);
      if (!Number.isFinite(dateSerial) || dateSerial < 20000 || dateSerial > 80000) return { reason: "invalid_date_serial" };
      dateLog = formatAccessDate(dateSerial, "date");
    }
    let timeLog = "";
    if (jet3ColumnBit(cracked, 14)) {
      const timeSerial = readDoubleLE(row, 27);
      if (!Number.isFinite(timeSerial) || timeSerial < 0 || timeSerial > 1.2) return { reason: "invalid_time_serial" };
      timeLog = formatAccessDate(timeSerial, "time");
    }

    return {
      row: {
        ID: id,
        Section: section,
        Table: tableNo,
        Round: round,
        Board: board,
        PairNS: pairNS,
        PairEW: pairEW,
        Declarer: declarer,
        "NS/EW": jet3VarColumnText(row, cracked, 0, 8),
        Contract: normalizePlayedContractText(jet3VarColumnText(row, cracked, 1, 9)),
        Result: jet3VarColumnText(row, cracked, 2, 10),
        LeadCard: jet3VarColumnText(row, cracked, 3, 11),
        Remarks: jet3VarColumnText(row, cracked, 4, 12),
        DateLog: dateLog,
        TimeLog: timeLog,
        Erased: jet3ColumnBit(cracked, 20),
        _page: pageNo,
        _row: rowIndex,
        _offset: offset
      }
    };
  }

  function decodeCp1252(bytes) {
    let text = "";
    bytes.forEach((byte) => {
      if (byte >= 32 && byte < 127) text += String.fromCharCode(byte);
      else if (byte >= 0x80 && byte <= 0x9f) text += String.fromCharCode(CP1252_C1[byte - 0x80]);
      else if (byte >= 0xa0) text += String.fromCharCode(byte);
    });
    return text;
  }

  function decodeAscii(bytes) {
    let text = "";
    bytes.forEach((byte) => {
      if (byte >= 32 && byte < 127) text += String.fromCharCode(byte);
    });
    return text;
  }

  function readUInt16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readInt16LE(bytes, offset) {
    const value = readUInt16LE(bytes, offset);
    return value & 0x8000 ? value - 0x10000 : value;
  }

  function readUInt32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function readDoubleLE(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true);
  }

  function formatAccessDate(serial, kind) {
    if (!Number.isFinite(serial)) return "";
    // Access rounds the day fraction to the nearest second (mdbtools does
    // the same), so round total seconds rather than truncating.
    const totalSeconds = Math.round(serial * 86400);
    const days = Math.floor(totalSeconds / 86400);
    const daySeconds = totalSeconds - days * 86400;
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + days * 86400000);
    const hours = Math.floor(daySeconds / 3600);
    const minutes = Math.floor(daySeconds / 60) % 60;
    const seconds = daySeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    if (kind === "datetime") {
      return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${pad(date.getUTCFullYear() % 100)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    if (kind === "time") {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${pad(date.getUTCFullYear() % 100)}`;
  }

export {
  parseBwsBuffer,
  parseResultsCsv,
  parseBwsPlayerNumberRow,
  parseBwsPlayerNumberRowDetailed,
  parseBwsReceivedRow,
  parseBwsReceivedRowDetailed
};
