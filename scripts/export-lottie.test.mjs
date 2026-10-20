// export-lottie: gramática de path, markers derivados, lint del plan, export plano, reposo verificado y el CLI sobre los fixtures.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportAnimation, lintPlan, markersOf, pathToContours, valueAt, verify } from './export-lottie.mjs';
import { check } from './check-lottie.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../fixtures');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const roles = read(join(fixtures, 'roles.json'));

const same = (rel, abs) => assert.deepEqual(pathToContours(rel), pathToContours(abs));

test('pathToContours: relativos = absolutos (m l h v c z)', () => {
  same('m10,10l20,0v20h-20z', 'M10,10L30,10L30,30L10,30Z');
  same('M10,10c5,0,10,5,10,10s-5,10,-10,10z', 'M10,10C15,10,20,15,20,20C20,25,15,30,10,30Z');
});
test('pathToContours: S y T reflejan el punto de control anterior; sin curva previa usan el punto actual', () => {
  same('M0,0C0,10,10,20,20,20S40,10,40,0', 'M0,0C0,10,10,20,20,20C30,20,40,10,40,0');
  same('M0,0Q10,10,20,0T40,0', 'M0,0Q10,10,20,0Q30,-10,40,0');
  same('M0,0S10,10,20,0', 'M0,0C0,0,10,10,20,0');
});
test('pathToContours: pares sueltos tras M son L implícitos y los comandos se repiten', () => {
  same('M0,0 10,0 10,10z', 'M0,0L10,0L10,10Z');
  same('M0,0l10,0 0,10 -10,0z', 'M0,0L10,0L10,10L0,10Z');
});
test('pathToContours: un arco relativo cae donde el absoluto', () => same('M0,0a10,10,0,0,1,20,0', 'M0,0A10,10,0,0,1,20,0'));
test('pathToContours: dibujar tras un Z abre un subtrazo nuevo; dos subtrazos con M quedan separados', () => {
  const c = pathToContours('M0,0L10,0L10,10ZL20,20');
  assert.equal(c.length, 2);
  assert.equal(c[0].c, true);
  assert.deepEqual(c[1].v[0], [0, 0]);
  assert.equal(c[1].c, false);
  assert.equal(pathToContours('M0,0L5,0L5,5ZM20,20L25,20L25,25Z').length, 2);
});
test('pathToContours: rechaza lo que no sabe y respeta los decimales', () => {
  assert.throws(() => pathToContours('M0,0A10,5,0,0,1,20,0'), /circular/);
  assert.deepEqual(pathToContours('M0.123456,0.5L1,1Z', 1)[0].v[0], [0.1, 0.5]);
});

test('markersOf: derivados con UN frame de separación; plan.markers manda si existe', () => {
  assert.deepEqual(markersOf({ keys: { a: { dr: 10 }, b: { dr: 20 }, c: { dr: 5 } } }), { a: { tm: 0, dr: 10 }, b: { tm: 11, dr: 20 }, c: { tm: 32, dr: 5 } });
  assert.deepEqual(markersOf({ markers: { z: { tm: 3, dr: 4 } }, keys: {} }), { z: { tm: 3, dr: 4 } });
});

// ---- spec mínima propia
const tiny = () => ({
  parts: [
    { name: 'base', node: 'rootGrp', svg: '<circle cx="500" cy="500" r="100" fill="#3366cc" stroke="#1b1b1f" stroke-width="4"/>' },
    { name: 'glow', node: 'rootGrp', rest: { o: 0 }, svg: '<path d="M400,400L600,400L600,600L400,600Z" fill="#e4e4e7" fill-rule="evenodd"/>' },
  ],
  joints: { c: { x: 500, y: 500 } },
  rig: { rootGrp: { joint: 'c', parent: null } },
  limits: { 'rootGrp.r': [-400, 400] },
  segments: { idle: { autoplay: true, repeats: 2 }, spin: {} },
  plan: {
    keys: {
      idle: { dr: 30, keys: { rootGrp: { r: [[0, 0, 'io'], [15, 10, 'io'], [30, 0]] } } },
      spin: { dr: 20, keys: { rootGrp: { r: [[0, 0, 'io'], [16, 360, 'io'], [20, 360]] }, glow: { o: [[0, 0, 'hold'], [5, 1, 'hold'], [15, 0, 'hold'], [20, 0]] } } },
    },
  },
});

test('lintPlan: una spec correcta no da fallos', () => assert.deepEqual(lintPlan(tiny(), 't'), []));

