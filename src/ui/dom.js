// Small DOM utilities: toasts, visibility toggles, board-jump buttons,
// and deploy-version helpers.
import { escapeHtml } from "../core/format.js";

function deployedVersion() {
  const meta = document.querySelector('meta[name="barbelo-version"]');
  const version = meta ? meta.getAttribute("content") || "" : "";
  return version && !version.includes("__") ? version : "";
}

function assetUrl(path) {
  const version = deployedVersion();
  if (!version) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(version)}`;
}

function sideClass(edge) {
  return edge === "NS" ? "ns" : edge === "EW" ? "ew" : "";
}

function showToast(message, type) {
  showToast.queue = showToast.queue || [];
  showToast.queue.push({ message, type });
  if (!showToast.active) drainToastQueue();
}

function drainToastQueue() {
  const next = showToast.queue && showToast.queue.shift();
  if (!next) {
    showToast.active = false;
    return;
  }
  showToast.active = true;
  const toast = document.getElementById("toast");
  toast.textContent = next.message;
  toast.className = `toast${next.type === "error" ? " error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
    drainToastQueue();
  }, next.type === "error" ? 5200 : 1500);
}

function setElementHidden(id, hidden) {
  const element = document.getElementById(id);
  if (element) element.classList.toggle("hidden", !!hidden);
}

function renderBoardJump(boardNo, label) {
  const text = label == null ? `Board ${boardNo}` : label;
  return `<button type="button" class="board-jump" data-board-jump="${escapeHtml(boardNo)}">${escapeHtml(text)}</button>`;
}

function renderBoardJumpList(boardNos, limit = 8) {
  const visible = boardNos.slice(0, limit).map((boardNo) => renderBoardJump(boardNo)).join(", ");
  const more = boardNos.length > limit ? `, +${escapeHtml(boardNos.length - limit)} more` : "";
  return `${visible}${more}`;
}

function syncBridgeSimulatorBrandMark() {
  const mark = document.querySelector(".brand-simulator-launch[data-simulator-open]");
  if (!mark) return;
  const enabled = document.body.classList.contains("mark-ouro");
  mark.disabled = !enabled;
  if (enabled) {
    mark.removeAttribute("aria-hidden");
    mark.setAttribute("aria-label", "Open Bridge Simulator");
    mark.setAttribute("title", "Open Bridge Simulator");
  } else {
    mark.setAttribute("aria-hidden", "true");
    mark.removeAttribute("aria-label");
    mark.removeAttribute("title");
  }
}

function setBrandMarkVariant(ouroboros) {
  document.body.classList.toggle("mark-ouro", Boolean(ouroboros));
  syncBridgeSimulatorBrandMark();
}

function flipBrandMark() {
  setBrandMarkVariant(Math.random() < 0.5);
}

function initAppVersion() {
  const element = document.getElementById("appVersion");
  if (!element) return;
  const version = element.getAttribute("data-version") || "";
  if (version && !version.includes("__")) {
    element.textContent = `v${version}`;
  }
}

export {
  deployedVersion,
  assetUrl,
  sideClass,
  showToast,
  drainToastQueue,
  setElementHidden,
  renderBoardJump,
  renderBoardJumpList,
  setBrandMarkVariant,
  flipBrandMark,
  initAppVersion,
};
