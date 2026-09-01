/**
 * CSSBattle Tracker — Background Service Worker
 * Receives submission data from content script.
 * Handles GitHub API integration and deduplication.
 *
 * All repository and profile settings are read from chrome.storage.sync
 * so the extension can be used by any CSSBattle player.
 */

const CONFIG_STORAGE_KEY = 'cssbattleExtensionConfig';
const DRAFT_STORAGE_KEY = 'pendingSolutionDraft';
const MAX_APPROACHES = 3;

const DEFAULT_CONFIG = {
  githubOwner: '',
  githubRepo: '',
  githubBranch: 'main',
  cssbattleUserId: '',
  cssbattleUsername: '',
  displayName: '',
  country: '',
  whatYouDo: 'Web Developer',
  website: '',
  twitter: '',
  linkedin: '',
  rankApi: 'https://us-central1-cssbattleapp.cloudfunctions.net/getRank',
};

/** Encode a UTF-8 string to base64 (safe for multi-byte characters like —) */
function utf8ToBase64(str) {
  return btoa(String.fromCodePoint(...new TextEncoder().encode(str)));
}

/** Decode a base64 string back to UTF-8 (reverses utf8ToBase64) */
function base64ToUtf8(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getConfig() {
  try {
    const result = await chrome.storage.sync.get(CONFIG_STORAGE_KEY);
    const saved = result[CONFIG_STORAGE_KEY];
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...saved };
  } catch (err) {
    console.error('[Tracker] Failed to read config:', err);
    return { ...DEFAULT_CONFIG };
  }
}

