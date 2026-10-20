const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const decisionSource = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'publish-decision.js'),
  'utf8'
);

function loadDecision() {
  const context = vm.createContext({ console });
  vm.runInContext(decisionSource, context);
  const raw = context.__cssbattlePublishDecision;
  // Results come from a separate vm realm, so re-plain them before
  // assert.deepStrictEqual trips on differing Object prototypes.
  const plain = value => JSON.parse(JSON.stringify(value));
  return {
    decide: (...args) => plain(raw.decide(...args)),
    compareScores: raw.compareScores,
    initialSelection: (...args) => plain(raw.initialSelection(...args))
  };
}

const { decide, compareScores, initialSelection } = loadDecision();

function makeDraft(overrides = {}) {
  return {
    levelId: 'daily-1',
    targetName: 'Daily Target',
    score: 600,
    charCount: 100,
    ...overrides
  };
}

function makeApproach(overrides = {}) {
  return {
    id: 'a1',
    label: 'Flexbox',
    score: 500,
    characters: 120,
    ...overrides
  };
}

function makeNamedContext(overrides = {}) {
  return {
    legacy: false,
    legacySolution: null,
    approaches: [
      makeApproach(),
      makeApproach({ id: 'a2', label: 'Grid', score: 650, characters: 90 })
    ],
    bestApproachId: 'a2',
    canCreate: true,
    maxApproaches: 3,
    ...overrides
  };
}

function makeLegacyContext(overrides = {}) {
  return {
    legacy: true,
    legacySolution: { score: 550, characters: 110 },
    approaches: [],
    bestApproachId: null,
    canCreate: true,
    maxApproaches: 3,
    ...overrides
  };
}

function baseSelection(overrides = {}) {
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
    insightValue: '',
    insightDataset: '',
    ...overrides
  };
}

test('first approach renders a create view and payload', () => {
  const { view, payload } = decide(makeDraft(), { ...makeNamedContext(), approaches: [] }, baseSelection({ approachInputValue: 'My approach' }));
  assert.equal(view.kind, 'first');
  assert.equal(view.confirmLabel, 'Create approach');
  assert.equal(view.comparison, null);
  assert.equal(view.warning, null);
  assert.deepEqual(payload, { mode: 'create', approachLabel: 'My approach', insight: '' });
});

test('named create lists approaches plus an enabled New approach choice', () => {
  const { view, payload } = decide(
    makeDraft(),
    makeNamedContext(),
    baseSelection({ mode: 'create', newApproachName: 'Draft name', approachInputValue: 'Typed' })
  );
  assert.equal(view.kind, 'named-create');
  assert.equal(view.namedChoices.length, 3);
  assert.equal(view.namedChoices[2].id, 'create');
  assert.equal(view.namedChoices[2].disabled, false);
  assert.equal(view.namedChoices[2].checked, true);
  assert.equal(view.approachInputValue, 'Draft name');
  assert.equal(view.confirmLabel, 'Create approach');
  assert.deepEqual(payload, { mode: 'create', approachLabel: 'Typed', insight: '' });
});

test('named create disables New approach at the maximum with an explanatory note', () => {
  const ctx = makeNamedContext({
    approaches: [makeApproach(), makeApproach({ id: 'a2' }), makeApproach({ id: 'a3' })],
    canCreate: false
  });
  const { view } = decide(makeDraft(), ctx, baseSelection({ mode: 'create' }));
  const createChoice = view.namedChoices[view.namedChoices.length - 1];
  assert.equal(createChoice.disabled, true);
  assert.match(createChoice.note, /Maximum of 3 approaches reached/);
});

test('updating with a better draft keeps Update approach and no warning', () => {
  const { view, payload } = decide(
    makeDraft({ score: 700, charCount: 80 }),
    makeNamedContext(),
    baseSelection({ mode: 'update', selectedApproachId: 'a1' })
  );
  assert.equal(view.kind, 'named-update');
  assert.equal(view.regression, false);
  assert.equal(view.warning, null);
  assert.equal(view.confirmLabel, 'Update approach');
  assert.match(view.comparison.savedHtml, /500 score/);
  assert.deepEqual(payload, {
    mode: 'update',
    approachId: 'a1',
    approachLabel: 'Flexbox',
    confirmRegression: false,
    insight: ''
  });
});

