# 07 · El gate: `check-lottie` y las comprobaciones del export

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

Un Lottie no se entrega si el gate no pasa. Aquí está cada regla, **por qué existe**, cómo leer un fallo y cómo agregar otra.

## 1. Qué es y cómo se corre
```
node SK/scripts/check-lottie.mjs <anim.json> [--roles roles.json] [--parts parts.json] [--max-kb 200] [--max-frames 450]
```
- Sirve para un Lottie exportado por Creator o por `export-lottie.mjs`. Solo Node, sin dependencias.
- Sale **0** e imprime `ok <archivo> (N layers, M markers, X KB)`. Con fallos imprime cada uno en stderr como `FAIL <archivo>: <mensaje>` y sale **1**. Sin argumentos o con una flag desconocida imprime el uso y sale **2**.
- `--roles`: por defecto el `roles.json` que esté junto al archivo, una carpeta arriba o en la carpeta actual. Sin él, error claro.
- **`--parts` es lo que activa la revisión de markers y de duración.** Es el mismo `parts.json` de la ilustración (de ahí salen los `segments`). Sin `--parts` solo se detectan nombres de marker repetidos. Pásalo siempre.
- `export-lottie` ya lo corre solo al exportar. Córrelo tú después de un export de Creator, de `reskin`, de `split-roles` y en CI.

## 2. Las reglas y el porqué
Los mensajes están tal cual los imprime el script. `<ruta>` es una ruta dentro del JSON (ver sección 3).

### Formato y peso
| Regla | Mensaje | Por qué |
|---|---|---|
| 30 fps | `fr must be 30 (got N)` | los markers van en frames y la cuenta de 5 s usa `fr` |
| Lienzo 1000×1000 | `canvas must be 1000x1000 (got WxH)` | piezas, fondos y personajes se apilan sin transformaciones, y el slot es cuadrado |
| Sin 3D | `ddd must be 0 (3D)`, `3D layer at <ruta>` | el renderer SVG de `lottie_light` no hace 3D: en el build 5.13.0 la cadena `ddd` ni aparece (no la lee) y una cámara lanza "Try the html renderer" (verificado leyendo el build, ver abajo) |
| ≤ 450 frames | `duration N frames > 450 (ip I, op O)` | un archivo de 15 s como techo; tope junto con el peso |
| ≤ 200 KB crudo | `size X KB > 200 KB` | peso en la ruta de carga. Empezó en 120 y se subió a 200: un personaje real de 28 piezas pesa 157 KB y **lo da la estructura, no la animación**. Ajustable con `--max-kb` |

### Lo que `lottie_light` no reproduce o que se veta
| Regla | Mensaje | Por qué |
|---|---|---|
| Sin expresiones | `expression (x) at <ruta>` | el build light no trae motor de expresiones. Se detecta una propiedad `x` que sea texto (las curvas de easing llevan `x` numérico) |
| Sin slots | `sid (slot) at <ruta>` | los slots son de otro runtime; el recolor por rol los sustituye |
| Sin efectos | `effects (ef) at <ruta>` | sombras, desenfoques, tintes y rellenos de capa. Ver nota abajo |
| Sin máscaras | `mask at <ruta>` | **veto por decisión, no por límite del player** |
| Sin mattes | `matte at <ruta>` | igual: cada máscara o matte agrega elementos SVG que se recalculan por frame y complica el rig |
| Sin remapeo de tiempo | `time remap (tm) at <ruta>` | motivo no documentado en el caso; se deduce que rompe la cuenta de frames de los markers |
| Tipos de capa | `layer type N (solid/image/text/audio/camera/unknown) not allowed at <ruta>` | solo se permiten precomp (0), null (3) y forma (4) |
| Tipos de forma | `shape type 'xx' not allowed at <ruta>` | lista blanca: `gr sh el rc sr fl st tr tm rd` (el resto, por ejemplo `rp`, se rechaza) |
| Sin gradientes | `gradient fill (gf) at <ruta>`, `gradient stroke (gs) at <ruta>` | el recolor por rol solo ve rellenos y trazos lisos; el estilo es plano |

