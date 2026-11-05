"use strict";

const $ = (id) => document.getElementById(id);
const { PAPER_WIDTH, MAX_HEIGHT, LABEL_SIZES, LABEL_FRAMES, FRAME_NAMES, SHAPE_NAMES, FONT_STACKS,
  mmToPx, pxToMm, normalizeOpacity, normalizeFrameWidth, normalizeTextThickness,
  flowLayout, clampBox, rotateBox, selectionBounds, marqueeRect, marqueeHits, transformSelection } = T02StudioCore;
const canvas = $("composition-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const work = {
  mode: "free", tool: "text", freeTool: "select", items: [], selectedId: null, selectedIds: [],
  pageHeight: mmToPx(80), busy: false, drag: null, inlineId: null,
  paperDrag: null,
  history: [], future: [], imageFile: null, pdfFile: null, pdfSegment: 0,
  pdfTotal: 1, toastTimer: null, draftTimer: null, pointer: { x: 24, y: 24 },
  printerPort: "", printers: [], labelSize: "classic", labelFrame: "none", labelFont: "modern",
  labelFrameChoice: "rounded", labelFrameWidth: 3, labelDesign: false
};
const imageCache = new Map();
const MAX_ITEMS = 100;

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function toast(message, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.classList.remove("hidden");
  clearTimeout(work.toastTimer);
  work.toastTimer = setTimeout(() => el.classList.add("hidden"), error ? 7000 : 4200);
}

function apiError(response) {
  if (response.ok) return response;
  return response.json().catch(() => ({})).then(data => { throw Error(data.error || `Server error (${response.status})`); });
}

function selected() {
  return work.selectedIds.length > 1 ? null : work.items.find(item => item.id === work.selectedId) || null;
}
function selectedItems() {
  const ids = new Set(work.selectedIds);
  return work.items.filter(item => ids.has(item.id));
}
function setSelection(ids) {
  const allowed = new Set(work.items.map(item => item.id));
  work.selectedIds = [...new Set(ids)].filter(id => allowed.has(id));
  work.selectedId = work.selectedIds.length === 1 ? work.selectedIds[0] : null;
}
function cloneItem(item) { return JSON.parse(JSON.stringify(item)); }
function projectData() {
  return { version: 2, mode: work.mode, pageHeight: work.pageHeight,
    labelSize: work.labelSize, labelFrame: work.labelFrame, labelFrameWidth: work.labelFrameWidth,
    labelFont: work.labelFont,
    labelDesign: work.labelDesign,
    items: work.items.map(cloneItem) };
}
function checkpoint() {
  work.history.push(JSON.stringify(projectData()));
  if (work.history.length > 25) work.history.shift();
  work.future.length = 0;
}
function scheduleDraft() {
  clearTimeout(work.draftTimer);
  work.draftTimer = setTimeout(() => {
    try {
      const json = JSON.stringify(projectData());
      if (json.length < 3_000_000) localStorage.setItem("t02-composer-project", json);
    } catch { /* Browser storage is optional. */ }
  }, 650);
}
function restoreData(data) {
  if (!data || data.version !== 2 || !Array.isArray(data.items) || data.items.length > MAX_ITEMS)
    throw Error("Choose a valid T02 Studio project file");
  const items = data.items.map(item => {
    if (!["text", "image", "frame", "shape"].includes(item.type)) throw Error("Unsupported layer type");
    const safe = { ...item, id: String(item.id || uid()), name: String(item.name || "Item").slice(0, 120),
      x: Number(item.x) || 0, y: Number(item.y) || 0, w: Number(item.w) || 100, h: Number(item.h) || 50,
      hidden: Boolean(item.hidden), opacity: normalizeOpacity(item.opacity),
      rotation: [0, 90, 180, 270].includes(Number(item.rotation)) ? Number(item.rotation) : 0 };
    if (safe.type === "frame") {
      safe.frameStyle = LABEL_FRAMES.includes(safe.frameStyle) && safe.frameStyle !== "none" ? safe.frameStyle : "rounded";
      safe.frameWidth = normalizeFrameWidth(safe.frameWidth);
    }
    if (safe.type === "shape") {
      safe.shapeKind = Object.hasOwn(SHAPE_NAMES, safe.shapeKind) ? safe.shapeKind : "rectangle";
      safe.shapeWidth = normalizeFrameWidth(safe.shapeWidth);
      safe.shapeFilled = Boolean(safe.shapeFilled);
    }
    if (safe.type === "image" && !/^data:image\/(png|jpeg|webp);base64,/i.test(safe.src || ""))
      throw Error("Unsupported image in project");
    if (safe.type === "image") safe.fit = ["contain", "cover", "stretch"].includes(safe.fit) ? safe.fit : "contain";
    if (safe.type === "text") {
      safe.text = String(safe.text || "").slice(0, 20_000);
      safe.fontSize = Math.min(100, Math.max(8, Number(safe.fontSize) || 25));
      safe.align = ["left", "center", "right"].includes(safe.align) ? safe.align : "left";
      safe.bold = Boolean(safe.bold);
      safe.fontFamily = Object.hasOwn(FONT_STACKS, safe.fontFamily) ? safe.fontFamily : "modern";
      safe.inkThickness = normalizeTextThickness(safe.inkThickness);
      safe.labelRole = ["title", "subtitle"].includes(safe.labelRole) ? safe.labelRole : "";
      safe.baseFontSize = Math.min(100, Math.max(8, Number(safe.baseFontSize) || safe.fontSize));
      safe.centerVertically = Boolean(safe.centerVertically);
    }
    return safe;
  });
  work.items = items;
  work.mode = data.mode === "free" ? "free" : "flow";
  work.pageHeight = Math.max(mmToPx(20), Math.min(MAX_HEIGHT, Number(data.pageHeight) || mmToPx(150)));
  work.labelSize = Object.hasOwn(LABEL_SIZES, data.labelSize) ? data.labelSize : "classic";
  work.labelFrame = LABEL_FRAMES.includes(data.labelFrame) ? data.labelFrame : "none";
  work.labelFrameWidth = normalizeFrameWidth(data.labelFrameWidth);
  work.labelFont = Object.hasOwn(FONT_STACKS, data.labelFont) ? data.labelFont : "modern";
  work.labelDesign = data.labelDesign === true;
  work.labelFrameChoice = work.labelDesign ? work.labelFrame : "rounded";
  setSelection([]);
  work.history.length = 0; work.future.length = 0;
  imageCache.clear();
  syncMode(); syncLabelControls(); render(); scheduleDraft();
}