function validateConfig(config) {
  const missing = [];
  if (!config.githubOwner?.trim()) missing.push('GitHub owner');
  if (!config.githubRepo?.trim()) missing.push('GitHub repo');
  if (!config.githubBranch?.trim()) missing.push('GitHub branch');
  if (!config.cssbattleUserId?.trim()) missing.push('CSSBattle user ID');
  if (!config.cssbattleUsername?.trim()) missing.push('CSSBattle username');
  return missing;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBMISSION_CAPTURED') {
    saveSubmissionDraft(message.data).then(result => {
      console.log('[Tracker] Draft saved:', result);
      chrome.runtime.sendMessage({ type: 'DRAFT_SAVED', data: result }).catch(() => {});
      sendResponse(result);
    }).catch(err => {
      console.error('[Tracker] Error:', err);
      chrome.runtime.sendMessage({ type: 'DRAFT_ERROR', error: err.message }).catch(() => {});
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  if (message.type === 'GET_DRAFT') {
    getDraft().then(sendResponse);
    return true;
  }
  if (message.type === 'PUSH_DRAFT') {
    publishDraft(message.payload).then(sendResponse).catch(err => {
      sendResponse({
        success: false,
        code: err.code || 'PUBLISH_FAILED',
        error: err.message
      });
    });
    return true;
  }
  if (message.type === 'GET_STATUS') {
    getStatus().then(sendResponse);
    return true;
  }
  if (message.type === 'TEST_CONNECTION') {
    testGitHubConnection().then(sendResponse);
    return true;
  }
  if (message.type === 'SAVE_CONFIG') {
    saveConfig(message.payload).then(sendResponse);
    return true;
  }
  if (message.type === 'GET_CONFIG') {
    getConfig().then(sendResponse);
    return true;
  }
  if (message.type === 'GET_LOG') {
    chrome.storage.local.get('activityLog').then(({ activityLog = [] }) => {
      sendResponse(activityLog);
    });
    return true;
  }
  if (message.type === 'CLEAR_LOG') {
    chrome.storage.local.set({ activityLog: [] }).then(() => sendResponse({ success: true }));
    return true;
  }
});

async function saveConfig(payload) {
  try {
    const config = { ...DEFAULT_CONFIG, ...payload };
    await chrome.storage.sync.set({ [CONFIG_STORAGE_KEY]: config });
    return { success: true, config };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function saveSubmissionDraft(data) {
  if (!data.score || data.score <= 0) return { action: 'ignored', reason: 'Zero score' };

  const draft = { ...data, capturedAt: Date.now() };
  await chrome.storage.local.set({ [DRAFT_STORAGE_KEY]: draft });
  await addLogEntry('info', `Draft saved: ${data.targetName} (score: ${data.score}, chars: ${data.charCount})`);
  await chrome.storage.local.set({
    lastSubmission: {
      levelId: data.levelId,
      targetName: data.targetName,
      score: data.score,
      charCount: data.charCount,
      action: 'draft',
      timestamp: draft.capturedAt,
    }
  });

  return { success: true, action: 'draft', draft };
}

async function getDraft() {
  const result = await chrome.storage.local.get(DRAFT_STORAGE_KEY);
  return { draft: result[DRAFT_STORAGE_KEY] || null };
}

async function publishDraft(payload = {}) {
  const approachLabel = validateApproachLabel(payload.approachLabel, 'Approach name');
  const legacyApproachLabel = payload.legacyApproachLabel
    ? validateApproachLabel(payload.legacyApproachLabel, 'Saved approach name')
    : '';
  const { draft } = await getDraft();
  if (!draft) return { success: false, code: 'NO_DRAFT', error: 'Submit a solution before publishing.' };

  try {
    const token = await getGitHubToken();
    if (!token) throw new Error('GitHub token not configured. Open extension popup to set it.');

    const config = await getConfig();
    const missing = validateConfig(config);
    if (missing.length > 0) {
      throw new Error(`Missing config: ${missing.join(', ')}. Open the extension popup and fill in the settings.`);
    }

    const filePath = getFilePath(draft);
    const existingFile = await getFileFromGitHub(token, config, filePath);
    const parsed = parseExistingFile(existingFile);
    if (parsed !== null && !Array.isArray(parsed)) {
      throw new Error(`The target file ${filePath} is not an array. Nothing was changed.`);
    }

    const existingRecords = Array.isArray(parsed) ? parsed : [];
    const merged = mergeDraftIntoRecords(existingRecords, draft, approachLabel, legacyApproachLabel, filePath);
    if (merged.records.length < existingRecords.length) {
      throw new Error('Safety check failed: publishing would remove existing solutions.');
    }

    const fileContent = JSON.stringify(merged.records, null, 2);
    const commitPrefix = merged.action === 'create' ? '✨ Add' : '⬆️ Update';
    await pushToGitHub(token, config, filePath, fileContent, existingFile?.sha,
      `${commitPrefix} ${draft.levelId}: ${approachLabel}`);
    await addLogEntry('success', `Pushed ${approachLabel}: ${draft.targetName}`);

    try {
      await updateProfile(token, config);
      await addLogEntry('success', 'Profile updated');
    } catch (err) {
      console.warn('[Tracker] Profile update failed:', err);
      await addLogEntry('warn', `Profile update failed: ${err.message}`);
    }

    const published = {
      levelId: draft.levelId,
      targetName: draft.targetName,
      score: draft.score,
      charCount: draft.charCount,
      approachLabel,
      action: 'published',
      timestamp: Date.now(),
    };
    await chrome.storage.local.remove(DRAFT_STORAGE_KEY);
    await chrome.storage.local.set({ lastSubmission: published });
    chrome.runtime.sendMessage({ type: 'PUBLISH_RESULT', data: published }).catch(() => {});
    return { success: true, action: merged.action, draft: null, published };
  } catch (err) {
    const code = err.code || 'PUBLISH_FAILED';
    await addLogEntry('error', `Push failed: ${err.message}`);
    return {
      success: false,
      code,
      error: err.message,
      requiresExistingApproachLabel: code === 'LEGACY_APPROACH_LABEL_REQUIRED',
    }
  }
}

function parseExistingFile(fileData) {
  if (!fileData || !fileData.content) return null;
  try {
    const decoded = base64ToUtf8(fileData.content.replace(/\n/g, ''));
    return JSON.parse(decoded);
  } catch (err) {
    console.error('[Tracker] Failed to parse existing file:', err);
    return null;
  }
}

function validateApproachLabel(value, fieldName) {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label) {
    const error = new Error(`${fieldName} is required.`);
    error.code = 'APPROACH_LABEL_REQUIRED';
    throw error;
  }
  if (label.length > 80) {
    const error = new Error(`${fieldName} must be 80 characters or fewer.`);
    error.code = 'APPROACH_LABEL_TOO_LONG';
    throw error;
  }
  return label;
}

function createApproachId(label, approaches) {
  const base = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'approach';
  const usedIds = new Set(approaches.map(approach => approach.id));
  if (!usedIds.has(base)) return base;

  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function compareApproaches(candidate, current) {
  if (candidate.score !== current.score) return candidate.score - current.score;
  if (candidate.characters !== current.characters) {
    return current.characters - candidate.characters;
  }
  return 0;
}

function getBestApproach(approaches) {
  return approaches.reduce((best, approach) => {
    if (!best || compareApproaches(approach, best) > 0) return approach;
    return best;
  }, null);
}

function buildApproach(d, label, id) {
  return {
    id,
    label,
    score: d.score,
    match: d.match,
    characters: d.charCount,
    timestamp: d.submittedAt,
    tags: d.validationTags,
    code: d.code,
  };
}

function buildLegacyApproach(solution, label, id) {
  return {
    id,
    label,
    score: solution.score,
    match: solution.match,
    characters: solution.characters,
    timestamp: solution.timestamp,
    tags: solution.tags,
    code: solution.code,
  };
}

function mirrorBestApproach(solution, approaches) {
  const best = getBestApproach(approaches);
  return {
    ...solution,
    score: best.score,
    match: best.match,
    characters: best.characters,
    timestamp: best.timestamp,
    tags: best.tags,
    code: best.code,
    bestApproachId: best.id,
    approaches,
  };
}

function mergeApproach(solution, draft, approachLabel, legacyApproachLabel) {
  let approaches = Array.isArray(solution.approaches)
    ? solution.approaches.map(approach => ({ ...approach }))
    : [];

  if (approaches.length === 0) {
    const sameSubmission = solution.code === draft.code
      && solution.score === draft.score
      && solution.characters === draft.charCount;
    if (!sameSubmission && !legacyApproachLabel) {
      const error = new Error('Name the previously saved approach before adding this one.');
      error.code = 'LEGACY_APPROACH_LABEL_REQUIRED';
      throw error;
    }

    const savedLabel = legacyApproachLabel || approachLabel;
    const savedId = createApproachId(savedLabel, approaches);
    approaches.push(buildLegacyApproach(solution, savedLabel, savedId));
  }

  const normalizedLabel = approachLabel.toLocaleLowerCase('en');
  const existingIndex = approaches.findIndex(
    approach => approach.label.trim().toLocaleLowerCase('en') === normalizedLabel
  );

  if (existingIndex >= 0) {
    const existingId = approaches[existingIndex].id;
    approaches[existingIndex] = buildApproach(draft, approachLabel, existingId);
  } else {
    if (approaches.length >= MAX_APPROACHES) {
      const error = new Error(`This solution already has ${MAX_APPROACHES} approaches. Rename an existing approach to update it.`);
      error.code = 'MAX_APPROACHES_REACHED';
      throw error;
    }
    approaches.push(buildApproach(draft, approachLabel, createApproachId(approachLabel, approaches)));
  }

  const updatedMetadata = {
    ...solution,
    name: draft.targetName,
    colors: draft.targetColors,
    date: solution.date || getSolutionDate(draft),
    url: draft.pageUrl,
    targetImage: draft.targetImage || solution.targetImage || null,
  };
  return mirrorBestApproach(updatedMetadata, approaches);
}

function buildSolutionObject(d, approachLabel) {
  const solutionDate = getSolutionDate(d);
  const base = {
    id: d.levelId,
    name: d.targetName,
    type: d.challengeType,
    ...(d.challengeType === 'battle' ? { battleNumber: Number(d.levelId) } : {}),
    score: d.score,
    match: d.match,
    characters: d.charCount,
    colors: d.targetColors,
    date: solutionDate,
    timestamp: d.submittedAt,
    tags: d.validationTags,
    url: d.pageUrl,
    targetImage: d.targetImage || null,
    code: d.code,
  };
  const approach = buildApproach(d, approachLabel, createApproachId(approachLabel, []));
  return mirrorBestApproach(base, [approach]);
}

function mergeDraftIntoRecords(existingRecords, draft, approachLabel, legacyApproachLabel, filePath) {
  const records = existingRecords.map(solution => ({ ...solution }));
  const solutionIndex = records.findIndex(solution => solution.id === draft.levelId);
  const action = solutionIndex >= 0 ? 'update' : 'create';

  if (solutionIndex >= 0) {
    records[solutionIndex] = mergeApproach(
      records[solutionIndex],
      draft,
      approachLabel,
      legacyApproachLabel
    );
  } else {
    records.push(buildSolutionObject(draft, approachLabel));
  }

  if (filePath.startsWith('data/daily/')) {
    records.sort((a, b) => new Date(a.date) - new Date(b.date));
  } else {
    records.sort((a, b) => (a.battleNumber || 0) - (b.battleNumber || 0));
  }

  return { action, records };
}

function getFilePath(data) {
  if (data.challengeType === 'daily') {
    // Month-wise: data/daily/{year}/{MM}-{monthname}.json
    const solutionDate = getSolutionDate(data);
    const [year, month] = solutionDate.split('-');
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthName = monthNames[Number(month) - 1];
    return `data/daily/${year}/${month}-${monthName}.json`;
  } else {
    // All battles in one file: data/battles.json
    return `data/battles.json`;
  }
}

function getSolutionDate(data) {
  if (data.challengeType === 'daily') {
    const match = data.targetName?.match(
      /Daily Target\s*[—-]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(\d{4})/i
    );
    if (match) {
      const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const month = String(monthNames.indexOf(match[1].toLowerCase()) + 1).padStart(2, '0');
      const day = String(Number(match[2])).padStart(2, '0');
      return `${match[3]}-${month}-${day}`;
    }
  }

  return data.submittedAt.split('T')[0];
}

async function getGitHubToken() {
  const { githubToken } = await chrome.storage.sync.get('githubToken');
  return githubToken || null;
}

function getRepoUrl(config, path) {
  return `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${path}`;
}

async function getFileFromGitHub(token, config, path) {
  try {
    const r = await fetch(`${getRepoUrl(config, path)}?ref=${config.githubBranch}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function pushToGitHub(token, config, path, content, sha, message, isBinary = false) {
  const body = { message, content: isBinary ? content : utf8ToBase64(content), branch: config.githubBranch };
  if (sha) body.sha = sha;
  const r = await fetch(getRepoUrl(config, path),
    { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`GitHub ${r.status}: ${e.message || 'Unknown'}`); }
  return r.json();
}

async function fetchRankData(config) {
  try {
    const r = await fetch(`${config.rankApi}?userId=${config.cssbattleUserId}`);
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

function buildProfile(config, rankData) {
  return {
    userId: config.cssbattleUserId,
    username: config.cssbattleUsername,
    displayName: config.displayName || config.cssbattleUsername,
    avatar: null,
    rating: 1200,
    rank: rankData.rank || null,
    totalScore: rankData.score || null,
    currentStreak: rankData.currentStreak || 0,
    longestStreak: rankData.longestStreak || 0,
    dailyTargetsPlayed: rankData.playedCount || 0,
    dailyAvgMatch: rankData.dailyAvgMatch || 0,
    dailyAvgChars: rankData.dailyAvgChars || 0,
    totalPlayers: rankData.totalPlayers || 0,
    country: config.country || '',
    whatYouDo: config.whatYouDo || '',
    links: {
      website: config.website || '',
      github: config.githubOwner || '',
      twitter: config.twitter || '',
      linkedin: config.linkedin || '',
    },
  };
}

async function updateProfileHistory(token, config, profile) {
  const histFile = await getFileFromGitHub(token, config, 'content/profileHistory.json');
  let history = [];
  if (histFile) {
    try { history = JSON.parse(atob(histFile.content.replace(/\n/g, ''))); } catch {}
  }
  const last = history[history.length - 1];
  if (last && last.rank === profile.rank && last.totalScore === profile.totalScore) return;

  history.push({
    userId: config.cssbattleUserId,
    rank: profile.rank,
    rankChange: last ? (profile.rank - last.rank) : 0,
    playedCount: profile.dailyTargetsPlayed,
    totalPlayers: profile.totalPlayers,
    totalScore: profile.totalScore,
    lastUpdated: new Date().toISOString(),
    snapshotDate: new Date().toISOString(),
  });
  await pushToGitHub(token, config, 'content/profileHistory.json', JSON.stringify(history, null, 2), histFile?.sha, `📈 Profile snapshot`);
}

async function updateProfile(token, config) {
  const rankData = await fetchRankData(config);
  const profile = buildProfile(config, rankData);

  const existing = await getFileFromGitHub(token, config, 'content/profile.json');
  await pushToGitHub(token, config, 'content/profile.json', JSON.stringify(profile, null, 2), existing?.sha, `📊 Update profile (rank: ${profile.rank})`);

  await updateProfileHistory(token, config, profile);
}

async function getStatus() {
  const token = await getGitHubToken();
  const { lastSubmission } = await chrome.storage.local.get('lastSubmission');
  return { hasToken: !!token, lastSubmission: lastSubmission || null };
}

function formatStatusError(status, msg, config) {
  const errors = {
    401: () => `Token is invalid or expired (${msg}). Generate a fine-grained token for this repository.`,
    404: () => `Repo not found (${msg}). Either ${config.githubOwner}/${config.githubRepo} does not exist or the token cannot access it.`,
    403: () => `Permission denied (${msg}). Give the token Contents read and write access to this repository.`,
  };
  const fn = errors[status];
  return fn ? fn() : msg;
}

async function parseGitHubError(r) {
  try {
    const err = await r.json();
    return err.message ? `${r.status}: ${err.message}` : `HTTP ${r.status}`;
  } catch {
    return `HTTP ${r.status}`;
  }
}

async function testGitHubConnection() {
  const token = await getGitHubToken();
  if (!token) return { success: false, error: 'No GitHub token saved. Paste your token below and click Save.' };

  const config = await getConfig();
  const missing = validateConfig(config);
  if (missing.length > 0) {
    return { success: false, error: `Missing config: ${missing.join(', ')}` };
  }

  try {
    const r = await fetch(`https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });

    const scopes = r.headers.get('X-OAuth-Scopes') || '';
    const hasRepoScope = scopes.includes('repo') || scopes.includes('public_repo');

    if (r.ok) {
      const d = await r.json();
      const isFineGrainedToken = token.startsWith('github_pat_');
      const canPush = d.permissions?.push === true || d.permissions?.admin === true;

      if ((isFineGrainedToken && !canPush) || (!isFineGrainedToken && !hasRepoScope)) {
        return {
          success: false,
          error: `Token can read ${d.full_name}, but it cannot write files. Give a fine-grained token Contents read and write access to this repository.`
        };
      }
      return { success: true, repo: d.full_name, scopes };
    }

    const msg = await parseGitHubError(r);
    return { success: false, error: formatStatusError(r.status, msg, config) };
  } catch (e) {
    return { success: false, error: `Network error: ${e.message}` };
  }
}

// ─── Activity Log ──────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 50;

async function addLogEntry(level, message) {
  try {
    const { activityLog = [] } = await chrome.storage.local.get('activityLog');
    activityLog.push({
      level,
      message,
      timestamp: Date.now(),
    });
    // Keep only the last N entries
    if (activityLog.length > MAX_LOG_ENTRIES) {
      activityLog.splice(0, activityLog.length - MAX_LOG_ENTRIES);
    }
    await chrome.storage.local.set({ activityLog });
    // Notify popup if open
    chrome.runtime.sendMessage({ type: 'LOG_UPDATED', entry: activityLog[activityLog.length - 1] }).catch(() => {});
  } catch (err) {
    console.error('[Tracker] Failed to write log:', err);
  }
}
