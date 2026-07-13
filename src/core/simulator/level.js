// Authored Bridge Simulator level data. Geometry is deliberately plain,
// serializable data: the renderer may turn it into meshes, while collision and
// validation use the same polygons, portals, and markers directly.

const LEVEL_SCHEMA_VERSION = 1;

const PLAYER_RULES = Object.freeze({
  radius: 0.38,
  height: 1.7,
  maxStep: 0.5,
  eyeHeight: 1.52
});

function rectangle(x1, z1, x2, z2) {
  return [
    { x: x1, z: z1 },
    { x: x2, z: z1 },
    { x: x2, z: z2 },
    { x: x1, z: z2 }
  ];
}

function segment(x1, z1, x2, z2) {
  return { a: { x: x1, z: z1 }, b: { x: x2, z: z2 } };
}

function space(id, label, polygon, floor, ceiling, options = {}) {
  return {
    id,
    label,
    polygon,
    floor,
    ceiling,
    primary: options.primary !== false,
    kind: options.kind || "room",
    wingId: options.wingId || "",
    material: options.material || "club-wall",
    floorMaterial: options.floorMaterial || "club-carpet",
    ceilingMaterial: options.ceilingMaterial || "ceiling-tile",
    light: options.light == null ? 0.78 : options.light
  };
}

function portal(id, from, to, opening, kind = "open", options = {}) {
  return {
    id,
    from,
    to,
    segment: opening,
    kind,
    automatic: options.automatic !== false,
    initialOpen: options.initialOpen !== false,
    requirement: options.requirement || null,
    width: Math.hypot(opening.b.x - opening.a.x, opening.b.z - opening.a.z),
    liftSpeed: options.liftSpeed || 0,
    material: options.material || (kind === "lift" ? "lift-door" : "door-felt")
  };
}

function marker(id, type, spaceId, x, z, options = {}) {
  return {
    id,
    type,
    spaceId,
    position: { x, y: options.y == null ? null : options.y, z },
    radius: options.radius == null ? 0.32 : options.radius,
    wingId: options.wingId || "",
    archetype: options.archetype || "",
    pickupKind: options.pickupKind || "",
    amount: options.amount == null ? 0 : options.amount,
    secretId: options.secretId || "",
    label: options.label || "",
    manifests: options.manifests || ["full", "slice"]
  };
}

