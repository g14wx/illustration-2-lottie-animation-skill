# Verificación visual

"Hecho" es haberlo visto en un navegador real, a dos anchos, con el movimiento reducido y en oscuro si la app lo tiene. Un test en verde no basta: el arte
puede pasar todas las pruebas y salir en negativo (ver `08-web-runtime.md`, sección 13).

Antes: `08-web-runtime.md` (la fachada montada en pantallas). `SK` = carpeta del skill. Variables de entorno de los scripts: `CHROME` (ruta de Chrome o Chromium) y `LOTTIE_LIGHT` (ruta de `lottie_light.min.js`;
si falta, se busca `node_modules/lottie-web/build/player/lottie_light.min.js` subiendo desde la carpeta actual).

## 1. Etiqueta de máquina
- **Un solo Chrome headless a la vez.** Renders chicos (`--size 200` a `400`), uno tras otro. Otra sesión puede estar corriendo sus pruebas: en el caso real una corrida falló por
  timeout cuando dos sesiones cargaban la máquina. Si tu proyecto tiene ventanas "sin carga", respétalas.
- Perfil propio por corrida (`--user-data-dir`), nunca el de tu navegador. `render.mjs` lo crea en una carpeta temporal y lo borra.
- Los PNG y los HTML de trabajo van a una carpeta de trabajo **fuera del repo** y que no se borre al reiniciar (el `/tmp` se vació dos veces en la sesión real y se perdieron capturas). Las herramientas viven en el repo, no en `/tmp`.
- Si levantas un servidor de desarrollo para mirar la app, usa un puerto propio y mátalo al terminar.

## 2. Chrome headless por CLI (lo más barato)
```bash
timeout 60 google-chrome-stable --headless=new --no-sandbox --disable-gpu \
  --user-data-dir="$(mktemp -d)" --allow-file-access-from-files --hide-scrollbars \
  --virtual-time-budget=5000 --window-size=W,H --screenshot=salida.png file:///ruta/a/pagina.html 2>/dev/null
```
El `2>/dev/null` calla el ruido de dbus que Chrome imprime por stderr; si la captura no sale, quítalo para ver el error real.
| Flag | Para qué |
|---|---|
| `--headless=new` | El modo headless actual |
| `--no-sandbox` | Hace falta en contenedores y WSL |
| `--disable-gpu` | Evita fallos de GPU en headless |
| `--user-data-dir=…` | Perfil propio y desechable |
| `--allow-file-access-from-files` | La página (`file://`) carga el player y los JSON locales |
| `--hide-scrollbars` | Capturas sin barras |
| `--virtual-time-budget=5000` | Deja correr 5000 ms de tiempo virtual antes de capturar |
| `--window-size=W,H` | Tamaño de la captura |
| `--screenshot=…` | Escribe el PNG. Para leer el DOM en vez de capturar: `--dump-dom` |

**Límite importante:** con tiempo virtual, `requestAnimationFrame` no avanza. Sirve para pintar **un frame fijo** (`goToAndStop`), no para ver una reproducción.
Para comprobar reproducción real, congela el reloj de lottie y avánzalo a mano (`lottie.freeze()` y `anim.advanceTime(1000 / 30)`), como hace `scripts/illustration-player.test.mjs`.

## 3. `render.mjs`: frames de un Lottie con el player real
```bash
# Frames globales sueltos
node SK/scripts/render.mjs anim.json --frame 0,30,60 --size 300 --out frames.png
# Un segmento: frames LOCALES (frame global = tm + k). Sin --at: primero, medio y último
node SK/scripts/render.mjs anim.json --segment wave --at 0,20,40,74 --size 300 --out wave.png
# Otra paleta sin re-exportar (color de autoría -> color final), sobre fondo oscuro
node SK/scripts/render.mjs anim.json --map mapa-oscuro.json --bg "#292929" --out oscuro.png
# Una hoja con el reposo y las poses que declara `views` en parts.json (sin escribir --segment ni --at)
node SK/scripts/render.mjs anim.json --views parts.json --size 240 --out poses.png
# ¿El player dibuja el mismo SVG en el frame 0 que al inicio y al final de cada segmento? (sin PNG; sale 1 si hay un DIFF)
node SK/scripts/render.mjs anim.json --rest-check --parts parts.json
```
- `--frame` y `--segment` no se combinan. Una celda por frame, con su número debajo; `--cols` hasta 4.
- `--rest-check` carga cada segmento en `lottie_light` y compara el SVG que dibuja (`SAME` / `DIFF`). `--parts` aporta `offPoseStart`: ese inicio no se mide.
  Atrapa lo que el cálculo sobre el JSON de `export-lottie` no ve. Es una comprobación más: no sustituye mirar los PNG.
