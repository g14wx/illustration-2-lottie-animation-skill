# Llevar las animaciones a la web (runtime)

Esta referencia cubre desde "tengo los Lottie validados" hasta "se ven en una pantalla real". Antes: `07-gate.md`. Después: `10-verificacion-visual.md`; la galería de aprobación está en `09-galeria-y-aprobacion.md`. Las plantillas están en
`plantillas/`: `Illustration.tsx` (React) e `illustration-vanilla.js` (sin framework, con las pruebas del skill). Las dos hacen
lo mismo. Copia una al proyecto y cambia solo las rutas.

## 1. Qué player usar
Se usó `lottie-web@5.13.0`, solo el build **light** (`lottie-web/build/player/lottie_light`), con el renderer SVG.

| Opción | Peso medido | Veredicto |
|---|---|---|
| `lottie-web@5.13.0` build light | `lottie_light.min.js` 168 KB crudo, **46,4 KB gzip** (el chunk real del build dio 46,8 KB gzip) | Elegida |
| `lottie-web` completo (`lottie.min.js`) | 76,1 KB gzip | Trae canvas, html y expresiones que no se usan |
| `@lottiefiles/dotlottie-*` (ThorVG, WASM) | `dotlottie-player.wasm` 1,24 MB crudo, **496 KB gzip**; por defecto se baja de un CDN (jsdelivr, con respaldo en unpkg) salvo que llames a `setWasmUrl` | Descartada: un archivo más que servir, CSP, versión 0.x. Solo tendría sentido si necesitas temas o state machines |
| `lottie-react` (envoltorio de `lottie-web`) | no se midió | Descartada: otra dependencia sobre el mismo motor; el tope de 5 s, el movimiento reducido, el recolor y la carga diferida los tienes que escribir igual |
| SVG en línea con keyframes CSS | 0 | Solo vale si no necesitas rig de personaje |

Reglas:
- Versión fijada y exacta: `npm i lottie-web@5.13.0 --save-exact`. Nunca `@latest`. Comprueba la fecha de publicación (`npm view lottie-web time`).
- `lottie_light` **no trae expresiones** y es solo SVG. Por eso `check-lottie.mjs` rechaza lo que no reproduce (expresiones, `ef`) y lo que decidimos no usar (máscaras, mattes, gradientes). Ver `07-gate.md`.
- El import profundo (`lottie-web/build/player/lottie_light`) resuelve al archivo **sin minificar** (389 KB crudo, 73 KB gzip), porque el paquete no declara `exports`. El bundler lo minifica al construir. Mide el chunk real después del build, no el `.min.js` del paquete.
- Tipos: `lottie-web/build/player/lottie_light.d.ts` (`import type { AnimationItem } from 'lottie-web/build/player/lottie_light'`).
- Todo sale de tu propio servidor: sin CDN, sin WASM. (La galería de aprobación sí puede usar un CDN, solo para revisar; ver `09-galeria-y-aprobacion.md`.)

## 2. Carga diferida
El player y el JSON no entran en el camino crítico de la página. Dos observers sobre el mismo contenedor:

1. `preload`: `IntersectionObserver` con `rootMargin: '200px'`. Cuando el contenedor está por llegar, y en un momento ocioso
   (`requestIdleCallback`, con `timeout: 2000`; si no existe, `setTimeout(fn, 1)`), hace `import('lottie-web/build/player/lottie_light')`
   y `fetch(url)` del JSON, en paralelo.
2. `see`: otro `IntersectionObserver` **sin margen**. Solo cuando el contenedor está a la vista de verdad se reproduce.

Por qué dos: el margen de 200 px solo adelanta la carga. Reproducir gasta el tope de 5 s (WCAG 2.2.2), y eso no puede pasar
con la animación fuera de pantalla.

## 3. El JSON como archivo propio (no como `data:`)
Un JSON pequeño que el bundler incrusta como `data:` URI engorda el chunk de entrada y no se puede cachear. Tiene que salir como archivo.

```ts
// Vite (el caso real). roles.json se excluye: no es una animación.
const urls = import.meta.glob(['../assets/lottie/*.json', '!../assets/lottie/roles.json'], {
  query: '?url&no-inline', import: 'default', eager: true,
}) as Record<string, string>;
```
- `?url&no-inline` obliga a emitir el archivo aunque sea chico. Si tu Vite no entiende `no-inline`, pon `build.assetsInlineLimit: 0`.
- Con `eager: true` el chunk de entrada lleva solo las URL (cadenas cortas). Eso está bien. Lo que no debe llevar es el player ni el JSON.
- Otros bundlers (tomados de su documentación; el caso real solo usó Vite, no los probé aquí):
  - webpack 5: `new URL('./persona.json', import.meta.url)`, o una regla con `type: 'asset/resource'`.
  - esbuild: `loader: { '.json': 'file' }` (ojo: afecta a todos los `.json` que importes).
  - Parcel 2: `import url from 'url:./persona.json'`.
  - Sin bundler, o si dudas: deja los JSON en la carpeta pública (`/lottie/persona.json`) y pasa esa URL. Es lo más simple y no depende de nada.

