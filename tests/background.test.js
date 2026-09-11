const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const backgroundSource = fs.readFileSync(
  path.join(__dirname, '..', 'extension', 'background.js'),
  'utf8'
);

function createBackgroundContext(options = {}) {
  const fetchCalls = [];
  const localStore = { ...(options.localStore || {}) };
  const syncStore = { ...(options.syncStore || {}) };
  const readStore = (store, keys) => {
    if (typeof keys === 'string') return { [keys]: store[keys] };
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map(key => [key, store[key]]));
    }
    if (keys && typeof keys === 'object') {
      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [key, store[key] ?? fallback])
      );
    }
    return { ...store };
  };
  const context = vm.createContext({
    console,
    TextDecoder,
    TextEncoder,
    URL,
    atob,
    btoa,
    fetch: async (...args) => {
      fetchCalls.push(args);
      if (options.fetch) return options.fetch(...args);
      throw new Error('Unexpected network request');
    },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        sendMessage: async () => {}
      },
      storage: {
        local: {
          async get(keys) { return readStore(localStore, keys); },
          async set(values) { Object.assign(localStore, values); },
          async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete localStore[key];
          }
        },
        sync: {
          async get(keys) { return readStore(syncStore, keys); },
          async set(values) { Object.assign(syncStore, values); }
        }
      }
    }
  });
  context.fetchCalls = fetchCalls;
  context.localStore = localStore;
  context.syncStore = syncStore;
  vm.runInContext(backgroundSource, context);
  return context;
}

function makeDraft(overrides = {}) {
  return {
    levelId: 'daily-1',
    targetName: 'Daily Target',
    challengeType: 'daily',
    score: 700,
    match: 100,
    charCount: 120,
    targetColors: ['#000000', '#ffffff'],
    submittedAt: '2026-09-01T10:00:00.000Z',
    validationTags: ['css'],
    pageUrl: 'https://cssbattle.dev/play/daily-1',
    targetImage: null,
    code: '<style>*{background:#000}',
    ...overrides
  };
}

function runMerge(context, records, draft, payload) {
  context.testInput = {
    records,
    draft,
    payload
  };
  const result = vm.runInContext(
    `mergeDraftIntoRecords(
      testInput.records,
      testInput.draft,
      testInput.payload,
      'data/daily/2026/09-september.json'
    )`,
    context
  );
  return JSON.parse(JSON.stringify(result));
}

test('new solutions are stored with one named approach', () => {
  const context = createBackgroundContext();
  const result = runMerge(context, [], makeDraft(), {
    mode: 'create',
    approachLabel: 'Nested template with gradients'
  });
  const solution = result.records[0];

  assert.equal(result.action, 'create');
  assert.equal(solution.approaches.length, 1);
  assert.equal(solution.approaches[0].label, 'Nested template with gradients');
  assert.equal(solution.bestApproachId, solution.approaches[0].id);
  assert.equal(solution.code, solution.approaches[0].code);
});

test('capturing a submission saves a draft without using the network', async () => {
  const context = createBackgroundContext();
  context.testDraft = makeDraft();

  const result = await vm.runInContext('saveSubmissionDraft(testDraft)', context);

  assert.equal(result.success, true);
  assert.equal(result.action, 'draft');
  assert.equal(context.fetchCalls.length, 0);
});

test('daily targets are filed by target date instead of submission date', () => {
  const context = createBackgroundContext();
  context.testDraft = makeDraft({
    targetName: 'Daily Target — Aug 31, 2026',
    submittedAt: '2026-09-01T10:00:00.000Z'
  });

  const solutionDate = vm.runInContext('getSolutionDate(testDraft)', context);
  const filePath = vm.runInContext('getFilePath(testDraft)', context);
  const solution = JSON.parse(JSON.stringify(
    vm.runInContext("buildSolutionObject(testDraft, 'Background only with gradients')", context)
  ));

  assert.equal(solutionDate, '2026-08-31');
  assert.equal(filePath, 'data/daily/2026/08-august.json');
  assert.equal(solution.date, '2026-08-31');
});

