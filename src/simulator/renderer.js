import {
  Color,
  FogExp2,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "../../vendor/three/three.module.js";
import { createLevelMeshes } from "./levelMeshes.js";
import {
  createBillboard,
  disposeSpriteTextures,
  spriteKeyForEntity,
  spriteSizeForEntity,
} from "./sprites.js";

function entityPosition(entity) {
  const position = entity && entity.position || entity || {};
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0,
    z: Number(position.z) || 0,
  };
}

function entityId(entity, index) {
  return String(entity && (entity.id || entity.entityId || entity.markerId) || `entity-${index}`);
}

function entityAlive(entity) {
  return entity && entity.visible !== false && entity.active !== false && entity.alive !== false && entity.defeated !== true &&
    (entity.collected !== true || entity.reopenable === true);
}

function snapshotEntities(snapshot) {
  if (!snapshot) return [];
  if (Array.isArray(snapshot.entities)) return snapshot.entities;
  return [
    ...(snapshot.enemies || []),
    ...(snapshot.pickups || []),
    ...(snapshot.projectiles || []),
    ...(snapshot.effects || []),
    ...(snapshot.coaches || []),
  ];
}

function playerView(snapshot) {
  const player = snapshot && snapshot.player || {};
  const position = entityPosition(player);
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    eyeHeight: Number(player.eyeHeight) || 1.52,
    yaw: Number(player.yaw != null ? player.yaw : player.angle) || 0,
  };
}

function createSimulatorRenderer({ canvas, level, textures, palette = null, fov = 72, reducedEffects = false, highContrast = false } = {}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(320, 200, false);
  renderer.sortObjects = true;

  const scene = new Scene();
  const paletteKey = String(palette && palette.key || "felt-green");
  const paletteColor = paletteKey.includes("blue") ? 0x0c1727
    : paletteKey.includes("gold") ? 0x2a2110
      : paletteKey.includes("red") ? 0x28100f
        : 0x101815;
  scene.background = new Color(highContrast ? 0x000000 : paletteColor);
  scene.fog = new FogExp2(highContrast ? 0x000000 : paletteColor, reducedEffects ? 0.009 : 0.014);
  const camera = new PerspectiveCamera(Math.max(55, Math.min(90, Number(fov) || 72)), 320 / 200, 0.05, 140);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const levelMeshes = createLevelMeshes(level, textures);
  scene.add(levelMeshes.root);
  const sprites = new Map();
  let destroyed = false;

  function syncEntities(snapshot) {
    const seen = new Set();
    snapshotEntities(snapshot).forEach((entity, index) => {
      if (!entityAlive(entity)) return;
      const id = entityId(entity, index);
      const key = spriteKeyForEntity(entity);
      seen.add(id);
      let entry = sprites.get(id);
      if (!entry || entry.key !== key) {
        if (entry) {
          scene.remove(entry.sprite);
          entry.sprite.material.dispose();
        }
        const size = spriteSizeForEntity(entity);
        const sprite = createBillboard(textures[key] || textures.kibitzer, size);
        sprite.userData.entityId = id;
        scene.add(sprite);
        entry = { key, sprite };
        sprites.set(id, entry);
      }
      const position = entityPosition(entity);
      const height = entry.sprite.scale.y;
      entry.sprite.position.set(position.x, position.y + height / 2, position.z);
      if (entity.opacity != null) entry.sprite.material.opacity = Math.max(0, Math.min(1, entity.opacity));
      if (entity.tint != null) entry.sprite.material.color.set(entity.tint);
      entry.sprite.visible = true;
    });
    sprites.forEach((entry, id) => {
      if (seen.has(id)) return;
      scene.remove(entry.sprite);
      entry.sprite.material.dispose();
      sprites.delete(id);
    });
  }

  function sync(snapshot) {
    if (destroyed || !snapshot) return;
    const player = playerView(snapshot);
    camera.position.set(player.x, player.y + player.eyeHeight, player.z);
    // Simulation yaw 0 faces +X (matching card-projectile velocity); Three's
    // camera faces -Z at zero rotation.
    camera.rotation.set(0, -Math.PI / 2 - player.yaw, 0);
    syncEntities(snapshot);
    levelMeshes.updatePortals(snapshot.portalStates || snapshot.portals || {});
  }

  function render(snapshot) {
    if (destroyed) return;
    if (snapshot) sync(snapshot);
    renderer.render(scene, camera);
  }

  function setFov(nextFov) {
    camera.fov = Math.max(55, Math.min(90, Number(nextFov) || 72));
    camera.updateProjectionMatrix();
  }

  function setReducedEffects(enabled) {
    if (scene.fog) scene.fog.density = enabled ? 0.009 : 0.014;
  }

  function resourceInfo() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  }

  function destroy({ loseContext = false, disposeTextures = false } = {}) {
    if (destroyed) return;
    destroyed = true;
    sprites.forEach((entry) => entry.sprite.material.dispose());
    sprites.clear();
    levelMeshes.destroy();
    if (disposeTextures) disposeSpriteTextures(textures);
    renderer.dispose();
    if (loseContext && typeof renderer.forceContextLoss === "function") renderer.forceContextLoss();
  }

  return { renderer, scene, camera, sync, render, setFov, setReducedEffects, resourceInfo, destroy };
}

export { createSimulatorRenderer, snapshotEntities, playerView };
