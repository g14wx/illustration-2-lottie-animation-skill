# 06 · Ruta de código (la ruta por defecto)

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

De las piezas al Lottie sin abrir Creator: un `parts.json` (piezas + rig + plan de animación) y un script que escribe el JSON.
Es la ruta que se usó para los props, los fondos, las escenas del pack y el reparto. Usa Creator (`05-ruta-creator.md`) solo si un humano quiere keyframes a mano.

Formato de `parts.json`: `SK/plantillas/parts.schema.md`.

## 1. Por qué es la ruta por defecto
Descubrimiento clave de la sesión: **no hace falta Creator para exportar.**

| | Código (`export-lottie.mjs`) | Creator por MCP |
|---|---|---|
| Quién lo hace | cualquier agente, en paralelo | un agente, en secuencia (una pestaña) |
| Necesita | Node | cuenta con sesión, pestaña viva y un humano para el export |
| Resultado | idéntico byte a byte entre corridas | depende de la sesión |
| Revisión | `git diff` del `parts.json` | clics en una UI |
| Verificación | al exportar: z-order, reposo y gate | gate después |
| Se pierde | nada: todo está en archivos | el trabajo de la pestaña si no hay sesión |
| Ajuste fino a mano | hay que pensar en números | UI con cabezal y curvas |

- **Estructura del Lottie:** una **composición plana**. Cada nodo del rig es una capa null (`ty` 3) con `parent`; cada pieza es una capa de forma (`ty` 4) en coordenadas del lienzo, hija de su nodo. Orden de z = orden de `parts` (la primera pieza va al fondo).
- **Por qué plano y no con precomps:** con precomps (`group_layers` de Creator) una pieza de otro grupo **no se puede intercalar** en el z-order. El sobre lo necesita: la carta va **entre** la solapa y el bolsillo. En plano, el z-order de `parts.json` es la verdad.
- Lleva `meta.repeats` copiado de `segments`, para que el runtime no repita esa tabla a mano.
- Las herramientas **viven en el repo, no en `/tmp`**. Se perdieron capturas y notas dos veces al reiniciar la sesión.

## 2. Flujo completo
```
# 1 inventario del donante
node SK/scripts/index-svg.mjs donante.svg --out donante.index.html --png donante.index.png
node SK/scripts/build-parts.mjs --list donante.svg        # índice, tag, relleno y bbox por elemento (en `path`, el largo de `d`)
node SK/scripts/build-parts.mjs --colors donante.svg      # colores distintos y cuántos elementos usa cada uno
# 2 escribir persona/parts.json (copia SK/plantillas/parts.ejemplo.json) y roles.json (SK/plantillas/roles.ejemplo.json)
# 3 piezas normalizadas -> persona/parts/<pieza>.svg   (SIEMPRE antes de exportar; si falla, no exportes)
node SK/scripts/build-parts.mjs persona/parts.json --roles roles.json            # --nearest acerca colores casi iguales
# 4 exportar: revisa el plan, exporta, verifica y corre el gate. Escribe persona/persona.json (junto a parts.json; --out lo cambia)
node SK/scripts/export-lottie.mjs persona/parts.json --roles roles.json --name persona
# 5 mirarlo con el player real
node SK/scripts/render.mjs persona/persona.json --segment wave --at 0,18,36,60 --size 300 --out wave.png
```
Con los dos primeros en cadena: `node SK/scripts/build-parts.mjs persona/parts.json --roles roles.json && node SK/scripts/export-lottie.mjs persona/parts.json --roles roles.json --name persona`.
- **Dónde queda el Lottie:** `<carpeta de parts.json>/<nombre>.json` (con `--name persona` y `persona/parts.json`: `persona/persona.json`), o donde diga `--out`. Sin `--name`, el nombre es el de la carpeta.
- **`export-lottie` depende de `parts/`:** lee `persona/parts/<pieza>.svg` de cada pieza sin `svg` propio. Sin esa carpeta sale 1 con `run build-parts first`;
  con una carpeta vieja de antes y un `build-parts` que falló, exportaría el dibujo viejo (solo avisa por stderr si los SVG son más viejos que `parts.json`).
