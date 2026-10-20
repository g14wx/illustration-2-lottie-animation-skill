// bombilla: ejemplo de una pieza dibujada EN CÓDIGO (sin donante) y animada con el rig de export-lottie. Dibujo original del skill.
// Uso: node SK/ejemplos/bombilla.mjs <carpeta-de-salida>        escribe <carpeta>/parts.json
//      node SK/scripts/export-lottie.mjs <carpeta>/parts.json --roles plantillas/roles.ejemplo.json --name bombilla
// Qué enseña (todo salió de un caso real; ver referencias/):
//  - ningún color se anima: al encender, el velo `glow` (mismo contorno, color de marca, opacidad 0 en reposo) sube a 0,85 y el alambre de tinta
//    se funde con `filamentOn` (alambre de papel, opacidad 0 en reposo) para que se lea sobre el velo;
//  - escalar solo en el eje propio: cada rayo se dibuja VERTICAL y su nodo lleva el ángulo del abanico como giro estático (`rot`, con `at` =
//    dónde cae su pivote); la animación solo toca `sy` desde el extremo interior, así el ancho y el contorno no cambian;
//  - el mínimo de escala es 0,12 con desvanecido (nunca 0: queda un trazo de pelo); el rebote llega a 1,2;
//  - el contorno de tinta va en su propia pieza ENCIMA del velo; todo trazo de tinta mide lo mismo (5);
//  - los nombres de nodo (`bulbGrp`, `rayLGrp`…) no repiten los de pieza.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkInkStroke, compactJson } from '../scripts/lib.mjs'; // al copiar este archivo a tu proyecto, ajusta esta ruta a la carpeta `scripts` del skill

const INK = '#1b1b1f', PAPER = '#ffffff', BRAND = '#3366cc', LG = '#e4e4e7', MG = '#8d8d95';
const W = 5;
const n = (v) => +v.toFixed(2);
const stroke = (d, color, w = W) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const shape = (d, fill, outline = true) => `<path d="${d}" fill="${fill}"${outline ? ` stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`;
const [cx, cy, r] = [500, 430, 190];
const dx = Math.sqrt(r * r - 155 * 155); // el cristal es un círculo que se cierra en un cuello a y = 585
const glassD = `M${n(cx - dx)},585A${r},${r} 0 1 1 ${n(cx + dx)},585L568,665L432,665Z`;
const wire = 'M470,665L470,560Q485,520 500,560Q515,520 530,560L530,665';
const RAY_R = 250, RAY_LEN = 60;
// cápsula vertical, desde su extremo interior (pivote) hacia arriba: ancho 26, extremos redondos
const y0 = cy - RAY_R, y1 = y0 - RAY_LEN;
const rayD = `M487,${y0}L487,${y1}A13,13 0 0 1 513,${y1}L513,${y0}A13,13 0 0 1 487,${y0}Z`;
const rays = [['rayL', -50], ['rayM', 0], ['rayR', 50]];
const at = (deg) => ({ x: n(cx + RAY_R * Math.sin((deg * Math.PI) / 180)), y: n(cy - RAY_R * Math.cos((deg * Math.PI) / 180)) });
const pop = (delay) => ({
  sy: [[0, 1, 'i'], [6, 0.12, 'lin'], [12 + delay, 0.12, 'o'], [20 + delay, 1.2, 'io'], [24 + delay, 1, 'io'], [60, 1]],
  o: [[0, 1, 'lin'], [5, 0, 'lin'], [12 + delay, 0, 'lin'], [15 + delay, 1, 'lin'], [60, 1]],
});

const spec = {
  _comment: 'Ejemplo ORIGINAL del skill: una bombilla dibujada en código (ejemplos/bombilla.mjs).',
  donors: {},
  palette: {},
  parts: [
    ...rays.map(([nm]) => ({ name: nm, node: nm + 'Grp', svg: shape(rayD, BRAND) })),
    { name: 'glass', node: 'bulbGrp', svg: shape(glassD, LG, false) },
    { name: 'glow', node: 'bulbGrp', rest: { o: 0 }, svg: shape(glassD, BRAND, false), note: 'velo de marca: opacidad 0 en reposo' },
    { name: 'outline', node: 'bulbGrp', svg: shape(glassD, 'none'), note: 'contorno de tinta ENCIMA del velo' },
    { name: 'filament', node: 'bulbGrp', svg: stroke(wire, INK) },
    { name: 'filamentOn', node: 'bulbGrp', rest: { o: 0 }, svg: stroke(wire, PAPER), note: 'alambre de papel, visible solo encendida' },
    { name: 'base', node: 'bulbGrp', svg: shape('M432,665L568,665L568,760Q568,780 548,780L452,780Q432,780 432,760Z', MG) + stroke('M432,705L568,705M432,742L568,742', INK) },
  ],
  joints: { bulbBase: { x: 500, y: 780 }, rayPivot: { x: 500, y: cy - RAY_R } },
  rig: {
    bulbGrp: { joint: 'bulbBase', parent: null },
    ...Object.fromEntries(rays.map(([nm, a]) => [nm + 'Grp', { joint: 'rayPivot', parent: 'bulbGrp', at: at(a), rot: a }])),
  },
  limits: { 'rayLGrp.s': [0.12, 1.25], 'rayMGrp.s': [0.12, 1.25], 'rayRGrp.s': [0.12, 1.25], 'glow.o': [0, 0.9] },
  segments: { idle: { autoplay: true, repeats: 1 }, idea: { autoplay: true, repeats: 1 } },
  plan: {
    keys: {
      idle: { dr: 54, keys: { bulbGrp: { y: [[0, 0, 'io'], [27, -7, 'io'], [54, 0]], r: [[0, 0, 'io'], [13, 2, 'io'], [40, -2, 'io'], [54, 0]] } } },
      idea: {
        dr: 60,
        keys: {
          bulbGrp: { y: [[0, 0, 'lin'], [9, 0, 'o'], [13, -18, 'io'], [19, 0, 'io'], [22, -5, 'o'], [25, 0, 'io'], [60, 0]] },
          glow: { o: [[0, 0, 'lin'], [8, 0, 'o'], [12, 0.85, 'lin'], [34, 0.85, 'io'], [52, 0, 'lin'], [60, 0]] },
          filament: { o: [[0, 1, 'lin'], [8, 1, 'lin'], [12, 0, 'lin'], [34, 0, 'lin'], [52, 1, 'lin'], [60, 1]] },
          filamentOn: { o: [[0, 0, 'lin'], [8, 0, 'lin'], [12, 1, 'lin'], [34, 1, 'lin'], [52, 0, 'lin'], [60, 0]] },
          ...Object.fromEntries(rays.map(([nm], i) => [nm + 'Grp', pop(i * 2)])),
        },
      },
    },
  },
};

const out = process.argv[2];
if (!out) {
  console.error('uso: node SK/ejemplos/bombilla.mjs <carpeta-de-salida>');
  process.exit(2);
}
checkInkStroke(spec.parts, INK, W); // el gate no mide el grosor del contorno: el generador sí (5 en props, 4 en personajes)
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'parts.json'), compactJson(spec) + '\n');
console.log(`ok ${join(out, 'parts.json')}`);
