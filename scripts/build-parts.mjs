// build-parts: SVG donante → piezas normalizadas (viewBox 1000×1000), un SVG por pieza. Solo biblioteca estándar de Node.
// Uso: node SK/scripts/build-parts.mjs <parts.json> [--roles roles.json] [--out carpeta] [--nearest]
//        escribe <carpeta>/<pieza>.svg (por defecto, `parts/` junto a parts.json)
//      node SK/scripts/build-parts.mjs --list <donante.svg>     índice, etiqueta, relleno y bbox de cada elemento dibujable
//      node SK/scripts/build-parts.mjs --colors <donante.svg>   colores distintos del donante y cuántos elementos usa cada uno
// parts.json: { donors: { clave: 'ruta/relativa/a/parts.json.svg' },
//               palette: { '#color-del-donante': '#color-de-autoría' },   // '#000000' = el negro por defecto del donante (la tinta)
//               parts: [ { name, donor, indices: [n…], palette?: { … }, transform?: { … } } | { name, svg: '<path …/>…' } ] }
//   Cada valor de `palette` debe ser una clave de roles.json. `palette` dentro de una pieza pisa al general solo en esa pieza
//   (así la piel y el pelo tienen su propio color de autoría desde el principio).
//   `transform` (solo en piezas con donante) ajusta el dibujo al rig ANTES de escribirlo: { scale, rotate, mirror, dx, dy, about }.
//   Orden: espejo, escala, giro (grados, + = horario) alrededor de `about` ([x, y]; por omisión el centro de la pieza) y al final (dx, dy).
//   Las figuras pasan a <path>; el grosor de trazo se escala con la figura. Ver scripts/pathkit.mjs.
// Normaliza: indexa path/circle/ellipse/rect/polygon/polyline en orden de documento (los <line> no cuentan: son líneas
// invisibles de relleno), pasa los estilos .cls-N a atributos y mapea cada color por `palette`.
// Un color fuera de la paleta es error (se listan todos); con --nearest se acerca al color de roles.json más parecido (en RGB)
// y avisa cada cambio: sirve para packs con colores casi iguales. Los índices salen de --list o de index-svg.mjs.
// El lienzo del skill es 1000×1000: si el donante trae otro viewBox, avisa (las piezas no coincidirían con el lienzo).
// ponytail: regex sobre SVG de Illustrator (un elemento por etiqueta, estilos solo en <style> .cls-N o .a,.b).
// Falla en voz alta (nunca cae al negro) ante: clase sin regla, fill/stroke que no sea #rrggbb o none, `style=` y <g> con
// class/fill/stroke/style/transform. Techo: otros selectores, un ">" dentro de un atributo y el bbox de --list sin aplicar
// `transform`. Las piezas con `svg` propio no se validan. Si el pack cambia, el paso siguiente es un parser XML.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findRoles, isMain, loadJson, normHex } from './lib.mjs';
import { fitElements } from './pathkit.mjs';

const decls = (body) =>
  Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));

