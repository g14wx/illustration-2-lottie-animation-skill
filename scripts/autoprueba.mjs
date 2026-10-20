// autoprueba: comprueba que el skill funciona en esta máquina. Solo Node 20+ (y python3 para probar instalar.py, si hay).
// Uso: node SK/scripts/autoprueba.mjs [--salida carpeta] [--sin-unitarias]
//   1. Corre todos los *.test.mjs (node:test).
//   2. Corre la cadena completa sobre los fixtures sintéticos, en una copia temporal:
//      index-svg → build-parts → export-lottie → check-lottie (PASA) → los fixtures malos (FALLAN) → recolor → split-roles → reskin
//      → render → galería → plantillas y ejemplo → instalar.py en un HOME de prueba.
//   Lo que necesita Chrome o lottie_light.min.js se OMITE con una línea clara si falta (LOTTIE_LIGHT=<ruta> o `npm i lottie-web@5.13.0`).
//   --salida deja los resultados (PNG, HTML, Lottie) en esa carpeta para mirarlos; sin ella se usa una temporal que se borra.
// Sale con código distinto de 0 si algo falla, e imprime una línea final con el resumen.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findChrome, findLottieLight, loadJson } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: opt } = parseArgs({ options: { salida: { type: 'string' }, 'sin-unitarias': { type: 'boolean' } } });
const count = { ok: 0, skip: 0, fail: 0 };
const say = (kind, msg) => {
  count[kind]++;
  console.log(`${{ ok: 'ok  ', skip: 'SKIP', fail: 'FAIL' }[kind]} ${msg}`);
};
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
function step(name, fn) {
  try {
    const r = fn();
    if (r?.skip) say('skip', `${name}: ${r.skip}`);
    else say('ok', r ? `${name} (${r})` : name);
  } catch (e) {
    say('fail', `${name}: ${e.message.split('\n').slice(0, 6).join(' | ')}`);
  }
}

const chrome = findChrome();
let player = null;
try {
  player = findLottieLight();
} catch {
  /* una ruta mala en LOTTIE_LIGHT se avisa abajo */
}
const canRender = chrome && player;
const whyNot = !chrome ? 'no hay Chrome ni Chromium (variable CHROME)' : 'no hay lottie_light.min.js (LOTTIE_LIGHT=<ruta> o npm i lottie-web@5.13.0)';

// ---------------------------------------------------------------- 1. pruebas unitarias
if (!opt['sin-unitarias']) {
  step('node --test (todos los *.test.mjs)', () => {
    const files = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.test.mjs')).map((f) => join(ROOT, 'scripts', f));
    // Un solo Chrome a la vez: sin esto node corre los archivos de prueba en paralelo. La opción existe desde Node 20.10.
    const [maj, min] = process.versions.node.split('.').map(Number);
    const serial = maj > 20 || (maj === 20 && min >= 10) ? ['--test-concurrency=1'] : [];
    const r = spawnSync(process.execPath, ['--test', ...serial, ...files], { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 26 });
    const n = (k) => +(new RegExp(`(?:ℹ|#) ${k} (\\d+)`).exec(r.stdout)?.[1] ?? NaN);
    if (r.status !== 0) throw new Error(`${n('fail')} fallan de ${n('tests')}\n${(r.stdout.match(/✖[^\n]*/g) ?? []).slice(0, 5).join(' | ')}`);
    return `${n('pass')} pruebas, ${n('skipped')} omitidas`;
  });
}

// ---------------------------------------------------------------- 2. cadena de punta a punta
const keep = opt.salida && resolve(opt.salida);
const work = keep ?? mkdtempSync(join(tmpdir(), 'autoprueba-'));
mkdirSync(work, { recursive: true });
cpSync(join(ROOT, 'fixtures'), work, { recursive: true });
const run = (script, ...args) => {
  const r = spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8', cwd: work, maxBuffer: 1 << 26 });
  return { ...r, all: `${r.stdout}${r.stderr}`.trim() };
};
const must0 = (r, what) => must(r.status === 0, `${what} salió ${r.status}: ${r.all.split('\n').slice(0, 3).join(' | ')}`);
const png = (p) => existsSync(p) && statSync(p).size > 3000 && readFileSync(p).subarray(1, 4).toString() === 'PNG';
const roles = join(work, 'roles.json');
const names = ['persona', 'reloj'];

