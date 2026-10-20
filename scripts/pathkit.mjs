// pathkit: mover, girar, espejar y escalar el dibujo de un donante para que encaje en el rig. Solo biblioteca estándar de Node 20+.
// Lo usan build-parts (campo `transform` de una pieza) y export-lottie (lee los paths). API:
//   pathToContours(d, prec)      path `d` → contornos bézier de Lottie [{ v, i, o, c }]  (i/o relativos a cada vértice)
//   contoursToD(contornos, prec) lo contrario: un `d` absoluto con M L C Z (los arcos ya son cúbicas)
//   matrix({ scale, rotate, mirror, dx, dy, about })  matriz [a b c d e f]: primero espejo (eje vertical por `about`), luego escala,
//                                luego giro en grados (+ = horario en pantalla) alrededor de `about`, al final se suma (dx, dy)
//   fitElements(els, t)          elements() de build-parts → los mismos elementos como <path> transformados (círculos, rect, polygon…
//                                pasan a path; `stroke-width` se escala con la figura); `about` por omisión = centro de la caja del conjunto
//   bbox(contornos)              [x0, y0, x1, y1] (muestrea las curvas: cota muy cercana, no exacta)
// Límites: no deforma (solo semejanza: mover, girar, espejar, escalar parejo). Para doblar una forma hay que trocear las curvas en tramos
// cortos y mover cada punto con una función; el caso real lo escribió a medida y aquí no hay herramienta.
// El espejo invierte el sentido de TODOS los subtrazos por igual, así que el relleno `nonzero` y el `evenodd` se ven igual.

// arco circular (rx = ry) → segmentos cúbicos [c1, c2, fin]
function arcToCubics([x0, y0], r, large, sweep, [x1, y1]) {
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2, d2 = dx * dx + dy * dy;
  r = Math.max(r, Math.sqrt(d2));
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (r * r - d2) / d2));
  const cx = k * dy + (x0 + x1) / 2, cy = -k * dx + (y0 + y1) / 2;
  const a0 = Math.atan2((dy - -k * dx) / r, (dx - k * dy) / r);
  let da = Math.atan2((-dy + k * dx) / r, (-dx - k * dy) / r) - a0;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  if (sweep && da < 0) da += 2 * Math.PI;
  const n = Math.ceil(Math.abs(da) / (Math.PI / 2)), st = da / n, t = (4 / 3) * Math.tan(st / 4), out = [];
  for (let i = 0; i < n; i++) {
    const s = a0 + i * st, e = s + st;
    const P = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [sx, sy] = P(s), [ex, ey] = P(e);
    out.push([[sx - t * r * Math.sin(s), sy + t * r * Math.cos(s)], [ex + t * r * Math.sin(e), ey - t * r * Math.cos(e)], [ex, ey]]);
  }
  return out;
}