const SPACES = [
  space("club-entrance", "Club Entrance / Coat Check", rectangle(0, 28, 14, 42), 0, 4.2, {
    material: "coat-check-wall",
    floorMaterial: "entry-tile",
    light: 0.9
  }),
  space("movement-hall", "Movement Hall", rectangle(14, 28, 28, 42), 0, 4.2, {
    material: "tutorial-wall",
    floorMaterial: "green-felt",
    light: 0.86
  }),
  space("main-cardroom", "Main Cardroom", rectangle(28, 22, 56, 48), 0, 5.4, {
    material: "cardroom-wall",
    floorMaterial: "club-carpet",
    light: 0.82
  }),
  space("wing-a-entry", "Theme Wing A: Entrance", rectangle(28, 48, 42, 60), 0.35, 4.3, {
    wingId: "a",
    material: "auction-wall",
    floorMaterial: "auction-carpet",
    ceilingMaterial: "auction-ceiling",
    light: 0.68
  }),
  space("wing-a-chalkboard", "Theme Wing A: Coach's Chalkboard", rectangle(42, 48, 56, 60), 0.75, 4.5, {
    wingId: "a",
    material: "auction-wall",
    floorMaterial: "auction-carpet",
    ceilingMaterial: "auction-ceiling",
    light: 0.74
  }),
  space("wing-b-entry", "Theme Wing B: Entrance", rectangle(56, 34, 70, 48), 0, 4.2, {
    wingId: "b",
    material: "trickworks-wall",
    floorMaterial: "blue-carpet",
    ceilingMaterial: "trickworks-ceiling",
    light: 0.64
  }),
  space("wing-b-chalkboard", "Theme Wing B: Coach's Chalkboard", rectangle(70, 34, 84, 48), 0, 4.2, {
    wingId: "b",
    material: "trickworks-wall",
    floorMaterial: "blue-carpet",
    ceilingMaterial: "trickworks-ceiling",
    light: 0.72
  }),
  space("wing-c-entry", "Theme Wing C: Entrance", rectangle(28, 10, 42, 22), -0.35, 4.0, {
    wingId: "c",
    material: "lead-mine-wall",
    floorMaterial: "red-carpet",
    ceilingMaterial: "lead-mine-ceiling",
    light: 0.58
  }),
  space("wing-c-chalkboard", "Theme Wing C: Coach's Chalkboard", rectangle(42, 10, 56, 22), -0.35, 4.0, {
    wingId: "c",
    material: "lead-mine-wall",
    floorMaterial: "red-carpet",
    ceilingMaterial: "lead-mine-ceiling",
    light: 0.66
  }),
  space("vulnerability-passage", "Vulnerability Passage", [
    { x: 56, z: 10 },
    { x: 88, z: 10 },
    { x: 88, z: 48 },
    { x: 84, z: 48 },
    { x: 84, z: 22 },
    { x: 56, z: 22 }
  ], -0.3, 4.1, {
    material: "vulnerability-wall",
    floorMaterial: "checker-carpet",
    light: 0.52
  }),
  space("traveler-vault", "Traveler Vault", rectangle(56, 22, 72, 34), -0.2, 5.2, {
    material: "vault-wall",
    floorMaterial: "vault-floor",
    light: 0.7
  }),
  space("results-posted", "Results Posted / Move for the Next Round", rectangle(72, 22, 84, 34), 0, 4.5, {
    material: "results-wall",
    floorMaterial: "entry-tile",
    light: 0.94
  })
];

const PORTALS = [
  portal("entrance-to-movement", "club-entrance", "movement-hall", segment(14, 33, 14, 37), "door", {
    automatic: true,
    initialOpen: true
  }),
  portal("movement-to-hub", "movement-hall", "main-cardroom", segment(28, 33, 28, 37), "door", {
    automatic: true,
    initialOpen: true
  }),
  portal("hub-to-wing-a", "main-cardroom", "wing-a-entry", segment(32, 48, 38, 48), "stairs"),
  portal("wing-a-inner", "wing-a-entry", "wing-a-chalkboard", segment(42, 52, 42, 56), "stairs"),
  portal("wing-a-lift-shortcut", "wing-a-chalkboard", "main-cardroom", segment(48, 48, 52, 48), "lift", {
    initialOpen: false,
    requirement: { type: "wingComplete", wingId: "a" },
    liftSpeed: 1.25,
    material: "lift-brass"
  }),
  portal("hub-to-wing-b", "main-cardroom", "wing-b-entry", segment(56, 38, 56, 44), "door"),
  portal("wing-b-inner", "wing-b-entry", "wing-b-chalkboard", segment(70, 38, 70, 44), "door"),
  portal("wing-b-shortcut", "wing-b-chalkboard", "vulnerability-passage", segment(84, 38, 84, 44), "door", {
    initialOpen: false,
    requirement: { type: "wingComplete", wingId: "b" }
  }),
  portal("hub-to-wing-c", "main-cardroom", "wing-c-entry", segment(32, 22, 38, 22), "stairs"),
  portal("wing-c-inner", "wing-c-entry", "wing-c-chalkboard", segment(42, 14, 42, 18), "open"),
  portal("wing-c-shortcut", "wing-c-chalkboard", "vulnerability-passage", segment(56, 14, 56, 18), "stairs", {
    initialOpen: false,
    requirement: { type: "wingComplete", wingId: "c" }
  }),
  portal("hub-to-vault", "main-cardroom", "traveler-vault", segment(56, 25, 56, 31), "gate", {
    initialOpen: false,
    requirement: { type: "slips" },
    material: "review-slip-gate"
  }),
  portal("vault-to-passage", "traveler-vault", "vulnerability-passage", segment(60, 22, 66, 22), "door", {
    initialOpen: false,
    requirement: { type: "bossDefeated" },
    material: "victory-door"
  }),
  portal("vault-to-results", "traveler-vault", "results-posted", segment(72, 25, 72, 31), "gate", {
    initialOpen: false,
    requirement: { type: "bossDefeated" },
    material: "next-round-door"
  })
];

