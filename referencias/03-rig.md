# 03. Rig

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

Cómo se arma un personaje, objeto o fondo articulado: `parts.json`, pivotes, árbol, orden de capas, extremidades que no se
cortan al girar, contorno y pose neutra. Antes: `02-piezas-y-paleta.md`. Qué animar y con qué números: `04-animacion.md`.
Formato exacto de cada campo: `plantillas/parts.schema.md` (esta página explica el porqué y los números).

## 1. Qué es el rig aquí
- **Un solo `parts.json`** describe la ilustración: piezas, pivotes, árbol, segmentos y claves de animación. Es la fuente de verdad
  para `build-parts`, `export-lottie`, `check-lottie --parts` y `split-roles`.
- **`export-lottie` escribe una composición plana**: cada nodo del rig es una capa null (`ty` 3) con `parent`, y cada pieza una
  capa de forma (`ty` 4) hija de su nodo, en coordenadas del lienzo. No hay precomps.
- **Por qué plano.** Con precomps (el `group_layers` de Creator) un grupo no deja intercalar piezas de otro grupo. Un sobre con
  la carta **entre** la solapa y el bolsillo no se puede armar así. Plano, el z-order de `parts` manda.
- Dos rutas dan el mismo resultado: **código** (`export-lottie`, sin Creator) o **Creator** (§12). La de código es reproducible
  y revisable en git; la de Creator hace falta si prefieres animar a mano. Los límites y reglas de aquí valen para las dos.

## 2. `parts.json` campo por campo
Lienzo **1000 × 1000**, ángulos en grados con **positivo = horario**, `y` positivo = hacia abajo. Los campos con `_` al inicio
(`_comment…`) los ignoran todos los scripts. Un ejemplo completo y válido: `plantillas/parts.ejemplo.json`; uno de persona:
`fixtures/persona/parts.json`.

| Campo | Qué es y qué cuidar |
|---|---|
| `donors` | `{ clave: "ruta/al/donante.svg" }`, **relativa a este archivo**. Vacío si todo se dibuja en código. |
| `palette` | donante → autoría (`02-piezas-y-paleta.md`). `"#000000"` = la tinta. |
| `parts[]` | Lista **de abajo hacia arriba**: la primera va al fondo. Ver abajo. |
| `joints` | `{ nombre: { x, y } }`: pivotes con nombre, en coordenadas del lienzo (§3). |
| `rig` | `{ nodo: { joint, parent, at?, rot? } }` (§4). |
| `limits` | `{ "nodo.canal": [mín, máx] }` en valores **relativos al reposo**. Una clave fuera de rango **falla** el lint. Para escalas, `nodo.s` cubre `sx`/`sy`. |
| `segments` | `{ idle: { autoplay: true, repeats: 2 }, wave: {} }`. Cada uno será un marker. |
| `plan` | Las claves de animación (`04-animacion.md`). |
| `views` | Opcional: `{ segmento: [frames locales] }`, las poses que hay que mirar. `render.mjs <anim.json> --views parts.json` pinta el reposo y esos frames en una hoja (§13). |
| `precision` | Decimales de las coordenadas del Lottie (3 por defecto; 2 si el peso importa). |

**`parts[]`.** Cada pieza es `{ name, donor, indices }` (del donante) **o** `{ name, svg }` (dibujo propio). Además:
- `name`: único. Es el nombre de capa del Lottie y de `parts/<name>.svg`. **No puede repetir el de un nodo del rig**
  (los nombres de capa son únicos; el lint lo detecta).
- `node`: nodo del que cuelga. La pieza se mueve, gira y escala con él. Sin `node`, queda fija.
- `palette`: solo en piezas de donante; pisa al general en esa pieza (piel y pelo).
- `transform`: solo en piezas de donante. Mueve, gira, espeja o escala el dibujo al construir la pieza: `{ scale, rotate, mirror, dx, dy, about }` (§10).
- `rest.o`: opacidad en reposo. Pon `0` en lo que solo aparece durante una animación (§9). **Ningún color se anima.**
- `note`: texto libre. Úsalo: de dónde sale la pieza, qué transformación lleva, qué no debe tocar.

**`segments`.** `repeats` es un entero ≥ 1: el Lottie guarda **un ciclo** y el player lo repite (se copia a `meta.repeats`).
`autoplay`: duración × `repeats` ≤ **5 s** (WCAG 2.2.2). Todo segmento declarado necesita su entrada en `plan.keys`, y al revés.

