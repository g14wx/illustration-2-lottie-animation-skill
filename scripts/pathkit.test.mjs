// pathkit: matriz (espejo, escala, giro, traslado), contornos <-> d, caja y fitElements, con dibujo sintético propio.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bbox, contoursToD, elementContours, fitElements, matrix, pathToContours, xformContours } from './pathkit.mjs';

const near = (a, b, tol = 1e-6) => assert.ok(a.every((v, k) => Math.abs(v - b[k]) <= tol), `${a} != ${b}`);
const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

test('matrix: identidad, traslado, escala y giro alrededor de `about`', () => {
  near(apply(matrix(), [3, 4]), [3, 4]);
  near(apply(matrix({ dx: 10, dy: -5 }), [3, 4]), [13, -1]);
  near(apply(matrix({ scale: 2 }), [3, 4]), [6, 8]);
  near(apply(matrix({ scale: 2, about: [3, 4] }), [3, 4]), [3, 4]); // el punto fijo no se mueve
  near(apply(matrix({ rotate: 90 }), [10, 0]), [0, 10]); // + = horario en pantalla (y hacia abajo)
  near(apply(matrix({ rotate: 90, about: [10, 10] }), [20, 10]), [10, 20]);
});

test('matrix: el espejo es respecto del eje vertical por `about`, y va antes de la escala y el giro', () => {
  near(apply(matrix({ mirror: true, about: [100, 0] }), [130, 7]), [70, 7]);
  near(apply(matrix({ mirror: true, scale: 2, about: [100, 0] }), [130, 7]), [40, 14]);
  near(apply(matrix({ mirror: true, rotate: 90, about: [0, 0] }), [10, 0]), [0, -10]); // espeja a (-10,0) y luego gira 90 grados
  near(apply(matrix({ mirror: true, dx: 5, about: [100, 0] }), [130, 7]), [75, 7]);
});

test('contoursToD ida y vuelta: líneas, cúbicas, cuadráticas, arcos y varios subtrazos', () => {
  for (const d of ['M0,0L10,0L10,10Z', 'M0,0C0,10,10,20,20,20L30,0', 'M0,0Q10,10,20,0', 'M5,5A10,10,0,0,1,25,5Z', 'M0,0L5,0L5,5ZM20,20L25,20L25,25Z', 'M0,0C5,0,10,5,10,10C10,15,5,0,0,0Z']) {
    const plain = (c) => JSON.parse(JSON.stringify(c)); // -0 y 0 son lo mismo
    const once = plain(pathToContours(d, 2));
    assert.deepEqual(plain(pathToContours(contoursToD(once, 2), 2)), once, d);
  }
  assert.equal(contoursToD(pathToContours('M0,0L10,0L10,10Z')), 'M0,0L10,0L10,10Z'); // un cierre recto es solo Z
  assert.match(contoursToD(pathToContours('M0,0L10,0L10,10')), /^M0,0L10,0L10,10$/); // abierto: sin Z
});

test('xformContours: los vértices se trasladan y las manijas solo giran/escalan', () => {
  const [c] = pathToContours('M0,0C0,10,10,20,20,20');
  const [t] = xformContours([c], matrix({ scale: 2, dx: 100 }));
  assert.deepEqual(t.v[0], [100, 0]);
  assert.deepEqual(t.v[1], [140, 40]);
  assert.deepEqual(t.o[0], [0, 20]); // la manija mide el doble pero no se traslada
});

test('bbox: caja de un rect, de un círculo y de una curva que se pasa de sus vértices', () => {
  near(bbox(elementContours({ tag: 'rect', attrs: { x: '10', y: '20', width: '30', height: '40' } })), [10, 20, 40, 60]);
  near(bbox(elementContours({ tag: 'circle', attrs: { cx: '50', cy: '50', r: '10' } })), [40, 40, 60, 60], 0.05);
  const [, y0, , y1] = bbox(pathToContours('M0,0C0,100,100,100,100,0')); // la curva sube a 75, no a 100 de las manijas
  assert.equal(y0, 0);
  assert.ok(y1 > 70 && y1 < 76, `y1 ${y1}`);
});

test('fitElements: todo pasa a <path>, conserva fill/stroke, escala el grosor y usa el centro del conjunto por omisión', () => {
  const els = [
    { tag: 'rect', attrs: { x: '0', y: '0', width: '100', height: '100', fill: '#ffffff', stroke: '#000000', 'stroke-width': '4' } },
    { tag: 'circle', attrs: { cx: '50', cy: '50', r: '10', fill: '#ff0000' } },
  ];
  const out = fitElements(els, { scale: 2 });
  assert.deepEqual(out.map((e) => e.tag), ['path', 'path']);
  assert.equal(out[0].attrs.fill, '#ffffff');
  assert.equal(out[0].attrs['stroke-width'], '8');
  assert.equal(out[0].attrs.cx, undefined);
  near(bbox(pathToContours(out[0].attrs.d)), [-50, -50, 150, 150]); // crece desde el centro (50,50)
  near(bbox(pathToContours(out[1].attrs.d)), [30, 30, 70, 70], 0.1);
  const moved = fitElements(els, { dx: 10, dy: 20 });
  near(bbox(pathToContours(moved[0].attrs.d)), [10, 20, 110, 120]);
  const mirrored = fitElements([{ tag: 'polygon', attrs: { points: '0,0 10,0 0,10', fill: '#000000' } }], { mirror: true, about: [0, 0] });
  near(bbox(pathToContours(mirrored[0].attrs.d)), [-10, 0, 0, 10]);
});

test('elementContours: una figura que no se dibuja es error', () => {
  assert.throws(() => elementContours({ tag: 'text', attrs: {} }), /<text> not supported/);
});
