// segment-for.example.mjs: prueba de tabla (prev, actual, esperado). Es la prueba más barata y la que más protege.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propFor, segmentFor } from '../plantillas/segment-for.example.mjs';

const st = (status, step, warnings = []) => ({ status, step, warnings });

test('segmentFor: tabla de cambios reales', () => {
  for (const [label, prev, s, want] of [
    ['sin estado', undefined, undefined, null],
    ['primera carga: nada que mostrar', undefined, st('running', 'a'), null],
    ['poll igual', st('running', 'a'), st('running', 'a'), null],
    ['paso nuevo', st('running', 'a'), st('running', 'b'), 'point'],
    ['aviso nuevo', st('running', 'a'), st('running', 'a', ['w1']), 'thinking'],
    ['aviso nuevo junto con el cambio de paso: gana el aviso', st('running', 'a'), st('running', 'b', ['w1']), 'thinking'],
    ['el mismo aviso otra vez', st('running', 'a', ['w1']), st('running', 'a', ['w1']), null],
    ['fallo', st('running', 'a'), st('failed', 'a'), 'surprised'],
    ['fallo en la primera carga', undefined, st('failed'), 'surprised'],
    ['sigue fallido', st('failed'), st('failed'), null],
  ]) assert.equal(segmentFor(prev, s), want, label);
});

test('propFor: solo con un paso en curso; el último paso lleva otro objeto', () => {
  assert.equal(propFor(undefined), null);
  assert.equal(propFor(st('queued')), null);
  assert.equal(propFor(st('failed', 'a')), null);
  assert.equal(propFor(st('running')), null);
  assert.deepEqual(propFor(st('running', 'a')), { name: 'prop-magnifier', segment: 'scan' });
  assert.deepEqual(propFor(st('running', 'last')), { name: 'prop-chart', segment: 'grow' });
});
