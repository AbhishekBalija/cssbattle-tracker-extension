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
  let draftUi = null;
  let currentDraftKey = null;

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
    draftUi = null;
    currentDraftKey = null;

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
      font-family: 'Segoe UI', system-ui, sans-serif;
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

  function requestSolutionDraft() {
    window.postMessage({
      source: 'cssbattle-archive-ui',
      type: 'REQUEST_SOLUTION_DRAFT'
    }, '*');
  }

  function setDraftStatus(message, type = 'muted') {
    if (!draftUi) return;
    draftUi.status.textContent = message;
    draftUi.status.style.color = type === 'error'
      ? '#ff7b72'
      : type === 'success'
        ? '#7ee787'
        : '#8899aa';
  }

  function setPushButtonState(disabled, text, isBusy = false) {
    if (!draftUi) return;
    draftUi.pushButton.disabled = disabled;
    draftUi.pushButton.textContent = text;
    draftUi.pushButton.style.cursor = disabled ? 'not-allowed' : 'pointer';
    draftUi.pushButton.style.opacity = disabled ? (isBusy ? '0.7' : '0.45') : '1';
  }

  function renderSolutionDraft(draft, error = '') {
    if (!draftUi) return;

    if (!draft) {
      currentDraftKey = null;
      draftUi.name.textContent = 'No draft yet';
      draftUi.stats.textContent = 'Submit a scored solution to create one.';
      draftUi.approachInput.value = '';
      draftUi.approachInput.disabled = true;
      draftUi.legacyInput.value = '';
      draftUi.legacyRow.style.display = 'none';
      setPushButtonState(true, 'Push to GitHub');
      setDraftStatus(error || 'Nothing is pushed automatically.');
      return;
    }

    const nextDraftKey = `${draft.levelId}:${draft.capturedAt}`;
    if (currentDraftKey !== nextDraftKey) {
      draftUi.approachInput.value = '';
      draftUi.legacyInput.value = '';
      draftUi.legacyRow.style.display = 'none';
    }
    currentDraftKey = nextDraftKey;
    draftUi.name.textContent = draft.targetName || `Target ${draft.levelId}`;
    draftUi.stats.textContent = `${draft.score} score · ${draft.charCount} chars · ready locally`;
    draftUi.approachInput.disabled = false;
    setPushButtonState(false, 'Push to GitHub');
    setDraftStatus(error || 'Name the approach, then push when you are ready.');
  }

  function createDraftPanel() {
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Solution draft');
    panel.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.08);
    `;

    const heading = document.createElement('div');
    heading.textContent = 'Publish draft';
    heading.style.cssText = `
      color: #ffcc00;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    `;

    const summary = document.createElement('div');
    summary.style.cssText = `
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 10px;
      align-items: baseline;
    `;
    const name = document.createElement('strong');
    name.style.cssText = `
      min-width: 0;
      overflow: hidden;
      color: #e6edf3;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    const stats = document.createElement('span');
    stats.style.cssText = `
      grid-column: 1 / -1;
      color: #8899aa;
      font-size: 11px;
    `;
    summary.append(name, stats);

    const suggestionsId = 'cssbattle-approach-name-suggestions';
    const approachLabel = document.createElement('label');
    approachLabel.textContent = 'Approach name';
    approachLabel.htmlFor = 'cssbattle-approach-name';
    approachLabel.style.cssText = `
      color: #aeb8c4;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    `;

    const approachInput = document.createElement('input');
    approachInput.id = 'cssbattle-approach-name';
    approachInput.type = 'text';
    approachInput.maxLength = 80;
    approachInput.setAttribute('list', suggestionsId);
    approachInput.placeholder = 'e.g. Nested template with gradients';
    approachInput.autocomplete = 'off';
    approachInput.style.cssText = `
      width: 100%;
      padding: 9px 10px;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 6px;
      outline: none;
      background: #11161c;
      color: #f0f3f6;
      font: 11px/1.4 'SFMono-Regular', Consolas, monospace;
      box-sizing: border-box;
    `;
    approachInput.addEventListener('focus', () => {
      approachInput.style.borderColor = '#ffcc00';
    });
    approachInput.addEventListener('blur', () => {
      approachInput.style.borderColor = 'rgba(255,255,255,0.14)';
    });

    const suggestions = document.createElement('datalist');
    suggestions.id = suggestionsId;
    [
      'Nested template with gradients',
      'Multiple elements with margin positioning',
      'Multiple elements with gradients + margin positioning',
      'Multiple elements with gradients + clip-path',
      'Background only with gradients',
      'Single element with gradient + box-shadow',
      'Multiple elements with margin positioning + box-shadow'
    ].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      suggestions.appendChild(option);
    });

    const legacyRow = document.createElement('div');
    legacyRow.style.cssText = 'display: none; flex-direction: column; gap: 6px;';
    const legacyLabel = document.createElement('label');
    legacyLabel.textContent = 'Previously saved approach name';
    legacyLabel.htmlFor = 'cssbattle-legacy-approach-name';
    legacyLabel.style.cssText = approachLabel.style.cssText;
    const legacyInput = document.createElement('input');
    legacyInput.id = 'cssbattle-legacy-approach-name';
    legacyInput.type = 'text';
    legacyInput.maxLength = 80;
    legacyInput.placeholder = 'Name the older solution once';
    legacyInput.autocomplete = 'off';
    legacyInput.style.cssText = approachInput.style.cssText;
    legacyRow.append(legacyLabel, legacyInput);

    const status = document.createElement('p');
    status.id = 'cssbattle-draft-status';
    status.setAttribute('role', 'status');
    status.style.cssText = `
      min-height: 16px;
      margin: 0;
      color: #8899aa;
      font-size: 10px;
      line-height: 1.5;
    `;

    const pushButton = document.createElement('button');
    pushButton.id = 'cssbattle-push-solution';
    pushButton.type = 'button';
    pushButton.textContent = 'Push to GitHub';
    pushButton.style.cssText = `
      width: 100%;
      padding: 9px 12px;
      border: 1px solid #ffcc00;
      border-radius: 6px;
      background: transparent;
      color: #ffcc00;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    `;
    panel.append(
      heading,
      summary,
      approachLabel,
      approachInput,
      suggestions,
      legacyRow,
      status,
      pushButton
    );

    draftUi = {
      name,
      stats,
      approachInput,
      legacyRow,
      legacyInput,
      status,
      pushButton
    };
    renderSolutionDraft(null);
    return panel;
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
      padding: 12px;
      border-radius: 10px;
      background: rgba(24, 29, 35, 0.96);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      backdrop-filter: blur(8px);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    `;

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
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
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
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 9px;
        background: ${plugin.category === 'template' ? '#34384a' : '#21262d'};
        color: #e0e0e0;
        font-size: 12px;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s, transform 0.05s;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.background = plugin.category === 'template' ? '#41475d' : '#30363d'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = plugin.category === 'template' ? '#34384a' : '#21262d'; });
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
      border-radius: 6px;
      background: transparent;
      color: #8899aa;
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
    toolbar.appendChild(createDraftPanel());

    sponsorContainer.appendChild(toolbar);
    requestSolutionDraft();
    return true;
  }

  function notifyVisibilityChange(visible) {
    window.postMessage({
      source: 'cssbattle-archive-ui',
      type: 'TOOLBAR_VISIBILITY_CHANGED',
      payload: { visible }
    }, '*');
  }

  window.addEventListener('message', event => {
    if (event.data?.source !== 'cssbattle-archive-ui') return;
    const { type, payload } = event.data;

    if (type === 'SOLUTION_DRAFT_STATE') {
      renderSolutionDraft(payload?.draft || null, payload?.error || '');
      if (payload?.draft) showToast('Solution saved as a local draft');
      return;
    }

    if (type === 'SOLUTION_DRAFT_PUSH_RESULT') {
      if (payload?.success) {
        renderSolutionDraft(null);
        showToast('Solution published to GitHub');
        return;
      }

      if (draftUi) {
        setPushButtonState(false, 'Push to GitHub');
        if (payload?.requiresExistingApproachLabel) {
          draftUi.legacyRow.style.display = 'flex';
          draftUi.legacyInput.focus();
        }
      }
      setDraftStatus(payload?.error || 'Could not push this draft.', 'error');
    }
  });

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
