// zona-calma: decodifica un PNG (todos los filtros) y mide la tinta en la zona; CLI con --max.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { decodePng, inkIn } from './zona-calma.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// PNG mínimo (sin CRC válido: el decodificador no lo mira). rgb(x, y) → [r, g, b]; `filter` fuerza el filtro de cada fila (0..4).
function png(w, h, rgb, filter = () => 0) {
  const row = w * 3, px = Buffer.alloc(h * row);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb(x, y).forEach((v, k) => (px[y * row + x * 3 + k] = v));
  const raw = Buffer.alloc(h * (row + 1));
  for (let y = 0; y < h; y++) {
    const f = filter(y);
    raw[y * (row + 1)] = f;
    for (let i = 0; i < row; i++) {
      const a = i >= 3 ? px[y * row + i - 3] : 0, b = y ? px[(y - 1) * row + i] : 0, c = y && i >= 3 ? px[(y - 1) * row + i - 3] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      raw[y * (row + 1) + 1 + i] = (px[y * row + i] - pred) & 255;
    }
  }
  const chunk = (kind, body) => { const l = Buffer.alloc(4); l.writeUInt32BE(body.length); return Buffer.concat([l, Buffer.from(kind), body, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// 100 × 100 blanco con un cuadrado negro 10 × 10 en (30..40, 30..40) y un gris (200) 10 × 10 en (60..70, 60..70)
const pic = (x, y) => (x >= 30 && x < 40 && y >= 30 && y < 40 ? [0, 0, 0] : x >= 60 && x < 70 && y >= 60 && y < 70 ? [200, 200, 200] : [255, 255, 255]);

test('decodePng: los cinco filtros devuelven los mismos píxeles', () => {
  const base = decodePng(png(100, 100, pic)).px;
  for (const f of [1, 2, 3, 4]) assert.ok(decodePng(png(100, 100, pic, () => f)).px.equals(base), `filtro ${f}`);
  assert.ok(decodePng(png(100, 100, pic, (y) => y % 5)).px.equals(base));
  assert.throws(() => decodePng(Buffer.from('nope')), /not a PNG/);
});

test('inkIn: % de tinta oscura (luma < 100) y de píxeles no blancos en la zona; el margen desplaza la caja', () => {
  const img = decodePng(png(110, 110, (x, y) => pic(x - 10, y - 10))); // el dibujo empieza en (10, 10)
  const all = inkIn(img, { x: [0, 100], y: [0, 100], margin: 10 });
  assert.equal(all.pixels, 10000);
  assert.equal(all.ink, 1); // 100 de 10 000 px
  assert.equal(all.notWhite, 2); // el negro y el gris
  const half = inkIn(img, { x: [0, 50], y: [0, 50], margin: 10 });
  assert.equal(half.ink, 4);
  assert.equal(half.notWhite, 4);
  assert.throws(() => inkIn(img, { x: [0, 200], y: [0, 10], margin: 10 }), /outside the PNG/);
});

test('CLI zona-calma: imprime los números, --max hace fallar y sin argumentos sale 2', () => {
  const d = mkdtempSync(join(tmpdir(), 'zc-'));
  try {
    writeFileSync(join(d, 'f.png'), png(100, 100, pic));
    const run = (...a) => spawnSync(process.execPath, [join(here, 'zona-calma.mjs'), ...a], { encoding: 'utf8' });
    const ok = run(join(d, 'f.png'), '--x', '0,100', '--y', '0,100', '--margen', '0');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /zona x 0\.\.100, y 0\.\.100 \(10000 px\): tinta oscura 1\.00 %, no blanco 2\.00 %/);
    const bad = run(join(d, 'f.png'), '--x', '0,100', '--y', '0,100', '--margen', '0', '--max', '0.5');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /tinta oscura 1\.00 % > 0\.5 %/);
    assert.equal(run(join(d, 'f.png'), '--x', '0,100', '--y', '0,100', '--margen', '0', '--max', '2').status, 0);
    assert.equal(run().status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
