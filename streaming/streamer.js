import { spawn } from 'child_process';
import { createServer } from 'http';
import { logger } from '../backend/utils/logger.js';

const STREAM_URL = process.env.KICK_RTMP_URL || '';
const STREAM_KEY = process.env.KICK_STREAM_KEY || '';
const FRONTEND_URL = process.env.STREAM_FRONTEND_URL || 'http://localhost:5173';
const FRAME_RATE = parseInt(process.env.STREAM_FPS || '30', 10);
const RESOLUTION = process.env.STREAM_RESOLUTION || '1280x720';
const BITRATE = process.env.STREAM_BITRATE || '2500k';

const run = async () => {
  if (!STREAM_URL || !STREAM_KEY) {
    logger.error('Missing KICK_RTMP_URL or KICK_STREAM_KEY');
    process.exit(1);
  }

  const puppeteerModule = await import('puppeteer')
    .catch(error => {
      logger.error('Puppeteer not installed', { error: error.message });
      return null;
    });
  if (!puppeteerModule) {
    process.exit(1);
  }
  const puppeteer = puppeteerModule.default || puppeteerModule;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2' });

  const ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-r', String(FRAME_RATE),
    '-i', '-',
    '-vf', `scale=${RESOLUTION}`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-b:v', BITRATE,
    '-maxrate', BITRATE,
    '-bufsize', '6000k',
    '-pix_fmt', 'yuv420p',
    '-f', 'flv',
    `${STREAM_URL}/${STREAM_KEY}`
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

  const captureLoop = setInterval(async () => {
    const buffer = await page.screenshot({ type: 'jpeg' });
    ffmpeg.stdin.write(buffer);
  }, 1000 / FRAME_RATE);

  ffmpeg.on('close', async () => {
    clearInterval(captureLoop);
    await browser.close();
    process.exit(0);
  });
};

run();

createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('streamer:ok');
}).listen(8080);
