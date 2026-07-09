(function (root) {
  "use strict";

  const SEATS = ["N", "E", "S", "W"];
  const DOUBLE_DUMMY_SEATS = ["N", "S", "E", "W"];
  const DOUBLE_DUMMY_DENOMS = ["N", "S", "H", "D", "C"];
  const PAIRS = { N: "NS", S: "NS", E: "EW", W: "EW" };
  const SUITS = [
    { key: "S", label: "Spades", short: "S", html: "&spades;", className: "spade" },
    { key: "H", label: "Hearts", short: "H", html: "&hearts;", className: "heart" },
    { key: "D", label: "Diamonds", short: "D", html: "&diams;", className: "diamond" },
    { key: "C", label: "Clubs", short: "C", html: "&clubs;", className: "club" }
  ];
  const RANK_ORDER = "AKQJT98765432";

  function normalizeText(text) {
    return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  }

  function decodePbnValue(value) {
    return String(value || "").replace(/\\(["\\])/g, "$1");
  }

  function decodeDirectiveValue(value) {
    let next = String(value || "").trim();
    if (next.startsWith("\"")) next = next.slice(1);
    if (next.endsWith("\"")) next = next.slice(0, -1);
    return next
      .replace(/\\\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, "\"")
      .trim();
  }

  function parseTagLine(line) {
    const match = line.match(/^\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"\\])*)"\]\s*$/);
    if (!match) return null;
    return {
      key: match[1],
      value: decodePbnValue(match[2])
    };
  }

  function parseDirectiveLine(line, lineNo) {
    const body = line.slice(1).trim();
    if (!body) return null;
    const firstSpace = body.search(/\s/);
    const rawKey = firstSpace === -1 ? body : body.slice(0, firstSpace);
    const rawValue = firstSpace === -1 ? "" : body.slice(firstSpace + 1).trim();
    const key = rawKey.endsWith(":") ? rawKey.slice(0, -1) : rawKey;
    return {
      key,
      value: decodeDirectiveValue(rawValue),
      raw: line,
      lineNo
    };
  }

  function makeRecord(startLine) {
    return {
      startLine,
      tags: {},
      tagOrder: [],
      lineNumbers: {},
      sections: {
        Auction: [],
        Play: [],
        OptimumResultTable: []
      },
      looseLines: []
    };
  }

  // PBN parsing and hand/deal analysis.
  function parsePbn(text, fileName) {
    const lines = normalizeText(text).split("\n");
    const directives = [];
    const records = [];
    const warnings = [];
    let current = null;
    let section = null;

    lines.forEach((line, index) => {
      const lineNo = index + 1;
      const trimmed = line.trim();
      if (!trimmed) {
        if (section !== "Auction" && section !== "Play") section = null;
        return;
      }

      if (trimmed.startsWith("%")) {
        const directive = parseDirectiveLine(trimmed, lineNo);
        if (directive) directives.push(directive);
        return;
      }

      const tag = parseTagLine(trimmed);
      if (tag) {
        const startsNextRecord =
          current &&
          Object.keys(current.tags).length > 0 &&
          (tag.key === "Event" || (tag.key === "Board" && current.tags.Board));
        if (startsNextRecord) {
          records.push(current);
          current = makeRecord(lineNo);
        }
        if (!current) current = makeRecord(lineNo);
        current.tags[tag.key] = tag.value;
        current.tagOrder.push(tag.key);
        current.lineNumbers[tag.key] = lineNo;
        section = ["Auction", "Play", "OptimumResultTable"].includes(tag.key) ? tag.key : null;
        return;
      }

      if (current && section && current.sections[section]) {
        current.sections[section].push(trimmed);
      } else if (current) {
        current.looseLines.push({ lineNo, text: line });
      } else if (trimmed !== "\"") {
        warnings.push(`Ignored preamble line ${lineNo}: ${trimmed}`);
      }
    });

    if (current && Object.keys(current.tags).length > 0) records.push(current);

    if (!records.length) warnings.push("No PBN board records were found.");

    return {
      fileName: fileName || "PBN text",
      directives,
      records,
      warnings
    };
  }

  function orderedSeatsFrom(firstSeat) {
    const start = SEATS.indexOf(firstSeat);
    if (start === -1) return [];
    return [0, 1, 2, 3].map((offset) => SEATS[(start + offset) % SEATS.length]);
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

  function parseDeal(dealText) {
    const result = {
      raw: dealText || "",
      firstSeat: "",
      hands: {},
      valid: false,
      issues: []
    };

    if (!dealText) {
      result.issues.push("Missing Deal tag");
      return result;
    }

    const match = String(dealText).trim().match(/^([NESW]):\s*(.+)$/i);
    if (!match) {
      result.issues.push("Deal tag is not in seat:hand format");
      return result;
    }

    const firstSeat = match[1].toUpperCase();
    const handTexts = match[2].trim().split(/\s+/);
    const seats = orderedSeatsFrom(firstSeat);
    result.firstSeat = firstSeat;

    if (handTexts.length !== 4) {
      result.issues.push(`Expected 4 hands, found ${handTexts.length}`);
    }

    seats.forEach((seat, index) => {
      const suitTexts = (handTexts[index] || "").split(".");
      while (suitTexts.length < 4) suitTexts.push("");
      result.hands[seat] = {};
      SUITS.forEach((suit, suitIndex) => {
        result.hands[seat][suit.key] = sortHolding(suitTexts[suitIndex] || "");
      });
    });

    const seen = new Map();
    const cards = [];
    SEATS.forEach((seat) => {
      const hand = result.hands[seat] || {};
      SUITS.forEach((suit) => {
        const holding = hand[suit.key] || "";
        holding.split("").forEach((rank) => {
          if (!RANK_ORDER.includes(rank)) {
            result.issues.push(`Unknown rank ${rank} in ${seat} ${suit.key}`);
            return;
          }
          const card = `${suit.key}${rank}`;
          cards.push(card);
          if (seen.has(card)) {
            result.issues.push(`Duplicate card ${card} in ${seat} and ${seen.get(card)}`);
          } else {
            seen.set(card, seat);
          }
        });
      });
    });

    if (cards.length !== 52) result.issues.push(`Deal has ${cards.length} cards, expected 52`);
    result.valid = result.issues.length === 0;
    return result;
  }

  function parseOptimumScore(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(NS|EW|[NESW])\s+(-?\d+)/i);
    if (!match) {
      return {
        raw: text,
        side: "",
        pair: "",
        score: null,
        nsPerspective: null,
        edge: "Flat"
      };
    }

    const side = match[1].toUpperCase();
    const score = Number(match[2]);
    const pair = side === "NS" || side === "EW" ? side : PAIRS[side];
    const nsPerspective = pair === "NS" ? score : -score;
    return {
      raw: text,
      side,
      pair,
      score,
      nsPerspective,
      edge: nsPerspective > 0 ? "NS" : nsPerspective < 0 ? "EW" : "Flat"
    };
  }

  function parseContractPiece(piece) {
    const text = String(piece || "").trim();
    if (!text) return null;
    const sideMatch = text.match(/^(NS|EW|[NESW])\b/i);
    const side = sideMatch ? sideMatch[1].toUpperCase() : "";
    const pair = side === "NS" || side === "EW" ? side : PAIRS[side] || "";
    const body = side ? text.slice(sideMatch[0].length).trim() : text;
    const contractMatch = body.match(/([1-7])\s*(NT|N|[CDHS])\s*(XX|X)?\s*(=|[+-]\d+)?/i);
    if (!contractMatch) {
      return {
        raw: text,
        side,
        pair,
        level: null,
        strain: "",
        doubled: "",
        result: "",
        className: "Unknown"
      };
    }

    const level = Number(contractMatch[1]);
    const strain = contractMatch[2].toUpperCase() === "NT" ? "N" : contractMatch[2].toUpperCase();
    const doubled = (contractMatch[3] || "").toUpperCase();
    const result = contractMatch[4] || "";
    return {
      raw: text,
      side,
      pair,
      level,
      strain,
      doubled,
      result,
      className: classifyContract(level, strain)
    };
  }

  function parseParContracts(value) {
    return String(value || "")
      .split(";")
      .map((piece) => parseContractPiece(piece))
      .filter(Boolean);
  }

  function classifyContract(level, strain) {
    if (!level || !strain) return "Unknown";
    if (level >= 6) return "Slam-level";
    if (strain === "N" && level >= 3) return "Game-level";
    if ((strain === "S" || strain === "H") && level >= 4) return "Game-level";
    if ((strain === "D" || strain === "C") && level >= 5) return "Game-level";
    return "Partscore";
  }

  function parseOptimumRows(lines) {
    return (lines || [])
      .map((line) => {
        const match = String(line).trim().match(/^([NESW])\s+(NT|[SHDC])\s+(\d+)$/i);
        if (!match) return null;
        const denomination = match[2].toUpperCase() === "NT" ? "N" : match[2].toUpperCase();
        const tricks = Number(match[3]);
        return {
          declarer: match[1].toUpperCase(),
          pair: PAIRS[match[1].toUpperCase()],
          denomination,
          tricks,
          makeableLevel: Math.max(0, tricks - 6)
        };
      })
      .filter(Boolean);
  }

  function parseDoubleDummyTricks(value) {
    const text = String(value || "").replace(/[^0-9a-d]/gi, "").toLowerCase();
    if (text.length < 20) return [];
    const rows = [];
    let index = 0;
    DOUBLE_DUMMY_SEATS.forEach((seat) => {
      DOUBLE_DUMMY_DENOMS.forEach((denomination) => {
        const tricks = parseInt(text[index], 16);
        index += 1;
        if (Number.isFinite(tricks)) {
          rows.push({
            declarer: seat,
            pair: PAIRS[seat],
            denomination,
            tricks,
            makeableLevel: Math.max(0, tricks - 6)
          });
        }
      });
    });
    return rows;
  }

  root.BarbeloPbnParser = {
    parsePbn,
    parseDeal,
    parseOptimumScore,
    parseParContracts,
    parseOptimumRows,
    parseDoubleDummyTricks,
    classifyContract
  };
}(typeof window !== "undefined" ? window : globalThis));