**`plan` (lo que afecta al rig).**
- Valores **relativos al reposo**: `0` en `x y r`; `1` en `s sx sy o`. Reposo = frame 0 del primer segmento.
- Todo segmento **empieza y termina en reposo** (rotaciones módulo 360: una vuelta completa termina en reposo). El lint lo exige
  y `export-lottie` lo comprueba otra vez leyendo el JSON exportado.
- El final **se asienta**: el player termina un segmento en `dr - 1` y luego salta al reposo. `export-lottie` compara ese frame
  con el reposo (tolerancia: 2,5 px, 3 % de escala, 0,6° y 5 % de opacidad). Deja 3 o 4 frames quietos al final.
- `sx` y `sy` juntos tienen las **mismas claves de tiempo**; `s` no se mezcla con `sx`/`sy` en el mismo nodo.
- Opacidad: la clave `o` va en una pieza o en un nodo, pero no en dos nodos de la misma cadena de una pieza (error).
- `offPoseStart: ["root"]`: nodos que empiezan fuera de reposo por diseño (un fondo que "entra"). Los finales siguen estrictos.
- **Markers:** sin `plan.markers`, cada segmento arranca **un frame después** de que acabe el anterior. `lottie_light`, al terminar
  un `playSegments([tm, tm + dr])`, cae en el primer frame del siguiente marker; el frame de separación lo evita.
- **Peso:** máximo 450 frames y 200 KB (`--max-kb`). El peso lo da la estructura (piezas y claves), no la animación. Referencias:
  28 piezas y 7 segmentos exportados por Creator, 157 KB (el presupuesto de 120 KB se recalibró a 200 KB); `fixtures/persona`
  exportada por código, 42 capas y 38 KB.

## 3. Articulaciones y pivotes
- `joints` son puntos del lienzo. Un nodo **gira y escala alrededor de su `joint`**.
- **El pivote de una extremidad es el centro del círculo que cierra su cápsula** (§6). Si el pivote y la tapa redonda no coinciden,
  al girar se abre un hueco.
- Valores del caso real: hombro, codo, muñeca, cadera, rodilla, tobillo (uno por lado), cuello, cintura y centro de los ojos.
- **Respirar** = escala en `y` del torso con pivote en la cintura (1 → 1,02 → 1). **Cabeza** gira sobre el cuello. **Parpadeo** =
  escala en `y` de cada ojo sobre su propio centro. **Rebote** de un cuerpo: pivote en los pies, para que escalar en `y` lo aplaste
  contra el suelo en vez de hacerlo flotar.
- **Convención de ángulos: elígela una vez y escríbela en `note`.** En el caso real (personaje de 3/4 mirando a la derecha):
  positivo = sentido horario = el miembro va **hacia atrás o hacia fuera**; negativo = **hacia delante** (hacia la cara y el
  pecho). El codo se dobla con ángulos negativos; la rodilla, con positivos.
- **El signo depende de la vista.** Todo lo de arriba y los números de saludo de este documento son de **3/4**. En un personaje **de frente**
  los dos brazos son simétricos: el del lado derecho de la pantalla sube con ángulos **negativos** y el del lado izquierdo con **positivos**
  (en un personaje de frente probado, el brazo derecho de la pantalla subía con -90° en el hombro y -55° en el codo). Escribe la regla
  de tu vista en `note` y `limits`, y confírmala con un render antes de copiar valores de otro personaje.
- **`limits` es donde guardas lo que aprendiste.** Valores del caso real: hombro cercano `[-115, 150]`, codo `[-150, 20]`,
  muñeca `[-45, 45]`, cadera `[-45, 30]`, rodilla `[-5, 120]`, tobillo `[-30, 30]`, cuello `[-12, 12]`, ojos (escala) máx. 1,15, cejas
  hasta 10 u. Si una pose rompe algo, baja el límite: la próxima vez el lint lo para.
- **Oclusión.** El brazo cercano va **encima de la cabeza** en el z-order. A -150° en el hombro tapaba la cara; el límite quedó en
  -115°. Para saludar se levanta hacia fuera: hombro `+70..+110` y codo `+70..+100`, y la mano queda al lado de la cabeza, fuera
  del pelo. Revisa cada pose contra lo que cae encima.