const MARKERS = [
  marker("player-spawn", "playerSpawn", "club-entrance", 4, 35, { radius: 0.38 }),
  marker("coach-entrance", "coach", "club-entrance", 8, 33, { label: "Opening briefing", radius: 0.45 }),
  marker("coach-hub", "coachCheckpoint", "main-cardroom", 35, 35, { label: "Field briefing", radius: 0.45 }),
  marker("coach-wing-a", "coachCheckpoint", "wing-a-chalkboard", 46, 56, { wingId: "a", radius: 0.45 }),
  marker("coach-wing-b", "coachCheckpoint", "wing-b-chalkboard", 74, 44, { wingId: "b", radius: 0.45, manifests: ["full"] }),
  marker("coach-wing-c", "coachCheckpoint", "wing-c-chalkboard", 46, 18, { wingId: "c", radius: 0.45, manifests: ["full"] }),
  marker("coach-vault", "coachCheckpoint", "traveler-vault", 59, 31, { label: "Boss briefing", radius: 0.45 }),
  marker("coach-results", "coachCheckpoint", "results-posted", 76, 31, { label: "Debrief", radius: 0.45 }),

  marker("review-slip-a", "reviewSlip", "wing-a-chalkboard", 51, 55, { wingId: "a", label: "Coach's Chalkboard A", radius: 0.42 }),
  marker("review-slip-b", "reviewSlip", "wing-b-chalkboard", 79, 41, { wingId: "b", label: "Coach's Chalkboard B", radius: 0.42, manifests: ["full"] }),
  marker("review-slip-c", "reviewSlip", "wing-c-chalkboard", 51, 16, { wingId: "c", label: "Coach's Chalkboard C", radius: 0.42, manifests: ["full"] }),
  marker("vault-objective", "vault", "traveler-vault", 60, 28, { radius: 0.5 }),
  marker("bottom-board", "bossSpawn", "traveler-vault", 66, 28, { archetype: "bottom-board", radius: 1.0 }),
  marker("next-round-exit", "exit", "results-posted", 80, 28, { label: "Move for the Next Round", radius: 0.7 }),

  marker("lift-control-hub", "liftControl", "main-cardroom", 50, 46, { label: "Call lift" }),
  marker("lift-control-wing-a", "liftControl", "wing-a-chalkboard", 50, 50, { label: "Call lift" }),

  marker("secret-biscuit", "secret", "movement-hall", 18, 31, { secretId: "biscuit-closet", label: "Biscuit Closet", radius: 0.5 }),
  marker("secret-dummy", "secret", "wing-a-chalkboard", 53, 51, { secretId: "dummys-hand", label: "Dummy's Hand", radius: 0.5 }),
  marker("secret-seven-nt", "secret", "vulnerability-passage", 86, 14, { secretId: "seven-nt-room", label: "The 7NT Room", radius: 0.5, manifests: ["full"] }),

  marker("tutorial-1", "enemySpawn", "movement-hall", 21, 34, { archetype: "kibitzer", radius: 0.34 }),
  marker("tutorial-2", "enemySpawn", "movement-hall", 24, 38, { archetype: "overtrick-imp", radius: 0.3 }),

  marker("a-enemy-1", "enemySpawn", "wing-a-entry", 32, 52, { wingId: "a", archetype: "kibitzer", radius: 0.34 }),
  marker("a-enemy-2", "enemySpawn", "wing-a-entry", 37, 56, { wingId: "a", archetype: "overtrick-imp", radius: 0.3 }),
  marker("a-enemy-3", "enemySpawn", "wing-a-entry", 39, 51, { wingId: "a", archetype: "kibitzer", radius: 0.34 }),
  marker("a-enemy-4", "enemySpawn", "wing-a-chalkboard", 45, 52, { wingId: "a", archetype: "red-x-sentinel", radius: 0.38 }),
  marker("a-enemy-5", "enemySpawn", "wing-a-chalkboard", 53, 57, { wingId: "a", archetype: "kibitzer", radius: 0.34 }),

  marker("b-enemy-1", "enemySpawn", "wing-b-entry", 60, 38, { wingId: "b", archetype: "kibitzer", radius: 0.34, manifests: ["full"] }),
  marker("b-enemy-2", "enemySpawn", "wing-b-entry", 65, 44, { wingId: "b", archetype: "overtrick-imp", radius: 0.3, manifests: ["full"] }),
  marker("b-enemy-3", "enemySpawn", "wing-b-entry", 67, 38, { wingId: "b", archetype: "kibitzer", radius: 0.34, manifests: ["full"] }),
  marker("b-enemy-4", "enemySpawn", "wing-b-chalkboard", 74, 38, { wingId: "b", archetype: "red-x-sentinel", radius: 0.38, manifests: ["full"] }),
  marker("b-enemy-5", "enemySpawn", "wing-b-chalkboard", 81, 45, { wingId: "b", archetype: "kibitzer", radius: 0.34, manifests: ["full"] }),

  marker("c-enemy-1", "enemySpawn", "wing-c-entry", 32, 14, { wingId: "c", archetype: "overtrick-imp", radius: 0.3, manifests: ["full"] }),
  marker("c-enemy-2", "enemySpawn", "wing-c-entry", 36, 19, { wingId: "c", archetype: "kibitzer", radius: 0.34, manifests: ["full"] }),
  marker("c-enemy-3", "enemySpawn", "wing-c-entry", 39, 13, { wingId: "c", archetype: "kibitzer", radius: 0.34, manifests: ["full"] }),
  marker("c-enemy-4", "enemySpawn", "wing-c-chalkboard", 46, 13, { wingId: "c", archetype: "red-x-sentinel", radius: 0.38, manifests: ["full"] }),
  marker("c-enemy-5", "enemySpawn", "wing-c-chalkboard", 53, 19, { wingId: "c", archetype: "overtrick-imp", radius: 0.3, manifests: ["full"] }),

  marker("passage-enemy-1", "enemySpawn", "vulnerability-passage", 61, 16, { archetype: "kibitzer", radius: 0.34, manifests: ["full"] }),
  marker("passage-enemy-2", "enemySpawn", "vulnerability-passage", 75, 15, { archetype: "overtrick-imp", radius: 0.3, manifests: ["full"] }),
  marker("passage-enemy-3", "enemySpawn", "vulnerability-passage", 86, 28, { archetype: "red-x-sentinel", radius: 0.38, manifests: ["full"] }),

  marker("biscuit-entry", "pickup", "club-entrance", 11, 39, { pickupKind: "biscuit", amount: 20, radius: 0.28 }),
  marker("coffee-hub", "pickup", "main-cardroom", 42, 28, { pickupKind: "coffee", amount: 35, radius: 0.28 }),
  marker("coffee-passage", "pickup", "vulnerability-passage", 82, 12, { pickupKind: "coffee", amount: 35, radius: 0.28, manifests: ["full"] }),

  marker("cover-vault-1", "cover", "traveler-vault", 61, 24, { radius: 0.65 }),
  marker("cover-vault-2", "cover", "traveler-vault", 67, 32, { radius: 0.65 })
];

