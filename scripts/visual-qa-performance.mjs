import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'docs', 'qa-performance');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const pythonPath = 'C:\\Users\\wwwmi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
const port = 8800 + (process.pid % 400);
const debugPort = 9300 + (process.pid % 400);

await mkdir(outputDir, { recursive: true });
const server = spawn(pythonPath, ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  cwd: path.join(projectRoot, 'app'), stdio: 'ignore', windowsHide: true,
});
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${path.join(projectRoot, 'tmp', `chrome-performance-qa-${process.pid}`)}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch { /* browser/server still starting */ }
    await delay(125);
  }
  throw new Error(`Timeout: ${url}`);
}

async function waitForHttp(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch { /* server still starting */ }
    await delay(125);
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
      if (!message.id) return;
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result.value;
}

async function waitFor(client, selector, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(150);
  }
  throw new Error(`Elemento não encontrado: ${selector}`);
}

async function waitForExpression(client, expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(client, `Boolean(${expression})`)) return;
    } catch { /* the execution context is replaced during reload */ }
    await delay(150);
  }
  throw new Error(`Condição não atendida: ${expression}`);
}

async function screenshot(client, filename, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await delay(250);
  const image = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(path.join(outputDir, filename), Buffer.from(image.data, 'base64'));
}

async function viewportScreenshot(client, filename) {
  const image = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(path.join(outputDir, filename), Buffer.from(image.data, 'base64'));
}

