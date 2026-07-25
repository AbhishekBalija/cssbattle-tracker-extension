/**
 * CSSBattle Tracker — Background Service Worker
 * Receives submission data from content script.
 * Handles GitHub API integration and deduplication.
 *
 * All repository and profile settings are read from chrome.storage.sync
 * so the extension can be used by any CSSBattle player.
 */

const CONFIG_STORAGE_KEY = 'cssbattleExtensionConfig';

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
    handleSubmission(message.data, sender.tab).then(result => {
      console.log('[Tracker] Result:', result);
      chrome.runtime.sendMessage({ type: 'PUBLISH_RESULT', data: result }).catch(() => {});
    }).catch(err => {
      console.error('[Tracker] Error:', err);
      chrome.runtime.sendMessage({ type: 'PUBLISH_ERROR', error: err.message }).catch(() => {});
    });
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

async function handleSubmission(data, tab) {
  const token = await getGitHubToken();
  if (!token) throw new Error('GitHub token not configured. Open extension popup to set it.');

  const config = await getConfig();
  const missing = validateConfig(config);
  if (missing.length > 0) {
    throw new Error(`Missing config: ${missing.join(', ')}. Open the extension popup and fill in the settings.`);
  }

  if (!data.score || data.score <= 0) return { action: 'ignored', reason: 'Zero score' };

  await addLogEntry('info', `Captured: ${data.targetName} (score: ${data.score}, chars: ${data.charCount})`);

  let screenshotBase64 = null;
  try {
    if (tab?.id) {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality: 90 });
      screenshotBase64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    }
  } catch (err) {
    console.warn('[Tracker] Screenshot failed:', err);
    await addLogEntry('warn', `Screenshot failed: ${err.message}`);
  }

  const filePath = getFilePath(data);
  await addLogEntry('info', `Target file: ${filePath}`);

  const existing = await getFileFromGitHub(token, config, filePath);
  if (existing) {
    const parsed = parseExistingFile(existing);
    const entryCount = Array.isArray(parsed) ? parsed.length : 0;
    await addLogEntry('info', `Existing file has ${entryCount} entries (SHA: ${existing.sha?.slice(0, 7)})`);
  } else {
    await addLogEntry('info', 'File does not exist yet — will create');
  }

  const decision = dedup(data, existing, filePath);
  await addLogEntry('info', `Decision: ${decision.action} — ${decision.reason}`);
  if (decision.action === 'ignore') return decision;

  const fileContent = buildFileContent(data, decision, existing, filePath);

  // Verify we're not about to destroy data
  try {
    const newData = JSON.parse(fileContent);
    const oldData = parseExistingFile(existing);
    if (Array.isArray(oldData) && Array.isArray(newData) && newData.length < oldData.length) {
      const errMsg = `SAFETY: New file has ${newData.length} entries but old had ${oldData.length}. Aborting to prevent data loss.`;
      await addLogEntry('error', errMsg);
      throw new Error(errMsg);
    }
  } catch (err) {
    if (err.message.startsWith('SAFETY:')) throw err;
    // JSON parse of newData failed — shouldn't happen but log it
    await addLogEntry('warn', `Could not verify data safety: ${err.message}`);
  }

  const label = decision.action === 'create' ? '✨ Add' : '⬆️ Update';
  try {
    await pushToGitHub(token, config, filePath, fileContent, existing?.sha,
      `${label} ${data.levelId}: ${data.targetName}`);
    await addLogEntry('success', `Pushed ${decision.action}: ${data.targetName}`);
  } catch (err) {
    await addLogEntry('error', `GitHub push failed: ${err.message}`);
    throw err;
  }

  if (screenshotBase64) {
    try {
      const ssExisting = await getFileFromGitHub(token, config, `public/screenshots/${data.levelId}.png`);
      await pushToGitHub(token, config, `public/screenshots/${data.levelId}.png`, screenshotBase64, ssExisting?.sha,
        `📸 Screenshot: ${data.targetName}`, true);
      await addLogEntry('success', `Screenshot uploaded for ${data.targetName}`);
    } catch (err) {
      await addLogEntry('warn', `Screenshot upload failed: ${err.message}`);
    }
  }

  try {
    await updateProfile(token, config);
    await addLogEntry('success', 'Profile updated');
  } catch (e) {
    console.warn('[Tracker] Profile update failed:', e);
    await addLogEntry('warn', `Profile update failed: ${e.message}`);
  }

  await chrome.storage.local.set({
    lastSubmission: {
      levelId: data.levelId, targetName: data.targetName, score: data.score,
      charCount: data.charCount, action: decision.action, timestamp: Date.now(),
    }
  });
  return { action: decision.action, levelId: data.levelId, targetName: data.targetName, score: data.score, charCount: data.charCount };
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

