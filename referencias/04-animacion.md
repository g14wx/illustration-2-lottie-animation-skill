# 04 · Animación: segmentos, recetas y presupuestos

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

Qué animar y con qué números. Sirve igual para la ruta de código y para la de Creator.
El formato de las claves (`plan`, `segments`, `rig`) está en `plantillas/parts.schema.md`; aquí va el contenido.

Los 30 fps y el lienzo de 1000 × 1000 son fijos.

## 1. Reglas que valen para todo
- **Un archivo por ilustración. Cada animación es un marker** (`cm` nombre, `tm` inicio, `dr` duración). El marker guarda **un solo ciclo**; el player lo repite (`repeats`).
- **Pose de reposo = frame 0 de `idle`.** Todo segmento empieza y termina ahí. Por qué: la fachada salta al reposo al terminar, y con movimiento reducido solo se ve ese frame.
- **El final se asienta.** El player termina un segmento en `dr - 1` y luego salta al reposo. Deja 3 o 4 frames quietos al final de cada segmento o el salto se ve.
- **Un frame entre markers** (`tm` = fin anterior + 1). `lottie_light`, al terminar un `playSegments`, cae en el primer frame del marker siguiente. `export-lottie` lo hace solo si no escribes `plan.markers`.
- **Ningún color se anima.** El gate lo rechaza (`animated color`). El cambio de color se hace con piezas extra superpuestas que cambian de opacidad.
- **Solo `transform` y opacidad.** Posición, giro, escala y opacidad. Nada de efectos, máscaras ni expresiones.
- **Escala solo en el eje propio.** Dibuja la pieza ya orientada y deja que su nodo la gire; anima `sx` o `sy`, no una escala uniforme que ensanche el contorno.
- **Nunca escales a 0.** Al hacer desaparecer una pieza, baja a 0,12 y desvanece: a escala 0 queda un trazo de pelo del contorno. (El parpadeo de ojos es otra cosa: `sy` 1 → 0,1 → 1.)
- **Easing:** `io` (entra y sale suave) para todo lo que va y vuelve; `o` (frena) para asentar; `i` (acelera) para golpear; `hold` para intercambios. Anticipación (3 o 4 frames al lado contrario) antes de un gesto grande y continuación (rebote que se apaga) después. Valores del exportador: `io` = cubic-bezier(0.65, 0, 0.35, 1), `o` = (0.215, 0.61, 0.355, 1), `i` = (0.55, 0.055, 0.675, 0.19). En Creator se usaron los presets `ease-in-out`, `gentle-out`, `anticipate` y `overshoot-soft`.
- **En los loops (`idle`, `walk`) el easing es sinusoidal:** entra y sale suave, sin tirones en el empalme entre pasadas. En Creator, el preset `ease-in-out`; en el exportador, `io` (algo más marcado que una sinusoide pura, que sería cubic-bezier(0.37, 0, 0.63, 1); diferencia no medida en el caso real).
- **Menos de un tercio del rig se mueve a la vez.** Cómo contar (la regla del skill, a mano; el lint no la mide): en cada segmento, cuenta los **nodos del rig con claves de movimiento** (`x y r s sx sy`) y divídelos por **todos los nodos del rig**; debe dar menos de 1/3. No cuentes las piezas que solo cambian de opacidad (bocas, velos de color) ni la respiración del torso (escala ≤ 3 %): no se leen como movimiento. Un hijo que solo hereda el giro de su padre no suma aparte. Ejemplo: `wave` de un personaje de 10 nodos mueve hombro, codo y muñeca = 3 de 10. (La regla con que se aceptó el caso real no dejó escrito cómo se contó; esta cuenta es la del skill.)
- **Nada que parezca progreso.** Ni barras que se llenen, ni contadores, ni relojes que avancen. El `idle` es ambiente: respirar, parpadear, mecerse.
- **Nada parpadea más de 3 veces por segundo** (WCAG 2.3.1). Un encendido de luz es un solo golpe.
- **El tiempo no retrocede.** La aguja de las horas no recorre tiempo ni gira hacia atrás: solo da un golpe corto y vuelve (ver el reloj).
- **Un ensamble con juntas abiertas se mueve como un solo cuerpo rígido.** Si el aro de la mano está abierto donde se une al antebrazo, cualquier movimiento relativo deja ver un quiebre. Gira todo el brazo-mano-objeto desde el hombro.