test('daily targets fall back to the captured ISO date when the title has no date', () => {
  const context = createBackgroundContext();
  context.testDraft = makeDraft({ targetName: 'Daily Target' });

  assert.equal(
    vm.runInContext('getSolutionDate(testDraft)', context),
    '2026-09-01'
  );
});

test('connection test accepts a fine-grained token with repository write access', async () => {
  const context = createBackgroundContext({
    syncStore: {
      githubToken: 'github_pat_test',
      cssbattleExtensionConfig: {
        githubOwner: 'owner',
        githubRepo: 'repo',
        githubBranch: 'main',
        cssbattleUserId: 'user-id',
        cssbattleUsername: 'player'
      }
    },
    async fetch() {
      return {
        ok: true,
        headers: { get() { return ''; } },
        async json() {
          return { full_name: 'owner/repo', permissions: { push: true } };
        }
      };
    }
  });

  const result = await vm.runInContext('testGitHubConnection()', context);

  assert.equal(result.success, true);
  assert.equal(result.repo, 'owner/repo');
});

test('connection test rejects a read-only fine-grained token', async () => {
  const context = createBackgroundContext({
    syncStore: {
      githubToken: 'github_pat_test',
      cssbattleExtensionConfig: {
        githubOwner: 'owner',
        githubRepo: 'repo',
        githubBranch: 'main',
        cssbattleUserId: 'user-id',
        cssbattleUsername: 'player'
      }
    },
    async fetch() {
      return {
        ok: true,
        headers: { get() { return ''; } },
        async json() {
          return { full_name: 'owner/repo', permissions: { push: false } };
        }
      };
    }
  });

  const result = await vm.runInContext('testGitHubConnection()', context);

  assert.equal(result.success, false);
  assert.match(result.error, /Contents read and write/);
});

test('connection test uses entered values without saving them', async () => {
  let requestedUrl = '';
  const context = createBackgroundContext({
    syncStore: {
      githubToken: 'saved-token',
      cssbattleExtensionConfig: {
        githubOwner: 'saved-owner',
        githubRepo: 'saved-repo',
        githubBranch: 'main',
        cssbattleUserId: 'saved-user',
        cssbattleUsername: 'saved-player'
      }
    },
    async fetch(url) {
      requestedUrl = url;
      return {
        ok: true,
        headers: { get() { return ''; } },
        async json() {
          return { full_name: 'entered-owner/entered-repo', permissions: { push: true } };
        }
      };
    }
  });
  context.connectionInput = {
    token: 'github_pat_entered',
    config: {
      githubOwner: 'entered-owner',
      githubRepo: 'entered-repo'
    }
  };

  const result = await vm.runInContext('testGitHubConnection(connectionInput)', context);

  assert.equal(result.success, true);
  assert.equal(requestedUrl, 'https://api.github.com/repos/entered-owner/entered-repo');
  assert.equal(context.syncStore.githubToken, 'saved-token');
  assert.equal(context.syncStore.cssbattleExtensionConfig.githubOwner, 'saved-owner');
});

