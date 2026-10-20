// ejemplos: extremidades.mjs se puede importar (sin correr nada), admite dos extremidades con sufijo y dibuja la cápsula ahusada;
// bombilla.mjs y extremidades.mjs por CLI producen un parts.json que exporta y pasa el gate.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { check } from './check-lottie.mjs';
import { exportAnimation, lintPlan } from './export-lottie.mjs';
import { bbox, pathToContours } from './pathkit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const roles = JSON.parse(readFileSync(join(here, '../fixtures/roles.json'), 'utf8'));
const { capsule, limb, limbRig } = await import('../ejemplos/extremidades.mjs'); // importar no debe salir con exit 2

test('extremidades.mjs: dos brazos con sufijo L y R en el mismo parts.json no repiten nombres y exportan con el gate', () => {
  const L = { a: [300, 300], b: [300, 480], c: [300, 650], side: 'L' }, R = { a: [700, 300], b: [700, 480], c: [700, 650], side: 'R' };
  const spec = {
    parts: [...limb(L), ...limb(R)],
    ...Object.fromEntries(['joints', 'rig', 'limits'].map((k) => [k, { ...limbRig(L)[k], ...limbRig(R)[k] }])),
    segments: { idle: { autoplay: true, repeats: 1 } },
    plan: { keys: { idle: { dr: 30, keys: { shoulderGrpL: { r: [[0, 0, 'io'], [15, 2, 'io'], [30, 0]] }, shoulderGrpR: { r: [[0, 0, 'io'], [15, -2, 'io'], [30, 0]] } } } } },
  };
  assert.equal(new Set(spec.parts.map((p) => p.name)).size, 8);
  assert.deepEqual(lintPlan(spec, 'brazos'), []);
  const j = exportAnimation(spec, 'brazos');
  assert.deepEqual(check(j, { roles, parts: spec }), []);
  assert.ok(j.layers.some((l) => l.nm === 'wristGrpR' && l.parent === j.layers.find((x) => x.nm === 'elbowGrpR').ind));
});

test('capsule: sin ahusar sale igual que antes; ahusada pasa por las dos tangentes comunes y su caja mide los dos anchos', () => {
  const [x0, , x1] = bbox(pathToContours(capsule([400, 300], [400, 480], 50)));
  assert.ok(Math.abs(x0 - 375) < 0.1 && Math.abs(x1 - 425) < 0.1);
  assert.equal(capsule([400, 300], [400, 480], 50), 'M375,300L375,480A25,25 0 0 0 425,480L425,300A25,25 0 0 0 375,300Z'); // la forma de antes, sin cambios
  for (const [w1, w2] of [[50, 20], [20, 50]]) {
    const d = capsule([400, 300], [400, 480], w1, 'closed', w2);
    const [bx0, by0, bx1, by1] = bbox(pathToContours(d));
    assert.ok(Math.abs(Math.max(400 - bx0, bx1 - 400) - Math.max(w1, w2) / 2) < 0.2, `${w1}/${w2}: ${[bx0, bx1]}`); // el lado ancho
    assert.ok(Math.abs(by0 - (300 - w1 / 2)) < 0.2 && Math.abs(by1 - (480 + w2 / 2)) < 0.2, `${w1}/${w2}: y ${[by0, by1]}`); // los dos extremos redondos
  }
  assert.throws(() => capsule([0, 0], [0, 10], 100, 'closed', 10), /one circle contains the other/);
});

test('CLI de los ejemplos: bombilla.mjs y extremidades.mjs escriben un parts.json que exporta; sin argumentos salen 2', () => {
  const d = mkdtempSync(join(tmpdir(), 'ej-'));
  try {
    const rolesFile = join(here, '../plantillas/roles.ejemplo.json');
    for (const [script, name] of [['bombilla', 'bombilla'], ['extremidades', 'brazo']]) {
      const ej = join(here, '../ejemplos', `${script}.mjs`);
      assert.equal(spawnSync(process.execPath, [ej]).status, 2);
      assert.equal(spawnSync(process.execPath, [ej, join(d, script)], { encoding: 'utf8' }).status, 0);
      const r = spawnSync(process.execPath, [join(here, 'export-lottie.mjs'), join(d, script, 'parts.json'), '--roles', rolesFile, '--name', name], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
