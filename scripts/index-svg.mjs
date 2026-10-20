// index-svg: dibuja el número de índice de cada elemento sobre el SVG donante, para decidir qué índices forman cada pieza.
// Uso: node SK/scripts/index-svg.mjs <donante.svg> [--out index.html] [--png index.png] [--size 1000]
//   Escribe un HTML (por defecto <donante>.index.html) y, con --png, una captura (Chrome headless: $CHROME o google-chrome/chromium).
//   Ábrelo en un navegador o mira el PNG: cada elemento lleva su número (el mismo que usa `indices` de parts.json y `build-parts --list`).
//   En el HTML: pasar el ratón por una fila resalta el elemento; el campo "solo estos" (p. ej. `12-15, 20`) oculta el resto para
//   ver cómo quedaría una pieza antes de escribirla en parts.json.
// El navegador cuenta path, circle, ellipse, rect, polygon y polyline en orden de documento, sin <defs> ni <line>; el HTML avisa si su
// cuenta no coincide con la de build-parts (entonces algún elemento no está soportado y los índices no valdrían).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { elements } from './build-parts.mjs';
import { chromeShot, findChrome, isMain } from './lib.mjs';

const PANEL = 380;

// → HTML de la página con el SVG en línea. `size` = ancho del dibujo en px.
export function indexPage(svgText, size = 1000, title = 'donante') {
  const expected = elements(svgText).length; // lanza si el SVG usa algo no soportado: mejor saberlo ya
  const art = svgText.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/i, '');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Índices de ${title.replace(/[<&]/g, '')}</title>
<style>
body{margin:0;display:flex;gap:16px;align-items:flex-start;font:14px/1.4 system-ui,sans-serif;color:#1b1b1f;background:#f4f4f6}
#art{position:relative;width:${size}px;flex:none;background:#fff}#art>svg{display:block;width:100%;height:auto}
#art .n{position:absolute;transform:translate(-50%,-50%);padding:0 4px;border-radius:9px;color:#fff;font:600 11px/16px system-ui,sans-serif;pointer-events:none;box-shadow:0 0 0 1.5px #fff}
aside{width:${PANEL}px;flex:none;padding:12px 0;max-height:100vh;overflow:auto}
aside h1{font-size:16px;margin:0 0 8px}aside input{width:100%;box-sizing:border-box;padding:6px 8px;font:inherit}
#warn{display:none;margin:8px 0;padding:8px;background:#fde7e7;color:#8a1111;border-radius:4px}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{padding:2px 6px;text-align:left;border-bottom:1px solid #ddd;font:12px/1.5 ui-monospace,monospace}
tr:hover{background:#e6eefc}i.sw{display:inline-block;width:12px;height:12px;border:1px solid #666;vertical-align:-2px;margin-right:4px}
</style>
<div id="art">${art}<div id="labels"></div></div>
<aside><h1>Índices de ${title.replace(/[<&]/g, '')}</h1>
<label>Solo estos (p. ej. 12-15, 20): <input id="only" placeholder="todos"></label>
<div id="warn"></div><div id="count"></div>
<table><thead><tr><th>#</th><th>tag</th><th>relleno</th><th>bbox x y w h</th></tr></thead><tbody id="rows"></tbody></table></aside>
<script>
const EXPECTED = ${expected};
const art = document.getElementById('art'), svg = art.querySelector('svg'), labels = document.getElementById('labels');
if (!svg.getAttribute('viewBox')) { const b = svg.getBBox(); svg.setAttribute('viewBox', [b.x, b.y, b.width, b.height].join(' ')); }
const els = [...svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline')].filter((e) => !e.closest('defs'));
if (els.length !== EXPECTED) {
  const w = document.getElementById('warn');
  w.style.display = 'block';
  w.textContent = 'El navegador cuenta ' + els.length + ' elementos y build-parts ' + EXPECTED + ': los índices de aquí no sirven hasta que coincidan.';
}
const ar = art.getBoundingClientRect(), tags = [], rows = document.getElementById('rows'), placed = [];
// Relleno y aro comparten centro: cada número busca, en anillos alrededor de su centro, el primer sitio libre (así se leen todos).
const FREE = (() => { const o = []; for (let k = 0; k < 6; k++) for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === k) o.push([dx * 28, dy * 17]); return o; })();
els.forEach((e, i) => {
  const r = e.getBoundingClientRect(), b = e.getBBox(), fill = getComputedStyle(e).fill;
  const n = document.createElement('span');
  n.className = 'n'; n.textContent = i; n.style.background = 'hsl(' + ((i * 47) % 360) + ' 70% 32%)';
  const cx = r.left - ar.left + r.width / 2, cy = r.top - ar.top + r.height / 2;
  const [ox, oy] = FREE.find(([dx, dy]) => !placed.some(([px, py]) => Math.abs(px - cx - dx) < 27 && Math.abs(py - cy - dy) < 16)) ?? [0, 0];
  placed.push([cx + ox, cy + oy]);
  n.style.left = cx + ox + 'px'; n.style.top = cy + oy + 'px';
  labels.appendChild(n); tags.push(n);
  const tr = document.createElement('tr');
  tr.innerHTML = '<td>' + i + '</td><td>' + e.tagName + '</td><td><i class="sw" style="background:' + fill + '"></i>' + fill + '</td><td>' + [b.x, b.y, b.width, b.height].map(Math.round).join(' ') + '</td>';
  tr.onmouseenter = () => { e.dataset.s = e.getAttribute('style') || ''; e.style.stroke = '#ff00aa'; e.style.strokeWidth = '6px'; };
  tr.onmouseleave = () => { e.setAttribute('style', e.dataset.s); };
  rows.appendChild(tr);
});
function show() {
  const want = new Set();
  const txt = document.getElementById('only').value.trim();
  for (const t of txt.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [a, b = a] = t.split('-').map(Number);
    for (let k = a; k <= b; k++) want.add(k);
  }
  els.forEach((e, i) => { const on = !txt || want.has(i); e.style.display = on ? '' : 'none'; tags[i].style.display = on ? '' : 'none'; });
  document.getElementById('count').textContent = (txt ? want.size + ' elementos visibles de ' : '') + els.length + ' elementos';
}
document.getElementById('only').oninput = show;
show();
</script>`;
}

function main(argv) {
  const { values: o, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' }, png: { type: 'string' }, size: { type: 'string' } } });
  if (!positionals[0]) {
    console.error('uso: node SK/scripts/index-svg.mjs <donante.svg> [--out index.html] [--png index.png] [--size 1000]');
    return 2;
  }
  const size = o.size ? +o.size : 1000;
  const html = indexPage(readFileSync(positionals[0], 'utf8'), size, positionals[0].split(/[\\/]/).at(-1));
  const out = o.out ?? positionals[0].replace(/\.svg$/, '') + '.index.html';
  writeFileSync(out, html);
  console.log(`ok ${out}`);
  if (o.png) {
    const chrome = findChrome();
    if (!chrome) throw new Error('--png needs Chrome/Chromium: set $CHROME');
    chromeShot(chrome, html, o.png, size + PANEL + 48, size + 40);
    console.log(`ok ${o.png}`);
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
