// check-lottie: el fixture válido pasa y cada regla falla con su mensaje (CLI sobre los fixtures malos; el resto, mutando el válido).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { check } from './check-lottie.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(here, '../fixtures/check', n);
const rolesPath = join(here, '../fixtures/roles.json');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const roles = read(rolesPath);
const parts = read(fx('parts.json'));
const valid = read(fx('valid.json'));
const cli = (name, ...extra) => spawnSync(process.execPath, [join(here, 'check-lottie.mjs'), fx(name), '--roles', rolesPath, '--parts', fx('parts.json'), ...extra], { encoding: 'utf8' });
const errsOf = (f, opts = {}) => {
  const j = structuredClone(valid);
  f(j);
  return check(j, { roles, parts, ...opts }).join('\n');
};
const fill = (j) => j.layers[0].shapes[0].it.find((s) => s.ty === 'fl');
// w/h van en la CAPA ty 0 (lottie_light recorta con ese tamaño); el asset solo trae id y layers
const precomp = (j, size = { w: 1000, h: 1000 }) => {
  j.assets = [{ id: 'arm', layers: structuredClone(j.layers.slice(0, 1)) }];
  j.layers.push({ ty: 0, nm: 'arm', refId: 'arm', ks: j.layers[0].ks, ip: 0, op: 120, st: 0, ...size });
};

test('CLI: el fixture válido pasa', () => {
  const r = cli('valid.json');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ok /);
});

for (const [name, msg] of [
  ['bad-expression.json', 'expression (x) at layers[1].ks.r'],
  ['bad-mask.json', 'mask at layers[0]'],
  ['bad-matte.json', 'matte at layers[0]'],
  ['bad-animated-color.json', 'animated color at'],
  ['bad-color-not-in-roles.json', 'color #ff0000 not in roles.json'],
  ['bad-missing-marker.json', 'marker "wave" missing'],
  ['bad-duplicate-marker.json', 'marker name "wave" is repeated'],
  ['bad-text-layer.json', 'layer type 5 (text) not allowed'],
  ['bad-gradient.json', 'gradient fill (gf)'],
  ['bad-effects.json', 'effects (ef) at layers[0]'],
  ['bad-slot.json', 'sid (slot) at'],
  ['bad-precomp-size.json', 'precomp layer is 500x500, must be 1000x1000'],
  ['bad-too-long.json', 'duration 600 frames > 450'],
]) {
  test(`CLI: ${name} falla (exit 1)`, () => {
    const r = cli(name);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(msg), r.stderr);
  });
}

test('CLI: autoplay de 5,9 s contra parts-autoplay-largo.json falla', () => {
  const r = spawnSync(process.execPath, [join(here, 'check-lottie.mjs'), fx('valid.json'), '--roles', rolesPath, '--parts', fx('parts-autoplay-largo.json')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /autoplay "idle" lasts 5.9 s > 5 s/);
});

test('CLI: roles.json una carpeta arriba se encuentra solo; sin él, error claro; JSON ilegible y sin argumentos no pasan', () => {
  assert.equal(spawnSync(process.execPath, [join(here, 'check-lottie.mjs'), fx('valid.json')], { encoding: 'utf8', cwd: tmpdir() }).status, 0); // fixtures/roles.json
  const iso = mkdtempSync(join(tmpdir(), 'cl-iso-'));
  try {
    const copy = join(iso, 'a.json');
    copyFileSync(fx('valid.json'), copy);
    const r = spawnSync(process.execPath, [join(here, 'check-lottie.mjs'), copy], { encoding: 'utf8', cwd: iso });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /roles.json not found/);
  } finally {
    rmSync(iso, { recursive: true, force: true });
  }
  assert.equal(cli('no-existe.json').status, 1);
  assert.equal(spawnSync(process.execPath, [join(here, 'check-lottie.mjs')]).status, 2);
  assert.equal(spawnSync(process.execPath, [join(here, 'check-lottie.mjs'), 'x.json', '--nope']).status, 2);
});

