// render e index-svg: la página que arman y, si hay Chrome y lottie_light, una captura real. Sin ellos, esas pruebas se omiten.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { indexPage } from './index-svg.mjs';
import { findChrome, findLottieLight } from './lib.mjs';
import { renderPage, restProbes } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../fixtures');
const chrome = findChrome();
const player = findLottieLight();
const skip = !chrome || !player ? 'sin Chrome o sin lottie_light.min.js (LOTTIE_LIGHT)' : false;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('renderPage: una celda por frame, etiquetas y un goToAndStop por celda; el JSON no puede cerrar el <script>', () => {
  const html = renderPage({ nm: '</script><b>' }, { frames: [0, 30], labels: ['a', 'b'], size: 200, bg: '#fff', cols: 2, player: '/tmp/lottie_light.min.js' });
  assert.equal((html.match(/<figure>/g) ?? []).length, 2);
  assert.match(html, /<figcaption>a<\/figcaption>/);
  assert.match(html, /\[0,30\]\.forEach/);
  assert.match(html, /file:\/\/\/tmp\/lottie_light\.min\.js/);
  assert.ok(!html.includes('</script><b>'));
});

test('indexPage: lleva la cuenta de elementos de build-parts y el SVG en línea; lo no soportado falla antes de escribir', () => {
  const svg = readFileSync(join(fixtures, 'donors/persona.svg'), 'utf8');
  const html = indexPage(svg, 800, 'persona.svg');
  assert.match(html, /const EXPECTED = 26;/);
  assert.match(html, /<svg xmlns=/);
  assert.ok(!html.includes('<?xml'));
  assert.match(html, /id="only"/);
  assert.throws(() => indexPage('<svg><g class="x"><path d="M0,0"/></g></svg>'), /<g> with class/);
});

test('restProbes: inicio y fin de cada segmento; los que empiezan fuera de reposo por diseño solo se miden al final', () => {
  const j = { markers: [{ cm: 'idle', tm: 0, dr: 10 }, { cm: 'enter', tm: 11, dr: 20 }] };
  assert.deepEqual(restProbes(j), [['idle', 'start', 0], ['idle', 'end', 10], ['enter', 'start', 11], ['enter', 'end', 31]]);
  assert.deepEqual(restProbes(j, ['enter']), [['idle', 'start', 0], ['idle', 'end', 10], ['enter', 'end', 31]]);
});