## 4. Contrato de la fachada
Una sola puerta al player. Es el **único** archivo que importa `lottie-web`. Cambiar de player es editar un archivo.

| Prop (`Illustration.tsx`) | Qué hace |
|---|---|
| `src` | URL del JSON |
| `roles` | `roles.json`: color de autoría -> token CSS |
| `segment` | Pide **una** ráfaga: el nombre de un marker. `undefined` = nada. Para repetir el mismo segmento hay que pasar `undefined` en medio (`onDone` sirve) |
| `repeats` | Pasadas por segmento; pisa a `meta.repeats` del Lottie. Sin ninguno, 1 |
| `onReady` | El player y el JSON cargaron y la pieza ya está montada y quieta. Sirve para revelar una escena de varias piezas |
| `onDone` | La ráfaga terminó, o no se reproducirá (reposo, marker que no existe, movimiento reducido) |
| `onError` | Algo no cargó. La fachada oculta su contenedor (`hidden`); la pantalla decide el resto (sección 9) |
| `className` | Tamaño y posición |

Siempre pinta `<div aria-hidden="true">` cuadrado (`aspect-ratio: 1 / 1`): el layout no salta cuando llega el arte.
En la versión sin framework: `const ill = mountIllustration(el, { src, roles, segment, onReady, onDone, onError })`, con `ill.play('wave')` y `ill.destroy()`.
**Versión de React:** `Illustration.tsx` está comprobada en modo estricto con **React 19** (`react@19`, `@types/react` 19). Con React 18 no se probó: si el compilador protesta, es por los tipos, y `illustration-vanilla.js` no depende de React.

El arte es **decorativo**. Si una escena pasara a llevar información, esa información va en texto al lado, nunca dentro de la animación.
Sin texto ni `<title>` dentro del SVG. Los nombres de capa del JSON también llegan al bundle: no pongas ahí palabras que no deban verse.

En el caso real el componente recibía `name` (nombre de un JSON de una carpeta) en lugar de `src`, y tenía una tabla `REPEATS`. La plantilla
usa `src` y `repeats` porque no asume carpeta. Si usas `name`, añade una prueba que compare `REPEATS` con el `parts.json` de cada asset (cada
segmento, con sus pasadas, cabe en 5 s). Esa prueba evitó que los tiempos declarados y los reales se separaran.
**Una excepción conocida:** un prop declara `idle` con 1 pasada y la fachada nunca lo pide (un prop solo reproduce su ráfaga; su reposo es el frame 0). La prueba no debe exigir que ese `idle` figure en `REPEATS`.

**Activo provisional.** Mientras el arte no está listo, copia un export cualquiera (el del piloto) con el **nombre final** y con los mismos markers que tendrá el real, y monta la pantalla con él:
cuando llegue el real se reemplaza el archivo sin tocar el componente. Si a un provisional le falta un marker, la fachada se queda en el reposo (`onDone`), no falla.

## 5. Reproducción
- Una ráfaga = `anim.playSegments([m.tm, m.tm + frames], true)` con el marker (`cm` nombre, `tm` inicio, `dr` duración).
- **`loop = pasadas - 1`.** En `lottie_light`, `loop = N` repite N veces después de la primera pasada, o sea N + 1 pasadas. Está fijado
  con el player real en `scripts/illustration-player.test.mjs` (`idle` con 2 pasadas da exactamente un `loopComplete`). Si cambias a `loop = pasadas`, la prueba falla.
- **Un segmento termina en `tm + dr - 1`.** `lottie_light`, al acabar `playSegments([tm, tm + dr])`, queda un frame antes. Por eso los markers van
  separados por un frame (`tm` = fin anterior + 1): sin ese hueco el player caería en el primer frame del siguiente segmento. Y por eso `export-lottie.mjs`
  exige que `dr - 1` ya esté asentado en la pose de reposo.
- **Frame de reposo** = inicio del marker `idle` (o 0). Al terminar, o al interrumpir, la fachada llama
  `anim.resetSegments(true)` y después `goToAndStop(reposo, true)`. El `resetSegments` es necesario: después de un `playSegments`, los frames de
  `goToAndStop` serían relativos al segmento.
