// reskin: reemplazo de dibujos por nombre de capa, en el export plano de export-lottie y en el de Creator (precomps); la animación no cambia.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportAnimation } from './export-lottie.mjs';
import { reskin } from './reskin.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'reskin.mjs');
const shapes = (c) => [{ ty: 'gr', it: [{ ty: 'fl', c: { a: 0, k: c } }] }];
const kf = [{ t: 0, s: [0] }, { t: 30, s: [45] }];

// ---- export de Creator: capa precomp (ty 0) → asset con UNA capa de forma (ty 4)
const leaf = (nm, color, ks) => ({
  layer: { ty: 0, nm, refId: nm, ks },
  asset: { id: nm, layers: [{ ty: 4, nm: 'Shape Layer 1', ks: { o: { a: 0, k: 100 } }, shapes: shapes(color) }] },
});
const hand = leaf('hand', [1, 0, 0, 1], { r: { a: 1, k: kf } });
const head = leaf('head', [1, 0, 0, 1], { r: { a: 0, k: 0 } });
const base = {
  nm: 'char-a',
  layers: [{ ty: 0, nm: 'figureGrp', refId: 'figure' }],
  assets: [{ id: 'figure', layers: [{ ty: 0, nm: 'armGrp', refId: 'arm' }, head.layer] }, { id: 'arm', layers: [hand.layer] }, hand.asset, head.asset], // hand queda a profundidad 2
};
const skinOf = (...names) => {
  const parts = names.map((n) => leaf(n, [0, 0, 1, 1], { p: { a: 0, k: [9, 9] } }));
  return { layers: parts.map((p) => p.layer), assets: parts.map((p) => p.asset) };
};
const shapeOf = (j, id) => j.assets.find((a) => a.id === id).layers[0];

test('Creator: reemplaza shapes a cualquier profundidad y reporta replaced/missing', () => {
  const r = reskin(base, skinOf('hand'));
  assert.deepEqual(shapeOf(r.json, 'hand').shapes, shapes([0, 0, 1, 1]));
  assert.deepEqual(shapeOf(r.json, 'head').shapes, shapes([1, 0, 0, 1]));
  assert.deepEqual(r.replaced, ['hand']);
  assert.deepEqual(r.missing, ['head']);
});

test('Creator: mantiene transformaciones y keyframes del base; no muta base', () => {
  const before = structuredClone(base);
  const { json } = reskin(base, skinOf('hand', 'head'));
  assert.deepEqual(json.assets.find((a) => a.id === 'arm').layers[0].ks.r.k, kf);
  assert.deepEqual(shapeOf(json, 'hand').ks, shapeOf(base, 'hand').ks);
  assert.deepEqual(base, before);
});

test('Creator: pieza desconocida o que no es una hoja de una sola forma: lanza con su nombre', () => {
  assert.throws(() => reskin(base, skinOf('hand', 'tail')), /unknown to base.*tail/);
  const skin = skinOf('hand');
  skin.assets[0].layers.push(structuredClone(skin.assets[0].layers[0]));
  assert.throws(() => reskin(base, skin), /hand/);
});

// ---- export plano de export-lottie.mjs: la hoja es la propia capa de forma
const spec = (fill) => ({
  parts: [
    { name: 'body', node: 'rootGrp', svg: `<circle cx="500" cy="500" r="100" fill="${fill}"/>` },
    { name: 'hat', node: 'rootGrp', svg: '<path d="M400,400L600,400L500,300Z" fill="#8d8d95"/>' },
  ],
  joints: { c: { x: 500, y: 500 } },
  rig: { rootGrp: { joint: 'c', parent: null } },
  segments: { idle: {} },
  plan: { keys: { idle: { dr: 30, keys: { rootGrp: { r: [[0, 0, 'io'], [15, 8, 'io'], [30, 0]] } } } } },
});

test('plano: cambia el dibujo por nombre de capa, ignora los nodos del rig y conserva la animación', () => {
  const a = exportAnimation(spec('#3366cc'), 'a');
  const b = exportAnimation(spec('#5a3d2b'), 'b'); // misma estructura, otro color en `body`
  const { json, replaced, missing } = reskin(a, b, 'c');
  assert.deepEqual(replaced.sort(), ['body', 'hat']);
  assert.deepEqual(missing, []);
  assert.equal(json.nm, 'c');
  assert.deepEqual(json.layers.find((l) => l.nm === 'body').shapes, b.layers.find((l) => l.nm === 'body').shapes);
  assert.deepEqual(json.layers.find((l) => l.nm === 'rootGrp').ks, a.layers.find((l) => l.nm === 'rootGrp').ks);
  assert.deepEqual(json.markers, a.markers);
});

test('plano: una pieza del skin que el base no tiene falla con su nombre', () => {
  const b = exportAnimation(spec('#5a3d2b'), 'b');
  b.layers.find((l) => l.nm === 'hat').nm = 'cap';
  assert.throws(() => reskin(exportAnimation(spec('#3366cc'), 'a'), b), /unknown to base.*cap/);
});

test('CLI: escribe out con nm = nombre del archivo y reporta a stderr; nombre desconocido sale 1 sin escribir; sin argumentos 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-'));
  try {
    const f = (n, j) => (writeFileSync(join(dir, n), JSON.stringify(j)), join(dir, n));
    const run = (skin) => spawnSync(process.execPath, [script, f('base.json', base), f('skin.json', skin), join(dir, 'char-z.json')], { encoding: 'utf8' });
    const ok = run(skinOf('hand'));
    assert.equal(ok.status, 0);
    assert.match(ok.stderr, /replaced 1: hand\nmissing 1: head/);
    assert.equal(JSON.parse(readFileSync(join(dir, 'char-z.json'), 'utf8')).nm, 'char-z');
    rmSync(join(dir, 'char-z.json'));
    const bad = run(skinOf('tail'));
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /tail/);
    assert.ok(!existsSync(join(dir, 'char-z.json')));
    assert.equal(spawnSync(process.execPath, [script]).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
