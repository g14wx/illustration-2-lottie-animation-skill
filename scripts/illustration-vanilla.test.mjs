// illustration-vanilla.js (la lógica que comparte Illustration.tsx): carga diferida, recolor desde el contenedor, ráfagas de 5 s,
// movimiento reducido, pausa fuera de pantalla, fondos aparcados, errores y destroy. Todo con un player, observers y fetch falsos.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountIllustration } from '../plantillas/illustration-vanilla.js';

const roles = { '#1b1b1f': '--illus-ink' };
const lottie = (markers, meta = { repeats: { idle: 2 } }) => ({
  markers,
  meta,
  layers: [{ ty: 4, shapes: [{ ty: 'gr', it: [{ ty: 'fl', c: { a: 0, k: [0.1059, 0.1059, 0.1216, 1] } }] }] }],
});
const CHAR = lottie([{ cm: 'idle', tm: 0, dr: 60 }, { cm: 'wave', tm: 61, dr: 75 }, { cm: 'long', tm: 137, dr: 200 }]);
const BG = lottie([{ cm: 'idle', tm: 0, dr: 48 }, { cm: 'enter', tm: 49, dr: 44 }]);
const settle = () => new Promise((r) => setTimeout(r, 20));

// Entorno falso; devuelve { el, io, anim, calls, mq, restore, ... }
function setup({ json = CHAR, reduced = false, fetchFails = false, opts = {} } = {}) {
  const saved = { IO: globalThis.IntersectionObserver, mm: globalThis.matchMedia, gcs: globalThis.getComputedStyle, fetch: globalThis.fetch, ric: globalThis.requestIdleCallback, now: Date.now };
  const t = { now: 1_000_000 };
  Date.now = () => t.now;
  const env = { observers: [], calls: [], loaded: 0, anim: null, played: [], done: 0, ready: 0, errors: 0, t };
  class IO {
    constructor(cb, o) { this.cb = cb; this.o = o; env.observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.dead = true; }
    fire(isIntersecting) { if (!this.dead) this.cb([{ isIntersecting }]); }
  }
  globalThis.IntersectionObserver = IO;
  env.mq = { matches: reduced, listeners: [], addEventListener(_, f) { this.listeners.push(f); }, removeEventListener(_, f) { this.listeners = this.listeners.filter((x) => x !== f); } };
  globalThis.matchMedia = () => env.mq;
  env.style = { '--illus-ink': '#ffffff' };
  globalThis.getComputedStyle = () => ({ getPropertyValue: (n) => env.style[n] ?? '' });
  globalThis.requestIdleCallback = undefined;
  globalThis.fetch = async () => (fetchFails ? Promise.reject(new Error('network')) : { ok: true, json: async () => structuredClone(json) });
  const player = {
    loadAnimation(o) {
      const a = (env.anim = {
        opts: o, loop: undefined, listeners: {}, destroyed: false,
        addEventListener(e, f) { this.listeners[e] = f; },
        resetSegments() { env.calls.push(['reset']); },
        goToAndStop(f) { env.calls.push(['go', f]); },
        playSegments(s) { env.calls.push(['play', s]); },
        pause() { env.calls.push(['pause']); },
        play() { env.calls.push(['resume']); },
        destroy() { this.destroyed = true; },
      });
      return a;
    },
  };
  env.el = { attrs: {}, style: {}, hidden: false, setAttribute(k, v) { this.attrs[k] = v; } };
  env.ill = mountIllustration(env.el, {
    src: '/x.json', roles,
    loadPlayer: async () => { env.loaded++; return player; },
    onReady: () => env.ready++, onDone: () => env.done++, onError: () => env.errors++,
    ...opts,
  });
  env.preload = () => env.observers[0];
  env.see = () => env.observers[1];
  env.show = async () => { env.preload()?.fire(true); env.see()?.fire(true); await settle(); };
  env.lastPlay = () => env.calls.filter((c) => c[0] === 'play').at(-1);
  env.restore = () => {
    Object.assign(globalThis, { IntersectionObserver: saved.IO, matchMedia: saved.mm, getComputedStyle: saved.gcs, fetch: saved.fetch, requestIdleCallback: saved.ric });
    Date.now = saved.now;
  };
  return env;
}
const withEnv = (name, cfg, fn) => test(name, async () => { const e = setup(cfg); try { await fn(e); } finally { e.restore(); } });

withEnv('decorativa: aria-hidden y caja cuadrada; nada se carga hasta que el elemento se acerca', {}, async (e) => {
  assert.equal(e.el.attrs['aria-hidden'], 'true');
  assert.equal(e.el.style.aspectRatio, '1 / 1');
  await settle();
  assert.equal(e.loaded, 0);
  assert.equal(e.preload().o.rootMargin, '200px');
  await e.show();
  assert.equal(e.loaded, 1);
  assert.equal(e.ready, 1);
});

withEnv('recolor desde el CONTENEDOR (getComputedStyle del elemento), y queda quieta en el reposo (idle)', {}, async (e) => {
  await e.show();
  const fill = e.anim.opts.animationData.layers[0].shapes[0].it[0];
  assert.deepEqual(fill.c.k, [1, 1, 1, 1]); // la tinta pasó a blanco: el token del contenedor manda
  assert.deepEqual(e.calls.slice(0, 2), [['reset'], ['go', 0]]);
  assert.equal(e.anim.opts.renderer, 'svg');
  assert.equal(e.anim.opts.autoplay, false);
});

