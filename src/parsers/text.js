// Text normalization shared by the line-oriented PBN and CSV parsers.

function normalizeText(text) {
  return String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export { normalizeText };
