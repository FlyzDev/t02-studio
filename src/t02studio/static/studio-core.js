"use strict";

/* Pure geometry shared by the print composer and the local Node test suite. */
const T02StudioCore = (() => {
  const PAPER_WIDTH = 384;
  const MAX_HEIGHT = 8000;
  const DPI = 203;
  // A 50 mm design fits inside the T02's 53 mm continuous roll.
  const LABEL_SIZES = Object.freeze({
    compact: Object.freeze({ name: "Compact", widthMm: 50, heightMm: 30 }),
    classic: Object.freeze({ name: "Classic", widthMm: 50, heightMm: 50 }),
    tall: Object.freeze({ name: "Tall", widthMm: 50, heightMm: 80 })
  });
  const LABEL_FRAMES = Object.freeze(["none", "rounded", "double", "dashed", "corners",
    "solid", "dotted", "scallop", "ticket", "deco", "wavy"]);
  const FRAME_NAMES = Object.freeze({ none: "None", rounded: "Rounded", double: "Double",
    dashed: "Stitched", corners: "Corners", solid: "Classic", dotted: "Dotted",
    scallop: "Scalloped", ticket: "Ticket", deco: "Art Deco", wavy: "Wavy" });
  const SHAPE_NAMES = Object.freeze({ rectangle: "Rectangle", rounded: "Rounded rectangle",
    ellipse: "Ellipse", line: "Line", arrow: "Arrow", diamond: "Diamond", star: "Star" });
  // These common desktop fonts work offline; no external font CDN is required.
  const FONT_STACKS = Object.freeze({
    modern: '"Segoe UI", Arial, sans-serif',
    classic: 'Georgia, "Times New Roman", serif',
    rounded: '"Trebuchet MS", Verdana, sans-serif',
    editorial: '"Palatino Linotype", "Book Antiqua", Georgia, serif',
    typewriter: '"Courier New", Courier, monospace',
    display: 'Impact, "Arial Narrow", sans-serif'
  });

  function mmToPx(mm) { return Math.round(Number(mm) * DPI / 25.4); }
  function pxToMm(px) { return Number(px) * 25.4 / DPI; }
  // JSON projects from older versions have no opacity. Preserve zero opacity explicitly.
  function normalizeOpacity(value) {
    if (value === undefined || value === null || value === "") return 1;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 1;
  }
  function normalizeFrameWidth(value) {
    if (value === undefined || value === null || value === "") return 3;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(7, Math.round(number * 2) / 2)) : 3;
  }
  function normalizeTextThickness(value) {
    if (value === undefined || value === null || value === "") return 3;
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : 3;
  }

  function flowLayout(items, padding = 16, gap = 12) {
    const available = PAPER_WIDTH - 2 * padding;
    let y = padding;
    const blocks = items.filter(item => !item.hidden).map(item => {
      const scale = Math.min(1, available / Math.max(1, item.w));
      const w = Math.max(1, Math.round(item.w * scale));
      const h = Math.max(1, Math.round(item.h * scale));
      const rotated = (Number(item.rotation) || 0) % 180 !== 0;
      const box = { id: item.id, x: rotated ? Math.round((PAPER_WIDTH - w) / 2) : padding, y, w, h };
      y += h + gap;
      return box;
    });
    return { blocks, height: blocks.length ? y - gap + padding : mmToPx(80) };
  }

  function clampBox(box, pageHeight) {
    const hLimit = Math.max(1, Math.min(MAX_HEIGHT, Math.round(pageHeight)));
    const w = Math.max(1, Math.min(PAPER_WIDTH, Math.round(box.w)));
    const h = Math.max(1, Math.min(hLimit, Math.round(box.h)));
    return {
      x: Math.max(0, Math.min(PAPER_WIDTH - w, Math.round(box.x))),
      y: Math.max(0, Math.min(hLimit - h, Math.round(box.y))),
      w, h
    };
  }

  function selectionBounds(boxes) {
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map(box => box.x));
    const y = Math.min(...boxes.map(box => box.y));
    return { x, y,
      w: Math.max(...boxes.map(box => box.x + box.w)) - x,
      h: Math.max(...boxes.map(box => box.y + box.h)) - y };
  }

  function marqueeRect(start, end) {
    return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
  }

  function marqueeHits(boxes, rect) {
    if (rect.w < 3 || rect.h < 3) return [];
    return boxes.filter(box =>
      box.x < rect.x + rect.w && box.x + box.w > rect.x &&
      box.y < rect.y + rect.h && box.y + box.h > rect.y).map(box => box.id);
  }

  // Incremental movement avoids jumps when Shift is pressed or released
  // mid-drag. The first meaningful Shift movement picks the dominant axis.
  function advanceDragTranslation(state, stepX, stepY, shiftPressed) {
    const current = state || { x: 0, y: 0, shiftActive: false, axis: null, pendingX: 0, pendingY: 0 };
    if (!shiftPressed) return {
      x: current.x + stepX, y: current.y + stepY,
      shiftActive: false, axis: null, pendingX: 0, pendingY: 0
    };
    if (current.shiftActive && current.axis) return {
      x: current.x + (current.axis === 'x' ? stepX : 0),
      y: current.y + (current.axis === 'y' ? stepY : 0),
      shiftActive: true, axis: current.axis, pendingX: 0, pendingY: 0
    };
    const pendingX = (current.shiftActive ? current.pendingX : 0) + stepX;
    const pendingY = (current.shiftActive ? current.pendingY : 0) + stepY;
    if (Math.max(Math.abs(pendingX), Math.abs(pendingY)) < 3) return {
      x: current.x, y: current.y, shiftActive: true, axis: null, pendingX, pendingY
    };
    const axis = Math.abs(pendingX) >= Math.abs(pendingY) ? 'x' : 'y';
    return {
      x: current.x + (axis === 'x' ? pendingX : 0),
      y: current.y + (axis === 'y' ? pendingY : 0),
      shiftActive: true, axis, pendingX: 0, pendingY: 0
    };
  }

  function transformSelection(boxes, operation, dx, dy, pageHeight) {
    const bounds = selectionBounds(boxes);
    if (!bounds) return [];
    const limitY = Math.max(1, Math.min(MAX_HEIGHT, Math.round(pageHeight)));
    if (operation === "move") {
      const moveX = Math.max(-bounds.x, Math.min(PAPER_WIDTH - bounds.x - bounds.w, dx));
      const moveY = Math.max(-bounds.y, Math.min(limitY - bounds.y - bounds.h, dy));
      return boxes.map(box => ({ ...box,
        x: Math.round(box.x + moveX), y: Math.round(box.y + moveY) }));
    }
    if (operation !== "resize") throw Error("Unknown selection transform");
    const minScaleX = Math.max(...boxes.map(box => Math.min(1, 8 / Math.max(1, box.w))));
    const minScaleY = Math.max(...boxes.map(box => Math.min(1, 8 / Math.max(1, box.h))));
    const width = Math.min(PAPER_WIDTH - bounds.x,
      Math.max(bounds.w * minScaleX, bounds.w + dx));
    const height = Math.min(limitY - bounds.y,
      Math.max(bounds.h * minScaleY, bounds.h + dy));
    const scaleX = width / Math.max(1, bounds.w);
    const scaleY = height / Math.max(1, bounds.h);
    return boxes.map(box => ({
      ...box,
      x: Math.round(bounds.x + (box.x - bounds.x) * scaleX),
      y: Math.round(bounds.y + (box.y - bounds.y) * scaleY),
      w: Math.max(1, Math.round(box.w * scaleX)),
      h: Math.max(1, Math.round(box.h * scaleY))
    }));
  }

  function rotateBox(box, quarterTurns) {
    const w = Math.round(box.h), h = Math.round(box.w);
    return {
      ...box,
      x: Math.round(box.x + (box.w - w) / 2),
      y: Math.round(box.y + (box.h - h) / 2),
      w, h,
      rotation: (((Number(box.rotation) || 0) + quarterTurns * 90) % 360 + 360) % 360
    };
  }

  return { PAPER_WIDTH, MAX_HEIGHT, DPI, LABEL_SIZES, LABEL_FRAMES, FRAME_NAMES, SHAPE_NAMES, FONT_STACKS,
    mmToPx, pxToMm, normalizeOpacity, normalizeFrameWidth, normalizeTextThickness,
    flowLayout, clampBox, rotateBox, selectionBounds, marqueeRect, marqueeHits, transformSelection,
    advanceDragTranslation };
})();

if (typeof module !== "undefined" && module.exports) module.exports = T02StudioCore;