- **Qué escribe cuando falla.** Si falla el **lint del plan** no escribe nada y sale 1. Si falla la verificación posterior (z-order, reposo, gate) el archivo **sí se
  escribe**, para poder mirarlo con `render`, y sale 1. Un archivo viejo de una corrida anterior sigue en su sitio: renderiza solo si el último export imprimió `ok`.
- `export-lottie` corre solo `check-lottie` (con `roles.json` y `parts.json`). No hace falta repetirlo salvo en CI.
- Para ver lo que **dibuja el player** (no solo el JSON): `node SK/scripts/render.mjs persona/persona.json --rest-check --parts persona/parts.json` y `--views persona/parts.json` (hoja de poses).
- `roles.json` se busca junto al archivo, una carpeta arriba o en la carpeta actual.

### Elegir donantes y piezas
- Haz inventario por **nombre de archivo** del pack y elige donantes por pose y por piezas útiles (una cabeza, un peinado, manos, zapatos).
- Los SVG de estos packs traen: fills por clase `.cls-N` en un `<style>`, `<line>` invisibles, un relleno más un `path` negro (aro/contorno) por pieza, colores muy parecidos pero no iguales y pieles de varios tonos. `build-parts` lo normaliza.
- **Cada relleno viaja con su aro:** el índice del aro es el siguiente. Una pieza = `[relleno, aro]`.
- `index-svg` dibuja el número de cada elemento sobre el SVG (HTML con filtro "solo estos" y PNG): así se escribe "cabeza = elementos 18-19".
- `build-parts` falla en voz alta ante una clase sin regla, un `fill`/`stroke` que no sea `#rrggbb` o `none`, `style=` o un `<g>` con `class`/`fill`/`stroke`/`style`/`transform`. Y avisa por stderr si el donante no trae `viewBox="0 0 1000 1000"` (sus piezas no coincidirían con el lienzo: escálalo antes). Un color fuera de la paleta es error (se listan todos).
- **`palette` por pieza desde el principio:** piel y pelo con su propio color de autoría (ver sección 5).
- Un pack comercial puede **no cubrir derivados** (piezas recortadas, personajes nuevos, animación). Confirma el alcance con el proveedor. Los derivados se commitean solo en repos privados y las galerías con arte derivado no se comparten fuera del equipo hasta confirmarlo.

## 3. Piezas dibujadas en código (`ejemplos/`)
Una pieza con `svg` propio (en vez de `donor` + `indices`) se dibuja a mano o por script, en coordenadas del lienzo.
- Solo `path`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`. Colores `#rrggbb` que existan en `roles.json`. Sin gradientes. Los arcos de `path`, **circulares** (`rx = ry`). Comandos de `path`: `M L H V Q C S T A Z`. En un `rect`, solo `transform="translate(x y) rotate(a)"`.
- Las piezas con `svg` propio no pasan por la validación de paleta de `build-parts`: sus colores los ve `check-lottie` después del export.
- **Extremidades** (`ejemplos/extremidades.mjs`): no se recortan del donante, se redibujan como **cápsulas con articulaciones redondas**. Se pueden importar (`limb`, `limbRig`, `capsule`) sin copiar nada; si copias el archivo a tu proyecto, cambia su `import` de `../scripts/lib.mjs` a la ruta real de `SK/scripts/lib.mjs`. Un brazo recortado deja un borde de aro a la vista y un hueco al girar el codo. La regla:
  1. los dos segmentos miden **lo mismo** en el pivote y llevan el mismo contorno (4 unidades a 1000 px: ~1 px en pantalla);
  2. el segmento padre dibuja su arco exterior; el hijo **no** dibuja su borde superior (trazo abierto);
  3. orden de abajo hacia arriba: mano, brazo, antebrazo, **tapa** del brazo (copia sin trazo, 4 unidades más estrecha de ancho: `w - 4`, con solo el arco del extremo con contorno);
  4. cada pieza cuelga del nodo de **su** articulación (hombro → codo → muñeca); la mano es un disco sobre la muñeca, bajo el antebrazo.
