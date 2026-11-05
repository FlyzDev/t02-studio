const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mmToPx, pxToMm, flowLayout, clampBox, rotateBox, PAPER_WIDTH, MAX_HEIGHT,
  LABEL_SIZES, LABEL_FRAMES, FRAME_NAMES, SHAPE_NAMES, FONT_STACKS, normalizeOpacity,
  normalizeFrameWidth, normalizeTextThickness, selectionBounds, marqueeRect,
  marqueeHits, transformSelection } = require('../src/t02studio/static/studio-core.js');

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
assert.deepEqual(Object.keys(SHAPE_NAMES), ['rectangle', 'rounded', 'ellipse', 'line', 'arrow', 'diamond', 'star']);

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
const multi = [
  { id: 'left', x: 20, y: 30, w: 80, h: 40 },
  { id: 'right', x: 140, y: 110, w: 60, h: 50 }
];
assert.deepEqual(selectionBounds(multi), { x: 20, y: 30, w: 180, h: 130 });
assert.equal(selectionBounds([]), null);
assert.deepEqual(marqueeRect({ x: 205, y: 165 }, { x: 10, y: 20 }),
  { x: 10, y: 20, w: 195, h: 145 });
assert.deepEqual(marqueeHits(multi, { x: 70, y: 40, w: 100, h: 100 }), ['left', 'right']);
assert.deepEqual(marqueeHits(multi, { x: 100, y: 70, w: 20, h: 20 }), []);
assert.deepEqual(marqueeHits(multi, { x: 10, y: 20, w: 1, h: 1 }), []);
const moved = transformSelection(multi, 'move', 300, -80, 600);
assert.deepEqual(moved.map(box => ({ id: box.id, x: box.x, y: box.y })),
  [{ id: 'left', x: 204, y: 0 }, { id: 'right', x: 324, y: 80 }]);
const grown = transformSelection(multi, 'resize', 90, 130, 600);
assert.deepEqual(grown.map(box => ({ id: box.id, x: box.x, y: box.y, w: box.w, h: box.h })),
  [{ id: 'left', x: 20, y: 30, w: 120, h: 80 }, { id: 'right', x: 200, y: 190, w: 90, h: 100 }]);
assert.ok(transformSelection(multi, 'resize', -1000, -1000, 600).every(box => box.w >= 8 && box.h >= 8));
assert.deepEqual(transformSelection([], 'move', 2, 4, 600), []);
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
const workspaceMarkup = fs.readFileSync(path.join(__dirname, '../src/t02studio/templates/studio_alt.html'), 'utf8');
const workspaceCss = fs.readFileSync(path.join(__dirname, '../src/t02studio/static/studio-workspace.css'), 'utf8');
const workspaceJs = fs.readFileSync(path.join(__dirname, '../src/t02studio/static/studio-workspace.js'), 'utf8');
for (const id of ['ps-context-font', 'ps-context-size', 'ps-context-weight', 'ps-context-opacity',
  'ps-center-x', 'ps-center-page', 'ps-rail-select']) {
  assert.ok(workspaceMarkup.includes(`id="${id}"`), `Workspace missing interactive control ${id}`);
}
for (const name of ['stagePointerDown', 'stagePointerMove', 'stagePointerUp', 'reorderLayer', 'centerSelection']) {
  assert.ok(source.includes(`function ${name}(`), `Workspace missing behavior ${name}`);
}
assert.ok(source.includes('row.draggable = true'));
assert.ok(source.includes('"compact", "true"'));
assert.ok(workspaceCss.includes('.layer-item.drop-before'));
assert.ok(workspaceCss.includes('align-items: center'));
assert.ok(workspaceJs.includes("forward('ps-context-font'"));
for (const match of source.matchAll(/\$\("([\w-]+)"\)/g)) {
  assert.ok(markup.includes(`id="${match[1]}"`) || workspaceMarkup.includes(`id="${match[1]}"`) || source.includes(`id="${match[1]}"`) ||
    source.includes(`.id = "${match[1]}"`),
    `Missing element in composer or dynamically installed property controls: ${match[1]}`);
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
  for (const tool of ['barcode', 'address', 'datetime', 'shape', 'border']) {
    assert.ok(html.includes(`data-tool="${tool}"`), `${page}: missing ${tool} tab`);
    assert.ok(html.includes(`data-panel="${tool}"`), `${page}: missing ${tool} panel`);
  }
  for (const id of ['add-barcode', 'barcode-value', 'barcode-type', 'barcode-caption',
    'add-address', 'address-value', 'add-datetime', 'datetime-format', 'datetime-prefix',
    'add-shape', 'shape-kind', 'shape-width', 'shape-filled', 'add-border', 'border-style', 'border-width']) {
    assert.ok(html.includes(`id="${id}"`), `${page}: missing ${id}`);
  }
}
assert.ok(source.includes('createUuidV4()'));
assert.ok(source.includes('clipboardData'));
assert.ok(source.includes('context.globalAlpha = normalizeOpacity(item.opacity)'));
assert.ok(source.includes('item.type === "frame"'));
assert.ok(source.includes('item.type === "shape"'));
assert.ok(source.includes('context.strokeText(line'));
assert.ok(source.includes('toast("All layers cleared. Use Undo to restore your design.")'));
assert.ok(source.includes('operation: "marquee"'));
assert.ok(source.includes('className = "layer-delete"'));
assert.ok(source.includes('transformSelection(originals, work.drag.operation'));
assert.ok(!markup.includes('id="delete-selected"'), 'Single toolbar delete should be replaced with inline layer actions');
const workspace = fs.readFileSync(path.join(__dirname, '../src/t02studio/templates/studio_alt.html'), 'utf8');
for (const id of ['ps-rail-select', 'workspace-tool-drawer', 'workspace-drawer-close',
  'ps-zoom', 'ps-quick-save', 'ps-printer-toggle', 'ps-length-control']) {
  assert.ok(workspace.includes(`id="${id}"`), `Missing new workspace control ${id}`);
}
for (const menu of ['File', 'Edit', 'View', 'Layer']) {
  assert.ok(workspace.includes(`<summary>${menu}</summary>`), `Missing workspace menu ${menu}`);
}
assert.ok(workspace.includes('/static/studio-workspace.css'));
assert.ok(workspace.includes('/static/studio-workspace.js'));
assert.ok(!markup.includes('studio-workspace.css'), 'Legacy composer must remain unchanged');
console.log('studio core tests OK');
