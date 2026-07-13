// Contract semantics: parsing and normalizing contract text, contract
// classification, and contract-level comparisons.

function normalizePlayedContractText(value) {
  const text = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!text) return "";
  if (/^(PASS|AP|ALL PASS|PASSED OUT)$/.test(text)) return "PASS";
  const match = text.match(/^([1-7])\s*(NT|N|[SHDC])(?:\s*(XX|X))?$/i);
  if (!match) return text;
  const strain = match[2].toUpperCase();
  const denomination = strain === "N" || strain === "NT" ? "NT" : strain;
  const doubled = match[3] ? ` ${match[3].toUpperCase()}` : "";
  return `${match[1]} ${denomination}${doubled}`;
}

function normalizeResultValue(value) {
  return String(value == null ? "" : value).trim().toUpperCase();
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

function contractClassRank(className) {
  if (className === "Slam-level") return 3;
  if (className === "Game-level") return 2;
  if (className === "Partscore") return 1;
  return 0;
}

function contractTarget(contract) {
  return contract && contract.level ? contract.level + 6 : null;
}

function samePlayedContract(a, b) {
  if (!a || !b) return false;
  if (a.passout || b.passout) return a.passout && b.passout;
  return !!a.level &&
    a.level === b.level &&
    a.strain === b.strain &&
    (a.doubled || "") === (b.doubled || "");
}

function classifyContract(level, strain) {
  if (!level || !strain) return "Unknown";
  if (level >= 6) return "Slam-level";
  if (strain === "N" && level >= 3) return "Game-level";
  if ((strain === "S" || strain === "H") && level >= 4) return "Game-level";
  if ((strain === "D" || strain === "C") && level >= 5) return "Game-level";
  return "Partscore";
}

export {
  classifyContract,
  normalizePlayedContractText,
  normalizeResultValue,
  parsePlayedContract,
  contractClassRank,
  contractTarget,
  samePlayedContract,
};