Notas:
- **Sólido (`ty` 1), imagen (2) y texto (5):** `lottie_light` sí soporta sólidos, pero el recolor solo ve fills y strokes de **capas de forma**: un fondo sólido no seguiría el tema. Los fondos se dibujan como formas. El texto necesita fuentes (sin CDN) y no se recolorea: un signo de interrogación se dibuja como formas vectoriales. Una imagen es un raster que pesa y no se recolorea.
- **Efectos:** la decisión original decía que el build light no trae los filtros de relleno, tinte, sombra ni desenfoque; un comentario del script decía lo contrario. Leyendo el build 5.13.0 (receta abajo): `lottie_light.js` define el mecanismo de efectos pero **no registra ninguno** (0 llamadas a `registerEffect`), y el build completo registra 10 (tinte, relleno, trazo, tritono, niveles, sombra, desenfoque, transformación…). Quien manda es el build: en light un `ef` se lee y **no se pinta**. Vetados igual, y ahora con el porqué.
- **Cómo se comprobó lo que soporta el player (receta de 4 líneas).** Se lee el build publicado **sin ejecutarlo**, en una carpeta temporal fuera del repo:
  ```
  d=$(mktemp -d) && cd "$d" && npm pack lottie-web@5.13.0 && tar xzf lottie-web-5.13.0.tgz     # baja el tarball; no instala ni corre nada
  P=package/build/player; grep -cE 'registerEffect\$?1?\([0-9]+,' $P/lottie_light.js $P/lottie.js   # efectos con renderer: 0 en light, 10 en el completo
  grep -c ddd $P/lottie_light.js; grep -nE "registerModifier\('" $P/lottie_light.js                  # 3D (0) y modificadores de forma (tm pb rp rd zz op)
  sed -n '/createItem = function/,/^  };/p' $P/lottie_light.js                                      # tipos de capa que crea
  ```
  Haz lo mismo con cada versión nueva antes de subir la fijada. Resultado en 5.13.0: capas precomp, sólido, imagen, null, forma, texto y audio se crean (la cámara lanza error); sin efectos; sin 3D.
- **Máscaras y mattes:** si un fondo con recortes de verdad los necesita, se levanta la regla **escribiendo una nota con el motivo**.

### Color
| Regla | Mensaje | Por qué |
|---|---|---|
| Todo color en `roles.json` | `color #rrggbb not in roles.json at <ruta>` | el tema funciona porque cada color de autoría tiene un token. Una vez por color distinto, con el primer lugar donde aparece. Se compara tras **redondear a 8 bits** (Creator escribe 4 decimales: `0.0824` → `#151515`) |
| Ningún color animado | `animated color at <ruta>` | el recolor salta los colores animados (se quedarían en el color de autoría para siempre). Los cambios de color son piezas superpuestas con opacidad |
| Color legible | `unreadable color at <ruta>` | el color no es un arreglo de 3 o más números |

### Precomps
| Regla | Mensaje | Por qué |
|---|---|---|
| Capa de 1000×1000 | `precomp layer is WxH, must be 1000x1000 at <ruta>` | `lottie_light` recorta cada capa precomp con **su propio** `w`/`h` y nunca lee el del asset. Creator da 500×500 con `create_scene_layer` |
| Con `refId` | `precomp layer without refId at <ruta>` | no hay a qué apuntar |
| `refId` resuelto | `refId "x" not found in assets at <ruta>` | referencia rota |

También revisa las capas **dentro** de cada precomp (`assets[n].layers[i]`).

