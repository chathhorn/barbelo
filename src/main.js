import * as pbnParser from "./parsers/pbn.js";
import * as bwsParser from "./parsers/bws.js";
import "./app.js";

// Compatibility globals for the browser console and legacy callers; new
// code should import from src/parsers/ directly.
if (typeof window !== "undefined") {
  window.BarbeloPbnParser = pbnParser;
  window.BarbeloBwsParser = bwsParser;
}
