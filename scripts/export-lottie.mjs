// export-lottie: parts.json (piezas + rig + plan de animación) → un Lottie plano que lottie_light reproduce. Sin LottieFiles Creator.
// Uso: node SK/scripts/export-lottie.mjs <parts.json> [--out anim.json] [--name nombre] [--roles roles.json] [--parts-dir carpeta] [--max-kb N]
//   --out        por defecto <carpeta de parts.json>/<nombre>.json
//   --name       por defecto el nombre de la carpeta de parts.json
//   --parts-dir  de dónde salen los SVG de las piezas sin `svg` propio (los que escribe build-parts); por defecto <carpeta>/parts
// Hace, en orden: revisa el plan (lintPlan), exporta, comprueba z-order y pose de reposo LEYENDO EL JSON exportado y corre check-lottie
// con roles.json y parts.json. Sale 1 si algo falla. Si falla el lint del plan NO escribe nada; si falla la revisión posterior (z-order,
// reposo, gate) el archivo se escribe igual, para poder mirarlo con render.mjs.
// Las piezas sin `svg` propio salen de <carpeta>/parts/<pieza>.svg: corre build-parts ANTES y no exportes si build-parts falló.
// Estructura: una sola composición plana. Cada nodo del rig es una capa null (ty 3) con `parent`; cada pieza es una capa de forma
// (ty 4) en coordenadas del lienzo, hija de su nodo. Z-order = orden de `parts` (la primera pieza va al fondo).
// Por qué plano y no precomps: con precomps (group_layers de Creator) una pieza de otro grupo no se puede intercalar en el z-order.
// Formato de parts.json: plantillas/parts.schema.md. Claves del plan: [frame, valor, ease?]; ease = interpolación desde esa clave
// a la siguiente (lin | io | i | o | hold | cr). Los valores son RELATIVOS al reposo (el frame 0 del primer segmento).
// El Lottie lleva `meta.repeats` ({ idle: 2 }) copiado de `segments`, para que el runtime no repita esa tabla a mano.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { elements } from './build-parts.mjs';
import { check } from './check-lottie.mjs';
import { findRoles, hex2c, isMain, loadJson } from './lib.mjs';
import { pathToContours, rectPts } from './pathkit.mjs';

export { pathToContours }; // las pruebas y otros scripts lo importan desde aquí

// ---------------------------------------------------------------- SVG → shapes
const num = (s) => +(+s).toFixed(3);

const stat = (k) => ({ a: 0, k });
const TR = { ty: 'tr', p: stat([0, 0]), a: stat([0, 0]), s: stat([100, 100]), r: stat(0), o: stat(100), sk: stat(0), sa: stat(0) };
// Contorno cerrado desde una lista de puntos (polygon, polyline, rect).
const poly = (pts, c, prec) => ({ c, v: pts.map((q) => q.map((v) => +v.toFixed(prec))), i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]) });
function elementGroup({ tag, attrs: a }, nm, prec = 3) {
  const pairs = (s) => { const v = s.trim().split(/[\s,]+/).map(Number); return v.reduce((r, _, k) => (k % 2 ? r : [...r, [v[k], v[k + 1]]]), []); };
  const sh = tag === 'path'
    ? pathToContours(a.d, prec).map((k) => ({ ty: 'sh', d: 1, ks: stat(k) }))
    : tag === 'circle'
      ? [{ ty: 'el', d: 1, p: stat([+a.cx, +a.cy]), s: stat([2 * a.r, 2 * a.r]) }]
      : tag === 'ellipse'
        ? [{ ty: 'el', d: 1, p: stat([+a.cx, +a.cy]), s: stat([2 * a.rx, 2 * a.ry]) }]
        : tag === 'rect' || tag === 'polygon' || tag === 'polyline'
          ? [{ ty: 'sh', d: 1, ks: stat(poly(tag === 'rect' ? rectPts(a) : pairs(a.points), tag !== 'polyline' || a.fill !== 'none', prec)) }] // un polyline relleno se cierra solo al pintar (SVG)
          : (() => { throw new Error(`<${tag}> not supported in parts`); })();
  // En Lottie el primer ítem se pinta encima: el trazo va antes que el relleno (como SVG: relleno y luego trazo).
  const stroke = a.stroke && a.stroke !== 'none' ? [{ ty: 'st', c: stat(hex2c(a.stroke)), o: stat(100), w: stat(+(a['stroke-width'] ?? 1)), lc: 2, lj: 2, ml: 4 }] : [];
  // fill-rule="evenodd" (Illustrator lo usa en los aros de contorno) → r: 2; el resto, no-cero
  const fill = a.fill !== 'none' ? [{ ty: 'fl', c: stat(hex2c(a.fill)), o: stat(100), r: a['fill-rule'] === 'evenodd' ? 2 : 1 }] : [];
  return { ty: 'gr', nm, it: [...sh, ...stroke, ...fill, TR] };
}