function fontStyle(item) {
  return `${item.bold ? "700" : "400"} ${item.fontSize}px ${FONT_STACKS[item.fontFamily] || FONT_STACKS.modern}`;
}
function wrappedLines(context, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const proposed = line ? `${line} ${word}` : word;
      if (context.measureText(proposed).width <= maxWidth) { line = proposed; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}
function requiredTextHeight(item, width = item.w) {
  ctx.font = fontStyle(item);
  return Math.max(36, wrappedLines(ctx, item.text || " ", Math.max(15, width - 14)).length * Math.ceil(item.fontSize * 1.28) + 16);
}

function imageFor(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const image = new Image();
  image.onload = () => render();
  image.onerror = () => toast("Could not load image", true);
  image.src = src;
  imageCache.set(src, image);
  return image;
}

function layouts() {
  if (work.mode === "flow") {
    const result = flowLayout(work.items);
    return { boxes: result.blocks, height: result.height };
  }
  return { boxes: work.items.filter(item => !item.hidden).map(item =>
    ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
    height: work.pageHeight };
}

function fitTextToBox(item) {
  const rotated = (item.rotation || 0) % 180 !== 0;
  const needed = requiredTextHeight(item, rotated ? item.h : item.w);
  if (rotated) item.w = Math.max(item.w, needed);
  else item.h = Math.max(item.h, needed);
}

function paintText(context, item, box) {
  context.save();
  context.beginPath(); context.rect(box.x, box.y, box.w, box.h); context.clip();
  context.fillStyle = "#000"; context.strokeStyle = "#000";
  context.font = fontStyle(item); context.textBaseline = "top";
  const stroke = [0, 0, .25, .55, .9, 1.35][normalizeTextThickness(item.inkThickness)];
  context.lineWidth = stroke; context.lineJoin = "round";
  context.textAlign = item.align || "left";
  const pad = Math.min(8, box.w / 8);
  const x = item.align === "center" ? box.x + box.w / 2 : item.align === "right" ? box.x + box.w - pad : box.x + pad;
  const lineHeight = Math.ceil(item.fontSize * 1.28);
  const lines = wrappedLines(context, item.text || "", Math.max(15, box.w - pad * 2));
  const top = item.centerVertically ? box.y + Math.max(4, (box.h - lines.length * lineHeight) / 2) : box.y + 7;
  lines.forEach((line, index) => {
    context.fillText(line, x, top + index * lineHeight);
    if (stroke > 0) context.strokeText(line, x, top + index * lineHeight);
  });
  context.restore();
}

function roundedBorder(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
  context.stroke();
}

function drawFrame(context, style, box, frameWidth = 3) {
  if (style === "none" || box.w < 20 || box.h < 20) return;
  const x = box.x + 2, y = box.y + 2, width = box.w - 4, h = box.h - 4;
  context.save();
  context.strokeStyle = "#000";
  context.fillStyle = "#000";
  const weight = normalizeFrameWidth(frameWidth);
  context.lineWidth = weight;
  if (style === "rounded") roundedBorder(context, x, y, width, h, 16);
  if (style === "solid") { context.lineWidth = weight * 1.2; context.strokeRect(x, y, width, h); }
  if (style === "double") {
    context.lineWidth = weight;
    roundedBorder(context, x, y, width, h, 7);
    context.lineWidth = Math.max(.9, weight * .58);
    if (width > 24 && h > 24) roundedBorder(context, x + 8, y + 8, width - 16, h - 16, 4);
  }
  if (style === "dashed") {
    context.lineWidth = weight;
    context.setLineDash([10, 7]);
    roundedBorder(context, x, y, width, h, 5);
  }
  if (style === "dotted") {
    context.lineWidth = weight * 1.15; context.lineCap = "round"; context.setLineDash([1, 7]);
    roundedBorder(context, x, y, width, h, 3);
  }
  if (style === "corners") {
    const length = Math.min(48, Math.max(23, h / 5));
    const corners = [[x, y, 1, 1], [x + width, y, -1, 1],
      [x, y + h, 1, -1], [x + width, y + h, -1, -1]];
    context.lineWidth = weight * 1.15;
    for (const [cx, cy, dx, dy] of corners) {
      context.beginPath(); context.moveTo(cx + dx * length, cy);
      context.lineTo(cx, cy); context.lineTo(cx, cy + dy * length); context.stroke();
      context.beginPath(); context.arc(cx + dx * 11, cy + dy * 11, 2.3, 0, Math.PI * 2); context.fill();
    }
  }
  if (style === "ticket") {
    const notch = Math.min(13, width / 7), middle = y + h / 2;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x + width, y);
    context.lineTo(x + width, middle - notch); context.lineTo(x + width - notch, middle);
    context.lineTo(x + width, middle + notch); context.lineTo(x + width, y + h);
    context.lineTo(x, y + h); context.lineTo(x, middle + notch);
    context.lineTo(x + notch, middle); context.lineTo(x, middle - notch);
    context.closePath(); context.stroke();
  }
  if (style === "deco") {
    context.lineWidth = weight; context.strokeRect(x, y, width, h);
    if (width > 24 && h > 24) { context.lineWidth = Math.max(.9, weight * .58); context.strokeRect(x + 8, y + 8, width - 16, h - 16); }
    for (const cy of [y, y + h]) {
      const cx = x + width / 2;
      context.beginPath(); context.moveTo(cx, cy - 6); context.lineTo(cx + 7, cy);
      context.lineTo(cx, cy + 6); context.lineTo(cx - 7, cy); context.closePath(); context.fill();
    }
  }
  if (style === "scallop") {
    context.beginPath(); context.moveTo(x, y);
    for (const [sx, sy, ex, ey, nx, ny] of [[x, y, x + width, y, 0, -1],
      [x + width, y, x + width, y + h, 1, 0],
      [x + width, y + h, x, y + h, 0, 1], [x, y + h, x, y, -1, 0]]) {
      const count = Math.max(1, Math.round(Math.hypot(ex - sx, ey - sy) / 20));
      for (let i = 1; i <= count; i++) {
        const mid = (i - .5) / count, end = i / count;
        context.quadraticCurveTo(sx + (ex - sx) * mid + nx * 7, sy + (ey - sy) * mid + ny * 7,
          sx + (ex - sx) * end, sy + (ey - sy) * end);
      }
    }
    context.closePath(); context.stroke();
  }
  if (style === "wavy") {
    context.beginPath(); context.moveTo(x, y);
    for (const [sx, sy, ex, ey, nx, ny] of [[x, y, x + width, y, 0, -1],
      [x + width, y, x + width, y + h, 1, 0],
      [x + width, y + h, x, y + h, 0, 1], [x, y + h, x, y, -1, 0]]) {
      const distance = Math.hypot(ex - sx, ey - sy), steps = Math.max(8, Math.ceil(distance / 4));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, wave = Math.sin(t * distance * Math.PI / 11) * 4;
        context.lineTo(sx + (ex - sx) * t + nx * wave, sy + (ey - sy) * t + ny * wave);
      }
    }
    context.closePath(); context.stroke();
  }
  context.restore();
}

function drawLabelFrame(context, height) {
  if (height < 70) return;
  drawFrame(context, work.labelFrame, { x: 11, y: 11, w: PAPER_WIDTH - 22, h: height - 22 }, work.labelFrameWidth);
}

function drawShape(context, item, box) {
  const inset = Math.max(3, normalizeFrameWidth(item.shapeWidth));
  const x = box.x + inset, y = box.y + inset;
  const w = Math.max(1, box.w - 2 * inset), h = Math.max(1, box.h - 2 * inset);
  context.save();
  context.strokeStyle = "#000"; context.fillStyle = "#000";
  context.lineWidth = normalizeFrameWidth(item.shapeWidth);
  context.lineJoin = "round"; context.lineCap = "round";
  const kind = item.shapeKind;
  context.beginPath();
  if (kind === "rectangle") context.rect(x, y, w, h);
  else if (kind === "rounded") {
    const r = Math.min(16, w / 4, h / 4);
    context.moveTo(x + r, y); context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r); context.closePath();
  } else if (kind === "ellipse") context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (kind === "diamond") {
    context.moveTo(x + w / 2, y); context.lineTo(x + w, y + h / 2);
    context.lineTo(x + w / 2, y + h); context.lineTo(x, y + h / 2); context.closePath();
  } else if (kind === "star") {
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? .5 : .23;
      const angle = i * Math.PI / 5 - Math.PI / 2;
      const px = x + w / 2 + Math.cos(angle) * w * radius;
      const py = y + h / 2 + Math.sin(angle) * h * radius;
      if (i === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
  } else if (kind === "line" || kind === "arrow") {
    const middle = y + h / 2;
    context.moveTo(x, middle); context.lineTo(x + w, middle);
    if (kind === "arrow") {
      const head = Math.min(20, w / 4, h / 2);
      context.moveTo(x + w - head, middle - head / 2);
      context.lineTo(x + w, middle); context.lineTo(x + w - head, middle + head / 2);
    }
  }
  if (item.shapeFilled && !["line", "arrow"].includes(kind)) context.fill();
  else context.stroke();
  context.restore();
}

function drawArtwork(context, geometry) {
  context.fillStyle = "#fff";
  context.fillRect(0, 0, PAPER_WIDTH, geometry.height);
  for (const box of geometry.boxes) {
    const item = work.items.find(x => x.id === box.id);
    if (!item) continue;
    const rotated = (item.rotation || 0) % 180 !== 0;
    const localWidth = rotated ? box.h : box.w;
    const localHeight = rotated ? box.w : box.h;
    const local = { x: -localWidth / 2, y: -localHeight / 2, w: localWidth, h: localHeight };
    context.save();
    context.translate(box.x + box.w / 2, box.y + box.h / 2);
    context.rotate((item.rotation || 0) * Math.PI / 180);
    context.globalAlpha = normalizeOpacity(item.opacity);
    if (item.type === "text") paintText(context, item, local);
    else if (item.type === "frame") drawFrame(context, item.frameStyle, local, item.frameWidth);
    else if (item.type === "shape") drawShape(context, item, local);
    else if (item.type === "image") {
      const image = imageFor(item.src);
      if (image.complete && image.naturalWidth) {
        context.save(); context.beginPath(); context.rect(local.x, local.y, local.w, local.h); context.clip();
        context.filter = "grayscale(1)";
        const imageAspect = image.naturalWidth / image.naturalHeight, boxAspect = local.w / local.h;
        const fit = item.fit || "contain";
        if (fit === "stretch") context.drawImage(image, local.x, local.y, local.w, local.h);
        else {
          const fillWidth = fit === "cover" ? imageAspect < boxAspect : imageAspect > boxAspect;
          const w = fillWidth ? local.w : local.h * imageAspect;
          const h = fillWidth ? local.w / imageAspect : local.h;
          context.drawImage(image, local.x + (local.w - w) / 2, local.y + (local.h - h) / 2, w, h);
        }
        context.restore();
      }
    }
    context.restore();
  }
  drawLabelFrame(context, geometry.height);
}

function drawSelection(geometry) {
  const ids = new Set(work.selectedIds);
  const boxes = geometry.boxes.filter(item => ids.has(item.id));
  if (boxes.length) {
    ctx.save(); ctx.strokeStyle = "#159e80"; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    boxes.forEach(box => ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2));
    ctx.setLineDash([]);
    const bounds = selectionBounds(boxes);
    if (bounds && work.mode === "free") {
      if (boxes.length > 1) {
        ctx.strokeStyle = "#2563eb";
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
      ctx.fillStyle = "#159e80";
      ctx.fillRect(bounds.x + bounds.w - 8, bounds.y + bounds.h - 8, 13, 13);
      ctx.fillStyle = "white";
      ctx.fillRect(bounds.x + bounds.w - 4, bounds.y + bounds.h - 4, 5, 5);
    }
    ctx.restore();
  }
  if (work.drag?.operation === "marquee") {
    const area = marqueeRect(work.drag.start, work.drag.current);
    ctx.save();
    ctx.fillStyle = "rgba(37,99,235,.12)";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.strokeRect(area.x, area.y, area.w, area.h);
    ctx.restore();
  }
}