## 2. Catálogo de segmentos de un personaje
Un personaje, siete segmentos, a 30 fps. Los siete suman 417 frames (tope 450).

| Segmento | Duración | Pasadas | Ráfaga | Qué cuenta |
|---|---|---|---|---|
| `idle` | 2,4 s (≈72 frames) | 2 | 4,8 s | respirar y parpadear; es el reposo |
| `walk` | 1 s (30 frames) | 3 | 3 s | un paso en el sitio, ciclo cerrado |
| `wave` | 2,5 s (75 frames) | 1 | 2,5 s | saludar |
| `point` | 2 s (60 frames) | 1 | 2 s | señalar: "mira esto" |
| `happy` | 2 s | 1 | 2 s | éxito |
| `surprised` | 2 s | 1 | 2 s | fallo o aviso inesperado |
| `thinking` | 2 s | 1 | 2 s | espera o aviso |

En el JSON de `parts.json`: `{"idle":{"autoplay":true,"repeats":2},"walk":{"autoplay":true,"repeats":3},"wave":{"autoplay":true},...}`.
Todos arrancan solos, así que cada uno tiene que durar 5 s o menos contando sus pasadas (el gate lo comprueba con `--parts`).

### Receta por segmento (valores del caso real)
- **`idle`.** Cuerpo de arriba respira entre 0,98 y 1,02 de escala (pivote en la cintura, `io`). Cabeza gira 0 → 1,5° → 0. Parpadeo: los dos ojos bajan a 10 % de altura (`sy` 1 → 0,1 → 1) en unos 6 frames hacia el final del ciclo (frames 48 a 54 de 72).
- **`walk`.** Piernas ±14° (la primera versión usaba ±20° y las piernas se cruzaban como tijera), rodillas hasta unos 24° al pasar, con flexión de la pierna de atrás al empujar. Cada brazo se balancea **contrario a la pierna del mismo lado**. El cuerpo sube y baja 6 px, dos veces por ciclo (un mínimo en cada apoyo). Primer frame igual al último.
- **`wave`.** Anticipación (3 o 4 frames al lado contrario) y el brazo se levanta **hacia fuera** hacia el frame 18: hombro +70..+110, codo +70..+100 (vista 3/4; de frente el signo depende del lado, ver `03-rig.md` §3), con la mano al lado de la cabeza y fuera del pelo. El antebrazo oscila ±20° tres veces entre los frames 18 y 60; vuelve a 0 hacia el frame 74. Boca de sonrisa activa del frame 6 al 68 (la neutra, apagada mientras). Cabeza se inclina 0 → 3° → 0.
  - **No subas el brazo a -150°:** la primera versión lo hacía y el brazo cercano (que va sobre la cabeza en el z-order) tapaba la cara. El límite del rig quedó en -115° (`03-rig.md` §3).
- **`point`.** Brazo a -85° hacia el frame 13 (`o`), se queda hasta el 45 y vuelve a 0 en el 59. La cabeza se inclina -3° hacia lo señalado.
- **`happy`.** Sonrisa, ojos entrecerrados (`sy` 1 → 0,6), salto de 24 px de altura (con +4 px de anticipación hacia abajo) y brazos abiertos ±25°.
- **`surprised`.** Boca en "o", ojos de 1 a 1,3 de escala, cejas -10 px, cabeza -4°, torso -3° hacia atrás (se echa atrás). Todo vuelve al reposo al final.
- **`thinking`.** La mano llega **debajo del mentón** hacia el frame 18, se queda hasta el 43 y vuelve hacia el 59. Cabeza inclinada 6°, ojos arriba (-4 px), una ceja arriba (-6 px).