// ---------------------------------------------------------------- keyframes
const EASE = { lin: [0.167, 0.167, 0.833, 0.833], io: [0.65, 0, 0.35, 1], i: [0.55, 0.055, 0.675, 0.19], o: [0.215, 0.61, 0.355, 1] };
const REST = { x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, o: 1 };
const kf = (t, s, ease) => (ease ? { t, s, o: { x: ease[0], y: ease[1] }, i: { x: ease[2], y: ease[3] } } : { t, s, h: 1 }); // sin ease = sostiene

// keys de un canal a través de todos los segmentos → keyframes Lottie. `map` pasa valor relativo → valor Lottie (array).
function channelKeys(segs, pick, map, restVal) {
  const out = [];
  const push = (k) => { if (!out.some((x) => x.t === k.t)) out.push(k); };
  for (const sg of segs) {
    const keys = pick(sg);
    if (!keys) continue;
    if (sg.tm > 0) push(kf(sg.tm - 1, map(restVal))); // hasta aquí, reposo (también evita arrastrar la pose inicial de un segmento fuera de reposo hacia atrás)
    keys.forEach(([f, v, e = 'lin'], j) => {
      const t = sg.tm + f, nx = keys[j + 1];
      if (!nx || e === 'hold') return push(kf(t, map(v))); // la última clave de un segmento sostiene
      if (e === 'cr') { // Catmull-Rom exacto = Hermite con tangentes (v[j+1]-v[j-1])/2: handles de Bézier (1/3, m/3Δ) y (2/3, 1-m/3Δ)
        const p0 = (keys[j - 1] ?? keys[j])[1], p3 = (keys[j + 2] ?? nx)[1], D = nx[1] - v;
        return push(kf(t, map(v), D === 0 ? EASE.lin : [1 / 3, (nx[1] - p0) / (6 * D), 2 / 3, 1 - (p3 - v) / (6 * D)]));
      }
      push(kf(t, map(v), EASE[e] ?? EASE.lin));
    });
  }
  return out;
}

// ---------------------------------------------------------------- markers y revisión del plan
// `plan.markers` si existe; si no, un marker por segmento de plan.keys en orden, con UN frame entre uno y otro:
// lottie_light termina un playSegments([tm, tm+dr]) en tm+dr-1 y cae en el primer frame del siguiente; ese frame de separación evita saltos.
export function markersOf(plan) {
  if (plan.markers) return plan.markers;
  let tm = 0;
  const out = {};
  for (const [seg, def] of Object.entries(plan.keys ?? {})) {
    out[seg] = { tm, dr: def.dr };
    tm += def.dr + 1;
  }
  return out;
}

