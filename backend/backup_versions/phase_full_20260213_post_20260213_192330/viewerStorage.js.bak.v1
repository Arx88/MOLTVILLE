(function initMoltvilleViewerStorage(global) {
  const fallbackStorage = {
    getItem() { return null; },
    setItem() {}
  };

  const storage = global.localStorage || fallbackStorage;

  const readStorage = (key) => {
    if (!key) return '';
    try {
      return storage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  };

  const writeStorage = (key, value) => {
    if (!key) return;
    try {
      storage.setItem(key, value);
    } catch (error) {
      // ignore storage failures for non-critical viewer state
    }
  };

  const getStoredAgentId = (storageKeys) => readStorage(storageKeys?.agentId);

  const getViewerKey = (storageKeys) => {
    if (global.MOLTVILLE_VIEWER_KEY) return global.MOLTVILLE_VIEWER_KEY;
    return readStorage(storageKeys?.viewerKey);
  };

  const getViewerHeaders = (storageKeys) => {
    const viewerKey = getViewerKey(storageKeys);
    if (!viewerKey) return {};
    return { 'x-viewer-key': viewerKey };
  };

  const fetchWithViewerKey = (url, options = {}, storageKeys) => {
    const headers = {
      ...getViewerHeaders(storageKeys),
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  };

  const storeAgentId = (agentId, storageKeys) => {
    if (!agentId) return;
    writeStorage(storageKeys?.agentId, agentId);
  };

  const getUiState = (storageKeys, defaultState) => {
    const baseState = { ...(defaultState || {}) };
    const raw = readStorage(storageKeys?.uiState);
    if (!raw) return baseState;
    try {
      return { ...baseState, ...JSON.parse(raw) };
    } catch (error) {
      return baseState;
    }
  };

  const setUiState = (nextState, storageKeys, defaultState) => {
    const current = getUiState(storageKeys, defaultState);
    const merged = { ...current, ...(nextState || {}) };
    writeStorage(storageKeys?.uiState, JSON.stringify(merged));
    return merged;
  };

  global.MoltvilleViewerStorage = {
    getStoredAgentId,
    getViewerKey,
    getViewerHeaders,
    fetchWithViewerKey,
    storeAgentId,
    getUiState,
    setUiState
  };
})(window);
