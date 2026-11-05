/* The workspace chrome and menus. Artwork, printing and layer operations stay
   in studio.js, which remains shared with the legacy composer. */
(() => {
  const $ = id => document.getElementById(id);
  const rail = document.querySelector('.tool-sidebar');
  const drawer = $('workspace-tool-drawer');
  const selectButton = $('ps-rail-select');
  const menuRoots = [...document.querySelectorAll('.workspace-menu')];
  let syncScheduled = false;

  function closeDrawer() {
    rail.classList.remove('drawer-open');
    for (const button of document.querySelectorAll('.tool-tab.active')) button.classList.remove('active');
    selectButton.classList.toggle('active', document.querySelector('#free-select')?.classList.contains('active'));
  }

  function openDrawer(title) {
    $('workspace-drawer-title').textContent = title;
    rail.classList.add('drawer-open');
    selectButton.classList.remove('active');
  }

  function syncChrome() {
    syncScheduled = false;
    const active = [...document.querySelectorAll('.layer-item.active')];
    const count = active.length;
    const placeholder = $('workspace-properties-empty');
    const isText = count === 1 && !$('text-properties').classList.contains('hidden');
    placeholder.classList.toggle('hidden', count === 1);
    if (count > 1) {
      $('workspace-properties-message').textContent = `${count} layers selected. Move or resize them together, or use Center on page above the canvas.`;
    } else if (count === 0) {
      $('workspace-properties-message').textContent = 'Choose a layer, or drag a selection rectangle from the empty gray workspace across the paper.';
    }
    $('ps-active-tool').textContent = count > 1 ? `↖ ${count} selected` : '↖ Select';
    const otherTypeSelected = count > 1 || (count === 1 && !isText);
    $('ps-context-font').disabled = otherTypeSelected;
    $('ps-context-size').disabled = otherTypeSelected;
    $('ps-context-weight').disabled = otherTypeSelected;
    $('ps-size-toggle').disabled = otherTypeSelected;
    $('ps-weight-toggle').disabled = otherTypeSelected;
    $('ps-context-opacity').disabled = count !== 1;
    $('ps-center-x').disabled = count === 0;
    $('ps-center-page').disabled = count === 0;
    $('ps-context-font').value = isText ? $('prop-font-family').value : $('text-font-family').value;
    if (document.activeElement !== $('ps-context-size'))
      $('ps-context-size').value = isText ? $('prop-font-size').value : $('font-size').value;
    $('ps-context-weight').value = isText ? $('prop-ink-thickness').value : $('text-ink-thickness').value;
    const sizeValue = Number($('ps-context-size').value) || 26;
    $('ps-size-slider').min = isText ? '8' : '12';
    $('ps-size-slider').max = isText ? '100' : '72';
    $('ps-size-slider').value = String(sizeValue);
    $('ps-size-value').textContent = `${sizeValue} px`;
    $('ps-size-min').textContent = `${$('ps-size-slider').min} px`;
    $('ps-size-max').textContent = `${$('ps-size-slider').max} px`;
    const weightValue = Number($('ps-context-weight').value) || 4;
    $('ps-weight-slider').value = String(weightValue);
    $('ps-weight-inline').textContent = `${weightValue}/5`;
    $('ps-weight-value').textContent = `${weightValue} / 5`;
    if (otherTypeSelected) closeAdjustPopovers();
    if (document.activeElement !== $('ps-context-opacity'))
      $('ps-context-opacity').value = count === 1 ? $('prop-opacity').value : 100;
    $('ps-length-control').value = $('page-height').value;
    $('ps-length-control').disabled = !document.querySelector('[data-mode="free"]')?.classList.contains('active');
    const port = $('printer-select').value;
    const pill = $('ps-printer-toggle');
    pill.textContent = port || 'No printer';
    pill.classList.toggle('disconnected', !port);
    if (!rail.classList.contains('drawer-open')) {
      selectButton.classList.toggle('active', document.querySelector('#free-select')?.classList.contains('active'));
    }
  }

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(syncChrome);
  }

  const placeholder = document.createElement('section');
  placeholder.id = 'workspace-properties-empty';
  placeholder.className = 'workspace-properties-empty';
  const title = document.createElement('h3'); title.textContent = 'Properties';
  const message = document.createElement('p'); message.id = 'workspace-properties-message';
  placeholder.append(title, message);
  document.querySelector('.layers-panel').prepend(placeholder);

  for (const button of document.querySelectorAll('.tool-tabs .tool-tab')) {
    const name = button.textContent.trim().replace(/^\d+\s*/, '');
    button.title = name;
    button.setAttribute('aria-label', `Add ${name}`);
    button.addEventListener('click', () => { openDrawer(name); scheduleSync(); });
  }
  selectButton.addEventListener('click', () => {
    $('free-select').click();
    document.querySelector('[data-mode="free"]').click();
    closeDrawer();
    for (const button of document.querySelectorAll('.tool-tab')) button.classList.remove('active');
    selectButton.classList.add('active');
    $('composition-canvas').focus();
    scheduleSync();
  });
  $('ps-active-tool').addEventListener('click', () => selectButton.click());
  const forward = (sourceId, targetId, eventName) => {
    const source = $(sourceId), target = $(targetId);
    target.value = source.value;
    target.dispatchEvent(new Event(eventName, { bubbles: true }));
    scheduleSync();
  };
  const editingText = () => !$('selection-properties').classList.contains('hidden') &&
    !$('text-properties').classList.contains('hidden');
  const popoverIds = ['size', 'weight'];
  function closeAdjustPopovers() {
    for (const name of popoverIds) {
      $(`ps-${name}-popover`).hidden = true;
      $(`ps-${name}-toggle`).setAttribute('aria-expanded', 'false');
    }
  }
  function openAdjustPopover(name) {
    if ($(`ps-${name}-toggle`).disabled) return;
    const shouldOpen = $(`ps-${name}-popover`).hidden;
    closeAdjustPopovers();
    if (shouldOpen) {
      $(`ps-${name}-popover`).hidden = false;
      $(`ps-${name}-toggle`).setAttribute('aria-expanded', 'true');
    }
  }
  for (const name of popoverIds) {
    $(`ps-${name}-toggle`).addEventListener('click', () => openAdjustPopover(name));
  }
  $('ps-context-size').addEventListener('focus', () => {
    if ($('ps-size-popover').hidden) openAdjustPopover('size');
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.workspace-adjust-chip')) closeAdjustPopovers();
  });
  $('ps-context-font').addEventListener('change', () => {
    forward('ps-context-font', editingText() ? 'prop-font-family' : 'text-font-family', 'change');
  });
  const applyContextSize = () => {
    if ($('ps-context-size').value === '') return;
    const editing = editingText();
    const size = Math.max(editing ? 8 : 12, Math.min(editing ? 100 : 72, Number($('ps-context-size').value) || 26));
    $('ps-context-size').value = String(size);
    forward('ps-context-size', editing ? 'prop-font-size' : 'font-size', editing ? 'change' : 'input');
  };
  $('ps-context-size').addEventListener('input', applyContextSize);
  $('ps-context-size').addEventListener('change', applyContextSize);
  $('ps-size-slider').addEventListener('input', () => {
    const value = $('ps-size-slider').value;
    $('ps-context-size').value = value;
    $('ps-size-value').textContent = `${value} px`;
    if (editingText()) {
      $('prop-font-size-range').value = value;
      $('prop-font-size-range').dispatchEvent(new Event('input', { bubbles: true }));
      scheduleSync();
    } else applyContextSize();
  });
  $('ps-size-slider').addEventListener('change', () => {
    if (editingText()) $('prop-font-size-range').dispatchEvent(new Event('change', { bubbles: true }));
    scheduleSync();
  });
  $('ps-context-weight').addEventListener('change', () => {
    const editing = editingText();
    forward('ps-context-weight', editing ? 'prop-ink-thickness' : 'text-ink-thickness', 'input');
  });
  $('ps-weight-slider').addEventListener('input', () => {
    const value = $('ps-weight-slider').value;
    $('ps-context-weight').value = value;
    $('ps-weight-inline').textContent = `${value}/5`;
    $('ps-weight-value').textContent = `${value} / 5`;
    forward('ps-context-weight', editingText() ? 'prop-ink-thickness' : 'text-ink-thickness', 'input');
  });
  $('ps-weight-slider').addEventListener('change', () => {
    if (editingText()) $('prop-ink-thickness').dispatchEvent(new Event('change', { bubbles: true }));
    scheduleSync();
  });
  const applyContextOpacity = () => {
    if ($('ps-context-opacity').value === '') return;
    $('ps-context-opacity').value = String(Math.max(0, Math.min(100, Number($('ps-context-opacity').value) || 0)));
    forward('ps-context-opacity', 'prop-opacity', 'input');
    $('prop-opacity').dispatchEvent(new Event('change', { bubbles: true }));
  };
  $('ps-context-opacity').addEventListener('input', applyContextOpacity);
  $('ps-context-opacity').addEventListener('change', applyContextOpacity);
  $('workspace-drawer-close').addEventListener('click', closeDrawer);
  document.querySelector('.canvas-stage').addEventListener('pointerdown', closeDrawer);
  $('ps-printer-toggle').addEventListener('click', () => {
    openDrawer('Printer connection');
    $('printer-select').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  const actions = {
    'ps-free-mode': () => document.querySelector('[data-mode="free"]').click(),
    'ps-flow-mode': () => document.querySelector('[data-mode="flow"]').click(),
    'ps-select-all': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })),
    'ps-deselect': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })),
    'ps-delete-selection': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
  };
  for (const button of document.querySelectorAll('[data-workspace-action]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.workspaceAction;
      if (actions[action]) actions[action]();
      else $(action)?.click();
      for (const menu of menuRoots) menu.open = false;
      scheduleSync();
    });
  }
  for (const menu of menuRoots) {
    menu.addEventListener('toggle', () => {
      if (menu.open) for (const other of menuRoots) if (other !== menu) other.open = false;
    });
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('.workspace-menu')) for (const menu of menuRoots) menu.open = false;
  });
  $('ps-quick-save').addEventListener('click', () => $('save-project').click());
  $('ps-length-control').addEventListener('change', () => {
    $('page-height').value = $('ps-length-control').value;
    $('page-height').dispatchEvent(new Event('change', { bubbles: true }));
    scheduleSync();
  });

  const zoom = $('ps-zoom');
  try {
    const stored = Number(localStorage.getItem('t02-workspace-zoom'));
    if ([50, 75, 100, 125, 150].includes(stored)) zoom.value = String(stored);
  } catch { /* Browser storage is optional. */ }
  const applyZoom = () => document.documentElement.style.setProperty('--workspace-zoom', String(Number(zoom.value) / 100));
  zoom.addEventListener('change', () => {
    applyZoom();
    try { localStorage.setItem('t02-workspace-zoom', zoom.value); } catch { /* Optional. */ }
  });
  applyZoom();

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAdjustPopovers();
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); $('save-project').click(); return;
    }
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === 'v') selectButton.click();
    else if (event.key.toLowerCase() === 't') document.querySelector('[data-tool="text"]').click();
    else if (event.key === 'Escape') closeDrawer();
  });

  const observer = new MutationObserver(scheduleSync);
  observer.observe($('layers-list'), { childList: true });
  observer.observe($('selection-properties'), { attributes: true, attributeFilter: ['class'] });
  observer.observe($('printer-select'), { childList: true, attributes: true, attributeFilter: ['value'] });
  $('printer-select').addEventListener('change', scheduleSync);
  document.querySelectorAll('[data-mode], .tool-panel input, .tool-panel select, #selection-properties input, #selection-properties select').forEach(element => element.addEventListener('change', scheduleSync));
  document.querySelectorAll('[data-mode]').forEach(element => element.addEventListener('click', scheduleSync));
  for (const button of document.querySelectorAll('.tool-tab.active')) button.classList.remove('active');
  selectButton.classList.add('active');
  scheduleSync();
})();