- **Cohesión a talla real:** renderiza el personaje y sus props con `--size 240` y con `--size 160` (la talla a la que se verán) y mira las dos hojas juntas: el contorno de todos debe leerse igual de grueso.
- `--map` toma `{ "#1b1b1f": "#ffffff" }`. Para pasar por tokens: `node SK/scripts/recolor.mjs anim.json --vars vars.json --roles roles.json --out anim-oscuro.json`.
- Sin Chrome o sin player el script sale con 1 y dice qué falta.
- Para elegir qué pieza es cuál en un SVG del pack: `node SK/scripts/index-svg.mjs donante.svg --png indices.png --size 1000` (dibuja el número de cada elemento).

Qué mirar en los renders de un segmento (y leerlos con la herramienta de imágenes de tu agente):
- Primer y último frame iguales al reposo. `export-lottie.mjs` ya lo exige; compruébalo con los ojos.
- **Articulaciones:** hombros, codos, muñecas, caderas, rodillas y tobillos en las poses extremas. Sin huecos, sin borde de contorno a la vista. Acércate (zoom 3x en la galería).
- Orden de capas (el brazo de atrás detrás del torso).
- Contorno fino: a la talla real debe leerse de ~1 px.

## 4. La app real, con `puppeteer-core`
Para las pantallas se maneja el navegador con `puppeteer-core` (no descarga Chrome; usa el tuyo).
```bash
mkdir pptr && cd pptr && npm init -y
PUPPETEER_SKIP_DOWNLOAD=1 npm i puppeteer-core@25.12.0 --save-exact
```
- Versión **exacta**, nunca `@latest`, y publicada hace más de dos semanas (`npm view puppeteer-core time`). `25.12.0` es la que usó la sesión real; vuelve a comprobarla con tu fecha.
- Instálalo en tu carpeta de trabajo, no en el proyecto: es una herramienta de revisión, no una dependencia.
- Si la API (backend) no está, **simula las respuestas** con intercepción de requests. Saca la forma de las respuestas de las pruebas existentes y de los contratos del proyecto.

Esqueleto (ajústalo; no lo ejecuté en esta redacción):
```js
import puppeteer from 'puppeteer-core';
const BASE = 'http://127.0.0.1:5186';                  // tu servidor de desarrollo, en un puerto propio
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const foreign = [];
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = new URL(req.url());
  if (u.origin !== BASE) foreign.push(req.url());      // el arte no debe pedir nada a otro origen
  if (u.pathname.startsWith('/api/')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCKS[u.pathname] ?? {}) });
  req.continue();
});
for (const [width, height] of [[1280, 900], [390, 844]]) {
  for (const reduce of [false, true]) {
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }]);
    await page.goto('about:blank');                    // ver sección 5: recargar la página entera
    await page.goto(`${BASE}/#/ruta`, { waitUntil: 'networkidle0' });
    const r = await page.evaluate(() => ({
      noHScroll: document.documentElement.scrollWidth <= innerWidth,
      artWidth: document.querySelector('[aria-hidden="true"] svg')?.parentElement.getBoundingClientRect().width,
      fills: [...document.querySelectorAll('[aria-hidden="true"] svg path')].slice(0, 5).map((p) => getComputedStyle(p).fill),
    }));
    console.log(width, reduce, r);
    await page.screenshot({ path: `salida/${width}-${reduce ? 'reducido' : 'normal'}.png` });
  }
}
console.log('requests a otros orígenes:', foreign);
await browser.close();
```
- **Oscuro:** `page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])` solo sirve si la app sigue el media query. Si el tema se pone con una clase,
  hazlo en la página: `document.documentElement.classList.add('dark')`.
- **Reposo con movimiento reducido:** con `reduce`, toma `outerHTML` del `svg` del arte, espera 1 s y vuelve a tomarlo: debe ser idéntico (no hay cambio de frame).
  Para decidir si algo **volvió** al reposo después de una animación (por ejemplo, la galería tras un `▶`), no compares `outerHTML`: el DOM puede diferir aunque el dibujo sea igual.
  Compara el **hash de la captura** (`page.screenshot()` del elemento, antes y después).
- **Camino de fallo:** interceptar la request y responder `req.respond({ status: 404 })` a la URL del JSON de una pieza. Un servidor de desarrollo o `vite preview` **no** devuelve 404 para una ruta
  inexistente: devuelve `index.html` con 200 y el fallo sale por un error al leer el JSON, no por el 404. Comprueba que desaparece **todo** el bloque de arte (no queda un prop flotando) y que la pantalla sigue entera.
- **Diferido:** abre una pantalla móvil sin hacer scroll al arte y comprueba que todavía no hubo request del player ni del JSON.
- Los `fill` del SVG ya renderizado son la verdad de qué colores salieron. En la sesión real también se leyeron en el Chrome real del usuario (con una extensión de control del navegador) para medir contraste.

## 5. Recarga la página entera (SPA con rutas `#`)
En una app con rutas por hash, cambiar solo el hash **no recarga** la página: sigues viendo el código viejo. En la sesión real, la persona que reportó el bug de modo oscuro lo siguió viendo
después del arreglo por esto. Siempre:
- a mano: recarga completa (F5 / Ctrl+Shift+R);
- con puppeteer: `page.goto('about:blank')` y luego `page.goto(url)`, o `page.reload()`. Un `goto` a la misma URL con otro hash tampoco recarga.
- En el aviso a quien revisa, dilo: "recarga la página completa".

