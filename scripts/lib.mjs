// Ayudas compartidas por los scripts del skill. Solo biblioteca estándar de Node 20+.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// true si `metaUrl` (import.meta.url) es el script que se ejecutó; también cuando se llega por un symlink.
export const isMain = (metaUrl) => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- colores
// '#FFF' → '#ffffff'; lo que no es #hex se deja igual.
export const normHex = (c) => (c.startsWith('#') ? c.toLowerCase().replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : c);
// [r, g, b, (a)] en 0..1 → '#rrggbb' (redondea a 8 bits, igual que check-lottie y recolor)
export const toHex = (k) => '#' + k.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
// '#rrggbb' → [r, g, b, 1] con 4 decimales (así los escribe Creator: 0.0824 → 21 → #151515)
export const hex2c = (h) => [1, 3, 5].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)).concat(1);

// JSON legible: indentado, pero los arreglos de números (claves de animación, puntos) en una sola línea.
export const compactJson = (v) =>
  JSON.stringify(v, (k, x) => (Array.isArray(x) && x.every((y) => typeof y === 'number' || (typeof y === 'string' && y.length < 8)) ? `@@${JSON.stringify(x)}@@` : x), 1).replace(/"@@(.*?)@@"/g, (_, s) => s.replace(/\\"/g, '"'));

// El gate NO mide el grosor del contorno: el generador sí. Falla si algún trazo de la tinta `ink` mide menos de `min`
// (4 en personajes, 5 en props, a 1000 px de lienzo). parts = [{ name, svg }] con `stroke="<ink>" stroke-width="N"` en ese orden.
export function checkInkStroke(parts, ink, min) {
  for (const p of parts)
    for (const [, w] of (p.svg ?? '').matchAll(new RegExp(`stroke="${ink}" stroke-width="([\\d.]+)"`, 'g')))
      if (+w < min) throw new Error(`${p.name}: ink stroke ${w} < ${min}`);
}

// ---------------------------------------------------------------- búsqueda de archivos y programas
// roles.json: al lado del archivo dado, una carpeta arriba o en la carpeta actual.
export function findRoles(fromFile) {
  const d = dirname(resolve(fromFile));
  return [join(d, 'roles.json'), join(d, '..', 'roles.json'), resolve('roles.json')].find((p) => existsSync(p));
}

const PLAYER = 'node_modules/lottie-web/build/player/lottie_light.min.js';
// lottie_light.min.js: --lottie-light, $LOTTIE_LIGHT, node_modules de la carpeta actual o de sus padres. null si no hay.
export function findLottieLight(flag) {
  const given = flag ?? process.env.LOTTIE_LIGHT;
  if (given) {
    if (!existsSync(given)) throw new Error(`lottie_light.min.js not found at ${given}`);
    return resolve(given);
  }
  for (let d = resolve('.'); ; d = dirname(d)) {
    if (existsSync(join(d, PLAYER))) return join(d, PLAYER);
    if (dirname(d) === d) return null;
  }
}

const CHROME_NAMES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome', 'microsoft-edge'];
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
// $CHROME, un binario conocido en el PATH o una ruta típica. null si no hay.
export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean))
    for (const name of CHROME_NAMES) for (const e of exts) if (existsSync(join(dir, name + e))) return join(dir, name + e);
  return CHROME_PATHS.find((p) => existsSync(p)) ?? null;
}

// Opciones de Chrome headless con perfil propio y temporal (no toca el del usuario).
// `virtual-time-budget`: Chrome deja correr los scripts (lottie, medidas) antes de capturar o volcar el DOM.
const headless = (dir, budget) => ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${join(dir, 'profile')}`, '--allow-file-access-from-files', '--hide-scrollbars', `--virtual-time-budget=${budget}`];

// Abre `html` en Chrome headless y guarda la captura.
export function chromeShot(chrome, html, png, width, height, budget = 5000) {
  const dir = mkdtempSync(join(tmpdir(), 'lottie-chrome-'));
  try {
    const file = join(dir, 'page.html');
    writeFileSync(file, html);
    execFileSync(chrome, [...headless(dir, budget), `--window-size=${width},${height}`, `--screenshot=${resolve(png)}`, pathToFileURL(file).href], { stdio: 'ignore', timeout: 90_000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (!existsSync(png)) throw new Error(`Chrome did not write ${png}`);
}

// Abre `html` en Chrome headless y devuelve el DOM final (--dump-dom): para leer lo que la propia página escribe (resultados de medidas).
export function chromeDom(chrome, html, budget = 3000) {
  const dir = mkdtempSync(join(tmpdir(), 'lottie-chrome-'));
  try {
    const file = join(dir, 'page.html');
    writeFileSync(file, html);
    return execFileSync(chrome, [...headless(dir, budget), '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 90_000, maxBuffer: 1 << 28 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
