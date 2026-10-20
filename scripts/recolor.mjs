// recolor: cambia los colores de un Lottie por el valor actual de su token, sin framework. Solo biblioteca estándar.
// Cadena: color de autoría (clave de roles.json) → token CSS → valor que devuelve readVar(token). Cambiar la paleta de la marca
// es cambiar tokens: los Lottie no se vuelven a exportar. Las claves de roles.json NO se reescriben nunca.
// Pura: devuelve una copia y no muta la entrada. Un color fuera de roles, uno animado, o un token que no sea #rrggbb, se dejan igual.
// Importable: import { recolor, recolorMap } from './recolor.mjs'
// CLI: node SK/scripts/recolor.mjs <anim.json> (--vars vars.json | --map mapa.json) [--roles roles.json] [--out out.json]
//   --vars   { "--illus-ink": "#ffffff", … }   valores de los tokens (un tema)
//   --map    { "#1b1b1f": "#ffffff", … }       color de autoría → color final, sin pasar por tokens
// plantillas/Illustration.tsx e illustration-vanilla.js llevan una copia del bloque <recolor>; recolor.test.mjs comprueba que son iguales.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { findRoles, isMain, loadJson } from './lib.mjs';

// <recolor>
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const toHex = (k) => '#' + k.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
export function recolor(json, roles, readVar) {
  const out = structuredClone(json);
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const k = n.c?.k;
    if ((n.ty === 'fl' || n.ty === 'st') && !n.c?.a && Array.isArray(k) && typeof k[0] === 'number') {
      const token = roles[toHex(k)];
      const rgb = token && HEX6.exec(String(readVar(token)).trim());
      if (rgb) n.c.k = [...rgb.slice(1).map((h) => parseInt(h, 16) / 255), ...k.slice(3)];
    }
    Object.values(n).forEach(walk);
  };
  walk(out);
  return out;
}
// </recolor>

// color de autoría → color final directo (sin tokens): variantes de paleta, modo oscuro, galería.
export const recolorMap = (json, map) => recolor(json, map, (v) => v);

function main(argv) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { vars: { type: 'string' }, map: { type: 'string' }, roles: { type: 'string' }, out: { type: 'string' } },
  });
  if (!positionals[0] || !!o.vars === !!o.map) {
    console.error('uso: node SK/scripts/recolor.mjs <anim.json> (--vars vars.json | --map mapa.json) [--roles roles.json] [--out out.json]');
    return 2;
  }
  const j = loadJson(positionals[0]);
  let out;
  if (o.map) out = recolorMap(j, loadJson(o.map));
  else {
    const rolesPath = o.roles ?? findRoles(positionals[0]);
    if (!rolesPath) throw new Error('roles.json not found: pass --roles');
    const vars = loadJson(o.vars);
    out = recolor(j, loadJson(rolesPath), (t) => vars[t] ?? '');
  }
  const dest = o.out ?? positionals[0].replace(/\.json$/, '.recolor.json');
  writeFileSync(dest, JSON.stringify(out));
  console.log(`ok ${dest}`);
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
