import { logger } from '../utils/logger.js';

const parseIncoming = (message) => {
  if (!message) return null;
  if (typeof message === 'string') {
    try {
      return JSON.parse(message);
    } catch (error) {
      return { text: message };
    }
  }
  if (Buffer.isBuffer(message)) {
    const text = message.toString('utf8');
    try {
      return JSON.parse(text);
    } catch (error) {
      return { text };
    }
  }
  return message;
};

export class KickChatClient {
  constructor({
    url,
    channel,
    commandPrefix = '!',
    reconnectMs = 5000,
    moderatorNames = [],
    commandHandlers = new Map(),
    viewerKey = ''
  }) {
    this.url = url;
    this.channel = channel;
    this.commandPrefix = commandPrefix;
    this.reconnectMs = reconnectMs;
    this.moderatorNames = new Set(moderatorNames.map(name => name.toLowerCase()));
    this.commandHandlers = commandHandlers;
    this.viewerKey = viewerKey;
    this.ws = null;
    this.connected = false;
  }

  async connect() {
    const WebSocketImpl = await this.resolveWebSocket();
    if (!WebSocketImpl) {
      logger.error('WebSocket implementation not available for Kick chat');
      return;
    }
    if (!this.url) {
      logger.warn('Kick chat URL not configured');
      return;
    }
    this.ws = new WebSocketImpl(this.url);

    this.ws.on('open', () => {
      this.connected = true;
      logger.info('Connected to Kick chat');
      if (this.channel) {
        this.send({ type: 'join', channel: this.channel });
      }
    });

    this.ws.on('message', (data) => {
      const payload = parseIncoming(data);
      if (!payload) return;
      const text = payload.text || payload.message || payload.content || '';
      const username = payload.username || payload.user || payload.sender || 'viewer';
      const isModerator = Boolean(payload.isModerator || payload.isMod || this.moderatorNames.has(String(username).toLowerCase()));
      if (text.startsWith(this.commandPrefix)) {
        this.handleCommand({ text, username, isModerator });
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      logger.warn('Kick chat disconnected, retrying...');
      setTimeout(() => this.connect(), this.reconnectMs);
    });

    this.ws.on('error', (error) => {
      this.connected = false;
      logger.error('Kick chat error', { error: error.message });
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  async handleCommand(message) {
    const parts = message.text.slice(this.commandPrefix.length).split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    const handler = this.commandHandlers.get(commandName);
    if (!handler) {
      logger.debug(`Unknown command: ${this.commandPrefix}${commandName}`);
      return;
    }

    try {
      const response = await handler(message, args);
      if (response) {
        logger.info(`Command response: ${response}`);
      }
    } catch (error) {
      logger.error(`Command error for ${this.commandPrefix}${commandName}:`, error);
    }
  }

  async processViewerVote(username, voteOption) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.viewerKey) headers['x-viewer-key'] = this.viewerKey;
    const response = await fetch('http://localhost:3001/api/kick/viewer-vote', {
      method: 'POST',
      headers,
      body: JSON.stringify({ viewer: username, option: voteOption })
    });
    return response.json();
  }

  async sponsorEvent(username, eventType) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.viewerKey) headers['x-viewer-key'] = this.viewerKey;
    const response = await fetch('http://localhost:3001/api/kick/viewer-sponsor', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sponsor: username, eventType })
    });
    return response.json();
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    logger.info('Disconnected from Kick chat');
  }

  resolveWebSocket() {
    if (globalThis.WebSocket) return Promise.resolve(globalThis.WebSocket);
    return import('ws')
      .then(module => module.default)
      .catch(error => {
        logger.error('Failed to load ws dependency', { error: error.message });
        return null;
      });
  }
}