let client;
try {
  await waitForHttp(`http://127.0.0.1:${port}/`);
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const page = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`, { method: 'PUT' }).then((response) => response.json());
  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await waitFor(client, '#auth-switch');

  await evaluate(client, `document.querySelector('#auth-switch').click()`);
  await waitFor(client, '#auth-name');
  const email = `qa.performance.${Date.now()}@example.com`;
  await evaluate(client, `(() => {
    const set = (selector, value) => { const field = document.querySelector(selector); field.value = value; field.dispatchEvent(new Event('input', { bubbles:true })); };
    set('#auth-name', 'QA Desempenho'); set('#auth-email', ${JSON.stringify(email)}); set('#auth-password', 'Teste12345');
    document.querySelector('#auth-form').requestSubmit();
  })()`);
  await waitFor(client, '[data-open-contest]');
  await evaluate(client, `document.querySelector('[data-open-contest]').click()`);

  const onboarding = await evaluate(client, `new Promise(resolve => { const start=Date.now(); const timer=setInterval(() => { if(document.querySelector('#ob-start')){clearInterval(timer);resolve(true)} else if(document.querySelector('.dash-shell')){clearInterval(timer);resolve(false)} else if(Date.now()-start>15000){clearInterval(timer);resolve(false)} },100) })`);
  if (onboarding) {
    await evaluate(client, `document.querySelector('#ob-name').value='QA Desempenho'; document.querySelector('#ob-start').click()`);
  }
  await waitFor(client, '#bottom-nav');

  await evaluate(client, `(async () => {
    const [{ progressRepository }, { STORES }] = await Promise.all([
      import('./js/repositories/progressRepository.js'), import('./js/core/types.js'),
    ]);
    const [players, disciplines, subtopics, verticalized] = await Promise.all([
      progressRepository.getAll(STORES.player), progressRepository.getAll(STORES.disciplines),
      progressRepository.getAll(STORES.subtopics), progressRepository.getAll(STORES.verticalized),
    ]);
    const player = players[0];
    player.edital_completion_pct = 72; player.streak_days = 18;
    await progressRepository.put(STORES.player, player);
    const dates = ['2026-07-02','2026-07-05','2026-07-08','2026-07-11','2026-07-14'];
    for (let i=0;i<Math.min(5,subtopics.length);i++) {
      const sub = subtopics[i]; const total=10; const correct=Math.min(9,4+i);
      sub.attempt_history = [{ attemptedAt: dates[i]+'T12:00:00Z', correct, total, percentage:correct*10, questionIds:[] }];
      sub.question_history = { ['qa-'+i]: { attempts:total, correctCount:correct, incorrectCount:total-correct, lastAnsweredAt:dates[i]+'T12:00:00Z', lastCorrect:true } };
      await progressRepository.put(STORES.subtopics, sub);
    }
    for (let i=0;i<verticalized.length;i++) {
      verticalized[i].theory_status = i < Math.round(verticalized.length*.72) ? 'concluido' : 'estudando';
      verticalized[i].review_count = i < 8 ? 2 : 0;
    }
    await progressRepository.putMany(STORES.verticalized, verticalized);
    const blocks = disciplines.slice(0,4).map((discipline,index) => ({ id:'qa-block-'+index, date:'2026-07-'+String(13+index).padStart(2,'0'), subjectId:discipline.id, actualMinutes:[95,55,35,25][index], status:'completed' }));
    await progressRepository.putMany(STORES.routineBlocks, blocks);
    const queue = subtopics.slice(0,4).map((sub,index) => ({ questionId:'qa-review-'+index, subtopicId:sub.id, disciplineId:sub.discipline_id, status:'pending', nextReviewAt:'2026-07-16T12:00:00Z', memoryState:['quente','morna','fria','congelada'][index], reviewHistory:[] }));
    await progressRepository.putMany(STORES.reviewQueue, queue);
    await window.__DETONA.navigate('performance');
  })()`);
  await waitFor(client, '.performance-dashboard');
  await delay(500);
  await evaluate(client, `document.querySelector('#pwa-banner-close')?.click(); window.scrollTo(0,0)`);

  const viewports = [
    [320,568],[360,800],[375,812],[390,844],[430,932],[768,1024],
    [1024,768],[1280,720],[1366,768],[1600,900],[1920,1080],[844,390],
  ];
  const results = [];
  for (const [width,height] of viewports) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:width<768 });
    await delay(120);
    results.push(await evaluate(client, `(() => { const screen=document.querySelector('#screen'); return { width:${width}, height:${height}, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, scrollHeight:document.documentElement.scrollHeight, overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth, screenScrollWidth:screen.scrollWidth, screenClientWidth:screen.clientWidth, screenScrollHeight:screen.scrollHeight, screenOverflow:screen.scrollWidth>screen.clientWidth, navItems:document.querySelectorAll('#bottom-nav .nav-item').length, title:document.querySelector('#bottom-nav [data-screen="performance"] span:last-child')?.textContent.trim(), profileButtons:document.querySelectorAll('[aria-label*="perfil" i]').length }; })()`));
  }

  const zoomResults = [];
  await client.send('Emulation.setDeviceMetricsOverride', { width:1366, height:768, deviceScaleFactor:1, mobile:false });
  for (const zoom of [1,1.25,1.5,2]) {
    zoomResults.push(await evaluate(client, `document.documentElement.style.zoom='${zoom}'; ({zoom:${zoom},scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth})`));
  }
  await evaluate(client, `document.documentElement.style.zoom=''`);

  await evaluate(client, `window.scrollTo(0,0); document.querySelector('#screen').scrollTop=0`);
  await screenshot(client, 'desempenho-mobile-390x844.png', 390, 844);
  const mobileScroll = await evaluate(client, `new Promise(resolve => { const screen=document.querySelector('#screen'); screen.scrollTo({top:screen.scrollHeight,behavior:'instant'}); requestAnimationFrame(() => resolve({top:screen.scrollTop,height:screen.scrollHeight,clientHeight:screen.clientHeight,overflowY:getComputedStyle(screen).overflowY})) })`);
  await delay(250);
  await viewportScreenshot(client, 'desempenho-mobile-final-390x844.png');
  await evaluate(client, `document.querySelector('#screen').scrollTop=0; window.scrollTo(0,0)`);
  await screenshot(client, 'desempenho-desktop-1366x768.png', 1366, 768);
  const desktopScroll = await evaluate(client, `new Promise(resolve => { const screen=document.querySelector('#screen'); screen.scrollTo({top:screen.scrollHeight,behavior:'instant'}); window.scrollTo(0,document.documentElement.scrollHeight); requestAnimationFrame(() => resolve({top:screen.scrollTop,height:screen.scrollHeight,clientHeight:screen.clientHeight,overflowY:getComputedStyle(screen).overflowY,windowY:window.scrollY})) })`);
  await delay(250);
  await viewportScreenshot(client, 'desempenho-desktop-final-1366x768.png');
  const checks = await evaluate(client, `({
    screen:document.querySelector('#screen')?.dataset.screen,
    contest:document.querySelector('.performance-desktop-header p')?.textContent,
    summary:document.querySelector('.performance-summary p')?.textContent,
    monsterResistance:document.querySelector('.performance-monster-hp')?.getAttribute('aria-valuenow'),
    periodOptions:new Set([...document.querySelectorAll('.performance-period option')].map(option=>option.value)).size,
    consoleReady:Boolean(window.__DETONA),
  })`);
  await evaluate(client, `document.querySelector('#performance-profile-desktop').click()`);
  await waitFor(client, '.profile-account');
  checks.profileRoute = await evaluate(client, `document.querySelector('#screen')?.dataset.screen`);
  await evaluate(client, `window.__DETONA.navigate('performance')`);
  await waitFor(client, '.performance-dashboard');
  checks.serviceWorkerReady = await evaluate(client, `navigator.serviceWorker.ready.then(() => true)`);
  await client.send('Network.enable');
  await evaluate(client, `document.documentElement.dataset.qaReload='online'`);
  await Promise.race([client.send('Page.reload', { ignoreCache:false }), delay(3000)]);
  await waitForExpression(client, `!document.documentElement.dataset.qaReload && window.__DETONA && document.querySelector('#screen[data-screen]')`);
  await client.send('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
  await evaluate(client, `document.documentElement.dataset.qaReload='offline'`);
  await Promise.race([client.send('Page.reload', { ignoreCache:false }), delay(3000)]);
  await waitForExpression(client, `!document.documentElement.dataset.qaReload && window.__DETONA && document.querySelector('#screen[data-screen]')`);
  checks.offlineBootScreen = await evaluate(client, `document.querySelector('#screen')?.dataset.screen`);
  checks.offlineRuntime = await evaluate(client, `Boolean(window.__DETONA)`);
  if (checks.offlineBootScreen === 'library') {
    await evaluate(client, `document.querySelector('[data-open-contest]')?.click()`);
    try {
      await waitForExpression(client, `document.querySelector('#screen')?.dataset.screen === 'home'`, 20000);
    } catch { /* recorded below as a failed offline contest opening */ }
  }
  checks.offlineContestScreen = await evaluate(client, `document.querySelector('#screen')?.dataset.screen`);
  if (checks.offlineContestScreen === 'onboarding') {
    await waitFor(client, '#ob-start');
    await evaluate(client, `document.querySelector('#ob-name').value='QA Desempenho Offline'; document.querySelector('#ob-start').click()`);
    await waitForExpression(client, `document.querySelector('#screen')?.dataset.screen === 'home'`, 20000);
  }
  checks.offlineContestReadyScreen = await evaluate(client, `document.querySelector('#screen')?.dataset.screen`);
  if (checks.offlineContestReadyScreen === 'home') {
    await evaluate(client, `window.__DETONA.navigate('performance')`);
    await waitFor(client, '.performance-dashboard');
  }
  checks.offlinePerformanceScreen = await evaluate(client, `document.querySelector('#screen')?.dataset.screen`);
  await client.send('Network.emulateNetworkConditions', { offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1 });
  await writeFile(path.join(outputDir, 'resultado.json'), JSON.stringify({ checks, viewports: results, zoom: zoomResults, scroll: { mobile:mobileScroll, desktop:desktopScroll } }, null, 2));
  process.stdout.write(JSON.stringify({ checks, viewports: results, zoom: zoomResults, scroll: { mobile:mobileScroll, desktop:desktopScroll } }, null, 2));
} finally {
  try { client?.close(); } catch { /* ignore */ }
  try { chrome.kill(); } catch { /* ignore */ }
  try { server.kill(); } catch { /* ignore */ }
}
