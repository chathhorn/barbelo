(function (root) {
  "use strict";

  const SEATS = ["N", "E", "S", "W"];

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeText(text) {
    return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  }

  function pickField(row, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== "") return row[key];
    }
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

  function parseBwsBuffer(buffer, fileName) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const signature = decodeAscii(bytes.subarray(4, 68)).trim();
    const candidates = [2048, 4096].map((pageSize) => {
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
    });
    const best = candidates.sort((a, b) => b.receivedData.length - a.receivedData.length)[0];
    const warnings = [];
    const recognizedJet = /Jet DB|Standard Jet/i.test(signature);

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
    const diagnostics = {
      sourceType: "BWS",
      fileSize: bytes.length,
      signature,
      recognizedJet,
      selectedPageSize: best.pageSize,
      acceptedReceivedRows: receivedData.length,
      duplicateReceivedRows: Math.max(0, best.receivedData.length - receivedData.length),
      acceptedPlayerRows: best.playerNumbers.length,
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

  function scanBwsPlayerNumberRows(bytes, pageSize, stats) {
    const rows = [];
    const pageMask = pageSize - 1;
    for (let pageStart = 0, pageNo = 0; pageStart + pageSize <= bytes.length; pageStart += pageSize, pageNo += 1) {
      if (bytes[pageStart] !== 0x01) continue;
      if (stats) stats.dataPages += 1;
      const rowCount = bytes[pageStart + 8];
      if (!rowCount || rowCount > 120 || 10 + rowCount * 2 >= pageSize) {
        addScanRejection(stats, "invalid_row_directory");
        continue;
      }
      if (stats) {
        stats.rowDirectories += 1;
        stats.rowSlots += rowCount;
      }
      const offsets = [];
      let plausible = true;
      for (let index = 0; index < rowCount; index += 1) {
        const offset = readUInt16LE(bytes, pageStart + 10 + index * 2) & pageMask;
        if (offset >= pageSize) {
          plausible = false;
          break;
        }
        offsets.push(offset);
      }
      if (!plausible) {
        addScanRejection(stats, "invalid_row_offset");
        continue;
      }

      offsets.forEach((offset, index) => {
        const end = index === 0 ? pageSize : offsets[index - 1];
        if (end <= offset || end > pageSize) {
          addScanRejection(stats, "invalid_row_bounds");
          return;
        }
        const row = bytes.subarray(pageStart + offset, pageStart + end);
        if (stats) stats.rowSlices += 1;
        const parsed = parseBwsPlayerNumberRowDetailed(row, pageNo, index, offset);
        if (parsed.row) rows.push(parsed.row);
        else addScanRejection(stats, parsed.reason);
      });
    }
    return rows.sort((a, b) => a.Table - b.Table || SEATS.indexOf(a.Direction) - SEATS.indexOf(b.Direction));
  }

  function scanBwsReceivedRows(bytes, pageSize, stats) {
    const rows = [];
    const pageMask = pageSize - 1;
    for (let pageStart = 0, pageNo = 0; pageStart + pageSize <= bytes.length; pageStart += pageSize, pageNo += 1) {
      if (bytes[pageStart] !== 0x01) continue;
      if (stats) stats.dataPages += 1;
      const rowCount = bytes[pageStart + 8];
      if (!rowCount || rowCount > 120 || 10 + rowCount * 2 >= pageSize) {
        addScanRejection(stats, "invalid_row_directory");
        continue;
      }
      if (stats) {
        stats.rowDirectories += 1;
        stats.rowSlots += rowCount;
      }
      const offsets = [];
      let plausible = true;
      for (let index = 0; index < rowCount; index += 1) {
        const rawOffset = readUInt16LE(bytes, pageStart + 10 + index * 2);
        const offset = rawOffset & pageMask;
        if (offset >= pageSize) {
          plausible = false;
          break;
        }
        offsets.push(offset);
      }
      if (!plausible) {
        addScanRejection(stats, "invalid_row_offset");
        continue;
      }

      offsets.forEach((offset, index) => {
        const end = index === 0 ? pageSize : offsets[index - 1];
        if (end <= offset || end > pageSize) {
          addScanRejection(stats, "invalid_row_bounds");
          return;
        }
        const row = bytes.subarray(pageStart + offset, pageStart + end);
        if (stats) stats.rowSlices += 1;
        const parsed = parseBwsReceivedRowDetailed(row, pageNo, index, offset);
        if (parsed.row) rows.push(parsed.row);
        else addScanRejection(stats, parsed.reason);
      });
    }
    return rows;
  }

  function parseBwsPlayerNumberRow(row, pageNo, rowIndex, offset) {
    return parseBwsPlayerNumberRowDetailed(row, pageNo, rowIndex, offset).row || null;
  }

  function parseBwsPlayerNumberRowDetailed(row, pageNo, rowIndex, offset) {
    if (row.length < 14 || (row[0] !== 0x08 && row[0] !== 0x09)) return { reason: "wrong_row_type_or_short" };
    const section = readInt16LE(row, 1);
    const tableNo = readInt16LE(row, 3);
    const round = readInt16LE(row, 5);
    if (section < 1 || section > 50 || tableNo < 1 || tableNo > 200 || round < 0 || round > 200) return { reason: "invalid_section_table_round" };

    if (row[0] === 0x08) {
      const direction = String.fromCharCode(row[7] || 0);
      if (!SEATS.includes(direction)) return { reason: "invalid_direction" };
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

    if (row.length < 23) return { reason: "named_row_too_short" };
    const dateSerial = readDoubleLE(row, 7);
    if (!Number.isFinite(dateSerial) || dateSerial < 20000 || dateSerial > 80000) return { reason: "invalid_datetime_serial" };
    const rawText = decodePrintableAscii(row.subarray(15, Math.max(15, row.length - 6))).trim();
    const text = rawText.replace(/[^A-Za-z0-9 ]+$/g, "").trim();
    const match = text.match(/^([NESW])(\d*)(.*)$/);
    if (!match) return { reason: "player_text_miss" };
    return {
      row: {
        Section: section,
        Table: tableNo,
        Direction: match[1],
        Number: match[2] || "",
        Name: (match[3] || "").trim(),
        Round: round,
        TimeLog: formatAccessDate(dateSerial, "datetime"),
        _page: pageNo,
        _row: rowIndex,
        _offset: offset
      }
    };
  }

  function parseBwsReceivedRow(row, pageNo, rowIndex, offset) {
    return parseBwsReceivedRowDetailed(row, pageNo, rowIndex, offset).row || null;
  }

  function parseBwsReceivedRowDetailed(row, pageNo, rowIndex, offset) {
    if (row.length < 42 || row[0] !== 0x17) return { reason: "wrong_row_type_or_short" };
    const id = readUInt32LE(row, 1);
    const section = readInt16LE(row, 5);
    const tableNo = readInt16LE(row, 7);
    const round = readInt16LE(row, 9);
    const board = readInt16LE(row, 11);
    const pairNS = readInt16LE(row, 13);
    const pairEW = readInt16LE(row, 15);
    const declarer = readInt16LE(row, 17);
    const dateSerial = readDoubleLE(row, 19);
    const timeSerial = readDoubleLE(row, 27);

    if (!id || id > 100000 || section < 1 || section > 200 || tableNo < 1 || tableNo > 200) return { reason: "invalid_id_section_table" };
    if (round < 1 || round > 200 || board < 1 || board > 512) return { reason: "invalid_round_board" };
    if (!Number.isFinite(dateSerial) || dateSerial < 20000 || dateSerial > 80000) return { reason: "invalid_date_serial" };
    if (!Number.isFinite(timeSerial) || timeSerial < 0 || timeSerial > 1.2) return { reason: "invalid_time_serial" };

    const payload = decodePrintableAscii(row.subarray(37));
    const match = payload.match(/^([NESW])((?:PASS)|(?:[1-7]\s*(?:NT|N|[CDHS])(?:\s*x{1,2})?))\s*(=|[+-]\d+)?/i);
    if (!match) return { reason: "contract_payload_miss" };

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
        "NS/EW": match[1].toUpperCase(),
        Contract: normalizePlayedContractText(match[2]),
        Result: match[3] || "",
        LeadCard: "",
        Remarks: "",
        DateLog: formatAccessDate(dateSerial, "date"),
        TimeLog: formatAccessDate(timeSerial, "time"),
        Erased: 0,
        _page: pageNo,
        _row: rowIndex,
        _offset: offset
      }
    };
  }

  function decodePrintableAscii(bytes) {
    let text = "";
    bytes.forEach((byte) => {
      if (byte >= 32 && byte < 127) text += String.fromCharCode(byte);
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
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + Math.round(serial * 86400000));
    const pad = (value) => String(value).padStart(2, "0");
    if (kind === "datetime") {
      return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${pad(date.getUTCFullYear() % 100)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    }
    if (kind === "time") {
      return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    }
    return `${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${pad(date.getUTCFullYear() % 100)}`;
  }

  root.BarbeloBwsParser = {
    parseBwsBuffer,
    parseResultsCsv,
    parseBwsPlayerNumberRow,
    parseBwsPlayerNumberRowDetailed,
    parseBwsReceivedRow,
    parseBwsReceivedRowDetailed
  };
}(typeof window !== "undefined" ? window : globalThis));