// Revisa el spec antes de exportar. Devuelve la lista de fallos (vacía = ok).
export function lintPlan(spec, name = 'anim') {
  const errs = [];
  const fail = (m) => errs.push(`${name}: ${m}`);
  const { parts = [], rig = {}, joints = {}, plan = {}, limits = {}, segments = {} } = spec;
  const partNames = parts.map((p) => p.name);
  for (const dup of new Set(partNames.filter((x, i) => partNames.indexOf(x) !== i))) fail(`part name "${dup}" is repeated`);
  for (const n of Object.keys(rig)) {
    if (partNames.includes(n)) fail(`"${n}" is both a part and a rig node (layer names must be unique)`);
    if (!joints[rig[n].joint]) fail(`rig node "${n}": joint "${rig[n].joint}" is not in joints`);
    if (rig[n].parent && !(rig[n].parent in rig)) fail(`rig node "${n}": parent "${rig[n].parent}" is not a rig node`);
    for (let k = n, hops = 0; rig[k]?.parent; k = rig[k].parent) if (++hops > Object.keys(rig).length) { fail(`rig node "${n}": parent cycle`); break; }
  }
  for (const p of parts) if (p.node && !rig[p.node]) fail(`part "${p.name}": node "${p.node}" is not in rig`);
  const restO = Object.fromEntries(parts.filter((q) => q.rest).map((q) => [q.name, q.rest.o]));
  const marks = markersOf(plan);
  const total = Object.values(marks).reduce((m, k) => Math.max(m, k.tm + k.dr + 1), 0);
  for (const s of Object.keys(segments)) if (!plan.keys?.[s]) fail(`segment "${s}" has no entry in plan.keys`);
  for (const [seg, def] of Object.entries(plan.keys ?? {})) {
    const sg = segments[seg];
    if (!sg) fail(`plan segment "${seg}" is missing in segments`);
    if (!Number.isInteger(def.dr) || def.dr < 1) fail(`${seg}: dr must be an integer >= 1`);
    if (sg?.autoplay && (def.dr / 30) * (sg.repeats ?? 1) > 5) fail(`${seg}: autoplay lasts more than 5 s (dr ${def.dr} x ${sg.repeats ?? 1})`);
    for (const [node, chans] of Object.entries(def.keys ?? {}))
      for (const [ch, keys] of Object.entries(chans)) {
        const q = `${seg}/${node}.${ch}`;
        if (!rig[node] && !partNames.includes(node)) fail(`${seg}: key target "${node}" is neither a rig node nor a part`);
        if (!(ch in REST)) fail(`${q}: unknown channel (x y r s sx sy o)`);
        const rest = node in restO && ch === 'o' ? restO[node] : REST[ch];
        const mod = ch === 'r' ? (v) => ((v % 360) + 360) % 360 : (v) => v;
        keys.forEach((k, i) => { if (i && k[0] <= keys[i - 1][0]) fail(`${q}: keys not increasing at frame ${k[0]}`); });
        if (keys[0][0] !== 0 || keys.at(-1)[0] !== def.dr) fail(`${q}: keys must span frames 0..${def.dr}`);
        if (!def.offPoseStart?.includes(node) && Math.abs(mod(keys[0][1]) - mod(rest)) > 1e-6) fail(`${q}: starts at ${keys[0][1]}, rest is ${rest}`);
        if (Math.abs(mod(keys.at(-1)[1]) - mod(rest)) > 1e-6) fail(`${q}: ends at ${keys.at(-1)[1]}, rest is ${rest}`);
        const lim = limits[`${node}.${ch}`] ?? (ch.startsWith('s') ? limits[`${node}.s`] : undefined);
        if (lim) for (const k of keys) if (k[1] < lim[0] - 1e-9 || k[1] > lim[1] + 1e-9) fail(`${q}: value ${k[1]} at frame ${k[0]} outside limits ${lim}`);
      }
  }
  for (const [seg, fs] of Object.entries(spec.views ?? {})) {
    const dr = plan.keys?.[seg]?.dr;
    if (dr === undefined) fail(`views.${seg}: segment is not in plan.keys`);
    else if (!Array.isArray(fs) || fs.some((f) => !Number.isInteger(f) || f < 0 || f > dr)) fail(`views.${seg}: frames must be integers 0..${dr}`);
  }
  if (total > 450) fail(`total ${total} frames > 450`);
  return errs;
}

