// render: pinta frames de un Lottie con el player real (lottie_light) en Chrome headless y guarda un PNG. Solo biblioteca estándar.
// Uso: node SK/scripts/render.mjs <anim.json> [--frame 0,30,60] [--segment wave --at 0,18,36] [--size 400] [--out out.png]
//        [--lottie-light ruta/lottie_light.min.js] [--map mapa.json] [--bg "#ffffff"] [--cols 4]
//      node SK/scripts/render.mjs <anim.json> --views parts.json [...]     una hoja: el reposo + los frames de `views` de parts.json ({ segmento: [frames locales] })
//      node SK/scripts/render.mjs <anim.json> --rest-check [--parts parts.json]   sin PNG: compara lo que DIBUJA el player en el frame 0 contra el
//        primer y el último frame de cada segmento (SAME / DIFF; sale 1 si hay DIFF). `--parts` aporta `offPoseStart` (esos segmentos no se miden al inicio).
//   --frame     frames globales (por defecto 0). Una celda por frame, con su número debajo.
//   --segment   nombre de un marker; con --at, frames LOCALES del segmento (frame global = tm + k). Sin --at, el primero, el medio y el último.
//   --map       color de autoría → color final ({ "#1b1b1f": "#ffffff" }): ver variantes de paleta o el modo oscuro sin re-exportar.
//   --size      lado de cada celda en px (400). --cols: celdas por fila (hasta 4).
// Necesita: Chrome o Chromium ($CHROME, o google-chrome/chromium en el PATH) y lottie_light.min.js (--lottie-light, $LOTTIE_LIGHT o
// node_modules/lottie-web/build/player/lottie_light.min.js: `npm i lottie-web@5.13.0` en el proyecto). Sin alguno de los dos sale 1 y lo dice.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromeDom, chromeShot, findChrome, findLottieLight, isMain, loadJson } from './lib.mjs';
import { recolorMap } from './recolor.mjs';

const LABEL_H = 26;
const GAP = 10;
const PAD = 10;

// HTML con una celda por frame; cada una carga su propia copia de la animación y hace goToAndStop.
export function renderPage(json, { frames, labels, size, bg, cols, player }) {
  const data = JSON.stringify(json).replace(/</g, '\\u003c');
  const cells = frames.map((f, i) => `<figure><div id="c${i}"></div><figcaption>${labels?.[i] ?? `f${f}`}</figcaption></figure>`).join('');
  return `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:${PAD}px;background:${bg}">
<style>div.g{display:grid;grid-template-columns:repeat(${cols},${size}px);gap:${GAP}px}figure{margin:0;width:${size}px}figure div{width:${size}px;height:${size}px;outline:1px dashed #b5b5b5;outline-offset:-1px}
figcaption{font:13px/${LABEL_H}px monospace;color:#555;height:${LABEL_H}px}</style>
<div class="g">${cells}</div>
<script src="${pathToFileURL(player).href}"></script>
<script>
const DATA = ${data};
${JSON.stringify(frames)}.forEach((f, i) => {
  const a = lottie.loadAnimation({ container: document.getElementById('c' + i), renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(DATA)) });
  a.goToAndStop(f, true);
});
</script>`;
}

// → { png, frames }
export function renderFrames(json, { out, frames = [0], labels, size = 400, bg = '#ffffff', cols, lottieLight, chrome = findChrome() }) {
  const player = findLottieLight(lottieLight);
  if (!chrome) throw new Error('Chrome/Chromium not found: set $CHROME');
  if (!player) throw new Error('lottie_light.min.js not found: npm i lottie-web@5.13.0, or pass --lottie-light / $LOTTIE_LIGHT');
  const c = Math.min(cols ?? 4, frames.length);
  const rows = Math.ceil(frames.length / c);
  const w = c * size + (c - 1) * GAP + 2 * PAD;
  const h = rows * (size + LABEL_H) + (rows - 1) * GAP + 2 * PAD;
  chromeShot(chrome, renderPage(json, { frames, labels, size, bg, cols: c, player }), out, w, h);
  return { png: out, frames };
}

// [segmento, 'start' | 'end', frame global] de cada comprobación. `offStart`: segmentos que empiezan fuera de reposo por diseño (no se mide su inicio).
export function restProbes(json, offStart = []) {
  return (json.markers ?? []).flatMap((m) => [...(offStart.includes(m.cm) ? [] : [[m.cm, 'start', m.tm]]), [m.cm, 'end', m.tm + m.dr]]);
}

