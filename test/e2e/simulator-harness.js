import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const SUPPORTED_BROWSERS = new Set(["chromium", "firefox", "webkit"]);
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
});

function loadPlaywright() {
  const browserName = String(process.env.PLAYWRIGHT_BROWSER || "chromium").toLowerCase();
  let playwright;
  try {
    playwright = require(path.join(REPO, "node_modules", "playwright"));
  } catch {
    console.log("SKIP: playwright not installed (npm install playwright)");
    return null;
  }
  const browserType = playwright[browserName];
  if (!SUPPORTED_BROWSERS.has(browserName) || !browserType) {
    throw new Error(`Unsupported PLAYWRIGHT_BROWSER ${JSON.stringify(browserName)}; use chromium, firefox, or webkit.`);
  }
  const version = require(path.join(REPO, "node_modules", "playwright", "package.json")).version;
  const launchOptions = browserName === "firefox"
    ? { firefoxUserPrefs: { "webgl.force-enabled": true } }
    : {};
  return { browserName, browserType, launchOptions, playwright, version };
}

function fileForRequest(root, requestUrl, indexFile = "index.html") {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://local").pathname);
  } catch {
    return null;
  }
  const relative = pathname === "/" ? indexFile : pathname.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  return file === root || file.startsWith(`${root}${path.sep}`) ? file : null;
}

function serveStatic(root = REPO, { cacheControl = "no-store", indexFile = "index.html" } = {}) {
  const serveRoot = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }
      const file = fileForRequest(serveRoot, request.url, indexFile);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      const body = fs.readFileSync(file);
      response.writeHead(200, {
        "Cache-Control": cacheControl,
        "Content-Length": body.length,
        "Content-Type": MIME_TYPES[path.extname(file)] || "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function originFor(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function createCheckReporter() {
  const failures = [];
  function check(ok, label) {
    console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
    if (!ok) failures.push(label);
  }
  return { check, failures };
}

function capturePageDiagnostics(page, { captureRequests = true } = {}) {
  const errors = [];
  const requests = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  if (captureRequests) page.on("request", (request) => requests.push(request.url()));
  return { errors, requests };
}

async function forceRandomChoices(page, choices) {
  await page.addInitScript(({ values }) => {
    const random = Math.random.bind(Math);
    const pending = [...values];
    Math.random = () => pending.length ? pending.shift() : random();
  }, { values: [...choices] });
}

function logBrowser(browser, { browserName, version }) {
  console.log(`BROWSER: ${browserName} ${browser.version()} (Playwright ${version})`);
}

export {
  REPO,
  capturePageDiagnostics,
  closeServer,
  createCheckReporter,
  fileForRequest,
  forceRandomChoices,
  loadPlaywright,
  logBrowser,
  originFor,
  serveStatic,
};
