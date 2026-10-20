// Illustration.tsx: la ÚNICA puerta a lottie-web en una app React. Plantilla del skill animate-illustrations-with-lottie: cópiala al proyecto.
// Una sola dependencia: `npm i lottie-web@5.13.0 --save-exact` (versión fijada, solo el build light: ~47 KB gzip, renderer SVG, sin WASM ni CDN).
// Tipos: comprobada en modo estricto con React 19 (`@types/react` 19). Con React 18 no se probó.
//
//   import roles from '@/assets/lottie/roles.json';                  // { "<color-autoría>": "--illus-ink", … }
//   import personaUrl from '@/assets/lottie/persona.json?url&no-inline';   // Vite: el JSON como archivo propio, nunca un data: URI
//   <Illustration src={personaUrl} roles={roles} segment={segment} onDone={…} className="max-w-60" />
//
// Contrato con la pantalla: `segment` pide UNA ráfaga (el nombre de un marker del Lottie); `onDone` avisa cuando terminó o no se
// reproducirá (reposo, marker inexistente, movimiento reducido); `onReady` avisa cuando el player y el JSON cargaron y la pieza ya está
// montada y quieta (sirve para revelar una escena de varias piezas y arrancarlas juntas); `onError` avisa si algo no cargó (el contenedor
// se oculta). Para repetir el mismo segmento hay que pasar `undefined` en medio (onDone sirve).
// Qué hace y por qué: la misma lista que illustration-vanilla.js (que es la versión sin React y la que lleva los tests del skill):
//  decorativa (aria-hidden, caja cuadrada) · carga diferida con IntersectionObserver (margen 200 px; reproducir exige estar a la vista) ·
//  colores leídos del CONTENEDOR (getComputedStyle(el)) y no de <html>, para que un ancestro con otro tema mande · ráfagas ≤ 5 s y luego
//  frame de reposo (WCAG 2.2.2), con tope compartido entre ráfagas separadas por < 1 s · prefers-reduced-motion = frame de reposo ·
//  pausa fuera de pantalla · destroy al desmontar · un fondo con marker `enter` se aparca en su lienzo vacío hasta que se pide.
// `repeats` pisa a `meta.repeats` del Lottie (lo escribe export-lottie.mjs); sin ninguno de los dos, 1 pasada.
import { useEffect, useRef } from 'react';
import type { AnimationItem } from 'lottie-web/build/player/lottie_light';

type Marker = { cm: string; tm: number; dr: number };
type Props = {
  src: string; // URL del JSON de la ilustración
  roles: Record<string, string>; // color de autoría → token CSS (roles.json)
  segment?: string;
  repeats?: Record<string, number>;
  onDone?: () => void;
  onReady?: () => void;
  onError?: () => void;
  className?: string;
};

// <recolor>
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const toHex = (k: number[]) => '#' + k.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
export function recolor<T>(json: T, roles: Record<string, string>, readVar: (name: string) => string): T {
  const out = structuredClone(json);
  const walk = (n: any): void => {
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
const BURST_MS = 5000; // WCAG 2.2.2: lo que dura 5 s o menos queda fuera
const SETTLE_MS = 1000; // con 1 s de reposo la siguiente ráfaga abre un tope nuevo

export function Illustration({ src, roles, segment, repeats, onDone, onReady, onError, className }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const want = useRef(segment); // ráfaga pedida y aún no iniciada
  const sync = useRef<(() => void) | undefined>(undefined); // lo arma el efecto de carga
  const cb = useRef({ roles, repeats, onDone, onReady, onError });
  useEffect(() => {
    cb.current = { roles, repeats, onDone, onReady, onError };
  });

  useEffect(() => {
    want.current = segment;
    sync.current?.();
  }, [segment]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return; // sin IntersectionObserver (SSR, jsdom) no se importa nada

    const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
    let anim: AnimationItem | undefined;
    let markers: Marker[] = [];
    let reps: Record<string, number> = {};
    let rest = 0; // frame de reposo: el inicio de 'idle', o 0
    let started = false;
    let dead = false;
    let visible = false;
    let playing = false;
    // ponytail: el tope usa reloj de pared; una ráfaga en pausa fuera de pantalla gasta tope. Medir solo el movimiento si molesta.
    let windowStart = 0; // inicio del movimiento continuo en curso
    let restAt = 0; // cuándo terminó la última ráfaga

    // resetSegments: tras playSegments los frames de goToAndStop serían relativos al segmento
    const park = (frame: number) => {
      playing = false;
      anim!.resetSegments(true);
      anim!.goToAndStop(frame, true);
    };
    const finish = (frame: number) => {
      park(frame);
      cb.current.onDone?.();
    };

    const start = (seg: string) => {
      const m = markers.find((x) => x.cm === seg);
      if (!(m && m.dr >= 1)) return finish(rest);
      const now = Date.now();
      if (!playing && now - restAt >= SETTLE_MS) windowStart = now; // una ráfaga que interrumpe a otra comparte el tope
      const left = Math.floor(((BURST_MS - (now - windowStart)) * FPS) / 1000); // frames que quedan del tope
      if (left < 1) return finish(m.tm + m.dr); // tope agotado: salta al final del segmento
      const frames = Math.min(m.dr, left);
      const passes = Math.min(reps[seg] ?? 1, Math.floor(left / frames));
      anim!.loop = passes - 1; // lottie_light: `loop` = N repite N veces tras la primera pasada → N + 1 pasadas
      anim!.playSegments([m.tm, m.tm + frames], true);
      playing = true;
    };

    const run = () => {
      if (!anim) return;
      if (reduced?.matches) {
        if (playing || want.current) {
          want.current = undefined;
          finish(rest);
        }
      } else if (!visible) {
        if (playing) anim.pause();
      } else if (want.current) {
        const seg = want.current;
        want.current = undefined;
        start(seg);
      } else if (playing) anim.play();
    };

    const boot = async () => {
      const [{ default: lottie }, json] = await Promise.all([
        import('lottie-web/build/player/lottie_light'),
        fetch(src).then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status))))),
      ]);
      if (dead) return;
      markers = json.markers ?? [];
      reps = { ...json.meta?.repeats, ...cb.current.repeats };
      rest = markers.find((m) => m.cm === 'idle')?.tm ?? 0;
      const blank = markers.find((m) => m.cm === 'enter')?.tm ?? rest; // fondo: aparcado en el lienzo vacío
      const style = getComputedStyle(el); // los tokens se leen en el contenedor, no en <html>
      anim = lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        animationData: recolor(json, cb.current.roles, (token) => style.getPropertyValue(token)),
      });
      anim.addEventListener('complete', () => {
        restAt = Date.now();
        finish(rest);
      });
      park(reduced?.matches ? rest : blank);
      cb.current.onReady?.();
      run();
    };

    // El margen de 200 px solo adelanta la carga; reproducir (y gastar el tope) exige estar a la vista.
    const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 1));
    const preload = new IntersectionObserver(
      (entries) => {
        if (!entries.at(-1)?.isIntersecting || started) return;
        started = true;
        idle(() => {
          if (dead) return;
          boot().catch(() => {
            if (dead) return;
            el.hidden = true; // decorativa: sin ilustración la pantalla sigue entera y sin hueco
            cb.current.onError?.();
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
    sync.current = run;
    return () => {
      dead = true;
      sync.current = undefined;
      preload.disconnect();
      see.disconnect();
      reduced?.removeEventListener('change', run);
      anim?.destroy();
    };
  }, [src]);

  return <div ref={box} aria-hidden="true" className={className} style={{ aspectRatio: '1 / 1', width: '100%' }} />;
}
