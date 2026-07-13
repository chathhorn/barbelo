#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { SIMULATOR_ASSET_PATHS } from "../packages/bridge-simulator/src/assets.js";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, "_site");
const MAX_SIMULATOR_PAYLOAD_BYTES = 3 * 1024 * 1024;
const ROOT_DEPLOY_ASSET_FILES = Object.freeze([
  "barbelo.css",
  "favicon.svg",
  "pleroma.svg",
  ...Array.from({ length: 20 }, (_, index) => `collie-${String(index + 1).padStart(2, "0")}.svg`),
]);
const ROOT_SOURCE_ASSET_FILES = Object.freeze([
  ...ROOT_DEPLOY_ASSET_FILES,
  "README.md",
]);
const SIMULATOR_ASSET_FILES = Object.freeze([
  ...new Set(Object.values(SIMULATOR_ASSET_PATHS)),
  "ATTRIBUTIONS.md",
].sort());

function usage() {
  return [
    "Usage: node tools/build-site.mjs [--output <directory>] [--version <label>]",
    "",
    "Build the deployable Barbelo site and verify its lazy simulator boundary.",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    version: process.env.GITHUB_SHA?.slice(0, 7) || "dev",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      return null;
    }
    if (argument !== "--output" && argument !== "--version") {
      throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }

  if (!/^[A-Za-z0-9._-]+$/.test(options.version)) {
    throw new Error("Build version may contain only letters, numbers, dots, underscores, and hyphens.");
  }
  options.output = path.resolve(PROJECT_ROOT, options.output);
  return options;
}

function assertSafeOutputDirectory(outputDirectory) {
  const projectRelative = path.relative(PROJECT_ROOT, outputDirectory);
  const isProjectSite = projectRelative === "_site";
  const temporaryRoots = new Set([tmpdir(), path.resolve("/tmp")]);
  const isTemporaryChild = [...temporaryRoots].some((root) => {
    const relative = path.relative(root, outputDirectory);
    return relative !== "" &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
  });
  if (!isProjectSite && !isTemporaryChild) {
    throw new Error("Output must be the project _site directory or a child of the system temporary directory.");
  }
}

async function totalBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += await totalBytes(entryPath);
    else if (entry.isFile()) bytes += (await stat(entryPath)).size;
  }
  return bytes;
}

async function relativeFileInventory(directory, root = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await relativeFileInventory(entryPath, root));
    else if (entry.isFile()) files.push(path.relative(root, entryPath).split(path.sep).join("/"));
  }
  return files.sort();
}

async function assertExactFileInventory(directory, expectedFiles, label) {
  const actualFiles = await relativeFileInventory(directory);
  const expected = [...expectedFiles].sort();
  if (actualFiles.join("\n") !== expected.join("\n")) {
    const expectedSet = new Set(expected);
    const actualSet = new Set(actualFiles);
    const missing = expected.filter((file) => !actualSet.has(file));
    const unexpected = actualFiles.filter((file) => !expectedSet.has(file));
    throw new Error([
      `${label} inventory does not match its build manifest.`,
      missing.length ? `Missing: ${missing.join(", ")}` : "",
      unexpected.length ? `Unexpected: ${unexpected.join(", ")}` : "",
    ].filter(Boolean).join(" "));
  }
}

async function copyFileSet(sourceDirectory, outputDirectory, filenames) {
  await Promise.all(filenames.map(async (filename) => {
    const destination = path.join(outputDirectory, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(sourceDirectory, filename), destination);
  }));
}

