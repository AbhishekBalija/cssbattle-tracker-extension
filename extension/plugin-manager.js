/**
 * CSSBattle Plugin Manager
 *
 * Loads built-in plugins, provides editor read/write helpers for CodeMirror 6,
 * and injects a plugin toolbox into the CSSBattle target sponsor area.
 *
 * Plugins are registered into window.__cssbattlePlugins by the individual
 * plugin files in extension/plugins/.
 */
(function () {
  'use strict';

  // Prevent double-injection.
  if (window.__cssbattlePluginManager) return;

  const TOOLBAR_ID = 'cssbattle-archive-plugin-toolbar';
  const TOAST_ID = 'cssbattle-archive-plugin-toast';
  let sponsorState = null;
  let toolbarMountObserver = null;
  let sponsorContentObserver = null;
  let pendingToolbarIds = null;

  // ─── Plugin Registry ─────────────────────────────────────────────────

  const plugins = new Map();

  function registerAll() {
    const registry = window.__cssbattlePlugins || {};
    for (const [id, plugin] of Object.entries(registry)) {
      plugins.set(id, plugin);
    }
  }

  function getPluginList() {
    return Array.from(plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category
    }));
  }

  // ─── Editor Helpers ──────────────────────────────────────────────────

  function getEditorView() {
    const cmContent = document.querySelector('.cm-content');
    if (!cmContent) return null;

    const cmEditor = cmContent.closest('.cm-editor');
    return (
      cmEditor?.cmView?.view ||
      cmContent.cmView?.view ||
      window.cssbattleEditor ||
      window.__cssbattleEditor ||
      window.editor ||
      window.__editor ||
      null
    );
  }

  function getCode() {
    const view = getEditorView();
    if (view && view.state && view.state.doc) {
      return view.state.doc.toString();
    }
    const cmContent = document.querySelector('.cm-content');
    return cmContent ? (cmContent.innerText || cmContent.textContent || '') : null;
  }

  function setCode(code) {
    const view = getEditorView();
    if (view && view.dispatch && view.state && view.state.doc) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code }
      });
      return true;
    }

    const cmContent = document.querySelector('.cm-content');
    if (!cmContent) return false;

    // Fallback: simulate user typing so CodeMirror recognizes the change.
    cmContent.focus();
    if (document.execCommand) {
      document.execCommand('selectAll', false, null);
      const inserted = document.execCommand('insertText', false, code);
      if (inserted) return true;
    }

    // Last-resort fallback: directly mutate innerText and dispatch events.
    cmContent.innerText = code;
    cmContent.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    cmContent.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ─── Run / Undo ──────────────────────────────────────────────────────

  let lastCode = null;

  function runPlugin(id) {
    const plugin = plugins.get(id);
    if (!plugin) return { success: false, error: `Plugin "${id}" not found` };

    const code = getCode();
    if (code === null) return { success: false, error: 'CSSBattle editor not found' };

    lastCode = code;
    try {
      const result = plugin.run(code);
      if (typeof result !== 'string') {
        return { success: false, error: 'Plugin did not return a string' };
      }
      if (!setCode(result)) {
        return { success: false, error: 'Could not write to editor' };
      }
      return { success: true, plugin: id, charsBefore: code.length, charsAfter: result.length };
    } catch (err) {
      return { success: false, error: err.message || 'Plugin failed' };
    }
  }

  function undo() {
    if (lastCode === null) return { success: false, error: 'Nothing to undo' };
    const restored = lastCode;
    if (!setCode(lastCode)) {
      return { success: false, error: 'Could not restore editor content' };
    }
    lastCode = null;
    return { success: true, charsAfter: restored.length };
  }

  // ─── UI Injection ────────────────────────────────────────────────────

  function removeToolbar() {
    if (toolbarMountObserver) {
      toolbarMountObserver.disconnect();
      toolbarMountObserver = null;
    }
    if (sponsorContentObserver) {
      sponsorContentObserver.disconnect();
      sponsorContentObserver = null;
    }
    pendingToolbarIds = null;

    const existing = document.getElementById(TOOLBAR_ID);
    if (existing) existing.remove();

    if (sponsorState) {
      const { header, headerText, headerDisplay, children } = sponsorState;
      if (header?.isConnected) {
        header.textContent = headerText;
        header.style.display = headerDisplay;
      }
      for (const { element, display } of children) {
        if (element.isConnected) element.style.display = display;
      }
      sponsorState = null;
    }

    const existingToast = document.getElementById(TOAST_ID);
    if (existingToast) existingToast.remove();
  }

  function showToast(message, type = 'info') {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483647;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      background: ${type === 'error' ? '#ff5252' : '#00c853'};
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    `;

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
    }, 2200);
  }

  function findSponsorContainer() {
    return document.querySelector('.sponsor-containerr');
  }

  function waitForSponsor(enabledIds) {
    pendingToolbarIds = [...enabledIds];
    if (toolbarMountObserver) return;

    toolbarMountObserver = new MutationObserver(() => {
      if (!findSponsorContainer()) return;

      const ids = pendingToolbarIds;
      toolbarMountObserver.disconnect();
      toolbarMountObserver = null;
      pendingToolbarIds = null;

      if (ids) injectToolbar(ids);
    });
    toolbarMountObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  }

  function prepareSponsorMount(sponsorContainer) {
    const previousElement = sponsorContainer.previousElementSibling;
    const header = previousElement?.classList.contains('inner-header')
      ? previousElement
      : null;
    const children = [];
    const hideSponsorChild = element => {
      if (element.id === TOOLBAR_ID || children.some(item => item.element === element)) return;
      children.push({ element, display: element.style.display });
      element.style.display = 'none';
    };

    for (const element of sponsorContainer.children) {
      hideSponsorChild(element);
    }

    sponsorState = {
      header,
      headerText: header?.textContent || '',
      headerDisplay: header?.style.display || '',
      children
    };

    if (header) header.style.display = 'none';

    sponsorContentObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.parentElement === sponsorContainer) {
            hideSponsorChild(node);
          }
        }
      }
    });
    sponsorContentObserver.observe(sponsorContainer, { childList: true });
  }

  function injectToolbar(enabledIds = []) {
    removeToolbar();
    registerAll();

    const available = getPluginList();
    const active = available.filter(p => enabledIds.includes(p.id));
    if (active.length === 0) return;

    const sponsorContainer = findSponsorContainer();
    if (!sponsorContainer) {
      waitForSponsor(enabledIds);
      return false;
    }

    prepareSponsorMount(sponsorContainer);

    const toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.style.cssText = `
      width: 100%;
      margin-top: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 248px;
      padding: 14px;
      border-radius: 10px;
      background: rgba(24, 29, 35, 0.96);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      backdrop-filter: blur(8px);
      font-family: inherit;
      box-sizing: border-box;
    `;

    // Use the site's own font variable so the panel always tracks the
    // native typeface (same source the action-row buttons use).
    const referenceButton = document.querySelector('.btn-group .button')
      || document.querySelector('.btn-group button');
    const fallbackFamily = referenceButton
      ? getComputedStyle(referenceButton).fontFamily
      : '';
    toolbar.style.fontFamily = fallbackFamily
      ? `var(--font-base, ${fallbackFamily})`
      : 'var(--font-base)';

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #ffcc00;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding-bottom: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    `;
    header.innerHTML = `<span>Plugins</span>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Hide toolbar';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #8899aa;
      font: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
    `;
    closeBtn.addEventListener('click', () => {
      removeToolbar();
      notifyVisibilityChange(false);
    });
    header.appendChild(closeBtn);
    toolbar.appendChild(header);

    const pluginGrid = document.createElement('div');
    pluginGrid.style.cssText = `
      display: grid;
      flex: 1;
      align-content: center;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
    `;

    active.forEach(plugin => {
      const btn = document.createElement('button');
      const label = document.createElement('span');
      label.textContent = plugin.name;
      label.style.cssText = `
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;

      const runIcon = document.createElement('span');
      runIcon.textContent = '▶';
      runIcon.setAttribute('aria-hidden', 'true');
      runIcon.style.cssText = `
        display: grid;
        place-items: center;
        flex: 0 0 30px;
        width: 30px;
        height: 30px;
        margin-left: 8px;
        border-radius: 50%;
        background: rgba(255,255,255,0.1);
        color: #f5f7fa;
        font-size: 10px;
      `;

      btn.appendChild(label);
      btn.appendChild(runIcon);
      btn.title = plugin.description || '';
      btn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 46px;
        padding: 7px 8px 7px 12px;
        border: 1px solid #46545f;
        border-radius: 9px;
        background: #34424e;
        color: #f2f5f7;
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s, transform 0.05s;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.background = '#3d4c58'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#34424e'; });
      btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.98)'; });
      btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
      btn.addEventListener('click', () => {
        const result = runPlugin(plugin.id);
        if (result.success) {
          showToast(`${plugin.name} applied (${result.charsBefore} → ${result.charsAfter} chars)`);
        } else {
          showToast(result.error, 'error');
        }
      });
      pluginGrid.appendChild(btn);
    });

    toolbar.appendChild(pluginGrid);

    const undoBtn = document.createElement('button');
    undoBtn.textContent = '↶ Undo';
    undoBtn.style.cssText = `
      display: block;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      background: transparent;
      color: #8899aa;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.15s;
    `;
    undoBtn.addEventListener('mouseenter', () => { undoBtn.style.background = 'rgba(255,255,255,0.05)'; });
    undoBtn.addEventListener('mouseleave', () => { undoBtn.style.background = 'transparent'; });
    undoBtn.addEventListener('click', () => {
      const result = undo();
      showToast(result.success ? 'Undo successful' : result.error, result.success ? 'info' : 'error');
    });
    toolbar.appendChild(undoBtn);

    sponsorContainer.appendChild(toolbar);
    return true;
  }

  function notifyVisibilityChange(visible) {
    window.postMessage({
      source: 'cssbattle-archive-ui',
      type: 'TOOLBAR_VISIBILITY_CHANGED',
      payload: { visible }
    }, '*');
  }

  // ─── Public API ──────────────────────────────────────────────────────

  window.__cssbattlePluginManager = {
    registerAll,
    getPluginList,
    runPlugin,
    undo,
    injectToolbar,
    removeToolbar,
    getCode,
    setCode
  };
})();