test('CLI render: sin lottie_light dice qué hacer y sale 1; sin argumentos sale 2', () => {
  const d = mkdtempSync(join(tmpdir(), 'rn-'));
  try {
    writeFileSync(join(d, 'a.json'), JSON.stringify({ markers: [{ cm: 'idle', tm: 0, dr: 10 }], layers: [] }));
    const r = spawnSync(process.execPath, [join(here, 'render.mjs'), join(d, 'a.json'), '--lottie-light', join(d, 'no.js')], { encoding: 'utf8', env: { ...process.env, CHROME: chrome ?? '/usr/bin/true' } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /lottie_light.min.js not found/);
    assert.equal(spawnSync(process.execPath, [join(here, 'render.mjs')]).status, 2);
    const seg = spawnSync(process.execPath, [join(here, 'render.mjs'), join(d, 'a.json'), '--segment', 'nope', '--lottie-light', join(d, 'no.js')], { encoding: 'utf8' });
    assert.equal(seg.status, 1);
    assert.equal(spawnSync(process.execPath, [join(here, 'render.mjs'), join(d, 'a.json'), '--frame', '0', '--segment', 'idle']).status, 2);
    assert.equal(spawnSync(process.execPath, [join(here, 'render.mjs'), join(d, 'a.json'), '--views', 'p.json', '--frame', '0']).status, 2); // --views no se mezcla con --frame
    const rc = spawnSync(process.execPath, [join(here, 'render.mjs'), join(d, 'a.json'), '--rest-check', '--lottie-light', join(d, 'no.js')], { encoding: 'utf8', env: { ...process.env, CHROME: chrome ?? '/usr/bin/true' } });
    assert.equal(rc.status, 1);
    assert.match(rc.stderr, /lottie_light.min.js not found/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('CLI render: pinta frames de un Lottie con el player real (PNG de verdad, no vacío)', { skip }, () => {
  const d = mkdtempSync(join(tmpdir(), 'rn-'));
  try {
    const run = (...a) => spawnSync(process.execPath, [join(here, 'render.mjs'), ...a], { encoding: 'utf8', cwd: d });
    const pp = join(d, 'parts.json');
    writeFileSync(join(d, 'roles.json'), readFileSync(join(fixtures, 'roles.json')));
    writeFileSync(pp, readFileSync(join(here, '../plantillas/parts.ejemplo.json')));
    const exp = spawnSync(process.execPath, [join(here, 'export-lottie.mjs'), pp, '--name', 'pelota'], { encoding: 'utf8' });
    assert.equal(exp.status, 0, exp.stderr);
    const out = join(d, 'frames.png');
    const r = run(join(d, 'pelota.json'), '--segment', 'bounce', '--at', '0,16', '--size', '200', '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const png = readFileSync(out);
    assert.deepEqual(png.subarray(0, 4), PNG);
    assert.ok(png.length > 4000, `PNG demasiado pequeño (${png.length} bytes): ¿se pintó algo?`);
    // el mismo frame con otro color de autoría (--map) da otra imagen
    writeFileSync(join(d, 'map.json'), JSON.stringify({ '#3366cc': '#cc3333' }));
    const out2 = join(d, 'frames2.png');
    assert.equal(run(join(d, 'pelota.json'), '--frame', '0', '--size', '200', '--map', join(d, 'map.json'), '--out', out2).status, 0);
    assert.notDeepEqual(readFileSync(out2), readFileSync(join(d, 'frames.png')));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('CLI render: --rest-check compara lo que dibuja el player; un final fuera de reposo sale DIFF y exit 1; --views pinta la hoja de poses', { skip }, () => {
  const d = mkdtempSync(join(tmpdir(), 'rn-'));
  try {
    const run = (...a) => spawnSync(process.execPath, [join(here, 'render.mjs'), ...a], { encoding: 'utf8', cwd: d });
    const pp = join(d, 'parts.json');
    writeFileSync(join(d, 'roles.json'), readFileSync(join(fixtures, 'roles.json')));
    writeFileSync(pp, readFileSync(join(here, '../plantillas/parts.ejemplo.json')));
    assert.equal(spawnSync(process.execPath, [join(here, 'export-lottie.mjs'), pp, '--name', 'pelota'], { encoding: 'utf8' }).status, 0);
    const ok = run(join(d, 'pelota.json'), '--rest-check', '--parts', pp);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /bounce start f49 SAME/);
    assert.match(ok.stdout, /bounce end f89 SAME/);
    assert.match(ok.stdout, /ok rest-check: 4 frames/);
    const j = JSON.parse(readFileSync(join(d, 'pelota.json'), 'utf8'));
    const ball = j.layers.find((l) => l.nm === 'ballGrp');
    ball.ks.r = { a: 1, k: [{ t: 0, s: [0], h: 1 }, { t: 89, s: [30], h: 1 }] }; // gira 30 grados solo desde el último frame del segmento bounce
    writeFileSync(join(d, 'torcida.json'), JSON.stringify(j));
    const bad = run(join(d, 'torcida.json'), '--rest-check');
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /bounce end f89 DIFF/);
    assert.match(bad.stderr, /FAIL rest-check: 1 frame/);
    const sheet = join(d, 'poses.png');
    const v = run(join(d, 'pelota.json'), '--views', pp, '--size', '160', '--out', sheet);
    assert.equal(v.status, 0, v.stderr);
    assert.match(v.stdout, /frames 0, 57, 65, 78/); // reposo + bounce +8, +16, +29
    assert.ok(readFileSync(sheet).length > 3000);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
