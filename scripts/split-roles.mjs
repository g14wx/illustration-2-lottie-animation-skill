// split-roles: da a unas piezas (por nombre) su propio color de autoría, p. ej. piel y pelo. Solo biblioteca estándar de Node.
// Uso: node SK/scripts/split-roles.mjs <split.json> [--spec parts.json] [--parts-dir carpeta] [--lottie a.json,b.json] [--roles roles.json] [--dry]
// split.json: { "splits": [ { "from": "#e4e4e7", "to": "#f0c8a0", "token": "--illus-skin", "parts": ["head", "neck", "handL"], "only": "fill" } ] }
//   from   color de autoría actual (clave de roles.json)         to     color de autoría nuevo
//   token  token CSS del color nuevo (se agrega a roles.json)    parts  nombres de pieza (= nombre de capa en el Lottie)
//   only   opcional: "fill" o "stroke" (por defecto los dos)
// Qué cambia: (1) en --spec, el `svg` de esas piezas y, si vienen de un donante, un `palette` propio de la pieza (así un build-parts
// posterior no lo deshace); (2) los parts/<pieza>.svg de --parts-dir (por defecto <carpeta del spec>/parts); (3) los Lottie de --lottie,
// por nombre de capa (también dentro de las precomps de esa capa); (4) roles.json recibe `to → token`. Con --dry solo cuenta.
// Moraleja de la sesión que lo originó: define piel y pelo como roles propios DESDE EL PRINCIPIO (palette del spec); este script es
// para arreglar un arte que ya los comparte con otras piezas. Límite: si el relleno y el aro de contorno de una pieza tienen el mismo
// color (aro negro = también un fill), `from` los toca a los dos; da al relleno un color de donante propio en `palette` y no hace falta.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compactJson, findRoles, hex2c, isMain, loadJson, normHex, toHex } from './lib.mjs';

// '<path fill="#aaa" stroke="#bbb"/>' → mismo texto con from → to en los atributos elegidos. → { text, n }
export function splitSvg(svg, { from, to, only }) {
  let n = 0;
  const text = svg.replace(/\b(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (m, attr, c) => {
    if ((only && only !== attr) || normHex(c) !== from) return m;
    n++;
    return `${attr}="${to}"`;
  });
  return { text, n };
}

// Capas por nombre de pieza (y todo lo que cuelga de su precomp). Muta `j`. → cantidad de colores cambiados
export function splitLottie(j, { from, to, only, parts }) {
  const names = new Set(parts);
  let n = 0;
  const shapes = (list) =>
    list.forEach((s) => {
      const attr = s.ty === 'fl' ? 'fill' : s.ty === 'st' ? 'stroke' : null;
      if (attr && (!only || only === attr) && !s.c?.a && Array.isArray(s.c?.k) && toHex(s.c.k) === from) {
        s.c.k = [...hex2c(to).slice(0, 3), ...s.c.k.slice(3)];
        n++;
      }
      if (s.it) shapes(s.it);
    });
  const layers = (list, inside) =>
    list.forEach((l) => {
      const here = inside || names.has(l.nm);
      if (here && l.shapes) shapes(l.shapes);
      const a = l.ty === 0 && j.assets?.find((x) => x.id === l.refId);
      if (a) layers(a.layers, here);
    });
  layers(j.layers, false);
  return n;
}

// Aplica todos los cambios de `plan` a los archivos pedidos. Devuelve las líneas del informe.
export function applySplit(plan, { specPath, partsDir, lottie = [], rolesPath, dry = false }) {
  const log = [];
  const splits = plan.splits.map((s) => ({ ...s, from: normHex(s.from), to: normHex(s.to) }));
  for (const s of splits) {
    if (!/^#[0-9a-f]{6}$/.test(s.from) || !/^#[0-9a-f]{6}$/.test(s.to)) throw new Error(`from/to must be #rrggbb (got ${s.from} → ${s.to})`);
    if (s.from === s.to) throw new Error(`from and to are the same color (${s.from})`);
  }
  const write = (p, text) => !dry && writeFileSync(p, text);

  if (specPath) {
    const spec = loadJson(specPath);
    const dir = partsDir ?? join(dirname(resolve(specPath)), 'parts');
    let touched = 0;
    for (const s of splits)
      for (const p of spec.parts.filter((q) => s.parts.includes(q.name))) {
        if (p.svg !== undefined) {
          const r = splitSvg(p.svg, s);
          p.svg = r.text;
          touched += r.n;
        } else {
          // pieza de donante: su palette propio manda sobre el general en esa pieza
          const donorColors = Object.entries(spec.palette ?? {}).filter(([, v]) => normHex(v) === s.from).map(([k]) => normHex(k));
          if (!s.only || s.only === 'fill') p.palette = { ...p.palette, ...Object.fromEntries(donorColors.map((k) => [k, s.to])) };
          touched += donorColors.length;
        }
        const f = join(dir, `${p.name}.svg`);
        if (existsSync(f)) {
          const r = splitSvg(readFileSync(f, 'utf8'), s);
          write(f, r.text);
          touched += r.n;
        }
      }
    write(specPath, compactJson(spec) + '\n');
    log.push(`spec ${specPath}: ${touched} cambios`);
  }
  for (const f of lottie) {
    const j = loadJson(f);
    const n = splits.reduce((sum, s) => sum + splitLottie(j, s), 0);
    write(f, JSON.stringify(j));
    log.push(`lottie ${f}: ${n} colores`);
  }
  if (rolesPath) {
    const roles = loadJson(rolesPath);
    for (const s of splits) {
      if (s.token) {
        if (roles[s.to] && roles[s.to] !== s.token) throw new Error(`roles.json already maps ${s.to} to ${roles[s.to]}, not ${s.token}`);
        roles[s.to] = s.token;
      } else if (!roles[s.to]) throw new Error(`${s.to} is not in roles.json: give a "token"`);
    }
    write(rolesPath, JSON.stringify(roles, null, 2) + '\n');
    log.push(`roles ${rolesPath}: ${splits.map((s) => `${s.to} → ${s.token ?? roles[s.to]}`).join(', ')}`);
  }
  return log;
}

function main(argv) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { spec: { type: 'string' }, 'parts-dir': { type: 'string' }, lottie: { type: 'string' }, roles: { type: 'string' }, dry: { type: 'boolean' } },
  });
  if (!positionals[0] || !(o.spec || o.lottie)) {
    console.error('uso: node SK/scripts/split-roles.mjs <split.json> [--spec parts.json] [--parts-dir carpeta] [--lottie a.json,b.json] [--roles roles.json] [--dry]');
    return 2;
  }
  const rolesPath = o.roles ?? findRoles(o.spec ?? o.lottie.split(',')[0]);
  const log = applySplit(loadJson(positionals[0]), { specPath: o.spec, partsDir: o['parts-dir'], lottie: o.lottie?.split(',').filter(Boolean), rolesPath, dry: o.dry });
  console.log(`${o.dry ? 'dry-run ' : ''}ok\n${log.join('\n')}`);
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