## 6. Qué comprobar a 1280 y a 390 px
Cada pantalla con arte, en los dos anchos, y con movimiento reducido emulado:

| Qué | Cómo / umbral |
|---|---|
| Sin scroll horizontal | `scrollWidth <= innerWidth` |
| Tamaño del arte | A 390 px, el contenedor mide **<= 342 px** (390 - 2 x 24) |
| Espaciado | Nada pegado: arte, texto y bordes con aire. Usa la escala de espaciado del proyecto |
| Jerarquía | El arte apoya; no compite con el título ni con el botón principal. Si lo hace, es más chico o desaparece en esa pantalla |
| Contraste | Texto 4,5:1. Bordes de controles 3:1. Rasgos de la cara (tinta) sobre piel **>= 3:1** |
| Foco | Visible en cada control (anillo con separación), también con el arte presente |
| Estados | Vacío, carga y error. Con arte y con el arte caído |
| Movimiento reducido | El arte queda en el frame de reposo; nada se mueve durante 1 s |
| Network | Solo requests al mismo origen (sin CDN). El player y los JSON salen de tu servidor |
| Consola | Sin errores |
| Oscuro (si la app lo tiene) | Sin negativo; texto vecino y tarjeta con contraste |

Lee las capturas (con la herramienta de imágenes) y juzga como lo haría quien diseña: ¿está en el lugar correcto, sobra, falta aire? Lo que no pase no se entrega.

## 7. Contraste: cómo calcularlo
Mide con la fórmula de WCAG sobre los colores **renderizados** (los `fill` leídos del SVG), no sobre los de autoría.
```js
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// ratio('#ffffff', '#000000') = 21     ratio('#ffffff', '#292929') = 14,55
```
Umbrales: texto 4,5:1; bordes de controles y foco 3:1; rasgos de la cara sobre la piel 3:1. Registra cada par y el valor. Lo que quede por debajo y se acepte
(detalles decorativos) se anota como límite aceptado, con el nombre de quien lo aceptó (ver `09-galeria-y-aprobacion.md`).

## 8. El MCP de DevTools puede estar ocupado
Si tu agente tiene el MCP de Chrome DevTools y otra sesión lo tiene tomado, **no esperes ni lo pises**. Usa Chrome headless por CLI (sección 2) o `puppeteer-core` con tu propio perfil (sección 4).
Si el navegador es tuyo y está libre, DevTools hace lo mismo (cambiar tamaño de ventana, emular medios, leer estilos, capturar). El resultado cuenta igual mientras dejes evidencia: capturas con su ruta y los números medidos.

## 9. Evidencia que se entrega
- Las rutas de los PNG (a 1280 y 390, normal y con movimiento reducido; oscuro si aplica).
- Los números: ancho del arte a 390, contrastes, requests a otros orígenes (debe ser vacío).
- La salida real de los comandos (`check-lottie.mjs`, pruebas, build). No pegues "todo verde" sin la salida.
- Lo que **no** pudiste comprobar, dicho claro (por ejemplo, "no probé la reproducción real, solo el frame de reposo").
