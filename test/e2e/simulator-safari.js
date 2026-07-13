"use strict";

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..", "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};
const CSV = `Board,PairNS,PairEW,NS/EW,Contract,Result
1,1,2,N,3 NT,=
1,3,4,N,3 NT,+1
1,5,6,N,3 NT,+1
2,1,2,N,2 S,+1
2,3,4,N,4 S,=
2,5,6,N,4 S,=`;
const DEAL = "N:AKQJ.AKQ.AKQ.AKQ T987.J87.J87.J87 654.654.654.T965 32.T932.T932.432";
const PBN = [1, 2].map((board) => `[Board "${board}"]\n[Deal "${DEAL}"]`).join("\n\n");
const ARROW_RIGHT = "\uE014";

class WebDriverError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WebDriverError";
    this.details = details;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function serveSource() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
      const file = path.join(REPO, pathname === "/" ? "index.html" : pathname);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.writeHead(404); response.end("not found"); return;
      }
      response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      response.end(fs.readFileSync(file));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function driverRequest(port, method, pathname, body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const content = body == null ? "" : JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      timeout,
      headers: content ? { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(content) } : {},
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; } catch (error) {
          reject(new WebDriverError(`Invalid safaridriver response for ${method} ${pathname}`, { status: response.statusCode, text }));
          return;
        }
        const value = payload.value == null ? payload : payload.value;
        if ((response.statusCode || 500) >= 400 || value && value.error) {
          reject(new WebDriverError(value && value.message || `safaridriver returned HTTP ${response.statusCode}`, {
            status: response.statusCode,
            value,
          }));
          return;
        }
        resolve(value);
      });
    });
    request.once("timeout", () => request.destroy(new WebDriverError(`Timed out: ${method} ${pathname}`)));
    request.once("error", reject);
    if (content) request.write(content);
    request.end();
  });
}

async function waitForDriver(port, driverState, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (driverState.error) throw driverState.error;
    if (driverState.exited) throw new WebDriverError("safaridriver exited before becoming ready", { output: driverState.output });
    try {
      const status = await driverRequest(port, "GET", "/status", null, 750);
      if (!status || status.ready !== false) return;
    } catch (error) {
      // The port is expected to refuse connections briefly while the driver starts.
    }
    await delay(100);
  }
  throw new WebDriverError("Timed out waiting for safaridriver", { output: driverState.output });
}

function remoteAutomationUnavailable(error, output = "") {
  const message = `${error && error.message || ""}\n${output}\n${JSON.stringify(error && error.details || {})}`;
  return /allow remote automation|enable remote automation|remote automation.*disabled|safaridriver --enable|develop menu/i.test(message);
}

async function stopDriver(driver, timeout = 2000) {
  if (!driver || driver.exitCode != null || driver.signalCode != null) return;
  driver.kill("SIGTERM");
  const exited = new Promise((resolve) => driver.once("exit", resolve));
  await Promise.race([exited, delay(timeout)]);
  if (driver.exitCode == null && driver.signalCode == null) driver.kill("SIGKILL");
}

function createClient(port, sessionId) {
  const base = `/session/${encodeURIComponent(sessionId)}`;
  return {
    execute(script, args = []) {
      return driverRequest(port, "POST", `${base}/execute/sync`, { script, args });
    },
    executeAsync(script, args = []) {
      return driverRequest(port, "POST", `${base}/execute/async`, { script, args }, 20000);
    },
    navigate(url) {
      return driverRequest(port, "POST", `${base}/url`, { url }, 20000);
    },
    setWindowRect(rect) {
      return driverRequest(port, "POST", `${base}/window/rect`, rect);
    },
    actions(actions) {
      return driverRequest(port, "POST", `${base}/actions`, { actions });
    },
    releaseActions() {
      return driverRequest(port, "DELETE", `${base}/actions`);
    },
    close() {
      return driverRequest(port, "DELETE", base, null, 5000);
    },
  };
}

