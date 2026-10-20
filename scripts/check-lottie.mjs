// check-lottie: la puerta de calidad de un Lottie de ilustración (lo exporte Creator o export-lottie.mjs). Solo biblioteca estándar de Node.
// Uso: node SK/scripts/check-lottie.mjs <anim.json> [--roles roles.json] [--parts parts.json] [--max-kb 200] [--max-frames 450]
// Imprime cada fallo en stderr y sale 1; si no hay ninguno imprime "ok …".
// --roles: por defecto el roles.json que esté junto a <anim.json> o una carpeta arriba.
// --parts: el mismo parts.json de la ilustración; de ahí salen los markers que deben existir y `segments`
//   ({ "idle": { "autoplay": true, "repeats": 2 }, "wave": {} }).
// Reglas: 30 fps · lienzo 1000×1000 · ≤ 450 frames · ≤ 200 KB (el peso lo da la estructura, no la animación; ajustable) ·
//   todo color dentro de roles.json · ningún color animado · sin gradientes, expresiones, efectos (ef), máscaras, mattes, slots (sid),
//   remapeo de tiempo, capas de texto, imagen, sólido, audio o 3D · precomps con la capa (ty 0) de 1000×1000 y refId resuelto ·
//   markers enteros con dr ≥ 1, sin repetir nombre ni solaparse · los segmentos que arrancan solos duran ≤ 5 s contando `repeats`
//   (y `enter` + `idle` juntos también: la fachada los encadena como una sola ráfaga).
// lottie_light (SVG) no trae expresiones y, en 5.13.0, tampoco pinta efectos (`ef`: no registra ninguno; ver referencias/07-gate.md). Máscaras,
// mattes, texto, imagen y sólidos sí los soporta, pero se vetan: pesan, complican el rig y el recolor por rol solo ve los fills y
// strokes de las capas de forma.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { findRoles, isMain, loadJson, toHex } from './lib.mjs';

const MAX_AUTOPLAY_S = 5; // WCAG 2.2.2: lo que dura 5 s o menos queda fuera de "pausar, detener u ocultar"
const LAYERS = { 0: 'precomp', 3: 'null', 4: 'shape' }; // permitidas
const OTHER_LAYERS = { 1: 'solid', 2: 'image', 5: 'text', 6: 'audio', 13: 'camera' }; // solo para el mensaje
const SHAPES = new Set(['gr', 'sh', 'el', 'rc', 'sr', 'fl', 'st', 'tr', 'tm', 'rd']);