## 4. El árbol del rig
`rig`: `{ nodo: { joint, parent, at?, rot? } }`.
- `parent` es otro nodo o `null` (raíz). **El hijo hereda todo el movimiento del padre** (hombro → codo → muñeca).
- `at`: dónde cae el pivote en reposo si no es el mismo punto de `joint` (abanico de rayos de una bombilla).
- `rot`: giro estático de reposo. Las claves del plan son relativas a él. Truco: **dibuja la pieza ya orientada** (un rayo
  vertical) y deja que su nodo lleve el ángulo; así escalas en el eje propio sin ensanchar el contorno.
- Las piezas cuelgan del nodo **de su articulación**: la parte de arriba del brazo, del hombro; el antebrazo, del codo; la mano
  (un disco sobre la muñeca), del nodo de la muñeca, que a su vez cuelga del codo.

Árbol de `fixtures/persona/parts.json` (el de un personaje de dos brazos y dos piernas):
```
bodyGrp (pies)                         escala/salto del cuerpo entero
├─ chestGrp (dobladillo)               respirar
│  ├─ headGrp (cuello)                 ladear
│  │  └─ blinkL, blinkR (cada ojo)     parpadeo
│  ├─ shoulderL → elbowL → wristL      brazo (la mano cuelga de wristL)
│  └─ shoulderR → elbowR → wristR
├─ hipL → kneeL → ankleL               pierna (el zapato cuelga de ankleL)
└─ hipR → kneeR → ankleR
```
En Creator el mismo árbol se arma con precomps anidadas: antebrazo + mano dentro del brazo, canilla + zapato dentro de la pierna,
cabeza con ojos y bocas, un grupo de cuerpo para respirar y un grupo raíz con el pivote en el suelo, entre los tobillos.

## 5. Orden de capas (z-order)
`parts` va de abajo hacia arriba. `export-lottie` comprueba que el orden del JSON exportado es el de `parts.json`.
Pila típica de un personaje de 3/4 (de fondo a frente): miembros de atrás, zapatos, pantalón/piernas, torso, cuello, cabeza,
oreja, pelo, ojos, cejas, bocas, miembros de delante.
Reglas aprendidas:
1. **La mano va debajo del antebrazo** (el puño de la manga cubre la muñeca). **El zapato va debajo de la canilla** (el bajo del
   pantalón cubre la caña del zapato).
2. **Antebrazo y canilla van encima de brazo y muslo**: el borde de arriba del hijo no lleva trazo (§6).
3. **La tapa (`*Cover`) va encima del hijo**, no del padre.
4. El brazo cercano va sobre la cabeza (ver oclusión, §3).
5. El pelo de atrás debajo de la cabeza y el flequillo encima.

## 6. Extremidades: cápsulas con articulaciones redondas
**No se recortan del donante.** Un brazo recortado (relleno + aro negro) deja a la vista el borde del aro y un hueco al girar el codo.
Se redibujan como **cápsulas**: dos segmentos, extremos redondos centrados **exactamente** en los pivotes, y el mismo contorno de
tinta. El código de referencia es `ejemplos/extremidades.mjs`:

```sh
node SK/ejemplos/extremidades.mjs <carpeta>                                   # escribe <carpeta>/parts.json
node SK/scripts/export-lottie.mjs <carpeta>/parts.json --roles SK/plantillas/roles.ejemplo.json --name brazo
node SK/scripts/render.mjs <carpeta>/brazo.json --segment bend --at 0,20,40 --size 300
```

La regla de la articulación (cuatro piezas por extremidad, de abajo hacia arriba: mano, brazo, antebrazo, tapa):
1. **Los dos segmentos miden lo mismo en el pivote** (en el ejemplo, 50; en el caso real, brazo 58 y pierna 80, con un hombro de
   67 que se afina hacia el codo). Mismo contorno en todos.
2. **El padre (brazo) dibuja su arco exterior. El hijo (antebrazo) no dibuja su borde de arriba**: es un trazo abierto con los
   dos lados y el arco de abajo. Así no asoma una línea dentro del padre.
3. **La tapa** es una copia del brazo **sin trazo, 2 unidades menos de radio por lado (4 de ancho: `w - 4` en el código)**, con solo el arco de su extremo con contorno. Va **encima
   del antebrazo**: tapa el tramo del hijo que queda dentro del padre al doblar y deja limpio el borde. En el caso real eran cuatro
   tapas (brazo cercano y lejano, muslo cercano y lejano); las de los muslos llevan también el pliegue del pantalón.
   - Criterio de aceptación: **ninguna línea que termine en seco de más de 12 u** con el codo a 90° y la rodilla a 90°.