// path `d` de SVG → [{ v, i, o, c }] (contornos bézier de Lottie; i/o relativos a cada vértice).
// M L H V Q C S T A Z, absolutos o relativos; los arcos deben ser circulares (rx = ry).
export function pathToContours(d, prec = 3) {
  const toks = d.match(/[MLHVQCSTAZmlhvqcstaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const out = [];
  let cur, cmd, p = [0, 0], start = [0, 0], ref = null; // ref = último punto de control (para S y T)
  const read = (n) => toks.splice(0, n).map(Number);
  const open = () => out.push((cur = { v: [p], i: [[0, 0]], o: [[0, 0]], c: false }));
  const line = (q) => { cur.o.push([0, 0]); cur.v.push(q); cur.i.push([0, 0]); p = q; };
  const cubic = (c1, c2, q) => {
    cur.o[cur.o.length - 1] = [c1[0] - p[0], c1[1] - p[1]];
    cur.v.push(q); cur.i.push([c2[0] - q[0], c2[1] - q[1]]); cur.o.push([0, 0]); p = q;
  };
  while (toks.length) {
    if (/[A-Za-z]/.test(toks[0])) cmd = toks.shift();
    const up = cmd.toUpperCase(), rel = cmd !== up;
    if (!'MLHVQCSTAZ'.includes(up)) throw new Error(`unsupported path command "${cmd}"`);
    if (cur?.c && up !== 'M' && up !== 'Z') open(); // dibujar tras un Z empieza un subtrazo en el punto inicial
    const ox = rel ? p[0] : 0, oy = rel ? p[1] : 0; // origen de las coordenadas relativas (el punto actual al empezar el comando)
    const pt = ([x, y]) => [x + ox, y + oy];
    let c2 = null, qc = null; // punto de control que deja este comando (para el siguiente S o T)
    if (up === 'M') {
      p = start = pt(read(2));
      open();
      cmd = rel ? 'l' : 'L'; // un M seguido de pares es un L implícito
    } else if (up === 'L') line(pt(read(2)));
    else if (up === 'H') line([read(1)[0] + ox, p[1]]);
    else if (up === 'V') line([p[0], read(1)[0] + oy]);
    else if (up === 'Q' || up === 'T') {
      const [qx, qy] = up === 'T' ? (ref?.q ? [2 * p[0] - ref.q[0], 2 * p[1] - ref.q[1]] : p) : pt(read(2));
      const [x, y] = pt(read(2));
      cubic([p[0] + (2 / 3) * (qx - p[0]), p[1] + (2 / 3) * (qy - p[1])], [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)], [x, y]);
      qc = [qx, qy];
    } else if (up === 'C' || up === 'S') {
      const a = up === 'S' ? (ref?.c ? [2 * p[0] - ref.c[0], 2 * p[1] - ref.c[1]] : p) : pt(read(2));
      const b = pt(read(2)), e = pt(read(2));
      cubic(a, b, e);
      c2 = b;
    } else if (up === 'A') {
      const [rx, ry, , large, sweep, x, y] = read(7);
      if (rx !== ry) throw new Error(`only circular arcs (rx = ry), got rx=${rx} ry=${ry}`);
      for (const [c1, c2b, q] of arcToCubics(p, rx, large, sweep, [x + ox, y + oy])) cubic(c1, c2b, q);
    } else if (up === 'Z') {
      cur.c = true;
      const n = cur.v.length - 1;
      if (n > 0 && Math.hypot(cur.v[n][0] - start[0], cur.v[n][1] - start[1]) < 1e-6) { // el último vértice cae sobre el primero: se funden
        cur.i[0] = cur.i[n]; cur.v.pop(); cur.i.pop(); cur.o.pop();
      }
      p = start;
      cmd = 'M';
    }
    ref = { c: c2, q: qc };
  }
  const rd = (v) => +v.toFixed(prec);
  return out.map((c) => ({ c: c.c, v: c.v.map((q) => q.map(rd)), i: c.i.map((q) => q.map(rd)), o: c.o.map((q) => q.map(rd)) }));
}

// rect con transform="translate(x y) rotate(deg)" (lo único que traen los donantes); cualquier otro transform es error
export function rectPts(a) {
  const [x, y, w, h] = [a.x, a.y, a.width, a.height].map(Number);
  let pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  if (a.transform) {
    const m = /^translate\(([-\d. ]+)\) rotate\(([-\d.]+)\)$/.exec(a.transform);
    if (!m) throw new Error(`unsupported transform "${a.transform}" (only translate() rotate())`);
    const [tx, ty] = m[1].trim().split(/\s+/).map(Number), t = (+m[2] * Math.PI) / 180;
    pts = pts.map(([px, py]) => [tx + px * Math.cos(t) - py * Math.sin(t), ty + px * Math.sin(t) + py * Math.cos(t)]);
  }
  return pts;
}

// ---------------------------------------------------------------- contornos → d
export function contoursToD(cs, prec = 2) {
  const f = (v) => +v.toFixed(prec);
  const P = (q) => `${f(q[0])},${f(q[1])}`;
  return cs
    .map((c) => {
      const n = c.v.length;
      const curved = (a, b) => c.o[a].some(Boolean) || c.i[b].some(Boolean);
      const seg = (a, b) => (curved(a, b)
        ? `C${P([c.v[a][0] + c.o[a][0], c.v[a][1] + c.o[a][1]])} ${P([c.v[b][0] + c.i[b][0], c.v[b][1] + c.i[b][1]])} ${P(c.v[b])}`
        : `L${P(c.v[b])}`);
      let d = `M${P(c.v[0])}`;
      for (let k = 1; k < n; k++) d += seg(k - 1, k);
      if (c.c) d += (curved(n - 1, 0) ? seg(n - 1, 0) : '') + 'Z';
      return d;
    })
    .join('');
}

// ---------------------------------------------------------------- elementos, caja y matriz
const K = 0.5522847498; // círculo con 4 cúbicas
const ring = (cx, cy, rx, ry) => ({
  c: true,
  v: [[cx + rx, cy], [cx, cy + ry], [cx - rx, cy], [cx, cy - ry]],
  o: [[0, K * ry], [-K * rx, 0], [0, -K * ry], [K * rx, 0]],
  i: [[0, -K * ry], [K * rx, 0], [0, K * ry], [-K * rx, 0]],
});
const straight = (pts, c) => ({ c, v: pts, i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]) });
const pairs = (s) => { const v = s.trim().split(/[\s,]+/).map(Number); return v.reduce((r, _, k) => (k % 2 ? r : [...r, [v[k], v[k + 1]]]), []); };

