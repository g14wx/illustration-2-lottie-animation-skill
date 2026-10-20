// La fachada plantillas/illustration-vanilla.js con el player REAL (lottie_light) en Chrome headless, sobre el fixture `persona`.
// Las pruebas de illustration-vanilla.test.mjs usan un player falso; esta comprueba lo que solo el player real sabe:
// que `loop = pasadas - 1` da las pasadas pedidas, que un segmento termina en `dr - 1` y la fachada vuelve al reposo, y que el color sale del CONTENEDOR.
// El reloj de lottie se congela y se avanza a mano (`advanceTime`), así no depende del tiempo real. Sin Chrome o lottie_light, se omite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildParts } from './build-parts.mjs';
import { exportAnimation } from './export-lottie.mjs';
import { findChrome, findLottieLight, loadJson } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = findChrome();
const player = findLottieLight();
const skip = !chrome || !player ? 'sin Chrome o sin lottie_light.min.js (LOTTIE_LIGHT)' : false;

test('fachada + lottie_light real: idle x2 = 2 pasadas, wave termina en dr-1, siempre vuelve al reposo; el color sale del contenedor', { skip }, () => {
  const dir = join(root, 'fixtures/persona');
  const spec = loadJson(join(dir, 'parts.json'));
  const svgs = buildParts(spec, (p) => readFileSync(join(dir, p), 'utf8'), loadJson(join(root, 'fixtures/roles.json')));
  const json = exportAnimation(spec, 'persona', (p) => p.svg ?? svgs[p.name]);
  const facade = readFileSync(join(root, 'plantillas/illustration-vanilla.js'), 'utf8').replace(/^export /gm, '');
  const roles = readFileSync(join(root, 'fixtures/roles.json'), 'utf8');
  const html = `<!doctype html><meta charset="utf-8"><div id="box" style="width:300px;height:300px;--illus-brand:#ff0000"></div>
<script>${readFileSync(player, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>
<script>
document.documentElement.style.setProperty('--illus-brand', '#00ff00'); // el color del <html> NO debe ganar al del contenedor
${facade}
globalThis.fetch = async () => ({ ok: true, json: async () => (${JSON.stringify(json).replace(/</g, '\\u003c')}) });
const log = [];
lottie.freeze(); // reloj propio: el tiempo avanza solo con tick()
let A;
const real = lottie.loadAnimation;
const at = () => Math.round(A.currentFrame + A.firstFrame);
lottie.loadAnimation = (o) => { A = real.call(lottie, o); for (const e of ['loopComplete', 'complete']) A.addEventListener(e, () => log.push([e, at()])); return A; };
let ready;
const whenReady = new Promise((r) => (ready = r)); // la fachada monta en un momento ocioso (hasta 2 s): se espera el aviso, no un tiempo fijo
const ill = mountIllustration(document.getElementById('box'), { src: 'x.json', roles: ${roles}, loadPlayer: async () => lottie, onReady: () => { log.push(['ready', at()]); ready(); }, onDone: () => log.push(['done', at()]) });
const tick = (n) => { for (let i = 0; i < n; i++) A.advanceTime(1000 / 30); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  try {
    await whenReady;
    const svg = document.querySelector('#box svg').outerHTML;
    log.push(['colors', svg.includes('rgb(255,0,0)'), svg.includes('rgb(0,255,0)')]);
    ill.play('idle'); log.push(['play', 'idle']); tick(150);
    await sleep(50);
    ill.play('wave'); log.push(['play', 'wave']); tick(100);
    await sleep(50);
  } catch (e) {
    log.push(['error', String(e)]);
  }
  document.body.append(Object.assign(document.createElement('pre'), { id: 'out', textContent: JSON.stringify(log) }));
})();
</script>`;
  const d = mkdtempSync(join(tmpdir(), 'ill-real-'));
  try {
    writeFileSync(join(d, 'page.html'), html);
    // Con la máquina cargada, Chrome a veces vuelca el DOM antes de que el IntersectionObserver de la fachada dispare (tiempo virtual): se reintenta hasta 3 veces.
    let r, out;
    for (let intento = 0; intento < 3 && !out; intento++) {
      r = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${join(d, 'prof')}`, '--virtual-time-budget=8000', '--dump-dom', `file://${join(d, 'page.html')}`], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 90_000 });
      out = /<pre id="out">([^<]*)<\/pre>/.exec(r.stdout)?.[1];
    }
    const log = JSON.parse(out?.replace(/&quot;/g, '"') ?? assert.fail(`la página no terminó (Chrome salió ${r.status}): ${r.stdout.replace(/<script[\s\S]*?<\/script>/g, '').slice(0, 500)} ${r.stderr.slice(0, 300)}`));
    assert.ok(!log.some((x) => x[0] === 'error'), JSON.stringify(log));
    const [idle, wave] = [log.slice(log.findIndex((x) => x[1] === 'idle'), log.findIndex((x) => x[1] === 'wave')), log.slice(log.findIndex((x) => x[1] === 'wave'))];
    const n = (l, e) => l.filter((x) => x[0] === e).length;
    assert.deepEqual(log[0], ['ready', 0]);
    assert.deepEqual(log.find((x) => x[0] === 'colors'), ['colors', true, false], 'el color debe salir del contenedor, no de <html>');
    assert.equal(n(idle, 'loopComplete'), 1, 'idle: repeats 2 → una repetición tras la primera pasada (loop = 1)');
    assert.equal(n(idle, 'complete'), 1);
    assert.deepEqual(idle.at(-1), ['done', 0], 'tras idle vuelve al reposo (frame 0)');
    assert.equal(n(wave, 'loopComplete'), 0);
    const end = wave.find((x) => x[0] === 'complete')[1];
    assert.ok(end >= 134 && end <= 136, `wave (61 + 75) debe terminar en dr - 1 = 135, terminó en ${end}`);
    assert.deepEqual(wave.at(-1), ['done', 0]);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
