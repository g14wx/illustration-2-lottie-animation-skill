// build-galeria: mete los Lottie, los PNG originales, roles.json y las paletas en galeria.html y deja UN solo HTML para aprobar. Solo Node 20+.
// Uso: node SK/plantillas/build-galeria.mjs <manifiesto.json> [--out galeria-final.html] [--template galeria.html] [--player lottie_light.min.js]
//   --player  mete el player dentro del HTML (funciona sin red); sin él, carga lottie-web 5.12.2 desde cdnjs (avisa por stderr).
// Manifiesto (rutas relativas al manifiesto; roles, paletas y cada paleta pueden ir como objeto o como ruta a un .json):
//   { "title": "…", "intro": "…", "roles": "roles.json",
//     "palettes": { "A": { "--illus-skin": "#f0c8a0", … }, "Oscuro": "paletas/oscuro.json" },   // token → valor; "--paper" = fondo del lienzo
//     "assets": [ { "id": "persona", "label": "Persona", "use": "Saluda en el formulario", "json": "persona/persona.json", "png": "originales/persona.png" } ],
//     "compose": { "bgs": ["oficina"], "cast": ["persona"] },          // opcional: ids de assets; un fondo y un personaje apilados, con selector
//     "shots": [ { "label": "Login 1280", "png": "capturas/login.png" } ],   // opcional: capturas de las pantallas reales (`pngSrc` = URL)
//     "notes": [ { "title": "Contraste", "text": "…", "items": ["rasgos sobre piel 5,45:1", …] } ] }   // opcional: decisiones, límites aceptados, números
//   Las claves de `palettes` que empiezan con "_" (p. ej. "_comment") se ignoran.
//   Aviso: un Artifact de Claude pesa como máximo 16 MB. El HTML lleva los Lottie y los PNG en base64; si pasa de 16 MB, encoge los PNG originales (webp chico).
//   `json` mete el Lottie dentro del HTML (lo normal: un solo archivo que se abre con doble clic); en su lugar, `src` deja una URL relativa que
//   la página lee con fetch (solo funciona servida por http, no con file://). `png` es opcional (se muestra al lado para comparar con el
//   original del pack; `pngSrc` = URL en vez de incrustarlo). El HTML con datos lleva el arte: no lo publiques fuera del equipo si la
//   licencia del pack no cubre derivados.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

// `manifest` ya parseado; `read(ruta)` devuelve Buffer (ruta ya resuelta). → HTML
// `warn(msg)` recibe los avisos (sin player, HTML demasiado grande).
export function buildGaleria(manifest, template, read, player, warn = () => {}) {
  const json = (v) => (typeof v === 'string' ? JSON.parse(read(v).toString('utf8')) : v);
  const uri = (p) => `data:${MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'};base64,${read(p).toString('base64')}`;
  const ids = (manifest.assets ?? []).map((a) => a.id);
  for (const k of ['bgs', 'cast']) for (const i of manifest.compose?.[k] ?? []) if (!ids.includes(i)) throw new Error(`compose.${k}: unknown asset "${i}" (have: ${ids.join(', ')})`);
  const data = {
    title: manifest.title ?? 'Galería de ilustraciones animadas',
    intro: manifest.intro ?? '',
    roles: json(manifest.roles ?? {}),
    palettes: Object.fromEntries(Object.entries(json(manifest.palettes ?? {})).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, json(v)])),
    assets: (manifest.assets ?? []).map((a) => {
      if (!a.id || !(a.json || a.src)) throw new Error(`asset needs id and json (inline) or src (URL): ${JSON.stringify(a)}`);
      const png = a.png ? uri(a.png) : a.pngSrc;
      return { id: a.id, label: a.label, use: a.use, ...(a.json ? { data: json(a.json) } : { src: a.src }), ...(png && { png }) };
    }),
    compose: manifest.compose ?? null,
    shots: (manifest.shots ?? []).map((x) => ({ label: x.label, png: x.png ? uri(x.png) : x.pngSrc })),
    notes: manifest.notes ?? [],
  };
  const text = JSON.stringify(data).replace(/</g, '\\u003c'); // sin cerrar el <script> por accidente
  const block = /(<script type="application\/json" id="galeria-data">)[\s\S]*?(<\/script>)/;
  if (!block.test(template)) throw new Error('template has no #galeria-data block');
  let html = template.replace(block, (_, a, b) => a + text + b);
  if (player) html = html.replace(/<script id="player-cdn"[^>]*><\/script>/, () => `<script>${player.replace(/<\/script/gi, '<\\/script')}</script>`);
  else warn(player === '' ? '--player is empty (is $LOTTIE_LIGHT set?): the gallery will load lottie-web 5.12.2 from cdnjs, so it needs network and is not the 5.13.0 player of the real assets'
    : 'no --player: the gallery loads lottie-web 5.12.2 from cdnjs (needs network; not the 5.13.0 player of the real assets). Pass --player <lottie_light.min.js> to embed it');
  const mb = Buffer.byteLength(html) / 2 ** 20;
  if (mb > 16) warn(`the HTML is ${mb.toFixed(1)} MB; a Claude Artifact takes at most 16 MB: shrink the original PNGs (small webp) or split the gallery`);
  return html;
}

function main(argv) {
  const { values: o, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' }, template: { type: 'string' }, player: { type: 'string' } } });
  if (!positionals[0]) {
    console.error('uso: node SK/plantillas/build-galeria.mjs <manifiesto.json> [--out galeria-final.html] [--template galeria.html] [--player lottie_light.min.js]');
    return 2;
  }
  const mPath = resolve(positionals[0]);
  const base = dirname(mPath);
  const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
  const html = buildGaleria(manifest, readFileSync(resolve(o.template ?? `${HERE}/galeria.html`), 'utf8'), (p) => readFileSync(resolve(base, p)), o.player && readFileSync(resolve(o.player), 'utf8'), (m) => console.error(`warning: ${m}`));
  const out = resolve(o.out ?? 'galeria-final.html');
  writeFileSync(out, html);
  console.log(`ok ${out} (${manifest.assets?.length ?? 0} assets, ${(html.length / 1024).toFixed(0)} KB)`);
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) { // por symlink (skill instalado) también corre
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`FAIL ${e.message}`);
    process.exitCode = 1;
  }
}
