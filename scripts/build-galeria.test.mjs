// build-galeria: inlinea Lottie, PNG, roles y paletas en UN html; con --player lo hace autosuficiente. Con Chrome, lo abre de verdad.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildGaleria } from '../plantillas/build-galeria.mjs';
import { findChrome, findLottieLight } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const template = readFileSync(join(root, 'plantillas/galeria.html'), 'utf8');
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const dataOf = (html) => JSON.parse(/<script type="application\/json" id="galeria-data">([\s\S]*?)<\/script>/.exec(html)[1].replaceAll('\\u003c', '<'));

test('buildGaleria: mete assets, roles y paletas (objeto o ruta), el PNG como data URI y escapa "<"', () => {
  const files = { 'a.json': JSON.stringify({ nm: '</script>x', markers: [] }), 'roles.json': '{"#111111":"--ink"}', 'p.json': '{"--ink":"#fff"}', 'o.png': PNG1 };
  const html = buildGaleria(
    { title: 'T', intro: 'I', roles: 'roles.json', palettes: { A: 'p.json', B: { '--ink': '#000' } }, assets: [{ id: 'a', label: 'A', use: 'u', json: 'a.json', png: 'o.png' }] },
    template,
    (p) => Buffer.from(files[p]),
  );
  const d = dataOf(html);
  assert.equal(d.title, 'T');
  assert.deepEqual(d.roles, { '#111111': '--ink' });
  assert.deepEqual(d.palettes, { A: { '--ink': '#fff' }, B: { '--ink': '#000' } });
  assert.equal(d.assets[0].data.nm, '</script>x');
  assert.match(d.assets[0].png, /^data:image\/png;base64,iVBOR/);
  assert.equal((html.match(/<\/script>/g) ?? []).length, (template.match(/<\/script>/g) ?? []).length); // nadie cerró un <script> de más
  assert.match(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/lottie-web\/5\.12\.2\/lottie_light\.min\.js/);
});

test('buildGaleria: `palettes` puede ser una ruta a un .json y se ignoran las claves que empiezan con "_"', () => {
  const files = { 'todas.json': JSON.stringify({ _comment: 'texto', A: { '--ink': '#fff' }, B: 'b.json' }), 'b.json': '{"--ink":"#000"}' };
  const rd = (p) => Buffer.from(files[p]);
  assert.deepEqual(dataOf(buildGaleria({ palettes: 'todas.json' }, template, rd)).palettes, { A: { '--ink': '#fff' }, B: { '--ink': '#000' } });
  assert.deepEqual(dataOf(buildGaleria({ palettes: { _comment: 'x', A: { '--ink': '#fff' } } }, template, rd)).palettes, { A: { '--ink': '#fff' } });
});

test('buildGaleria: compose, shots y notes pasan a los datos; un id de compose que no existe es error', () => {
  const files = { 'a.json': '{"markers":[]}', 's.png': PNG1 };
  const html = buildGaleria(
    { assets: [{ id: 'fondo', json: 'a.json' }, { id: 'persona', json: 'a.json' }], compose: { bgs: ['fondo'], cast: ['persona'] }, shots: [{ label: 'Login', png: 's.png' }, { label: 'Web', pngSrc: 'x.png' }], notes: [{ title: 'Contraste', items: ['5,45:1'] }] },
    template,
    (p) => Buffer.from(files[p]),
  );
  const d = dataOf(html);
  assert.deepEqual(d.compose, { bgs: ['fondo'], cast: ['persona'] });
  assert.match(d.shots[0].png, /^data:image\/png;base64,/);
  assert.deepEqual(d.shots[1], { label: 'Web', png: 'x.png' });
  assert.deepEqual(d.notes, [{ title: 'Contraste', items: ['5,45:1'] }]);
  assert.throws(() => buildGaleria({ assets: [{ id: 'a', json: 'a.json' }], compose: { cast: ['b'] } }, template, (p) => Buffer.from(files[p])), /compose.cast: unknown asset "b"/);
  assert.equal(dataOf(buildGaleria({ assets: [] }, template, () => Buffer.alloc(0))).compose, null);
});