withEnv('play(segmento): UNA ráfaga con los frames del marker; las pasadas salen de meta.repeats (loop = pasadas - 1)', {}, async (e) => {
  await e.show();
  e.ill.play('wave');
  assert.deepEqual(e.lastPlay(), ['play', [61, 136]]);
  assert.equal(e.anim.loop, 0);
  e.ill.play('idle');
  assert.deepEqual(e.lastPlay(), ['play', [0, 60]]);
  assert.equal(e.anim.loop, 1); // meta.repeats.idle = 2
});

withEnv('la opción repeats pisa a meta.repeats; el tope de 5 s recorta pasadas y frames', { opts: { repeats: { idle: 5, long: 3 } } }, async (e) => {
  await e.show();
  e.ill.play('idle'); // 5 pasadas de 60 frames serían 10 s: caben 2 en 150 frames
  assert.equal(e.anim.loop, 1);
  e.anim.listeners.complete();
  e.t.now += 1500; // más de 1 s de reposo: tope nuevo
  e.ill.play('long'); // 200 frames > 150: se recorta a 150 y 1 pasada
  assert.deepEqual(e.lastPlay(), ['play', [137, 287]]);
  assert.equal(e.anim.loop, 0);
});

withEnv('ráfagas separadas por menos de 1 s comparten el tope; agotado, salta al final del segmento', {}, async (e) => {
  await e.show();
  e.ill.play('wave'); // 75 frames = 2,5 s
  e.t.now += 2000;
  e.ill.play('idle'); // quedan (5000-2000)*30/1000 = 90 frames: 60 frames, 1 pasada
  assert.deepEqual(e.lastPlay(), ['play', [0, 60]]);
  assert.equal(e.anim.loop, 0);
  e.t.now += 3000; // el tope se agotó
  const plays = e.calls.filter((c) => c[0] === 'play').length;
  e.ill.play('wave');
  assert.equal(e.calls.filter((c) => c[0] === 'play').length, plays); // no reproduce
  assert.deepEqual(e.calls.at(-1), ['go', 136]); // frame final del segmento (61 + 75)
  assert.ok(e.done >= 1);
});

withEnv('al terminar (complete) vuelve al reposo y avisa onDone; un marker inexistente solo avisa', {}, async (e) => {
  await e.show();
  e.ill.play('wave');
  e.anim.listeners.complete();
  assert.deepEqual(e.calls.slice(-2), [['reset'], ['go', 0]]);
  assert.equal(e.done, 1);
  e.ill.play('no-existe');
  assert.equal(e.done, 2);
});

withEnv('movimiento reducido: sin reproducir, queda en reposo y avisa; también si cambia la preferencia a mitad', { reduced: true }, async (e) => {
  await e.show();
  e.ill.play('wave');
  assert.equal(e.calls.filter((c) => c[0] === 'play').length, 0);
  assert.deepEqual(e.calls.at(-1), ['go', 0]);
  assert.equal(e.done, 1);
  assert.equal(e.mq.listeners.length, 1);
});

withEnv('pausa fuera de pantalla y reanuda al volver; no gasta ráfagas sin verse', {}, async (e) => {
  await e.show();
  e.ill.play('wave');
  e.see().fire(false);
  assert.deepEqual(e.calls.at(-1), ['pause']);
  e.see().fire(true);
  assert.deepEqual(e.calls.at(-1), ['resume']);
  e.see().fire(false);
  e.ill.play('idle'); // pedida fuera de pantalla: espera
  const n = e.calls.filter((c) => c[0] === 'play').length;
  e.see().fire(true);
  assert.equal(e.calls.filter((c) => c[0] === 'play').length, n + 1);
});

withEnv('un fondo con marker `enter` se aparca en su lienzo vacío (con movimiento reducido, en el reposo)', { json: BG }, async (e) => {
  await e.show();
  assert.deepEqual(e.calls.slice(0, 2), [['reset'], ['go', 49]]);
  e.ill.play('enter');
  assert.deepEqual(e.lastPlay(), ['play', [49, 93]]);
  e.anim.listeners.complete();
  assert.deepEqual(e.calls.at(-1), ['go', 0]);
});
withEnv('fondo con movimiento reducido: aparca en el reposo, no en el lienzo vacío', { json: BG, reduced: true }, async (e) => {
  await e.show();
  assert.deepEqual(e.calls.slice(0, 2), [['reset'], ['go', 0]]);
});

withEnv('si el JSON o el player no cargan: oculta el elemento, avisa onError y no revienta', { fetchFails: true }, async (e) => {
  await e.show();
  assert.equal(e.el.hidden, true);
  assert.equal(e.errors, 1);
  assert.equal(e.ready, 0);
});

withEnv('destroy: suelta el player y los observers; una carga en curso no monta nada', {}, async (e) => {
  await e.show();
  e.ill.destroy();
  assert.equal(e.anim.destroyed, true);
  assert.ok(e.observers.every((o) => o.dead));
  assert.equal(e.mq.listeners.length, 0);
});
withEnv('destroy antes de que cargue: no se monta ninguna animación', {}, async (e) => {
  e.preload().fire(true);
  e.ill.destroy();
  await settle();
  assert.equal(e.anim, null);
});

test('sin IntersectionObserver (SSR, jsdom) no hace nada y no lanza', () => {
  const saved = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = undefined;
  try {
    const el = { style: {}, setAttribute() {} };
    const ill = mountIllustration(el, { src: 'x', roles, loadPlayer: () => assert.fail('no debe cargar') });
    ill.play('wave');
    ill.destroy();
  } finally {
    globalThis.IntersectionObserver = saved;
  }
});
