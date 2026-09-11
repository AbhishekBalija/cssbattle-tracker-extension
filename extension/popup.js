document.addEventListener('DOMContentLoaded', async () => {
  // Views
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const headerSettingsIcon = document.getElementById('header-settings-icon');
  const headerBackIcon = document.getElementById('header-back-icon');

  // Main view elements
  const statusEl = document.getElementById('github-status');
  const lastSubContainer = document.getElementById('last-sub-container');
  const activityLogEl = document.getElementById('activity-log');
  const btnClearLog = document.getElementById('btn-clear-log');

  // Settings elements
  const tokenInput = document.getElementById('token-input');
  const saveBtn = document.getElementById('save-config');
  const testBtn = document.getElementById('test-btn');
  const msg = document.getElementById('msg');

  const configInputs = {
    githubOwner: document.getElementById('config-owner'),
    githubRepo: document.getElementById('config-repo'),
    githubBranch: document.getElementById('config-branch'),
    cssbattleUserId: document.getElementById('config-userid'),
    cssbattleUsername: document.getElementById('config-username'),
    displayName: document.getElementById('config-displayname'),
    country: document.getElementById('config-country'),
  };

  const pluginStatusDot = document.getElementById('plugin-status-dot');
  const pluginStatusText = document.getElementById('plugin-status-text');
  const toggleToolbar = document.getElementById('toggle-toolbar');
  const pluginTogglesContainer = document.getElementById('plugin-toggles');
  const pluginCheckboxes = document.querySelectorAll('[data-plugin]');

  const CONFIG_STORAGE_KEY = 'cssbattleExtensionConfig';
  const PLUGIN_STORAGE_KEY = 'cssbattlePluginSettings';

  const DEFAULT_PLUGIN_SETTINGS = {
    toolbarVisible: true,
    enabledPlugins: {
      'blank-template': true,
      'nested-template': true,
      'minify': true,
      'unit-replacement': true
    }
  };

  // Navigation
  let settingsOpen = false;
  btnOpenSettings.addEventListener('click', () => {
    if (settingsOpen) showMainView();
    else showSettingsView();
  });

  function showMainView() {
    settingsOpen = false;
    viewMain.classList.remove('hidden');
    viewSettings.classList.add('hidden');
    headerSettingsIcon.classList.remove('hidden');
    headerBackIcon.classList.add('hidden');
    btnOpenSettings.title = 'Settings';
    btnOpenSettings.setAttribute('aria-label', 'Open settings');
    document.scrollingElement.scrollTop = 0;
    checkConnection();
  }

  function showSettingsView() {
    settingsOpen = true;
    viewMain.classList.add('hidden');
    viewSettings.classList.remove('hidden');
    headerSettingsIcon.classList.add('hidden');
    headerBackIcon.classList.remove('hidden');
    btnOpenSettings.title = 'Back to status';
    btnOpenSettings.setAttribute('aria-label', 'Back to status');
    document.scrollingElement.scrollTop = 0;
  }

  // Load everything
  const { githubToken } = await chrome.storage.sync.get('githubToken');
  if (githubToken) tokenInput.value = githubToken;

  let config = await loadConfig();
  renderConfig(config);

  let pluginSettings = await loadPluginSettings();
  renderPluginSettings(pluginSettings);

  const { lastSubmission } = await chrome.storage.local.get('lastSubmission');
  if (lastSubmission) renderLastSubmission(lastSubmission);

  loadActivityLog();
  checkConnection();

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) return showMsg('Please enter a GitHub token', 'error');
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      return showMsg('Token should start with ghp_ (classic) or github_pat_ (fine-grained)', 'error');
    }

    const newConfig = readConfigFromInputs();
    const missing = [];
    if (!newConfig.githubOwner.trim()) missing.push('GitHub owner');
    if (!newConfig.githubRepo.trim()) missing.push('GitHub repo');
    if (!newConfig.githubBranch.trim()) missing.push('GitHub branch');
    if (!newConfig.cssbattleUserId.trim()) missing.push('CSSBattle user ID');
    if (!newConfig.cssbattleUsername.trim()) missing.push('CSSBattle username');
    if (missing.length > 0) {
      return showMsg(`Missing: ${missing.join(', ')}`, 'error');
    }

    try {
      await chrome.storage.sync.set({ githubToken: token });
      const result = await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', payload: newConfig });
      if (!result.success) return showMsg(`Could not save config: ${result.error}`, 'error');

      config = result.config;
      showMsg('Settings saved.', 'success');
      checkConnection();
    } catch (err) {
      showMsg(`Could not save settings: ${err.message}`, 'error');
    }
  });

  // Test connection
  testBtn.addEventListener('click', () => checkConnection(true));

  // Plugin toggle handlers
  toggleToolbar.addEventListener('change', async () => {
    pluginSettings.toolbarVisible = toggleToolbar.checked;
    await savePluginSettings(pluginSettings);
    updatePluginStatus(pluginSettings);
  });

  pluginCheckboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      pluginSettings.enabledPlugins[cb.dataset.plugin] = cb.checked;
      await savePluginSettings(pluginSettings);
      updatePluginStatus(pluginSettings);
    });
  });

  btnClearLog.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_LOG' });
    activityLogEl.innerHTML = '<div class="empty" style="padding: 12px 0;">No activity yet</div>';
  });

  async function loadConfig() {
    try {
      return await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    } catch (err) {
      console.error('[Tracker] Failed to load config:', err);
      return {};
    }
  }

  function readConfigFromInputs() {
    return {
      githubOwner: configInputs.githubOwner.value.trim(),
      githubRepo: configInputs.githubRepo.value.trim(),
      githubBranch: configInputs.githubBranch.value.trim() || 'main',
      cssbattleUserId: configInputs.cssbattleUserId.value.trim(),
      cssbattleUsername: configInputs.cssbattleUsername.value.trim(),
      displayName: configInputs.displayName.value.trim(),
      country: configInputs.country.value.trim(),
    };
  }

  function renderConfig(cfg) {
    configInputs.githubOwner.value = cfg.githubOwner || '';
    configInputs.githubRepo.value = cfg.githubRepo || '';
    configInputs.githubBranch.value = cfg.githubBranch || 'main';
    configInputs.cssbattleUserId.value = cfg.cssbattleUserId || '';
    configInputs.cssbattleUsername.value = cfg.cssbattleUsername || '';
    configInputs.displayName.value = cfg.displayName || '';
    configInputs.country.value = cfg.country || '';
  }

  async function loadPluginSettings() {
    try {
      const result = await chrome.storage.sync.get(PLUGIN_STORAGE_KEY);
      const saved = result[PLUGIN_STORAGE_KEY];
      if (!saved || typeof saved !== 'object') return { ...DEFAULT_PLUGIN_SETTINGS };
      return {
        toolbarVisible: saved.toolbarVisible !== false,
        enabledPlugins: { ...DEFAULT_PLUGIN_SETTINGS.enabledPlugins, ...(saved.enabledPlugins || {}) }
      };
    } catch (err) {
      console.error('[Tracker] Failed to load plugin settings:', err);
      return { ...DEFAULT_PLUGIN_SETTINGS };
    }
  }

  async function savePluginSettings(settings) {
    try {
      await chrome.storage.sync.set({ [PLUGIN_STORAGE_KEY]: settings });
      const tabs = await chrome.tabs.query({ url: 'https://cssbattle.dev/*' });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'SET_PLUGIN_SETTINGS', payload: settings }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[Tracker] Failed to save plugin settings:', err);
      showMsg('Could not save plugin settings', 'error');
    }
  }

  function renderPluginSettings(settings) {
    toggleToolbar.checked = settings.toolbarVisible;
    pluginCheckboxes.forEach(cb => {
      cb.checked = !!settings.enabledPlugins[cb.dataset.plugin];
    });
    updatePluginStatus(settings);
  }

  function updatePluginStatus(settings) {
    pluginTogglesContainer.style.display = settings.toolbarVisible ? 'block' : 'none';
    const enabledCount = Object.values(settings.enabledPlugins).filter(Boolean).length;
    if (settings.toolbarVisible) {
      pluginStatusDot.className = 'status-dot green';
      pluginStatusText.textContent = `${enabledCount} plugin${enabledCount === 1 ? '' : 's'} enabled`;
    } else {
      pluginStatusDot.className = 'status-dot red';
      pluginStatusText.textContent = 'Toolbar hidden';
    }
  }

  async function checkConnection(useCurrentInputs = false) {
    setStatus('yellow', 'Testing connection...');
    const originalText = testBtn.textContent;
    if (useCurrentInputs) {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      showMsg('Testing the values currently shown above.', 'success');
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        payload: useCurrentInputs
          ? { token: tokenInput.value.trim(), config: readConfigFromInputs() }
          : undefined
      });
      if (!result) {
        setStatus('red', 'No response from background');
        if (useCurrentInputs) showMsg('No response from the extension background.', 'error');
        return;
      }
      if (result.success) {
        setStatus('green', `Connected to ${result.repo}`);
        if (useCurrentInputs) showMsg(`Connection works for ${result.repo}.`, 'success');
      } else {
        setStatus('red', `${result.error}`);
        if (useCurrentInputs) showMsg(result.error, 'error');
      }
    } catch (err) {
      setStatus('red', `Error: ${err.message || 'Could not reach background'}`);
      if (useCurrentInputs) showMsg(err.message || 'Could not test the connection.', 'error');
    } finally {
      if (useCurrentInputs) {
        testBtn.disabled = false;
        testBtn.textContent = originalText;
      }
    }
  }

  function setStatus(color, text) {
    statusEl.innerHTML = `<div class="status-dot ${color}"></div><span>${text}</span>`;
  }

  function showMsg(text, type) {
    msg.textContent = text;
    msg.className = `msg msg-${type}`;
    setTimeout(() => { msg.className = 'msg'; }, 3000);
  }

  function renderLastSubmission(sub) {
    const isDraft = sub.action === 'draft';
    const isPublished = sub.action === 'published';
    const badgeClass = isDraft
      ? 'badge-update'
        : isPublished || sub.action === 'create'
        ? 'badge-create'
        : sub.action === 'update' || sub.action === 'rename'
          ? 'badge-update'
          : 'badge-ignore';
    const badgeText = isDraft
      ? 'Local draft'
      : isPublished
        ? 'Published'
        : sub.action === 'create'
          ? 'Created'
          : sub.action === 'update'
            ? 'Updated'
            : sub.action === 'rename'
              ? 'Renamed'
            : 'Skipped';
    const timeAgo = (sub.timestamp != null && !isNaN(sub.timestamp)) ? getTimeAgo(sub.timestamp) : 'Just now';
    const displayScore = sub.score != null ? sub.score : '--';
    const displayChars = sub.charCount != null ? sub.charCount : '--';

    lastSubContainer.innerHTML = `
      <div class="last-sub">
        <div class="name">${escapeHtml(sub.targetName || sub.levelId || 'Unknown target')}</div>
        ${sub.approachLabel ? `<div class="approach">${escapeHtml(sub.approachLabel)}</div>` : ''}
        <div class="meta">${timeAgo}</div>
        <div class="stats">
          <div class="stat"><div class="stat-value">${displayScore}</div><div class="stat-label">Score</div></div>
          <div class="stat"><div class="stat-value">${displayChars}</div><div class="stat-label">Chars</div></div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>`;
  }

  function getTimeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  async function loadActivityLog() {
    try {
      const log = await chrome.runtime.sendMessage({ type: 'GET_LOG' });
      renderActivityLog(log || []);
    } catch {
      activityLogEl.innerHTML = '<div class="empty" style="padding: 12px 0;">Could not load log</div>';
    }
  }

  function renderActivityLog(entries) {
    const relevantEntries = (entries || [])
      .filter(entry => !/^Draft saved:/.test(entry.message) && entry.message !== 'Profile updated')
      .slice(-5)
      .reverse();
    if (relevantEntries.length === 0) {
      activityLogEl.innerHTML = '<div class="empty" style="padding: 12px 0;">No activity yet</div>';
      return;
    }

    activityLogEl.innerHTML = relevantEntries
      .map(entry => {
        const time = getTimeAgo(entry.timestamp);
        return `<div class="log-entry log-${entry.level}">
          <span class="log-icon" aria-hidden="true"></span>
          <span class="log-msg">${escapeHtml(entry.message)}</span>
          <span class="log-time">${time}</span>
        </div>`;
      })
      .join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Listen for live updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PUBLISH_RESULT') {
      renderLastSubmission(message.data);
      loadActivityLog();
    }
    if (message.type === 'DRAFT_SAVED') {
      renderLastSubmission(message.data.draft ? {
        ...message.data.draft,
        action: 'draft',
        timestamp: message.data.draft.capturedAt
      } : message.data);
    }
    if (message.type === 'PUBLISH_ERROR') {
      showMsg(message.error, 'error');
      loadActivityLog();
    }
    if (message.type === 'LOG_UPDATED') {
      loadActivityLog();
    }
  });
});