function compareSolution(newData, existing, label) {
  const found = existing.find(s => s.id === newData.levelId);
  if (!found) return { action: 'add', reason: `New ${label} solution`, index: -1 };
  if (newData.score > found.score) return { action: 'update', reason: `Better score: ${newData.score} > ${found.score}`, index: existing.indexOf(found) };
  if (newData.score === found.score && newData.charCount < found.characters) return { action: 'update', reason: `Fewer chars: ${newData.charCount} < ${found.characters}`, index: existing.indexOf(found) };
  return { action: 'ignore', reason: `No improvement: ${newData.score}/${newData.charCount} vs ${found.score}/${found.characters}` };
}

function dedup(newData, existingFile, filePath) {
  const existing = parseExistingFile(existingFile);
  if (!existing) return { action: 'create', reason: 'New file' };

  // Battles: single file with array of solutions — find by id
  if (filePath === 'data/battles.json') {
    if (!Array.isArray(existing)) return { action: 'create', reason: 'Malformed battles file' };
    return compareSolution(newData, existing, 'battle');
  }

  // Daily: month file with array of solutions — find by id
  if (Array.isArray(existing)) {
    return compareSolution(newData, existing, 'daily');
  }

  return { action: 'create', reason: 'Unrecognized format' };
}

function buildSolutionObject(d) {
  return {
    id: d.levelId,
    name: d.targetName,
    type: d.challengeType,
    ...(d.challengeType === 'battle' ? { battleNumber: Number(d.levelId) } : {}),
    score: d.score,
    match: d.match,
    characters: d.charCount,
    colors: d.targetColors,
    date: d.submittedAt.split('T')[0],
    timestamp: d.submittedAt,
    tags: d.validationTags,
    url: d.pageUrl,
    targetImage: d.targetImage || null,
    code: d.code,
  };
}

function buildFileContent(data, decision, existingFile, filePath) {
  const newSolution = buildSolutionObject(data);
  const existing = parseExistingFile(existingFile);

  // Defensive: if we have valid existing data, ALWAYS work with it
  // even if decision is 'create' (which can happen on parse failure fallthrough)
  if (Array.isArray(existing) && existing.length > 0) {
    if (decision.action === 'add' || decision.action === 'create') {
      existing.push(newSolution);
    } else if (decision.action === 'update' && decision.index >= 0) {
      existing[decision.index] = newSolution;
    }

    if (filePath.startsWith('data/daily/')) {
      existing.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
      existing.sort((a, b) => (a.battleNumber || 0) - (b.battleNumber || 0));
    }

    return JSON.stringify(existing, null, 2);
  }

  // Truly new file — start with array
  return JSON.stringify([newSolution], null, 2);
}

function getFilePath(data) {
  if (data.challengeType === 'daily') {
    // Month-wise: data/daily/{year}/{MM}-{monthname}.json
    const date = new Date(data.submittedAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const monthName = monthNames[date.getMonth()];
    return `data/daily/${year}/${month}-${monthName}.json`;
  } else {
    // All battles in one file: data/battles.json
    return `data/battles.json`;
  }
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
    401: () => `Token is invalid or expired (${msg}). Generate a new classic PAT with the repo scope.`,
    404: () => `Repo not found (${msg}). Either ${config.githubOwner}/${config.githubRepo} does not exist or the token cannot access it.`,
    403: () => `Permission denied (${msg}). Make sure your token has the 'repo' scope and the repo is accessible.`,
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
      if (!hasRepoScope) {
        return {
          success: false,
          error: `Token can read ${d.full_name}, but it is missing the 'repo' scope needed to push files. Generate a classic token with the repo scope enabled.`
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
