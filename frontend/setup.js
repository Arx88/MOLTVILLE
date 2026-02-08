const STORAGE_KEY = 'moltville_setup_config';

const setupForm = document.getElementById('setup-form');
const agentForm = document.getElementById('agent-form');
const output = document.getElementById('config-output');
const copyButton = document.getElementById('copy-config');
const saveButton = document.getElementById('save-config');
const generateButton = document.getElementById('generate-key');
const saveAdminButton = document.getElementById('save-admin-key');

const API_BASE = window.location.hostname
  ? `http://${window.location.hostname}:3001`
  : 'http://localhost:3001';

const getPermissions = () => {
  const permissions = Array.from(agentForm.querySelectorAll('input[name="permissions"]:checked'))
    .map((input) => input.value);
  return permissions.length ? permissions : ['move', 'speak', 'converse', 'social', 'action', 'perceive'];
};

const buildConfig = () => {
  const setupData = new FormData(setupForm);
  const agentData = new FormData(agentForm);
  return {
    server: {
      url: setupData.get('backendUrl'),
      apiKey: agentData.get('agentApiKey')
    },
    agent: {
      name: agentData.get('agentName'),
      avatar: agentData.get('avatar'),
      personality: agentData.get('personality') || 'curioso y social',
      permissions: getPermissions()
    },
    viewer: {
      url: setupData.get('viewerUrl'),
      adminKey: setupData.get('adminKey') || ''
    },
    behavior: {
      autoExplore: true,
      conversationInitiation: 'moderate',
      decisionInterval: 30000
    }
  };
};

const renderOutput = () => {
  const config = buildConfig();
  output.textContent = JSON.stringify(config, null, 2);
};

setupForm.addEventListener('input', renderOutput);
agentForm.addEventListener('input', renderOutput);

copyButton.addEventListener('click', async () => {
  const config = buildConfig();
  await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
  copyButton.textContent = 'Copiado ✅';
  setTimeout(() => {
    copyButton.textContent = 'Copiar config.json';
  }, 2000);
});

saveButton.addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(buildConfig()));
  saveButton.textContent = 'Guardado ✅';
  setTimeout(() => {
    saveButton.textContent = 'Guardar en navegador';
  }, 2000);
});

saveAdminButton.addEventListener('click', () => {
  const adminKey = new FormData(setupForm).get('adminKey');
  if (adminKey) {
    localStorage.setItem('moltville_admin_key', adminKey);
  }
  saveAdminButton.textContent = 'Admin key guardada ✅';
  setTimeout(() => {
    saveAdminButton.textContent = 'Guardar admin key';
  }, 2000);
});

generateButton.addEventListener('click', async () => {
  const agentName = new FormData(agentForm).get('agentName');
  if (!agentName) {
    generateButton.textContent = 'Completa el nombre primero';
    setTimeout(() => {
      generateButton.textContent = 'Generar API key';
    }, 2000);
    return;
  }
  const adminKey = new FormData(setupForm).get('adminKey');
  const response = await fetch(`${API_BASE}/api/moltbot/generate-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {})
    },
    body: JSON.stringify({ moltbotName: agentName })
  });
  if (!response.ok) {
    generateButton.textContent = 'Error al generar';
    setTimeout(() => {
      generateButton.textContent = 'Generar API key';
    }, 2000);
    return;
  }
  const data = await response.json();
  agentForm.agentApiKey.value = data.apiKey || '';
  renderOutput();
  generateButton.textContent = 'API key lista ✅';
  setTimeout(() => {
    generateButton.textContent = 'Generar API key';
  }, 2000);
});

const bootstrap = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    setupForm.backendUrl.value = data.server?.url || 'http://localhost:3001';
    setupForm.viewerUrl.value = data.viewer?.url || 'http://localhost:5173';
    setupForm.adminKey.value = data.viewer?.adminKey || '';
    agentForm.agentName.value = data.agent?.name || '';
    agentForm.avatar.value = data.agent?.avatar || 'char1';
    agentForm.agentApiKey.value = data.server?.apiKey || '';
    agentForm.personality.value = data.agent?.personality || '';
    agentForm.querySelectorAll('input[name="permissions"]').forEach((input) => {
      input.checked = data.agent?.permissions?.includes(input.value);
    });
  }
  renderOutput();
};

bootstrap();
