const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mmToPx, pxToMm, flowLayout, clampBox, rotateBox, PAPER_WIDTH, MAX_HEIGHT } = require('../src/t02studio/static/studio-core.js');

assert.equal(PAPER_WIDTH, 384);
assert.equal(MAX_HEIGHT, 8000);
assert.equal(mmToPx(25.4), 203);
assert.equal(Math.round(pxToMm(203)), 25);

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
assert.ok(source.includes('createUuidV4()'));
assert.ok(source.includes('clipboardData'));
console.log('studio core tests OK');
