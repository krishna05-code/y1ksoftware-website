import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const endpoint = process.argv[2] || 'http://127.0.0.1:9223';
const chrome = await fetch(`${endpoint}/json/new?${encodeURIComponent('http://127.0.0.1:8765/')}`, { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(chrome.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
const eventWaiters = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  } else if (eventWaiters.has(message.method)) {
    for (const resolve of eventWaiters.get(message.method).splice(0)) resolve(message.params);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const waitFor = method => new Promise(resolve => {
  if (!eventWaiters.has(method)) eventWaiters.set(method, []);
  eventWaiters.get(method).push(resolve);
});
const evaluate = expression => send('Runtime.evaluate', { expression, returnByValue: true }).then(r => r.result.value);
const navigate = async (url) => {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  await new Promise(resolve => setTimeout(resolve, 250));
};

await send('Page.enable');
await send('Runtime.enable');
const widths = [320, 375, 425, 768, 1024, 1440, 1920];
const failures = [];
for (const width of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
  await navigate('http://127.0.0.1:8765/');
  const result = await evaluate(`(() => {
    const menu = document.querySelector('.menu-toggle');
    const form = document.querySelector('#quote-form');
    const h1 = document.querySelector('h1');
    return {
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      menuDisplay: getComputedStyle(menu).display,
      formWidth: Math.round(form.getBoundingClientRect().width),
      headingSize: getComputedStyle(h1).fontSize,
      headingWeight: getComputedStyle(h1).fontWeight
    };
  })()`);
  if (result.scrollWidth > result.innerWidth) failures.push(`Homepage overflows at ${width}px (${result.scrollWidth}px)`);
  const shouldShowMenu = width <= 900;
  if ((result.menuDisplay !== 'none') !== shouldShowMenu) failures.push(`Incorrect menu mode at ${width}px`);
  console.log(`${width}px ${JSON.stringify(result)}`);
  if ([375, 1440].includes(width)) {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(os.tmpdir(), `y1k-${width}.png`), Buffer.from(shot.data, 'base64'));
  }
}

await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: true });
for (const route of ['/services/website-development/', '/services/software-development/', '/services/mobile-app-development/', '/services/web-app-development/', '/apps/', '/apps/ExpenseTracker/', '/apps/ExpenseTracker/UserGuide.html', '/apps/ExpenseTracker/privacy-policy.html']) {
  await navigate(`http://127.0.0.1:8765${route}`);
  const dimensions = await evaluate(`({innerWidth, scrollWidth: document.documentElement.scrollWidth})`);
  if (dimensions.scrollWidth > dimensions.innerWidth) failures.push(`${route} overflows at 375px (${dimensions.scrollWidth}px)`);
  if (['/services/website-development/', '/apps/', '/apps/ExpenseTracker/'].includes(route)) {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const name = route === '/apps/ExpenseTracker/' ? 'expense-detail' : route.startsWith('/apps') ? 'apps' : 'service';
    fs.writeFileSync(path.join(os.tmpdir(), `y1k-${name}-375.png`), Buffer.from(shot.data, 'base64'));
  }
}

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await navigate('http://127.0.0.1:8765/apps/ExpenseTracker/');
const expenseShot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
fs.writeFileSync(path.join(os.tmpdir(), 'y1k-expense-detail-1440.png'), Buffer.from(expenseShot.data, 'base64'));

await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: true });
await navigate('http://127.0.0.1:8765/');
const menu = await evaluate(`(() => { const b=document.querySelector('.menu-toggle'); b.click(); return {expanded:b.getAttribute('aria-expanded'),open:document.querySelector('.site-nav').classList.contains('open')}; })()`);
if (menu.expanded !== 'true' || !menu.open) failures.push('Mobile menu does not open or update aria-expanded');
const validation = await evaluate(`(() => { const f=document.querySelector('#quote-form'); f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return {invalid:[...f.querySelectorAll('[aria-invalid="true"]')].map(e=>e.id),focused:document.activeElement.id}; })()`);
if (validation.invalid.join(',') !== 'name,email,service,project' || validation.focused !== 'name') failures.push(`Form validation failed: ${JSON.stringify(validation)}`);

socket.close();
await fetch(`${endpoint}/json/close/${chrome.id}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Responsive layout, mobile navigation, and empty-form validation checks passed.');