- **Ráfagas de 5 s como máximo** y luego quieto (WCAG 2.2.2 no pide pausa a lo que dura 5 s o menos). Ojo: lo que arranca por llegar con el
  scroll cuenta como "empieza solo", así que el tope es obligatorio, no cosmético.
  - Sin loops continuos; nada parpadea más de 3 veces por segundo (SC 2.3.1).
  - Una ráfaga nueva interrumpe la que corre.
  - Las ráfagas separadas por menos de 1 s de reposo **comparten el mismo tope** de 5 s. Agotado, la siguiente salta a su frame final hasta que haya 1 s de reposo.
  - El tope es por ráfaga total, no por segmento. Caso real: un fondo con `enter` (44 frames) y `idle` (48 frames x 2 pasadas) dura
    44/30 + 48/30 x 2 = **4,67 s**. Con un `idle` de 60 frames daba 5,47 s y el `idle` se cortaba a media oscilación. `check-lottie.mjs --parts` revisa `enter` + `idle`.
- **Fondos con `enter`.** `lottie_light` pinta el frame 0 al cargar. En un fondo con `enter`, el frame 0 de `enter` es la escena vacía, pero el 0 del archivo
  podría ser la escena completa. La fachada "aparca" el fondo con `goToAndStop(enter.tm, true)` y recién reproduce `enter` al entrar a la vista; luego pide
  `idle` (el que llama lo encadena en `onDone`). Sin esto la escena se vería completa, desaparecería y se armaría.
- **Pausa fuera de pantalla** (`anim.pause()` al salir; `anim.play()` al volver) y **`anim.destroy()`** al desmontar. Protege la carrera: si se
  desmonta antes de que termine la carga (`dead = true`), no se monta nada.
- Límite conocido: el tope usa reloj de pared, así que una ráfaga en pausa fuera de pantalla gasta tope. Si molesta, mide solo el movimiento.

## 6. Movimiento reducido
`matchMedia('(prefers-reduced-motion: reduce)')`, con listener `change`. Si está activo: frame de reposo estático, nunca se reproduce nada, y `onDone` se llama igual.

Por qué en JS: el override CSS (`@media (prefers-reduced-motion)` que anula animaciones y transiciones) no alcanza a `lottie-web`, que mueve el SVG desde JS.
No toques ese bloque de CSS; consulta `matchMedia` en la fachada. Para un fondo, el reposo con movimiento reducido es el primer frame de `idle` (la escena completa), no el lienzo vacío de `enter`.

## 7. Sin `IntersectionObserver`, nunca se importa lottie
`if (typeof IntersectionObserver === 'undefined') return;` antes de cualquier `import()`. Pasa en SSR y en jsdom (pruebas de componentes).
La regla: si no hay un navegador real que pueda mostrar el arte, no se carga el player. Las pruebas de la pantalla no necesitan simular nada y no pagan el costo del import
(no medí aquí qué falla exactamente en jsdom si se importa; la regla se adoptó antes de verlo). `illustration-vanilla.test.mjs` tiene la prueba:
"sin IntersectionObserver (SSR, jsdom) no hace nada y no lanza".

## 8. El chunk de entrada no debe contener lottie
Se verifica en el build, en el gate de la pantalla:
```bash
npm run build
# el player va en su propio chunk; el de entrada solo lleva URL de los JSON
ENTRY=$(grep -o 'assets/index-[^"]*\.js' dist/index.html | head -1)
if grep -q 'bodymovin' "dist/$ENTRY"; then echo "FALLA: el chunk de entrada trae el player"; exit 1; fi
ls dist/assets | grep -E 'lottie_light-.*\.js'     # el chunk del player existe, aparte
ls dist/assets | grep -E '\.json$'                 # los JSON salen como archivos propios
```
- No busques `loadAnimation` ni `lottie`: la fachada también los lleva (y las URL de los JSON se llaman `lottie/…`). `bodymovin` sí está en el build del player
  (2 veces en `lottie_light.min.js`); antes de fiarte, búscalo en el chunk del player de tu build para saber que tu bundler lo conserva.
- Mide el chunk del player después del build (caso real: 46,8 KB gzip).
- Adapta el nombre del archivo de entrada a tu bundler. Es un patrón, no un comando universal.

## 9. `onReady`, `onError` y quitar el contenedor entero
- Si el player o el JSON no cargan, la fachada oculta su contenedor y llama `onError`. La **pantalla** decide: quita todo el bloque de arte (contenedor,
  props pegados, escenario), para que ningún objeto quede flotando sobre el texto y no quede hueco. La pantalla sigue entera.