4. **La mano** es un disco (en el caso real, una bola de radio 18) sobre el pivote de la muñeca, **debajo** del antebrazo; el zapato
   asoma 24 u por encima del pivote del tobillo (= la línea del bajo) y queda tapado. Con la muñeca a ±45° y el tobillo a ±30°
   no se ven.
5. Cada pieza cuelga del nodo de **su** articulación.

La cápsula cónica (radio distinto en cada extremo) se construye con la tangente común de los dos círculos: `capsule(a, b, w, kind, w2)` de
`ejemplos/extremidades.mjs` (con `w2` distinto de `w`; falla si un círculo contiene al otro). Para dos brazos o dos piernas en el mismo
`parts.json`, importa `limb` y `limbRig` con `side: 'L'` y `side: 'R'`: el sufijo va en cada pieza, nodo, pivote y límite (si no, "part name is repeated").
Los arcos deben ser **circulares** (`rx = ry`): `export-lottie` los convierte en cúbicas y rechaza los elípticos.

## 7. Grosor del contorno y la regla de 1 px
- **Personajes: 4. Props: 5.** Detalles de personaje (pliegues, costuras, dedos): 3,2. En props, **ningún trazo de tinta menor de
  5** (el filamento de 3,2 de una bombilla medía medio píxel a 160 px de ancho).
- **La regla.** El contorno debe verse de **~1 px a la talla de pantalla**: `unidades = 1000 / píxeles que ocupa el lienzo`.
  4 u a unos 250 px (personajes); 5 u a 160–240 px (props). Antes de fijar el grosor, confirma la talla real en la pantalla.
- Se midió contra el pack: los contornos del donante salen de 3,4 a 3,7 tras escalarlos. El primer encargo pedía 6, y se dejó en
  **4** para casar con las piezas del donante. Un trazo más grueso que el de las piezas del donante se nota de lejos.
- Siempre `stroke-linecap="round"` y `stroke-linejoin="round"` (`export-lottie` escribe `lc: 2`, `lj: 2`).
- **Profundidad:** lo grande lleva una placa gris desplazada **(+18, +18)** (la losa de un gráfico, la placa de un reloj); lo
  pequeño va plano. Sin gradientes ni sombras.
- `check-lottie` no mide el trazo mínimo: es dato de cada generador. `checkInkStroke(parts, '#tinta', 5)` de `scripts/lib.mjs` hace fallar el
  generador con un trazo de tinta menor de 5 en props (4 en personajes); los dos ejemplos lo llaman.
- **Trazo y escala.** Un trazo escala con su nodo. Por eso las piezas se escalan en su eje propio (§4): un rayo dibujado vertical que
  anima solo `sy` conserva su ancho y su contorno.

## 8. Pose neutra
- **Todos los segmentos empiezan y terminan en la pose neutra.** El player salta a ella al terminar, y con movimiento reducido es
  el único frame que se ve.
- Diseño: vista de frente o 3/4 hacia un lado, brazos relajados y **algo separados del cuerpo** (si no, se confunden con el contorno
  del torso), pies a la anchura de los hombros, proporciones del pack (cabeza pequeña, miembros largos, manos y pies grandes). Ocupa
  ~85 % del alto del lienzo: cabeza arriba hacia y ≈ 80, pies hacia y ≈ 930–940, centrado en x ≈ 500. Si vas a poner el personaje
  sobre un fondo, deja el cuerpo en **x 350–650** (zona calma).
- **Hornea una pose de reposo ligeramente asimétrica** en el arte, no en la animación. En el caso real: cabeza ladeada -4,5° y
  corrida 6 u hacia donde mira, hombro cercano 6 u más bajo que el lejano, brazo cercano 10° hacia fuera, rodilla cercana doblada
  7° y cadera cercana 14 u hacia fuera. Un reposo perfectamente simétrico se ve rígido. Las rotaciones del plan son **relativas**
  a esa pose: el neutro sigue siendo 0.
- Un reskin (§11) hereda la pose. Si un personaje nuevo no la hornea igual, anótalo en `note` (el segundo personaje del caso real
  no ladeaba la cabeza).
- Prueba de que está bien: `export-lottie` compara inicio, fin y `dr - 1` de cada segmento con el reposo; `render.mjs` pinta los frames.

