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
    const value = input.type === 'number' ? Number(input.value) : input.value;
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
    throw new Error(payload.error || 'Error al conectar con el backend');
  }
  return response.json();
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
};

bootstrap();
