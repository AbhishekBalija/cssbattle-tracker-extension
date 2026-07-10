document.addEventListener('DOMContentLoaded', async () => {
  // Views
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnSettingsFromMain = document.getElementById('btn-settings-from-main');
  const btnBack = document.getElementById('btn-back');

  // Main view elements
  const statusEl = document.getElementById('github-status');
  const lastSubContainer = document.getElementById('last-sub-container');

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
  btnOpenSettings.addEventListener('click', showSettingsView);
  btnSettingsFromMain.addEventListener('click', showSettingsView);
  btnBack.addEventListener('click', showMainView);

  function showMainView() {
    viewMain.classList.remove('hidden');
    viewSettings.classList.add('hidden');
    checkConnection();
  }

  function showSettingsView() {
    viewMain.classList.add('hidden');
    viewSettings.classList.remove('hidden');
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
      showMsg('Settings saved!', 'success');
      checkConnection();
    } catch (err) {
      showMsg(`Could not save settings: ${err.message}`, 'error');
    }
  });

  // Test connection
  testBtn.addEventListener('click', checkConnection);

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

  async function checkConnection() {
    setStatus('yellow', 'Testing connection...');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' });
      if (!result) {
        setStatus('red', 'No response from background');
        return;
      }
      if (result.success) {
        setStatus('green', `Connected to ${result.repo}`);
      } else {
        setStatus('red', `${result.error}`);
      }
    } catch (err) {
      setStatus('red', `Error: ${err.message || 'Could not reach background'}`);
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
    const badgeClass = sub.action === 'create' ? 'badge-create' : sub.action === 'update' ? 'badge-update' : 'badge-ignore';
    const badgeText = sub.action === 'create' ? '✨ Created' : sub.action === 'update' ? '⬆️ Updated' : '⏭️ Skipped';
    const timeAgo = (sub.timestamp != null && !isNaN(sub.timestamp)) ? getTimeAgo(sub.timestamp) : 'Just now';
    const displayScore = sub.score != null ? sub.score : '--';
    const displayChars = sub.charCount != null ? sub.charCount : '--';

    lastSubContainer.innerHTML = `
      <div class="last-sub">
        <div class="name">${sub.targetName || sub.levelId}</div>
        <div class="meta">${timeAgo}</div>
        <div class="stats">
          <div class="stat"><div class="stat-value">${displayScore}</div><div class="stat-label">Score</div></div>
          <div class="stat"><div class="stat-value">${displayChars}</div><div class="stat-label">Chars</div></div>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
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

  // Listen for live updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PUBLISH_RESULT') renderLastSubmission(message.data);
    if (message.type === 'PUBLISH_ERROR') showMsg(message.error, 'error');
  });
});