// ---------------------------------------------------------------- export
export function exportAnimation(spec, name, svgOf = (p) => p.svg) {
  const { parts, rig = {}, joints = {}, plan } = spec;
  const marks = markersOf(plan);
  const order = Object.entries(marks).map(([cm, m]) => ({ cm, ...m }));
  order.forEach((m, k) => { if (k && m.tm < order[k - 1].tm + order[k - 1].dr + 1) throw new Error(`${name}: segment "${m.cm}" shares a frame with "${order[k - 1].cm}"`); });
  const op = order.at(-1).tm + order.at(-1).dr + 1;
  const segs = order.map((m) => ({ ...m, keys: plan.keys[m.cm]?.keys ?? {} }));
  const jt = (j) => [joints[j].x, joints[j].y];

  const nodeNames = Object.keys(rig);
  const ind = new Map();
  [...parts].reverse().forEach((p, k) => ind.set(`part:${p.name}`, k + 1));
  nodeNames.forEach((n, k) => ind.set(`node:${n}`, parts.length + k + 1));
  const chain = (node) => { const c = []; for (let n = node; n; n = rig[n].parent) c.push(n); return c; };

  const chans = (node, ch) => channelKeys(segs, (sg) => sg.keys[node]?.[ch], (v) => v, REST[ch]);
  const prop = (keys, rest, f) => (keys.length ? { a: 1, k: keys.map((k) => ({ ...k, s: [f(k.s)] })) } : stat(f(rest)));

  // escala: s | sx | sy | sx+sy (mismo horario) → [sx, sy] en %
  const sch = (ks) => JSON.stringify(ks.map(({ t, h, o, i }) => [t, h, o, i]));
  const scale = (node) => {
    const has = (c) => segs.some((sg) => sg.keys[node]?.[c]);
    if (has('s') && (has('sx') || has('sy'))) throw new Error(`${name}/${node}: s together with sx/sy`);
    const kx = has('sx') ? 'sx' : has('s') ? 's' : null, ky = has('sy') ? 'sy' : has('s') ? 's' : null;
    if (!kx && !ky) return stat([100, 100]);
    const X = kx && chans(node, kx), Y = ky && chans(node, ky);
    if (X && Y && sch(X) !== sch(Y)) throw new Error(`${name}/${node}: sx and sy need the same key schedule`);
    return { a: 1, k: (X ?? Y).map((k, j) => ({ ...k, s: [X ? X[j].s : 1, Y ? Y[j].s : 1].map((v) => num(v * 100)) })) };
  };
  const num100 = (v) => num(v * 100);

  const nodeLayer = (n) => {
    const r = rig[n], a = jt(r.joint), at = r.at ? [r.at.x, r.at.y] : a;
    const x = chans(n, 'x'), y = chans(n, 'y'), rot = chans(n, 'r');
    return {
      ddd: 0, ind: ind.get(`node:${n}`), ty: 3, nm: n, sr: 1, ip: 0, op, st: 0, ...(r.parent ? { parent: ind.get(`node:${r.parent}`) } : {}),
      ks: {
        a: stat(a), s: scale(n), sk: stat(0), sa: stat(0), o: stat(100),
        p: { s: true, x: prop(x, 0, (v) => num(at[0] + v)), y: prop(y, 0, (v) => num(at[1] + v)) },
        r: prop(rot, 0, (v) => num((r.rot ?? 0) + v)),
      },
    };
  };

  const shapesOf = (p) => {
    try {
      return elements(svgOf(p)).map((e, k) => elementGroup(e, `${p.name} ${k + 1}`, spec.precision)).reverse();
    } catch (e) {
      throw new Error(`${name}/${p.name}: ${e.message}`);
    }
  };
  const partLayer = (p) => {
    const src = [...(rig[p.name] ? [] : [p.name]), ...(p.node ? chain(p.node) : [])].filter((n) => segs.some((sg) => sg.keys[n]?.o));
    if (src.length > 1) throw new Error(`${name}/${p.name}: opacity keyed on more than one of ${src}`);
    const restO = p.rest?.o ?? 1;
    const keys = src.length ? channelKeys(segs, (sg) => sg.keys[src[0]]?.o, (v) => v, restO) : [];
    return {
      ddd: 0, ind: ind.get(`part:${p.name}`), ty: 4, nm: p.name, sr: 1, ip: 0, op, st: 0, bm: 0, ...(p.node ? { parent: ind.get(`node:${p.node}`) } : {}),
      ks: { a: stat([0, 0]), p: stat([0, 0]), s: stat([100, 100]), r: stat(0), sk: stat(0), sa: stat(0), o: prop(keys, restO, num100) },
      shapes: shapesOf(p),
    };
  };

  const repeats = Object.fromEntries(Object.entries(spec.segments ?? {}).filter(([, v]) => v.repeats).map(([k, v]) => [k, v.repeats]));
  return {
    v: '5.7.0', fr: 30, ip: 0, op, w: 1000, h: 1000, nm: name, ddd: 0, meta: { g: 'animate-illustrations-with-lottie/export-lottie.mjs', repeats }, assets: [],
    layers: [...[...parts].reverse().map(partLayer), ...nodeNames.map(nodeLayer)],
    markers: order.map((m) => ({ cm: m.cm, tm: m.tm, dr: m.dr })),
  };
}