- Si falla la pieza principal (el personaje o el fondo), se quita todo, como en el caso real. Si falla solo un acompañante (un prop), ocultar solo ese parece suficiente, pero no se probó como regla.
- No reintentes en bucle. No muestres un mensaje de error: el arte es decorativo.

## 10. Escena compuesta: se revela cuando todas las piezas están listas
Caso real (panel de un login de CRM): un fondo y tres personajes superpuestos en un mismo cuadrado.

```tsx
const person = 'absolute inset-0 origin-[50%_93%] scale-[.8]';   // escala 0,8 desde los pies
const cast = [                                                    // bg, p1, p2, p3 = URL de cada JSON
  { src: bg,  segment: 'enter',    className: 'absolute inset-0' },
  { src: p1,  segment: 'wave',     className: `${person} translate-x-[-17%]` },
  { src: p2,  segment: 'idle',     className: `${person} translate-x-[7%]` },
  { src: p3,  segment: 'thinking', className: `${person} translate-x-[26%]` },
];

function Stage({ onError }: { onError: () => void }) {
  const [ready, setReady] = useState(0);
  const go = ready === cast.length;                                 // todas avisaron onReady
  return (
    <div aria-hidden="true"
         className={`light relative size-[min(100cqw,100cqh,36rem)] transition-opacity duration-200 motion-reduce:transition-none ${go ? 'opacity-100' : 'opacity-0'}`}>
      {cast.map((c) => (
        <Illustration key={c.src} src={c.src} roles={roles} className={c.className}
          segment={go ? c.segment : undefined}                      // nadie se mueve antes de tiempo
          onReady={() => setReady((n) => n + 1)} onError={onError} />
      ))}
    </div>
  );
}
```
Reglas aprendidas:
- **Revelar con opacidad solo cuando las N piezas avisaron `onReady`**, y recién entonces pedir los segmentos, todos juntos. Si no, cada pieza aparece cuando carga:
  personas flotando sin fondo, o un fondo armándose con la gente ya puesta.
- Los personajes comparten el lienzo de 1000 px con el fondo. Se encogen (escala 0,8) con el **origen en los pies** (los pies están a ~93 % de la altura) y se
  desplazan en x; así quedan apoyados en el suelo del fondo. Uno deja sitio al brazo que saluda.
- Cada pieza tiene un segmento de distinta duración (fondo que se arma, uno saluda, uno respira, uno piensa). Toda la escena se mueve **como máximo lo que dura la ráfaga más larga**
  (~4,7 s) y queda quieta. Sin loops. Con movimiento reducido, todo quieto.
- Si una pieza falla, **desaparece el escenario entero** (`onError` -> el padre deja de pintarlo) y el formulario de al lado queda igual.
- Solo desde el breakpoint `lg`: en móvil el panel ya estaba oculto.
- Zona calma: los personajes ocupan x 350-650 con los pies en y ~930; el fondo no lleva tinta ahí (medido: 0,00 % de tinta oscura en dos fondos y 0,01 % en el tercero).

## 11. `segmentFor`: reaccionar solo a cambios reales
Una función pura, sin timers ni avance simulado: decide qué segmento corresponde a un **cambio real** del estado. Un poll que trae lo mismo no mueve nada.

```ts
export function segmentFor(prev: Status | undefined, s: Status | undefined): string | null {
  if (!s) return null;
  if (s.status === 'failed') return prev?.status === 'failed' ? null : 'surprised';  // fallo -> sorpresa (una vez)
  if (!prev) return null;                                                             // primera carga: no hay cambio que mostrar
  if (s.warnings.some((w) => !prev.warnings.includes(w))) return 'thinking';          // aviso nuevo (llega junto al cambio de paso: se mira primero)
  return s.step !== prev.step ? 'point' : null;                                        // paso nuevo -> señalar
}
```
- Plantilla lista para copiar, con `propFor` y su prueba de tabla: `plantillas/segment-for.example.mjs` y `scripts/segment-for.example.test.mjs`.
- Paso nuevo -> `point`. Aviso -> `thinking`. Fallo -> `surprised`. Primera carga y poll igual -> `null`.
- La tabla pantalla -> arte -> segmento -> cuándo se mueve se aprueba antes de montar (ejemplo de su forma en `12-caso-real.md`, etapa 7).
- **Nunca** un `walk` en loop mientras "carga": sugeriría un avance que no existe. El arte no inventa progreso (nada de barras que se llenan ni contadores).
- Un objeto acompañante (`propFor(status)`) sigue la misma regla: su ráfaga la pide la pantalla solo con un cambio real de paso. En `failed` desaparece y el personaje queda en `surprised`.
- Prueba de tabla para `segmentFor` (prev, actual, esperado). Es la prueba más barata y la que más protege.