test('publishing happens only from the explicit publish action', async () => {
  const writes = [];
  const draft = makeDraft();
  const context = createBackgroundContext({
    localStore: { pendingSolutionDraft: draft },
    syncStore: {
      githubToken: 'test-token',
      cssbattleExtensionConfig: {
        githubOwner: 'owner',
        githubRepo: 'repo',
        githubBranch: 'main',
        cssbattleUserId: 'user-id',
        cssbattleUsername: 'player',
        rankApi: 'https://rank.test'
      }
    },
    async fetch(url, init = {}) {
      if (url === 'https://rank.test?userId=user-id') {
        return { ok: true, async json() { return {}; } };
      }
      if ((init.method || 'GET') === 'PUT') {
        writes.push({ url, body: JSON.parse(init.body) });
        return { ok: true, async json() { return { content: { sha: 'new-sha' } }; } };
      }
      return {
        ok: false,
        status: 404,
        headers: { get() { return ''; } },
        async json() { return { message: 'Not Found' }; }
      };
    }
  });
  context.publishInput = {
    mode: 'create',
    approachLabel: 'Nested template with gradients'
  };

  const result = await vm.runInContext('publishDraft(publishInput)', context);
  const solutionWrite = writes.find(write => write.url.includes('/data/daily/'));
  const savedRecords = JSON.parse(
    Buffer.from(solutionWrite.body.content, 'base64').toString('utf8')
  );

  assert.equal(result.success, true);
  assert.equal(savedRecords[0].approaches[0].label, 'Nested template with gradients');
  assert.equal(context.localStore.pendingSolutionDraft, undefined);
  assert.equal(writes.some(write => write.url.includes('/public/screenshots/')), false);
});

test('publishing reports partial success when the profile refresh fails', async () => {
  const writes = [];
  const draft = makeDraft();
  const context = createBackgroundContext({
    localStore: { pendingSolutionDraft: draft },
    syncStore: {
      githubToken: 'test-token',
      cssbattleExtensionConfig: {
        githubOwner: 'owner',
        githubRepo: 'repo',
        githubBranch: 'main',
        cssbattleUserId: 'user-id',
        cssbattleUsername: 'player',
        rankApi: 'https://rank.test'
      }
    },
    async fetch(url, init = {}) {
      if (url === 'https://rank.test?userId=user-id') {
        return { ok: true, async json() { return {}; } };
      }
      if ((init.method || 'GET') === 'PUT') {
        if (url.includes('/content/profile.json')) {
          return {
            ok: false,
            status: 500,
            async json() { return { message: 'Profile unavailable' }; }
          };
        }
        writes.push(url);
        return { ok: true, async json() { return { content: { sha: 'new-sha' } }; } };
      }
      return {
        ok: false,
        status: 404,
        headers: { get() { return ''; } },
        async json() { return { message: 'Not Found' }; }
      };
    }
  });
  context.publishInput = {
    mode: 'create',
    approachLabel: 'Nested template with gradients'
  };

  const result = await vm.runInContext('publishDraft(publishInput)', context);

  assert.equal(result.success, true);
  assert.match(result.warning, /Solution published, but profile refresh failed/);
  assert.equal(writes.some(url => url.includes('/data/daily/')), true);
  assert.equal(context.localStore.pendingSolutionDraft, undefined);
  assert.equal(context.localStore.lastSubmission.profileWarning, result.warning);
});

test('legacy solutions can be preserved while a different approach is added', () => {
  const context = createBackgroundContext();
  const legacy = {
    id: 'daily-1',
    name: 'Daily Target',
    type: 'daily',
    score: 720,
    match: 100,
    characters: 110,
    colors: ['#000000'],
    date: '2026-09-01',
    timestamp: '2026-09-01T09:00:00.000Z',
    tags: ['css'],
    url: 'https://cssbattle.dev/play/daily-1',
    targetImage: null,
    code: '<style>*{background:#111}'
  };

  const result = runMerge(
    context,
    [legacy],
    makeDraft(),
    {
      mode: 'create',
      legacyMode: 'preserve',
      approachLabel: 'Multiple elements with gradients',
      legacyApproachLabel: 'Background only with gradients'
    }
  );
  assert.equal(result.records[0].approaches.length, 2);
  assert.equal(result.records[0].bestApproachId, result.records[0].approaches[0].id);
  assert.equal(result.records[0].score, 720);
});