for (const [label, mutate, msg] of [
  ['nombre de pieza repetido', (s) => s.parts.push({ ...s.parts[0] }), 'part name "base" is repeated'],
  ['nodo con el nombre de una pieza', (s) => (s.rig.base = { joint: 'c', parent: null }), 'both a part and a rig node'],
  ['joint inexistente', (s) => (s.rig.rootGrp.joint = 'nope'), 'joint "nope" is not in joints'],
  ['padre inexistente', (s) => (s.rig.rootGrp.parent = 'ghost'), 'parent "ghost" is not a rig node'],
  ['ciclo en el rig', (s) => { s.rig.a = { joint: 'c', parent: 'b' }; s.rig.b = { joint: 'c', parent: 'a' }; }, 'parent cycle'],
  ['pieza con nodo inexistente', (s) => (s.parts[0].node = 'x'), 'node "x" is not in rig'],
  ['segmento sin plan', (s) => (s.segments.extra = {}), 'segment "extra" has no entry in plan.keys'],
  ['plan sin segmento declarado', (s) => (s.plan.keys.extra = { dr: 5, keys: {} }), 'plan segment "extra" is missing in segments'],
  ['objetivo desconocido', (s) => (s.plan.keys.idle.keys.ghost = { r: [[0, 0], [30, 0]] }), 'neither a rig node nor a part'],
  ['canal desconocido', (s) => (s.plan.keys.idle.keys.rootGrp.z = [[0, 0], [30, 0]]), 'unknown channel'],
  ['claves que no crecen', (s) => (s.plan.keys.idle.keys.rootGrp.r = [[0, 0], [15, 5], [15, 6], [30, 0]]), 'keys not increasing at frame 15'],
  ['claves que no abarcan 0..dr', (s) => (s.plan.keys.idle.keys.rootGrp.r = [[0, 0], [20, 0]]), 'keys must span frames 0..30'],
  ['no arranca en reposo', (s) => (s.plan.keys.idle.keys.rootGrp.r = [[0, 5], [30, 0]]), 'starts at 5, rest is 0'],
  ['no termina en reposo', (s) => (s.plan.keys.idle.keys.rootGrp.r = [[0, 0], [30, 5]]), 'ends at 5, rest is 0'],
  ['fuera de límites', (s) => (s.plan.keys.idle.keys.rootGrp.r = [[0, 0], [15, 450], [30, 0]]), 'outside limits'],
  ['autoplay de más de 5 s', (s) => (s.segments.idle.repeats = 6), 'lasts more than 5 s'],
  ['views de un segmento inexistente', (s) => (s.views = { nope: [0] }), 'views.nope: segment is not in plan.keys'],
  ['views con un frame fuera de 0..dr', (s) => (s.views = { idle: [0, 31] }), 'views.idle: frames must be integers 0..30'],
  ['opacidad: reposo de la pieza es 0', (s) => (s.plan.keys.spin.keys.glow.o = [[0, 1], [20, 1]]), 'starts at 1, rest is 0'],
]) {
  test(`lintPlan: ${label}`, () => {
    const s = tiny();
    mutate(s);
    assert.ok(lintPlan(s, 't').some((e) => e.includes(msg)), lintPlan(s, 't').join('\n'));
  });
}

test('lintPlan: un nodo que empieza fuera de reposo por diseño se exime con offPoseStart', () => {
  const s = tiny();
  s.plan.keys.idle.keys.rootGrp.r = [[0, 20], [15, 0], [30, 0]];
  assert.ok(lintPlan(s, 't').some((e) => e.includes('starts at 20')));
  s.plan.keys.idle.offPoseStart = ['rootGrp'];
  assert.deepEqual(lintPlan(s, 't'), []);
});

test('exportAnimation: capas planas, z-order, markers, meta.repeats, evenodd, vuelta completa y opacidad por pieza', () => {
  const s = tiny();
  const j = exportAnimation(s, 'tiny');
  assert.equal(j.fr, 30);
  assert.equal(j.w, 1000);
  assert.equal(j.op, 52); // 30 + 1 + 20 + 1
  assert.deepEqual(j.markers, [{ cm: 'idle', tm: 0, dr: 30 }, { cm: 'spin', tm: 31, dr: 20 }]);
  assert.deepEqual(j.meta.repeats, { idle: 2 });
  assert.deepEqual(j.layers.map((l) => [l.nm, l.ty]), [['glow', 4], ['base', 4], ['rootGrp', 3]]); // la primera pieza va al fondo
  assert.equal(j.layers[1].parent, 3);
  assert.equal(j.layers[0].shapes[0].it.find((i) => i.ty === 'fl').r, 2); // fill-rule evenodd
  assert.equal(j.layers[1].shapes[0].it.find((i) => i.ty === 'fl').r, 1);
  const root = j.layers[2];
  assert.equal(valueAt(root.ks.r, 31 + 20), 360); // la vuelta completa llega a 360
  assert.equal(valueAt(j.layers[0].ks.o, 0), 0); // glow en reposo
  assert.equal(valueAt(j.layers[0].ks.o, 31 + 7), 100); // y visible a mitad del segmento
  assert.deepEqual(verify(j, s, 'tiny'), []);
  assert.deepEqual(check(j, { roles, parts: s }), []);
});