test('updating with a worse draft requires explicit confirmation', () => {
  const { view, payload } = decide(
    makeDraft({ score: 400, charCount: 150 }),
    makeNamedContext(),
    baseSelection({ mode: 'update', selectedApproachId: 'a1' })
  );
  assert.equal(view.regression, true);
  assert.equal(view.confirmLabel, 'Update anyway');
  assert.match(view.warning, /This replaces 500 score/);
  assert.equal(payload.confirmRegression, true);
});

test('rename prefill uses the saved label until the input is synced', () => {
  const sel = baseSelection({
    mode: 'update',
    selectedApproachId: 'a1',
    renameEnabled: true,
    approachInputValue: '',
    approachInputDataset: ''
  });
  const { view, payload } = decide(makeDraft({ score: 700, charCount: 80 }), makeNamedContext(), sel);
  assert.equal(view.approachInputValue, 'Flexbox');
  assert.equal(view.approachDatasetId, 'a1');
  assert.equal(view.renameButtonLabel, 'Keep current name');
  assert.equal(view.confirmLabel, 'Update approach');
  assert.equal(payload.approachLabel, 'Flexbox');
});

test('rename with synced but differing text offers update and rename', () => {
  const sel = baseSelection({
    mode: 'update',
    selectedApproachId: 'a1',
    renameEnabled: true,
    approachInputValue: 'Custom name',
    approachInputDataset: 'a1'
  });
  const { view, payload } = decide(makeDraft({ score: 700, charCount: 80 }), makeNamedContext(), sel);
  assert.equal(view.approachInputValue, null);
  assert.equal(view.confirmLabel, 'Update and rename');
  assert.equal(payload.approachLabel, 'Custom name');
});

test('rename keeps typed text once the input is synced and confirms plain update on match', () => {
  const sel = baseSelection({
    mode: 'update',
    selectedApproachId: 'a1',
    renameEnabled: true,
    approachInputValue: 'Flexbox',
    approachInputDataset: 'a1'
  });
  const { view } = decide(makeDraft({ score: 700, charCount: 80 }), makeNamedContext(), sel);
  assert.equal(view.approachInputValue, null);
  assert.equal(view.confirmLabel, 'Update approach');
});

test('legacy replace updates while legacy preserve creates', () => {
  const replace = decide(
    makeDraft({ score: 600, charCount: 100 }),
    makeLegacyContext(),
    baseSelection({ legacyMode: 'replace', approachInputValue: 'Named' })
  );
  assert.equal(replace.view.kind, 'legacy');
  assert.equal(replace.view.confirmLabel, 'Update approach');
  assert.deepEqual(replace.payload, {
    mode: 'update',
    legacyMode: 'replace',
    approachLabel: 'Named',
    legacyApproachLabel: '',
    confirmRegression: false,
    insight: ''
  });

  const preserve = decide(
    makeDraft(),
    makeLegacyContext(),
    baseSelection({ legacyMode: 'preserve', approachInputValue: 'New', legacyInputValue: 'Old' })
  );
  assert.equal(preserve.view.confirmLabel, 'Create approach');
  assert.match(preserve.view.comparison.draftHtml, /New draft/);
  assert.deepEqual(preserve.payload, {
    mode: 'create',
    legacyMode: 'preserve',
    approachLabel: 'New',
    legacyApproachLabel: 'Old',
    confirmRegression: false,
    insight: ''
  });
});

test('forced regression details drive the warning text', () => {
  const forcedRegression = {
    existing: { score: 800, characters: 70 },
    draft: { score: 600, characters: 100 }
  };
  const { view } = decide(
    makeDraft({ score: 900, charCount: 60 }),
    makeNamedContext(),
    baseSelection({ mode: 'update', selectedApproachId: 'a1', forcedRegression })
  );
  assert.equal(view.regression, true);
  assert.equal(view.confirmLabel, 'Update anyway');
  assert.match(view.warning, /This replaces 800 score · 70 chars with 600 score · 100 chars/);
});