function render() {
  const geometry = layouts();
  const height = Math.max(1, Math.min(MAX_HEIGHT, Math.ceil(geometry.height)));
  if (canvas.width !== PAPER_WIDTH || canvas.height !== height) { canvas.width = PAPER_WIDTH; canvas.height = height; }
  drawArtwork(ctx, { ...geometry, height });
  drawSelection(geometry);
  $("paper-hint").classList.toggle("hidden", work.items.length > 0 || work.labelFrame !== "none");
  const mm = pxToMm(height);
  $("length-value").textContent = `${mm.toLocaleString("en-US", { maximumFractionDigits: 1 })} mm`;
  const oversized = geometry.height > MAX_HEIGHT;
  const clipped = work.mode === "free" && work.items.some(item => !item.hidden &&
    (item.x < 0 || item.y < 0 || item.x + item.w > PAPER_WIDTH || item.y + item.h > work.pageHeight));
  $("length-note").textContent = oversized ? "Print is too long. Remove or resize some items." :
    clipped ? "Some items extend outside the paper and will be clipped." : `${work.items.length} items · 53 mm · 203 DPI`;
  $("length-note").style.color = oversized ? "#f1a6a6" : clipped ? "#eebc73" : "";
  $("print-button").disabled = oversized || (work.items.length === 0 && work.labelFrame === "none") || work.busy || !work.printerPort;
  $("block-count").textContent = work.selectedIds.length > 1 ?
    `${work.selectedIds.length} selected` : `${work.items.length} items`;
  $("page-height").value = Math.round(pxToMm(work.pageHeight));
  $("page-height-range").value = Math.round(pxToMm(work.pageHeight));
  $("paper-resize").setAttribute("aria-valuenow", String(Math.round(mm)));
  updateLayers(); updateProperties(geometry);
  $("undo").disabled = work.history.length === 0;
  $("redo").disabled = work.future.length === 0;
  const hasSelected = work.selectedIds.length > 0;
  $("duplicate").disabled = !hasSelected;
  $("rotate-left").disabled = !selected();
  $("rotate-right").disabled = !selected();
}

function updateLayers() {
  const list = $("layers-list");
  list.replaceChildren();
  if (!work.items.length) {
    const empty = document.createElement("p"); empty.className = "empty-layers";
    empty.textContent = "No layers yet."; list.appendChild(empty); return;
  }
  [...work.items].reverse().forEach(item => {
    const row = document.createElement("div");
    row.className = "layer-item" + (work.selectedIds.includes(item.id) ? " active" : "");
    row.title = "Click to select · Drag to reorder · Ctrl/Shift-click to multi-select";
    row.dataset.layerId = item.id;
    row.draggable = true;
    const grip = document.createElement("span"); grip.className = "layer-grip";
    grip.textContent = "⠿"; grip.title = "Drag to reorder this layer";
    grip.addEventListener("click", event => event.stopPropagation());
    grip.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      work.pointerLayerReorder = { id: item.id, targetId: null, before: true };
      grip.setPointerCapture(event.pointerId);
      row.classList.add("dragging");
    });
    grip.addEventListener("pointermove", event => {
      if (!work.pointerLayerReorder || !grip.hasPointerCapture(event.pointerId)) return;
      document.querySelectorAll(".layer-item").forEach(element => element.classList.remove("drop-before", "drop-after"));
      const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest(".layer-item");
      const targetId = targetRow?.dataset.layerId;
      if (!targetId || targetId === item.id) {
        work.pointerLayerReorder.targetId = null;
        return;
      }
      const before = event.clientY < targetRow.getBoundingClientRect().top + targetRow.offsetHeight / 2;
      targetRow.classList.add(before ? "drop-before" : "drop-after");
      work.pointerLayerReorder.targetId = targetId;
      work.pointerLayerReorder.before = before;
    });
    const finishGripReorder = event => {
      if (!work.pointerLayerReorder || !grip.hasPointerCapture(event.pointerId)) return;
      const { id, targetId, before } = work.pointerLayerReorder;
      work.pointerLayerReorder = null;
      grip.releasePointerCapture(event.pointerId);
      document.querySelectorAll(".layer-item").forEach(element => element.classList.remove("dragging", "drop-before", "drop-after"));
      if (targetId && event.type === "pointerup") reorderLayer(id, targetId, before);
    };
    grip.addEventListener("pointerup", finishGripReorder);
    grip.addEventListener("pointercancel", finishGripReorder);
    const symbol = document.createElement("span"); symbol.className = "layer-symbol";
    symbol.textContent = ({ text: "T", frame: "▣", shape: "◇", image: "▧" })[item.type];
    const names = document.createElement("div"); names.className = "layer-text";
    const name = document.createElement("strong"); name.textContent = item.name;
    const meta = document.createElement("small"); meta.textContent = ({ text: "Text", frame: "Border", shape: "Shape", image: "Image" })[item.type];
    names.append(name, meta);
    const visibility = document.createElement("button"); visibility.type = "button";
    visibility.className = "layer-visibility"; visibility.textContent = item.hidden ? "◌" : "◉";
    visibility.title = item.hidden ? "Show layer" : "Hide layer";
    visibility.addEventListener("click", event => {
      event.stopPropagation(); checkpoint(); item.hidden = !item.hidden; render(); scheduleDraft();
    });
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "layer-delete"; remove.textContent = "×";
    remove.title = `Delete ${item.name}`; remove.setAttribute("aria-label", `Delete layer ${item.name}`);
    remove.addEventListener("click", event => {
      event.stopPropagation(); deleteLayers([item.id]);
    });
    row.append(grip, symbol, names, visibility, remove);
    row.addEventListener("dragstart", event => {
      work.reorderDragId = item.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
      row.classList.add("dragging");
    });
    row.addEventListener("dragover", event => {
      if (!work.reorderDragId || work.reorderDragId === item.id) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
      const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
      row.classList.toggle("drop-before", before);
      row.classList.toggle("drop-after", !before);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
    row.addEventListener("drop", event => {
      if (!work.reorderDragId) return;
      event.preventDefault();
      const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
      reorderLayer(work.reorderDragId, item.id, before);
      work.reorderDragId = null;
    });
    row.addEventListener("dragend", () => {
      work.reorderDragId = null;
      document.querySelectorAll(".layer-item").forEach(element => element.classList.remove("dragging", "drop-before", "drop-after"));
    });
    row.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        const ids = new Set(work.selectedIds);
        if (ids.has(item.id)) ids.delete(item.id);
        else ids.add(item.id);
        setSelection([...ids]);
      } else setSelection([item.id]);
      render();
    });
    list.appendChild(row);
  });
}