test('por un symlink también valida (antes salía 0 sin imprimir nada)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cl-link-'));
  try {
    symlinkSync(join(here, 'check-lottie.mjs'), join(dir, 'link.mjs'));
    const r = spawnSync(process.execPath, [join(dir, 'link.mjs'), fx('bad-expression.json'), '--roles', rolesPath], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /expression \(x\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check(): válido y precomp bien formada no dan fallos', () => {
  assert.deepEqual(check(valid, { roles, parts }), []);
  assert.equal(errsOf((j) => precomp(j)), '');
});

for (const [label, f, msg] of [
  ['fr', (j) => (j.fr = 24), 'fr must be 30'],
  ['lienzo', (j) => (j.w = 500), 'canvas must be 1000x1000'],
  ['ddd', (j) => (j.ddd = 1), 'ddd must be 0'],
  ['capa 3D', (j) => (j.layers[0].ddd = 1), '3D layer at'],
  ['sólido', (j) => (j.layers[0].ty = 1), 'layer type 1 (solid)'],
  ['imagen', (j) => (j.layers[0].ty = 2), 'layer type 2 (image)'],
  ['audio', (j) => (j.layers[0].ty = 6), 'layer type 6 (audio)'],
  ['time remap', (j) => (j.layers[0].tm = { a: 0, k: 0 }), 'time remap (tm)'],
  ['sid', (j) => (fill(j).c.sid = 'skin'), 'sid (slot) at'],
  ['forma no permitida', (j) => (j.layers[0].shapes[0].it[0].ty = 'rp'), "shape type 'rp' not allowed"],
  ['gradiente stroke', (j) => (j.layers[0].shapes[0].it[1].ty = 'gs'), 'gradient stroke (gs)'],
  ['color ilegible', (j) => (fill(j).c = { a: 0, k: [{ t: 0 }] }), 'unreadable color'],
  ['marker no entero', (j) => (j.markers[0].dr = 59.5), 'tm/dr must be integers'],
  ['marker de 0 frames', (j) => (j.markers[0].dr = 0), 'dr >= 1'],
  ['marker fuera de rango', (j) => (j.markers[1].dr = 90), 'outside [0,120]'],
  ['markers solapados', (j) => (j.markers[1].tm = 50), 'overlap'],
  ['refId sin asset', (j) => j.layers.push({ ty: 0, refId: 'nope', w: 1000, h: 1000 }), 'refId "nope" not found'],
  ['precomp de otro tamaño', (j) => precomp(j, { w: 500, h: 500 }), 'precomp layer is 500x500, must be 1000x1000 at layers[2]'],
  ['precomp sin w/h', (j) => precomp(j, {}), 'precomp layer is ?x?'],
  ['precomp sin refId', (j) => j.layers.push({ ty: 0, w: 1000, h: 1000 }), 'precomp layer without refId'],
]) {
  test(`check(): ${label}`, () => assert.ok(errsOf(f).includes(msg), errsOf(f)));
}

test('check(): autoplay de más de 5 s y repeats inválidos', () => {
  const p = structuredClone(parts);
  p.segments.idle.repeats = 3;
  assert.match(check(valid, { roles, parts: p }).join('\n'), /autoplay "idle" lasts 5.9 s > 5 s/);
  for (const repeats of [-1, 0, 1.5, 'loop']) {
    p.segments.idle.repeats = repeats;
    assert.match(check(valid, { roles, parts: p }).join('\n'), /repeats must be an integer >= 1/);
  }
});

test('check(): `enter` + `idle` autoplay suman un solo tope de 5 s (la fachada los encadena)', () => {
  const j = structuredClone(valid);
  j.markers[1].cm = 'enter';
  const p = { segments: { idle: { autoplay: true, repeats: 2 }, enter: { autoplay: true } } }; // 3,9 s + 2 s
  assert.match(check(j, { roles, parts: p }).join('\n'), /autoplay "enter" \+ "idle" last 5.9 s > 5 s/);
  p.segments.idle.repeats = 1; // 2 s + 2 s
  assert.deepEqual(check(j, { roles, parts: p }), []);
  p.segments.idle.repeats = 3; // idle solo ya pasa de 5 s: un único aviso, el suyo
  assert.equal(check(j, { roles, parts: p }).length, 1);
});

test('check(): también revisa las capas dentro de una precomp', () => {
  const e = errsOf((j) => {
    precomp(j);
    Object.assign(j.assets[0].layers[0], { ty: 5, masksProperties: [{}] });
    j.assets[0].layers[0].shapes[0].it.find((s) => s.ty === 'fl').c.k = [1, 0, 0, 1];
  });
  assert.ok(e.includes('layer type 5 (text) not allowed at assets[0].layers[0]'));
  assert.ok(e.includes('mask at assets[0].layers[0]'));
  assert.ok(e.includes('color #ff0000 not in roles.json at assets[0].layers[0]'));
});

test('check(): peso y duración son ajustables (--max-kb, --max-frames)', () => {
  assert.match(errsOf((j) => (j.nm = 'x'.repeat(210_000))), /KB > 200 KB/);
  assert.equal(errsOf((j) => (j.nm = 'x'.repeat(210_000)), { maxKb: 300 }), '');
  assert.match(errsOf(() => {}, { maxFrames: 100 }), /duration 120 frames > 100/);
  const r = cli('valid.json', '--max-frames', '100');
  assert.equal(r.status, 1);
});

test('check(): el color se compara tras redondear a 8 bits (Creator escribe 4 decimales)', () => {
  assert.equal(errsOf((j) => (fill(j).c.k = [0.2002, 0.3999, 0.8001, 1])), '');
});

test('roles.json de los fixtures: cada clave es #rrggbb de autoría y cada valor un token --illus-*', () => {
  for (const [hex, token] of Object.entries(roles)) {
    assert.match(hex, /^#[0-9a-f]{6}$/);
    assert.match(token, /^--illus-[a-z0-9-]+$/);
  }
  assert.ok(roles['#f0c8a0'] && roles['#5a3d2b'], 'piel y pelo con rol propio desde el principio');
});