## 9. Ojos y bocas: piezas que se intercambian por opacidad
Un color no se anima y no hay máscaras, así que **una cara no se deforma: se cambian piezas**.
- **Bocas:** tres piezas (neutra, sonrisa, "o"). La neutra es la de reposo. Las otras llevan `"rest": { "o": 0 }`. En el plan, dos
  claves de opacidad en el mismo frame con `hold` (la que sale baja a 0, la que entra sube a 1):
  ```json
  "mouthSmile":   { "o": [[0, 0, "hold"], [6, 1, "hold"], [54, 0, "hold"], [60, 0]] },
  "mouthNeutral": { "o": [[0, 1, "hold"], [6, 0, "hold"], [54, 1, "hold"], [60, 1]] }
  ```
  En Creator: dos claves con un frame de diferencia, por la misma razón (cambio limpio).
- **Ojos:** un nodo por ojo (pivote en su centro) y se anima `sy`. Parpadeo: 1 → 0,1 → 1 en ~6 frames (`limits`: `blinkL.s` `[0.05, 1.2]`).
  Ceño y sorpresa: escala `sx`/`sy` y posición. Los ojos cuelgan de la cabeza, no del cuerpo.
- **Márgenes de la cara** (se rompen cuando se salen): los ojos no escalan más de 1,15 y quedan a ≥ 4 u del contorno de la cara;
  las cejas suben hasta 10 u (8 u si el flequillo del donante deja solo 5 u de frente).
- **El mismo cambio de color de un objeto** (una bombilla que se enciende) se hace igual: pieza superpuesta con `rest.o: 0` y
  opacidad animada.
- Cómo animar cada expresión: `04-animacion.md` §2.

## 10. Piezas dibujadas cuando el donante no las trae
Brazos, piernas, torso, cuello, nariz, gafas y casi siempre manos y zapatos: se dibujan.
- **En código, reproducible.** Un script que escribe `parts.json` (un `author.mjs` en el caso real, `ejemplos/extremidades.mjs` aquí).
  **Edita el script, no el SVG.** El script **deriva de `parts.json` del personaje base**: lo lee y hereda `joints`, `limits`, `segments`,
  `plan` y el orden de `parts`; solo escribe el dibujo de cada pieza (mismos nombres). En el caso real así salió un personaje de 28 piezas.
  Truco: un ayudante de marco local `frame(origen, punto)` con `at(u, t)` (`u` a lo largo del eje, `t` hacia el lado) para dibujar mangas,
  puños y correas alineados con el hueso, sea cual sea su ángulo de reposo.
- **Restricciones de `svg`** (las impone `export-lottie`): solo `path`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`; colores
  `#rrggbb` que existan en `roles.json`; sin gradientes; sin `<g>` ni `transform` (solo `translate() rotate()` en un `rect`); arcos
  de `path` circulares. Una elipse se escribe con cuatro cúbicas.
- **Una pieza del donante se hornea.** Espejo, escala uniforme (1,2 a 1,24 en el caso real), giro (-9,1° para que los dos ojos
  del donante cayeran sobre las articulaciones de los ojos) y traslación se aplican a los **datos del path**; la pieza queda sin
  `transform` de SVG (el exportador no lo lee). Aquí se pide con el campo `transform` de la pieza en `parts.json`, y `build-parts` lo hornea:
  ```json
  { "name": "head", "donor": "otro", "indices": [18, 19], "transform": { "scale": 1.22, "rotate": -9.1, "dx": -14, "dy": 6 } }
  ```
  Orden: espejo (`"mirror": true`, eje vertical por `about`), escala, giro en grados (+ = horario) alrededor de `about` (`[x, y]`; sin él, el
  centro de la pieza) y, al final, `dx`/`dy`. Todas las figuras de la pieza pasan a `<path>` y el grosor del trazo se escala con ellas:
  si escalas un donante 1,2, su contorno de 3,4 pasa a 4,1; revisa el contorno mínimo después (§7). El kit es `scripts/pathkit.mjs`
  (`pathToContours`, `contoursToD`, `matrix`, `fitElements`, `bbox`), con pruebas. Mezclar piezas de dos donantes distintos: dos entradas
  en `donors` y una `transform` por pieza hasta que encajen en las articulaciones.
- **Deformar** (ensanchar 5 u un lado de una mejilla) **no** es una semejanza: `transform` no lo hace. Trocea las curvas en tramos cortos
  (unas 6 u), pasa cada punto por una función y deja los arcos como cúbicas; el caso real lo escribió a medida. Si lo necesitas, sale de
  `pathToContours` + `contoursToD`: el kit trae el cuerpo del trabajo, no el troceado.
