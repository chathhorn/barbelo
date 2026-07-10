"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..", "..");
const SAMPLES_DIR = path.join(ROOT, "samples");

function makeStubElement() {
  return {
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    disabled: false,
    className: "",
    inert: false,
    style: {},
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    click() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  };
}

function installDomStubs() {
  if (globalThis.window && globalThis.window.__barbeloTestStub) return globalThis.window;
  const elements = new Map();
  const documentStub = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeStubElement());
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeStubElement(); },
    addEventListener() {},
    removeEventListener() {},
    body: makeStubElement(),
    documentElement: makeStubElement()
  };
  const windowStub = {
    __barbeloTestStub: true,
    document: documentStub,
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    location: { href: "http://localhost/", search: "" },
    navigator: { userAgent: "node-test" },
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; }
  };
  windowStub.window = windowStub;
  globalThis.window = windowStub;
  globalThis.document = documentStub;
  return windowStub;
}

// Imports the real application entry (src/main.js) with DOM stubs in place
// and returns the window stub carrying the PBNAnalyzer public API. Modules
// are cached per process; node --test runs each test file in its own
// process, so every test file gets a fresh app.
async function loadApp() {
  const windowStub = installDomStubs();
  await import(pathToFileURL(path.join(ROOT, "src", "main.js")).href);
  return windowStub;
}

function samplePath(name) {
  return path.join(SAMPLES_DIR, name);
}

function hasSample(name) {
  return fs.existsSync(samplePath(name));
}

function readSample(name) {
  return fs.readFileSync(samplePath(name));
}

function csvFrom(rows) {
  return rows.map((row) => row.map((cell) => {
    const text = String(cell == null ? "" : cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  }).join(",")).join("\n");
}

module.exports = { loadApp, installDomStubs, ROOT, SAMPLES_DIR, samplePath, hasSample, readSample, csvFrom };
