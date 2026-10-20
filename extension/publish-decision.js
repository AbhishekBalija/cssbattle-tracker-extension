/**
 * CSSBattle Tracker — Publish Decision
 *
 * Pure publish-wizard logic with no DOM or chrome dependencies.
 * decide(draft, publishContext, selection) -> { view, payload }.
 * The modal in publish-ui.js renders the view and sends the payload.
 *
 * Loaded before publish-ui.js (see manifest.json) and exposed as
 * window.__cssbattlePublishDecision for the renderer. Unit-tested
 * directly with node --test (see tests/publish-decision.test.js).
 */

(function () {
  'use strict';

  /**
   * Compare a draft against a saved approach.
   * Positive: draft is better. Negative: draft is worse. Zero: tie.
   */
  function compareScores(draft, saved) {
    if (!saved) return 0;
    if (draft.score !== saved.score) return draft.score - saved.score;
    if (draft.charCount !== saved.characters) {
      return saved.characters - draft.charCount;
    }
    return 0;
  }

  /**
   * Starting wizard selection once the publish context has loaded.
   * Mirrors the previous inline init in loadPublishContext.
   */
  function initialSelection(publishContext) {
    if (publishContext.approaches.length > 0) {
      return { mode: 'update', selectedApproachId: publishContext.approaches[0].id };
    }
    return { mode: publishContext.legacy ? 'update' : 'create', selectedApproachId: '' };
  }

  function withDefaults(selection) {
    return {
      mode: 'create',
      selectedApproachId: '',
      renameEnabled: false,
      legacyMode: 'replace',
      newApproachName: '',
      forcedRegression: null,
      approachInputValue: '',
      approachInputDataset: '',
      legacyInputValue: '',
      ...selection
    };
  }

  function comparisonBlock(draft, saved, draftCaption, forcedRegression) {
    const regression = compareScores(draft, saved) < 0 || forcedRegression !== null;
    const details = forcedRegression || {
      existing: { score: saved.score, characters: saved.characters },
      draft: { score: draft.score, characters: draft.charCount }
    };
    return {
      comparison: {
        savedHtml: `<strong>Saved</strong>${saved.score} score · ${saved.characters} chars`,
        draftHtml: `<strong>${draftCaption}</strong>${draft.score} score · ${draft.charCount} chars`
      },
      warning: regression
        ? `This replaces ${details.existing.score} score · ${details.existing.characters} chars with ${details.draft.score} score · ${details.draft.characters} chars.`
        : null,
      regression
    };
  }

  function decideLegacy(draft, publishContext, sel) {
    const isPreserving = sel.legacyMode === 'preserve';
    let comparison = null;
    let warning = null;
    let regression = false;
    if (isPreserving) {
      comparison = {
        savedHtml: `<strong>Saved</strong>${publishContext.legacySolution.score} score · ${publishContext.legacySolution.characters} chars`,
        draftHtml: `<strong>New draft</strong>${draft.score} score · ${draft.charCount} chars`
      };
    } else {
      ({ comparison, warning, regression } = comparisonBlock(
        draft,
        publishContext.legacySolution,
        'Draft',
        sel.forcedRegression
      ));
    }
    const confirmLabel = regression
      ? 'Update anyway'
      : isPreserving
        ? 'Create approach'
        : 'Update approach';
    return {
      view: {
        kind: 'legacy',
        choiceGroupHidden: true,
        legacyGroupHidden: false,
        legacyFieldHidden: !isPreserving,
        renameButtonHidden: true,
        renameButtonLabel: 'Rename approach',
        approachFieldHidden: false,
        approachFieldLabel: isPreserving ? 'New approach name' : 'Approach name',
        approachFieldHelp: isPreserving
          ? 'This name describes the new draft.'
          : 'Name the saved approach while replacing it with this draft.',
        approachInputValue: null,
        approachDatasetId: null,
        clearApproachDataset: false,
        comparison,
        warning,
        regression,
        confirmLabel,
        namedChoices: null,
        legacyReplaceChecked: !isPreserving,
        legacyPreserveChecked: isPreserving
      },
      payload: {
        mode: isPreserving ? 'create' : 'update',
        legacyMode: sel.legacyMode,
        approachLabel: sel.approachInputValue.trim(),
        legacyApproachLabel: sel.legacyInputValue.trim(),
        confirmRegression: regression
      }
    };
  }

  function decideNamed(draft, publishContext, sel) {
    const namedChoices = publishContext.approaches.map(item => ({
      id: item.id,
      label: item.label,
      statsText: `${item.score} · ${item.characters} chars`,
      best: item.id === publishContext.bestApproachId,
      checked: sel.mode === 'update' && sel.selectedApproachId === item.id
    }));
    namedChoices.push({
      id: 'create',
      label: 'New approach',
      statsText: '',
      note: publishContext.canCreate
        ? 'Keep the saved approaches and add this draft.'
        : `Maximum of ${publishContext.maxApproaches} approaches reached.`,
      best: false,
      checked: sel.mode === 'create',
      disabled: !publishContext.canCreate
    });

    if (sel.mode === 'create') {
      return {
        view: {
          kind: 'named-create',
          choiceGroupHidden: false,
          legacyGroupHidden: true,
          legacyFieldHidden: true,
          renameButtonHidden: true,
          renameButtonLabel: 'Rename approach',
          approachFieldHidden: false,
          approachFieldLabel: 'Approach name',
          approachFieldHelp: 'Give this new approach a clear technique-based name.',
          approachInputValue: sel.newApproachName,
          approachDatasetId: null,
          clearApproachDataset: false,
          comparison: null,
          warning: null,
          regression: false,
          confirmLabel: 'Create approach',
          namedChoices,
          legacyReplaceChecked: false,
          legacyPreserveChecked: false
        },
        payload: {
          mode: 'create',
          approachLabel: sel.approachInputValue.trim()
        }
      };
    }

    const selected = publishContext.approaches.find(item => item.id === sel.selectedApproachId) || null;
    let comparison = null;
    let warning = null;
    let regression = false;
    if (selected) {
      ({ comparison, warning, regression } = comparisonBlock(draft, selected, 'Draft', sel.forcedRegression));
    }
    const effectiveInput = sel.renameEnabled
      ? (sel.approachInputDataset !== sel.selectedApproachId
        ? (selected ? selected.label : '')
        : sel.approachInputValue)
      : sel.approachInputValue;
    const confirmLabel = regression
      ? 'Update anyway'
      : sel.renameEnabled && effectiveInput.trim() !== selected?.label
        ? 'Update and rename'
        : 'Update approach';
    return {
      view: {
        kind: 'named-update',
        choiceGroupHidden: false,
        legacyGroupHidden: true,
        legacyFieldHidden: true,
        renameButtonHidden: false,
        renameButtonLabel: sel.renameEnabled ? 'Keep current name' : 'Rename approach',
        approachFieldHidden: !sel.renameEnabled,
        approachFieldLabel: 'New approach name',
        approachFieldHelp: 'The approach ID stays the same.',
        approachInputValue: sel.renameEnabled && sel.approachInputDataset !== sel.selectedApproachId
          ? (selected ? selected.label : '')
          : null,
        approachDatasetId: sel.renameEnabled ? sel.selectedApproachId : null,
        clearApproachDataset: !sel.renameEnabled,
        comparison,
        warning,
        regression,
        confirmLabel,
        namedChoices,
        legacyReplaceChecked: false,
        legacyPreserveChecked: false
      },
      payload: {
        mode: 'update',
        approachId: sel.selectedApproachId,
        approachLabel: sel.renameEnabled ? effectiveInput.trim() : (selected?.label || ''),
        confirmRegression: regression
      }
    };
  }

  function decideFirst(draft, sel) {
    return {
      view: {
        kind: 'first',
        choiceGroupHidden: true,
        legacyGroupHidden: true,
        legacyFieldHidden: true,
        renameButtonHidden: true,
        renameButtonLabel: 'Rename approach',
        approachFieldHidden: false,
        approachFieldLabel: 'Approach name',
        approachFieldHelp: 'Give this first approach a clear technique-based name.',
        approachInputValue: null,
        approachDatasetId: null,
        clearApproachDataset: false,
        comparison: null,
        warning: null,
        regression: false,
        confirmLabel: 'Create approach',
        namedChoices: null,
        legacyReplaceChecked: false,
        legacyPreserveChecked: false
      },
      payload: {
        mode: 'create',
        approachLabel: sel.approachInputValue.trim()
      }
    };
  }

  function decide(draft, publishContext, selection) {
    const sel = withDefaults(selection);
    if (publishContext.legacy) return decideLegacy(draft, publishContext, sel);
    if (publishContext.approaches.length > 0) return decideNamed(draft, publishContext, sel);
    return decideFirst(draft, sel);
  }

  const api = { decide, compareScores, initialSelection };
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.__cssbattlePublishDecision = api;
})();
