import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_AUTH_PROFILE_PATH = path.join(
  os.homedir(),
  '.openclaw',
  'agents',
  'main',
  'agent',
  'auth-profiles.json'
);

export const loadMiniMaxToken = (customPath = null) => {
  const authPath = customPath || process.env.MINIMAX_AUTH_PROFILE_PATH || DEFAULT_AUTH_PROFILE_PATH;
  const raw = fs.readFileSync(authPath, 'utf8');
  const data = JSON.parse(raw);
  const profile = data?.profiles?.['minimax-portal:default'];
  if (!profile?.access) {
    throw new Error('MiniMax OAuth token not found');
  }
  return profile.access;
};

export const getMiniMaxAuthPath = () => (
  process.env.MINIMAX_AUTH_PROFILE_PATH || DEFAULT_AUTH_PROFILE_PATH
);
