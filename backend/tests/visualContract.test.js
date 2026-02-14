import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');

const read = (name) => fs.readFileSync(path.join(frontendDir, name), 'utf8');

test('Frontend visual contract baseline remains intact', () => {
  const indexHtml = read('index.html');
  const adminHtml = read('admin.html');
  const stylesCss = read('styles.css');

  assert.match(indexHtml, /id="game-container"/);
  assert.match(indexHtml, /id="top-bar"/);
  assert.match(indexHtml, /id="districts-panel"/);

  assert.match(adminHtml, /class="admin-layout"/);
  assert.match(adminHtml, /data-tab="governance"/);

  assert.match(stylesCss, /#top-bar/);
  assert.match(stylesCss, /#game-container/);
  assert.match(stylesCss, /body\.show-mode-active/);
});
