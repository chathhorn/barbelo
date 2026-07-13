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

const toastQueue = [];
let toastActive = false;
let toastTimer = null;

const modalLayers = new Set();
const modalLayerPriorInert = new Map();
let modalAppShell = null;
let modalAppShellPriorInert = false;
let modalBodyHadOpenClass = false;

function showToast(message, type) {
  toastQueue.push({ message, type });
  if (!toastActive) drainToastQueue();
}

function drainToastQueue() {
  const next = toastQueue.shift();
  if (!next) {
    toastActive = false;
    return;
  }
  toastActive = true;
  const toast = document.getElementById("toast");
  toast.textContent = next.message;
  toast.className = `toast${next.type === "error" ? " error" : ""}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
    drainToastQueue();
  }, next.type === "error" ? 5200 : 1500);
}

// Board preview and Table Time can be stacked. Track the open layers so
// closing the top dialog does not accidentally make the app behind the
// remaining dialog interactive again.
function activateModalLayer(layer) {
  if (!layer || modalLayers.has(layer)) return;
  if (!modalLayers.size) {
    modalAppShell = /** @type {HTMLElement | null} */ (document.querySelector(".app-shell"));
    modalAppShellPriorInert = Boolean(modalAppShell && modalAppShell.inert);
    modalBodyHadOpenClass = document.body.classList.contains("modal-open");
  }
  const previousLayer = [...modalLayers].at(-1);
  if (previousLayer) previousLayer.inert = true;
  modalLayerPriorInert.set(layer, Boolean(layer.inert));
  layer.inert = false;
  modalLayers.add(layer);
  document.body.classList.add("modal-open");
  if (modalAppShell) modalAppShell.inert = true;
}

function deactivateModalLayer(layer) {
  if (!layer || !modalLayers.delete(layer)) return;
  layer.inert = modalLayerPriorInert.get(layer) || false;
  modalLayerPriorInert.delete(layer);
  if (modalLayers.size) {
    const activeLayer = [...modalLayers].at(-1);
    activeLayer.inert = false;
    return;
  }
  if (modalAppShell) modalAppShell.inert = modalAppShellPriorInert;
  if (!modalBodyHadOpenClass) document.body.classList.remove("modal-open");
  modalAppShell = null;
  modalAppShellPriorInert = false;
  modalBodyHadOpenClass = false;
}

function trapFocusWithin(event, container) {
  if (event.key !== "Tab" || !container) return false;
  const focusable = [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details > summary, [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.closest(".hidden, [hidden]") && element.getClientRects().length);
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
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
  const mark = /** @type {HTMLButtonElement | null} */ (document.querySelector(".brand-simulator-launch[data-simulator-open]"));
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
  showToast,
  activateModalLayer,
  deactivateModalLayer,
  trapFocusWithin,
  setElementHidden,
  renderBoardJump,
  renderBoardJumpList,
  setBrandMarkVariant,
  flipBrandMark,
  initAppVersion,
};