- **No se vectoriza un PNG.** Si falta una pieza, se dibuja.
- Las piezas con `svg` no se validan en `build-parts`: el primer chequeo de color es `check-lottie`.

## 11. Elenco: reskin sobre un rig compartido
Un solo personaje repetido en todas las pantallas se vuelve una mascota. El segundo y tercero **reutilizan el rig y las
animaciones del primero**; solo cambian los dibujos.

**Qué debe ser idéntico:** los nombres de pieza, el z-order, `joints`, `rig`, `limits`, `segments` y `plan`. Si no, la misma
animación no los mueve. (Un nuevo personaje es un JSON; el componente web no cambia.)

**Qué cambia:** las formas, los colores (solo roles), el pelo, la ropa. Cada extremidad nueva tiene sus tapas redondas en las
**mismas** coordenadas de las articulaciones.

Dos rutas:
- **Código:** copia el `parts.json` del base y cambia solo `parts`. `export-lottie` entrega un Lottie completo con el mismo plan.
- **Ya tienes el Lottie animado del base y no su plan** (hecho en Creator): arma una escena de piezas con los **mismos nombres** de capa
  y trasplántalas:
  ```sh
  node SK/scripts/reskin.mjs <base.json> <skin.json> <out.json>
  ```
  Una pieza (hoja) es una capa de forma o una precomp con una sola capa de forma, a cualquier profundidad; las capas null
  (nodos del rig) del `skin` se ignoran; las piezas del base sin `skin` quedan igual. **Sale 1 si una pieza del `skin` no existe
  en el base** o no es hoja. Las piezas nuevas deben estar dibujadas en coordenadas del lienzo y en la misma pose de reposo.

Aprendido:
- **Distingue al elenco por silueta + pelo + ropa**, no solo por color. Si dos personajes se confunden en miniatura, no sirve.
  Un pelo grande o una cola de caballo cambia el ancho: deja sitio a ese lado al colocar el sprite (una cola de caballo hizo
  que la figura ocupara x 285–665 cuando la del base ocupa x 380–655).
- Cada personaje tiene sus **rangos de cara**: el donante del segundo dejaba solo 5 u de frente bajo el flequillo, y las cejas
  subían máx. 8 en vez de 10.
- Prueba con **los mismos giros que las poses clave** del base (saludo: hombro +100 y antebrazo 60; señalar: -85; pensar: -20 y
  -145; caminar: piernas ±14°, rodillas 24°). Si un hueco aparece en el nuevo y no en el base, el pivote no coincide.
- Pasa `check-lottie --parts` a cada personaje y comprueba que los markers coinciden con los del base. Así un solo `segmentFor`
  sirve para todos.
- El elenco comparte piel y pelo: **un solo tono de piel** es un riesgo de diversidad (`02-piezas-y-paleta.md` §6).

## 12. Rig en LottieFiles Creator (solo lo que afecta al rig)
Respuestas del spike con un brazo de prueba (hombro, codo, mano), exportado y reproducido con `lottie_light`:

| Pregunta | Respuesta |
|---|---|
| ¿`import_asset` de un SVG colapsa las piezas en una capa? | No, **una pieza por `import_asset`**: cada una es una capa raíz que es precomp de una escena oculta con una capa de forma en (0,0). El marco 1000 × 1000 se conserva. |
| ¿`set_anchor_point` compensa la posición? | Sí, **en coordenadas del lienzo** (no relativas al centro). La posición queda con un keyframe igual al ancla. |
| ¿Dónde está la verdad? | **`read_keyframes`**, no `read_scene`: este último muestra posiciones y bounds viejos después de mover un ancla. |
| ¿Las precomps exportan a 1000 × 1000? | **Solo con `group_layers`**. `create_scene_layer` exporta 500 × 500 y `lottie_light` recorta con el tamaño de la capa: `check-lottie` la rechaza. |
| ¿Los segmentos salen como `markers`? | Sí: `cm` (texto), `tm`, `dr` (= fin − inicio). |
| ¿El export trae `ef`, `sid`, máscaras o capa sólido? | No, si no los usas. |