try {
  for (const n of names) {
    const spec = join(work, n, 'parts.json');
    step(`${n}: index-svg escribe el HTML de índices${chrome ? ' y su PNG' : ''}`, () => {
      const r = run('scripts/index-svg.mjs', join(work, 'donors', `${n}.svg`), '--out', join(work, `${n}.index.html`), ...(chrome ? ['--png', join(work, `${n}.index.png`)] : []));
      must0(r, 'index-svg');
      must(/const EXPECTED = \d+;/.test(readFileSync(join(work, `${n}.index.html`), 'utf8')), 'el HTML no lleva la cuenta de elementos');
      if (chrome) must(png(join(work, `${n}.index.png`)), 'el PNG de índices está vacío');
    });
    step(`${n}: build-parts saca una pieza por SVG`, () => {
      const r = run('scripts/build-parts.mjs', spec);
      must0(r, 'build-parts');
      return r.stdout.trim().replace(work, '.');
    });
    step(`${n}: export-lottie exporta y pasa el gate`, () => {
      const r = run('scripts/export-lottie.mjs', spec);
      must0(r, 'export-lottie');
      return r.stdout.trim().replace(/ → .*/, '');
    });
    step(`${n}: check-lottie PASA con roles.json y parts.json`, () => must0(run('scripts/check-lottie.mjs', join(work, n, `${n}.json`), '--roles', roles, '--parts', spec), 'check-lottie'));
  }

  step('check-lottie: el válido pasa y cada fixture malo FALLA', () => {
    const dir = join(work, 'check');
    must0(run('scripts/check-lottie.mjs', join(dir, 'valid.json'), '--roles', roles, '--parts', join(dir, 'parts.json')), 'valid.json');
    const bad = readdirSync(dir).filter((f) => f.startsWith('bad-'));
    for (const f of bad) must(run('scripts/check-lottie.mjs', join(dir, f), '--roles', roles, '--parts', join(dir, 'parts.json')).status === 1, `${f} debía fallar`);
    return `${bad.length} malos`;
  });

  const persona = join(work, 'persona/persona.json');
  step('recolor: otra paleta sin tocar el original (modo oscuro por --map)', () => {
    const before = readFileSync(persona, 'utf8');
    writeFileSync(join(work, 'oscuro.json'), JSON.stringify({ '#1b1b1f': '#ffffff', '#ffffff': '#292929', '#3366cc': '#92b4f2' }));
    must0(run('scripts/recolor.mjs', persona, '--map', join(work, 'oscuro.json'), '--out', join(work, 'persona-oscuro.json')), 'recolor');
    const dark = readFileSync(join(work, 'persona-oscuro.json'), 'utf8');
    must(dark !== before && readFileSync(persona, 'utf8') === before, 'recolor tocó el original o no cambió nada');
    must(JSON.parse(dark).layers.find((l) => l.nm === 'torso').shapes.some((s) => JSON.stringify(s).includes('0.5725')), 'el torso no pasó al azul claro (#92b4f2 → 0.5725)');
  });

  step('recolor --vars: tokens → valores de un tema', () => {
    writeFileSync(join(work, 'vars.json'), JSON.stringify({ '--illus-brand': '#0f7a5a' }));
    must0(run('scripts/recolor.mjs', persona, '--vars', join(work, 'vars.json'), '--out', join(work, 'persona-verde.json')), 'recolor --vars');
  });

  step('split-roles: zapatos con rol propio; el Lottie cambiado pasa el gate con el roles.json nuevo', () => {
    const copy = join(work, 'split');
    cpSync(join(work, 'persona'), copy, { recursive: true });
    cpSync(roles, join(copy, 'roles.json'));
    writeFileSync(join(copy, 'split.json'), JSON.stringify({ splits: [{ from: '#8d8d95', to: '#6b6b73', token: '--illus-shoe', parts: ['shoeL', 'shoeR'] }] }));
    must0(run('scripts/split-roles.mjs', join(copy, 'split.json'), '--spec', join(copy, 'parts.json'), '--lottie', join(copy, 'persona.json'), '--roles', join(copy, 'roles.json')), 'split-roles');
    must0(run('scripts/check-lottie.mjs', join(copy, 'persona.json'), '--roles', join(copy, 'roles.json'), '--parts', join(copy, 'parts.json')), 'check tras split');
    must(loadJson(join(copy, 'roles.json'))['#6b6b73'] === '--illus-shoe', 'roles.json no recibió el rol nuevo');
  });

  step('reskin: el dibujo de otra variante sobre el rig animado, sin tocar la animación', () => {
    const out = join(work, 'persona-b.json');
    const r = run('scripts/reskin.mjs', persona, join(work, 'persona-oscuro.json'), out);
    must0(r, 'reskin');
    const a = loadJson(persona), b = loadJson(out);
    must(JSON.stringify(a.markers) === JSON.stringify(b.markers) && b.nm === 'persona-b', 'markers o nombre cambiaron');
    must(/replaced 25:/.test(r.stderr) && /missing 0:/.test(r.stderr), `reskin reportó: ${r.stderr.split('\n')[0]}`);
  });

  step('render: frames del Lottie con el player real (lottie_light) en Chrome', () => {
    if (!canRender) return { skip: whyNot };
    const out = join(work, 'persona-wave.png');
    must0(run('scripts/render.mjs', persona, '--segment', 'wave', '--at', '0,16,40', '--size', '320', '--out', out), 'render');
    must(png(out), 'el PNG está vacío o no es PNG');
    const dark = join(work, 'persona-oscuro.png');
    must0(run('scripts/render.mjs', persona, '--frame', '0', '--size', '320', '--map', join(work, 'oscuro.json'), '--bg', '#292929', '--out', dark), 'render --map');
    must(png(dark), 'el PNG oscuro está vacío');
    return out.replace(work, '.');
  });

  step('galería: build-galeria arma UN html y, con Chrome, se abre y monta las tarjetas', () => {
    writeFileSync(join(work, 'manifiesto.json'), JSON.stringify({ title: 'Autoprueba', roles: 'roles.json', palettes: join(ROOT, 'plantillas/paletas.ejemplo.json'), assets: names.map((n) => ({ id: n, label: n, json: `${n}/${n}.json` })) }));
    const out = join(work, 'galeria.html');
    must0(run('plantillas/build-galeria.mjs', join(work, 'manifiesto.json'), '--out', out, ...(player ? ['--player', player] : [])), 'build-galeria');
    if (!canRender) return `${(statSync(out).size / 1024).toFixed(0)} KB; sin abrirla (${whyNot})`;
    const dom = spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--user-data-dir=${join(work, 'chrome-profile')}`, '--allow-file-access-from-files', '--virtual-time-budget=4000', '--dump-dom', `file://${out}`], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000 });
    must(/data-ready="2"/.test(dom.stdout) && !/data-error/.test(dom.stdout), 'la galería no montó las 2 tarjetas');
  });

  step('plantillas y ejemplos: parts.ejemplo.json, bombilla.mjs y extremidades.mjs exportan y pasan el gate', () => {
    const ej = join(work, 'ejemplo');
    mkdirSync(ej, { recursive: true });
    cpSync(join(ROOT, 'plantillas/parts.ejemplo.json'), join(ej, 'parts.json'));
    cpSync(join(ROOT, 'plantillas/roles.ejemplo.json'), join(ej, 'roles.json'));
    must0(run('scripts/export-lottie.mjs', join(ej, 'parts.json'), '--name', 'pelota'), 'parts.ejemplo.json');
    const b = join(work, 'bombilla');
    must0(run('ejemplos/bombilla.mjs', b), 'bombilla.mjs');
    must0(run('scripts/export-lottie.mjs', join(b, 'parts.json'), '--roles', join(ej, 'roles.json'), '--name', 'bombilla'), 'export de la bombilla');
    const x = join(work, 'extremidades');
    must0(run('ejemplos/extremidades.mjs', x), 'extremidades.mjs');
    must0(run('scripts/export-lottie.mjs', join(x, 'parts.json'), '--roles', join(ej, 'roles.json'), '--name', 'brazo'), 'export del brazo');
  });

  step('instalar.py: --revisar, enlace en un HOME de prueba sin pisar a otro skill, copia y --quitar', () => {
    const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
    if (py.error || py.status !== 0) return { skip: 'no hay python3' };
    const home = join(work, 'home');
    for (const d of ['.claude', '.codex']) mkdirSync(join(home, d), { recursive: true });
    const ajeno = join(home, '.codex/skills/animate-illustrations-with-lottie');
    mkdirSync(ajeno, { recursive: true });
    writeFileSync(join(ajeno, 'SKILL.md'), '---\nname: otro-skill\n---\n');
    const inst = (...a) => spawnSync('python3', [join(ROOT, 'instalar.py'), '--home', home, ...a], { encoding: 'utf8' });
    const rv = inst('--revisar');
    must(rv.status === 0 && /node +ok/.test(rv.stdout), `--revisar: ${rv.stdout}${rv.stderr}`);
    const r = inst();
    const enlace = join(home, '.claude/skills/animate-illustrations-with-lottie');
    must(r.status === 0 && existsSync(enlace) && /SALTADO/.test(r.stdout) && readFileSync(join(ajeno, 'SKILL.md'), 'utf8').includes('otro-skill'), `instalar: ${r.stdout}${r.stderr}`);
    // correrlo POR el enlace ya instalado no debe dejar un enlace que apunta a sí mismo
    const via = spawnSync('python3', [join(enlace, 'instalar.py'), '--home', home, '--solo', 'claude'], { encoding: 'utf8' });
    must(via.status === 0 && existsSync(join(enlace, 'SKILL.md')), `instalar.py por el enlace dejó el destino roto: ${via.stdout}${via.stderr}`);
    const q = inst('--quitar');
    must(q.status === 0 && !existsSync(enlace) && existsSync(ajeno), `--quitar: ${q.stdout}${q.stderr}`);
    if (!existsSync(join(ROOT, 'SKILL.md'))) return 'sin SKILL.md todavía: no se probó --copiar';
    const c = inst('--solo', 'claude', '--copiar');
    must(c.status === 0 && existsSync(join(enlace, 'SKILL.md')) && !existsSync(join(enlace, '.git')), `--copiar: ${c.stdout}${c.stderr}`);
    inst('--quitar');
    must(!existsSync(enlace), '--quitar no borró la copia');
    // el repo clonado justo en un destino: ni instalar ni --quitar pueden borrar la carpeta (se perdería el repo con su .git)
    const home2 = join(work, 'home2');
    const clon = join(home2, '.claude/skills/animate-illustrations-with-lottie');
    mkdirSync(join(clon, '.git'), { recursive: true });
    cpSync(join(ROOT, 'instalar.py'), join(clon, 'instalar.py'));
    writeFileSync(join(clon, 'SKILL.md'), '---\nname: animate-illustrations-with-lottie\n---\n');
    writeFileSync(join(clon, '.git/HEAD'), 'ref: refs/heads/main\n');
    for (const args of [[], ['--copiar'], ['--solo', 'claude'], ['--quitar']]) {
      const r2 = spawnSync('python3', [join(clon, 'instalar.py'), '--home', home2, ...args], { encoding: 'utf8' });
      must(r2.status === 0 && statSync(clon).isDirectory() && !lstatSync(clon).isSymbolicLink() && existsSync(join(clon, '.git/HEAD')) && existsSync(join(clon, 'SKILL.md')), `instalar.py ${args.join(' ')} desde un clon en el destino rompió la carpeta: ${r2.stdout}${r2.stderr}`);
    }
  });
} finally {
  if (keep) console.log(`resultados en ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

console.log(`\nautoprueba: ${count.ok} ok, ${count.skip} omitidas, ${count.fail} con falla`);
process.exitCode = count.fail ? 1 : 0;
