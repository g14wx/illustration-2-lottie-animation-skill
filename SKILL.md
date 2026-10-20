---
name: animate-illustrations-with-lottie
description: Anima un pack de ilustraciones SVG/PNG con licencia (animate illustrations, Lottie, lottie-web, LottieFiles Creator). Corta el arte en piezas, arma el rig (rig, pivots, skin/hair palette roles), anima personajes (idle, walk, wave, expresiones), props, fondos y escenas, valida con un gate, arma una galería de aprobación (approval gallery) y lo lleva a la web con lottie-web light (modo oscuro, movimiento reducido, carga diferida). Úsalo cuando pidan "animar ilustraciones", un zip de SVG/PNG, character animation, rig de personaje, exportar Lottie, "galería de aprobación" o poner animaciones Lottie en una app.
---

# Animar ilustraciones con Lottie

Sirve para cualquier proyecto y cualquier agente con terminal y Node 20 o más nuevo. Lo propio de cada proyecto (el pack, los
`parts.json`, los Lottie) vive en el repo de ese proyecto; este skill no trae arte de nadie. Sus fixtures son dibujo sintético.

`SK` = carpeta de este skill (por ejemplo `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos se corren desde la
carpeta del arte del proyecto, con `node SK/scripts/...`. Los scripts no tienen `--help`: sin argumentos imprimen el uso y salen con 2
(menos `autoprueba.mjs`, que sin argumentos corre toda la cadena).

## Qué produce
- `roles.json`: la paleta de autoría (color con que se dibuja -> token CSS `--illus-*`). Cambiar la marca es cambiar un token.
- `parts.json` por ilustración: piezas, pivotes, rig y plan de animación. Es la fuente de verdad.
- Un Lottie por ilustración (30 fps, 1000 x 1000, un marker por animación) que pasa el gate, y su `meta.repeats`.
- Una galería de aprobación (un solo HTML) y las plantillas de runtime web (`Illustration.tsx`, `illustration-vanilla.js`).

## Requisitos
- Obligatorio: Node >= 20 (solo biblioteca estándar) y python3 para `instalar.py`.
- Opcional: Chrome o Chromium (`CHROME=<ruta>`) y `lottie_light.min.js` (`LOTTIE_LIGHT=<ruta>`, o `npm i lottie-web@5.13.0 --save-exact`).
  Sin ellos todo funciona menos `render.mjs`, la captura de `index-svg.mjs --png` y abrir la galería. Dilo en el reporte.
- `python3 SK/instalar.py --revisar` dice qué falta. `node SK/scripts/autoprueba.mjs` comprueba que el skill funciona en esta máquina.

## Qué ruta tomar
1. **Ruta de código (por defecto).** `parts.json` -> `export-lottie.mjs` -> Lottie plano. Sin cuenta, sin pestaña, reproducible byte a byte,
   revisable en git y se puede hacer en paralelo. Obligatoria para props, fondos, escenas y reparto. Detalle: `referencias/06-ruta-codigo.md`.
2. **Ruta Creator (LottieFiles Creator por MCP).** Solo si un humano quiere poner o retocar keyframes a mano, o quiere ver el personaje
   piloto en el editor. Exige sesión iniciada, **una sola pestaña = un solo agente**, y un humano (o una extensión del navegador) hace
   los clics del export. Léela entera antes: `referencias/05-ruta-creator.md`.
3. Si ya tienes un Lottie animado hecho en Creator y quieres personajes nuevos con esa animación: `reskin.mjs`.
   En la ruta de código, un personaje nuevo suele ser una copia del `parts.json` con las piezas cambiadas.
4. Si el arte no sale de un pack (todo se dibuja en código), salta los pasos 1 a 3 del flujo (licencia, recibir el pack, mapear piezas); `roles.json`, `parts.json` y el rig siguen aplicando.
5. Si no hay Chrome ni player: exporta y pasa el gate, pero no declares "se ve bien". Di qué no pudiste mirar.

## Flujo de punta a punta
Una etapa a la vez. Los prompts listos para cada etapa están en `referencias/prompts.md` (E0 a E15).

1. **Licencia (humano).** Antes de derivar nada: ¿la licencia cubre modificar, crear derivados, animar y distribuir en un producto web?
   Pregúntalo por escrito al proveedor. Sin respuesta: rama privada, derivados solo en repos privados, galería no sale del equipo.
   -> `referencias/01-recepcion-del-pack.md`.
2. **Recibir el pack.** Extrae el zip **fuera del repo**. Inventario por nombre de archivo, mira los PNG de contacto y elige donantes
   (pose neutra, de frente o 3/4; de ellos solo lo que no cruza una articulación: cabeza, pelo, cara).
3. **Mapear piezas.**
   ```
   node SK/scripts/index-svg.mjs donante.svg --png indices.png      # número de cada elemento sobre el dibujo
   node SK/scripts/build-parts.mjs --list donante.svg               # índice, tag, relleno, bbox (en `path`, el largo de `d`)
   node SK/scripts/build-parts.mjs --colors donante.svg             # colores distintos y cuántos elementos usa cada uno
   ```
   Cada relleno va seguido de su aro de contorno: los índices van en pareja (`[18, 19]`).
4. **Paleta y piezas.** Escribe `roles.json` (6 a 8 roles; **piel y pelo con rol propio desde ya**) y `parts.json`
   (`plantillas/roles.ejemplo.json`, `plantillas/parts.ejemplo.json`, formato en `plantillas/parts.schema.md`).
   ```
   node SK/scripts/build-parts.mjs parts.json --roles roles.json    # escribe parts/<pieza>.svg; --nearest solo para descubrir
   ```
   Una pieza de donante que no encaja con el rig (otra escala, inclinada, espejada, de otro donante) lleva `transform` (`{ scale, rotate, mirror, dx, dy, about }`):
   `build-parts` lo hornea en el dibujo con `scripts/pathkit.mjs`. -> `referencias/02-piezas-y-paleta.md`.
5. **Rig.** Pivotes (`joints`), árbol (`rig`), z-order (`parts` de abajo hacia arriba), `limits`. Brazos y piernas **no se recortan del
   donante**: se dibujan como cápsulas con articulaciones redondas (`SK/ejemplos/extremidades.mjs`). -> `referencias/03-rig.md`.
6. **Animar.** `segments` y `plan` en el mismo `parts.json`, valores relativos al reposo. Personaje: `idle`, `walk`, `wave`, `point`,
   `happy`, `surprised`, `thinking`. Props: `idle` + una acción. Fondos: `idle` + `enter`. -> `referencias/04-animacion.md`.
   Un prop de punta a punta (copia `SK/ejemplos/bombilla.mjs`): `referencias/06-ruta-codigo.md` §7.
7. **Exportar y pasar el gate.**
   ```
   node SK/scripts/build-parts.mjs persona/parts.json --roles roles.json && \
   node SK/scripts/export-lottie.mjs persona/parts.json --roles roles.json --name persona     # lint del plan + export + z-order + reposo + gate
   node SK/scripts/check-lottie.mjs persona/persona.json --roles roles.json --parts persona/parts.json
   ```
   - `build-parts` va **siempre antes** de exportar (salvo piezas con `svg` propio, como los props y las extremidades de `ejemplos/`) y, si falla, no exportes:
     `export-lottie` lee `persona/parts/<pieza>.svg` de cada pieza sin `svg` propio, y un `parts/` viejo se usaría en silencio (solo avisa si es más viejo que `parts.json`).
   - El Lottie queda junto a `parts.json` (`persona/persona.json`); `--out` lo cambia.
   - Si falla el lint del plan **no escribe nada**. Si falla la verificación posterior (z-order, reposo, gate) el archivo **sí se escribe**, para poder mirarlo, y sale 1.
     Renderiza solo si el último export imprimió `ok`: un archivo viejo sigue en su sitio.
   - Si falla, **corrige `parts.json`, nunca el JSON exportado**, y vuelve a exportar. Cada regla del gate con su porqué: `referencias/07-gate.md`.
8. **Mirar con el player real** (un Chrome a la vez; `--at` son frames locales del segmento):
   ```
   node SK/scripts/render.mjs persona/persona.json --segment wave --at 0,18,36,60 --size 300 --out wave.png
   node SK/scripts/render.mjs persona/persona.json --frame 0 --map oscuro.json --bg "#292929" --out oscuro.png      # otra paleta sin re-exportar
   node SK/scripts/render.mjs persona/persona.json --rest-check --parts persona/parts.json    # ¿el player dibuja el reposo al inicio y al final de cada segmento?
   ```
   Lee los PNG (`--views parts.json` pinta una hoja con las poses que declaras). Acércate a hombros, codos, caderas y rodillas en las poses extremas. -> `referencias/10-verificacion-visual.md`.
9. **Piloto y galería (humano decide).** Un personaje con sus segmentos, nada más. Arma la galería, mide el contraste de la paleta y pide
   el OK antes de escalar:
   ```
   node SK/plantillas/build-galeria.mjs manifiesto.json --out galeria-final.html --player "$LOTTIE_LIGHT"
   ```
   `LOTTIE_LIGHT` tiene que estar definida: si queda vacía, el script avisa y la galería carga 5.12.2 desde cdnjs (necesita red). El manifiesto admite
   además `compose` (fondo + personaje apilados), `shots` (capturas de pantallas reales) y `notes` (contraste, límites aceptados).
   -> `referencias/09-galeria-y-aprobacion.md` (incluye el mensaje base para pedir la aprobación).
10. **Escalar (después del OK).** Reparto sobre el rig aprobado, props, fondos y escenas del pack con animación ligera, cada activo en su
    carpeta. Piel y pelo: `SK/scripts/split-roles.mjs` si el arte ya los compartía. Otra paleta: `SK/scripts/recolor.mjs`.
    Una galería nueva por avance, en la misma URL.
11. **Llevarlo a la web.** Copia `SK/plantillas/Illustration.tsx` (o `illustration-vanilla.js`): es el único archivo que importa `lottie-web`.
    Player fijado: `lottie-web@5.13.0`, build light. -> `referencias/08-web-runtime.md`.
12. **Verificar en navegador real** a 1280 y 390 px, con movimiento reducido, en oscuro si la app lo tiene. Recarga la página entera.
13. **Cerrar.** Commitea los exports **antes** de correr el gate en clon limpio. Entrega la salida real de los comandos, las rutas de
    los PNG y lo que no pudiste comprobar.

## Reglas que no se negocian
**Color**
- Las claves de `roles.json` son colores de autoría y **no se reescriben nunca**: cambia el valor del token. Si no, hay que re-exportar todo.
- Piel y pelo tienen rol propio desde el primer `parts.json` (`palette` por pieza). Solo el relleno; el contorno sigue siendo tinta.
- Todo color del Lottie está en `roles.json`. **Ningún color se anima**: el cambio de color es una pieza extra que cambia de opacidad.
- El color de marca dentro de una ilustración es **adorno**, sin el significado de acción que tiene en la interfaz, y ningún token de estado (advertencia, error) entra como decoración.
- Sin gradientes, sombras, efectos `ef`, máscaras, mattes, expresiones, slots, sólidos, imágenes ni texto. El gate los rechaza.

**Tiempo y movimiento**
- Pose de reposo = frame 0 de `idle`. Todo segmento empieza y termina ahí (salvo `offPoseStart`) y deja 3 o 4 frames quietos al final.
- Un frame de hueco entre markers (`tm` = fin anterior + 1). `export-lottie` lo hace solo.
- Lo que arranca solo dura **<= 5 s contando sus pasadas** y luego queda quieto; `enter` + `idle` de un fondo suman un solo tope.
  Sin loops continuos. Nada parpadea más de 3 veces por segundo. Ráfagas separadas por menos de 1 s comparten tope.
- Escala solo en el eje propio. Al hacer desaparecer una pieza la escala baja a 0,12 y se desvanece, nunca a 0 (el parpadeo de ojos llega a 0,1). El arte **no inventa progreso** (sin barras que se llenan, sin `walk` mientras carga).
- Menos de un tercio del rig se mueve a la vez (nodos con claves / todos los nodos del rig; cómo contar: `referencias/04-animacion.md`); easing sinusoidal (`io`) en los loops; anticipación y continuación.

**Dibujo**
- Contorno de ~1 px a la talla de pantalla: **4 unidades en personajes, 5 en props** (a 1000 px de lienzo). El gate no lo mide: el generador sí (`checkInkStroke` de `scripts/lib.mjs`).
- Los dos segmentos de una extremidad miden lo mismo en el pivote; el hijo no dibuja su borde superior; una tapa cubre la unión.
- Caras: tres bocas (neutra, sonrisa, "o") que se alternan por opacidad. Una cara no se deforma, se cambian piezas.
- Fondos para componer detrás de personajes: **zona calma** x 350 a 650, pies en y ~930, sin tinta ahí (se mide con `scripts/zona-calma.mjs`).

**Runtime web**
- `aria-hidden="true"`, cuadrado, sin texto ni `<title>` dentro. Es decorativo.
- Carga diferida con `IntersectionObserver`; sin él (SSR, jsdom) no se importa `lottie-web`. El JSON sale como archivo propio y el chunk
  de entrada no lleva el player.
- `loop = pasadas - 1`; antes de `goToAndStop` va `resetSegments(true)`; con movimiento reducido solo se ve el frame de reposo.
- **Recolor desde el contenedor** (`getComputedStyle(contenedor)`), nunca desde `<html>`: si no, el arte sale en negativo en modo oscuro.
- `onError` quita el bloque entero de arte. A 390 px el arte mide <= 342 px y no hay scroll horizontal.
- Versiones exactas, nunca `@latest`.

**Licencia y privacidad**
- El pack, sus SVG/PNG y sus rutas **no entran** al repo ni a ningún documento. Los derivados (piezas, Lottie, galería) solo en repos privados.
- Compruébalo antes de derivar. La galería incrusta arte derivado: privada hasta tener la licencia confirmada por escrito.

**Disciplina**
- Un solo Chrome headless a la vez, renders chicos (`--size 200` a `400`), perfil propio. Las herramientas y las capturas viven fuera de `/tmp`.
- No confíes en el "verde" que reporta un agente: corre tú el gate y mira los PNG. "Hecho" = salida real + captura vista.
- Lo que no verificaste lo dices como "no verificado".

## Puntos donde decide una persona
Si no responde, no sigas escalando "por si acaso". Puedes avanzar en lo que no depende de su decisión (herramientas, runtime).
| Cuándo | Qué decide |
|---|---|
| Antes de derivar | Licencia: el alcance sobre modificar, derivados, animar y distribuir |
| Piloto listo | Estilo y movimiento aprobados en la galería **antes de hacer el reparto** |
| Paleta | Piel y pelo: tres pares candidatos renderizados, con la tabla de contraste; límites aceptados por escrito |
| Antes de montar | Tabla aprobada pantalla -> arte -> segmento -> cuándo se mueve (sin tabla, propón una; no inventes). Un icono neutro se puede sustituir por la ilustración; el icono de **estado** (error, éxito) se queda junto al arte, con texto y color |
| Si las reglas de diseño prohíben animación, dependencias nuevas o héroes | Una excepción escrita y acotada (dónde sí, dónde no, límites) y la enmienda del documento de diseño, antes de montar |
| Export en Creator | Los clics del export (si no hay extensión del navegador) |
| Antes de fusionar | Aprobación final del conjunto y confirmación de la licencia |

Al mostrar capturas del editor de Creator, avisa que lo primero que se ve es un **cuerpo de prueba** del rig, no el arte final.

## Cómo verificar
1. Gate: `node SK/scripts/check-lottie.mjs X.json --roles roles.json --parts parts.json` sale 0 (siempre con `--parts`).
2. Pruebas: `node --test` desde la raíz del skill (sin argumentos: con directorio falla en Node 24). Cadena completa: `node SK/scripts/autoprueba.mjs`.
3. Render de los frames clave con el player real; primer y último frame iguales al reposo (`render.mjs --rest-check`); articulaciones sin huecos; contorno legible.
4. Galería: monta todas las tarjetas, paleta A/B y modo oscuro con `--paper`, movimiento reducido.
5. Pantallas reales a **1280 y 390 px**, normal y con `prefers-reduced-motion: reduce` (el SVG no cambia durante 1 s), oscuro si aplica:
   sin scroll horizontal, arte <= 342 px a 390, solo requests al mismo origen, consola sin errores, JSON respondido con 404 por intercepción -> desaparece el bloque entero.
6. Contraste con la fórmula WCAG sobre los `fill` renderizados: texto 4,5:1, bordes de controles 3:1, rasgos de la cara sobre la piel 3:1.
7. Entrega: rutas de los PNG, números medidos, salida real de los comandos y lo que no pudiste comprobar.
   Detalle y esqueleto de `puppeteer-core`: `referencias/10-verificacion-visual.md`.

## Con y sin workflows
- **Cualquier agente (secuencial).** Una etapa a la vez, de preferencia en una sesión nueva por etapa (arranca liviana). Copia el prompt de
  `referencias/prompts.md`, resuelve las variables (`SK`, `P`, `W`, `PACK`, `ID`) y corre: constructor, luego verificador, luego arreglo.
- **Claude Code (en paralelo).** Lanza subagentes con la herramienta de agentes o un script de workflow (skill `workflow-authoring`).
  - En paralelo: el arte fuera de línea de cada personaje, prop, fondo o escena (cada uno en su carpeta), los verificadores y los renders.
  - En secuencia: todo lo de Creator (una pestaña = un agente), la galería y cualquier archivo que dos agentes escribirían.
  - Cada subagente recibe solo el prompt de su etapa con las variables resueltas, su carpeta y el formato del reporte. Agentes cortos
    (tope de ~40 pasos): uno largo relee toda su conversación en cada paso y cuesta más.
  - Forma de cada etapa: un **constructor**, uno o dos **verificadores adversariales** (lentes: "especificación y gates" y "UX,
    accesibilidad y rendimiento") y un agente de **arreglo** que confirma cada problema antes de tocar nada. Para el arte, un **director
    de arte** que devuelve `{ pass, score, fixes }` (máximo dos rondas).
  - Modelo intermedio para subagentes: lo mecánico rinde bien; el grande, para decidir e integrar.

## Mapa de archivos
`SK` = esta carpeta. Léelos cuando llegues a la etapa; no todos de golpe.

| Archivo | Para qué |
|---|---|
| `referencias/01-recepcion-del-pack.md` | Licencia, zip, inventario, donantes, overlay de índices, qué no se commitea |
| `referencias/02-piezas-y-paleta.md` | `roles.json`, `build-parts` paso a paso, tolerancia de color, piel y pelo, tokens por tema |
| `referencias/03-rig.md` | `parts.json` campo por campo, pivotes, z-order, cápsulas, contorno, pose neutra, bocas, reparto, rig en Creator |
| `referencias/04-animacion.md` | Segmentos, recetas de personaje, props, fondos y escenas, presupuestos |
| `referencias/05-ruta-creator.md` | LottieFiles Creator por MCP: preparación, reglas duras, receta, export, trampas |
| `referencias/06-ruta-codigo.md` | La ruta por defecto, flujo con los CLI, `reskin`, `split-roles`, composición, un prop nuevo |
| `referencias/07-gate.md` | Cada regla de `check-lottie` con su mensaje, su porqué y su arreglo; cómo agregar una |
| `referencias/08-web-runtime.md` | Player, carga diferida, fachada, reproducción, movimiento reducido, escena compuesta, `segmentFor`, modo oscuro |
| `referencias/09-galeria-y-aprobacion.md` | Galería, paletas A/B, números de contraste, publicarla en privado, ciclo de aprobación y mensaje base |
| `referencias/10-verificacion-visual.md` | Chrome headless, `render.mjs`, `puppeteer-core`, 1280 y 390, contraste, evidencia |
| `referencias/11-lecciones.md` | Errores que pasaron (síntoma -> causa -> arreglo) y trampas ya evitadas |
| `referencias/12-caso-real.md` | La sesión de origen contada de forma genérica: etapas, números y decisiones |
| `referencias/prompts.md` | Prompts E0 a E15 para copiar y pegar, y cómo repartir con subagentes |
| `plantillas/parts.schema.md` | Formato exacto de `parts.json` (y `split.json`) |
| `plantillas/parts.ejemplo.json`, `roles.ejemplo.json`, `paletas.ejemplo.json` | Ejemplos para copiar |
| `plantillas/Illustration.tsx`, `illustration-vanilla.js` | Fachada de runtime (React 19 / sin framework) |
| `plantillas/segment-for.example.mjs` | `segmentFor` y `propFor` puros (reaccionar solo a cambios reales), con su prueba de tabla |
| `plantillas/galeria.html`, `build-galeria.mjs` | Galería de aprobación y su constructor |
| `ejemplos/bombilla.mjs`, `extremidades.mjs` | Generadores de ejemplo: un prop y un brazo con articulaciones |
| `fixtures/` | Dibujo sintético para probar (`LEEME.md`): personaje, reloj y 13 Lottie malos que el gate debe rechazar |

| Script (`node SK/scripts/...`) | Uso |
|---|---|
| `index-svg.mjs` | `<donante.svg> [--out index.html] [--png index.png] [--size 1000]` |
| `build-parts.mjs` | `<parts.json> [--roles roles.json] [--out carpeta] [--nearest]`, o `--list <donante.svg>`, o `--colors <donante.svg>` |
| `export-lottie.mjs` | `<parts.json> [--out anim.json] [--name nombre] [--roles roles.json] [--parts-dir carpeta] [--max-kb N]` |
| `check-lottie.mjs` | `<anim.json> [--roles roles.json] [--parts parts.json] [--max-kb 200] [--max-frames 450]` |
| `render.mjs` | `<anim.json> [--frame 0,30 \| --segment nombre [--at 0,18] \| --views parts.json] [--size 400] [--out out.png] [--lottie-light ruta] [--map mapa.json] [--bg "#fff"] [--cols 4]`, o `--rest-check [--parts parts.json]` |
| `zona-calma.mjs` | `<fondo.png> [--x 350,650] [--y 80,930] [--margen 10] [--oscuro 100] [--max 0.05]`: % de tinta en la zona calma de un fondo (el PNG sale de `render.mjs fondo.json --frame <inicio de idle> --size 1000 --out fondo.png`; con otro `--size` falla) |
| `recolor.mjs` | `<anim.json> (--vars vars.json \| --map mapa.json) [--roles roles.json] [--out out.json]` |
| `split-roles.mjs` | `<split.json> (--spec parts.json \| --lottie a.json,b.json) [--roles roles.json] [--parts-dir carpeta] [--dry]` |
| `reskin.mjs` | `<base.json> <skin.json> <out.json>` |
| `autoprueba.mjs` | `[--salida carpeta] [--sin-unitarias]`: pruebas y cadena completa sobre los fixtures |

`lib.mjs` (compartida) y `pathkit.mjs` (mover, girar, espejar y escalar paths) son bibliotecas; los `*.test.mjs` son las pruebas (`node --test`).