Procedimiento de rig:
1. `create_scene` 1000 × 1000, 30 fps, duración 14 s (420 frames). Activa la escena.
2. `import_asset` de cada pieza, **de abajo hacia arriba**, con `name` = nombre de la pieza. Comprueba con `read_scene` que cada una sea una capa raíz nueva.
3. `set_anchor_point` de cada pieza **antes de agrupar**, en coordenadas del lienzo, en su pivote.
4. Jerarquía **solo con `group_layers`, de dentro hacia fuera**, con el ancla del grupo en su pivote justo al crearlo. Tras cada
   grupo: `read_scene` (apilado: lo de atrás detrás del torso) y `read_keyframes` (posición == ancla). Usa `reorder_layer` si hace falta.
5. Piezas de expresión no neutras: opacidad 0 con un keyframe estático en el frame 0.

Reglas de oficio:
- **Una sola pestaña de Creator** → un solo agente secuencial. Dos agentes pisan la pestaña.
- **Exportar exige sesión iniciada.** En modo invitado no se puede exportar y el trabajo se pierde al cerrar la pestaña (pasó una vez
  y hubo que rehacer). Humano o extensión del navegador: Export → "Save as new" / desmarcar otras escenas → elegir la escena →
  Export → Download → "Lottie JSON" → copiar el archivo de Descargas al repo.
- Para que el MCP funcione: Settings → MCP Settings → "Enable Local MCP" en la app web de Creator.
- **No inyectes JS en la página de Creator** (un parche colgó la pestaña; hubo que recargar e iniciar sesión).
- Lo primero que verás es un **cuerpo de prueba** ("rig body": piezas simples para validar pivotes), no el arte final. Explícalo al
  humano: lo confundió con el resultado.
- Antes de gastar tiempo en Creator, previsualiza la pose **fuera**: un HTML que anida `<g transform="rotate(a, px, py)">` por
  articulación (hombro contiene codo, que contiene muñeca) o el propio `export-lottie` + `render.mjs`. Las poses malas se ven en
  segundos y se corrigen en el `parts.json`.
- La ruta de código (§1) evita todo esto: se descubrió que **no hace falta Creator** para exportar. Creator sirve para animar a
  mano; el rig se puede validar sin él.

## 13. Verificar el rig
```sh
node SK/scripts/build-parts.mjs <parts.json> --roles roles.json
node SK/scripts/export-lottie.mjs <parts.json> --roles roles.json            # lint + export + z-order + reposo + check-lottie
node SK/scripts/render.mjs <anim.json> --segment wave --at 0,20,40 --size 900 --cols 1
node SK/scripts/check-lottie.mjs <anim.json> --roles roles.json --parts <parts.json>
```
- **Zoom.** Un `--size 900` equivale a unas 3,6 veces la talla real. Mira hombros, codos, caderas y rodillas en las poses más
  extremas del plan. En una galería de aprobación el mismo zoom 3× se hace con un botón (`09-galeria-y-aprobacion.md`).
- Compara al lado el original del pack (PNG `1x`): grosor del contorno, proporciones y caras.
- Aceptación: sin huecos ni cortes de contorno al rotar; sin líneas que terminan en seco de más de 12 u con el codo y la rodilla a
  90°; cada segmento empieza y termina en el reposo; menos de un tercio del rig se mueve a la vez (cómo contarlo: `04-animacion.md` §1).
- Revisión de estilo en el caso real: otro agente, con los PNG originales delante, puntuaba cada versión y devolvía arreglos
  concretos (qué pieza, qué cambiar, con números). El bucle tenía tope de 2 rondas. Pásale capturas, no una descripción.

## Errores reales de rig y su arreglo
| Error | Arreglo |
|---|---|
| Caminar: las manos se juntaban delante y las piernas se cruzaban en tijera | piernas ±14° (antes ±20°), brazo contrario a la pierna del mismo lado |
| Pensar: la mano tapaba la boca | la mano baja **debajo del mentón** |
| Saludar a -150°: el brazo tapaba la cara | límite -115° y saludar levantando hacia fuera |
| Dead-end de contorno dentro del brazo al doblar | tapa (`*Cover`) y borde superior sin trazo en el hijo |
| El encargo inicial pedía contorno 6 y el pack mide 3,4–3,7 | 4 en personajes, medido contra el donante |
| Filamento de 3,2 en una bombilla: medio píxel | 5 mínimo en props |
| `create_scene_layer` exportaba 500 × 500 | solo `group_layers` |
| Un nombre de pieza igual al de un nodo | nombres de capa únicos; el lint lo para |
