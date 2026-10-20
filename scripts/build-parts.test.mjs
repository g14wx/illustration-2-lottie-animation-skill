// build-parts: clases inlineadas, <line> fuera del índice, colores por paleta, errores en voz alta y el CLI sobre el donante sintético.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildParts, colorRows, elements, listRows } from './build-parts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../fixtures');
const script = join(here, 'build-parts.mjs');

const donor = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><style>.cls-1{fill:#FC7272;}.cls-2{fill:#fff;}</style><clipPath id="c"><rect x="0" y="0" width="9" height="9"/></clipPath></defs>
<polyline class="cls-1" points="10 20 110 220 60 120"/>
<line class="cls-2" x1="0" y1="0" x2="5" y2="5"/>
<path d="M0,0L10,10Z"/>
<path class="cls-2" d="M1,1L2,2Z"/>
<circle cx="500" cy="400" r="10"/>
<rect class="cls-1" x="5" y="6" width="20" height="30" transform="rotate(5)"/></svg>`;
const palette = { '#fc7272': '#3366cc', '#ffffff': '#ffffff', '#000000': '#1b1b1f' };
const spec = (parts, pal = palette) => ({ donors: { d: 'd.svg' }, palette: pal, parts });
const build = (parts, pal, roles, opts) => buildParts(spec(parts, pal), () => donor, roles, opts);

test('indexa en orden de documento sin <line> ni lo que hay en <defs>', () => {
  assert.deepEqual(elements(donor).map((e) => e.tag), ['polyline', 'path', 'path', 'circle', 'rect']);
});

test('inlinea la clase, expande #fff, el negro por defecto va a tinta y mapea por paleta', () => {
  const svg = build([{ name: 'a', donor: 'd', indices: [2, 1, 0] }]).a;
  assert.match(svg, /viewBox="0 0 1000 1000"/);
  assert.doesNotMatch(svg, /class=|<line|clipPath/);
  assert.deepEqual(svg.match(/<(path|polyline) fill="[^"]+"/g), ['<path fill="#ffffff"', '<path fill="#1b1b1f"', '<polyline fill="#3366cc"']);
});

test('colores fuera de la paleta: error que los lista todos', () => {
  assert.throws(() => build([{ name: 'a', donor: 'd', indices: [0, 1] }], { '#000000': '#1b1b1f' }), /colors not in palette: #fc7272/);
  assert.throws(() => build([{ name: 'a', donor: 'd', indices: [0, 2] }], {}), /#fc7272 \(a\[0\]\), #ffffff \(a\[2\]\)/); // y dice dónde se usa cada uno
  assert.throws(() => build([{ name: 'a', donor: 'd', indices: [0] }, { name: 'b', donor: 'd', indices: [4, 0] }], { '#000000': '#1b1b1f' }), /#fc7272 \(a\[0\], b\[4\], b\[0\]\)/);
});

test('pieza con svg propio, y errores de donante o índice', () => {
  assert.match(build([{ name: 'raw', svg: '<circle cx="1" cy="1" r="1" fill="#3366cc"/>' }]).raw, /<circle cx="1"/);
  assert.throws(() => build([{ name: 'a', donor: 'x', indices: [0] }]), /donor "x"/);
  assert.throws(() => build([{ name: 'a', donor: 'd', indices: [9] }]), /index 9 out of range/);
});

test('selector agrupado: cada clase de la lista recibe la regla', () => {
  const svg = '<svg><style>.cls-2,.cls-3,.cls-4{fill:#fc7272;}.cls-3{stroke:#fff;}</style><path class="cls-2" d="M0,0"/><path class="cls-3" d="M0,0"/><path class="cls-4" d="M0,0"/></svg>';
  assert.deepEqual(elements(svg).map((e) => [e.attrs.fill, e.attrs.stroke]), [['#fc7272', undefined], ['#fc7272', '#ffffff'], ['#fc7272', undefined]]);
});

test('lo que no sabe leer falla en voz alta en vez de caer al negro', () => {
  const el = (attrs, css = '.cls-1{fill:#fc7272;}') => elements(`<svg><style>${css}</style><path ${attrs} d="M0,0"/></svg>`);
  assert.throws(() => el('class="cls-9"'), /class "cls-9" on <path> has no rule/);
  assert.throws(() => el('fill="red"'), /unsupported fill "red"/);
  assert.throws(() => el('fill="rgb(1,2,3)"'), /unsupported fill/);
  assert.throws(() => el('stroke="url(#g)"'), /unsupported stroke/);
  assert.throws(() => el('class="cls-1" style="fill:#000"'), /style=""/);
  assert.throws(() => elements('<svg><g class="cls-1"><path d="M0,0"/></g></svg>'), /<g> with class/);
  assert.deepEqual(el('fill="none" stroke="#FFF"')[0].attrs, { fill: 'none', stroke: '#ffffff', d: 'M0,0' });
});

test('fill-rule y demás propiedades de la clase llegan al SVG de la pieza (aros evenodd de Illustrator)', () => {
  const svg = '<svg><style>.cls-1{fill-rule:evenodd;}</style><path class="cls-1" d="M0,0"/></svg>';
  const out = buildParts({ donors: { d: 'd' }, palette: { '#000000': '#1b1b1f' }, parts: [{ name: 'ring', donor: 'd', indices: [0] }] }, () => svg);
  assert.match(out.ring, /fill-rule="evenodd"/);
});

test('con roles: un valor de paleta que no es clave de roles.json es error', () => {
  const parts = [{ name: 'a', donor: 'd', indices: [0] }];
  assert.throws(() => build(parts, { '#fc7272': '#123456', '#000000': '#1b1b1f' }, { '#1b1b1f': '--ink' }), /palette values not in roles.json: #123456/);
  assert.ok(build(parts, { '#fc7272': '#123456', '#000000': '#1b1b1f' }).a);
});

test('palette propio de una pieza pisa al general solo en esa pieza (piel y pelo con rol propio)', () => {
  const roles = { '#3366cc': '--brand', '#f0c8a0': '--skin', '#1b1b1f': '--ink', '#ffffff': '--paper' };
  const files = build([{ name: 'skin', donor: 'd', indices: [0], palette: { '#fc7272': '#f0c8a0' } }, { name: 'shirt', donor: 'd', indices: [0] }], palette, roles);
  assert.match(files.skin, /fill="#f0c8a0"/);
  assert.match(files.shirt, /fill="#3366cc"/);
  assert.throws(() => build([{ name: 'x', donor: 'd', indices: [0], palette: { '#fc7272': '#abcdef' } }], palette, roles), /x: palette values not in roles.json/);
});

test('--nearest: el color sin regla se acerca al de roles más parecido y lo avisa', () => {
  const roles = { '#3366cc': '--brand', '#1b1b1f': '--ink', '#ffffff': '--paper' };
  const near = '<svg><style>.cls-1{fill:#3467cb;}</style><path class="cls-1" d="M0,0"/></svg>'; // casi el azul de marca
  const s = { donors: { d: 'd' }, palette: { '#000000': '#1b1b1f' }, parts: [{ name: 'p', donor: 'd', indices: [0] }] };
  assert.throws(() => buildParts(s, () => near, roles), /colors not in palette: #3467cb/);
  const log = [];
  assert.match(buildParts(s, () => near, roles, { nearest: true, log: (m) => log.push(m) }).p, /fill="#3366cc"/);
  assert.deepEqual(log, ['snapped #3467cb -> #3366cc']);
  assert.throws(() => buildParts(s, () => near, undefined, { nearest: true }), /needs roles.json/);
});

test('transform: espeja/escala/mueve las figuras del donante antes de escribir la pieza; el color sigue pasando por la paleta', async () => {
  const { bbox, pathToContours } = await import('./pathkit.mjs');
  const files = build([{ name: 'moved', donor: 'd', indices: [3], transform: { dx: 100, dy: 50, scale: 2 } }, { name: 'same', donor: 'd', indices: [3] }]);
  assert.match(files.moved, /<path d="[^"]+" fill="#1b1b1f"\/>/);
  const box = (svg) => bbox(pathToContours(/ d="([^"]+)"/.exec(svg)[1]));
  const [x0, y0, x1, y1] = box(files.moved);
  assert.ok(Math.abs(x0 - 580) < 0.2 && Math.abs(x1 - 620) < 0.2 && Math.abs(y0 - 430) < 0.2 && Math.abs(y1 - 470) < 0.2, `${[x0, y0, x1, y1]}`); // r 10 -> 20 desde el centro (500,400), +100,+50
  assert.match(files.same, /<circle fill="#1b1b1f" cx="500"/); // sin transform no se toca
  assert.throws(() => build([{ name: 'bad', donor: 'd', indices: [3], transform: { rotation: 5 } }]), /bad: unknown transform key\(s\) rotation/);
  assert.throws(() => build([{ name: 'raw', svg: '<circle cx="1" cy="1" r="1" fill="#3366cc"/>', transform: { scale: 2 } }]), /raw: transform needs donor and indices/);
});

test('--list: tag, fill y bbox exacto salvo en path; --colors cuenta por color', () => {
  const rows = listRows(donor);
  assert.equal(rows.length, 5);
  assert.match(rows[0], /polyline\s+#fc7272\s+bbox 10 20 110 220/);
  assert.match(rows[1], /path\s+#000000\s+d 11 chars/);
  assert.match(rows[3], /circle\s+#000000\s+bbox 490 390 510 410/);
  assert.match(rows[4], /rect\s+#fc7272\s+bbox 5 6 25 36 \(transform sin aplicar\)/);
  assert.deepEqual(colorRows(donor), ['#fc7272  2 elementos', '#000000  2 elementos', '#ffffff  1 elementos']); // el negro por defecto también cuenta
});

test('CLI sobre el donante sintético: una pieza por SVG y --out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bp-'));
  try {
    cpSync(fixtures, dir, { recursive: true });
    const r = spawnSync(process.execPath, [script, join(dir, 'persona/parts.json'), '--out', join(dir, 'salida')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^ok 25 parts/);
    assert.equal(readdirSync(join(dir, 'salida')).length, 25);
    assert.match(readFileSync(join(dir, 'salida/head.svg'), 'utf8'), /fill="#f0c8a0"/);
    const list = spawnSync(process.execPath, [script, '--list', join(dir, 'donors/persona.svg')], { encoding: 'utf8' });
    assert.equal(list.status, 0);
    assert.match(list.stdout, /ellipse/);
    const colors = spawnSync(process.execPath, [script, '--colors', join(dir, 'donors/persona.svg')], { encoding: 'utf8' });
    assert.match(colors.stdout, /#f6c9a5 +\d+ elementos/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin argumentos: uso y exit 2; por un symlink también corre', () => {
  assert.equal(spawnSync(process.execPath, [script]).status, 2);
  const dir = mkdtempSync(join(tmpdir(), 'bp-link-'));
  try {
    symlinkSync(script, join(dir, 'link.mjs'));
    const r = spawnSync(process.execPath, [join(dir, 'link.mjs')], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /uso:/);
    assert.ok(!existsSync(join(dir, 'parts')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un donante con otro viewBox avisa (una vez), sin fallar; con 0 0 1000 1000 no dice nada', () => {
  const msgs = [];
  const other = donor.replace('viewBox="0 0 1000 1000"', 'viewBox="0 0 800 600"');
  buildParts(spec([{ name: 'a', donor: 'd', indices: [3] }, { name: 'b', donor: 'd', indices: [3] }]), () => other, undefined, { log: (m) => msgs.push(m) });
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /donor "d" has viewBox "0 0 800 600"/);
  buildParts(spec([{ name: 'a', donor: 'd', indices: [3] }]), () => donor.replace('0 0 1000 1000', '0,0, 1000 1000'), undefined, { log: (m) => msgs.push(m) });
  assert.equal(msgs.length, 1);
});
