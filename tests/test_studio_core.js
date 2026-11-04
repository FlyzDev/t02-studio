const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mmToPx, pxToMm, flowLayout, clampBox, rotateBox, PAPER_WIDTH, MAX_HEIGHT,
  LABEL_SIZES, LABEL_FRAMES, FRAME_NAMES, FONT_STACKS, normalizeOpacity,
  normalizeFrameWidth, normalizeTextThickness } = require('../src/t02studio/static/studio-core.js');

assert.equal(PAPER_WIDTH, 384);
assert.equal(MAX_HEIGHT, 8000);
assert.equal(mmToPx(25.4), 203);
assert.equal(Math.round(pxToMm(203)), 25);
assert.deepEqual(Object.values(LABEL_SIZES).map(size => [size.widthMm, size.heightMm]),
  [[50, 30], [50, 50], [50, 80]]);
assert.ok(Object.values(LABEL_SIZES).every(size => mmToPx(size.heightMm) <= MAX_HEIGHT));
assert.deepEqual(LABEL_FRAMES, ['none', 'rounded', 'double', 'dashed', 'corners',
  'solid', 'dotted', 'scallop', 'ticket', 'deco', 'wavy']);
assert.ok(LABEL_FRAMES.every(frame => FRAME_NAMES[frame]));
assert.equal(normalizeOpacity(undefined), 1);
assert.equal(normalizeOpacity(null), 1);
assert.equal(normalizeOpacity(0), 0);
assert.equal(normalizeOpacity(0.35), 0.35);
assert.equal(normalizeOpacity(-5), 0);
assert.equal(normalizeOpacity(9), 1);
assert.equal(normalizeOpacity('NaN'), 1);
assert.equal(normalizeFrameWidth(), 3);
assert.equal(normalizeFrameWidth('2.8'), 3);
assert.equal(normalizeFrameWidth(0), 1);
assert.equal(normalizeFrameWidth(20), 7);
assert.equal(normalizeTextThickness(), 3);
assert.equal(normalizeTextThickness(4.4), 4);
assert.equal(normalizeTextThickness(-3), 1);
assert.equal(normalizeTextThickness(20), 5);
assert.equal(Object.keys(FONT_STACKS).length, 6);

const blocks = [
  { id: 'a', w: 352, h: 80 },
  { id: 'b', w: 400, h: 200 },
  { id: 'c', w: 100, h: 60 }
];
const result = flowLayout(blocks);
assert.equal(result.blocks.length, 3);
assert.deepEqual(result.blocks.map(x => x.y), [16, 108, 296]);
assert.equal(result.blocks[1].w, 352);
assert.equal(result.blocks[1].h, 176);
assert.equal(result.height, 372);
for (let i = 1; i < result.blocks.length; i++) {
  assert.ok(result.blocks[i].y >= result.blocks[i - 1].y + result.blocks[i - 1].h);
}

assert.deepEqual(clampBox({ x: -25, y: -50, w: 500, h: 900 }, 600), { x: 0, y: 0, w: 384, h: 600 });
assert.deepEqual(clampBox({ x: 320, y: 550, w: 100, h: 100 }, 600), { x: 284, y: 500, w: 100, h: 100 });
const rotated = rotateBox({ x: 16, y: 30, w: 352, h: 90, rotation: 0 }, 1);
assert.deepEqual({ x: rotated.x, y: rotated.y, w: rotated.w, h: rotated.h, rotation: rotated.rotation },
  { x: 147, y: -101, w: 90, h: 352, rotation: 90 });
const restored = rotateBox(rotated, -1);
assert.deepEqual({ x: restored.x, y: restored.y, w: restored.w, h: restored.h, rotation: restored.rotation },
  { x: 16, y: 30, w: 352, h: 90, rotation: 0 });
const rotatedFlow = flowLayout([{ id: 'turned', w: 90, h: 352, rotation: 90 }]);
assert.equal(rotatedFlow.blocks[0].x, 147);
assert.equal(rotatedFlow.blocks[0].y, 16);
const source = fs.readFileSync(path.join(__dirname, '../src/t02studio/static/studio.js'), 'utf8');
const markup = fs.readFileSync(path.join(__dirname, '../src/t02studio/templates/studio.html'), 'utf8');
for (const match of source.matchAll(/\$\("([\w-]+)"\)/g)) {
  assert.ok(markup.includes(`id="${match[1]}"`), `Missing element in composer: ${match[1]}`);
}
assert.ok(markup.includes('data-mode="free"'));
for (const page of ['studio.html', 'studio_alt.html']) {
  const html = fs.readFileSync(path.join(__dirname, '../src/t02studio/templates', page), 'utf8');
  for (const id of ['create-label', 'add-frame', 'label-font', 'label-title', 'label-subtitle',
    'prop-font-family', 'text-font-family', 'prop-opacity', 'prop-opacity-value',
    'prop-frame-style', 'frame-properties', 'text-ink-thickness', 'prop-ink-thickness',
    'label-frame-width', 'prop-frame-width', 'clear-project',
    'prop-x-range', 'prop-y-range', 'prop-w-range', 'prop-h-range',
    'prop-font-size-range']) {
    assert.ok(html.includes(`id="${id}"`), `${page}: missing ${id}`);
  }
  for (const size of Object.keys(LABEL_SIZES)) assert.ok(html.includes(`data-label-size="${size}"`));
  for (const frame of LABEL_FRAMES) assert.ok(html.includes(`data-label-frame="${frame}"`));
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.ok(html.includes(`data-geometry-step="${key}:-1"`));
    assert.ok(html.includes(`data-geometry-step="${key}:1"`));
  }
  for (const direction of ['left', 'center', 'right'])
    assert.ok(html.includes(`data-property-align="${direction}"`));
}
assert.ok(source.includes('createUuidV4()'));
assert.ok(source.includes('clipboardData'));
assert.ok(source.includes('context.globalAlpha = normalizeOpacity(item.opacity)'));
assert.ok(source.includes('item.type === "frame"'));
assert.ok(source.includes('context.strokeText(line'));
assert.ok(source.includes('toast("All layers cleared. Use Undo to restore your design.")'));
console.log('studio core tests OK');