### Expresiones: tres bocas, no una que se deforma
- Dibuja 3 piezas de boca (neutra, sonrisa, "o") y altérnalas **por opacidad**. Dos claves con un frame de diferencia (`hold`) para que el cambio sea limpio.
- Ojos y cejas son piezas con su propio nodo: escala y posición bastan.

## 3. Recetas de props
Un prop es un objeto pequeño con dos segmentos: `idle` (ambiente) y una acción. Todos con `repeats: 1`.
Cada uno está pensado para leerse a 160 o 240 px.

| Prop | `idle` | Acción | Truco |
|---|---|---|---|
| Sobre | 54 frames: flota -9 px, gira ±1,2° | `open` 52 frames, `fly` 40 | la solapa se voltea con `sy` 1 → 0 → abierta; la cara de fuera y la de dentro **intercambian opacidad** (`hold`) al cruzar 0, porque el color no se anima |
| Lupa | 54: sube -8 px, gira ±2,5°, el reflejo se apaga a 0,5 y deriva 10 px | `scan` 84 frames | figura en 8 con ventana (ver abajo) |
| Gráfico | 48: cada barra respira `sy` 1,035 escalonadas | `grow` 50 | las barras bajan a 0,12 y desvanecen en 6 frames; luego crecen con rebote 1,07 → 0,98 → 1, escalonadas 7 frames |
| Reloj | 54: sube -8 px, gira ±1,5°, el minutero da un golpe de 3° | `tick` 72 | ver abajo |
| Bombilla | 54: sube -7 px, gira ±2°, los rayos respiran 0,9 escalonados 5 frames | `idea` 66 | velo de color de marca (ver abajo) |

- **Bombilla (`idea`).** El encendido es una pieza `glow` (velo de color de marca, mismo contorno, opacidad 0 en reposo) que sube a **0,88 en 4 frames** y baja en **18**, **una sola vez**. Es un golpe, no un parpadeo. Para que el alambre de tinta se lea sobre el velo hay una pieza `filamentOn` (alambre de papel, opacidad 0 en reposo) que entra mientras el velo está arriba y la de tinta sale. El contorno va en su propia pieza **por encima** del velo. La bombilla salta 18 px hacia el frame 13 y rebota 5 px. Los rayos hacen un pop: bajan a 0,12 y se desvanecen en los primeros 6 frames, y vuelven entre los frames 10 y 14 (escalonados de 2 en 2) con rebote 1,2 → 0,95 → 1.
- **Rayos.** Cada rayo se dibuja **vertical**; su nodo lleva el ángulo del abanico como giro estático (`rot`) y la posición de su pivote (`at`); la animación solo toca `sy` desde el extremo interior. Ver `ejemplos/bombilla.mjs`.
- **Reloj (`tick`).** El minutero hace una anticipación de -12°, da la vuelta completa y se asienta desde 372° (`io`; 360° = reposo). **La aguja de las horas no recorre tiempo:** solo da un golpe de 7° cuando llega el minutero y vuelve. El reloj entero pulsa 3 % al empezar y al llegar. La hora de reposo va "horneada" en la geometría de las agujas (las claves son relativas). El minutero queda a 24 unidades o más de los puntos de hora.
- **Lupa (`scan`).** Cuerpo rígido que gira sobre el centro de la lente. Trayectoria: figura en 8 con ventana, `x = A·w·sen(θ)`, `y = B·w·sen(2θ)`, `r = R·w·sen(θ)`, `θ = 2πt`, `w = sen(πt)`. La ventana `w` hace que la velocidad sea 0 en los dos extremos. Valores: A 85 px, B 38 px, R 7°, claves cada 6 frames con `cr` (Catmull-Rom). El mango va 3 frames detrás de la lente (≤ 1,5° de diferencia: continuación). Al final, un latido del reflejo (escala 1,5) y un "ping" de 2,5 % en la lente entre los frames 72 y 84.
- **Sobre (`fly`).** Entra desde fuera del lienzo (x -940, y +170, giro -20°) y aterriza con un rebote de escala (`sx` 1,05 / `sy` 0,93, luego 0,99 / 1,02). Es el único segmento que **empieza fuera de reposo** (`offPoseStart: ["root"]`); termina en reposo. El reposo del sobre lleva una inclinación fija (`rot` del nodo raíz).
- **Profundidad.** Los props grandes llevan una **placa gris oscuro desplazada (+18, +18)** detrás (losa del gráfico, placa del reloj, placa de la lupa; en el caso real `#4d4d4d`). Los pequeños (sobre, bombilla) van planos.
- **Contorno.** 5 unidades en props, 4 en personajes, a 1000 px de lienzo: se ve de ~1 px a 160-250 px de pantalla. Ningún trazo de tinta menor de 5 en un prop (antes: 3,2 en un filamento y en las costuras, medio píxel a 160 px). El gate **no** lo mide: ponlo en el generador (`checkInkStroke` de `scripts/lib.mjs`, ver `07-gate.md`).

