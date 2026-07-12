import {
  NearestFilter,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TextureLoader,
} from "../../vendor/three/three.module.js";

const SPRITE_PATHS = {
  coachIdle: "coach/coach-idle-talk.svg",
  coachPoint: "coach/coach-point.svg",
  coachVictory: "coach/coach-victory.svg",
  coachTrot1: "coach/coach-trot-1.svg",
  coachTrot2: "coach/coach-trot-2.svg",
  kibitzer: "enemies/kibitzer.svg",
  overtrick: "enemies/overtrick-imp.svg",
  sentinel: "enemies/red-x-sentinel.svg",
  boss: "enemies/bottom-board.svg",
  biscuit: "pickups/biscuit.svg",
  coffee: "pickups/coffee.svg",
  systemNotes: "pickups/system-notes.svg",
  reviewSlip: "pickups/review-slip.svg",
  cardProjectile: "cards/card-projectiles.svg",
  cardImpact: "cards/card-impact.svg",
  cardBack: "cards/card-back.svg",
  feltWall: "textures/felt-wall.svg",
  paperPanel: "textures/paper-panel.svg",
  carpetSuits: "textures/carpet-suits.svg",
  chalkboard: "textures/coach-chalkboard.svg",
  vaultDoor: "textures/traveler-vault-door.svg",
  courtyardSky: "textures/courtyard-sky.svg",
};

function configureTexture(texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

async function preloadSpriteTextures(assetUrl, onProgress = () => {}) {
  const loader = new TextureLoader();
  const entries = Object.entries(SPRITE_PATHS);
  let loaded = 0;
  const textures = {};
  await Promise.all(entries.map(async ([key, path]) => {
    textures[key] = configureTexture(await loader.loadAsync(assetUrl(path)));
    loaded += 1;
    onProgress(loaded / entries.length, path);
  }));
  return textures;
}

function createBillboard(texture, { width = 1, height = 1, opacity = 1, depthTest = true } = {}) {
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthTest,
    depthWrite: false,
    opacity,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

function spriteKeyForEntity(entity) {
  const kind = String(entity && (entity.sprite || entity.kind || entity.type) || "").toLowerCase();
  if (kind.includes("coach")) return "coachIdle";
  if (kind.includes("boss") || kind.includes("bottom")) return "boss";
  if (kind.includes("overtrick") || kind.includes("imp")) return "overtrick";
  if (kind.includes("sentinel") || kind.includes("red-x") || kind.includes("redx")) return "sentinel";
  if (kind.includes("biscuit")) return "biscuit";
  if (kind.includes("coffee")) return "coffee";
  if (kind.includes("system") || kind.includes("armor")) return "systemNotes";
  if (kind.includes("slip")) return "reviewSlip";
  if (kind.includes("card") || kind.includes("projectile")) return "cardBack";
  return "kibitzer";
}

function spriteSizeForEntity(entity) {
  const kind = String(entity && (entity.kind || entity.type) || "").toLowerCase();
  if (kind.includes("coach")) return { width: 1.35, height: 1.35 };
  if (kind.includes("boss") || kind.includes("bottom")) return { width: 2.8, height: 3.3 };
  if (kind.includes("imp") || kind.includes("overtrick")) return { width: 1.1, height: 1.1 };
  if (kind.includes("pickup") || kind.includes("biscuit") || kind.includes("coffee") || kind.includes("slip")) {
    return { width: 0.65, height: 0.65 };
  }
  if (kind.includes("card") || kind.includes("projectile")) return { width: 0.28, height: 0.42 };
  return { width: 1.4, height: 1.65 };
}

function disposeSpriteTextures(textures) {
  Object.values(textures || {}).forEach((texture) => texture && texture.dispose());
}

export {
  SPRITE_PATHS,
  preloadSpriteTextures,
  createBillboard,
  spriteKeyForEntity,
  spriteSizeForEntity,
  disposeSpriteTextures,
};
