import {
  NearestFilter,
  RepeatWrapping,
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
  reviewSlip: "pickups/review-slip.svg",
  cardProjectile: "cards/card-projectiles.svg",
  enemyProjectile: "cards/enemy-score-slip.svg",
  cardImpact: "cards/card-impact.svg",
  cardBack: "cards/card-back.svg",
  feltWall: "textures/felt-wall.svg",
  auctionWall: "textures/auction-wall.svg",
  trickworksWall: "textures/trickworks-wall.svg",
  leadMineWall: "textures/lead-mine-wall.svg",
  paperPanel: "textures/paper-panel.svg",
  carpetSuits: "textures/carpet-suits.svg",
  ceilingTile: "textures/ceiling-tile.svg",
  chalkboard: "textures/coach-chalkboard.svg",
  vaultDoor: "textures/traveler-vault-door.svg",
  courtyardSky: "textures/courtyard-sky.svg",
};

function configureTexture(texture, { tile = false } = {}) {
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  if (tile) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  texture.needsUpdate = true;
  return texture;
}

async function preloadSpriteTextures(assetUrl, onProgress = () => {}) {
  const loader = new TextureLoader();
  const entries = Object.entries(SPRITE_PATHS);
  let loaded = 0;
  const textures = {};
  const results = await Promise.allSettled(entries.map(async ([key, path]) => {
    textures[key] = configureTexture(await loader.loadAsync(assetUrl(path)), {
      tile: key === "carpetSuits" || key === "ceilingTile" || key === "paperPanel",
    });
    loaded += 1;
    onProgress(loaded / entries.length, path);
  }));
  const failed = results.find((result) => result.status === "rejected");
  if (failed) {
    disposeSpriteTextures(textures);
    throw new Error("One or more simulator art files failed to load.", { cause: failed.reason });
  }
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
  const kind = [entity && entity.sprite, entity && entity.archetype, entity && entity.pickupKind, entity && entity.type, entity && entity.kind]
    .filter(Boolean).join(" ").toLowerCase();
  if (entity && entity.owner === "enemy" && (kind.includes("projectile") || kind.includes("score-slip"))) return "enemyProjectile";
  if (kind.includes("coach") && kind.includes("victory")) return "coachVictory";
  if (kind.includes("coach") && kind.includes("point")) return "coachPoint";
  if (kind.includes("coach") && kind.includes("trot-2")) return "coachTrot2";
  if (kind.includes("coach") && kind.includes("trot")) return "coachTrot1";
  if (kind.includes("coach")) return "coachIdle";
  if (kind.includes("boss") || kind.includes("bottom")) return "boss";
  if (kind.includes("overtrick") || kind.includes("imp")) return "overtrick";
  if (kind.includes("sentinel") || kind.includes("red-x") || kind.includes("redx")) return "sentinel";
  if (kind.includes("biscuit")) return "biscuit";
  if (kind.includes("coffee")) return "coffee";
  if (kind.includes("lift-control")) return "reviewSlip";
  if (kind.includes("next-round") || kind.includes("exit")) return "vaultDoor";
  if (entity && entity.kind === "enemy" && kind.includes("score-slip")) return "kibitzer";
  if (kind.includes("card")) return "cardBack";
  if (kind.includes("slip")) return "reviewSlip";
  return "kibitzer";
}

function spriteSizeForEntity(entity) {
  const kind = [entity && entity.sprite, entity && entity.archetype, entity && entity.pickupKind, entity && entity.type, entity && entity.kind]
    .filter(Boolean).join(" ").toLowerCase();
  if (entity && entity.owner === "enemy" && (kind.includes("projectile") || kind.includes("score-slip"))) {
    return { width: 0.38, height: 0.48 };
  }
  if (kind.includes("coach") && (kind.includes("point") || kind.includes("victory"))) {
    return { width: 1.35, height: 1.8 };
  }
  if (kind.includes("coach")) return { width: 1.15, height: 1.8 };
  if (kind.includes("boss") || kind.includes("bottom")) return { width: 2.8, height: 3.3 };
  if (kind.includes("next-round") || kind.includes("exit")) return { width: 1.6, height: 2.4 };
  if (kind.includes("imp") || kind.includes("overtrick")) return { width: 1.1, height: 1.1 };
  if (kind.includes("score-slip") || kind.includes("card") || kind.includes("projectile")) return { width: 0.28, height: 0.42 };
  if (kind.includes("pickup") || kind.includes("biscuit") || kind.includes("coffee") || kind.includes("slip")) {
    return { width: 0.65, height: 0.65 };
  }
  if (kind.includes("lift-control")) return { width: 0.65, height: 0.8 };
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
