/* Optional, strictly preview-only experiments and project credits.
   No print request or printer setting is ever modified here. */
(() => {
  const $ = id => document.getElementById(id);
  const experimental = $('workspace-experimental-dialog');
  const about = $('workspace-about-dialog');
  const canvas = $('workspace-experimental-canvas');
  const download = $('workspace-experimental-download');
  const status = $('workspace-experimental-status');
  const choices = [...document.querySelectorAll('[data-experimental-width]')];
  const allowedWidths = new Set([384, 576, 832]);
  let selectedWidth = 384;
  let renderSerial = 0;

  function openDialog(dialog) {
    document.querySelectorAll('.workspace-menu[open]').forEach(menu => { menu.open = false; });
    dialog.showModal();
  }

  async function updatePreview() {
    const token = ++renderSerial;
    download.disabled = true;
    status.textContent = 'Preparing preview…';
    try {
      // studio.js provides the same artwork-only renderer as normal PNG export.
      // Never use the visible canvas: it includes selection boxes and handles.
      if (typeof rasterCanvas !== 'function' || typeof waitForImages !== 'function')
        throw Error('The editor is not ready. Reload and try again.');
      await waitForImages();
      if (token !== renderSerial || !experimental.open) return;
      const source = rasterCanvas();
      const height = Math.max(1, Math.round(source.height * selectedWidth / source.width));
      if (height > 12000) throw Error('This design is too long for the selected experimental width. Shorten the paper first.');
      canvas.width = selectedWidth;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (token !== renderSerial) return;
      status.textContent = `${selectedWidth} × ${height} px · ${selectedWidth === 384 ? 'T02 reference width' : 'Unverified output width'} · image resampling only`;
      download.disabled = false;
    } catch (error) {
      if (token === renderSerial) status.textContent = error.message || 'Could not prepare the preview.';
    }
  }

  function selectWidth(width) {
    if (!allowedWidths.has(width)) return;
    selectedWidth = width;
    for (const choice of choices) {
      const active = Number(choice.dataset.experimentalWidth) === width;
      choice.classList.toggle('active', active);
      choice.setAttribute('aria-pressed', String(active));
    }
    updatePreview();
  }

  $('workspace-open-experimental').addEventListener('click', () => {
    openDialog(experimental);
    updatePreview();
  });
  $('workspace-open-about').addEventListener('click', () => openDialog(about));
  $('workspace-close-experimental').addEventListener('click', () => experimental.close());
  $('workspace-close-about').addEventListener('click', () => about.close());
  for (const choice of choices) choice.addEventListener('click', () => selectWidth(Number(choice.dataset.experimentalWidth)));
  for (const dialog of [experimental, about]) {
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  }
  experimental.addEventListener('close', () => { ++renderSerial; download.disabled = true; });
  download.addEventListener('click', () => {
    if (download.disabled || !experimental.open) return;
    download.disabled = true;
    // Snapshot the currently rendered width; switching presets while the blob
    // is being encoded must not mislabel or modify the downloaded bitmap.
    const savedWidth = canvas.width;
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);
    snapshot.toBlob(blob => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `t02-experimental-${savedWidth}dots-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      } else status.textContent = 'Could not generate an experimental PNG.';
      if (experimental.open && blob) download.disabled = false;
    }, 'image/png');
  });
})();
