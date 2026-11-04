"use strict";

/* Pure geometry shared by the print composer and the local Node test suite. */
const T02StudioCore = (() => {
  const PAPER_WIDTH = 384;
  const MAX_HEIGHT = 8000;
  const DPI = 203;

  function mmToPx(mm) { return Math.round(Number(mm) * DPI / 25.4); }
  function pxToMm(px) { return Number(px) * 25.4 / DPI; }

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

  return { PAPER_WIDTH, MAX_HEIGHT, DPI, mmToPx, pxToMm, flowLayout, clampBox, rotateBox };
})();

if (typeof module !== "undefined" && module.exports) module.exports = T02StudioCore;