## 4. Fondos
Un fondo es un escenario para componer **detrás** de los personajes. Segmentos: `idle` y `enter`.

| Segmento | Frames | Pasadas | Duración |
|---|---|---|---|
| `idle` | 48 | 2 | 3,2 s |
| `enter` | 44 | 1 | 1,47 s |
| `enter` + `idle` encadenados | | | **4,67 s** (≤ 5 s) |

- **`idle` ambiental:** nubes ±12 px **en contrafase** (una +12, otra -12 desfasada 4 o 5 frames), hojas ±4° escalonadas 1 frame, tallo 1,5°, planta del estante ±3,5°, vapor ±7 px con escala 0,85 a 1,15, copa del árbol ±2,5°, franjas del toldo ±8 % en `sy` (pivote en el riel, para que no salgan de la pared). Siempre en reposo en los extremos.
- **`enter`:** la escena se arma. Los grupos entran ±28 a 36 px con `o` (frena), con un escalonado de 8 frames como máximo entre el primero y el último; el suelo entra solo con opacidad.
- **`enter` empieza fuera de reposo por diseño** (`offPoseStart` con todos los grupos en opacidad 0): su frame 0 es un lienzo vacío. `export-lottie` (lee el JSON) y `render.mjs --rest-check --parts parts.json` (compara lo que dibuja el player) exentan el inicio de esos segmentos; el final sigue estricto.
- **Por qué importa el frame 0.** `lottie_light` pinta el frame 0 al cargar. El frame 0 de un fondo con `enter` es la escena vacía. La fachada lo "aparca" en el frame `enter.tm` hasta que toca reproducir. Con movimiento reducido se aparca en el frame 0 de `idle`: la escena completa en reposo.
- **Por qué el presupuesto va por ráfaga.** La fachada junta las ráfagas separadas por menos de 1 s. `enter` + `idle` cuentan como una. Con un `idle` de 60 frames daba 5,47 s y se cortaba a media oscilación. `check-lottie --parts` ya lo vigila (ver `07-gate.md`).
- **Zona calma para los personajes: x de 350 a 650, pies en y ≈ 930.** Línea de suelo en y = 932. Ahí el fondo no lleva tinta. Medido en el fondo solo (x 350..650, y 80..930): píxeles de tinta oscura 0,00 % en dos fondos y 0,01 % en el tercero; cualquier píxel no blanco, 0,35 a 0,37 %.
  **Cómo se mide** (el fondo solo, a 1000 px, sin personaje): `node SK/scripts/render.mjs fondo.json --frame <idle.tm> --size 1000 --out fondo.png` y luego
  `node SK/scripts/zona-calma.mjs fondo.png` (imprime el % de píxeles con luma < 100 y el de no blancos en x 350..650, y 80..930; `--max 0.05` lo hace fallar si pasa). La escena vive en los flancos (3 a 14 % de tinta). En poses amplias (`happy`) los brazos cruzan el fondo: el personaje queda encima, pero la zona solo está calma en reposo.