// Página que, por cada comprobación, monta una copia limpia, guarda el SVG del frame 0, salta al frame pedido y compara. Escribe <pre id="res">.
export function restPage(json, probes, player) {
  const data = JSON.stringify(json).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><body><script src="${pathToFileURL(player).href}"></script>
<script>
const DATA = ${data};
const res = ${JSON.stringify(probes)}.map(([seg, at, f]) => {
  const box = document.createElement('div'); document.body.appendChild(box);
  const a = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(DATA)) });
  a.goToAndStop(0, true); const rest = box.innerHTML; a.goToAndStop(f, true);
  return seg + ' ' + at + ' f' + f + ' ' + (box.innerHTML === rest ? 'SAME' : 'DIFF');
});
const pre = document.createElement('pre'); pre.id = 'res'; pre.textContent = res.join('\\n'); document.body.appendChild(pre);
</script>`;
}

// → líneas "segmento start|end fN SAME|DIFF"
export function restCheck(json, { offStart, lottieLight, chrome = findChrome() } = {}) {
  const player = findLottieLight(lottieLight);
  if (!chrome) throw new Error('Chrome/Chromium not found: set $CHROME');
  if (!player) throw new Error('lottie_light.min.js not found: npm i lottie-web@5.13.0, or pass --lottie-light / $LOTTIE_LIGHT');
  const dom = chromeDom(chrome, restPage(json, restProbes(json, offStart), player));
  const rows = /<pre id="res">([\s\S]*?)<\/pre>/.exec(dom)?.[1];
  if (!rows) throw new Error('the page wrote no result (did lottie_light load?)');
  return rows.split('\n');
}

const list = (s) => s.split(',').map((x) => +x.trim());

function main(argv) {
  const { values: o, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      frame: { type: 'string' }, segment: { type: 'string' }, at: { type: 'string' }, size: { type: 'string' }, out: { type: 'string' },
      'lottie-light': { type: 'string' }, map: { type: 'string' }, bg: { type: 'string' }, cols: { type: 'string' },
      views: { type: 'string' }, 'rest-check': { type: 'boolean' }, parts: { type: 'string' },
    },
  });
  if (!positionals[0] || (o.frame && o.segment) || (o.views && (o.frame || o.segment || o['rest-check']))) {
    console.error('uso: node SK/scripts/render.mjs <anim.json> [--frame 0,30 | --segment nombre [--at 0,18] | --views parts.json] [--size 400] [--out out.png] [--lottie-light ruta] [--map mapa.json] [--bg "#fff"] [--cols 4]\n     | node SK/scripts/render.mjs <anim.json> --rest-check [--parts parts.json] [--lottie-light ruta]');
    return 2;
  }
  let json = loadJson(positionals[0]);
  if (o['rest-check']) {
    const off = o.parts ? Object.entries(loadJson(o.parts).plan?.keys ?? {}).filter(([, d]) => d.offPoseStart?.length).map(([k]) => k) : [];
    const rows = restCheck(json, { offStart: off, lottieLight: o['lottie-light'] });
    console.log(rows.join('\n'));
    const diff = rows.filter((r) => r.endsWith('DIFF'));
    if (diff.length) console.error(`FAIL rest-check: ${diff.length} frame(s) differ from rest:\n${diff.join('\n')}`);
    else console.log(`ok rest-check: ${rows.length} frames equal the rest frame`);
    return diff.length ? 1 : 0;
  }
  if (o.map) json = recolorMap(json, loadJson(o.map));
  let frames = o.frame ? list(o.frame) : [0];
  let labels;
  if (o.views) {
    const views = loadJson(o.views).views;
    if (!views) throw new Error(`no "views" in ${o.views}`);
    const cells = [['neutral (f0)', 0]];
    for (const [seg, fs] of Object.entries(views)) {
      const m = json.markers?.find((x) => x.cm === seg);
      if (!m) throw new Error(`views: marker "${seg}" not found (have: ${(json.markers ?? []).map((x) => x.cm).join(', ')})`);
      for (const k of fs) cells.push([`${seg} +${k} (f${m.tm + k})`, m.tm + k]);
    }
    labels = cells.map((c) => c[0]);
    frames = cells.map((c) => c[1]);
  }
  if (o.segment) {
    const m = json.markers?.find((x) => (x.cm ?? x.name) === o.segment);
    if (!m) throw new Error(`marker "${o.segment}" not found (have: ${(json.markers ?? []).map((x) => x.cm).join(', ')})`);
    const at = o.at ? list(o.at) : [0, Math.round(m.dr / 2), m.dr];
    frames = at.map((k) => m.tm + k);
    labels = at.map((k, i) => `${o.segment} +${k} (f${frames[i]})`);
  }
  const out = o.out ?? positionals[0].replace(/\.json$/, '.png');
  renderFrames(json, { out, frames, labels, size: o.size ? +o.size : undefined, bg: o.bg, cols: o.cols ? +o.cols : undefined, lottieLight: o['lottie-light'] });
  console.log(`ok ${out} (frames ${frames.join(', ')})`);
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