- **Objetos** (`ejemplos/bombilla.mjs`): velo `glow` + `filamentOn` por la regla de "ningún color se anima"; rayos verticales con `at` y `rot`; escala mínima 0,12; contorno en su propia pieza por encima del velo; todo trazo de tinta del mismo grosor. Los nombres de nodo (`bulbGrp`, `rayLGrp`) **no repiten** los de pieza.
- **Profundidad:** los objetos grandes llevan una placa gris oscuro desplazada (+18, +18); los pequeños, planos.
- **Contorno mínimo:** 5 en props, 4 en personajes. El gate no lo mide: el generador sí, con `checkInkStroke(parts, '#tinta', 5)` de `SK/scripts/lib.mjs` (los dos ejemplos lo llaman).
- **Dos extremidades** (brazos o piernas) en un `parts.json`: `limb({ …, side: 'L' })` y `limb({ …, side: 'R' })` más `limbRig` con el mismo `side` (el sufijo evita "part name is repeated").
  Un brazo o una pierna **ahusada**: `capsule(a, b, w, kind, w2)`.
- **Ajustar una pieza de un donante al rig** (otra escala, giro, espejo o traslación): campo `transform` de la pieza; `build-parts` lo hornea con `scripts/pathkit.mjs` (`03-rig.md` §10).

## 4. Reparto: personajes nuevos con las animaciones de otro (`reskin.mjs`)
```
node SK/scripts/reskin.mjs base.json skin.json out.json
```
Cambia el dibujo de las piezas del personaje animado `base` por el de `skin`, **sin tocar rig ni animación**.
- `skin` es otro Lottie cuyas piezas llevan el **mismo nombre de capa** que las de `base`.
- Una pieza ("hoja") es una capa de forma con nombre (export plano) o una capa precomp cuyo asset tiene exactamente una capa de forma (export de Creator con `group_layers`). Busca a cualquier profundidad.
- Las capas null de `skin` son nodos de rig y se ignoran. Sale 1 si una pieza de `skin` no existe en `base`. Las piezas de `base` sin `skin` quedan como están.
- Informa por stderr: `replaced N: …` y `missing N: …`. El nombre del Lottie (`nm`) pasa a ser el nombre del archivo de salida.
- Las piezas nuevas deben estar dibujadas **en coordenadas del lienzo y en la misma pose de reposo**. Las puntas de las extremidades quedan exactas sobre las mismas articulaciones, con tapas redondas; las piezas "tapa" (copias sin trazo, un poco más estrechas) conservan su nombre.
- Pasos: dibuja las piezas con los mismos nombres y articulaciones → `build-parts` → exporta `skin` (por código con un `parts.json` de las mismas piezas, o desde una escena de Creator, ver `05-ruta-creator.md`) → `reskin` → `check-lottie --parts` del base.
- **En la ruta de código suele sobrar el reskin:** la animación vive en `parts.json` (`plan`), así que un personaje nuevo es una **copia del `parts.json` con las piezas cambiadas** y se vuelve a exportar. `reskin` sirve cuando la animación vive dentro de un Lottie hecho en Creator. (Es deducción de cómo funcionan los scripts; en el caso real el reparto se hizo con `reskin` sobre el Lottie de Creator.)
- Cada personaje del reparto debe verse distinto de un vistazo (silueta, peinado, ropa) y a la vez parecer de la misma familia.