// Elementos dibujables en orden de documento: { tag, attrs } con la clase ya inlineada, fill siempre presente y colores #rrggbb.
export function elements(svg) {
  const css = {};
  for (const [, sels, body] of (svg.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '').matchAll(/([^{}]+)\{([^}]*)\}/g))
    for (const sel of sels.split(',').map((x) => x.trim().replace(/^\./, ''))) css[sel] = { ...css[sel], ...decls(body) };
  const out = [];
  const drawn = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  if (/<g\b[^>]*\s(class|fill|stroke|style|transform)=/.test(drawn)) throw new Error('<g> with class/fill/stroke/style/transform is not supported (its styles would be dropped)');
  for (const [, tag, raw] of drawn.matchAll(/<(path|circle|ellipse|rect|polygon|polyline|line)\b([^>]*?)\/?>/g)) {
    if (tag === 'line') continue;
    const { class: cls = '', ...attrs } = Object.fromEntries([...raw.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    if ('style' in attrs) throw new Error(`style="" attribute is not supported on <${tag}>`);
    const names = cls.split(/\s+/).filter(Boolean);
    const missing = names.find((c) => !css[c]);
    if (missing) throw new Error(`class "${missing}" on <${tag}> has no rule in <style> (only .cls-N and comma lists are supported)`);
    const all = { fill: '#000000', ...attrs, ...Object.assign({}, ...names.map((c) => css[c])) };
    for (const k of ['fill', 'stroke'])
      if (all[k]) {
        all[k] = normHex(all[k]);
        if (!/^(#[0-9a-f]{6}|none)$/.test(all[k])) throw new Error(`unsupported ${k} "${all[k]}" on <${tag}> (only #rrggbb or none)`);
      }
    out.push({ tag, attrs: all });
  }
  return out;
}

const T_KEYS = ['scale', 'rotate', 'mirror', 'dx', 'dy', 'about'];
function checkedTransform({ name, transform: t }) {
  const bad = Object.keys(t).filter((k) => !T_KEYS.includes(k));
  if (bad.length) throw new Error(`${name}: unknown transform key(s) ${bad.join(', ')} (have: ${T_KEYS.join(', ')})`);
  return t;
}

const dist = (a, b) => [1, 3, 5].reduce((s, i) => s + (parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) ** 2, 0);

// `load(rutaRelativa)` devuelve el texto del SVG; `roles` (roles.json) es opcional: si viene, la paleta solo puede apuntar a sus claves.
// opts.nearest: los colores sin regla se acercan al de roles más parecido; opts.log(msg) recibe cada cambio. → { nombre: svg }.
export function buildParts(spec, load, roles, { nearest = false, log = () => {} } = {}) {
  if (nearest && !roles) throw new Error('--nearest needs roles.json');
  const norm = (pal) => Object.fromEntries(Object.entries(pal ?? {}).map(([k, v]) => [normHex(k), normHex(v)]));
  const palette = norm(spec.palette);
  const offRoles = (pal) => roles && [...new Set(Object.values(pal))].filter((v) => !Object.hasOwn(roles, v));
  if (offRoles(palette)?.length) throw new Error(`palette values not in roles.json: ${offRoles(palette).join(', ')}`);
  const donors = {};
  const unknown = new Map(); // color → dónde se usa (pieza[índice])
  const snapped = new Map();
  const files = {};
  const colorKeys = roles && Object.keys(roles).filter((k) => /^#[0-9a-f]{6}$/.test(k));
  for (const p of spec.parts) {
    const own = norm(p.palette);
    if (offRoles(own)?.length) throw new Error(`${p.name}: palette values not in roles.json: ${offRoles(own).join(', ')}`);
    const pal = { ...palette, ...own };
    const render = ({ tag, attrs }, where) => {
      const a = Object.entries(attrs).map(([k, v]) => {
        if (!['fill', 'stroke'].includes(k) || !v.startsWith('#')) return `${k}="${v}"`;
        if (!pal[v] && nearest) {
          pal[v] = palette[v] = colorKeys.reduce((best, c) => (dist(v, c) < dist(v, best) ? c : best));
          snapped.set(v, pal[v]);
        }
        if (!pal[v]) unknown.set(v, [...(unknown.get(v) ?? []), where]);
        return `${k}="${pal[v] ?? v}"`;
      });
      return `<${tag} ${a.join(' ')}/>`;
    };
    let body = p.svg;
    if (body === undefined) {
      if (!spec.donors?.[p.donor]) throw new Error(`${p.name}: donor "${p.donor}" is not in spec.donors`);
      if (!donors[p.donor]) {
        const svg = load(spec.donors[p.donor]);
        const vb = /<svg\b[^>]*\sviewBox="([^"]*)"/.exec(svg)?.[1];
        if (vb && vb.trim().split(/[\s,]+/).join(' ') !== '0 0 1000 1000')
          log(`warning: donor "${p.donor}" has viewBox "${vb}", not "0 0 1000 1000": its parts will not match the 1000x1000 canvas (scale the donor first)`);
        donors[p.donor] = elements(svg);
      }
      const els = donors[p.donor];
      const picked = p.indices.map((i) => {
        if (!els[i]) throw new Error(`${p.name}: index ${i} out of range (donor "${p.donor}" has ${els.length} elements)`);
        return els[i];
      });
      body = (p.transform ? fitElements(picked, checkedTransform(p)) : picked).map((e, k) => render(e, `${p.name}[${p.indices[k]}]`)).join('\n');
    } else if (p.transform) throw new Error(`${p.name}: transform needs donor and indices, not svg`);
    files[p.name] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n${body}\n</svg>\n`;
  }
  for (const [from, to] of snapped) log(`snapped ${from} -> ${to}`);
  if (unknown.size) throw new Error(`colors not in palette: ${[...unknown].map(([c, w]) => `${c} (${w.join(', ')})`).join(', ')}`);
  return files;
}

// Una línea por elemento: índice, tag, fill y bbox (exacto en circle/ellipse/rect/polygon/polyline; en path, largo de `d`).
export function listRows(svg) {
  return elements(svg).map(({ tag, attrs: a }, i) => {
    const f = (k) => Number(a[k]);
    const r = (v) => v.map(Math.round);
    let box = '';
    if (tag === 'circle') box = r([f('cx') - f('r'), f('cy') - f('r'), f('cx') + f('r'), f('cy') + f('r')]);
    else if (tag === 'ellipse') box = r([f('cx') - f('rx'), f('cy') - f('ry'), f('cx') + f('rx'), f('cy') + f('ry')]);
    else if (tag === 'rect') box = r([f('x'), f('y'), f('x') + f('width'), f('y') + f('height')]);
    else if (tag === 'path') box = `d ${a.d.length} chars`;
    else {
      const v = a.points.trim().split(/[\s,]+/).map(Number);
      const xs = v.filter((_, k) => k % 2 === 0);
      const ys = v.filter((_, k) => k % 2);
      box = r([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    const t = a.transform ? ' (transform sin aplicar)' : '';
    return `${String(i).padStart(4)}  ${tag.padEnd(8)}  ${a.fill.padEnd(8)}  ${Array.isArray(box) ? `bbox ${box.join(' ')}` : box}${t}`;
  });
}

// Colores distintos (fill y stroke) con la cantidad de elementos que los usan.
export function colorRows(svg) {
  const n = new Map();
  for (const { attrs } of elements(svg))
    for (const k of ['fill', 'stroke']) if (attrs[k]?.startsWith('#')) n.set(attrs[k], (n.get(attrs[k]) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c}  ${k} elementos`);
}

function main(argv) {
  const { values: o, positionals: pos } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { list: { type: 'string' }, colors: { type: 'string' }, roles: { type: 'string' }, out: { type: 'string' }, nearest: { type: 'boolean' } },
  });
  if (o.list) console.log(listRows(readFileSync(o.list, 'utf8')).join('\n'));
  else if (o.colors) console.log(colorRows(readFileSync(o.colors, 'utf8')).join('\n'));
  else if (pos[0]) {
    const dir = dirname(resolve(pos[0]));
    const rolesPath = o.roles ?? findRoles(pos[0]);
    const files = buildParts(loadJson(pos[0]), (p) => readFileSync(join(dir, p), 'utf8'), rolesPath && loadJson(rolesPath), {
      nearest: o.nearest,
      log: (m) => console.error(m),
    });
    const out = resolve(o.out ?? join(dir, 'parts'));
    mkdirSync(out, { recursive: true });
    for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, `${name}.svg`), svg);
    console.log(`ok ${Object.keys(files).length} parts → ${out}`);
  } else {
    console.error('uso: node SK/scripts/build-parts.mjs <parts.json> [--roles roles.json] [--out carpeta] [--nearest] | --list <donante.svg> | --colors <donante.svg>');
    return 2;
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