const FULL_LEVEL_MANIFEST = Object.freeze({
  id: "full",
  label: "The Lost Matchpoints",
  spaceIds: SPACES.map((entry) => entry.id),
  portalIds: PORTALS.map((entry) => entry.id),
  wingIds: ["a", "b", "c"],
  requiredSlipIds: ["review-slip-a", "review-slip-b", "review-slip-c"],
  requiredSlipCount: 3,
  requiredSecretIds: ["secret-biscuit", "secret-dummy", "secret-seven-nt"],
  expectedOrdinaryEnemies: 20,
  expectedPrimarySpaces: 12
});

const SLICE_LEVEL_MANIFEST = Object.freeze({
  id: "slice",
  label: "The Lost Matchpoints: First Playable",
  spaceIds: [
    "club-entrance",
    "movement-hall",
    "main-cardroom",
    "wing-a-entry",
    "wing-a-chalkboard",
    "traveler-vault",
    "results-posted"
  ],
  portalIds: [
    "entrance-to-movement",
    "movement-to-hub",
    "hub-to-wing-a",
    "wing-a-inner",
    "wing-a-lift-shortcut",
    "hub-to-vault",
    "vault-to-results"
  ],
  wingIds: ["a"],
  requiredSlipIds: ["review-slip-a"],
  requiredSlipCount: 1,
  requiredSecretIds: ["secret-biscuit", "secret-dummy"],
  expectedOrdinaryEnemies: 7,
  expectedPrimarySpaces: 7
});

