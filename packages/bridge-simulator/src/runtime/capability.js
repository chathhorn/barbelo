const MIN_FPS_VIEWPORT = Object.freeze({ width: 960, height: 540 });

function fpsCapability() {
  if (window.innerWidth < MIN_FPS_VIEWPORT.width || window.innerHeight < MIN_FPS_VIEWPORT.height) {
    return { available: false, reason: "The post-zoom viewport is below the 960 × 540 CSS-pixel FPS minimum." };
  }
  if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0) {
    return { available: false, reason: "Touch-first controls are not supported in this release." };
  }
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) return { available: false, reason: "WebGL is unavailable in this browser." };
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return { available: false, reason: "WebGL could not be initialized." };
  }
  return { available: true, reason: "" };
}

export { fpsCapability };
