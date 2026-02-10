const STORAGE_KEY = 'moltville_admin_config';
const API_BASE = window.location.hostname
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.admin-panel');
const preview = document.getElementById('config-preview');
const saveButton = document.getElementById('save-config');
const resetButton = document.getElementById('reset-config');
const adminKeyInput = document.getElementById('admin-auth-key');
const restartButton = document.getElementById('restart-server');
const statusBanner = document.createElement('div');
const lockOverlay = document.getElementById('admin-lock');
const lockInput = document.getElementById('lock-key-input');
const lockEnter = document.getElementById('lock-enter');
const agentLlmList = document.getElementById('agent-llm-list');
const syncQwenButton = document.getElementById('sync-qwen');
const connectQwenButton = document.getElementById('connect-qwen');

statusBanner.className = 'admin-status';
document.body.appendChild(statusBanner);

const switchTab = (tab) => {
  navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.tab === tab));
  panels.forEach((panel) => panel.classList.toggle('is-active', panel.id === `panel-${tab}`));
};

navItems.forEach((item) => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

const collectConfig = () => {
  const inputs = document.querySelectorAll('.admin-panel input, .admin-panel select');
  const config = {};
  inputs.forEach((input) => {
    if (!input.name) return;
    if (input.type === 'number') {
      if (input.value === '') return;
      const value = Number(input.value);
      if (Number.isNaN(value)) return;
      config[input.name] = value;
      return;
    }
    const value = input.value;
    if (value === '') return;
    config[input.name] = value;
  });
  return config;
};

const renderPreview = () => {
  preview.textContent = JSON.stringify(collectConfig(), null, 2);
};

document.querySelectorAll('.admin-panel input, .admin-panel select')
  .forEach((input) => input.addEventListener('input', renderPreview));

const showStatus = (message, type = 'info') => {
  statusBanner.textContent = message;
  statusBanner.dataset.type = type;
  statusBanner.classList.add('is-visible');
  setTimeout(() => statusBanner.classList.remove('is-visible'), 3500);
};

const getAdminKey = () => localStorage.getItem('moltville_admin_key') || '';

adminKeyInput.addEventListener('input', () => {
  localStorage.setItem('moltville_admin_key', adminKeyInput.value);
});

const unlockIfPossible = () => {
  const key = getAdminKey();
  if (key) {
    lockOverlay.classList.add('is-hidden');
    adminKeyInput.value = key;
  }
};

lockEnter.addEventListener('click', () => {
  const key = lockInput.value.trim();
  if (!key) {
    showStatus('Ingresa una clave válida', 'error');
    return;
  }
  localStorage.setItem('moltville_admin_key', key);
  lockOverlay.classList.add('is-hidden');
  adminKeyInput.value = key;
  showStatus('Clave guardada', 'success');
});

const request = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  const adminKey = getAdminKey();
  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const details = Array.isArray(payload.details) ? payload.details.join(' | ') : '';
    throw new Error(details || payload.error || 'Error al conectar con el backend');
  }
  return response.json();
};

const renderAgentLlmList = (payload) => {
  if (!agentLlmList) return;
  const providers = payload?.providers || [];
  const models = payload?.models || {};
  const agents = payload?.agents || [];

  agentLlmList.innerHTML = agents.map((agent) => {
    const providerOptions = providers.map(p => `<option value="${p.id}" ${agent.provider === p.id ? 'selected' : ''}>${p.label}</option>`).join('');
    const modelOptions = (models[agent.provider] || ['MiniMax-M2.1']).map(m => `<option value="${m}" ${agent.model === m ? 'selected' : ''}>${m}</option>`).join('');
    return `
      <div class="agent-llm-row" data-agent="${agent.id}">
        <div class="agent-name">${agent.name}</div>
        <select class="agent-provider">${providerOptions}</select>
        <select class="agent-model">${modelOptions}</select>
        <button class="ghost apply-llm" type="button">Aplicar</button>
      </div>
    `;
  }).join('') || '<div class="panel-muted">No hay agentes registrados.</div>';

  agentLlmList.querySelectorAll('.agent-llm-row').forEach((row) => {
    const providerSelect = row.querySelector('.agent-provider');
    const modelSelect = row.querySelector('.agent-model');
    providerSelect.addEventListener('change', () => {
      const provider = providerSelect.value;
      const options = (models[provider] || []).map(m => `<option value="${m}">${m}</option>`).join('');
      modelSelect.innerHTML = options || '<option value="">—</option>';
    });
    row.querySelector('.apply-llm').addEventListener('click', () => {
      request('/api/admin/agents/llm', {
        method: 'PUT',
        body: JSON.stringify({
          agentId: row.dataset.agent,
          provider: providerSelect.value,
          model: modelSelect.value
        })
      })
        .then(() => showStatus('LLM actualizado', 'success'))
        .catch((err) => showStatus(err.message, 'error'));
    });
  });
};

