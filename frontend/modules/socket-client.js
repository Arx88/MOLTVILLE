(function () {
  function createViewerSocket(apiBase, handlers = {}) {
    if (!window.io) return null;
    const socket = window.io(apiBase, { transports: ['websocket'] });
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return socket;
  }

  window.MoltvilleSocket = { createViewerSocket };
})();
