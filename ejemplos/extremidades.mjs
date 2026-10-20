// extremidades: un brazo (o pierna) dibujado en código como CÁPSULAS con articulaciones redondas, para que no aparezcan cortes al rotar.
// Dibujo original del skill. Uso: node SK/ejemplos/extremidades.mjs <carpeta-de-salida>   escribe <carpeta>/parts.json (un brazo que se dobla)
//   node SK/scripts/export-lottie.mjs <carpeta>/parts.json --roles plantillas/roles.ejemplo.json --name brazo
//   node SK/scripts/render.mjs <carpeta>/brazo.json --segment bend --at 0,20,40 --size 300
// También se IMPORTA (`import { limb, limbRig, capsule } from '.../extremidades.mjs'`): no corre nada al importarlo. Para dos brazos o dos
// piernas, llama a `limb` y `limbRig` con `side: 'L'` y `side: 'R'`: el sufijo va en el nombre de cada pieza, nodo, pivote y límite.
// Si copias este archivo a tu proyecto, cambia el `import` de `../scripts/lib.mjs` a la ruta real de la carpeta `scripts` del skill.
// Por qué no se recortan del donante: un brazo recortado de la ilustración (relleno + aro negro) deja un borde de aro a la vista y un hueco
// al girar el codo. Se redibuja con la regla de la articulación:
//  1. los dos segmentos miden LO MISMO en el pivote (aquí 50), y todos con el mismo contorno de tinta (4: ~1 px a la talla de pantalla);
//  2. el segmento padre (arriba) dibuja su arco exterior; el hijo (antebrazo) NO dibuja su borde superior (trazo abierto: solo los dos
//     lados y el arco de abajo), así no asoma una línea dentro del padre;
//  3. orden de abajo hacia arriba: mano, brazo, antebrazo, TAPA del brazo. La tapa es una copia del brazo sin trazo, 4 unidades más
//     estrecha (`w - 4`), con solo el arco de su extremo con contorno: tapa el tramo del antebrazo que queda dentro del brazo al doblar
//     y deja limpio el borde;
//  4. cada pieza cuelga del nodo de SU articulación (hombro → codo → muñeca) y la mano es un disco sobre la muñeca, bajo el antebrazo.
// Cápsula ahusada: `capsule(a, b, w, kind, w2)` con `w2` distinto de `w` usa la tangente común de los dos círculos (un brazo más fino en la muñeca).
// El signo de los ángulos depende de la vista: ver `referencias/03-rig.md` (personaje de frente: un brazo sube con negativos y el otro con positivos).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkInkStroke, compactJson, isMain } from '../scripts/lib.mjs';

const INK = '#1b1b1f', SLEEVE = '#3366cc', SKIN = '#f0c8a0';
const n = (v) => +v.toFixed(2);
const P = (x, y) => `${n(x)},${n(y)}`;

// Trozos de cápsula de a a b: lados + arco de b (`open`), con el arco de a (`closed`), o solo el arco de b (`cap`).
// Ancho w en a y w2 en b (por omisión el mismo). Tangente común de dos círculos: la normal m de cada lado cumple m·u = (r1 - r2) / L.
export function capsule(a, b, w, kind = 'closed', w2 = w) {
  const [r1, r2] = [w / 2, w2 / 2];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (Math.abs(r1 - r2) >= L) throw new Error(`capsule: one circle contains the other (|${r1} - ${r2}| >= ${L})`);
  const [ux, uy] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const s = (r1 - r2) / L, c = Math.sqrt(1 - s * s);
  const mp = [s * ux - c * uy, s * uy + c * ux], mm = [s * ux + c * uy, s * uy - c * ux]; // lado + y lado -
  const at = (p, r, m) => [p[0] + r * m[0], p[1] + r * m[1]];
  const [a1, a2, b1, b2] = [at(a, r1, mp), at(a, r1, mm), at(b, r2, mp), at(b, r2, mm)];
  const arcB = `A${n(r2)},${n(r2)} 0 ${s < 0 ? 1 : 0} 0 ${P(...b2)}`; // el arco de b pasa de media vuelta solo si el extremo se ensancha
  if (kind === 'cap') return `M${P(...b1)}${arcB}`;
  const sides = `M${P(...a1)}L${P(...b1)}${arcB}L${P(...a2)}`;
  return kind === 'open' ? sides : `${sides}A${n(r1)},${n(r1)} 0 ${s > 0 ? 1 : 0} 0 ${P(...a1)}Z`;
}
const OUT = `stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`;
const solid = (d, fill) => `<path d="${d}" fill="${fill}" ${OUT}/>`;
const fillOnly = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const line = (d) => `<path d="${d}" fill="none" ${OUT}/>`;

