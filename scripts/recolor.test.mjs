// recolor: color de autoría → token → valor; pura; y las copias del bloque <recolor> de las plantillas siguen siendo la misma función.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { recolor, recolorMap } from './recolor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const roles = JSON.parse(readFileSync(join(here, '../fixtures/roles.json'), 'utf8'));
const BRAND = [0.2, 0.4, 0.8]; // #3366cc → --illus-brand
const INK = [0.1059, 0.1059, 0.1216]; // #1b1b1f → --illus-ink
const STRANGER = [0.5, 0.25, 0.75]; // no está en roles.json
const fill = (k, a = 0) => ({ ty: 'fl', c: { a, k } });
const stroke = (k) => ({ ty: 'st', c: { a: 0, k } });
const json = () => ({
  layers: [{ ty: 4, shapes: [{ ty: 'gr', it: [{ ty: 'gr', it: [fill(BRAND), stroke(INK)] }, fill(STRANGER), fill(BRAND, 1)] }] }],
  assets: [{ id: 'a', layers: [{ ty: 4, shapes: [fill([...BRAND, 0.5])] }] }],
});
const vars = { '--illus-brand': '#ff0080', '--illus-ink': '  #00ff00\n' };

test('cambia fills y strokes (grupos anidados y assets) por el valor del token y conserva el alfa', () => {
  const calls = [];
  const out = recolor(json(), roles, (n) => (calls.push(n), vars[n] ?? ''));
  const [inner, stranger, animated] = out.layers[0].shapes[0].it;
  assert.deepEqual(inner.it, [fill([1, 0, 128 / 255]), stroke([0, 1, 0])]);
  assert.deepEqual(stranger, fill(STRANGER)); // fuera de roles.json
  assert.deepEqual(animated, fill(BRAND, 1)); // animado: no se toca
  assert.deepEqual(out.assets[0].layers[0].shapes, [fill([1, 0, 128 / 255, 0.5])]);
  assert.ok(calls.includes('--illus-brand') && calls.includes('--illus-ink'));
});

test('un token ausente o que no es #rrggbb deja el color de autoría', () => {
  assert.deepEqual(recolor(json(), roles, () => '').assets[0].layers[0].shapes, [fill([...BRAND, 0.5])]);
  assert.deepEqual(recolor(json(), roles, () => 'oklch(0.5 0.1 200)').layers, json().layers);
});

test('no muta la entrada', () => {
  const input = json();
  recolor(input, roles, (n) => vars[n] ?? '');
  assert.deepEqual(input, json());
});

test('recolorMap: color de autoría → color final sin pasar por tokens', () => {
  const out = recolorMap(json(), { '#3366cc': '#00ff00' });
  assert.deepEqual(out.layers[0].shapes[0].it[0].it[0], fill([0, 1, 0]));
  assert.deepEqual(out.layers[0].shapes[0].it[0].it[1], stroke(INK)); // sin regla: queda
});

test('CLI: --vars (tema por tokens) y --map; exactamente uno de los dos; no toca el original', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-'));
  try {
    const f = (n, v) => (writeFileSync(join(dir, n), JSON.stringify(v)), join(dir, n));
    const run = (...a) => spawnSync(process.execPath, [join(here, 'recolor.mjs'), ...a], { encoding: 'utf8' });
    const anim = f('anim.json', json());
    const byVars = run(anim, '--vars', f('vars.json', vars), '--roles', join(here, '../fixtures/roles.json'), '--out', join(dir, 'a.json'));
    assert.equal(byVars.status, 0, byVars.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8')).layers[0].shapes[0].it[0].it[1], stroke([0, 1, 0]));
    const byMap = run(anim, '--map', f('map.json', { '#3366cc': '#ffffff' }), '--out', join(dir, 'b.json'));
    assert.equal(byMap.status, 0, byMap.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'b.json'), 'utf8')).layers[0].shapes[0].it[0].it[0], fill([1, 1, 1]));
    assert.deepEqual(JSON.parse(readFileSync(anim, 'utf8')), json());
    assert.equal(run(anim).status, 2);
    assert.equal(run(anim, '--vars', 'x', '--map', 'y').status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- las plantillas llevan una copia del bloque entre `// <recolor>` y `// </recolor>`: debe ser la misma función
const block = (file) => {
  const t = readFileSync(join(here, file), 'utf8');
  const m = /\/\/ <recolor>\n([\s\S]*?)\/\/ <\/recolor>/.exec(t);
  assert.ok(m, `${file} has no <recolor> block`);
  return m[1];
};
// quita lo que TypeScript añade y el `export` para comparar el JS que queda
const plain = (code) =>
  code
    .replace(/^\s*export /gm, '')
    .replace(/<T>/g, '')
    .replace(/\(k: number\[\]\)/g, '(k)')
    .replace(/json: T, roles: Record<string, string>, readVar: \(name: string\) => string\): T/, 'json, roles, readVar)')
    .replace(/\(n: any\): void/, '(n)')
    .replace(/\s+/g, ' ')
    .trim();

for (const file of ['recolor.mjs', '../plantillas/Illustration.tsx', '../plantillas/illustration-vanilla.js', '../plantillas/galeria.html'])
  test(`el bloque <recolor> de ${file.replace('../', '')} es el de recolor.mjs`, () => assert.equal(plain(block(file)), plain(block('recolor.mjs'))));
