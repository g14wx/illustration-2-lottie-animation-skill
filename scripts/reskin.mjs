// reskin: cambia el dibujo de las piezas de un personaje animado por el de otro, sin tocar rig ni animación. Solo biblioteca estándar.
// Uso: node SK/scripts/reskin.mjs <base.json> <skin.json> <out.json>
// base: el Lottie animado (el que tiene el rig y los segmentos). skin: otro Lottie cuyas piezas llevan el MISMO NOMBRE de capa que las de base
//   (el reparto se reutiliza: mismas articulaciones, otros dibujos). Sirve para: personajes nuevos con las animaciones de uno ya aprobado,
//   variantes de piel/ropa, y pasar una pieza redibujada sin re-animar.
// Pieza (hoja) = una capa de forma (ty 4) con nombre (export plano de export-lottie.mjs), o una capa precomp (ty 0) cuyo asset tiene
//   exactamente una capa de forma (export de Creator con group_layers); se busca a cualquier profundidad.
// Las capas null (ty 3) de skin son nodos del rig y se ignoran. Sale 1 si una pieza de skin no existe en base o no es una hoja;
// las piezas de base sin skin quedan como están. Las piezas nuevas deben estar dibujadas en coordenadas del lienzo y en la misma pose de reposo.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { isMain } from './lib.mjs';

const shapeOf = (j, l) => {
  if (l.ty === 4) return l;
  const ls = l.ty === 0 && j.assets?.find((a) => a.id === l.refId)?.layers;
  return ls?.length === 1 && ls[0].ty === 4 ? ls[0] : null;
};

// { nombre → capa de forma } de todas las hojas de base
function leaves(j) {
  const out = new Map();
  const seen = new Set();
  const walk = (layers) =>
    layers.forEach((l) => {
      const s = shapeOf(j, l);
      if (s) return out.set(l.nm, s);
      const a = l.ty === 0 && j.assets?.find((x) => x.id === l.refId);
      if (!a || seen.has(a.id)) return;
      seen.add(a.id);
      walk(a.layers);
    });
  walk(j.layers);
  return out;
}

// Devuelve { json, replaced, missing } o lanza con los nombres del skin que no encajan (base no se muta).
export function reskin(base, skin, name) {
  const out = structuredClone(base);
  const target = leaves(out);
  const bad = [];
  const replaced = [];
  for (const l of skin.layers) {
    if (l.ty === 3) continue;
    const src = shapeOf(skin, l);
    if (!src || !target.has(l.nm)) {
      bad.push(l.nm);
      continue;
    }
    target.get(l.nm).shapes = structuredClone(src.shapes);
    replaced.push(l.nm);
  }
  if (bad.length) throw new Error(`skin parts unknown to base (or not a one-shape-layer leaf): ${bad.join(', ')}`);
  if (name) out.nm = name;
  return { json: out, replaced, missing: [...target.keys()].filter((n) => !replaced.includes(n)) };
}

function main([basePath, skinPath, outPath]) {
  if (!outPath) {
    console.error('uso: node SK/scripts/reskin.mjs <base.json> <skin.json> <out.json>');
    return 2;
  }
  try {
    const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
    const { json, replaced, missing } = reskin(load(basePath), load(skinPath), basename(outPath, extname(outPath)));
    writeFileSync(outPath, JSON.stringify(json));
    console.error(`replaced ${replaced.length}: ${replaced.join(', ')}\nmissing ${missing.length}: ${missing.join(', ')}`);
    return 0;
  } catch (e) {
    console.error(`FAIL reskin: ${e.message}`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
