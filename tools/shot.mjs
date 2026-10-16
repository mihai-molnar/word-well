// Headless Chrome driver: opens index.html, starts a game, runs steps, saves the 320x272 canvas as a PNG.
// Usage: node tools/shot.mjs <out.png> [--query=fast] [key:<Code> | wait:<ms> | js:<expression>] ...
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const out = args.shift();
if (!out) { console.error('usage: node tools/shot.mjs <out.png> [--query=fast] [steps...]'); process.exit(2); }
let query = '';
const steps = [];
for (const a of args) { if (a.startsWith('--query=')) query = '?' + a.slice(8); else steps.push(a); }
const page = fileURLToPath(new URL('../index.html', import.meta.url));
const url = 'file://' + page + query;

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  s.on('error', rej);
});
const wait = ms => new Promise(r => setTimeout(r, ms));

const port = await freePort();
const profile = mkdtempSync(join(tmpdir(), 'ww-shot-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=960,816', '--no-first-run', url], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

async function main() {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {}
    await wait(200);
  }
  if (!targets) throw new Error('Chrome did not start');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => {
    const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (m.error) throw new Error(m.error.message);
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || m.result.exceptionDetails.text);
    return m.result.result.value;
  };
  const press = async code => {
    const key = code === 'Space' ? ' ' : code === 'Enter' ? 'Enter' : code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
    const vk = { Enter: 13, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32 }[code] || (code.startsWith('Key') ? code.charCodeAt(3) : 0);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };

  for (let i = 0; i < 50 && (await evaluate('typeof wordwell')) !== 'object'; i++) await wait(100);
  await wait(300);
  await press('Enter');
  for (let i = 0; i < 50 && (await evaluate('wordwell.state')) !== 'play'; i++) await wait(100);
  for (const s of steps) {
    const c = s.indexOf(':');
    const kind = s.slice(0, c), arg = s.slice(c + 1);
    if (kind === 'key') await press(arg);
    else if (kind === 'wait') await wait(Number(arg));
    else if (kind === 'js') { const v = await evaluate(arg); if (v !== undefined) console.log(JSON.stringify(v)); }
    else throw new Error('unknown step ' + s);
  }
  const data = await evaluate(`document.getElementById('screen').toDataURL('image/png')`);
  writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  ws.close();
}

try { await main(); } catch (e) { console.error(e.message || e); cleanup(); process.exit(1); }
cleanup();
process.exit(0);
