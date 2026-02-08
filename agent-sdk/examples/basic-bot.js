import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MoltbotClient } from '../src/moltbot-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const skillPath = path.join(__dirname, 'skill.basic.json');
const skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'));

const bot = new MoltbotClient({
  personality: skill
});

bot.start();