test('compareScores ranks score first, then fewer characters, then tie', () => {
  assert.ok(compareScores(makeDraft({ score: 700 }), { score: 500, characters: 10 }) > 0);
  assert.ok(compareScores(makeDraft({ score: 400 }), { score: 500, characters: 10 }) < 0);
  assert.ok(compareScores(makeDraft({ score: 500, charCount: 80 }), { score: 500, characters: 100 }) > 0);
  assert.equal(compareScores(makeDraft({ score: 500, charCount: 100 }), { score: 500, characters: 100 }), 0);
  assert.equal(compareScores(makeDraft(), null), 0);
});

test('initialSelection prefers update of the first approach, else legacy update, else create', () => {
  const named = initialSelection(makeNamedContext());
  assert.deepStrictEqual(named, { mode: 'update', selectedApproachId: 'a1' });
  assert.deepStrictEqual(initialSelection(makeLegacyContext()), { mode: 'update', selectedApproachId: '' });
  assert.deepStrictEqual(
    initialSelection({ ...makeNamedContext(), approaches: [] }),
    { mode: 'create', selectedApproachId: '' }
  );
});

test('payload carries insight on create, update and legacy', () => {
  const insightValue = 'One shadow draws both circles';
  const first = decide(
    makeDraft(),
    { ...makeNamedContext(), approaches: [] },
    baseSelection({ approachInputValue: 'Shadow', insightValue })
  );
  assert.equal(first.payload.insight, insightValue);

  const created = decide(makeDraft(), makeNamedContext(), baseSelection({ mode: 'create', insightValue }));
  assert.equal(created.payload.insight, insightValue);

  const updated = decide(
    makeDraft(),
    makeNamedContext(),
    baseSelection({ mode: 'update', selectedApproachId: 'a1', insightValue, insightDataset: 'a1' })
  );
  assert.equal(updated.payload.insight, insightValue);

  const legacy = decide(makeDraft(), makeLegacyContext(), baseSelection({ mode: 'update', insightValue }));
  assert.equal(legacy.payload.insight, insightValue);
});

test('update view prefills selected approach insight', () => {
  const ctx = makeNamedContext({
    approaches: [makeApproach({ insight: 'Saved trick' }), makeApproach({ id: 'a2', label: 'Grid' })]
  });

  // Field not yet synced to a1: show and send the saved insight.
  const fresh = decide(makeDraft(), ctx, baseSelection({ mode: 'update', selectedApproachId: 'a1' }));
  assert.equal(fresh.view.insightPrefill, 'Saved trick');
  assert.equal(fresh.view.insightDatasetId, 'a1');
  assert.equal(fresh.payload.insight, 'Saved trick');

  // Field synced to a1 and edited: keep what the author typed.
  const edited = decide(
    makeDraft(),
    ctx,
    baseSelection({ mode: 'update', selectedApproachId: 'a1', insightDataset: 'a1', insightValue: 'Edited' })
  );
  assert.equal(edited.view.insightPrefill, null);
  assert.equal(edited.payload.insight, 'Edited');

  // Switching to an approach without an insight clears the field.
  const switched = decide(
    makeDraft(),
    ctx,
    baseSelection({ mode: 'update', selectedApproachId: 'a2', insightDataset: 'a1', insightValue: 'Saved trick' })
  );
  assert.equal(switched.view.insightPrefill, '');
  assert.equal(switched.payload.insight, '');
});

test('switching from update to create clears a prefilled insight', () => {
  const { view, payload } = decide(
    makeDraft(),
    makeNamedContext(),
    baseSelection({ mode: 'create', insightDataset: 'a1', insightValue: 'Saved trick' })
  );
  assert.equal(view.insightPrefill, '');
  assert.equal(view.insightDatasetId, '');
  assert.equal(payload.insight, '');
});