- **Bordes:** ningún borde derecho sale del lienzo (todo ≤ x 965, con su trazo a la vista), para que el cuadrado del slot no corte una forma con una línea vertical. Todo contorno de tinta mide lo mismo (5).
- **Color:** casi todo neutro; el color de marca solo como acento pequeño (una maceta, un libro, un farol, una franja del toldo).

## 5. Animación ligera de escenas originales del pack
Una escena del pack ya viene dibujada y compuesta. Se conserva **tal cual** y solo se recolorea y se separan las pocas piezas que se mueven.

- **Regla de fidelidad:** composición y dibujo del donante intactos. Una pieza = relleno + su anillo de contorno (por índice). Todo lo que nunca se mueve va en **piezas estáticas sin nodo**, partidas solo donde una pieza móvil se intercala en el z-order.
- **Movimiento ligero:** respirar (escala Y sobre la cintura), parpadear (escala Y de cada ojo, escalonados), un prop. Nada más.
- **`idle` de las escenas:** 72 frames × 2 = 4,8 s. La acción: 66 a 96 frames.
- **Cuerpo rígido** cuando hay juntas abiertas: en la escena de la lupa el brazo, la mano, el mango y la lente giran como una sola pieza desde los hombros; en la del martillo el antebrazo, el puño y el martillo giran desde el codo; en la de carga, todo lo que está sobre las caderas.

| Escena | Acción | Detalle |
|---|---|---|
| Correo | `send` 72 frames | empuje con anticipación de +3°, la carta se desliza bajo una pieza `slotCover` (mismo color que el buzón, sin contorno) y desaparece, el buzón vibra, el brazo vuelve y una **carta nueva aparece con un pequeño pop** (opacidad sobre la pieza `letter`, posición reiniciada mientras está oculta); termina en el mismo reposo |
| Búsqueda | `search` 84 | la lupa barre izquierda-derecha como cuerpo rígido (≈48 unidades a un lado y 35 al otro; el barrido izquierdo se detiene donde la punta de la flecha toca el aro blanco, para no partirla); las cabezas siguen un poco |
| Mantenimiento | `fix` 66 | el martillo golpea **dos veces**: `i` (acelera) hacia el golpe en 6 frames, `o` al soltar; el golpe se detiene en -6° para que la cabeza caiga sobre los dedos; la tabla se sacude 3,5 unidades en los frames de impacto (13/15 y 30/32); el cartel pulsa una vez, sin cambio de color |
| Carga | `lift` 72 | el hombre se agacha (10 unidades, 1,8° hacia adelante: anticipación), se endereza con la ventana (14 arriba, la ventana 9 más: 23) y la asienta. **La barra de progreso del original no se dibuja**: una barra congelada al 60 % parecería progreso falso o atascado |
| No encontrado | `search` 96 (3,2 s) | misma lupa que la búsqueda; la interrogación dentro del cristal son **formas vectoriales** (trazo redondo de 12 más un punto), no texto ni fuente, y **se ve en reposo** (se lee con movimiento reducido). Se encoge en 8 frames al empezar el barrido, se asienta en el frame 78 y vuelve con rebote 1,16 → 0,96 mientras el hombre inclina la cabeza una vez |

- Los colores del donante se mapean a los roles del skill con una regla consistente: piel → rol de piel; azules y el objeto protagonista → color de marca (el único acento); oscuros → gris oscuro; amarillos, verdes y zapatos → gris medio; blanco queda blanco; negro → tinta.
- La piel del donante suele ser un color único por escena: se puede mapear a un rol. El **pelo no**: comparte color con ropa u objetos, o cambia de persona a persona; queda en gris y se documenta.

