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

      .cssbattle-publish-status:empty {
        min-height: 0;
      }

      .cssbattle-publish-choice-group {
        min-width: 0;
        margin: 0;
        padding: 0;
        border: 0;
      }

      .cssbattle-publish-choice-title {
        margin: 0 0 8px;
        padding: 0;
        color: #aebac3;
        font-size: 11px;
        font-weight: 750;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .cssbattle-publish-choice-list {
        border-block: 1px solid #29333b;
      }

      .cssbattle-publish-choice {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        padding: 8px 2px;
        color: #dbe3e8;
        cursor: pointer;
      }

      .cssbattle-publish-choice + .cssbattle-publish-choice {
        border-top: 1px solid #29333b;
      }

      .cssbattle-publish-choice:has(input:focus-visible) {
        outline: 2px solid #ffdf00;
        outline-offset: 2px;
      }

      .cssbattle-publish-choice[data-disabled='true'] {
        color: #687783;
        cursor: not-allowed;
      }

      .cssbattle-publish-choice input {
        width: 17px;
        height: 17px;
        margin: 0;
        accent-color: #ffdf00;
      }

      .cssbattle-publish-choice-copy {
        min-width: 0;
      }

      .cssbattle-publish-choice-name {
        display: block;
        overflow-wrap: anywhere;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.35;
      }

      .cssbattle-publish-choice-note,
      .cssbattle-publish-choice-stats {
        color: #8797a4;
        font-size: 11px;
        line-height: 1.35;
      }

      .cssbattle-publish-choice-stats {
        text-align: end;
        white-space: nowrap;
      }

      .cssbattle-publish-choice-stats[data-best='true'] {
        color: #ffdf00;
      }

      .cssbattle-publish-comparison {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding-block: 2px;
      }

      .cssbattle-publish-comparison p {
        margin: 0;
        color: #8797a4;
        font-size: 12px;
        line-height: 1.45;
      }

      .cssbattle-publish-comparison strong {
        display: block;
        color: #dbe3e8;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .cssbattle-publish-inline-action,
      .cssbattle-publish-retry {
        align-self: flex-start;
        padding: 0;
        border: 0;
        background: transparent;
        color: #ffdf00;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .cssbattle-publish-warning {
        margin: 0;
        padding: 10px 12px;
        border-left: 3px solid #ffb74d;
        background: rgba(255, 183, 77, 0.08);
        color: #ffd39a;
        font-size: 12px;
        line-height: 1.45;
      }

      .cssbattle-publish-warning[hidden],
      .cssbattle-publish-retry[hidden] {
        display: none;
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

        .cssbattle-publish-choice {
          grid-template-columns: auto minmax(0, 1fr);
        }

        .cssbattle-publish-choice-stats {
          grid-column: 2;
          text-align: start;
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
      if (!isDraftForCurrentTarget(currentDraft)) {
        showToast(`Draft belongs to ${currentDraft.targetName || 'another target'}`);
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
    const referenceStyles = getComputedStyle(topSolutionsButton || mountedSubmitButton);
    publishButton.style.fontFamily = referenceStyles.fontFamily;
    publishButton.style.fontSize = referenceStyles.fontSize;
    publishButton.style.fontWeight = referenceStyles.fontWeight;
    publishButton.style.letterSpacing = referenceStyles.letterSpacing;
    publishButton.style.textTransform = referenceStyles.textTransform;
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
    button.title = !currentDraft
      ? 'Submit a scored solution first'
      : isDraftForCurrentTarget(currentDraft)
        ? 'Review and publish the latest local draft'
        : `Draft belongs to ${currentDraft.targetName || 'another target'}`;
  }

  function getCurrentTargetId() {
    const match = location.pathname.match(/^\/play\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function isDraftForCurrentTarget(draft) {
    const currentTargetId = getCurrentTargetId();
    return !currentTargetId || !draft?.levelId || currentTargetId === String(draft.levelId);
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

    let publishContext = null;
    let mode = 'create';
    let selectedApproachId = '';
    let renameEnabled = false;
    let legacyMode = 'replace';
    let newApproachName = '';
    let forcedRegression = null;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'presentation');

    const dialog = document.createElement('section');
    dialog.className = 'cssbattle-publish-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cssbattle-publish-title');
    dialog.setAttribute('aria-describedby', 'cssbattle-publish-status');

    const header = document.createElement('header');
    header.className = 'cssbattle-publish-header';
    const kicker = document.createElement('p');
    kicker.className = 'cssbattle-publish-kicker';
    kicker.textContent = 'Publish solution';
    const title = document.createElement('h2');
    title.className = 'cssbattle-publish-title';
    title.id = 'cssbattle-publish-title';
    title.textContent = 'Publish draft';
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

    const choiceGroup = document.createElement('fieldset');
    choiceGroup.className = 'cssbattle-publish-choice-group';
    choiceGroup.hidden = true;
    const choiceTitle = document.createElement('legend');
    choiceTitle.className = 'cssbattle-publish-choice-title';
    choiceTitle.textContent = 'Choose what to publish';
    const choiceList = document.createElement('div');
    choiceList.className = 'cssbattle-publish-choice-list';
    choiceGroup.append(choiceTitle, choiceList);

    const legacyGroup = document.createElement('fieldset');
    legacyGroup.className = 'cssbattle-publish-choice-group';
    legacyGroup.hidden = true;
    const legacyTitle = document.createElement('legend');
    legacyTitle.className = 'cssbattle-publish-choice-title';
    legacyTitle.textContent = 'How should the saved solution be handled?';
    const legacyChoices = document.createElement('div');
    legacyChoices.className = 'cssbattle-publish-choice-list';
    legacyGroup.append(legacyTitle, legacyChoices);

    const comparison = document.createElement('div');
    comparison.className = 'cssbattle-publish-comparison';
    comparison.hidden = true;
    const savedComparison = document.createElement('p');
    const draftComparison = document.createElement('p');
    comparison.append(savedComparison, draftComparison);

    const warning = document.createElement('p');
    warning.className = 'cssbattle-publish-warning';
    warning.setAttribute('role', 'alert');
    warning.hidden = true;

    const suggestionsId = 'cssbattle-approach-suggestions';
    const approach = makeField(
      'cssbattle-approach-name',
      'Approach name',
      'e.g. Nested template with gradients',
      suggestionsId
    );
    approach.field.hidden = true;
    const approachLabelElement = approach.field.querySelector('.cssbattle-publish-label');
    const approachHelp = document.createElement('p');
    approachHelp.className = 'cssbattle-publish-help';
    approachHelp.id = 'cssbattle-approach-help';
    approach.input.setAttribute('aria-describedby', approachHelp.id);
    approach.field.appendChild(approachHelp);

    const suggestions = document.createElement('datalist');
    suggestions.id = suggestionsId;
    for (const value of APPROACH_SUGGESTIONS) {
      const option = document.createElement('option');
      option.value = value;
      suggestions.appendChild(option);
    }

    const renameButton = document.createElement('button');
    renameButton.className = 'cssbattle-publish-inline-action';
    renameButton.type = 'button';
    renameButton.textContent = 'Rename approach';
    renameButton.hidden = true;

    const legacy = makeField(
      'cssbattle-legacy-approach-name',
      'Saved approach name',
      'Name the existing saved solution'
    );
    legacy.field.hidden = true;

    const status = document.createElement('p');
    status.id = 'cssbattle-publish-status';
    status.className = 'cssbattle-publish-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const retryButton = document.createElement('button');
    retryButton.className = 'cssbattle-publish-retry';
    retryButton.type = 'button';
    retryButton.textContent = 'Retry loading approaches';
    retryButton.hidden = true;

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
    confirmButton.textContent = 'Loading...';
    confirmButton.disabled = true;
    actions.append(cancelButton, confirmButton);

    function createChoice({ name, value, statsText = '', note = '', disabled = false, best = false }) {
      const label = document.createElement('label');
      label.className = 'cssbattle-publish-choice';
      label.dataset.disabled = String(disabled);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'cssbattle-publish-choice';
      input.value = value;
      input.disabled = disabled;
      const copy = document.createElement('span');
      copy.className = 'cssbattle-publish-choice-copy';
      const nameElement = document.createElement('span');
      nameElement.className = 'cssbattle-publish-choice-name';
      nameElement.textContent = name;
      copy.appendChild(nameElement);
      if (note) {
        const noteElement = document.createElement('span');
        noteElement.className = 'cssbattle-publish-choice-note';
        noteElement.textContent = note;
        copy.appendChild(noteElement);
      }
      const choiceStats = document.createElement('span');
      choiceStats.className = 'cssbattle-publish-choice-stats';
      choiceStats.dataset.best = String(best);
      choiceStats.textContent = statsText;
      label.append(input, copy, choiceStats);
      return { label, input };
    }

    function getSelectedApproach() {
      return publishContext?.approaches?.find(item => item.id === selectedApproachId) || null;
    }

    function compareWithDraft(saved) {
      if (!saved) return 0;
      if (currentDraft.score !== saved.score) return currentDraft.score - saved.score;
      if (currentDraft.charCount !== saved.characters) {
        return saved.characters - currentDraft.charCount;
      }
      return 0;
    }

    function renderComparison(saved) {
      if (!saved) {
        comparison.hidden = true;
        warning.hidden = true;
        return false;
      }
      comparison.hidden = false;
      savedComparison.innerHTML = `<strong>Saved</strong>${saved.score} score · ${saved.characters} chars`;
      draftComparison.innerHTML = `<strong>Draft</strong>${currentDraft.score} score · ${currentDraft.charCount} chars`;
      const isWorse = compareWithDraft(saved) < 0 || forcedRegression !== null;
      warning.hidden = !isWorse;
      if (isWorse) {
        const details = forcedRegression || {
          existing: { score: saved.score, characters: saved.characters },
          draft: { score: currentDraft.score, characters: currentDraft.charCount }
        };
        warning.textContent = `This replaces ${details.existing.score} score · ${details.existing.characters} chars with ${details.draft.score} score · ${details.draft.characters} chars.`;
      }
      return isWorse;
    }

    function renderNamedChoices() {
      choiceList.replaceChildren();
      for (const item of publishContext.approaches) {
        const choice = createChoice({
          name: item.label,
          value: `update:${item.id}`,
          statsText: `${item.score} · ${item.characters} chars`,
          best: item.id === publishContext.bestApproachId
        });
        choice.input.checked = mode === 'update' && selectedApproachId === item.id;
        choice.input.addEventListener('change', () => {
          if (!choice.input.checked) return;
          if (mode === 'create') newApproachName = approach.input.value;
          mode = 'update';
          selectedApproachId = item.id;
          renameEnabled = false;
          forcedRegression = null;
          renderState();
        });
        choiceList.appendChild(choice.label);
      }

      const newChoice = createChoice({
        name: 'New approach',
        value: 'create',
        note: publishContext.canCreate
          ? 'Keep the saved approaches and add this draft.'
          : `Maximum of ${publishContext.maxApproaches} approaches reached.`,
        disabled: !publishContext.canCreate
      });
      newChoice.input.checked = mode === 'create';
      newChoice.input.addEventListener('change', () => {
        if (!newChoice.input.checked) return;
        mode = 'create';
        renameEnabled = false;
        forcedRegression = null;
        renderState();
      });
      choiceList.appendChild(newChoice.label);
    }

    function renderLegacyChoices() {
      legacyChoices.replaceChildren();
      const replaceChoice = createChoice({
        name: 'Update saved solution',
        value: 'replace',
        note: 'Treat this draft as the optimized version of the saved approach.'
      });
      replaceChoice.input.name = 'cssbattle-legacy-choice';
      replaceChoice.input.checked = legacyMode === 'replace';
      replaceChoice.input.addEventListener('change', () => {
        if (!replaceChoice.input.checked) return;
        legacyMode = 'replace';
        forcedRegression = null;
        renderState();
      });
      const preserveChoice = createChoice({
        name: 'Add a different approach',
        value: 'preserve',
        note: 'Name the saved solution and keep both versions.'
      });
      preserveChoice.input.name = 'cssbattle-legacy-choice';
      preserveChoice.input.checked = legacyMode === 'preserve';
      preserveChoice.input.addEventListener('change', () => {
        if (!preserveChoice.input.checked) return;
        legacyMode = 'preserve';
        forcedRegression = null;
        renderState();
      });
      legacyChoices.append(replaceChoice.label, preserveChoice.label);
    }

    function renderState() {
      if (!publishContext) return;
      setModalStatus(status, '');
      retryButton.hidden = true;
      choiceGroup.hidden = publishContext.legacy || publishContext.approaches.length === 0;
      legacyGroup.hidden = !publishContext.legacy;
      legacy.field.hidden = true;
      renameButton.hidden = true;
      approach.field.hidden = false;

      if (publishContext.legacy) {
        renderLegacyChoices();
        const isPreserving = legacyMode === 'preserve';
        mode = isPreserving ? 'create' : 'update';
        approachLabelElement.textContent = isPreserving ? 'New approach name' : 'Approach name';
        approachHelp.textContent = isPreserving
          ? 'This name describes the new draft.'
          : 'Name the saved approach while replacing it with this draft.';
        legacy.field.hidden = !isPreserving;
        const isWorse = isPreserving ? false : renderComparison(publishContext.legacySolution);
        if (isPreserving) {
          comparison.hidden = false;
          savedComparison.innerHTML = `<strong>Saved</strong>${publishContext.legacySolution.score} score · ${publishContext.legacySolution.characters} chars`;
          draftComparison.innerHTML = `<strong>New draft</strong>${currentDraft.score} score · ${currentDraft.charCount} chars`;
          warning.hidden = true;
        }
        confirmButton.textContent = isWorse ? 'Update anyway' : isPreserving ? 'Create approach' : 'Update approach';
      } else if (publishContext.approaches.length > 0) {
        renderNamedChoices();
        if (mode === 'create') {
          comparison.hidden = true;
          warning.hidden = true;
          renameButton.hidden = true;
          approachLabelElement.textContent = 'Approach name';
          approachHelp.textContent = 'Give this new approach a clear technique-based name.';
          approach.input.value = newApproachName;
          confirmButton.textContent = 'Create approach';
        } else {
          const selected = getSelectedApproach();
          const isWorse = renderComparison(selected);
          renameButton.hidden = false;
          renameButton.textContent = renameEnabled ? 'Keep current name' : 'Rename approach';
          approach.field.hidden = !renameEnabled;
          approachLabelElement.textContent = 'New approach name';
          approachHelp.textContent = 'The approach ID stays the same.';
          if (renameEnabled && approach.input.dataset.approachId !== selectedApproachId) {
            approach.input.value = selected?.label || '';
            approach.input.dataset.approachId = selectedApproachId;
          }
          confirmButton.textContent = isWorse
            ? 'Update anyway'
            : renameEnabled && approach.input.value.trim() !== selected?.label
              ? 'Update and rename'
              : 'Update approach';
        }
      } else {
        comparison.hidden = true;
        warning.hidden = true;
        approachLabelElement.textContent = 'Approach name';
        approachHelp.textContent = 'Give this first approach a clear technique-based name.';
        confirmButton.textContent = 'Create approach';
      }

      confirmButton.disabled = false;
    }

    renameButton.addEventListener('click', () => {
      renameEnabled = !renameEnabled;
      forcedRegression = null;
      if (!renameEnabled) approach.input.dataset.approachId = '';
      renderState();
      if (renameEnabled) approach.input.focus();
    });

    approach.input.addEventListener('input', () => {
      if (mode === 'create' && !publishContext?.legacy) newApproachName = approach.input.value;
      if (mode === 'update' && renameEnabled && !warning.hidden) {
        confirmButton.textContent = 'Update anyway';
      } else if (mode === 'update' && renameEnabled) {
        const selected = getSelectedApproach();
        confirmButton.textContent = approach.input.value.trim() !== selected?.label
          ? 'Update and rename'
          : 'Update approach';
      }
    });

    function getPublishPayload() {
      if (publishContext.legacy) {
        return {
          mode: legacyMode === 'preserve' ? 'create' : 'update',
          legacyMode,
          approachLabel: approach.input.value.trim(),
          legacyApproachLabel: legacy.input.value.trim(),
          confirmRegression: !warning.hidden,
        };
      }
      if (mode === 'update') {
        const selected = getSelectedApproach();
        return {
          mode: 'update',
          approachId: selectedApproachId,
          approachLabel: renameEnabled ? approach.input.value.trim() : selected?.label || '',
          confirmRegression: !warning.hidden,
        };
      }
      return {
        mode: 'create',
        approachLabel: approach.input.value.trim(),
      };
    }

    async function loadPublishContext() {
      confirmButton.disabled = true;
      confirmButton.textContent = 'Loading...';
      retryButton.hidden = true;
      setModalStatus(status, 'Loading saved approaches.');
      try {
        const result = await chrome.runtime.sendMessage({ type: 'GET_PUBLISH_CONTEXT' });
        if (!result?.success) {
          setModalStatus(status, result?.error || 'Could not load saved approaches.', true);
          retryButton.hidden = false;
          return;
        }
        publishContext = result;
        currentDraft = result.draft || currentDraft;
        target.textContent = currentDraft.targetName || `Target ${currentDraft.levelId}`;
        stats.textContent = `${currentDraft.score} score · ${currentDraft.charCount} chars`;
        if (publishContext.approaches.length > 0) {
          mode = 'update';
          selectedApproachId = publishContext.approaches[0].id;
        } else {
          mode = publishContext.legacy ? 'update' : 'create';
        }
        renderState();
      } catch (error) {
        setModalStatus(status, error.message || 'Could not load saved approaches.', true);
        retryButton.hidden = false;
      }
    }

    retryButton.addEventListener('click', loadPublishContext);

    confirmButton.addEventListener('click', async event => {
      if (!event.isTrusted || confirmButton.disabled || !publishContext) return;
      const payload = getPublishPayload();
      if (!payload.approachLabel) {
        setModalStatus(status, 'Enter an approach name before publishing.', true);
        approach.input.focus();
        return;
      }
      if (publishContext.legacy && legacyMode === 'preserve' && !payload.legacyApproachLabel) {
        setModalStatus(status, 'Name the saved solution before keeping both approaches.', true);
        legacy.input.focus();
        return;
      }

      const idleButtonText = confirmButton.textContent;
      confirmButton.disabled = true;
      cancelButton.disabled = true;
      confirmButton.textContent = 'Publishing...';
      setModalStatus(status, 'Updating your GitHub archive.');

      try {
        const result = await chrome.runtime.sendMessage({ type: 'PUSH_DRAFT', payload });
        if (result?.success) {
          currentDraft = null;
          updatePublishButton();
          closeModal();
          showToast(result.warning || result.message || 'Published to GitHub');
          return;
        }
        if (result?.code === 'REGRESSION_CONFIRMATION_REQUIRED' && result.comparison) {
          forcedRegression = result.comparison;
          renderState();
          setModalStatus(status, result.error, true);
          return;
        }
        if (result?.code === 'STALE_APPROACH') retryButton.hidden = false;
        setModalStatus(status, result?.error || 'Could not publish this draft.', true);
      } catch (error) {
        setModalStatus(status, error.message || 'Could not publish this draft.', true);
      } finally {
        if (document.contains(confirmButton)) {
          confirmButton.disabled = false;
          cancelButton.disabled = false;
          if (confirmButton.textContent === 'Publishing...') confirmButton.textContent = idleButtonText;
        }
      }
    });

    body.append(
      summary,
      choiceGroup,
      legacyGroup,
      comparison,
      warning,
      approach.field,
      renameButton,
      legacy.field,
      suggestions,
      status,
      retryButton,
      actions
    );
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
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', modalKeydownHandler);
    loadPublishContext();
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