function rewriteIndexHtml(source, version) {
  const moduleScript = /<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=\s*["']src\/main\.js\?v=__BARBELO_VERSION__["'])[^>]*>\s*<\/script>/gi;
  const matches = source.match(moduleScript) || [];
  if (matches.length !== 1) {
    throw new Error(`Expected one source entry script in index.html; found ${matches.length}.`);
  }

  return source
    .replace(moduleScript, `<script defer src="assets/barbelo.js?v=${version}"></script>`)
    .replaceAll("__BARBELO_VERSION__", version);
}

function assertBundleBoundaries(mainResult, simulatorResult) {
  const mainInputs = Object.keys(mainResult.metafile.inputs);
  const simulatorInputs = Object.keys(simulatorResult.metafile.inputs);
  const leakedSimulatorInputs = mainInputs.filter((input) =>
    /^(?:packages\/bridge-simulator\/|src\/(?:core\/)?simulator\/|vendor\/three\/)/.test(input));
  const leakedApplicationInputs = simulatorInputs.filter((input) =>
    !input.startsWith("packages/bridge-simulator/"));

  if (leakedSimulatorInputs.length) {
    throw new Error(`Simulator modules entered the Barbelo bundle: ${leakedSimulatorInputs.join(", ")}`);
  }
  if (leakedApplicationInputs.length) {
    throw new Error(`Application modules entered the simulator bundle: ${leakedApplicationInputs.join(", ")}`);
  }
}

async function assertBuiltSite(outputDirectory, version, mainResult, simulatorResult) {
  assertBundleBoundaries(mainResult, simulatorResult);

  const index = await readFile(path.join(outputDirectory, "index.html"), "utf8");
  const mainBundle = await readFile(path.join(outputDirectory, "assets/barbelo.js"), "utf8");
  const simulatorBundle = await readFile(path.join(outputDirectory, "assets/bridge-simulator.js"), "utf8");
  const reportView = await readFile(path.join(PROJECT_ROOT, "src/ui/reportView.js"), "utf8");

  for (const [source, deployed] of [
    ["LICENSE", "LICENSE"],
    ["packages/bridge-simulator/LICENSE", "assets/bridge-simulator.LICENSE"],
    ["packages/bridge-simulator/vendor/three/LICENSE", "vendor/three/LICENSE"],
    ["packages/bridge-simulator/vendor/three/VERSION", "vendor/three/VERSION"],
  ]) {
    const [sourceContents, deployedContents] = await Promise.all([
      readFile(path.join(PROJECT_ROOT, source)),
      readFile(path.join(outputDirectory, deployed)),
    ]);
    if (!sourceContents.equals(deployedContents)) {
      throw new Error(`Built legal/provenance file differs from ${source}.`);
    }
  }

  const requiredIndexFragments = [
    `data-version="${version}"`,
    `assets/barbelo.css?v=${version}`,
    `assets/barbelo.js?v=${version}`,
  ];
  for (const fragment of requiredIndexFragments) {
    if (!index.includes(fragment)) throw new Error(`Built index is missing: ${fragment}`);
  }
  if (index.includes("__BARBELO_VERSION__") || index.includes("src/main.js")) {
    throw new Error("Built index still contains a source-only placeholder or entry point.");
  }
  if (!/<button\b(?=[^>]*\bdata-simulator-open\b)(?=[^>]*\bmark-opt-ouro\b)[^>]*>/i.test(index)) {
    throw new Error("Built index is missing the ouroboros simulator launch control.");
  }
  if (reportView.includes("data-simulator-open")) {
    throw new Error("The simulator launch control must remain outside the Pair Improvement Report.");
  }
  if (/Three\.js Authors|WebGLRenderer|GENERIC_SCENARIO|createSimulatorRenderer/.test(mainBundle)) {
    throw new Error("Three.js or simulator runtime code entered the eager Barbelo bundle.");
  }
  if (!simulatorBundle.includes("var BridgeSimulator") ||
      !simulatorBundle.includes("SPDX-License-Identifier: MIT")) {
    throw new Error("The simulator bundle is missing its global API or retained legal notice.");
  }
  if (!Object.keys(simulatorResult.metafile.inputs)
    .some((input) => input.endsWith("vendor/three/three.core.js"))) {
    throw new Error("The simulator bundle is missing its pinned Three.js renderer.");
  }

  const simulatorAssetBytes = await totalBytes(path.join(outputDirectory, "assets/simulator"));
  const simulatorPayloadBytes = simulatorAssetBytes +
    (await stat(path.join(outputDirectory, "assets/bridge-simulator.js"))).size +
    (await stat(path.join(outputDirectory, "assets/simulator.css"))).size;
  if (simulatorPayloadBytes > MAX_SIMULATOR_PAYLOAD_BYTES) {
    throw new Error(`Bridge Simulator payload is ${simulatorPayloadBytes} bytes; limit is ${MAX_SIMULATOR_PAYLOAD_BYTES}.`);
  }
  return simulatorPayloadBytes;
}

export async function buildSite({ output, version }) {
  assertSafeOutputDirectory(output);
  const { build } = await import("esbuild");
  await Promise.all([
    assertExactFileInventory(
      path.join(PROJECT_ROOT, "assets"),
      ROOT_SOURCE_ASSET_FILES,
      "Application asset",
    ),
    assertExactFileInventory(
      path.join(PROJECT_ROOT, "packages/bridge-simulator/assets"),
      SIMULATOR_ASSET_FILES,
      "Simulator asset",
    ),
  ]);
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, "assets"), { recursive: true });
  await mkdir(path.join(output, "vendor/three"), { recursive: true });

  await Promise.all([
    copyFileSet(
      path.join(PROJECT_ROOT, "assets"),
      path.join(output, "assets"),
      ROOT_DEPLOY_ASSET_FILES,
    ),
    copyFileSet(
      path.join(PROJECT_ROOT, "packages/bridge-simulator/assets"),
      path.join(output, "assets/simulator"),
      SIMULATOR_ASSET_FILES,
    ),
    copyFile(path.join(PROJECT_ROOT, "LICENSE"), path.join(output, "LICENSE")),
    copyFile(
      path.join(PROJECT_ROOT, "packages/bridge-simulator/simulator.css"),
      path.join(output, "assets/simulator.css"),
    ),
    copyFile(
      path.join(PROJECT_ROOT, "packages/bridge-simulator/LICENSE"),
      path.join(output, "assets/bridge-simulator.LICENSE"),
    ),
    ...["LICENSE", "VERSION"].map((filename) => copyFile(
      path.join(PROJECT_ROOT, "packages/bridge-simulator/vendor/three", filename),
      path.join(output, "vendor/three", filename),
    )),
  ]);

  const commonBuildOptions = {
    absWorkingDir: PROJECT_ROOT,
    bundle: true,
    format: "iife",
    legalComments: "eof",
    metafile: true,
  };
  const [mainResult, simulatorResult] = await Promise.all([
    build({
      ...commonBuildOptions,
      entryPoints: ["src/main.js"],
      outfile: path.join(output, "assets/barbelo.js"),
    }),
    build({
      ...commonBuildOptions,
      entryPoints: ["packages/bridge-simulator/src/index.js"],
      globalName: "BridgeSimulator",
      outfile: path.join(output, "assets/bridge-simulator.js"),
    }),
  ]);

  const sourceIndex = await readFile(path.join(PROJECT_ROOT, "index.html"), "utf8");
  await writeFile(
    path.join(output, "index.html"),
    rewriteIndexHtml(sourceIndex, version),
    "utf8",
  );

  const simulatorPayloadBytes = await assertBuiltSite(
    output,
    version,
    mainResult,
    simulatorResult,
  );
  return { output, simulatorPayloadBytes };
}

export { rewriteIndexHtml };

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options) return;
  const result = await buildSite(options);
  console.log(`Built ${path.relative(PROJECT_ROOT, result.output) || result.output}`);
  console.log(`Required Bridge Simulator payload: ${result.simulatorPayloadBytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
