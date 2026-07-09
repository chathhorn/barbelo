"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

function loadApp() {
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

  const context = vm.createContext({
    window: windowStub,
    document: documentStub,
    navigator: windowStub.navigator,
    location: windowStub.location,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    URL,
    TextDecoder,
    TextEncoder,
    DataView,
    Uint8Array,
    ArrayBuffer,
    FileReader: function FileReader() {}
  });

  ["assets/pbn-parser.js", "assets/bws-parser.js", "assets/barbelo.js"].forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(code, context, { filename: file });
  });

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

module.exports = { loadApp, ROOT, SAMPLES_DIR, samplePath, hasSample, readSample, csvFrom };