// Devuelve la lista de fallos (vacía = ok). `size` = bytes del archivo en disco.
export function check(j, { roles = {}, parts, size = Buffer.byteLength(JSON.stringify(j)), maxKb = 200, maxFrames = 450 } = {}) {
  const errs = [];
  const err = (m) => errs.push(m);
  const at = (p, k) => (p ? `${p}.${k}` : k);

  if (j.fr !== 30) err(`fr must be 30 (got ${j.fr})`);
  if (j.w !== 1000 || j.h !== 1000) err(`canvas must be 1000x1000 (got ${j.w}x${j.h})`);
  if (j.ddd) err('ddd must be 0 (3D)');
  if (!(j.op - j.ip <= maxFrames)) err(`duration ${j.op - j.ip} frames > ${maxFrames} (ip ${j.ip}, op ${j.op})`);
  if (size > maxKb * 1024) err(`size ${(size / 1024).toFixed(1)} KB > ${maxKb} KB`);

  // Recorrido genérico: expresiones (x como string; las curvas de easing llevan x numérico), slots y efectos.
  const walk = (o, p) => {
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${p}[${i}]`));
    if (!o || typeof o !== 'object') return;
    if (typeof o.x === 'string') err(`expression (x) at ${p}`);
    if ('sid' in o) err(`sid (slot) at ${p}`);
    if (Array.isArray(o.ef) && o.ef.length) err(`effects (ef) at ${p}`);
    for (const [k, v] of Object.entries(o)) walk(v, at(p, k));
  };
  walk(j, '');

  const badColors = new Map(); // hex fuera de roles → primer lugar donde aparece
  const color = (c, p) => {
    if (c?.a) return err(`animated color at ${p}`);
    const k = c?.k;
    if (!Array.isArray(k) || k.length < 3 || typeof k[0] !== 'number') return err(`unreadable color at ${p}`);
    const hex = toHex(k);
    if (!Object.hasOwn(roles, hex) && !badColors.has(hex)) badColors.set(hex, p);
  };
  const shapes = (list, p) =>
    list.forEach((s, i) => {
      const q = `${p}[${i}]`;
      if (s.ty === 'gf' || s.ty === 'gs') err(`gradient ${s.ty === 'gf' ? 'fill' : 'stroke'} (${s.ty}) at ${q}`);
      else if (!SHAPES.has(s.ty)) err(`shape type '${s.ty}' not allowed at ${q}`);
      if (s.ty === 'fl' || s.ty === 'st') color(s.c, `${q}.c`);
      if (s.ty === 'gr') shapes(s.it ?? [], `${q}.it`);
    });

  const assets = j.assets ?? [];
  const ids = new Set(assets.map((a) => a.id));
  const lists = [['layers', j.layers ?? []], ...assets.map((a, i) => [`assets[${i}].layers`, a.layers ?? []])];
  for (const [base, list] of lists)
    list.forEach((l, i) => {
      const p = `${base}[${i}]${l.nm ? `("${l.nm}")` : ''}`;
      if (!(l.ty in LAYERS)) err(`layer type ${l.ty} (${OTHER_LAYERS[l.ty] ?? 'unknown'}) not allowed at ${p}`);
      if (l.ddd) err(`3D layer at ${p}`);
      if (l.masksProperties?.length) err(`mask at ${p}`);
      if (l.tt || l.td) err(`matte at ${p}`);
      if ('tm' in l) err(`time remap (tm) at ${p}`);
      // lottie_light recorta cada capa ty 0 con SU w/h; el w/h del asset no se lee nunca
      if (l.ty === 0 && (l.w !== j.w || l.h !== j.h)) err(`precomp layer is ${l.w ?? '?'}x${l.h ?? '?'}, must be ${j.w}x${j.h} at ${p}`);
      if (l.ty === 0 && l.refId === undefined) err(`precomp layer without refId at ${p}`);
      else if (l.refId !== undefined && !ids.has(l.refId)) err(`refId "${l.refId}" not found in assets at ${p}`);
      shapes(l.shapes ?? [], `${p}.shapes`);
    });
  for (const [hex, p] of badColors) err(`color ${hex} not in roles.json at ${p}`);

  // nombres de marker repetidos: el player encontraría siempre el primero
  const names = (j.markers ?? []).map((m) => m.cm ?? m.name);
  for (const dup of new Set(names.filter((x, i) => names.indexOf(x) !== i))) err(`marker name "${dup}" is repeated`);

  if (parts) {
    const segs = Object.entries(parts.segments ?? {}).map(([name, v]) => ({ name, ...v }));
    const marks = (j.markers ?? []).map((m) => ({ name: m.cm ?? m.name, tm: m.tm, dr: m.dr }));
    for (const m of marks) {
      if (!Number.isInteger(m.tm) || !Number.isInteger(m.dr) || m.dr < 1) err(`marker "${m.name}" tm/dr must be integers, dr >= 1 (got ${m.tm}/${m.dr})`);
      else if (m.tm < j.ip || m.tm + m.dr > j.op) err(`marker "${m.name}" [${m.tm},${m.tm + m.dr}] outside [${j.ip},${j.op}]`);
    }
    // se pueden tocar (fin = inicio del siguiente); solaparse no
    [...marks].sort((a, b) => a.tm - b.tm).forEach((m, i, s) => {
      if (i && m.tm < s[i - 1].tm + s[i - 1].dr) err(`markers "${s[i - 1].name}" and "${m.name}" overlap`);
    });
    for (const s of segs) {
      const m = marks.find((x) => x.name === s.name);
      const rep = s.repeats ?? 1;
      const secs = m && (m.dr / j.fr) * rep;
      if (!Number.isInteger(rep) || rep < 1) err(`segment "${s.name}" repeats must be an integer >= 1 (got ${s.repeats})`);
      if (!m) err(`marker "${s.name}" missing`);
      else if (s.autoplay && secs > MAX_AUTOPLAY_S) err(`autoplay "${s.name}" lasts ${secs.toFixed(1)} s > ${MAX_AUTOPLAY_S} s`);
    }
    // La fachada junta las ráfagas separadas por < 1 s en una sola: un fondo reproduce `enter` y enseguida `idle`, y los dos suman un solo tope.
    const auto = (n) => {
      const s = segs.find((x) => x.name === n && x.autoplay), m = marks.find((x) => x.name === n);
      return s && m ? (m.dr / j.fr) * (s.repeats ?? 1) : 0;
    };
    if (auto('enter') + auto('idle') > MAX_AUTOPLAY_S && auto('enter') <= MAX_AUTOPLAY_S && auto('idle') <= MAX_AUTOPLAY_S)
      err(`autoplay "enter" + "idle" last ${(auto('enter') + auto('idle')).toFixed(1)} s > ${MAX_AUTOPLAY_S} s (the facade chains them as one burst)`);
  }
  return errs;
}

function main(argv) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { roles: { type: 'string' }, parts: { type: 'string' }, 'max-kb': { type: 'string' }, 'max-frames': { type: 'string' } },
  });
  const file = positionals[0];
  if (!file) {
    console.error('uso: node SK/scripts/check-lottie.mjs <anim.json> [--roles roles.json] [--parts parts.json] [--max-kb 200] [--max-frames 450]');
    return 2;
  }
  try {
    const raw = readFileSync(file);
    const j = JSON.parse(raw);
    const rolesPath = o.roles ?? findRoles(file);
    if (!rolesPath) throw new Error('roles.json not found: pass --roles');
    const errs = check(j, {
      roles: loadJson(rolesPath),
      parts: o.parts && loadJson(o.parts),
      size: raw.length,
      ...(o['max-kb'] && { maxKb: +o['max-kb'] }),
      ...(o['max-frames'] && { maxFrames: +o['max-frames'] }),
    });
    for (const e of errs) console.error(`FAIL ${file}: ${e}`);
    if (errs.length) return 1;
    console.log(`ok ${file} (${j.layers?.length ?? 0} layers, ${j.markers?.length ?? 0} markers, ${(raw.length / 1024).toFixed(1)} KB)`);
    return 0;
  } catch (e) {
    console.error(`FAIL ${file}: ${e.message}`);
    return 1;
  }
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`uso: ${e.message}`); // flag desconocida o sin valor (parseArgs)
    process.exitCode = 2;
  }
}