function updateProperties(geometry) {
  const item = selected();
  $("selection-properties").classList.toggle("hidden", !item);
  if (!item) return;
  const box = geometry.boxes.find(x => x.id === item.id) || item;
  $("rotation-value").textContent = `${item.rotation || 0}°`;
  for (const key of ["x", "y", "w", "h"]) {
    const input = $("prop-" + key);
    if (document.activeElement !== input) input.value = Math.round(box[key]);
    input.disabled = work.mode !== "free";
    const range = $("prop-" + key + "-range");
    const maximum = key === "x" ? PAPER_WIDTH - box.w
      : key === "y" ? work.pageHeight - box.h
      : key === "w" ? PAPER_WIDTH - box.x : work.pageHeight - box.y;
    range.max = Math.max(Number(range.min), Math.floor(maximum));
    range.value = Math.round(box[key]);
    range.disabled = work.mode !== "free";
  }
  document.querySelectorAll("[data-geometry-step]").forEach(button => {
    button.disabled = work.mode !== "free";
  });
  $("move-up").disabled = work.items.indexOf(item) === work.items.length - 1;
  $("move-down").disabled = work.items.indexOf(item) === 0;
  $("text-properties").classList.toggle("hidden", item.type !== "text");
  $("image-properties").classList.toggle("hidden", item.type !== "image");
  $("frame-properties").classList.toggle("hidden", item.type !== "frame");
  $("shape-properties").classList.toggle("hidden", item.type !== "shape");
  if (item.type === "shape") {
    $("prop-shape-kind").value = item.shapeKind;
    $("prop-shape-filled").checked = Boolean(item.shapeFilled);
    $("prop-shape-width").value = normalizeFrameWidth(item.shapeWidth);
    $("prop-shape-width-value").textContent = `${normalizeFrameWidth(item.shapeWidth)} px`;
  }
  if (item.type === "frame") {
    $("prop-frame-style").value = item.frameStyle;
    $("prop-frame-width").value = normalizeFrameWidth(item.frameWidth);
    $("prop-frame-width-value").textContent = `${normalizeFrameWidth(item.frameWidth)} px`;
  }
  const percentage = Math.round(normalizeOpacity(item.opacity) * 100);
  if (document.activeElement !== $("prop-opacity")) $("prop-opacity").value = percentage;
  $("prop-opacity-value").textContent = `${percentage}%`;
  if (item.type === "image") $("prop-image-fit").value = item.fit || "contain";
  if (item.type === "text") {
    $("prop-font-size").value = item.fontSize;
    $("prop-font-size-range").value = item.fontSize;
    $("prop-font-family").value = item.fontFamily || "modern";
    $("prop-ink-thickness").value = normalizeTextThickness(item.inkThickness);
    $("prop-ink-thickness-value").textContent = `${normalizeTextThickness(item.inkThickness)} / 5`;
    $("prop-align").value = item.align;
    document.querySelectorAll("[data-property-align]").forEach(button => {
      const active = button.dataset.propertyAlign === item.align;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("prop-bold").checked = item.bold;
  }
}

function addItem(item, position = null) {
  if (work.items.length >= MAX_ITEMS) throw Error("A design can contain up to 100 items");
  checkpoint();
  const nextY = work.items.length ? Math.max(...work.items.map(block => block.y + block.h)) + 12 : 18;
  item.id = uid(); item.hidden = false; item.opacity = normalizeOpacity(item.opacity);
  item.x = position && work.mode === "free" ? position.x : 16;
  item.y = position && work.mode === "free" ? position.y : nextY;
  item.x = Math.max(0, Math.min(PAPER_WIDTH - item.w, item.x));
  item.y = Math.max(0, Math.min(MAX_HEIGHT - item.h, item.y));
  if (work.mode === "free" && item.y + item.h + 16 > work.pageHeight)
    work.pageHeight = Math.min(MAX_HEIGHT, item.y + item.h + 16);
  work.items.push(item); setSelection([item.id]);
  render(); scheduleDraft();
}

function addText(text, atPointer = false) {
  if (!text.trim()) throw Error("Enter some text first");
  const item = { type: "text", name: text.trim().slice(0, 34), text, fontSize: Number($("font-size").value),
    fontFamily: $("text-font-family").value, align: $("text-align").value, bold: $("text-bold").checked,
    inkThickness: normalizeTextThickness($("text-ink-thickness").value),
    w: work.mode === "free" ? 290 : 352, h: 50 };
  item.h = requiredTextHeight(item);
  if (atPointer) work.pointer = atPointer;
  addItem(item, atPointer || null);
  return item;
}

function addPresetText(text, name, { size = 22, align = "left", bold = false } = {}) {
  if (!text.trim()) throw Error("Enter text first");
  const item = { type: "text", name, text, fontSize: size, fontFamily: "modern",
    align, bold, inkThickness: 4, w: work.mode === "free" ? 320 : 352, h: 50 };
  item.h = requiredTextHeight(item);
  addItem(item);
}

function formatDateTime(kind) {
  const date = new Date();
  const formats = {
    date: { year: "numeric", month: "2-digit", day: "2-digit" },
    datetime: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
    long: { year: "numeric", month: "long", day: "numeric", weekday: "long" },
    time: { hour: "2-digit", minute: "2-digit" }
  };
  return new Intl.DateTimeFormat(undefined, formats[kind] || formats.datetime).format(date);
}

function addShape() {
  const kind = $("shape-kind").value;
  if (!Object.hasOwn(SHAPE_NAMES, kind)) throw Error("Choose a shape");
  if (work.mode !== "free") switchMode("free");
  const isLine = kind === "line" || kind === "arrow";
  const item = { type: "shape", name: SHAPE_NAMES[kind], shapeKind: kind,
    shapeWidth: normalizeFrameWidth($("shape-width").value),
    shapeFilled: $("shape-filled").checked, rotation: 0, opacity: 1,
    w: isLine ? 250 : 180, h: isLine ? 45 : 115 };
  addItem(item, { x: 60, y: Math.min(50, Math.max(0, work.pageHeight - item.h)) });
}

function syncLabelControls() {
  document.querySelectorAll("[data-label-size]").forEach(button => {
    const active = button.dataset.labelSize === work.labelSize;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-label-frame]").forEach(button => {
    const active = button.dataset.labelFrame === work.labelFrameChoice;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("label-font").value = work.labelFont;
  $("label-frame-width").value = work.labelFrameWidth;
  $("label-frame-width-value").textContent = `${work.labelFrameWidth} px`;
  $("label-note").textContent = work.labelDesign ?
    "Size and frame changes update this label. Select any text layer to adjust its typography." :
    "Preset sizes use a 50 mm design area on 53 mm continuous paper. They are not precut-sticker calibration.";
}

function fitLabelTextInside(item) {
  item.fontSize = item.baseFontSize || item.fontSize;
  while (item.fontSize > 10 && requiredTextHeight(item) > item.h) item.fontSize -= 1;
  return requiredTextHeight(item) <= item.h;
}

function layoutLabelTextItems(items, pageHeight) {
  const title = items.find(item => item.labelRole === "title");
  const subtitle = items.find(item => item.labelRole === "subtitle");
  const titleHeight = Math.max(90, Math.round(pageHeight * 0.23));
  const subtitleHeight = 44, gap = 8;
  const total = (title ? titleHeight : 0) + (title && subtitle ? gap : 0) +
    (subtitle ? subtitleHeight : 0);
  let y = Math.round((pageHeight - total) / 2);
  for (const [item, height] of [[title, titleHeight], [subtitle, subtitleHeight]]) {
    if (!item) continue;
    Object.assign(item, { x: 31, y, w: 322, h: height });
    fitLabelTextInside(item);
    y += height + gap;
  }
}

function setLabelSize(size) {
  if (!Object.hasOwn(LABEL_SIZES, size)) return;
  if (work.labelDesign && work.mode === "free") {
    checkpoint();
    const oldHeight = work.pageHeight;
    const newHeight = mmToPx(LABEL_SIZES[size].heightMm);
    const shift = Math.round((newHeight - oldHeight) / 2);
    work.items.filter(item => !item.labelRole).forEach(item => {
      Object.assign(item, clampBox({ ...item, y: item.y + shift }, newHeight));
    });
    work.pageHeight = newHeight;
    layoutLabelTextItems(work.items, newHeight);
    render(); scheduleDraft();
  }
  work.labelSize = size;
  syncLabelControls();
}

function setLabelFrame(frame) {
  if (!LABEL_FRAMES.includes(frame)) return;
  work.labelFrameChoice = frame;
  if (work.labelDesign) {
    checkpoint(); work.labelFrame = frame; render(); scheduleDraft();
  }
  syncLabelControls();
}

function addFrameLayer() {
  finishInlineEdit();
  if (work.labelFrameChoice === "none") {
    toast("Choose a frame style before adding a layer", true); return;
  }
  if (work.mode !== "free") switchMode("free");
  const height = Math.max(60, Math.min(work.pageHeight - 52, mmToPx(80) - 52));
  const item = { type: "frame", name: `${FRAME_NAMES[work.labelFrameChoice]} frame`,
    frameStyle: work.labelFrameChoice, frameWidth: work.labelFrameWidth,
    rotation: 0, opacity: 1, w: PAPER_WIDTH - 54, h: height };
  addItem(item, { x: 27, y: Math.round((work.pageHeight - height) / 2) });
  toast("Frame layer added. Move its edge or edit its style in Layers.");
}

function setupShapeProperties() {
  const panel = document.createElement("div");
  panel.id = "shape-properties";
  panel.className = "shape-properties hidden";
  panel.innerHTML = `
    <label for="prop-shape-kind">Shape</label>
    <select id="prop-shape-kind">
      <option value="rectangle">Rectangle</option><option value="rounded">Rounded rectangle</option>
      <option value="ellipse">Ellipse</option><option value="line">Line</option>
      <option value="arrow">Arrow</option><option value="diamond">Diamond</option>
      <option value="star">Star</option>
    </select>
    <label class="check-row"><input type="checkbox" id="prop-shape-filled"> Filled</label>
    <div class="thickness-control"><div class="thickness-heading">
      <label for="prop-shape-width">Line width</label><output id="prop-shape-width-value">3 px</output>
    </div><input id="prop-shape-width" type="range" min="1" max="7" step="0.5" value="3"></div>`;
  $("frame-properties").after(panel);
}

function createLabel() {
  const title = $("label-title").value.trim().slice(0, 90);
  const subtitle = $("label-subtitle").value.trim().slice(0, 140);
  if (!title && !subtitle) { toast("Enter a title or secondary line for your label", true); return; }
  if (work.items.length && !window.confirm("Replace the current design with a new label?")) return;
  finishInlineEdit(); checkpoint();
  const preset = LABEL_SIZES[work.labelSize];
  work.mode = "free";
  work.pageHeight = mmToPx(preset.heightMm);
  work.labelFrame = work.labelFrameChoice;
  work.labelDesign = true;
  const items = [];
  function lineItem(text, role, size, bold) {
    const item = { id: uid(), type: "text", name: text.slice(0, 34), text,
      x: 31, y: 0, w: 322, h: 90, rotation: 0, hidden: false,
      fontSize: size, baseFontSize: size, labelRole: role, centerVertically: true,
      inkThickness: role === "subtitle" ? 4 : 3,
      fontFamily: work.labelFont, align: "center", bold };
    items.push(item);
  }
  if (title) lineItem(title, "title", work.labelSize === "compact" ? 35 : 42, true);
  if (subtitle) lineItem(subtitle, "subtitle", 21, false);
  layoutLabelTextItems(items, work.pageHeight);
  work.items = items;
  setSelection([]);
  syncMode(); syncLabelControls(); render(); scheduleDraft();
  toast(`${preset.widthMm} × ${preset.heightMm} mm label ready. Edit text directly on the paper.`);
}

function selectTool(tool) {
  work.tool = tool;
  document.querySelectorAll(".tool-tab").forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
  document.querySelectorAll(".tool-panel").forEach(panel => panel.classList.toggle("hidden", panel.dataset.panel !== tool));
}

function setFreeTool(tool) {
  work.freeTool = tool;
  for (const key of ["select", "text", "image"]) $("free-" + key).classList.toggle("active", key === tool);
  canvas.style.cursor = tool === "select" ? "default" : "crosshair";
}

function syncMode() {
  document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === work.mode));
  $("free-toolbar").classList.toggle("hidden", work.mode !== "free");
  $("paper").classList.toggle("free", work.mode === "free");
  setFreeTool("select");
}

function switchMode(mode) {
  if (mode === work.mode) return;
  finishInlineEdit(); checkpoint();
  if (mode === "free") {
    const previous = layouts();
    for (const box of previous.boxes) {
      const item = work.items.find(entry => entry.id === box.id);
      if (item) Object.assign(item, { x: box.x, y: box.y, w: box.w, h: box.h });
    }
    work.pageHeight = Math.min(MAX_HEIGHT, Math.max(mmToPx(20), previous.height));
  }
  work.mode = mode;
  syncMode(); render(); scheduleDraft();
}

function rotateSelected(quarterTurns) {
  finishInlineEdit();
  const item = selected(); if (!item) return;
  checkpoint();
  const transformed = rotateBox(item, quarterTurns);
  if (work.mode === "free") {
    work.pageHeight = Math.min(MAX_HEIGHT, Math.max(work.pageHeight, transformed.y + transformed.h + 16));
    Object.assign(item, clampBox(transformed, work.pageHeight));
  } else {
    item.w = transformed.w; item.h = transformed.h;
  }
  item.rotation = transformed.rotation;
  render(); scheduleDraft();
}

function reorderSelected(direction) {
  const index = work.items.findIndex(item => item.id === work.selectedId);
  const other = index + direction;
  if (index < 0 || other < 0 || other >= work.items.length) return;
  checkpoint(); [work.items[index], work.items[other]] = [work.items[other], work.items[index]];
  render(); scheduleDraft();
}

function reorderLayer(movingId, targetId, beforeTarget) {
  if (movingId === targetId) return;
  const displayed = [...work.items].reverse();
  const moving = displayed.find(item => item.id === movingId);
  if (!moving) return;
  const remaining = displayed.filter(item => item.id !== movingId);
  const target = remaining.findIndex(item => item.id === targetId);
  if (target < 0) return;
  remaining.splice(target + (beforeTarget ? 0 : 1), 0, moving);
  if (displayed.every((item, index) => item.id === remaining[index].id)) return;
  checkpoint(); work.items = remaining.reverse();
  render(); scheduleDraft();
}

function centerSelection(axis = "both") {
  if (!work.selectedIds.length) return;
  finishInlineEdit();
  if (work.mode !== "free") switchMode("free");
  const layers = selectedItems();
  const bounds = selectionBounds(layers);
  if (!bounds) return;
  const dx = Math.round((PAPER_WIDTH - bounds.w) / 2 - bounds.x);
  const dy = axis === "both" ? Math.round((work.pageHeight - bounds.h) / 2 - bounds.y) : 0;
  if (dx === 0 && dy === 0) return;
  checkpoint();
  for (const layer of layers) {
    layer.x = Math.max(0, Math.min(PAPER_WIDTH - layer.w, layer.x + dx));
    layer.y = Math.max(0, Math.min(work.pageHeight - layer.h, layer.y + dy));
  }
  render(); scheduleDraft();
}

function deleteLayers(ids) {
  const removing = new Set(ids);
  if (!work.items.some(item => removing.has(item.id))) return;
  finishInlineEdit(); checkpoint();
  work.items = work.items.filter(item => !removing.has(item.id));
  setSelection(work.selectedIds.filter(id => !removing.has(id)));
  render(); scheduleDraft();
}
function deleteSelected() {
  deleteLayers(work.selectedIds);
}

function duplicateSelected() {
  if (work.selectedIds.length > 1) {
    const originals = selectedItems();
    if (work.items.length + originals.length > MAX_ITEMS) { toast("Maximum 100 layers", true); return; }
    checkpoint();
    const ids = [];
    for (const item of originals) {
      const copy = cloneItem(item);
      copy.id = uid(); copy.name = `${item.name} copy`;
      copy.x = Math.min(PAPER_WIDTH - copy.w, item.x + 14);
      copy.y = Math.min(MAX_HEIGHT - copy.h, item.y + 14);
      work.items.push(copy); ids.push(copy.id);
    }
    if (work.mode === "free") {
      const lowest = Math.max(...work.items.filter(item => ids.includes(item.id)).map(item => item.y + item.h));
      work.pageHeight = Math.min(MAX_HEIGHT, Math.max(work.pageHeight, lowest + 16));
    }
    setSelection(ids); render(); scheduleDraft(); return;
  }
  const item = selected(); if (!item) return;
  const copy = cloneItem(item);
  copy.name = `${item.name} copy`; copy.x = Math.min(PAPER_WIDTH - copy.w, item.x + 18);
  copy.y = Math.min(MAX_HEIGHT - copy.h, item.y + 18);
  addItem(copy, work.mode === "free" ? { x: copy.x, y: copy.y } : null);
}

function undo() {
  if (!work.history.length) return;
  finishInlineEdit(); work.future.push(JSON.stringify(projectData()));
  const state = JSON.parse(work.history.pop());
  const earlier = work.history.slice(); const later = work.future.slice();
  restoreData(state); work.history = earlier; work.future = later; render(); scheduleDraft();
}
function redo() {
  if (!work.future.length) return;
  finishInlineEdit(); work.history.push(JSON.stringify(projectData()));
  const state = JSON.parse(work.future.pop());
  const earlier = work.history.slice(); const later = work.future.slice();
  restoreData(state); work.history = earlier; work.future = later; render(); scheduleDraft();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * PAPER_WIDTH / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height };
}
function hitTest(position) {
  const boxes = layouts().boxes;
  return [...boxes].reverse().find(box => {
    if (position.x < box.x || position.x > box.x + box.w ||
        position.y < box.y || position.y > box.y + box.h) return false;
    const item = work.items.find(layer => layer.id === box.id);
    if (item?.type !== "frame" && !(item?.type === "shape" && !item.shapeFilled && !["line", "arrow"].includes(item.shapeKind))) return true;
    // A transparent frame must not steal clicks from images and text inside it.
    const edge = 15;
    return position.x - box.x < edge || box.x + box.w - position.x < edge ||
      position.y - box.y < edge || box.y + box.h - position.y < edge;
  }) || null;
}