## 6. Presupuestos
| Qué | Tope | Dónde se vigila | Por qué |
|---|---|---|---|
| Frames por segundo | 30 | `check-lottie` | los markers y la cuenta de 5 s usan frames |
| Lienzo | 1000 × 1000 | `check-lottie` | piezas, fondos y personajes se apilan sin transformaciones |
| Frames totales | ≤ 450 | `check-lottie`, `export-lottie` | 15 s como techo de un archivo |
| Peso | ≤ 200 KB crudo | `check-lottie` (`--max-kb`) | ver abajo |
| Ráfaga que arranca sola | ≤ 5 s contando `repeats` | `check-lottie --parts`, lint de `export-lottie` | WCAG 2.2.2 |
| `enter` + `idle` | ≤ 5 s juntos | `check-lottie --parts` | la fachada los encadena |
| Ráfagas separadas por < 1 s | ≤ 5 s en total | la fachada, no el gate | misma razón; agotado el tope, la siguiente salta a su frame final hasta que haya 1 s de reposo |
| Parpadeos | ≤ 3 por segundo | diseño | WCAG 2.3.1 |
| Contorno | ≥ 5 (props), ≥ 4 (personajes) | el generador (no el gate) | se ve de ~1 px en pantalla |

- **Sobre el peso.** El tope empezó en 120 KB y se subió a 200. Un personaje real de 28 piezas y 7 markers pesó 157 KB crudos y 26 KB comprimidos. Redondear decimales apenas ayuda (de 161 265 a 161 069 bytes al pasar a 3 decimales); lo que pesa es la **estructura** (número de piezas y de claves), no la animación. Para bajar peso, quita piezas o claves, no decimales.
- **Tamaños reales del caso:** props 11 a 22 KB, un fondo 46 KB, escenas del pack 88 a 136 KB, personajes 109 a 158 KB. El fixture sintético de 25 piezas pesa 38 KB; la bombilla de `ejemplos/`, 13 KB.

## 7. Errores reales y su arreglo
- **`thinking` tapaba la boca.** La mano a -38° / antebrazo -145° cubría la boca. Arreglo: la mano **debajo del mentón**, probando candidatos en un previsualizador de poses antes de tocar nada.
- **`walk` cruzaba las piernas** y las manos se juntaban delante. Arreglo: zancada menor (±14°), brazo contrario a la pierna, flexión de la rodilla de atrás.
- **Un salto al final.** Un segmento que llega a toda velocidad al último frame salta al reposo. Arreglo: 3 o 4 frames quietos; `export-lottie` compara `dr - 1` con el reposo (tolerancia: 2,5 px, 0,6° de giro, 5 % de opacidad).
- **Un `idle` de fondo de 60 frames** se cortaba a media oscilación al encadenarse con `enter`. Arreglo: 48 frames.
- **Una barra de 0 de ancho** dejaba un pelo de contorno. Arreglo: mínimo 0,12 con desvanecido.
- **Un cambio de color animado** no pasa el gate. Arreglo: piezas superpuestas con opacidad.
- **El fondo se veía completo, desaparecía y se rearmaba** al cargar. Arreglo: aparcarlo en el frame vacío de `enter` hasta que toque.

## 8. Antes de exportar
1. Cada segmento empieza y termina en el reposo (el export lo comprueba leyendo el JSON).
2. Cada ráfaga que arranca sola ≤ 5 s con sus pasadas; `enter` + `idle` ≤ 5 s.
3. Ningún color animado; los cambios son opacidad de piezas extra.
4. Los poses clave se ven bien: `node SK/scripts/render.mjs X.json --segment wave --at 0,18,36,60 --size 300`.
5. Una sola pasada de Chrome a la vez al renderizar (un perfil temporal propio, ~90 s de tope).