## 5. Piel y pelo: roles propios (`split-roles.mjs`)
**Define piel y pelo como roles propios desde el principio** (en `palette` del `parts.json`, por pieza). Si se dejan con el color de una pieza gris o de la tinta, cambiar el color de la piel cambia también la ropa o el contorno.
`split-roles` es para arreglar arte que ya los comparte:
```
node SK/scripts/split-roles.mjs split.json --spec parts.json --lottie a.json,b.json --roles roles.json [--parts-dir carpeta] [--dry]
```
```json
{ "splits": [ { "from": "#e4e4e7", "to": "#f0c8a0", "token": "--illus-skin", "parts": ["head", "neck"], "only": "fill" } ] }
```
- Exige `--spec` o `--lottie`. Con `--dry` solo cuenta.
- Qué cambia: (1) el `svg` de esas piezas en el spec y, si vienen de un donante, un `palette` propio de la pieza (un `build-parts` posterior no lo deshace); (2) `parts/<pieza>.svg`; (3) los Lottie, por nombre de capa; (4) `roles.json` recibe `to → token`.
- `only: "fill"` toca solo rellenos; **el contorno sigue siendo tinta.** Límite: si el relleno y el aro de una pieza tienen el mismo color, `from` toca a los dos. Dale al relleno un color propio del donante en `palette` y no hace falta.
- Repítelo **sobre cualquier export nuevo** de un personaje hecho en Creator.
- Reglas de color que se aprendieron:
  - Las **claves de `roles.json` son colores de autoría y NUNCA se reescriben** cuando cambia la paleta de la marca; solo cambian los valores de los tokens. Un test que comparaba las claves con los valores actuales de los tokens se rompió: se arregló el test, no las claves.
  - Elige piel y pelo renderizando **3 pares candidatos** en todo el reparto. Los rasgos de la cara sobre la piel deben llegar a **≥ 3:1** (en el caso real: 5,45:1 en claro y 3,82:1 en oscuro).
  - En oscuro, el pelo sin contorno casi no se separa de la piel ni del fondo (≈ 1,8:1): sin arreglo, aceptado y documentado porque el arte oscuro no se pintaba en ninguna pantalla real.
  - Un solo tono de piel para todo el reparto es un **riesgo de diversidad**; un segundo token es otra decisión.
  - En las escenas del pack, la piel del donante tiene un color único por escena (se mapea); el pelo no (comparte color con la ropa o un objeto, o cambia por persona): queda gris.

## 6. Componer fondo + personajes
- Todo el arte vive en el mismo lienzo de 1000 × 1000: apila los contenedores con `position: absolute; inset: 0` y **alinean sin transformaciones**. Fondo abajo, personajes encima en la zona calma (x 350 a 650, pies en y ≈ 930).
- **Varios personajes:** escala 0,8 con origen en los pies (`transform-origin: 50% 93%`) y un desplazamiento en x por personaje (en el caso real, -17 %, +7 % y +26 % del ancho).
- **Una fachada por pieza.** Revela la escena con opacidad **solo cuando todas las piezas avisaron `onReady`**, y entonces arrancan juntas (por ejemplo: el fondo `enter`, uno saluda, otro respira, otro piensa). Toda la escena se mueve como máximo lo que dura la ráfaga más larga (~4,7 s) y queda quieta. Si una pieza falla, **desaparece todo el escenario**: nada flota y la pantalla sigue.
- **Modo oscuro:** el escenario es un subárbol con los tokens claros (`.light`) sobre una tarjeta clara; la fachada lee los colores del **contenedor**, no de `<html>` (ver la referencia de runtime).
- **Revisión de la composición:** `render.mjs` pinta un Lottie por vez. Para ver el fondo con el personaje encima usa la galería con `compose` (`09-galeria-y-aprobacion.md` §1: dos selectores y los botones de cada capa); mira a 240 y 160 px (cambia el ancho de la ventana o renderiza cada uno con `--size 240` y `--size 160` y compáralos), en claro y oscuro (`--map`), y mide la zona calma del fondo solo con `node SK/scripts/zona-calma.mjs` (`04-animacion.md` §4).