function beginInlineEdit(item) {
  if (!item || item.type !== "text") return;
  finishInlineEdit();
  const box = layouts().boxes.find(entry => entry.id === item.id);
  if (!box) return;
  const editor = $("inline-text");
  const scale = canvas.getBoundingClientRect().width / PAPER_WIDTH;
  const rotated = (item.rotation || 0) % 180 !== 0;
  editor.value = item.text;
  editor.style.left = `${(box.x + box.w / 2) * scale}px`;
  editor.style.top = `${(box.y + box.h / 2) * scale}px`;
  editor.style.width = `${(rotated ? box.h : box.w) * scale}px`;
  editor.style.height = `${Math.max(40, (rotated ? box.w : box.h) * scale)}px`;
  editor.style.transform = `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`;
  editor.style.font = fontStyle({ ...item, fontSize: item.fontSize * scale });
  editor.style.textAlign = item.align;
  editor.classList.remove("hidden");
  work.inlineId = item.id;
  editor.focus(); editor.select();
}
function finishInlineEdit(cancel = false) {
  if (!work.inlineId) return;
  const id = work.inlineId; work.inlineId = null;
  const editor = $("inline-text"); editor.classList.add("hidden");
  const item = work.items.find(block => block.id === id);
  if (!cancel && item && item.text !== editor.value) {
    checkpoint(); item.text = editor.value; item.name = editor.value.trim().slice(0, 34) || "Text";
    if (item.labelRole) fitLabelTextInside(item);
    else fitTextToBox(item);
    scheduleDraft();
  }
  render();
}

function pointerDown(event) {
  if (work.inlineId) finishInlineEdit();
  if (event.button !== 0) return;
  const pos = pointerPosition(event);
  work.pointer = { x: Math.round(pos.x), y: Math.round(pos.y) };
  if (work.mode === "free" && work.freeTool === "text") {
    const item = addText("New text", work.pointer);
    setFreeTool("select"); beginInlineEdit(item); return;
  }
  if (work.mode === "free" && work.freeTool === "image") {
    work.imagePickerAutoAdd = true; $("image-file").click(); setFreeTool("select"); return;
  }
  const visible = layouts().boxes;
  const active = visible.filter(box => work.selectedIds.includes(box.id));
  const bounds = selectionBounds(active);
  const groupHandle = work.mode === "free" && active.length > 1 && bounds &&
    Math.abs(pos.x - (bounds.x + bounds.w)) < 15 &&
    Math.abs(pos.y - (bounds.y + bounds.h)) < 15;
  const currentBox = visible.find(box => box.id === work.selectedId);
  const singleHandle = work.mode === "free" && currentBox &&
    Math.abs(pos.x - (currentBox.x + currentBox.w)) < 15 &&
    Math.abs(pos.y - (currentBox.y + currentBox.h)) < 15;
  const hit = groupHandle ? active[0] : singleHandle ? currentBox : hitTest(pos);
  if (event.shiftKey && hit && !groupHandle && !singleHandle) {
    const ids = new Set(work.selectedIds);
    if (ids.has(hit.id)) ids.delete(hit.id);
    else ids.add(hit.id);
    setSelection([...ids]); render(); return;
  }
  if (!hit) {
    const baseIds = event.shiftKey ? [...work.selectedIds] : [];
    setSelection(baseIds);
    if (work.mode === "free") {
      work.drag = { operation: "marquee", start: pos, current: pos, baseIds };
      canvas.setPointerCapture(event.pointerId);
    }
    render(); return;
  }
  if (!groupHandle && !work.selectedIds.includes(hit.id)) setSelection([hit.id]);
  render();
  if (work.mode !== "free") return;
  const ids = work.selectedIds;
  const boxes = visible.filter(box => ids.includes(box.id));
  work.drag = { start: pos, initialBoxes: boxes.map(box => ({ ...box })),
    initialFonts: new Map(selectedItems().map(item => [item.id, item.fontSize])),
    operation: groupHandle || singleHandle ? "resize" : "move",
    changed: false, checkpointed: false };
  canvas.setPointerCapture(event.pointerId);
}
function stagePointerDown(event) {
  const stage = $("canvas-stage");
  if (event.target !== stage || event.button !== 0 || work.mode !== "free" || work.freeTool !== "select") return;
  const baseIds = event.shiftKey ? [...work.selectedIds] : [];
  const position = pointerPosition(event);
  setSelection(baseIds);
  work.drag = { operation: "marquee", start: position, current: position, baseIds };
  stage.setPointerCapture(event.pointerId);
  render();
}
function stagePointerMove(event) {
  if ($("canvas-stage").hasPointerCapture(event.pointerId) && work.drag?.operation === "marquee") pointerMove(event);
}
function stagePointerUp(event) {
  const stage = $("canvas-stage");
  if (!stage.hasPointerCapture(event.pointerId)) return;
  pointerUp(event);
  stage.releasePointerCapture(event.pointerId);
}
function pointerMove(event) {
  if (!work.drag) return;
  const pos = pointerPosition(event);
  if (work.drag.operation === "marquee") {
    work.drag.current = pos;
    const rect = marqueeRect(work.drag.start, pos);
    setSelection([...work.drag.baseIds, ...marqueeHits(layouts().boxes, rect)]);
    render(); return;
  }
  const dx = pos.x - work.drag.start.x, dy = pos.y - work.drag.start.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && !work.drag.changed) return;
  if (!work.drag.checkpointed) { checkpoint(); work.drag.checkpointed = true; }
  work.drag.changed = true;
  const originals = work.drag.initialBoxes;
  if (originals.length > 1) {
    const transformed = transformSelection(originals, work.drag.operation, dx, dy, work.pageHeight);
    const oldBounds = selectionBounds(originals);
    const newBounds = selectionBounds(transformed);
    const fontScale = work.drag.operation === "resize" ?
      Math.min(newBounds.w / oldBounds.w, newBounds.h / oldBounds.h) : 1;
    for (const box of transformed) {
      const item = work.items.find(entry => entry.id === box.id);
      if (!item) continue;
      Object.assign(item, { x: box.x, y: box.y, w: box.w, h: box.h });
      if (item.type === "text" && work.drag.operation === "resize") {
        item.fontSize = Math.max(8, Math.min(100, Math.round(work.drag.initialFonts.get(item.id) * fontScale)));
        if (item.labelRole) item.baseFontSize = item.fontSize;
      }
    }
  } else if (originals.length === 1) {
    const original = originals[0];
    const item = work.items.find(entry => entry.id === original.id);
    if (!item) return;
    const values = work.drag.operation === "resize" ?
      { x: original.x, y: original.y, w: Math.max(25, original.w + dx), h: Math.max(25, original.h + dy) } :
      { x: original.x + dx, y: original.y + dy, w: original.w, h: original.h };
    Object.assign(item, clampBox(values, work.pageHeight));
  }
  render();
}
function pointerUp(event) {
  if (!work.drag) return;
  const movedArtwork = work.drag.operation !== "marquee";
  work.drag = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  render();
  if (movedArtwork) scheduleDraft();
}

function paperResizeDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  finishInlineEdit();
  if (work.mode !== "free") switchMode("free");
  work.paperDrag = {
    startY: event.clientY, startHeight: work.pageHeight,
    scale: canvas.getBoundingClientRect().width / PAPER_WIDTH, checkpointed: false
  };
  $("paper-resize").setPointerCapture(event.pointerId);
  $("paper-resize").classList.add("dragging");
}

function paperResizeMove(event) {
  if (!work.paperDrag) return;
  const state = work.paperDrag;
  const target = Math.max(mmToPx(20), Math.min(MAX_HEIGHT,
    Math.round(state.startHeight + (event.clientY - state.startY) / state.scale)));
  if (target === work.pageHeight) return;
  if (!state.checkpointed) { checkpoint(); state.checkpointed = true; }
  work.pageHeight = target; render();
}

function paperResizeUp(event) {
  if (!work.paperDrag) return;
  work.paperDrag = null;
  const grip = $("paper-resize");
  if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
  grip.classList.remove("dragging"); scheduleDraft();
}

async function normalizedImage(file) {
  if (!(file instanceof Blob)) throw Error("Choose an image first");
  if (file.size > 10 * 1024 * 1024) throw Error("Image must be smaller than 10 MB");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1200 / bitmap.width, 5000 / bitmap.height);
  const buffer = document.createElement("canvas");
  buffer.width = Math.max(1, Math.round(bitmap.width * ratio));
  buffer.height = Math.max(1, Math.round(bitmap.height * ratio));
  const bufferCtx = buffer.getContext("2d");
  bufferCtx.fillStyle = "white"; bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
  bufferCtx.drawImage(bitmap, 0, 0, buffer.width, buffer.height);
  bitmap.close?.();
  return { src: buffer.toDataURL("image/jpeg", .93), width: buffer.width, height: buffer.height };
}

async function addImageFile(file, name, position = null) {
  const image = await normalizedImage(file);
  const width = work.mode === "free" ? 300 : 352;
  const height = Math.max(20, Math.round(width * image.height / image.width));
  const item = { type: "image", name: name || "Image", src: image.src, w: width,
    h: Math.min(MAX_HEIGHT, height), fit: "contain" };
  addItem(item, position);
}

async function fromServerPreview(body) {
  const response = await apiError(await fetch("/api/preview", { method: "POST", body }));
  const png = await response.blob();
  const image = await createImageBitmap(png);
  const size = { width: image.width, height: image.height };
  image.close?.();
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("Could not read image")); reader.readAsDataURL(png);
  });
  return { src: data, ...size, headers: response.headers };
}

async function addPdf() {
  if (!work.pdfFile) throw Error("Choose a PDF first");
  const body = new FormData(); body.append("kind", "pdf");
  body.append("file", work.pdfFile, work.pdfFile.name);
  body.append("pdf_mode", $("pdf-mode").value); body.append("pages", $("pdf-pages").value);
  body.append("ocr", String($("pdf-ocr").checked));
  body.append("segment", String(work.pdfSegment));
  const data = await fromServerPreview(body);
  work.pdfTotal = Math.max(1, Number(data.headers.get("X-Total-Segments") || 1));
  const width = work.mode === "free" ? 350 : 352;
  addItem({ type: "image", name: `PDF · Segment ${work.pdfSegment + 1}/${work.pdfTotal}`,
    src: data.src, w: width, h: Math.min(MAX_HEIGHT, Math.round(data.height * width / data.width)), fit: "contain" });
  if (work.pdfSegment + 1 < work.pdfTotal) work.pdfSegment++;
  updatePdfLabel();
}

async function addQr() {
  const value = $("qr-value").value.trim();
  if (!value) throw Error("Enter QR code content");
  const body = new FormData(); body.append("kind", "qr"); body.append("qr_value", value);
  // Tight square preview: no baked-in receipt-sized white margins or caption.
  body.append("compact", "true");
  const data = await fromServerPreview(body);
  const width = work.mode === "free" ? 280 : 352;
  addItem({ type: "image", name: "QR · " + value.slice(0, 25), src: data.src,
    w: width, h: Math.round(data.height * width / data.width), fit: "contain" });
}

async function addBarcode() {
  const value = $("barcode-value").value.trim();
  if (!value) throw Error("Enter barcode data first");
  const symbology = $("barcode-type").value;
  const body = new FormData();
  body.append("kind", "barcode"); body.append("barcode_value", value);
  body.append("barcode_type", symbology);
  body.append("barcode_caption", String($("barcode-caption").checked));
  const data = await fromServerPreview(body);
  const width = work.mode === "free" ? 340 : 352;
  addItem({ type: "image", name: `${symbology === "ean13" ? "EAN-13" : "Code 128"} · ${value.slice(0, 22)}`,
    src: data.src, w: width, h: Math.round(data.height * width / data.width), fit: "contain" });
  toast("Barcode added. Keep bars wide enough for reliable scanning on paper.");
}

function updatePdfLabel() {
  $("pdf-part-label").textContent = `Segment ${work.pdfSegment + 1} / ${work.pdfTotal || "?"}`;
  $("pdf-prev").disabled = work.pdfSegment <= 0;
  $("pdf-next").disabled = work.pdfSegment >= work.pdfTotal - 1;
}

function rasterCanvas() {
  const geometry = layouts();
  if (geometry.height > MAX_HEIGHT || geometry.height < 1) throw Error("Print length limit exceeded");
  const output = document.createElement("canvas"); output.width = PAPER_WIDTH; output.height = Math.ceil(geometry.height);
  drawArtwork(output.getContext("2d", { alpha: false }), geometry);
  return output;
}
async function waitForImages() {
  await Promise.all(work.items.filter(item => item.type === "image" && !item.hidden).map(item => new Promise((resolve, reject) => {
    const image = imageFor(item.src);
    if (image.complete) { image.naturalWidth ? resolve() : reject(Error("Could not load image")); return; }
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(Error("Could not load image")), { once: true });
  })));
}
function pngBlob() {
  return waitForImages().then(() => new Promise((resolve, reject) =>
    rasterCanvas().toBlob(blob => blob ? resolve(blob) : reject(Error("Could not create PNG")), "image/png")));
}
async function downloadPng() {
  if (!work.items.length && work.labelFrame === "none") { toast("Add an item first", true); return; }
  try {
    const blob = await pngBlob();
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `t02-print-${Date.now()}.png`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (error) { toast(error.message, true); }
}

async function printNow() {
  if ((!work.items.length && work.labelFrame === "none") || work.busy) return;
  const mm = Math.round(pxToMm(layouts().height));
  if (mm >= 300 && !window.confirm(`This design will use about ${mm} mm of paper. Print it?`)) return;
  const printButton = $("print-button");
  const idleLabel = printButton.innerHTML;
  work.busy = true; render(); $("print-button").textContent = "Sending...";
  try {
    const blob = await pngBlob();
    const body = new FormData(); body.append("kind", "image");
    body.append("file", blob, "t02-composite.png");
    body.append("image_mode", "fit"); body.append("dither", "true"); body.append("density", "50");
    body.append("printer_port", work.printerPort);
    body.append("job_id", createUuidV4());
    const response = await apiError(await fetch("/api/print", { method: "POST", body }));
    const result = await response.json();
    toast(`${result.length_mm} mm sent to ${result.port}. Check your paper before printing again.`);
  } catch (error) { toast(error.message + " Check the printer before retrying.", true); }
  finally { work.busy = false; printButton.innerHTML = idleLabel; render(); }
}
function createUuidV4() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function discoverPrinters() {
  const select = $("printer-select");
  const refresh = $("discover-printers");
  refresh.disabled = true;
  $("printer-status").textContent = "Scanning paired serial ports…";
  try {
    const response = await apiError(await fetch("/api/printers", { cache: "no-store" }));
    const data = await response.json();
    work.printers = Array.isArray(data.ports) ? data.ports : [];
    const discovered = new Set(work.printers.map(printer => printer.port));
    let savedPort = "";
    try { savedPort = localStorage.getItem("t02-printer-port") || ""; } catch { /* Optional. */ }
    let port = [work.printerPort, savedPort, data.configured_port].find(value => discovered.has(value)) || "";
    if (!port) {
      const identified = work.printers.filter(printer => printer.likely_printer);
      const bluetooth = work.printers.filter(printer => printer.transport === "Bluetooth");
      if (identified.length === 1) port = identified[0].port;
      else if (bluetooth.length === 1) port = bluetooth[0].port;
    }
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = work.printers.length ? "Select a printer port" : "No paired serial ports found";
    select.appendChild(placeholder);
    for (const item of work.printers) {
      const option = document.createElement("option");
      option.value = item.port;
      option.textContent = `${item.likely_printer ? "★ " : ""}${item.port} · ${item.description} (${item.transport})`;
      select.appendChild(option);
    }
    select.disabled = work.printers.length === 0;
    select.value = port;
    work.printerPort = port;
    $("printer-help").textContent = work.printers.length ?
      "Only paired OS serial ports appear here. Choose the printer's outgoing Bluetooth COM port." :
      "Pair the printer in Windows Bluetooth settings, then rescan. Nearby unpaired devices are not scanned.";
    $("printer-status").textContent = port ? `${port} selected · not physically verified` : "Choose a port to enable printing";
    $("status-led").className = port ? "good" : "bad";
  } catch {
    work.printerPort = ""; work.printers = [];
    select.replaceChildren(new Option("Discovery unavailable", ""));
    select.disabled = true;
    $("printer-status").textContent = "Cannot reach printer discovery";
    $("status-led").className = "bad";
  } finally { refresh.disabled = false; render(); }
}

function attachFileInput(inputId, dropId, onFile) {
  const input = $(inputId), drop = $(dropId);
  input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); });
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", event => {
    event.preventDefault(); drop.classList.remove("over");
    if (event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]);
  });
}