async function waitFor(client, label, script, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.execute(`return Boolean(${script});`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function sendKey(client, value, duration) {
  try {
    await client.actions([{
      type: "key",
      id: "keyboard",
      actions: [
        { type: "keyDown", value },
        { type: "pause", duration },
        { type: "keyUp", value },
      ],
    }]);
  } finally {
    await client.releaseActions();
  }
}

const failures = [];
function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
}

async function run() {
  if (process.env.SIMULATOR_REAL_SAFARI !== "1") {
    console.log("SKIP: real Safari smoke is opt-in because it opens Safari. Run with SIMULATOR_REAL_SAFARI=1.");
    return;
  }
  if (process.platform !== "darwin") {
    console.log("SKIP: real Safari smoke requires macOS and safaridriver.");
    return;
  }
  const versionProbe = spawnSync("safaridriver", ["--version"], { encoding: "utf8" });
  if (versionProbe.error && versionProbe.error.code === "ENOENT") {
    console.log("SKIP: safaridriver is not installed or not on PATH.");
    return;
  }
  if (versionProbe.error) throw versionProbe.error;

  let appServer = null;
  let driver = null;
  let client = null;
  let sessionId = "";
  const driverState = { exited: false, error: null, output: "" };
  let cleanupPromise = null;
  const cleanup = () => {
    if (!cleanupPromise) cleanupPromise = (async () => {
      if (client && sessionId) {
        try { await client.close(); } catch (error) { console.warn(`WARN: Safari session cleanup failed: ${error.message}`); }
      }
      await stopDriver(driver);
      if (appServer) await new Promise((resolve) => appServer.close(resolve));
    })();
    return cleanupPromise;
  };
  const interrupt = (exitCode) => { cleanup().finally(() => process.exit(exitCode)); };
  const onSigint = () => interrupt(130);
  const onSigterm = () => interrupt(143);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  try {
    appServer = await serveSource();
    const appPort = appServer.address().port;
    const driverPort = await reservePort();
    driver = spawn("safaridriver", ["--port", String(driverPort)], { stdio: ["ignore", "pipe", "pipe"] });
    const capture = (chunk) => { driverState.output = `${driverState.output}${chunk}`.slice(-12000); };
    driver.stdout.on("data", capture);
    driver.stderr.on("data", capture);
    driver.once("error", (error) => { driverState.error = error; });
    driver.once("exit", () => { driverState.exited = true; });
    await waitForDriver(driverPort, driverState);

    let session;
    try {
      session = await driverRequest(driverPort, "POST", "/session", {
        capabilities: { alwaysMatch: { browserName: "safari" } },
      }, 20000);
    } catch (error) {
      if (remoteAutomationUnavailable(error, driverState.output)) {
        console.log("SKIP: Safari Remote Automation is disabled. In Safari, enable Develop > Allow Remote Automation, then rerun this command.");
        return;
      }
      throw error;
    }
    sessionId = session.sessionId;
    if (!sessionId) throw new WebDriverError("safaridriver did not return a session id", { session });
    client = createClient(driverPort, sessionId);
    const capabilities = session.capabilities || {};
    await client.setWindowRect({ width: 1400, height: 900, x: 20, y: 20 });
    const origin = `http://127.0.0.1:${appPort}`;
    await client.navigate(`${origin}/`);
    await waitFor(client, "the Barbelo app", "window.PBNAnalyzer && document.querySelector('#resultsFile')");
    const brandPrepared = await client.executeAsync(`
      const done = arguments[arguments.length - 1];
      import("/src/ui/dom.js").then(({ setBrandMarkVariant }) => {
        setBrandMarkVariant(true);
        done({ ok: true });
      }, (error) => done({ ok: false, error: error && (error.stack || error.message) || String(error) }));
    `);
    if (!brandPrepared || !brandPrepared.ok) throw new Error(`Could not select the ouroboros mark: ${brandPrepared && brandPrepared.error || "unknown error"}`);
    const userAgent = await client.execute("return navigator.userAgent;");
    console.log(`SAFARI: ${capabilities.browserVersion || "version unavailable"} · ${userAgent}`);

    await client.execute(`
      window.__safariSmokeErrors = [];
      const stringify = (value) => value instanceof Error ? value.stack || value.message : String(value);
      const originalError = console.error.bind(console);
      console.error = (...values) => { window.__safariSmokeErrors.push(values.map(stringify).join(" ")); originalError(...values); };
      window.addEventListener("error", (event) => window.__safariSmokeErrors.push(event.message || stringify(event.error)));
      window.addEventListener("unhandledrejection", (event) => window.__safariSmokeErrors.push(stringify(event.reason)));
    `);
    await client.execute(`
      const load = (selector, name, type, text) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([text], name, { type }));
        const input = document.querySelector(selector);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      load("#resultsFile", "safari-smoke.csv", "text/csv", arguments[0]);
      load("#pbnFile", "safari-smoke.pbn", "text/plain", arguments[1]);
    `, [CSV, PBN]);
    await waitFor(client, "the Pair Improvement Report", "document.querySelectorAll('.priority-card').length > 0");
    check(await client.execute("return !document.querySelector('#pairReportBody [data-simulator-open]') && !document.querySelector('.brand-simulator-launch').disabled;"), "real Safari exposes the simulator only through the ouroboros");

    await client.execute(`
      const trigger = document.querySelector('.brand-simulator-launch');
      trigger.focus();
      trigger.click();
    `);
    await waitFor(client, "the logo-launched simulator preflight", "document.querySelector('.simulator-preflight')");
    check(await client.execute("return document.querySelector('.app-shell').inert && Boolean(document.querySelector('.bridge-simulator-overlay'));"), "real Safari logo launch opens the modal and inerts the app shell");
    await client.execute("document.querySelector('.bridge-simulator-exit').click();");
    await waitFor(client, "logo-launch cleanup", "!document.querySelector('.bridge-simulator-overlay')");
    check(await client.execute("return document.activeElement === document.querySelector('.brand-simulator-launch');"), "real Safari logo launch restores focus");

    const opened = await client.executeAsync(`
      const done = arguments[arguments.length - 1];
      (async () => {
        const simulator = await import("/src/ui/simulatorView.js");
        window.__safariSmokeController = await simulator.openBridgeSimulator({ levelId: "slice" });
        return true;
      })().then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: error && (error.stack || error.message) || String(error) }));
    `);
    if (!opened || !opened.ok) throw new Error(`Safari simulator launch failed: ${opened && opened.error || "unknown error"}`);
    await waitFor(client, "simulator preflight", "document.querySelector('.simulator-preflight')");
    check(await client.execute(`
      const app = window.__safariSmokeController;
      const starts = document.querySelectorAll('[data-simulator-start]');
      const start = starts[0];
      return Boolean(app && app.capability.available && starts.length === 1 && start && !start.disabled && start.textContent.trim() === 'Start!');
    `), "real Safari reports a playable WebGL preflight");
    check(await client.execute(`
      const clipboard = document.querySelector('.simulator-clipboard');
      return Boolean(clipboard && clipboard.textContent.includes("Coach's clipboard") && clipboard.textContent.includes('Throwing hand') && clipboard.textContent.includes('Composure'));
    `), "real Safari preflight exposes the Coach's clipboard contents");

    await client.execute(`
      document.querySelector('[data-simulator-settings]').click();
    `);
    await waitFor(client, "simulator settings", "document.querySelector('#simulator-settings-title')");
    await client.execute(`
      const select = document.querySelector('[data-simulator-setting="inputMode"]');
      select.value = "keyboard";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector('[data-simulator-settings-close]').click();
    `);
    await waitFor(client, "preflight return", "document.querySelector('.simulator-preflight')");
    await client.execute("document.querySelector('[data-simulator-start]').click();");
    await waitFor(client, "Safari game canvas", "document.querySelector('canvas.simulator-canvas') && window.__safariSmokeController.renderer");
    const start = await client.execute(`
      document.querySelector('canvas.simulator-canvas').focus();
      return { x: window.__safariSmokeController.state.player.position.x, yaw: window.__safariSmokeController.state.player.yaw };
    `);
    await sendKey(client, "w", 350);
    await sendKey(client, ARROW_RIGHT, 220);
    const moved = await client.execute(`
      const app = window.__safariSmokeController;
      return { x: app.state.player.position.x, yaw: app.state.player.yaw, pointerLocked: Boolean(document.pointerLockElement) };
    `);
    check(moved.x > start.x + 0.4, `real Safari Keyboard Look moves forward (${start.x.toFixed(2)} → ${moved.x.toFixed(2)})`);
    check(moved.yaw > start.yaw + 0.1, "real Safari arrow-key turning works without Pointer Lock");
    check(!moved.pointerLocked, "Keyboard Look never acquires Pointer Lock in real Safari");

    await client.execute("document.querySelector('.bridge-simulator-exit').click();");
    await waitFor(client, "simulator cleanup", "!document.querySelector('.bridge-simulator-overlay')");
    check(await client.execute("return window.__safariSmokeController.destroyed && !document.querySelector('.app-shell').inert;"), "real Safari exit destroys the simulator and restores the app shell");
    const audit = await client.execute(`
      const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
      const foreign = resources.filter((url) => { try { return new URL(url, location.href).origin !== location.origin; } catch (error) { return true; } });
      const persisted = JSON.stringify(localStorage);
      return {
        foreign,
        leakedUrl: resources.some((url) => /PairNS|AKQJ|safari-smoke\\.(csv|pbn)/.test(decodeURIComponent(url))),
        persistedSession: /PairNS|AKQJ|safari-smoke\\.(csv|pbn)/.test(persisted),
        errors: window.__safariSmokeErrors.slice(),
      };
    `);
    check(audit.foreign.length === 0, `real Safari requests remain same-origin (${audit.foreign.join(", ")})`);
    check(!audit.leakedUrl && !audit.persistedSession, "real Safari neither transmits nor persists uploaded session data");
    check(audit.errors.length === 0, `real Safari records no console/page errors (${audit.errors.join("; ")})`);

    console.log(failures.length ? `\nREAL SAFARI SMOKE FAILED (${failures.length})` : "\nREAL SAFARI SMOKE PASSED");
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    if (remoteAutomationUnavailable(error, driverState.output)) {
      console.log("SKIP: Safari Remote Automation is disabled. In Safari, enable Develop > Allow Remote Automation, then rerun this command.");
      return;
    }
    throw error;
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    await cleanup();
  }
}

run().catch((error) => {
  console.error("REAL SAFARI SMOKE CRASHED:", error && (error.stack || error));
  process.exitCode = 2;
});
