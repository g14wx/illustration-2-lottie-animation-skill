// illustration-vanilla.js: fachada de una ilustración Lottie sin framework (sitios sin React, Vue, etc.). Un solo archivo, sin dependencias
// propias; el player (lottie-web build light) se importa tarde. Plantilla del skill animate-illustrations-with-lottie: cópiala al proyecto.
//
//   import { mountIllustration } from './illustration-vanilla.js';
//   import roles from './roles.json' with { type: 'json' };           // { "<color-autoría>": "--illus-ink", … }
//   const ill = mountIllustration(document.querySelector('#hero-art'), { src: '/lottie/persona.json', roles, segment: 'wave' });
//   ill.play('happy');   // UNA ráfaga; ill.destroy() al quitar el nodo
//
// Qué hace (cada punto sale de un problema real):
//  - Decorativa: aria-hidden y caja cuadrada (el layout no salta). Si pasa a llevar información, esa información va en texto al lado.
//  - Carga diferida: el player (import()) y el JSON se piden cuando un IntersectionObserver ve venir el elemento (margen de 200 px);
//    reproducir exige estar a la vista de verdad. Sin IntersectionObserver (SSR, jsdom) no hace nada.
//  - Los colores se leen del PROPIO elemento (getComputedStyle(el)), no de <html>: un ancestro con otro tema (p. ej. `.light` sobre una
//    tarjeta en modo oscuro) manda sobre los tokens. Leer <html> pintó el arte en negativo con el tema oscuro.
//  - Ráfagas de 5 s como máximo y luego frame de reposo (WCAG 2.2.2). Las ráfagas separadas por menos de 1 s de reposo comparten el mismo tope;
//    agotado, la siguiente salta a su frame final hasta que haya 1 s de reposo.
//  - prefers-reduced-motion: reduce → frame de reposo, sin movimiento (el CSS no alcanza a un player JS).
//  - Pausa fuera de pantalla; destroy() suelta el player y los observers.
//  - Reposo = inicio del marker `idle` (o frame 0). Un fondo con marker `enter` se aparca en su primer frame (la escena vacía) hasta que
//    se pide `enter`: lottie_light pinta el frame 0 al cargar y, sin aparcar, la escena se vería completa, desaparecería y se armaría.
//  - Pasadas por segmento: `repeats` (opción) pisa a `meta.repeats` del propio Lottie (lo escribe export-lottie.mjs). Por defecto 1.
//  - Si el player o el JSON no cargan: el elemento se oculta (`hidden`), llama onError y la pantalla sigue sin hueco.
// Opciones: src, roles, segment?, repeats?, loadPlayer? (por defecto import('lottie-web/build/player/lottie_light'); en un sitio sin bundler
//   pasa algo como () => cargarScript('/vendor/lottie_light.min.js').then(() => window.lottie)), onReady?, onDone?, onError?.

// <recolor>
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const toHex = (k) => '#' + k.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
export function recolor(json, roles, readVar) {
  const out = structuredClone(json);
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    const k = n.c?.k;
    if ((n.ty === 'fl' || n.ty === 'st') && !n.c?.a && Array.isArray(k) && typeof k[0] === 'number') {
      const token = roles[toHex(k)];
      const rgb = token && HEX6.exec(String(readVar(token)).trim());
      if (rgb) n.c.k = [...rgb.slice(1).map((h) => parseInt(h, 16) / 255), ...k.slice(3)];
    }
    Object.values(n).forEach(walk);
  };
  walk(out);
  return out;
}
// </recolor>

const FPS = 30; // lo exige check-lottie
const BURST_MS = 5000;
const SETTLE_MS = 1000;
const defaultPlayer = () => import('lottie-web/build/player/lottie_light').then((m) => m.default);
const later = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 1));

