import test from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/load-app.js";

const app = await loadApp();
const { csvCell, decodeTextBuffer, parseResultsCsv } = app.PBNAnalyzer;

test("csvCell neutralizes spreadsheet formula injection without mangling bridge data", () => {
  assert.equal(csvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("@SUM(A1:A9)"), "'@SUM(A1:A9)");
  assert.equal(csvCell("+2"), "+2");
  assert.equal(csvCell("-100"), "-100");
  assert.equal(csvCell("="), "=");
  assert.equal(csvCell("3 NT X"), "3 NT X");
  assert.equal(csvCell("O\"Malley, Pat"), "\"O\"\"Malley, Pat\"");
});

test("decodeTextBuffer reads UTF-8 first and falls back to Windows-1252", () => {
  const utf8 = new TextEncoder().encode("José & Müller");
  assert.equal(decodeTextBuffer(utf8), "José & Müller");

  const latin1 = Uint8Array.from([0x4a, 0x6f, 0x73, 0xe9]);
  assert.equal(decodeTextBuffer(latin1), "José");

  const bom = new TextEncoder().encode("\uFEFFBoard");
  assert.equal(decodeTextBuffer(bom), "Board");
});

test("a UTF-8 BOM does not corrupt the first CSV header", () => {
  const parsed = parseResultsCsv("\uFEFFBoard,NS/EW,Contract,Result\n7,N,3 NT,=", "t.csv", 40);
  assert.equal(parsed.receivedData.length, 1);
  assert.equal(parsed.receivedData[0].Board, "7");
});

test("csvCell leaves hand displays with void suits intact but still guards formulas", () => {
  assert.equal(csvCell("-.Q5.AQ7632.T9653"), "-.Q5.AQ7632.T9653");
  assert.equal(csvCell("-IMPORTXML(\"http://x\",\"//a\")"), "\"'-IMPORTXML(\"\"http://x\"\",\"\"//a\"\")\"");
  assert.equal(csvCell("+cmd()"), "'+cmd()");
});

test("contractGlyphHtml renders suit glyphs and doubling marks safely", () => {
  const { contractGlyphHtml } = app.PBNAnalyzer;
  assert.equal(contractGlyphHtml("4 D X"), "4<span class=\"suit-glyph diamond\">&diams;</span><span class=\"dbl\">&times;</span>");
  assert.equal(contractGlyphHtml("7NT XX"), "7NT<span class=\"dbl\">&times;&times;</span>");
  assert.equal(contractGlyphHtml("NS 4DX-1"), "NS 4<span class=\"suit-glyph diamond\">&diams;</span><span class=\"dbl\">&times;</span>-1");
  assert.equal(contractGlyphHtml("S 3 NT+1"), "S 3NT+1");
  assert.equal(contractGlyphHtml("PASS"), "PASS");
  assert.equal(contractGlyphHtml("N 3 S"), "N 3<span class=\"suit-glyph spade\">&spades;</span>");
  assert.equal(contractGlyphHtml("<img src=x>"), "&lt;img src=x&gt;");
});

test("contractGlyphHtml treats bare N after a level as notrump", () => {
  const { contractGlyphHtml } = app.PBNAnalyzer;
  assert.equal(contractGlyphHtml("6N="), "6NT=");
  assert.equal(contractGlyphHtml("2NX-1"), "2NT<span class=\"dbl\">&times;</span>-1");
  assert.equal(contractGlyphHtml("Pair 1 North"), "Pair 1 North");
});
