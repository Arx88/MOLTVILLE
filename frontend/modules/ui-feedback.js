(function () {
  const root = document.body;
  const toastHost = document.createElement('div');
  toastHost.id = 'mv-toast-host';
  root.appendChild(toastHost);

  const loading = document.createElement('div');
  loading.id = 'mv-loading-overlay';
  loading.innerHTML = '<div class="mv-loading-card"><span class="spinner"></span><span id="mv-loading-text">Cargando…</span></div>';
  root.appendChild(loading);

  const errorBox = document.createElement('div');
  errorBox.id = 'mv-error-banner';
  root.appendChild(errorBox);

  function toast(message, type = 'info', ms = 2600) {
    const el = document.createElement('div');
    el.className = `mv-toast ${type}`;
    el.textContent = message;
    toastHost.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
  }

  function setLoading(active, text = 'Cargando…') {
    loading.classList.toggle('is-open', Boolean(active));
    const textNode = document.getElementById('mv-loading-text');
    if (textNode) textNode.textContent = text;
  }

  function setError(message = '') {
    errorBox.textContent = message || '';
    errorBox.classList.toggle('is-open', Boolean(message));
  }

  window.MoltvilleUI = { toast, setLoading, setError };
})();