const loadAgentLlm = async () => {
  if (!agentLlmList) return;
  try {
    const payload = await request('/api/admin/agents/llm');
    renderAgentLlmList(payload);
  } catch (error) {
    showStatus(error.message, 'error');
  }
};

saveButton.addEventListener('click', () => {
  request('/api/admin/config', {
    method: 'PUT',
    body: JSON.stringify({ config: collectConfig() })
  })
    .then(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectConfig()));
      showStatus('Configuración guardada. Se requiere reinicio.', 'success');
      saveButton.textContent = 'Guardado ✅';
      setTimeout(() => {
        saveButton.textContent = 'Guardar cambios';
      }, 2000);
    })
    .catch((err) => showStatus(err.message, 'error'));
});

resetButton.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
});

restartButton.addEventListener('click', () => {
  request('/api/admin/restart', { method: 'POST' })
    .then(() => showStatus('Reiniciando servidor...', 'success'))
    .catch((err) => showStatus(err.message, 'error'));
});

if (connectQwenButton) {
  connectQwenButton.addEventListener('click', async () => {
    try {
      const start = await request('/api/admin/qwen/oauth/start', { method: 'POST' });
      if (start?.device?.verificationUrl) {
        window.open(start.device.verificationUrl, '_blank', 'noopener');
      }
      showStatus('OAuth abierto. Autoriza en la pestaña nueva.', 'success');
      const startAt = Date.now();
      const poll = async () => {
        const status = await request('/api/admin/qwen/oauth/status');
        if (status.status === 'success' || status.auth?.connected) {
          showStatus('Qwen OAuth conectado ✅', 'success');
          loadAgentLlm();
          return;
        }
        if (status.status === 'denied' || status.status === 'expired' || status.status === 'failed') {
          showStatus('OAuth cancelado o expirado', 'error');
          return;
        }
        if (Date.now() - startAt < 10 * 60 * 1000) {
          setTimeout(poll, (start?.device?.interval || 2) * 1000);
        } else {
          showStatus('OAuth expirado', 'error');
        }
      };
      setTimeout(poll, 2000);
    } catch (err) {
      showStatus(err.message, 'error');
    }
  });
}

if (syncQwenButton) {
  syncQwenButton.addEventListener('click', () => {
    request('/api/admin/agents/llm/sync-qwen', { method: 'POST' })
      .then(() => {
        showStatus('Qwen OAuth sincronizado', 'success');
        loadAgentLlm();
      })
      .catch((err) => showStatus(err.message, 'error'));
  });
}

const bootstrap = async () => {
  try {
    adminKeyInput.value = getAdminKey();
    unlockIfPossible();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      Object.entries(config).forEach(([key, value]) => {
        const input = document.querySelector(`[name="${key}"]`);
        if (input) {
          input.value = value;
        }
      });
    }
    const serverConfig = await request('/api/admin/config');
    Object.entries(serverConfig.current || {}).forEach(([key, value]) => {
      const input = document.querySelector(`[name="${key}"]`);
      if (input) {
        input.value = value;
      }
    });
    showStatus('Config cargada desde servidor', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
  renderPreview();
  loadAgentLlm();
};

bootstrap();