export function mountIllustration(el, opts) {
  const { src, roles, loadPlayer = defaultPlayer, onReady, onDone, onError } = opts;
  el.setAttribute('aria-hidden', 'true');
  el.style.aspectRatio = '1 / 1';
  if (typeof IntersectionObserver === 'undefined') return { play() {}, destroy() {} };

  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  let want = opts.segment; // ráfaga pedida y aún no iniciada
  let anim, markers = [], reps = {}, rest = 0, started = false, dead = false, visible = false, playing = false;
  // ponytail: el tope usa reloj de pared; una ráfaga en pausa fuera de pantalla gasta tope. Medir solo el movimiento si molesta.
  let windowStart = 0; // inicio del movimiento continuo en curso
  let restAt = 0; // cuándo terminó la última ráfaga

  // resetSegments: tras playSegments los frames de goToAndStop serían relativos al segmento
  const park = (frame) => {
    playing = false;
    anim.resetSegments(true);
    anim.goToAndStop(frame, true);
  };
  const finish = (frame) => {
    park(frame);
    onDone?.();
  };

  const start = (seg) => {
    const m = markers.find((x) => x.cm === seg);
    if (!(m && m.dr >= 1)) return finish(rest);
    const now = Date.now();
    if (!playing && now - restAt >= SETTLE_MS) windowStart = now; // una ráfaga que interrumpe a otra comparte el tope
    const left = Math.floor(((BURST_MS - (now - windowStart)) * FPS) / 1000); // frames que quedan del tope
    if (left < 1) return finish(m.tm + m.dr); // tope agotado: salta al final del segmento
    const frames = Math.min(m.dr, left);
    const passes = Math.min(reps[seg] ?? 1, Math.floor(left / frames));
    anim.loop = passes - 1; // lottie_light: `loop` = N repite N veces tras la primera pasada → N + 1 pasadas
    anim.playSegments([m.tm, m.tm + frames], true);
    playing = true;
  };

  const run = () => {
    if (!anim) return;
    if (reduced?.matches) {
      if (playing || want) {
        want = undefined;
        finish(rest);
      }
    } else if (!visible) {
      if (playing) anim.pause();
    } else if (want) {
      const seg = want;
      want = undefined;
      start(seg);
    } else if (playing) anim.play();
  };

  const boot = async () => {
    const [lottie, json] = await Promise.all([loadPlayer(), fetch(src).then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))]);
    if (dead) return;
    markers = json.markers ?? [];
    reps = { ...json.meta?.repeats, ...opts.repeats };
    rest = markers.find((m) => m.cm === 'idle')?.tm ?? 0;
    const blank = markers.find((m) => m.cm === 'enter')?.tm ?? rest; // fondo: aparcado en el lienzo vacío
    const style = getComputedStyle(el); // los tokens se leen en el elemento, no en <html>
    anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, animationData: recolor(json, roles, (t) => style.getPropertyValue(t)) });
    anim.addEventListener('complete', () => {
      restAt = Date.now();
      finish(rest);
    });
    park(reduced?.matches ? rest : blank);
    onReady?.();
    run();
  };

  // El margen de 200 px solo adelanta la carga; reproducir (y gastar el tope) exige estar a la vista.
  const preload = new IntersectionObserver(
    (entries) => {
      if (!entries.at(-1)?.isIntersecting || started) return;
      started = true;
      later(() => {
        if (dead) return;
        boot().catch(() => {
          if (dead) return;
          el.hidden = true; // decorativa: sin ilustración la pantalla sigue entera y sin hueco
          onError?.();
        });
      });
    },
    { rootMargin: '200px' },
  );
  const see = new IntersectionObserver((entries) => {
    visible = entries.at(-1)?.isIntersecting ?? false;
    run();
  });
  preload.observe(el);
  see.observe(el);
  reduced?.addEventListener('change', run);

  return {
    play(seg) {
      want = seg;
      run();
    },
    destroy() {
      dead = true;
      preload.disconnect();
      see.disconnect();
      reduced?.removeEventListener('change', run);
      anim?.destroy();
    },
  };
}