test('exportAnimation: el error de una pieza dice cuál es (nombre del Lottie y de la pieza)', () => {
  const s = tiny();
  assert.throws(() => exportAnimation(s, 'tiny', (p) => (p.name === 'base' ? '<path d="M0,0A10,5,0,0,1,20,0" fill="#3366cc"/>' : p.svg)), /tiny\/base: only circular arcs \(rx = ry\), got rx=10 ry=5/);
});

test('verify: lee el JSON exportado y avisa de lo que no vuelve a reposo ni respeta el z-order', () => {
  const s = tiny();
  const j = exportAnimation(s, 'tiny');
  const bad = structuredClone(j);
  bad.layers.find((l) => l.nm === 'rootGrp').ks.r.k.at(-1).s = [200]; // el último keyframe (fin de spin) se va a 200°
  assert.ok(verify(bad, s, 'tiny').some((e) => e.includes('rootGrp') && e.includes('spin end')));
  const swapped = structuredClone(j);
  swapped.layers.reverse();
  assert.ok(verify(swapped, s, 'tiny').some((e) => e.startsWith('z-order')));
});

test('exportAnimation: s junto a sx/sy y sx/sy con claves distintas son error; opacidad en dos nodos de la cadena también', () => {
  const s = tiny();
  s.plan.keys.idle.keys.rootGrp.s = [[0, 1], [30, 1]];
  s.plan.keys.idle.keys.rootGrp.sy = [[0, 1], [30, 1]];
  assert.throws(() => exportAnimation(s, 't'), /s together with sx\/sy/);
  const t = tiny();
  t.plan.keys.idle.keys.rootGrp.sx = [[0, 1], [30, 1]];
  t.plan.keys.idle.keys.rootGrp.sy = [[0, 1], [10, 1.1], [30, 1]];
  assert.throws(() => exportAnimation(t, 't'), /same key schedule/);
  const u = tiny();
  u.plan.keys.idle.keys.rootGrp.o = [[0, 1], [30, 1]];
  assert.throws(() => exportAnimation(u, 't'), /opacity keyed on more than one/);
});

test('CLI: build-parts + export-lottie sobre persona y reloj pasan el gate; un plan roto sale 1 y no escribe basura', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ex-'));
  try {
    cpSync(fixtures, dir, { recursive: true });
    const run = (script, ...a) => spawnSync(process.execPath, [join(here, script), ...a], { encoding: 'utf8' });
    for (const name of ['persona', 'reloj']) {
      assert.equal(run('build-parts.mjs', join(dir, name, 'parts.json')).status, 0);
      const r = run('export-lottie.mjs', join(dir, name, 'parts.json'));
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, new RegExp(`^ok ${name}:`));
      assert.ok(existsSync(join(dir, name, `${name}.json`)));
    }
    const spec = read(join(dir, 'persona/parts.json'));
    spec.plan.keys.wave.keys.shoulderR.r.at(-1)[1] = 30; // termina fuera de reposo
    writeFileSync(join(dir, 'persona/roto.json'), JSON.stringify(spec));
    const bad = run('export-lottie.mjs', join(dir, 'persona/roto.json'), '--name', 'roto');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /wave\/shoulderR\.r: ends at 30/);
    assert.ok(!existsSync(join(dir, 'persona/roto.json.json')));
    assert.equal(run('export-lottie.mjs').status, 2);
    // sin parts/ no exporta y dice qué hacer; con parts/ más viejo que parts.json exporta pero avisa
    cpSync(join(dir, 'reloj'), join(dir, 'sin-piezas'), { recursive: true });
    rmSync(join(dir, 'sin-piezas/parts'), { recursive: true });
    const sin = run('export-lottie.mjs', join(dir, 'sin-piezas/parts.json'), '--name', 'sin');
    assert.equal(sin.status, 1);
    assert.match(sin.stderr, /FAIL sin: no SVG in .*parts for .*: run build-parts first/);
    assert.ok(!existsSync(join(dir, 'sin-piezas/sin.json')));
    const old = new Date(Date.now() - 3600_000);
    const piezas = read(join(dir, 'reloj/parts.json')).parts.map((p) => p.name);
    for (const n of piezas) utimesSync(join(dir, 'reloj/parts', `${n}.svg`), old, old);
    const vieja = run('export-lottie.mjs', join(dir, 'reloj/parts.json'));
    assert.equal(vieja.status, 0, vieja.stderr);
    assert.match(vieja.stderr, /warning: \d+ piece SVG\(s\) older than parts.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