### Markers y movimiento (con `--parts`)
| Regla | Mensaje | Por qué |
|---|---|---|
| Nombre único | `marker name "x" is repeated` | el player encuentra siempre el primero (también sin `--parts`) |
| Enteros | `marker "x" tm/dr must be integers, dr >= 1 (got tm/dr)` | el player trabaja en frames |
| Dentro del archivo | `marker "x" [a,b] outside [ip,op]` | |
| Sin solaparse | `markers "a" and "b" overlap` | pueden tocarse (fin = inicio del siguiente), no pisarse |
| Presentes | `marker "x" missing` | cada segmento declarado en `parts.json` debe existir |
| `repeats` válido | `segment "x" repeats must be an integer >= 1` | |
| Tope de 5 s | `autoplay "x" lasts N s > 5 s` | **WCAG 2.2.2** (pausar, detener u ocultar): lo que empieza solo y dura más de 5 s necesita un control. Lo que arranca al llegar con el scroll **cuenta como "empieza solo"**. Duración = `dr / fr × repeats` |
| `enter` + `idle` | `autoplay "enter" + "idle" last N s > 5 s (the facade chains them as one burst)` | la fachada junta las ráfagas separadas por < 1 s. Solo salta si cada uno por separado cabe en 5 s |

## 3. Cómo leer un fallo
- Formato: `FAIL <archivo>: <mensaje>`. Lee el **primero**: uno solo puede producir varios (un marker repetido da también "overlap").
- Rutas dentro del JSON:
  - `layers[2]("arm")` = la tercera capa, de nombre `arm`;
  - `.shapes[0].it[2].c` = el color del tercer elemento de la primera forma;
  - `.ks.r` = la rotación;
  - `assets[0].layers[0]` = una capa dentro de una precomp.
- **Arregla en la fuente** (el `parts.json` o el generador) y vuelve a exportar. No edites el JSON a mano: se pierde en la siguiente corrida.
- Causas típicas:

| Fallo | Causa probable | Arreglo |
|---|---|---|
| `precomp layer is 500x500` | `create_scene_layer` en Creator | rehacer con `group_layers` |
| `color #xxxxxx not in roles.json` | un color del donante sin mapear | `palette` del `parts.json` o `build-parts --nearest` |
| `animated color` | cambio de color con claves | pieza extra con opacidad |
| `autoplay "idle" lasts 5.9 s` | demasiados frames o `repeats` | bajar `dr` o `repeats` |
| `marker "x" missing` | nombre mal escrito en `add_segment` o `segments` | corregir el nombre |
| `size > 200 KB` | demasiadas piezas o claves | quitar piezas o claves (no decimales) |
| `duration > 450` | segmentos de más | acortar o quitar |

## 4. Lo que revisa el export (`export-lottie`)
`check-lottie` mira el JSON. `export-lottie` mira además el **plan** antes de exportar y la **pose** después, leyendo el JSON exportado. Qué escribe y cuándo: si falla el **lint del plan** (abajo) **no escribe nada** y sale 1; si falla la **verificación de pose** o el **gate**, el archivo **sí se escribe**, para poder mirarlo con `render`, y sale 1. Cuidado: un archivo viejo de una corrida anterior sigue en su sitio; no renderices nada si el último `export-lottie` no imprimió `ok`.

**Antes del lint:** las piezas sin `svg` propio se leen de `<carpeta de parts.json>/parts/<pieza>.svg` (lo escribe `build-parts`). Sin ellas sale 1 con `no SVG in …: run build-parts first`; si los SVG son más viejos que `parts.json` avisa por stderr (`warning: N piece SVG(s) older than parts.json`) y exporta igual. Corre siempre `build-parts` antes y no exportes si falla (`build-parts … && export-lottie …`): con una carpeta `parts/` vieja de antes, un `build-parts` que falló no la borra y el export usaría el dibujo viejo.

**Lint del plan (antes de exportar).** Cada mensaje empieza con `<nombre>:`.
- `part name "x" is repeated`; `"x" is both a part and a rig node (layer names must be unique)`.
- `joint "j" is not in joints`; `parent "p" is not a rig node`; `parent cycle`; `part "p": node "n" is not in rig`.
- `segment "s" has no entry in plan.keys`; `plan segment "s" is missing in segments`.
- `dr must be an integer >= 1`; `autoplay lasts more than 5 s`; `total N frames > 450`.
- `unknown channel (x y r s sx sy o)`; `key target "x" is neither a rig node nor a part`.
- `views.<segmento>: segment is not in plan.keys`; `views.<segmento>: frames must be integers 0..dr`.
- `keys not increasing at frame N`; `keys must span frames 0..dr`; `starts at V, rest is R`; `ends at V, rest is R`; `value V at frame F outside limits [a,b]`.