function polygonEdges(polygon) {
  return polygon.map((point, index) => ({
    a: { ...point },
    b: { ...polygon[(index + 1) % polygon.length] }
  }));
}

function wallsForSpaces(spaces, portals) {
  const portalIdsBySpace = new Map();
  portals.forEach((entry) => {
    [entry.from, entry.to].forEach((spaceId) => {
      if (!portalIdsBySpace.has(spaceId)) portalIdsBySpace.set(spaceId, []);
      portalIdsBySpace.get(spaceId).push(entry.id);
    });
  });
  return spaces.flatMap((entry) => polygonEdges(entry.polygon).map((wall, index) => ({
    id: `${entry.id}-wall-${index + 1}`,
    spaceId: entry.id,
    segment: wall,
    bottom: entry.floor,
    top: entry.ceiling,
    material: entry.material,
    portalIds: [...(portalIdsBySpace.get(entry.id) || [])]
  })));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function buildLevel(manifest) {
  const spaceIds = new Set(manifest.spaceIds);
  const portalIds = new Set(manifest.portalIds);
  const spaces = SPACES.filter((entry) => spaceIds.has(entry.id)).map(deepClone);
  const portals = PORTALS.filter((entry) =>
    portalIds.has(entry.id) && spaceIds.has(entry.from) && spaceIds.has(entry.to)).map(deepClone);
  const markers = MARKERS.filter((entry) =>
    spaceIds.has(entry.spaceId) && entry.manifests.includes(manifest.id)).map(deepClone);
  markers.forEach((entry) => {
    const owner = spaces.find((candidate) => candidate.id === entry.spaceId);
    if (entry.position.y == null && owner) entry.position.y = owner.floor;
  });
  const level = {
    schemaVersion: LEVEL_SCHEMA_VERSION,
    id: `bridge-simulator-${manifest.id}`,
    label: manifest.label,
    manifest: deepClone(manifest),
    bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 70 },
    rules: { ...PLAYER_RULES },
    spaces,
    portals,
    walls: wallsForSpaces(spaces, portals),
    markers,
    objectives: {
      wingIds: [...manifest.wingIds],
      requiredSlipIds: [...manifest.requiredSlipIds],
      requiredSlipCount: manifest.requiredSlipCount,
      bossMarkerId: "bottom-board",
      vaultMarkerId: "vault-objective",
      exitMarkerId: "next-round-exit",
      requiredSecretIds: [...manifest.requiredSecretIds]
    }
  };
  return deepFreeze(level);
}

const FULL_LEVEL = buildLevel(FULL_LEVEL_MANIFEST);
const SLICE_LEVEL = buildLevel(SLICE_LEVEL_MANIFEST);

function getAuthoredLevel(id = "full") {
  if (id === "slice") return SLICE_LEVEL;
  if (id === "full") return FULL_LEVEL;
  throw new Error(`Unknown Bridge Simulator level manifest: ${id}`);
}

export {
  LEVEL_SCHEMA_VERSION,
  PLAYER_RULES,
  FULL_LEVEL_MANIFEST,
  SLICE_LEVEL_MANIFEST,
  FULL_LEVEL,
  SLICE_LEVEL,
  getAuthoredLevel,
  polygonEdges,
};