// ---------------------------------------------------------------- lectura del JSON exportado (para verificar sin el plan)
const bez = (x1, y1, x2, y2, u) => {
  const B = (a, b, t) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (B(x1, x2, m) < u) lo = m; else hi = m; }
  return B(y1, y2, (lo + hi) / 2);
};
export function valueAt(p, f) {
  if (p.s === true) return [valueAt(p.x, f), valueAt(p.y, f)];
  if (!p.a) return p.k;
  const ks = p.k;
  if (f >= ks.at(-1).t) return ks.at(-1).s.length === 1 ? ks.at(-1).s[0] : ks.at(-1).s;
  if (f <= ks[0].t) return ks[0].s.length === 1 ? ks[0].s[0] : ks[0].s;
  const j = ks.findIndex((k, i) => ks[i + 1] && f >= k.t && f < ks[i + 1].t);
  const a = ks[j], b = ks[j + 1], u = (f - a.t) / (b.t - a.t);
  const y = a.h ? 0 : bez(a.o.x, a.o.y, a.i.x, a.i.y, u);
  const v = a.s.map((s, d) => s + (b.s[d] - s) * y);
  return v.length === 1 ? v[0] : v;
}
const pose = (j, f) => Object.fromEntries(j.layers.map((l) => [l.nm, ['p', 'a', 's', 'r', 'o'].map((c) => valueAt(l.ks[c], f)).flat()]));
// 8 números por capa: p(2) a(2) s(2) r o; la rotación se compara módulo 360
const near = (a, b, tol) => a.every((v, k) => Math.abs(k === 6 ? ((((v - b[k]) % 360) + 540) % 360) - 180 : v - b[k]) <= tol[k]);