**Verificación de pose (después de exportar).**
- `z-order: export … ≠ parts.json (top first) …`.
- Cada segmento, en tres frames, comparado con el reposo (frame 0): inicio (`tm`) y fin (`tm + dr`) **exactos**; y el frame `tm + dr - 1` con tolerancia (2,5 px de posición, 3 % de escala, 0,6° de giro, 5 % de opacidad). Mensaje: `<nombre>/<segmento> start|end|end-1 (fN): "capa" is […], rest is […]`.
- Por qué `end-1`: el player termina un segmento en `dr - 1` y la fachada salta luego al reposo. Si ahí no está asentado, se ve un salto.
- `offPoseStart` exime el **inicio** de esos nodos (un fondo que entra, un sobre que vuela); el final sigue estricto.
- **La pose se verifica dos veces:** sobre el JSON exportado (lo de arriba) y sobre lo que **dibuja el player**: `node SK/scripts/render.mjs anim.json --rest-check --parts parts.json` carga cada segmento en `lottie_light`, y compara el SVG del frame 0 contra el primer y el último frame (`SAME` / `DIFF`; sale 1 si hay un `DIFF`; el inicio de los segmentos con `offPoseStart` no se mide). Atrapa lo que un cálculo sobre el JSON no ve.

## 5. Fixtures que deben fallar
Un gate que no se puede probar que falla no es un gate. Hay un fixture válido y uno malo por regla importante:

| Fixture | Regla |
|---|---|
| `fixtures/check/valid.json` + `parts.json` | **pasa** (`ok`) |
| `bad-expression.json` | `expression (x) at layers[1].ks.r` |
| `bad-effects.json` | `effects (ef) at layers[0]` |
| `bad-mask.json` | `mask at layers[0]("body")` |
| `bad-matte.json` | `matte at layers[0]("body")` |
| `bad-slot.json` | `sid (slot) at …` |
| `bad-gradient.json` | `gradient fill (gf) at …` |
| `bad-text-layer.json` | `layer type 5 (text) not allowed at …` |
| `bad-animated-color.json` | `animated color at …` |
| `bad-color-not-in-roles.json` | `color #ff0000 not in roles.json at …` |
| `bad-precomp-size.json` | `precomp layer is 500x500, must be 1000x1000 at layers[2]("arm")` |
| `bad-missing-marker.json` | `marker "wave" missing` |
| `bad-duplicate-marker.json` | `marker name "wave" is repeated` (y `overlap`) |
| `bad-too-long.json` | `duration 600 frames > 450` |
| `parts-autoplay-largo.json` (con `valid.json`) | `autoplay "idle" lasts 5.9 s > 5 s` |

El resto de reglas (fps, lienzo, 3D, sólido, imagen, audio, remapeo, formas, gradiente de trazo, color ilegible, markers no enteros o de 0 frames o fuera de rango o solapados, `refId`, precomp sin `w`/`h`, `repeats` inválido, `enter` + `idle`, capas dentro de precomps, `--max-kb`, `--max-frames` y el redondeo de color) se prueban **mutando el válido** dentro de `scripts/check-lottie.test.mjs`.

Cómo correrlo:
```
node --test                          # desde la raíz del skill (SK); busca todos los *.test.mjs
node SK/scripts/autoprueba.mjs          # cadena completa sobre los fixtures; cada bad-*.json debe salir 1
```
- `node --test scripts/` (con directorio) **falla en Node 24** (`Cannot find module .../scripts`). Usa `node --test` sin argumentos.
- Lo que necesita Chrome o `lottie_light.min.js` se omite con una línea clara si faltan (`LOTTIE_LIGHT=<ruta>`, `CHROME=<ruta>`).

## 6. Lo que el gate NO mira
Está bien: algunas cosas dependen del arte y no se pueden decidir desde el JSON. Cada una tiene otro dueño.