function bind() {
  document.querySelectorAll(".tool-tab").forEach(button => button.addEventListener("click", () => selectTool(button.dataset.tool)));
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => switchMode(button.dataset.mode)));
  document.querySelectorAll("[data-label-size]").forEach(button => button.addEventListener("click", () => setLabelSize(button.dataset.labelSize)));
  document.querySelectorAll("[data-label-frame]").forEach(button => button.addEventListener("click", () => setLabelFrame(button.dataset.labelFrame)));
  let frameWidthEditing = false;
  $("label-frame-width").addEventListener("input", () => {
    const value = normalizeFrameWidth($("label-frame-width").value);
    if (value === work.labelFrameWidth) return;
    if (!frameWidthEditing) { checkpoint(); frameWidthEditing = true; }
    work.labelFrameWidth = value;
    $("label-frame-width-value").textContent = `${value} px`;
    render(); scheduleDraft();
  });
  for (const event of ["change", "blur"]) $("label-frame-width").addEventListener(event, () => { frameWidthEditing = false; });
  $("add-frame").addEventListener("click", () => {
    try { addFrameLayer(); } catch (error) { toast(error.message, true); }
  });
  $("label-font").addEventListener("change", () => {
    const font = $("label-font").value;
    if (!Object.hasOwn(FONT_STACKS, font)) return;
    if (work.labelDesign) {
      checkpoint(); work.items.filter(item => item.type === "text" && item.labelRole).forEach(item => {
        item.fontFamily = font; fitLabelTextInside(item);
      });
      render(); scheduleDraft();
    }
    work.labelFont = font;
    syncLabelControls();
  });
  $("create-label").addEventListener("click", createLabel);
  $("font-size").addEventListener("input", () => $("font-size-output").textContent = `${$("font-size").value} px`);
  $("text-ink-thickness").addEventListener("input", () => {
    $("text-ink-thickness-value").textContent = `${$("text-ink-thickness").value} / 5`;
  });
  $("add-text").addEventListener("click", () => { try { addText($("text-input").value); } catch (error) { toast(error.message, true); } });
  attachFileInput("image-file", "image-drop", file => {
    work.imageFile = file; $("image-name").textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
    if (work.imagePickerAutoAdd) {
      work.imagePickerAutoAdd = false;
      addImageFile(file, file.name, { ...work.pointer }).catch(error => toast(error.message, true));
    }
  });
  $("add-image").addEventListener("click", () => addImageFile(work.imageFile, work.imageFile?.name).catch(error => toast(error.message, true)));
  attachFileInput("pdf-file", "pdf-drop", file => {
    work.pdfFile = file; work.pdfSegment = 0; work.pdfTotal = 1;
    $("pdf-name").textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`; updatePdfLabel();
  });
  for (const id of ["pdf-mode", "pdf-pages"]) $(id).addEventListener("change", () => {
    work.pdfSegment = 0; work.pdfTotal = 1; updatePdfLabel();
  });
  $("pdf-prev").addEventListener("click", () => { work.pdfSegment = Math.max(0, work.pdfSegment - 1); updatePdfLabel(); });
  $("pdf-next").addEventListener("click", () => { work.pdfSegment = Math.min(work.pdfTotal - 1, work.pdfSegment + 1); updatePdfLabel(); });
  $("add-pdf").addEventListener("click", () => addPdf().catch(error => toast(error.message, true)));
  $("add-qr").addEventListener("click", () => addQr().catch(error => toast(error.message, true)));
  $("add-barcode").addEventListener("click", () => addBarcode().catch(error => toast(error.message, true)));
  $("add-address").addEventListener("click", () => {
    const address = $("address-value").value.trim();
    try { addPresetText(address, "Address · " + address.split("\n")[0].slice(0, 25), { size: 22 }); }
    catch (error) { toast(error.message, true); }
  });
  $("add-datetime").addEventListener("click", () => {
    try {
      const prefix = $("datetime-prefix").value.trim();
      addPresetText(`${prefix}${prefix ? " " : ""}${formatDateTime($("datetime-format").value)}`,
        "Date / time", { size: 22 });
    } catch (error) { toast(error.message, true); }
  });
  $("shape-width").addEventListener("input", () => {
    $("shape-width-value").textContent = `${normalizeFrameWidth($("shape-width").value)} px`;
  });
  $("add-shape").addEventListener("click", () => { try { addShape(); } catch (error) { toast(error.message, true); } });
  $("border-width").addEventListener("input", () => {
    $("border-width-value").textContent = `${normalizeFrameWidth($("border-width").value)} px`;
  });
  $("add-border").addEventListener("click", () => {
    try {
      work.labelFrameChoice = $("border-style").value;
      work.labelFrameWidth = normalizeFrameWidth($("border-width").value);
      syncLabelControls(); addFrameLayer();
    } catch (error) { toast(error.message, true); }
  });
  for (const tool of ["select", "text", "image"]) $("free-" + tool).addEventListener("click", () => setFreeTool(tool));
  for (const id of ["page-height", "page-height-range"]) $(id).addEventListener("change", () => {
    const mm = Math.max(20, Math.min(999, Number($(id).value) || 150));
    checkpoint(); work.pageHeight = mmToPx(mm); render(); scheduleDraft();
  });
  $("fit-height").addEventListener("click", () => {
    checkpoint(); work.pageHeight = Math.min(MAX_HEIGHT, Math.max(mmToPx(20), ...work.items.map(item => item.y + item.h + 20)));
    render(); scheduleDraft();
  });
  for (const key of ["x", "y", "w", "h"]) $("prop-" + key).addEventListener("change", () => {
    const item = selected(); if (!item || work.mode !== "free") return;
    checkpoint(); const box = { x: item.x, y: item.y, w: item.w, h: item.h };
    box[key] = Number($("prop-" + key).value) || 0;
    Object.assign(item, clampBox(box, work.pageHeight)); render(); scheduleDraft();
  });
  let geometryEditing = null;
  for (const key of ["x", "y", "w", "h"]) {
    const slider = $("prop-" + key + "-range");
    slider.addEventListener("input", () => {
      const item = selected(); if (!item || work.mode !== "free") return;
      const value = Number(slider.value);
      if (item[key] === value) return;
      const id = item.id + ":" + key;
      if (geometryEditing !== id) { checkpoint(); geometryEditing = id; }
      const box = { x: item.x, y: item.y, w: item.w, h: item.h, [key]: value };
      Object.assign(item, clampBox(box, work.pageHeight)); render(); scheduleDraft();
    });
    for (const event of ["change", "blur", "pointerup", "pointercancel"]) {
      slider.addEventListener(event, () => { geometryEditing = null; });
    }
  }
  document.querySelectorAll("[data-geometry-step]").forEach(button => button.addEventListener("click", event => {
    const item = selected(); if (!item || work.mode !== "free") return;
    const [key, sign] = button.dataset.geometryStep.split(":");
    const input = $("prop-" + key);
    const step = event.shiftKey ? 10 : 1;
    input.value = (Number(input.value) || 0) + Number(sign) * step;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }));
  let opacityEditingId = null;
  $("prop-opacity").addEventListener("input", () => {
    const item = selected(); if (!item) return;
    const opacity = normalizeOpacity(Number($("prop-opacity").value) / 100);
    if (item.opacity === opacity) return;
    if (opacityEditingId !== item.id) { checkpoint(); opacityEditingId = item.id; }
    item.opacity = opacity;
    $("prop-opacity-value").textContent = `${Math.round(opacity * 100)}%`;
    render(); scheduleDraft();
  });
  for (const event of ["change", "blur"]) $("prop-opacity").addEventListener(event, () => { opacityEditingId = null; });
  function bindSelectedThickness(id, key, normalize) {
    let editingId = null;
    const input = $(id);
    input.addEventListener("input", () => {
      const item = selected(); if (!item) return;
      const value = normalize(input.value);
      if (item[key] === value) return;
      if (editingId !== item.id) { checkpoint(); editingId = item.id; }
      item[key] = value; render(); scheduleDraft();
    });
    for (const event of ["change", "blur"]) input.addEventListener(event, () => { editingId = null; });
  }
  bindSelectedThickness("prop-ink-thickness", "inkThickness", normalizeTextThickness);
  bindSelectedThickness("prop-frame-width", "frameWidth", normalizeFrameWidth);
  bindSelectedThickness("prop-shape-width", "shapeWidth", normalizeFrameWidth);
  let fontSizeEditingId = null;
  const fontSlider = $("prop-font-size-range");
  fontSlider.addEventListener("input", () => {
    const item = selected(); if (!item || item.type !== "text") return;
    const value = Math.max(8, Math.min(100, Number(fontSlider.value) || 25));
    if (item.fontSize === value) return;
    if (fontSizeEditingId !== item.id) { checkpoint(); fontSizeEditingId = item.id; }
    item.fontSize = value;
    if (item.labelRole) { item.baseFontSize = value; fitLabelTextInside(item); }
    else fitTextToBox(item);
    render(); scheduleDraft();
  });
  for (const event of ["change", "blur", "pointerup", "pointercancel"]) {
    fontSlider.addEventListener(event, () => { fontSizeEditingId = null; });
  }
  document.querySelectorAll("[data-font-step]").forEach(button => button.addEventListener("click", event => {
    const item = selected(); if (!item || item.type !== "text") return;
    const input = $("prop-font-size");
    input.value = Math.max(8, Math.min(100, (Number(input.value) || item.fontSize) +
      Number(button.dataset.fontStep) * (event.shiftKey ? 10 : 1)));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }));
  document.querySelectorAll("[data-property-align]").forEach(button => button.addEventListener("click", () => {
    const item = selected(); if (!item || item.type !== "text") return;
    if (item.align === button.dataset.propertyAlign) return;
    $("prop-align").value = button.dataset.propertyAlign;
    $("prop-align").dispatchEvent(new Event("change", { bubbles: true }));
  }));
  $("prop-frame-style").addEventListener("change", () => {
    const item = selected(), style = $("prop-frame-style").value;
    if (!item || item.type !== "frame" || !LABEL_FRAMES.includes(style) || style === "none") return;
    checkpoint(); item.frameStyle = style; item.name = `${FRAME_NAMES[style]} frame`;
    render(); scheduleDraft();
  });
  for (const key of ["kind", "filled"]) $("prop-shape-" + key).addEventListener("change", () => {
    const item = selected(); if (!item || item.type !== "shape") return;
    checkpoint();
    if (key === "kind") {
      item.shapeKind = $("prop-shape-kind").value;
      item.name = SHAPE_NAMES[item.shapeKind] || "Shape";
    } else item.shapeFilled = $("prop-shape-filled").checked;
    render(); scheduleDraft();
  });
  for (const key of ["font-size", "font-family", "align", "bold"]) $("prop-" + key).addEventListener("change", () => {
    const item = selected(); if (!item || item.type !== "text") return;
    checkpoint();
    if (key === "font-size") {
      item.fontSize = Math.max(8, Math.min(100, Number($("prop-font-size").value) || 25));
      if (item.labelRole) item.baseFontSize = item.fontSize;
    }
    if (key === "font-family") item.fontFamily = $("prop-font-family").value;
    if (key === "align") item.align = $("prop-align").value;
    if (key === "bold") item.bold = $("prop-bold").checked;
    if (item.labelRole) fitLabelTextInside(item);
    else fitTextToBox(item);
    render(); scheduleDraft();
  });
  $("edit-text").addEventListener("click", () => beginInlineEdit(selected()));
  $("prop-image-fit").addEventListener("change", () => {
    const item = selected(); if (!item || item.type !== "image") return;
    checkpoint(); item.fit = $("prop-image-fit").value; render(); scheduleDraft();
  });
  $("move-up").addEventListener("click", () => reorderSelected(1));
  $("move-down").addEventListener("click", () => reorderSelected(-1));
  $("ps-center-page")?.addEventListener("click", () => centerSelection("both"));
  $("ps-center-x")?.addEventListener("click", () => centerSelection("x"));
  $("duplicate").addEventListener("click", duplicateSelected);
  $("rotate-left").addEventListener("click", () => rotateSelected(-1));
  $("rotate-right").addEventListener("click", () => rotateSelected(1));
  $("undo").addEventListener("click", undo); $("redo").addEventListener("click", redo);
  $("paper-resize").addEventListener("pointerdown", paperResizeDown);
  $("paper-resize").addEventListener("pointermove", paperResizeMove);
  $("paper-resize").addEventListener("pointerup", paperResizeUp);
  $("paper-resize").addEventListener("pointercancel", paperResizeUp);
  $("paper-resize").addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    if (work.mode !== "free") switchMode("free");
    checkpoint();
    work.pageHeight = Math.max(mmToPx(20), Math.min(MAX_HEIGHT,
      work.pageHeight + mmToPx((event.shiftKey ? 20 : 5) * (event.key === "ArrowDown" ? 1 : -1))));
    render(); scheduleDraft();
  });
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  $("canvas-stage").addEventListener("pointerdown", stagePointerDown);
  $("canvas-stage").addEventListener("pointermove", stagePointerMove);
  $("canvas-stage").addEventListener("pointerup", stagePointerUp);
  $("canvas-stage").addEventListener("pointercancel", stagePointerUp);
  canvas.addEventListener("dblclick", event => {
    const box = hitTest(pointerPosition(event));
    if (box) { setSelection([box.id]); render(); beginInlineEdit(selected()); }
  });
  $("inline-text").addEventListener("blur", () => finishInlineEdit());
  $("inline-text").addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); finishInlineEdit(true); }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finishInlineEdit(); }
  });
  $("download-preview").addEventListener("click", downloadPng);
  $("print-button").addEventListener("click", printNow);
  $("refresh-status").addEventListener("click", discoverPrinters);
  $("discover-printers").addEventListener("click", discoverPrinters);
  $("printer-select").addEventListener("change", event => {
    work.printerPort = event.target.value;
    try { localStorage.setItem("t02-printer-port", work.printerPort); } catch { /* Optional. */ }
    $("printer-status").textContent = work.printerPort ?
      `${work.printerPort} selected · not physically verified` : "Choose a port to enable printing";
    $("status-led").className = work.printerPort ? "good" : "bad";
    render();
  });
  $("save-project").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(projectData())], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "t02-studio-project.json";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
  $("load-project").addEventListener("click", () => $("project-file").click());
  $("project-file").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024) throw Error("Project file is too large");
      restoreData(JSON.parse(await file.text())); toast("Project opened");
    } catch (error) { toast(error.message, true); }
    event.target.value = "";
  });
  $("clear-project").addEventListener("click", () => {
    if ((!work.items.length && work.labelFrame === "none") || !window.confirm("Clear the entire print design?")) return;
    checkpoint(); work.items = []; setSelection([]); work.labelFrame = "none"; work.labelDesign = false;
    work.labelFrameChoice = "rounded"; work.pageHeight = mmToPx(150);
    syncLabelControls(); render(); scheduleDraft(); toast("All layers cleared. Use Undo to restore your design.");
  });
  $("canvas-stage").addEventListener("dragover", event => event.preventDefault());
  $("canvas-stage").addEventListener("drop", event => {
    event.preventDefault(); const file = event.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      const rect = canvas.getBoundingClientRect();
      const isOnPaper = work.mode === "free" && event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      addImageFile(file, file.name, isOnPaper ? pointerPosition(event) : null).catch(error => toast(error.message, true));
    }
  });
  document.addEventListener("paste", event => {
    if (event.target === $("inline-text")) return;
    const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith("image/"));
    if (image) {
      event.preventDefault(); addImageFile(image.getAsFile(), "Pasted image").catch(error => toast(error.message, true));
      return;
    }
    if (work.mode === "free" && document.activeElement === canvas && event.clipboardData?.getData("text/plain")) {
      event.preventDefault();
      try { addText(event.clipboardData.getData("text/plain").slice(0, 20000)); } catch (error) { toast(error.message, true); }
    }
  });
  document.addEventListener("keydown", event => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement || event.target.isContentEditable;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); $("save-project").click(); return; }
    if (typing) return;
    if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
    else if (modifier && event.key.toLowerCase() === "a" && work.mode === "free") {
      event.preventDefault(); setSelection(work.items.filter(item => !item.hidden).map(item => item.id)); render();
    }
    else if (modifier && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); }
    else if (event.key === "Escape" && work.selectedIds.length) { event.preventDefault(); setSelection([]); render(); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
    else if (work.mode === "free" && work.selectedIds.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); checkpoint(); const step = event.shiftKey ? 10 : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const items = selectedItems();
      const boxes = transformSelection(items.map(item => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
        "move", dx, dy, work.pageHeight);
      for (const box of boxes) {
        const item = items.find(entry => entry.id === box.id);
        Object.assign(item, { x: box.x, y: box.y });
      }
      render(); scheduleDraft();
    }
  });
}

function init() {
  setupShapeProperties();
  bind();
  try {
    const saved = localStorage.getItem("t02-composer-project");
    if (saved) restoreData(JSON.parse(saved));
    else { syncMode(); syncLabelControls(); render(); }
  } catch { syncMode(); syncLabelControls(); render(); }
  selectTool("text"); updatePdfLabel(); discoverPrinters();
}

init();