test('legacy solutions can be replaced as the same newly named approach', () => {
  const context = createBackgroundContext();
  const legacy = {
    id: 'daily-1',
    name: 'Daily Target',
    type: 'daily',
    score: 700,
    match: 100,
    characters: 130,
    colors: ['#000000'],
    date: '2026-09-01',
    timestamp: '2026-09-01T09:00:00.000Z',
    tags: ['css'],
    url: 'https://cssbattle.dev/play/daily-1',
    targetImage: null,
    code: '<style>*{background:#111}'
  };

  const result = runMerge(context, [legacy], makeDraft({ score: 730, charCount: 105 }), {
    mode: 'update',
    legacyMode: 'replace',
    approachLabel: 'Background only with gradients'
  });

  assert.equal(result.operation, 'update');
  assert.equal(result.records[0].approaches.length, 1);
  assert.equal(result.records[0].approaches[0].label, 'Background only with gradients');
  assert.equal(result.records[0].score, 730);
});

test('pushing the same approach name replaces that approach', () => {
  const context = createBackgroundContext();
  const first = runMerge(context, [], makeDraft(), {
    mode: 'create',
    approachLabel: 'Nested template with gradients'
  });
  const approachId = first.records[0].approaches[0].id;
  const improvedDraft = makeDraft({
    score: 730,
    charCount: 105,
    code: '<style>*{background:#222}',
    submittedAt: '2026-09-01T11:00:00.000Z'
  });
  const updated = runMerge(
    context,
    first.records,
    improvedDraft,
    {
      mode: 'update',
      approachId,
      approachLabel: 'nested template with gradients'
    }
  );
  const solution = updated.records[0];

  assert.equal(solution.approaches.length, 1);
  assert.equal(solution.score, 730);
  assert.equal(solution.characters, 105);
  assert.equal(solution.code, improvedDraft.code);
});

test('renaming during an update preserves the approach id', () => {
  const context = createBackgroundContext();
  const first = runMerge(context, [], makeDraft(), {
    mode: 'create',
    approachLabel: 'Nested template with gradients'
  });
  const approachId = first.records[0].approaches[0].id;
  const renamed = runMerge(context, first.records, makeDraft({ score: 730, charCount: 105 }), {
    mode: 'update',
    approachId,
    approachLabel: 'Two p tags with gradients + margin positioning'
  });

  assert.equal(renamed.operation, 'rename');
  assert.equal(renamed.previousApproachLabel, 'Nested template with gradients');
  assert.equal(renamed.records[0].approaches[0].id, approachId);
  assert.equal(
    renamed.records[0].approaches[0].label,
    'Two p tags with gradients + margin positioning'
  );
});

test('duplicate approach labels are rejected case-insensitively', () => {
  const context = createBackgroundContext();
  let result = runMerge(context, [], makeDraft(), {
    mode: 'create', approachLabel: 'Approach one'
  });
  result = runMerge(context, result.records, makeDraft({ code: 'two' }), {
    mode: 'create', approachLabel: 'Approach two'
  });
  const secondId = result.records[0].approaches[1].id;

  assert.throws(
    () => runMerge(context, result.records, makeDraft({ score: 730 }), {
      mode: 'update',
      approachId: secondId,
      approachLabel: ' approach ONE '
    }),
    /already exists/
  );
});

test('stale approach ids are rejected without changing records', () => {
  const context = createBackgroundContext();
  const first = runMerge(context, [], makeDraft(), {
    mode: 'create', approachLabel: 'Approach one'
  });

  assert.throws(
    () => runMerge(context, first.records, makeDraft({ score: 730 }), {
      mode: 'update',
      approachId: 'missing-approach',
      approachLabel: 'Approach one'
    }),
    /changed on GitHub/
  );
  assert.equal(first.records[0].score, 700);
});

test('worse updates require explicit regression confirmation', () => {
  const context = createBackgroundContext();
  const first = runMerge(context, [], makeDraft({ score: 730, charCount: 105 }), {
    mode: 'create', approachLabel: 'Approach one'
  });
  const approachId = first.records[0].approaches[0].id;
  const worseDraft = makeDraft({ score: 700, charCount: 130, code: 'worse' });

  assert.throws(
    () => runMerge(context, first.records, worseDraft, {
      mode: 'update',
      approachId,
      approachLabel: 'Approach one'
    }),
    /Update anyway/
  );

  const confirmed = runMerge(context, first.records, worseDraft, {
    mode: 'update',
    approachId,
    approachLabel: 'Approach one',
    confirmRegression: true
  });
  assert.equal(confirmed.records[0].score, 700);
});

