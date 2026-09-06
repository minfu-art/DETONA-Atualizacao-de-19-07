import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'preview-screenshots');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = 9700 + (process.pid % 200);
const previewUrl = process.argv[2];
if (!previewUrl?.startsWith('https://')) throw new Error('Informe a URL HTTPS do preview.');

await mkdir(outputDir, { recursive: true });
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${path.join(projectRoot, 'tmp', `chrome-auth-otp-${process.pid}`)}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 100) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch { /* Chrome ainda iniciando. */ }
    await delay(100);
  }
  throw new Error(`Timeout: ${url}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Falha ao avaliar a página.');
  return result.result.value;
}

async function waitFor(client, expression, timeout = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      if (await evaluate(client, `Boolean(${expression})`)) return;
    } catch { /* contexto trocado durante a navegação. */ }
    await delay(150);
  }
  throw new Error(`Condição não atendida: ${expression}`);
}

async function capture(client, { width, height, filename }) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 768,
  });
  await delay(250);
  const image = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(path.join(outputDir, filename), Buffer.from(image.data, 'base64'));
  return evaluate(client, `({
    width:${width},
    height:${height},
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth,
    googleVisible:Boolean(document.querySelector('#auth-google')),
    emailOtpCta:[...document.querySelectorAll('button')].some(button => /RECEBER CÓDIGO NO E-MAIL/.test(button.textContent)),
    viewportHeight:document.documentElement.clientHeight,
    pageHeight:document.documentElement.scrollHeight
  })`);
}

let client;
try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const page = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(previewUrl)}`, { method: 'PUT' }).then((response) => response.json());
  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await waitFor(client, `document.querySelector('#auth-google') && document.querySelector('#auth-name')`);
  const results = [];
  results.push(await capture(client, { width: 390, height: 844, filename: 'login-email-otp-mobile-390.png' }));
  results.push(await capture(client, { width: 1440, height: 900, filename: 'login-email-otp-desktop-1440.png' }));
  process.stdout.write(JSON.stringify(results, null, 2));
} finally {
  try { client?.close(); } catch { /* noop */ }
  try { chrome.kill(); } catch { /* noop */ }
}