// reposo = frame 0; cada segmento empieza y termina ahí (el inicio se exime para los nodos de `offPoseStart` y todo su hilo);
// el frame anterior al último, cerca (el player termina en dr - 1 y la fachada salta luego al reposo).
export function verify(j, spec, name) {
  const errs = [];
  const want = spec.parts.map((p) => p.name).reverse();
  const got = j.layers.filter((l) => l.ty === 4).map((l) => l.nm);
  if (JSON.stringify(want) !== JSON.stringify(got)) errs.push(`z-order: export ${got} ≠ parts.json (top first) ${want}`);
  const rest = pose(j, 0);
  const T0 = Array(8).fill(1e-3), T1 = [2.5, 2.5, 1e-3, 1e-3, 3, 3, 0.6, 5];
  for (const m of j.markers) {
    const offNodes = new Set(spec.plan.keys[m.cm]?.offPoseStart ?? []);
    const isOff = (lay) => { for (let l = lay; l; l = j.layers.find((x) => x.ind === l.parent)) if (offNodes.has(l.nm)) return true; return false; };
    for (const [label, f, tol] of [['start', m.tm, T0], ['end', m.tm + m.dr, T0], ['end-1', m.tm + m.dr - 1, T1]]) {
      const now = pose(j, f);
      for (const l of j.layers) {
        if (label === 'start' && isOff(l)) continue;
        if (!near(now[l.nm], rest[l.nm], tol)) errs.push(`${name}/${m.cm} ${label} (f${f}): "${l.nm}" is [${now[l.nm].map(num)}], rest is [${rest[l.nm].map(num)}]`);
      }
    }
  }
  return errs;
}

function main(argv) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: 'string' }, name: { type: 'string' }, roles: { type: 'string' }, 'parts-dir': { type: 'string' }, 'max-kb': { type: 'string' } },
  });
  const specPath = positionals[0];
  if (!specPath) {
    console.error('uso: node SK/scripts/export-lottie.mjs <parts.json> [--out anim.json] [--name nombre] [--roles roles.json] [--parts-dir carpeta] [--max-kb N]');
    return 2;
  }
  const dir = dirname(resolve(specPath));
  const name = o.name ?? basename(dir);
  const rolesPath = o.roles ?? findRoles(specPath);
  if (!rolesPath) throw new Error('roles.json not found: pass --roles');
  const spec = loadJson(specPath);
  const lint = lintPlan(spec, name);
  if (lint.length) {
    lint.forEach((e) => console.error(`FAIL ${e}`));
    return 1;
  }
  const partsDir = resolve(o['parts-dir'] ?? join(dir, 'parts'));
  const svgFile = (p) => join(partsDir, `${p.name}.svg`);
  const fromDisk = spec.parts.filter((p) => p.svg === undefined); // sin `svg` propio: la pieza sale de build-parts
  const missing = fromDisk.filter((p) => !existsSync(svgFile(p)));
  if (missing.length) {
    console.error(`FAIL ${name}: no SVG in ${partsDir} for ${missing.map((p) => p.name).join(', ')}: run build-parts first (node ${join(dirname(fileURLToPath(import.meta.url)), 'build-parts.mjs')} ${specPath}) and do not export if it fails`);
    return 1;
  }
  const stale = fromDisk.filter((p) => statSync(svgFile(p)).mtimeMs < statSync(specPath).mtimeMs);
  if (stale.length) console.error(`warning: ${stale.length} piece SVG(s) older than ${basename(specPath)} (${stale.map((p) => p.name).join(', ')}): if you changed pieces or the palette, run build-parts again`);
  const j = exportAnimation(spec, name, (p) => p.svg ?? readFileSync(svgFile(p), 'utf8'));
  const text = JSON.stringify(j);
  const out = resolve(o.out ?? join(dir, `${name}.json`));
  writeFileSync(out, text + '\n');
  const errs = [...verify(j, spec, name), ...check(j, { roles: loadJson(rolesPath), parts: spec, size: text.length, ...(o['max-kb'] && { maxKb: +o['max-kb'] }) })];
  errs.forEach((e) => console.error(`FAIL ${name}: ${e}`));
  if (!errs.length) console.log(`ok ${name}: ${j.layers.length} layers, ${j.op} frames, ${j.markers.map((m) => `${m.cm} ${m.tm}+${m.dr}`).join(', ')}, ${(text.length / 1024).toFixed(1)} KB → ${out}`);
  return errs.length ? 1 : 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    process.exitCode = 1;
  }
}
