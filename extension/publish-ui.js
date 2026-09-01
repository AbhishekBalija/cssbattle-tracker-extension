/**
 * CSSBattle Tracker — Publish UI
 *
 * Adds an explicit Publish control beside CSSBattle's Submit button.
 * Submissions stay in local extension storage until the player confirms a
 * named approach in this modal.
 */

(function () {
  'use strict';

  if (window.__cssbattlePublishUiInjected) return;
  window.__cssbattlePublishUiInjected = true;

  const DRAFT_STORAGE_KEY = 'pendingSolutionDraft';
  const PUBLISH_BUTTON_ID = 'cssbattle-publish-button';
  const SUBMIT_MARKER = 'data-cssbattle-publish-submit';
  const GROUP_MARKER = 'data-cssbattle-publish-group';
  const MODAL_ID = 'cssbattle-publish-modal';
  const STYLE_ID = 'cssbattle-publish-styles';
  const APPROACH_SUGGESTIONS = [
    'Nested template with gradients',
    'Multiple elements with margin positioning',
    'Multiple elements with gradients + margin positioning',
    'Multiple elements with gradients + clip-path',
    'Background only with gradients',
    'Single element with gradient + box-shadow',
    'Multiple elements with margin positioning + box-shadow'
  ];

  let currentDraft = null;
  let lastFocusedElement = null;
  let modalKeydownHandler = null;
  let mountFrame = null;
  let positionFrame = null;
  let mountedSubmitButton = null;
  let mountedButtonGroup = null;
  let submitResizeObserver = null;

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${GROUP_MARKER}="true"] {
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
      }

      [${GROUP_MARKER}="true"] > button:nth-of-type(1),
      [${GROUP_MARKER}="true"] > button:nth-of-type(2) {
        grid-column: span 3;
      }

      [${GROUP_MARKER}="true"] > button:nth-of-type(3) {
        grid-column: span 2;
      }

      [${GROUP_MARKER}="true"] > button[${SUBMIT_MARKER}="true"] {
        grid-column: 5 / span 2;
        width: 100% !important;
        margin: 0 !important;
        min-width: 0 !important;
      }

      #${PUBLISH_BUTTON_ID} {
        position: fixed;
        z-index: 2147483645;
        display: none;
        min-width: 0;
        min-height: 0;
        padding: 0 22px;
        border: 1px solid #46545f;
        border-radius: 999px;
        background: #34424e;
        color: #f2f5f7;
        font: inherit;
        font-size: 15px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
        transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
      }

      #${PUBLISH_BUTTON_ID}:hover:not(:disabled) {
        border-color: #60707d;
        background: #3d4c58;
      }

      #${PUBLISH_BUTTON_ID}:focus-visible,
      #${MODAL_ID} button:focus-visible,
      #${MODAL_ID} input:focus-visible {
        outline: 2px solid #ffdf00;
        outline-offset: 2px;
      }

      #${MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(5, 8, 11, 0.78);
        font-family: inherit;
        box-sizing: border-box;
      }

      #${MODAL_ID} *,
      #${MODAL_ID} *::before,
      #${MODAL_ID} *::after {
        box-sizing: border-box;
      }

      .cssbattle-publish-dialog {
        width: min(440px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        border: 1px solid #303b44;
        border-radius: 16px;
        background: #151b20;
        color: #edf2f5;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      }

      .cssbattle-publish-header {
        padding: 22px 24px 18px;
        border-bottom: 1px solid #29333b;
      }

      .cssbattle-publish-kicker {
        margin: 0 0 7px;
        color: #ffdf00;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .cssbattle-publish-title {
        margin: 0;
        color: #f4f7f8;
        font-size: 21px;
        font-weight: 750;
        line-height: 1.25;
      }

      .cssbattle-publish-body {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 20px 24px 24px;
      }

      .cssbattle-publish-summary {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid #29333b;
      }

      .cssbattle-publish-target {
        min-width: 0;
        overflow: hidden;
        color: #dbe3e8;
        font-size: 13px;
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cssbattle-publish-stats {
        flex: none;
        color: #90a0ad;
        font-size: 12px;
        white-space: nowrap;
      }

      .cssbattle-publish-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .cssbattle-publish-field[hidden] {
        display: none;
      }

      .cssbattle-publish-label {
        color: #aebac3;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .cssbattle-publish-input {
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid #34414b;
        border-radius: 8px;
        background: #0f1418;
        color: #f1f4f6;
        font: inherit;
        font-size: 14px;
      }

      .cssbattle-publish-input::placeholder {
        color: #687783;
      }

      .cssbattle-publish-help,
      .cssbattle-publish-status {
        margin: 0;
        color: #8797a4;
        font-size: 12px;
        line-height: 1.5;
      }

      .cssbattle-publish-status {
        min-height: 18px;
      }

      .cssbattle-publish-status[data-error='true'] {
        color: #ff8a80;
      }

      .cssbattle-publish-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding-top: 2px;
      }

      .cssbattle-publish-action {
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        font: inherit;
        font-size: 14px;
        font-weight: 750;
        cursor: pointer;
      }

      .cssbattle-publish-cancel {
        border: 1px solid #3a4650;
        background: #222b32;
        color: #dce3e7;
      }

      .cssbattle-publish-confirm {
        border: 1px solid #1875df;
        background: #0d6ad6;
        color: #ffffff;
      }

      .cssbattle-publish-action:hover:not(:disabled) {
        filter: brightness(1.08);
      }

      .cssbattle-publish-action:disabled {
        opacity: 0.65;
        cursor: wait;
      }

      .cssbattle-publish-toast {
        position: fixed;
        left: 50%;
        bottom: 28px;
        z-index: 2147483647;
        max-width: calc(100vw - 32px);
        padding: 10px 15px;
        border: 1px solid #3a4650;
        border-radius: 999px;
        background: #1b2329;
        color: #e9eef1;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        transform: translateX(-50%);
      }

      @media (max-width: 620px) {
        #${PUBLISH_BUTTON_ID} {
          padding-inline: 12px;
          font-size: 14px;
        }

        button[${SUBMIT_MARKER}="true"] .pill--key {
          display: none !important;
        }

        .cssbattle-publish-header {
          padding: 20px 20px 16px;
        }

        .cssbattle-publish-body {
          padding: 18px 20px 20px;
        }

        .cssbattle-publish-summary {
          align-items: flex-start;
          flex-direction: column;
          gap: 4px;
        }

        .cssbattle-publish-actions {
          display: grid;
          grid-template-columns: 1fr 1.35fr;
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function findSubmitButton() {
    return Array.from(document.querySelectorAll('button')).find(button => {
      if (button.id === PUBLISH_BUTTON_ID || button.closest(`#${MODAL_ID}`)) return false;
      return /^Submit/i.test(button.textContent.trim());
    }) || null;
  }

  function createPublishButton() {
    const button = document.createElement('button');
    button.id = PUBLISH_BUTTON_ID;
    button.type = 'button';
    button.dataset.cssbattlePublish = 'true';
    button.textContent = 'Publish';
    button.addEventListener('click', () => {
      if (!currentDraft) {
        showToast('Submit a scored solution first');
        return;
      }
      openModal();
    });
    return button;
  }

  function schedulePublishPosition() {
    if (positionFrame !== null) return;
    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = null;
      positionPublishButton();
    });
  }

  function positionPublishButton() {
    const publishButton = document.getElementById(PUBLISH_BUTTON_ID);
    if (!publishButton || !mountedSubmitButton?.isConnected) {
      if (publishButton) publishButton.style.display = 'none';
      return;
    }

    const submitRect = mountedSubmitButton.getBoundingClientRect();
    const topSolutionsButton = Array.from(mountedButtonGroup?.children || []).find(element =>
      element instanceof HTMLButtonElement && /^Top Solutions/i.test(element.textContent.trim())
    );
    const topSolutionsRect = topSolutionsButton?.getBoundingClientRect();
    const columnGap = Number.parseFloat(getComputedStyle(mountedButtonGroup).columnGap) || 0;
    if (!topSolutionsRect || submitRect.width <= 0 || submitRect.height <= 0) {
      publishButton.style.display = 'none';
      return;
    }

    const left = topSolutionsRect.right + columnGap;
    const right = submitRect.left - columnGap;
    publishButton.style.left = `${left}px`;
    publishButton.style.top = `${submitRect.top}px`;
    publishButton.style.width = `${Math.max(80, right - left)}px`;
    publishButton.style.height = `${submitRect.height}px`;
    publishButton.style.display = 'block';
  }

  function mountPublishButton() {
    addStyles();

    const submitButton = findSubmitButton();
    let publishButton = document.getElementById(PUBLISH_BUTTON_ID);
    if (!publishButton && document.body) {
      publishButton = createPublishButton();
      document.body.appendChild(publishButton);
    }

    if (!submitButton) {
      if (publishButton) publishButton.style.display = 'none';
      return;
    }

    if (mountedSubmitButton !== submitButton) {
      mountedSubmitButton?.removeAttribute(SUBMIT_MARKER);
      mountedButtonGroup?.removeAttribute(GROUP_MARKER);
      mountedSubmitButton = submitButton;
      mountedButtonGroup = submitButton.parentElement;
      submitResizeObserver?.disconnect();
      submitResizeObserver = new ResizeObserver(schedulePublishPosition);
      submitResizeObserver.observe(submitButton);
      if (mountedButtonGroup) submitResizeObserver.observe(mountedButtonGroup);
    }

    mountedButtonGroup?.setAttribute(GROUP_MARKER, 'true');
    if (submitButton.getAttribute(SUBMIT_MARKER) !== 'true') {
      submitButton.setAttribute(SUBMIT_MARKER, 'true');
    }
    updatePublishButton();
    schedulePublishPosition();
  }

  function updatePublishButton() {
    const button = document.getElementById(PUBLISH_BUTTON_ID);
    if (!button) return;
    button.title = currentDraft
      ? 'Name and publish the latest local draft'
      : 'Submit a scored solution first';
  }

  function makeField(id, labelText, placeholder, listId = '') {
    const field = document.createElement('div');
    field.className = 'cssbattle-publish-field';

    const label = document.createElement('label');
    label.className = 'cssbattle-publish-label';
    label.htmlFor = id;
    label.textContent = labelText;

    const input = document.createElement('input');
    input.className = 'cssbattle-publish-input';
    input.id = id;
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    if (listId) input.setAttribute('list', listId);

    field.append(label, input);
    return { field, input };
  }

  function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    if (modalKeydownHandler) document.removeEventListener('keydown', modalKeydownHandler);
    modalKeydownHandler = null;
    modal.remove();
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  function setModalStatus(status, message, isError = false) {
    status.textContent = message;
    status.dataset.error = String(isError);
  }

  function openModal() {
    if (!currentDraft || document.getElementById(MODAL_ID)) return;
    lastFocusedElement = document.activeElement;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'presentation');

    const dialog = document.createElement('section');
    dialog.className = 'cssbattle-publish-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cssbattle-publish-title');

    const header = document.createElement('header');
    header.className = 'cssbattle-publish-header';
    const kicker = document.createElement('p');
    kicker.className = 'cssbattle-publish-kicker';
    kicker.textContent = 'Publish solution';
    const title = document.createElement('h2');
    title.className = 'cssbattle-publish-title';
    title.id = 'cssbattle-publish-title';
    title.textContent = 'Name this approach';
    header.append(kicker, title);

    const body = document.createElement('div');
    body.className = 'cssbattle-publish-body';

    const summary = document.createElement('div');
    summary.className = 'cssbattle-publish-summary';
    const target = document.createElement('strong');
    target.className = 'cssbattle-publish-target';
    target.textContent = currentDraft.targetName || `Target ${currentDraft.levelId}`;
    const stats = document.createElement('span');
    stats.className = 'cssbattle-publish-stats';
    stats.textContent = `${currentDraft.score} score · ${currentDraft.charCount} chars`;
    summary.append(target, stats);

    const suggestionsId = 'cssbattle-approach-suggestions';
    const approach = makeField(
      'cssbattle-approach-name',
      'Approach name',
      'e.g. Nested template with gradients',
      suggestionsId
    );
    const suggestions = document.createElement('datalist');
    suggestions.id = suggestionsId;
    for (const value of APPROACH_SUGGESTIONS) {
      const option = document.createElement('option');
      option.value = value;
      suggestions.appendChild(option);
    }
    const help = document.createElement('p');
    help.className = 'cssbattle-publish-help';
    help.textContent = 'Use the same name later to update this approach.';
    approach.field.appendChild(help);

    const legacy = makeField(
      'cssbattle-legacy-approach-name',
      'Previously saved approach',
      'Name the older solution once'
    );
    legacy.field.hidden = true;

    const status = document.createElement('p');
    status.className = 'cssbattle-publish-status';
    status.setAttribute('role', 'status');

    const actions = document.createElement('div');
    actions.className = 'cssbattle-publish-actions';
    const cancelButton = document.createElement('button');
    cancelButton.className = 'cssbattle-publish-action cssbattle-publish-cancel';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', closeModal);
    const confirmButton = document.createElement('button');
    confirmButton.className = 'cssbattle-publish-action cssbattle-publish-confirm';
    confirmButton.type = 'button';
    confirmButton.textContent = 'Publish to GitHub';
    actions.append(cancelButton, confirmButton);

    confirmButton.addEventListener('click', async event => {
      if (!event.isTrusted || confirmButton.disabled) return;
      const approachLabel = approach.input.value.trim();
      if (!approachLabel) {
        setModalStatus(status, 'Enter an approach name before publishing.', true);
        approach.input.focus();
        return;
      }

      confirmButton.disabled = true;
      cancelButton.disabled = true;
      confirmButton.textContent = 'Publishing...';
      setModalStatus(status, 'Updating your GitHub archive.');

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'PUSH_DRAFT',
          payload: {
            approachLabel,
            legacyApproachLabel: legacy.input.value.trim()
          }
        });

        if (result?.success) {
          currentDraft = null;
          updatePublishButton();
          closeModal();
          showToast('Published to GitHub');
          return;
        }

        if (result?.requiresExistingApproachLabel) {
          legacy.field.hidden = false;
          legacy.input.focus();
        }
        setModalStatus(status, result?.error || 'Could not publish this draft.', true);
      } catch (error) {
        setModalStatus(status, error.message || 'Could not publish this draft.', true);
      } finally {
        if (document.contains(confirmButton)) {
          confirmButton.disabled = false;
          cancelButton.disabled = false;
          confirmButton.textContent = 'Publish to GitHub';
        }
      }
    });

    body.append(summary, approach.field, suggestions, legacy.field, status, actions);
    dialog.append(header, body);
    modal.appendChild(dialog);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.body.appendChild(modal);

    modalKeydownHandler = event => {
      if (event.key === 'Escape') {
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')
      ).filter(element => !element.closest('[hidden]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', modalKeydownHandler);
    approach.input.focus();
  }

  function showToast(message) {
    if (!document.body) return;
    document.querySelector('.cssbattle-publish-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'cssbattle-publish-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  async function loadDraft() {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_DRAFT' });
      currentDraft = result?.draft || null;
    } catch (error) {
      console.error('[CSSBattle Tracker] Failed to read local draft:', error);
      currentDraft = null;
    }
    updatePublishButton();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[DRAFT_STORAGE_KEY]) return;
    const previousDraft = currentDraft;
    currentDraft = changes[DRAFT_STORAGE_KEY].newValue || null;
    updatePublishButton();
    if (currentDraft && currentDraft.capturedAt !== previousDraft?.capturedAt) {
      showToast('Draft saved locally');
    }
  });

  function start() {
    addStyles();
    mountPublishButton();
    loadDraft();

    const observer = new MutationObserver(() => {
      if (mountFrame !== null) return;
      mountFrame = window.requestAnimationFrame(() => {
        mountFrame = null;
        mountPublishButton();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', schedulePublishPosition);
    window.addEventListener('scroll', schedulePublishPosition, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
