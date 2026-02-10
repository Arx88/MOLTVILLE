import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

const TOKEN_PATH = path.resolve(process.cwd(), 'qwen-oauth.json');

const QWEN_OAUTH = {
  DEVICE_CODE_URL: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
  TOKEN_URL: 'https://chat.qwen.ai/api/v1/oauth2/token',
  CLIENT_ID: 'f0304373b74a44d2b584a3fb70ca9e56',
  SCOPE: 'openid profile email model.completion',
  GRANT_TYPE_DEVICE: 'urn:ietf:params:oauth:grant-type:device_code',
  GRANT_TYPE_REFRESH: 'refresh_token'
};

const DEFAULT_BASE_URL = 'https://portal.qwen.ai/v1';

let activeDeviceFlow = null; // { deviceCode, interval, startedAt, verifier }

const base64Url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const generatePkce = () => {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
};

const saveToken = (token) => {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
};

export const loadToken = () => {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
};

export const getTokenPath = () => TOKEN_PATH;

export const requestDeviceCode = async () => {
  const pkce = generatePkce();
  const body = new URLSearchParams({
    client_id: QWEN_OAUTH.CLIENT_ID,
    scope: QWEN_OAUTH.SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256'
  });
  const res = await fetch(QWEN_OAUTH.DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Device code request failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error('Device code response missing fields');
  }
  const baseUrl = json.verification_uri_complete || json.verification_uri;
  const separator = baseUrl.includes('?') ? '&' : '?';
  const verificationUrl = baseUrl.includes('client=') ? baseUrl : `${baseUrl}${separator}client=qwen-code`;
  activeDeviceFlow = {
    deviceCode: json.device_code,
    interval: (json.interval || 2) * 1000,
    startedAt: Date.now(),
    verifier: pkce.verifier
  };
  return {
    verificationUrl,
    userCode: json.user_code,
    expiresIn: json.expires_in || 600,
    interval: json.interval || 2
  };
};

export const openVerificationUrl = (url) => {
  if (process.platform === 'win32') {
    const child = spawn('powershell', ['-NoProfile', '-Command', `Start-Process "${url}"`], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    return;
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
  child.unref();
};

export const pollForToken = async () => {
  if (!activeDeviceFlow) {
    return { status: 'idle' };
  }
  const body = new URLSearchParams({
    grant_type: QWEN_OAUTH.GRANT_TYPE_DEVICE,
    client_id: QWEN_OAUTH.CLIENT_ID,
    device_code: activeDeviceFlow.deviceCode,
    code_verifier: activeDeviceFlow.verifier
  });
  const res = await fetch(QWEN_OAUTH.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = json.error;
    if (error === 'authorization_pending') return { status: 'pending' };
    if (error === 'slow_down') return { status: 'slow_down' };
    if (error === 'expired_token') {
      activeDeviceFlow = null;
      return { status: 'expired' };
    }
    if (error === 'access_denied') {
      activeDeviceFlow = null;
      return { status: 'denied' };
    }
    return { status: 'failed', error };
  }

  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== 'number') {
    return { status: 'failed', error: 'invalid_token_response' };
  }

  let resourceUrl = json.resource_url
    ? (json.resource_url.startsWith('http') ? json.resource_url : `https://${json.resource_url}`)
    : DEFAULT_BASE_URL;

  if (!resourceUrl.endsWith('/v1')) {
    resourceUrl = `${resourceUrl.replace(/\/$/, '')}/v1`;
  }

  const token = {
    access: json.access_token,
    refresh: json.refresh_token,
    expires: Date.now() + json.expires_in * 1000,
    resourceUrl
  };
  saveToken(token);
  activeDeviceFlow = null;
  return { status: 'success', token };
};

export const getAuthStatus = () => {
  const token = loadToken();
  if (!token) return { connected: false };
  return { connected: true, expires: token.expires, resourceUrl: token.resourceUrl };
};
