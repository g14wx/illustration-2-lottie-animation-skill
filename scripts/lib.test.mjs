// lib: búsqueda de roles, player y Chrome; formato compacto; colores.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkInkStroke, compactJson, findChrome, findLottieLight, findRoles, hex2c, normHex, toHex } from './lib.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'lib-'));
const withEnv = (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try { return fn(); } finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
};

test('colores: normHex, toHex y hex2c son inversos (8 bits)', () => {
  assert.equal(normHex('#FFF'), '#ffffff');
  assert.equal(normHex('red'), 'red');
  assert.equal(toHex([0.2, 0.4, 0.8, 1]), '#3366cc');
  for (const h of ['#1b1b1f', '#f0c8a0', '#8d8d95', '#000000', '#ffffff']) assert.equal(toHex(hex2c(h)), h);
});

test('compactJson: indentado, pero los arreglos de claves en una sola línea', () => {
  const t = compactJson({ a: { k: [[0, 1, 'io'], [30, 2]] } });
  assert.match(t, /\[0,1,"io"\]/);
  assert.deepEqual(JSON.parse(t), { a: { k: [[0, 1, 'io'], [30, 2]] } });
});

test('findRoles: junto al archivo, una carpeta arriba, o nada', () => {
  const d = tmp();
  try {
    mkdirSync(join(d, 'a/b'), { recursive: true });
    assert.equal(findRoles(join(d, 'a/b/x.json')), undefined);
    writeFileSync(join(d, 'a/roles.json'), '{}');
    assert.equal(findRoles(join(d, 'a/b/x.json')), join(d, 'a/b/../roles.json'));
    writeFileSync(join(d, 'a/b/roles.json'), '{}');
    assert.equal(findRoles(join(d, 'a/b/x.json')), join(d, 'a/b/roles.json'));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('findLottieLight: --lottie-light manda, luego $LOTTIE_LIGHT; una ruta que no existe es error; sin nada en node_modules, null', () => {
  const d = tmp();
  const cwd = process.cwd();
  try {
    const f = join(d, 'player.js');
    writeFileSync(f, '//');
    assert.equal(findLottieLight(f), f);
    assert.throws(() => findLottieLight(join(d, 'no.js')), /not found/);
    withEnv({ LOTTIE_LIGHT: f }, () => assert.equal(findLottieLight(), f));
    withEnv({ LOTTIE_LIGHT: undefined }, () => {
      process.chdir(d);
      assert.equal(findLottieLight(), null);
      const p = join(d, 'node_modules/lottie-web/build/player');
      mkdirSync(p, { recursive: true });
      writeFileSync(join(p, 'lottie_light.min.js'), '//');
      mkdirSync(join(d, 'sub/deep'), { recursive: true });
      process.chdir(join(d, 'sub/deep')); // sube por las carpetas padre
      assert.ok(findLottieLight().endsWith('node_modules/lottie-web/build/player/lottie_light.min.js'));
    });
  } finally {
    process.chdir(cwd);
    rmSync(d, { recursive: true, force: true });
  }
});

test('findChrome: $CHROME manda; sin PATH ni rutas conocidas devuelve un valor o null, nunca lanza', () => {
  withEnv({ CHROME: '/algun/chrome' }, () => assert.equal(findChrome(), '/algun/chrome'));
  withEnv({ CHROME: undefined }, () => assert.ok(findChrome() === null || typeof findChrome() === 'string'));
  const d = tmp();
  try {
    const bin = join(d, 'chromium');
    writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
    withEnv({ CHROME: undefined, PATH: d }, () => assert.equal(findChrome(), bin));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('checkInkStroke: falla si un trazo de tinta mide menos del mínimo; ignora otros colores y piezas sin trazo', () => {
  const ink = '#1b1b1f';
  const parts = [{ name: 'a', svg: `<path d="M0,0" stroke="${ink}" stroke-width="5"/>` }, { name: 'b', svg: '<path d="M0,0" stroke="#ffffff" stroke-width="1"/>' }, { name: 'c' }];
  checkInkStroke(parts, ink, 5);
  assert.throws(() => checkInkStroke(parts, ink, 6), /a: ink stroke 5 < 6/);
  assert.throws(() => checkInkStroke([{ name: 'fino', svg: `<circle stroke="${ink}" stroke-width="3.5"/>` }], ink, 4), /fino: ink stroke 3.5 < 4/);
});