## 12. Tamaños en móvil
- A 390 px de ancho, **ningún contenedor de arte pasa de 342 px** (390 - 2 x 24 de margen) y no hay scroll horizontal (`scrollWidth <= innerWidth`).
- Casos: aside `max-w-40 lg:max-w-60` (160/240 px); estado vacío `max-w-48` (192 px); `w-full` + `aspect-square`, nunca un ancho fijo.
- Un prop al lado del personaje va **fuera del flujo** (`absolute -right-6 bottom-0 w-14 lg:w-20`): al aparecer no cambia el tamaño del personaje ni mueve la pantalla.
- El arte de un aside carga diferido: en móvil aparece cuando el scroll llega a él.
- Contorno de tinta pensado para verse de ~1 px a la talla real (4 unidades a ~250 px en personajes, 5 a 160-240 px en props). Confirma las tallas reales antes de fijarlos.

## 13. Modo oscuro: el arte en negativo
**Síntoma.** Con el tema oscuro, la escena salía como el negativo de una foto: el pelo y los zapatos blancos, las caras oscuras.
**Causa.** `recolor()` leía los tokens de `document.documentElement` (`<html class="dark">`). En oscuro, la tinta pasa a blanco y la piel a un tono oscuro.
**Arreglo (tres piezas):**
1. El escenario es un subárbol `.light`. En el CSS de tokens, los roles claros se declaran en `:root, .light` y los alias (los que usan `var()`) en `:root, .dark, .light`.
   Los alias hay que redeclararlos dentro de `.light`: una propiedad con `var()` se calcula donde se declara, así que un `.light` dentro de `.dark` heredaría el valor oscuro ya resuelto.
2. En oscuro, el escenario va sobre una tarjeta clara (un cuadro enmarcado en el panel). El arte conserva los colores de la marca como en claro.
3. La fachada lee `getComputedStyle(contenedor)`, no `document.documentElement`. Así un ancestro con otro tema manda sobre la página.

```css
:root, .light { --illus-ink: #1b1b1f; --illus-paper: #ffffff; /* … roles claros … */ }
.dark         { --illus-ink: #ffffff; --illus-paper: #292929; /* … roles oscuros … */ }
```
**La prueba que lo fija** (hay dos, pon al menos una):
- Con la fachada y un player simulado: envolver en un `div` que redefine la variable (`style="--illus-ink: <otro color>"`), montar, y comprobar que el color que llega a
  `loadAnimation` es el del contenedor y no el del documento. (Los hex de prueba son valores de prueba, no colores de UI: márcalos con la excepción de tu gate de colores.)
- Con el player real: `scripts/illustration-player.test.mjs` pone `--illus-brand` en rojo en el contenedor y en verde en `<html>`, y exige que el SVG dibuje rojo.
  Corre con `node --test` (sin argumentos) y se omite si no hay Chrome o `LOTTIE_LIGHT`.

**Medido después del arreglo** (Chrome real, tema oscuro): texto vecino 11,1:1, tarjeta contra panel 17,96:1, anillo de foco intacto.
**Dónde pasa:** solo en apps con tema oscuro. En una app que siempre es clara no hay bug.
**Aviso de verificación:** quien lo reportó vio el negativo incluso después del arreglo porque la app usaba rutas con `#`: cambiar solo el hash no recarga la página. Ver `10-verificacion-visual.md`.

Si de verdad necesitas arte en una paleta oscura (en vez de una tarjeta clara), mídelo antes: en el caso real el pelo sin contorno casi no se separaba del fondo oscuro (1,8:1) y la piel tuvo que cambiar de
tono para que los rasgos blancos se leyeran (3,82:1; mínimo 3:1). Ver la sección de paletas en `09-galeria-y-aprobacion.md`.

## Lista rápida antes de montar una pantalla
- [ ] `aria-hidden`, cuadrado, sin texto dentro.
- [ ] Lazy: sin `IntersectionObserver` no se importa nada.
- [ ] JSON como archivo propio; el chunk de entrada no tiene el player.
- [ ] `loop = pasadas - 1`; ráfaga <= 5 s (con `enter` + `idle` sumados en los fondos); reposo al terminar.
- [ ] Movimiento reducido: frame de reposo.
- [ ] Colores leídos del contenedor.
- [ ] `onError` quita el bloque entero.
- [ ] Solo reacciona a cambios reales (`segmentFor`); nada de loops.
- [ ] A 390 px: <= 342 px de ancho del arte y sin scroll horizontal.