| Qué | Quién lo cubre |
|---|---|
| Contorno mínimo (5 en props, 4 en personajes) | el generador: `checkInkStroke(parts, '#tinta', 5)` de `scripts/lib.mjs` (los dos ejemplos lo llaman) |
| Zona calma del fondo (x 350–650, pies en y ≈ 930) | el generador y `node SK/scripts/zona-calma.mjs fondo.png` sobre el fondo solo (`04-animacion.md` §4) |
| Pose de reposo y z-order | `export-lottie` y `render.mjs --rest-check` (sección 4) |
| Contraste (texto 4,5:1; rasgos sobre piel ≥ 3:1) y legibilidad a 160/240 px | `render.mjs` con `--map` y revisión en el navegador a 1280 y 390 px |
| Parpadeos > 3 por segundo (WCAG 2.3.1) | diseño |
| "Nada que parezca progreso" | diseño y revisión humana |
| Que `meta.repeats` coincida con `parts.json` y cada segmento con sus pasadas quepa en 5 s | una prueba del proyecto que compara la tabla de pasadas de la fachada con cada `parts.json` |
| Que el arte se vea bien en oscuro | la galería (interruptor de arte oscuro) y `render --map` |
| La licencia del pack | una persona |

Las dos primeras (contorno y zona calma) **no se metieron al gate a propósito**: dependen del arte y serían una abstracción sin uso confirmado.

## 7. Cómo agregar una regla
1. **Decide si es del gate.** Va al gate si se decide mirando solo el JSON y vale para cualquier arte. Si depende del arte (un grosor, una zona), va al generador de esa ilustración.
2. **Escríbela** en `check()` de `scripts/check-lottie.mjs`: una línea que llame a `err('mensaje corto en inglés')` con la ruta (`at ${p}`). Ejemplo hipotético: `if (l.hd) err('hidden layer at ' + p);`.
3. **Arma el fixture:** copia `fixtures/check/valid.json`, haz el cambio mínimo que rompe la regla y guárdalo como `fixtures/check/bad-<regla>.json`.
4. **Agrega la prueba** en `scripts/check-lottie.test.mjs`: una línea `['bad-<regla>.json', 'mensaje']` en la lista del CLI, o una mutación `['etiqueta', (j) => …, 'mensaje']` en la lista de `check()`.
5. **Corre** `node --test` y `node SK/scripts/autoprueba.mjs`. La autoprueba toma sola todo `bad-*.json` y exige salida 1.
6. **Documenta** la regla en la tabla de este archivo con su porqué. Una regla sin porqué se levanta a la primera queja.
7. Si la regla nueva depende de `parts.json`, agrega el campo a `plantillas/parts.schema.md`.
8. **Si cambias una herramienta compartida** (`export-lottie`, `check-lottie`, `build-parts`, `pathkit`), regenera **todos** los activos ya commiteados (todos los `parts.json`, con `build-parts` y luego `export-lottie`) y exige `git diff --quiet` sobre los exports: una herramienta que solo agrega una función no debe cambiar ni un byte de lo que ya existe. Si el diff no está vacío, eso es un cambio de comportamiento: se revisa y se aprueba aparte.

## 8. En CI y en un clon limpio
- **Commitea los exports antes del gate.** Un gate que compara "regenerado contra commiteado" falla mientras no se commitea, y `git add -N` dio falsos fallos. La salida del exportador es estable byte a byte, así que sirve para ese chequeo.
- Los gates que buscan frases exactas en documentos se rompen cuando alguien cambia el texto a propósito: busca la regla que sigue vigente, no la frase.
- Un chequeo que prohíbe colores `#hex` sueltos en el código también escanea las pruebas: marca los valores de prueba con la excepción del proyecto. (`roles.json` guarda los colores de autoría en JSON, fuera de ese escaneo.)
- **Un solo Chrome headless a la vez.** Una corrida falló por timeout cuando dos sesiones cargaban la máquina; corre las pruebas con Chrome en ventanas "sin carga".
