const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/t02studio/static/studio-experiments.js'), 'utf8');
assert.ok(!/\/api\/print|printNow\(|printerPort\s*=/.test(source), 'Experimental UI must not send print jobs or select ports');

function element(id) {
  return {
    id, open: false, disabled: false, textContent: '', listeners: {}, attributes: {}, dataset: {},
    classList: { toggle() {} },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
    click() { this.listeners.click?.({ target: this }); },
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close?.(); }
  };
}
const ids = ['workspace-experimental-dialog', 'workspace-about-dialog',
  'workspace-experimental-canvas', 'workspace-experimental-download', 'workspace-experimental-status',
  'workspace-open-experimental', 'workspace-open-about', 'workspace-close-experimental',
  'workspace-close-about'];
const controls = Object.fromEntries(ids.map(id => [id, element(id)]));
const canvas = controls['workspace-experimental-canvas'];
canvas.getContext = () => ({ fillRect() {}, drawImage() {}, set fillStyle(_) {}, set imageSmoothingEnabled(_) {} });
canvas.toBlob = callback => callback({});
const widths = [384, 576, 832].map(width => {
  const item = element(`width-${width}`);
  item.dataset.experimentalWidth = String(width);
  return item;
});
let downloads = 0;
const context = {
  document: {
    getElementById: id => controls[id],
    querySelectorAll(selector) {
      if (selector === '[data-experimental-width]') return widths;
      if (selector === '.workspace-menu[open]') return [];
      throw Error(`Unexpected selector ${selector}`);
    },
    createElement(name) {
      if (name === 'canvas') return { width: 0, height: 0,
        getContext: () => ({ drawImage() {} }), toBlob: callback => callback({}) };
      if (name === 'a') return { click() { downloads++; }, remove() {} };
      throw Error(`Unexpected element ${name}`);
    },
    body: { appendChild() {} }
  },
  rasterCanvas: () => ({ width: 384, height: 640 }),
  waitForImages: async () => {},
  URL: { createObjectURL: () => 'blob:unit-test', revokeObjectURL() {} },
  setTimeout() {}, Date
};
vm.runInNewContext(source, context);

async function flush() { await Promise.resolve(); await Promise.resolve(); }

(async () => {
  controls['workspace-open-experimental'].click();
  await flush();
  assert.equal(controls['workspace-experimental-dialog'].open, true);
  assert.equal(canvas.width, 384);
  assert.equal(canvas.height, 640);
  assert.equal(controls['workspace-experimental-download'].disabled, false);

  widths[1].click();
  await flush();
  assert.equal(canvas.width, 576);
  assert.equal(canvas.height, 960);
  assert.match(controls['workspace-experimental-status'].textContent, /Unverified output width/);
  assert.equal(widths[1].attributes['aria-pressed'], 'true');
  controls['workspace-experimental-download'].click();
  assert.equal(downloads, 1);

  controls['workspace-close-experimental'].click();
  assert.equal(controls['workspace-experimental-dialog'].open, false);
  controls['workspace-open-about'].click();
  assert.equal(controls['workspace-about-dialog'].open, true);
  controls['workspace-close-about'].click();
  assert.equal(controls['workspace-about-dialog'].open, false);
  console.log('experimental preview and about interactions OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