// Las 4 piezas de una extremidad de dos segmentos (de abajo hacia arriba). a = hombro, b = codo, c = muñeca; w = ancho común.
// `side` = sufijo de los nombres (pieza y nodo): 'L', 'R'… para tener dos extremidades en el mismo parts.json.
export function limb({ a, b, c, w = 50, hand = 27, upperFill = SLEEVE, lowerFill = SKIN, side = '' }) {
  const dir = [(c[0] - b[0]) / Math.hypot(c[0] - b[0], c[1] - b[1]), (c[1] - b[1]) / Math.hypot(c[0] - b[0], c[1] - b[1])];
  const h = [c[0] + dir[0] * (w / 2 + 2), c[1] + dir[1] * (w / 2 + 2)]; // el disco asoma por debajo de la tapa redonda del antebrazo
  return [
    { name: `hand${side}`, node: `wristGrp${side}`, svg: `<circle cx="${n(h[0])}" cy="${n(h[1])}" r="${hand}" fill="${lowerFill}" ${OUT}/>` },
    { name: `upperArm${side}`, node: `shoulderGrp${side}`, svg: solid(capsule(a, b, w), upperFill) },
    { name: `foreArm${side}`, node: `elbowGrp${side}`, svg: fillOnly(capsule(b, c, w), lowerFill) + line(capsule(b, c, w, 'open')) },
    { name: `upperArmCover${side}`, node: `shoulderGrp${side}`, svg: fillOnly(capsule(a, b, w - 4), upperFill) + line(capsule(a, b, w, 'cap')) },
  ];
}

// Pivotes, nodos y límites de esa extremidad con el mismo sufijo. `parent` = nodo del que cuelga el hombro (p. ej. el torso; null = raíz).
export function limbRig({ a, b, c, side = '', parent = null }) {
  const j = (k) => `${k}${side}`, g = (k) => `${k}Grp${side}`;
  return {
    joints: { [j('shoulder')]: { x: a[0], y: a[1] }, [j('elbow')]: { x: b[0], y: b[1] }, [j('wrist')]: { x: c[0], y: c[1] } },
    rig: {
      [g('shoulder')]: { joint: j('shoulder'), parent },
      [g('elbow')]: { joint: j('elbow'), parent: g('shoulder') },
      [g('wrist')]: { joint: j('wrist'), parent: g('elbow') },
    },
    limits: { [`${g('shoulder')}.r`]: [-150, 150], [`${g('elbow')}.r`]: [-150, 20], [`${g('wrist')}.r`]: [-45, 45] },
  };
}

if (isMain(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('uso: node SK/ejemplos/extremidades.mjs <carpeta-de-salida>');
    process.exit(2);
  }
  const a = [400, 300], b = [400, 480], c = [400, 650];
  const parts = limb({ a, b, c });
  checkInkStroke(parts, INK, 4); // el gate no mide el grosor del contorno: el generador sí (4 en personajes, 5 en props)
  const spec = {
    _comment: 'Ejemplo ORIGINAL del skill: un brazo de dos segmentos (ejemplos/extremidades.mjs).',
    donors: {},
    palette: {},
    parts,
    ...limbRig({ a, b, c }),
    segments: { idle: { autoplay: true, repeats: 1 }, bend: { autoplay: true, repeats: 1 } },
    plan: {
      keys: {
        idle: { dr: 30, keys: { shoulderGrp: { r: [[0, 0, 'io'], [15, 2, 'io'], [30, 0]] } } },
        bend: {
          dr: 40,
          keys: {
            // el final se asienta (4 frames quietos): el player termina en dr - 1 y export-lottie lo compara con el reposo
            shoulderGrp: { r: [[0, 0, 'io'], [16, -40, 'io'], [28, -40, 'io'], [36, 0, 'io'], [40, 0]] },
            elbowGrp: { r: [[0, 0, 'io'], [16, -100, 'io'], [28, -100, 'io'], [36, 0, 'io'], [40, 0]] },
            wristGrp: { r: [[0, 0, 'io'], [20, 15, 'io'], [28, 15, 'io'], [36, 0, 'io'], [40, 0]] },
          },
        },
      },
    },
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'parts.json'), compactJson(spec) + '\n');
  console.log(`ok ${join(out, 'parts.json')}`);
}