## 7. Añadir un prop nuevo, de punta a punta
Un objeto con dos segmentos (`idle` y una acción), dibujado en código.
```
mkdir mi-prop && cp SK/plantillas/roles.ejemplo.json mi-prop/roles.json
# 1 generador: guarda una copia de SK/ejemplos/bombilla.mjs como mi-prop.mjs (cambia el import de `../scripts/lib.mjs`, que trae compactJson y checkInkStroke, a la ruta real de SK/scripts/lib.mjs) y cambia piezas, rig y plan; escribe parts.json
node mi-prop.mjs mi-prop
# 2 exportar (lint del plan, export, verificación de z-order y reposo, y gate)
node SK/scripts/export-lottie.mjs mi-prop/parts.json --name mi-prop
# 3 mirar los frames clave (--at son frames locales del segmento)
node SK/scripts/render.mjs mi-prop/mi-prop.json --segment idea --at 0,6,12,22,34,46,60 --size 240 --out mi-prop/idea.png
# 4 modo oscuro sin re-exportar: un mapa de color de autoría a color final
echo '{"#1b1b1f":"#ffffff","#ffffff":"#292929"}' > mi-prop/oscuro.json
node SK/scripts/render.mjs mi-prop/mi-prop.json --frame 0 --size 240 --map mi-prop/oscuro.json --bg "#292929" --out mi-prop/oscuro.png
# 5 galería para aprobar (ver la referencia de la galería)
node SK/plantillas/build-galeria.mjs manifiesto.json --out galeria-final.html
```
- Dibuja la pieza para que se lea a 160 o 240 px: contorno 5, nada de trazos de 3.
- Rest pose = frame 0 de `idle`; la acción empieza y termina ahí (salvo `offPoseStart`).
- Cambios de color = piezas extra con opacidad. Escala en el eje propio. Al desaparecer una pieza, mínimo 0,12 (nunca 0).
- Las claves del plan son **relativas** al reposo. Usa `limits` para que el lint avise si una clave se pasa.
- Mira el PNG antes de seguir. Corrige y repite 2 → 3.
- Al integrar: copia el JSON y el `roles.json` a los assets de la app. La fachada lee `meta.repeats` del propio JSON; no necesitas otra tabla.
- Para CI: la salida es estable byte a byte, así que "regenerar y comparar con lo commiteado" sirve como gate. **Commitea los exports antes del gate** en un clon limpio (`git add -N` dio falsos fallos).
- **Si cambias una herramienta compartida** (`export-lottie`, `check-lottie`, `build-parts`, `pathkit`), regenera todos los activos y exige `git diff --quiet` (§9).

## 8. Límites del exportador y errores del lint
- `s` junto con `sx`/`sy` en el mismo nodo → error. `sx` y `sy` juntos deben tener **las mismas claves de tiempo**.
- Opacidad con claves en más de un nodo de la cadena de una pieza → error.
- Un nombre de nodo igual al de una pieza → error ("layer names must be unique").
- Las claves de cada canal van de 0 a `dr`, crecientes. Empiezan y terminan en reposo (rotaciones módulo 360); `offPoseStart` exime el inicio.
- Todo segmento de `segments` necesita su entrada en `plan.keys` y al revés.
- Total ≤ 450 frames; autoplay ≤ 5 s con sus pasadas.
- Arcos no circulares o comandos de `path` fuera de la lista: error del exportador.
- El plan se escribe en valores **relativos** al reposo.

## 9. Cuando cambias una herramienta compartida
Un script que usan todos los activos (`export-lottie.mjs`, `check-lottie.mjs`, `build-parts.mjs`, `pathkit.mjs`, un generador común) no se cambia "por un caso":
1. Haz el cambio con una prueba que lo cubra (`node --test`).
2. **Regenera TODOS los activos ya commiteados**: por cada `parts.json`, `build-parts` y luego `export-lottie` (y vuelve a correr los generadores de props, fondos y escenas).
3. Exige que **no cambie ni un byte** de lo existente: `git diff --quiet -- <carpetas de arte>`. Una herramienta que solo agrega una capacidad no toca lo que ya había.
4. Si el diff no está vacío, es un cambio de comportamiento: se explica, se revisa y se aprueba aparte, y los exports nuevos se commitean con él.
Así se agregaron reglas al exportador del caso real sin que los assets ya aprobados cambiaran. Los exports van commiteados **antes** del gate en un clon limpio (§7).