test('the best approach mirrors to the top-level fields', () => {
  const context = createBackgroundContext();
  const first = runMerge(
    context,
    [],
    makeDraft({ score: 710, charCount: 115 }),
    { mode: 'create', approachLabel: 'Multiple elements with gradients' }
  );
  const second = runMerge(
    context,
    first.records,
    makeDraft({ score: 725, charCount: 130, code: '<style>*{color:red}' }),
    { mode: 'create', approachLabel: 'Single element with gradient + box-shadow' }
  );
  const solution = second.records[0];

  assert.equal(solution.approaches.length, 2);
  assert.equal(solution.score, 725);
  assert.equal(solution.code, '<style>*{color:red}');
  assert.equal(
    solution.bestApproachId,
    solution.approaches.find(approach => approach.score === 725).id
  );
});

test('a solution cannot contain more than three approaches', () => {
  const context = createBackgroundContext();
  let result = runMerge(context, [], makeDraft(), {
    mode: 'create', approachLabel: 'Approach one'
  });
  result = runMerge(context, result.records, makeDraft({ code: 'two' }), {
    mode: 'create', approachLabel: 'Approach two'
  });
  result = runMerge(context, result.records, makeDraft({ code: 'three' }), {
    mode: 'create', approachLabel: 'Approach three'
  });

  assert.throws(
    () => runMerge(context, result.records, makeDraft({ code: 'four' }), {
      mode: 'create', approachLabel: 'Approach four'
    }),
    /already has 3 approaches/
  );
});

test('invalid repository JSON is rejected instead of treated as an empty file', () => {
  const context = createBackgroundContext();
  context.invalidFile = {
    content: Buffer.from('{not valid json', 'utf8').toString('base64')
  };

  assert.throws(
    () => vm.runInContext(
      "parseSolutionRecords(invalidFile, 'data/daily/2026/09-september.json')",
      context
    ),
    /contains invalid JSON/
  );
});

test('publish context reads existing approaches without writing to GitHub', async () => {
  const draft = makeDraft({ score: 735, charCount: 100 });
  const savedRecords = [{
    id: draft.levelId,
    name: draft.targetName,
    type: 'daily',
    score: 730,
    match: 100,
    characters: 105,
    date: '2026-09-01',
    timestamp: draft.submittedAt,
    tags: ['css'],
    code: 'best',
    bestApproachId: 'best',
    approaches: [
      { id: 'other', label: 'Other', score: 710, match: 100, characters: 120, code: 'other' },
      { id: 'best', label: 'Best', score: 730, match: 100, characters: 105, code: 'best' }
    ]
  }];
  const context = createBackgroundContext({
    localStore: { pendingSolutionDraft: draft },
    syncStore: {
      githubToken: 'test-token',
      cssbattleExtensionConfig: {
        githubOwner: 'owner',
        githubRepo: 'repo',
        githubBranch: 'main',
        cssbattleUserId: 'user-id',
        cssbattleUsername: 'player'
      }
    },
    async fetch() {
      return {
        ok: true,
        status: 200,
        async json() {
          return { content: Buffer.from(JSON.stringify(savedRecords), 'utf8').toString('base64') };
        }
      };
    }
  });

  const result = await vm.runInContext('getPublishContext()', context);

  assert.equal(result.success, true);
  assert.equal(result.approaches[0].id, 'best');
  assert.equal(result.approaches.length, 2);
  assert.equal(context.fetchCalls.length, 1);
  assert.equal(context.fetchCalls.some(([, init = {}]) => init.method === 'PUT'), false);
});