test('buildGaleria avisa por warn: sin --player, con --player vacío y con un HTML de más de 16 MB', () => {
  const w = [];
  buildGaleria({ assets: [] }, template, () => Buffer.alloc(0), undefined, (m) => w.push(m));
  assert.match(w[0], /no --player: .*5\.12\.2.*cdnjs/);
  buildGaleria({ assets: [] }, template, () => Buffer.alloc(0), '', (m) => w.push(m));
  assert.match(w[1], /--player is empty \(is \$LOTTIE_LIGHT set\?\)/);
  const none = [];
  buildGaleria({ assets: [] }, template, () => Buffer.alloc(0), 'window.lottie = 1;', (m) => none.push(m));
  assert.deepEqual(none, []);
  const big = [];
  buildGaleria({ assets: [{ id: 'g', json: 'a.json' }] }, template, () => Buffer.from(JSON.stringify({ markers: [], pad: 'x'.repeat(17 * 2 ** 20) })), 'p', (m) => big.push(m));
  assert.match(big[0], /the HTML is 17\.\d MB; a Claude Artifact takes at most 16 MB/);
});

test('buildGaleria: --player lo mete dentro (sin red); falta id o json, o plantilla sin bloque de datos: error', () => {
  const html = buildGaleria({ assets: [] }, template, () => Buffer.alloc(0), 'window.lottie = 1; // </script>');
  assert.ok(!html.includes('cdnjs.cloudflare.com'));
  assert.match(html, /window\.lottie = 1; \/\/ <\\\/script>/);
  assert.throws(() => buildGaleria({ assets: [{ id: 'x' }] }, template, () => Buffer.alloc(0)), /id and json \(inline\) or src/);
  const rel = dataOf(buildGaleria({ assets: [{ id: 'r', src: 'a/r.json', pngSrc: 'a/r.png' }] }, template, () => assert.fail('no debe leer nada')));
  assert.deepEqual(rel.assets[0], { id: 'r', src: 'a/r.json', png: 'a/r.png' });
  assert.throws(() => buildGaleria({ assets: [] }, '<html></html>', () => Buffer.alloc(0)), /no #galeria-data block/);
});

const chrome = findChrome();
const player = findLottieLight();
test('CLI + Chrome: la galería se abre, monta una tarjeta por asset y no deja errores', { skip: !chrome || !player ? 'sin Chrome o lottie_light.min.js' : false }, () => {
  const d = mkdtempSync(join(tmpdir(), 'gal-'));
  try {
    const run = (script, ...a) => spawnSync(process.execPath, [script, ...a], { encoding: 'utf8', cwd: d });
    const w = (n, c) => (writeFileSync(join(d, n), c), join(d, n));
    w('roles.json', readFileSync(join(root, 'fixtures/roles.json')));
    const spec = w('parts.json', readFileSync(join(root, 'plantillas/parts.ejemplo.json')));
    assert.equal(run(join(here, 'export-lottie.mjs'), spec, '--name', 'pelota').status, 0);
    w('o.png', PNG1);
    w('m.json', JSON.stringify({ title: 'Prueba', roles: 'roles.json', palettes: join(root, 'plantillas/paletas.ejemplo.json'), assets: [{ id: 'pelota', label: 'Pelota', json: 'pelota.json', png: 'o.png' }, { id: 'pelota2', label: 'Otra', json: 'pelota.json' }], compose: { bgs: ['pelota'], cast: ['pelota2'] }, shots: [{ label: 'Pantalla', png: 'o.png' }], notes: [{ title: 'Límites aceptados', items: ['uno'] }] }));
    const r = run(join(root, 'plantillas/build-galeria.mjs'), join(d, 'm.json'), '--out', join(d, 'g.html'), '--player', player);
    assert.equal(r.status, 0, r.stderr);
    const dom = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${join(d, 'prof')}`, '--allow-file-access-from-files', '--virtual-time-budget=4000', '--dump-dom', `file://${join(d, 'g.html')}`], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000 });
    assert.match(dom.stdout, /data-ready="2"/);
    assert.ok(!/data-error/.test(dom.stdout), 'la galería reportó un error');
    assert.equal((dom.stdout.match(/<article class="card"/g) ?? []).length, 2);
    assert.match(dom.stdout, /▶ bounce/);
    assert.match(dom.stdout, /class="card compose"/);
    assert.match(dom.stdout, /▶ personaje: bounce/);
    assert.match(dom.stdout, /<h2>Pantallas reales<\/h2>/);
    assert.match(dom.stdout, /<h2>Límites aceptados<\/h2>/);
    assert.match(dom.stdout, /<option>B \(marca verde\)<\/option>/); // la paleta salió de una ruta, sin `_comment`
    assert.ok(!/<option>_comment/.test(dom.stdout));
    assert.match(dom.stdout, /<td>idle<\/td><td>0–48<\/td><td>×2<\/td><td class="ok">3.2 s/);
    // a 390 px no hay scroll horizontal (la opción larga del selector de paleta ensanchaba la página: 443 px). Chrome headless no baja de 500 px
    // de ventana, así que la galería se mide dentro de un iframe de 390 px.
    writeFileSync(join(d, 'g-medida.html'), readFileSync(join(d, 'g.html'), 'utf8').replace('</body>', '<script>setTimeout(() => { const f = innerWidth + "/" + document.documentElement.scrollWidth; document.body.dataset.m = f; }, 300)</script></body>'));
    writeFileSync(join(d, 'marco.html'), '<!doctype html><body style="margin:0"><iframe id="f" src="g-medida.html" style="width:390px;height:900px;border:0"></iframe><script>setTimeout(() => { document.body.dataset.r = document.getElementById("f").contentDocument.body.dataset.m }, 1500)</script></body>');
    const marco = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${join(d, 'prof2')}`, '--allow-file-access-from-files', '--virtual-time-budget=4000', '--window-size=800,900', '--dump-dom', `file://${join(d, 'marco.html')}`], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000 });
    const [ancho, scroll] = /data-r="(\d+)\/(\d+)"/.exec(marco.stdout)?.slice(1).map(Number) ?? [];
    assert.equal(ancho, 390);
    assert.ok(scroll <= ancho, `scrollWidth ${scroll} > ${ancho}: hay scroll horizontal`);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('CLI + Chrome: un asset por `src` (URL relativa) se lee con fetch cuando la galería se sirve por http', { skip: !chrome || !player ? 'sin Chrome o lottie_light.min.js' : false }, async () => {
  const { createServer } = await import('node:http');
  const d = mkdtempSync(join(tmpdir(), 'gal-src-'));
  const server = createServer((req, res) => {
    try {
      const f = join(d, decodeURIComponent(req.url.slice(1)));
      const body = readFileSync(f);
      res.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const w = (n, c) => (writeFileSync(join(d, n), c), join(d, n));
    w('roles.json', readFileSync(join(root, 'fixtures/roles.json')));
    const spec = w('parts.json', readFileSync(join(root, 'plantillas/parts.ejemplo.json')));
    assert.equal(spawnSync(process.execPath, [join(here, 'export-lottie.mjs'), spec, '--name', 'pelota'], { encoding: 'utf8' }).status, 0);
    w('m.json', JSON.stringify({ assets: [{ id: 'pelota', label: 'Pelota', src: 'pelota.json' }] }));
    const r = spawnSync(process.execPath, [join(root, 'plantillas/build-galeria.mjs'), join(d, 'm.json'), '--out', join(d, 'g.html'), '--player', player], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const url = `http://127.0.0.1:${server.address().port}/g.html`;
    const dom = await new Promise((resolve, reject) => {
      const p = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${join(d, 'prof')}`, '--virtual-time-budget=4000', '--dump-dom', url]);
      let out = '';
      p.stdout.on('data', (c) => (out += c));
      p.on('error', reject);
      p.on('close', () => resolve(out));
    });
    assert.match(dom, /data-ready="1"/);
    assert.ok(!/data-error/.test(dom), 'la galería reportó un error');
  } finally {
    server.close();
    rmSync(d, { recursive: true, force: true });
  }
});
