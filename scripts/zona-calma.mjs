// zona-calma: mide cuánta tinta hay en la zona calma de un fondo (el fondo solo, sin personajes). Solo biblioteca estándar de Node 20+.
// Uso: node SK/scripts/zona-calma.mjs <fondo.png> [--x 350,650] [--y 80,930] [--margen 10] [--oscuro 100] [--max 0.05]
//   El PNG sale de: node SK/scripts/render.mjs fondo.json --frame <inicio de idle> --size 1000 --out fondo.png
//   --margen  píxeles entre el borde del PNG y el dibujo (render.mjs deja 10); --oscuro  luma por debajo de la cual un píxel es "tinta oscura" (100)
//   --max     si el % de tinta oscura pasa de este valor, sale 1 (sin --max solo imprime)
// Lee PNG de 8 bits RGB o RGBA sin entrelazar (lo que escribe Chrome). Caso real: 0,00 a 0,01 % de tinta oscura; cualquier píxel no blanco, 0,35 %.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { isMain } from './lib.mjs';

// → { w, h, ch, px } con px = bytes de las filas ya sin filtro (ch canales por píxel)
export function decodePng(buf) {
  if (buf.subarray(0, 8).toString('latin1') !== '\x89PNG\r\n\x1a\n') throw new Error('not a PNG');
  let w, h, depth, type, inter;
  const idat = [];
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') [w, h, depth, type, inter] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9], body[12]];
    else if (kind === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG (bit depth ${depth}, color type ${type}, interlace ${inter}): need 8-bit RGB or RGBA, not interlaced`);
  const ch = type === 2 ? 3 : 4, row = w * ch, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * row);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)], src = y * (row + 1) + 1;
    for (let i = 0; i < row; i++) {
      const a = i >= ch ? px[y * row + i - ch] : 0, b = y ? px[(y - 1) * row + i] : 0, c = y && i >= ch ? px[(y - 1) * row + i - ch] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      if (f > 4) throw new Error(`bad PNG filter ${f}`);
      px[y * row + i] = (raw[src + i] + pred) & 255;
    }
  }
  return { w, h, ch, px };
}

// % de píxeles con luma < `dark` y % de píxeles no blancos (algún canal < 250) en la caja [x0, x1) × [y0, y1) del dibujo
export function inkIn({ w, h, ch, px }, { x = [350, 650], y = [80, 930], margin = 10, dark = 100 } = {}) {
  let n = 0, ink = 0, notWhite = 0;
  for (let yy = y[0]; yy < y[1]; yy++)
    for (let xx = x[0]; xx < x[1]; xx++) {
      const X = xx + margin, Y = yy + margin;
      if (X >= w || Y >= h) throw new Error(`the zone is outside the PNG (${w}x${h}, margin ${margin})`);
      const o = (Y * w + X) * ch, [r, g, b] = [px[o], px[o + 1], px[o + 2]];
      n++;
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < dark) ink++;
      if (r < 250 || g < 250 || b < 250) notWhite++;
    }
  return { pixels: n, ink: (100 * ink) / n, notWhite: (100 * notWhite) / n };
}

function main(argv) {
  const { values: o, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { x: { type: 'string' }, y: { type: 'string' }, margen: { type: 'string' }, oscuro: { type: 'string' }, max: { type: 'string' } } });
  if (!positionals[0]) {
    console.error('uso: node SK/scripts/zona-calma.mjs <fondo.png> [--x 350,650] [--y 80,930] [--margen 10] [--oscuro 100] [--max 0.05]');
    return 2;
  }
  const pair = (s) => s.split(',').map(Number);
  const r = inkIn(decodePng(readFileSync(positionals[0])), { x: o.x && pair(o.x), y: o.y && pair(o.y), margin: o.margen && +o.margen, dark: o.oscuro && +o.oscuro });
  const [x, y] = [o.x ?? '350,650', o.y ?? '80,930'].map((s) => s.replace(',', '..'));
  console.log(`zona x ${x}, y ${y} (${r.pixels} px): tinta oscura ${r.ink.toFixed(2)} %, no blanco ${r.notWhite.toFixed(2)} %`);
  if (o.max !== undefined && r.ink > +o.max) {
    console.error(`FAIL tinta oscura ${r.ink.toFixed(2)} % > ${o.max} % en la zona calma`);
    return 1;
  }
  return 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    process.exitCode = 1;
  }
}
