// split-roles: dar a unas piezas su propio color de autoría (piel, pelo) en el spec, en parts/*.svg, en los Lottie y en roles.json.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applySplit, splitLottie, splitSvg } from './split-roles.mjs';
import { check } from './check-lottie.mjs';
import { hex2c } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../fixtures');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const run = (script, ...a) => spawnSync(process.execPath, [join(here, script), ...a], { encoding: 'utf8' });

test('splitSvg: cambia from → to en fill y stroke, o solo en uno; normaliza #FFF', () => {
  const svg = '<path fill="#E4E4E7" stroke="#e4e4e7"/><path fill="#8d8d95"/>';
  assert.deepEqual(splitSvg(svg, { from: '#e4e4e7', to: '#f0c8a0' }), { text: '<path fill="#f0c8a0" stroke="#f0c8a0"/><path fill="#8d8d95"/>', n: 2 });
  assert.equal(splitSvg(svg, { from: '#e4e4e7', to: '#f0c8a0', only: 'stroke' }).n, 1);
  assert.equal(splitSvg('<path fill="#FFF"/>', { from: '#ffffff', to: '#fafafa' }).text, '<path fill="#fafafa"/>');
});

const layer = (nm, ...colors) => ({ ty: 4, nm, shapes: colors.map((c) => ({ ty: 'gr', it: [{ ty: 'fl', c: { a: 0, k: hex2c(c) } }] })) });

test('splitLottie: solo las capas con ese nombre, también dentro de su precomp; no toca colores animados', () => {
  const j = { layers: [layer('head', '#e4e4e7'), layer('shirt', '#e4e4e7'), { ty: 0, nm: 'arm', refId: 'a' }], assets: [{ id: 'a', layers: [layer('x', '#e4e4e7')] }] };
  j.layers[0].shapes[0].it.push({ ty: 'fl', c: { a: 1, k: [{ t: 0, s: [0.9, 0.9, 0.9, 1] }] } });
  assert.equal(splitLottie(j, { from: '#e4e4e7', to: '#f0c8a0', parts: ['head', 'arm'] }), 2); // head + lo que hay dentro de la precomp arm
  assert.deepEqual(j.layers[0].shapes[0].it[0].c.k, hex2c('#f0c8a0'));
  assert.deepEqual(j.layers[1].shapes[0].it[0].c.k, hex2c('#e4e4e7')); // shirt intacta
  assert.deepEqual(j.assets[0].layers[0].shapes[0].it[0].c.k, hex2c('#f0c8a0'));
});

test('applySplit: errores claros (from = to, color fuera de roles sin token, token en conflicto)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sr-'));
  try {
    const roles = join(dir, 'roles.json');
    writeFileSync(roles, JSON.stringify({ '#e4e4e7': '--illus-gray-100' }));
    const base = { from: '#e4e4e7', parts: ['x'] };
    assert.throws(() => applySplit({ splits: [{ ...base, to: '#e4e4e7' }] }, { rolesPath: roles }), /same color/);
    assert.throws(() => applySplit({ splits: [{ ...base, to: '#f0c8a0' }] }, { rolesPath: roles }), /give a "token"/);
    assert.throws(() => applySplit({ splits: [{ ...base, to: '#e4e4e7', token: 'x' }] }, { rolesPath: roles }), /same color/);
    assert.throws(() => applySplit({ splits: [{ ...base, to: 'red', token: '--t' }] }, { rolesPath: roles }), /#rrggbb/);
    applySplit({ splits: [{ ...base, to: '#f0c8a0', token: '--illus-skin' }] }, { rolesPath: roles });
    assert.throws(() => applySplit({ splits: [{ ...base, to: '#f0c8a0', token: '--otro' }] }, { rolesPath: roles }), /already maps/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI de punta a punta: piel gris compartida → piel propia; el spec reconstruido, el Lottie y roles.json quedan de acuerdo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sr-e2e-'));
  try {
    cpSync(fixtures, dir, { recursive: true });
    // punto de partida "malo": la piel se dibujó con el gris claro compartido (lo que esta herramienta arregla)
    const specPath = join(dir, 'persona/parts.json');
    const spec = read(specPath);
    for (const k of Object.keys(spec.palette)) if (spec.palette[k] === '#f0c8a0') spec.palette[k] = '#e4e4e7';
    for (const p of spec.parts) if (p.svg) p.svg = p.svg.replaceAll('#f0c8a0', '#e4e4e7');
    writeFileSync(specPath, JSON.stringify(spec));
    const roles = read(join(dir, 'roles.json'));
    delete roles['#f0c8a0'];
    writeFileSync(join(dir, 'roles.json'), JSON.stringify(roles));

    assert.equal(run('build-parts.mjs', specPath).status, 0);
    assert.equal(run('export-lottie.mjs', specPath).status, 0);
    const lottie = join(dir, 'persona/persona.json');
    const skinParts = ['head', 'neck', 'handL', 'handR', 'foreArmL', 'foreArmR'];
    const plan = join(dir, 'split.json');
    writeFileSync(plan, JSON.stringify({ splits: [{ from: '#e4e4e7', to: '#f0c8a0', token: '--illus-skin', parts: skinParts }] }));

    const dry = run('split-roles.mjs', plan, '--spec', specPath, '--lottie', lottie, '--roles', join(dir, 'roles.json'), '--dry');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /^dry-run ok/);
    assert.equal(read(join(dir, 'roles.json'))['#f0c8a0'], undefined); // --dry no escribe

    const r = run('split-roles.mjs', plan, '--spec', specPath, '--lottie', lottie, '--roles', join(dir, 'roles.json'));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(join(dir, 'roles.json'))['#f0c8a0'], '--illus-skin');
    assert.equal(read(join(dir, 'roles.json'))['#e4e4e7'], '--illus-gray-100'); // el gris sigue existiendo para lo demás

    // el Lottie ya cambiado pasa el gate con el roles.json nuevo
    assert.deepEqual(check(read(lottie), { roles: read(join(dir, 'roles.json')), parts: read(specPath) }), []);
    const colorsOf = (name) => JSON.stringify(read(lottie).layers.find((l) => l.nm === name).shapes);
    assert.ok(colorsOf('head').includes(JSON.stringify(hex2c('#f0c8a0').slice(0, 3)).slice(0, -1)));
    assert.ok(!colorsOf('head').includes(JSON.stringify(hex2c('#e4e4e7').slice(0, 3)).slice(0, -1)));
    // el spec de donante lleva un palette propio por pieza: reconstruir y exportar de nuevo da lo mismo
    assert.equal(read(specPath).parts.find((p) => p.name === 'head').palette['#f6c9a5'], '#f0c8a0'); // todo color de donante que iba a `from` va a `to` en esa pieza
    const before = read(lottie);
    assert.equal(run('build-parts.mjs', specPath).status, 0);
    assert.equal(run('export-lottie.mjs', specPath).status, 0);
    assert.deepEqual(read(lottie), before);
    assert.equal(run('split-roles.mjs').status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