// { tag, attrs } de build-parts → contornos (en el sistema del lienzo)
export function elementContours({ tag, attrs: a }) {
  if (tag === 'path') return pathToContours(a.d, 6);
  if (tag === 'circle') return [ring(+a.cx, +a.cy, +a.r, +a.r)];
  if (tag === 'ellipse') return [ring(+a.cx, +a.cy, +a.rx, +a.ry)];
  if (tag === 'rect') return [straight(rectPts(a), true)];
  if (tag === 'polygon' || tag === 'polyline') return [straight(pairs(a.points), tag === 'polygon')];
  throw new Error(`<${tag}> not supported`);
}

export function bbox(cs) {
  const xs = [], ys = [];
  for (const c of cs) {
    const n = c.v.length;
    for (const [x, y] of c.v) { xs.push(x); ys.push(y); }
    for (let a = 0; a < (c.c ? n : n - 1); a++) {
      const b = (a + 1) % n, p0 = c.v[a], p3 = c.v[b];
      const p1 = [p0[0] + c.o[a][0], p0[1] + c.o[a][1]], p2 = [p3[0] + c.i[b][0], p3[1] + c.i[b][1]];
      for (let s = 1; s < 16; s++) {
        const t = s / 16, u = 1 - t;
        xs.push(u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]);
        ys.push(u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]);
      }
    }
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function matrix({ scale = 1, rotate = 0, mirror = false, dx = 0, dy = 0, about = [0, 0] } = {}) {
  const t = (rotate * Math.PI) / 180, fx = mirror ? -1 : 1;
  const a = scale * Math.cos(t) * fx, b = scale * Math.sin(t) * fx, c = -scale * Math.sin(t), d = scale * Math.cos(t);
  return [a, b, c, d, about[0] + dx - a * about[0] - c * about[1], about[1] + dy - b * about[0] - d * about[1]];
}

// los vértices se mueven completos; las manijas i/o (relativas) solo con la parte lineal de la matriz
export function xformContours(cs, [a, b, c, d, e, f]) {
  const p = ([x, y]) => [a * x + c * y + e, b * x + d * y + f];
  const l = ([x, y]) => [a * x + c * y, b * x + d * y];
  return cs.map((k) => ({ c: k.c, v: k.v.map(p), i: k.i.map(l), o: k.o.map(l) }));
}

// els (de build-parts.elements) → los mismos elementos como <path> con `t` aplicada
export function fitElements(els, t) {
  const all = els.map((e) => elementContours(e));
  const [x0, y0, x1, y1] = bbox(all.flat());
  const m = matrix({ ...t, about: t.about ?? [(x0 + x1) / 2, (y0 + y1) / 2] });
  const s = Math.abs(t.scale ?? 1);
  return els.map(({ attrs }, k) => {
    const { d, cx, cy, r, rx, ry, x, y, width, height, points, transform, ...keep } = attrs;
    if (keep['stroke-width']) keep['stroke-width'] = String(+(keep['stroke-width'] * s).toFixed(3));
    return { tag: 'path', attrs: { d: contoursToD(xformContours(all[k], m)), ...keep } };
  });
}
