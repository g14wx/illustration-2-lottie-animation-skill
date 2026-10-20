# Caso real: de un zip de ilustraciones a animaciones en producción

Así se hizo, contado de forma genérica. Sirve para ver el orden, qué salió de cada etapa, cuánto pesó y qué decidió la persona responsable (y por qué).
No lleva nombres de cliente ni de proyecto. El arte del pack no se incluye en este repo.

**Punto de partida.** Un producto B2B (SaaS) con dos apps web: un front público y un CRM interno. El equipo compró la licencia de un pack comercial de ilustraciones planas:
un zip con 50 SVG y 100 PNG. Pidió verlas **animadas**: personajes que caminan, saludan y cambian de expresión, más objetos y escenarios nuevos en el mismo estilo.
Las reglas de diseño de la app pedían un tono sobrio y prohibían animaciones largas, así que hizo falta una excepción escrita y acotada.
Trabajo hecho por un lead dev con agentes de código, en unos dos días de sesión. Cada etapa tuvo su propio script de workflow, sus agentes y un gate.
El cómo de cada etapa está en `01-recepcion-del-pack.md` a `07-gate.md`; los errores, en `11-lecciones.md`.

## Línea de tiempo

| # | Etapa | Qué produjo | Números |
|---|---|---|---|
| 0 | **Decisión de runtime** (ADR) | `lottie-web` build light detrás de una fachada con carga diferida; excepción acotada a las reglas de diseño; riesgo de licencia anotado | Puntajes ponderados: lottie-web light 8,10; lottie-react 6,70; SVG + CSS 6,65; dotlottie (WASM) 5,65. Pesos: pipeline 25 %, peso/carga 20 %, accesibilidad 20 %, simplicidad 20 %, riesgo de dependencia 15 % |
| 1 | **Herramientas y gate** | `build-parts`, `check-lottie`, `roles.json`, fixtures que fallan a propósito. Dos tareas en paralelo (el ADR con los documentos, y las herramientas), dos verificadores adversariales por tarea (lente de especificación y lente de riesgo) y una ronda de arreglo | Gate: 30 fps, 1000 x 1000, <= 450 frames, <= 200 KB (al principio 120 KB), colores solo de `roles.json` |
| 2 | **Spike en Creator** (S0) | Un brazo con hombro, codo y mano y 2 segmentos, armado por MCP, exportado y reproducido con `lottie_light` | 7 preguntas respondidas (importación, anclas, precomps, markers, `ef`/`sid`, sólidos, decimales) |
| 3 | **Personaje piloto** | Piezas del pack + dibujo propio, revisión de estilo por un "director de arte" (otro agente, hasta 2 rondas), rig en Creator, 7 animaciones, pulido de dos poses | **28 piezas**, **7 segmentos**, 30 fps, 417 frames, export de **157 KB** |
| 4 | **Galería v1** | Página de aprobación con Play por segmento, movimiento reducido, zoom 3x, originales al lado y paleta A/B | Ver `09-galeria-y-aprobacion.md` |
| 5 | **Reparto y objetos** | 2 personajes más por `reskin` sobre el rig aprobado (más piezas dibujadas por código); 5 objetos exportados **sin Creator** con `export-lottie` | **3 personajes**, **5 objetos** (sobre, lupa, gráfico, reloj, bombilla), 1 Lottie cada uno |
| 6 | **Fondos y escenas originales** | 3 fondos para poner detrás de los personajes y 4 escenas del pack con animación ligera, más una quinta con lupa y "?" | **3 fondos**, **5 escenas** (correo, mantenimiento, no encontrado, búsqueda, carga) |
| 7 | **Runtime y montaje** | Fachada `<Illustration>` con tests, `segmentFor`, y el arte montado en 7 pantallas del front público | Chunk del player 46,8 KB gzip, fuera del chunk de entrada |
| 8 | **Escena compuesta en el login del CRM** | Fondo + 3 personajes, revelados juntos; frase corta al lado. Fachada copiada al CRM | 4 JSON en el login; ráfaga más larga ~4,7 s |
| 9 | **Bug de modo oscuro** | Arte en negativo; arreglo con subárbol claro y lectura de tokens desde el contenedor | Texto vecino 11,1:1; tarjeta contra panel 17,96:1 |
| 10 | **Paleta con piel y pelo** | Dos tokens propios para ilustraciones; roles separados en los Lottie y en las escenas | 6 colores de autoría -> 8; rasgos sobre piel 5,45:1 claro, 3,82:1 oscuro |
| 11 | **Cierre** | Gates en clon limpio por tarea; galería v1 a v6 | Se construyó más de lo que se montó: **10 JSON** en el front público y 4 en el CRM |

### Detalle de las etapas que más enseñan
**0. Decisión.** Se consultaron patrones (carga diferida y fachada), accesibilidad (WCAG 2.2.2: movimiento que dura más de 5 s necesita pausa; lo que arranca por scroll cuenta como "empieza solo")
y se midieron los paquetes de verdad (tarballs, no el folleto). La fachada se eligió porque cambiar de player es editar un solo archivo.

**1. Herramientas antes que arte.** El gate (`check-lottie`) se escribió **antes** de animar nada, con fixtures que deben fallar (uno por regla).
Así, cuando llegó el primer export, ya había un criterio objetivo: sin gradientes, sin colores animados, sin `ef`/expresiones/máscaras/mattes, sin capas de texto o imagen, precomps de tamaño completo, markers requeridos sin solaparse y los que arrancan solos <= 5 s.

**2. Spike.** Se probó con un brazo antes de rigear un cuerpo: cada pregunta tenía su plan B (ver "Riesgos y plan B", abajo). Las respuestas que más pesaron: `group_layers` sí exporta 1000 x 1000 y `create_scene_layer` no (500 x 500);
la verdad de las posiciones es `read_keyframes`; sin sesión iniciada Creator no exporta.

**3. Piloto.** Piezas por índice de path de varios donantes (cabeza, pelo, manos y zapatos del pack), extremidades dibujadas como cápsulas con articulaciones redondas,
un agente "director de arte" que juzga contra los originales y devuelve `pass/score/fixes`. Reglas de movimiento: easing sinusoidal en los loops, anticipación y continuación, menos de 1/3 de las piezas moviéndose a la vez,
bocas como 3 piezas que se alternan por opacidad. Segmentos a 30 fps: `idle` (72 frames x 2 pasadas, 4,8 s), `walk` (30 x 3, 3 s), `wave`, `point`, `happy`, `surprised`, `thinking` (2 a 2,5 s cada uno).
El peso (157 KB) hizo recalibrar el presupuesto a 200 KB: lo da la estructura.

**5. Descubrimiento.** Para objetos no hace falta Creator: `export-lottie.mjs` lee el rig y el plan de `parts.json` y escribe el Lottie. Es reproducible, no depende de una pestaña única y deja el z-order en `parts.json`.
Reglas que salieron ahí: markers separados por un frame; contorno 5 en objetos y 4 en personajes; profundidad con una placa gris desplazada; los cambios de color con piezas extra que cambian de opacidad; escala solo en el eje propio; el reloj no retrocede.

**6. Fondos.** `idle` ambiental (nubes, hojas, vapor) y `enter` donde la escena se arma; el frame 0 de `enter` es el lienzo vacío, y la fachada lo "aparca" allí. Presupuesto de 5 s: `enter` (44 frames) + `idle` (48 x 2) = 4,67 s.
Zona calma donde van los personajes. Las escenas conservan la composición del pack y solo recolorean y separan unas piezas móviles; **ninguna sugiere avance** (sin barras que se llenan).

**7. Montaje.** Cada pantalla reacciona solo a cambios reales (`segmentFor`). Se montó el arte según una tabla aprobada por pantalla (verificación de correo, progreso, no encontrado, error y no disponible, cancelado, éxito, formulario).
La pantalla de lectura preliminar quedó **sin** ilustración a propósito. A 390 px ningún contenedor pasa de 342 px.
Forma de la tabla aprobada (ejemplo genérico; la tuya sale de tus pantallas, y sin tabla aprobada no se monta):

| Pantalla | Arte | Segmento | Cuándo se mueve |
|---|---|---|---|
| Verificar correo | escena "correo" | `idle` | al entrar a la vista (una ráfaga) |
| No encontrado | escena "búsqueda" (lupa con "?") | `idle` | al entrar; el "?" se ve también en reposo |
| Error o no disponible | escena "mantenimiento" + el icono de estado y su color | `fix` | al entrar |
| Éxito | personaje (`happy`) + bombilla (`idea`) al lado, chica | `happy` e `idea` | una sola vez, al llegar al éxito |
| Formulario | fondo "oficina" (`enter`) con un personaje (`wave`) encima | `enter`, luego `wave` | al entrar; el personaje saluda en la zona calma |
| Progreso | personaje | `point`, `thinking`, `surprised` | solo si el paso, un aviso o un fallo **cambian de verdad** (`segmentFor`); un poll igual no mueve nada |
| Lectura de datos | nada | | datos reales o nada |


**8. Login del CRM.** Se le mostraron al lead tres opciones; eligió "el equipo" (el fondo con tres personajes) más una frase corta. La fachada se **copió** al CRM (dos consumidores, ~250 líneas estables) en lugar de crear un paquete compartido;
un gate de identidad (assets idénticos byte a byte, `REPEATS` contra cada `parts.json`) frena la deriva. Con un tercer consumidor, pasa a paquete compartido.

**9. Modo oscuro.** Lo notó quien revisaba, a ojo: preguntó si era su pantalla o si los colores se distorsionaban con el tema oscuro. Detalle y prueba en `08-web-runtime.md`, sección 13.

## Decisiones que tomó la persona responsable (y por qué)
1. **Lottie con rig, no CSS**: quería personajes que se mueven como personajes. La opción de SVG con keyframes puntuó bien en peso, pero no cumplía ese requisito.
2. **Una excepción escrita y acotada a las reglas de diseño**: acentos en momentos clave, ráfagas de <= 5 s, nunca como héroe ni en la lectura de datos, sin loops. No "por esta vez".
3. **Piloto primero, aprobación humana después, luego escalar.** Si el estilo no gustaba, cambiarlo costaba un personaje, no veinte piezas.
4. **Paleta por tokens.** Las ilustraciones usan la paleta de la marca a través de `roles.json`; cuando llegó la paleta oficial, cambiaron los tokens y todo el arte con ellos.
5. **Variante B de piel y pelo** (dos tokens propios) frente a grises neutros: eligió después de ver tres pares. Quedó anotado como excepción acotada (solo ilustraciones) y se **avisó** al cliente, que puede pedir "solo paleta oficial".
6. **Qué arte va en cada pantalla**, con un ajuste concreto: en "no encontrado", la lupa lleva una interrogación ("aprobado + ?").
7. **Login del CRM**: la opción "el equipo" más una frase corta. La frase es propuesta (puede cambiarse en una línea).
8. **Arreglo de modo oscuro con una tarjeta clara**, en vez de diseñar una paleta oscura para el arte: es más barato y no cambia nada en modo claro.
9. **Fachada duplicada en dos apps** (regla de tres): dos copias cuestan menos que una abstracción equivocada.
10. **Licencia**: confirmar con el proveedor si cubre derivados; no bloquea el trabajo en la rama, pero debe quedar confirmado antes de fusionar. La galería no sale del equipo mientras tanto.
11. **Un icono decorativo y neutro se puede sustituir por la ilustración; un estado no.** En "no encontrado" y "cancelado" (neutros) la ilustración reemplazó al icono gris. En error y éxito se **mantuvo** el icono de estado y su color junto
    a la ilustración, porque los estados siempre llevan icono + texto + color.
12. **El color de marca dentro de una ilustración es adorno**, sin el significado de acción que tiene en la interfaz, y **ningún token de estado** (advertencia, error, éxito) entra como decoración: así los colores de estado no pierden su significado.
13. **Una excepción escrita y acotada cuando las reglas de diseño del cliente prohíben animación, dependencias nuevas o héroes**: se enmiendan los documentos de diseño citando la decisión, con sus límites (acentos, ráfagas <= 5 s, nunca héroe ni lectura de datos). Si no se enmienda, el trabajo queda fuera de las reglas.

## Riesgos y plan B
Cada riesgo se escribió antes de empezar, con su mitigación y su plan B:

| Riesgo | Mitigación | Plan B |
|---|---|---|
| `lottie-web` casi no publica versiones (la última fue 5.13.0) | Versión fijada, exports en Lottie estándar y puerta única (la fachada): cambiar de player es editar un archivo | Otro player que lea Lottie estándar detrás de la misma fachada |
| Creator colapsa piezas al importar, desplaza capas al mover un ancla o no exporta markers | El spike con un brazo, antes de rigear el piloto | Importar una pieza por SVG y componer en Creator; compensar la posición a mano; inyectar los markers con un post-proceso de ~10 líneas |
| Las precomps exportan a un tamaño distinto de 1000 x 1000 | El gate las rechaza (`bad-precomp-size`) | Aplanar un nivel de precomp (en la ruta de código ya no hay precomps) |
| El export trae `ef`, `sid`, máscaras o un sólido | El gate los rechaza | Quitarlos en un post-proceso, no usar esa función del rig, o dibujar el fondo como forma |
| Los colores salen con decimales (0,0824 x 255 = 21) o el nombre del marker no es texto | `check-lottie --parts` sobre el export | Post-proceso que redondea colores y normaliza `cm`, o una tolerancia de ±1/255 en el gate (no hizo falta: el redondeo del gate coincidió) |
| `lottie_light` no reproduce algo del export (expresiones, efectos) | El gate rechaza `ef` y expresiones, y también máscaras y mattes aunque el player sí los soporte (se vetan por decisión) | Aplanar las precomps |
| La animación choca con el tono sobrio de la app | Solo acentos, paleta sobria, ráfagas cortas, nunca en la lectura de datos ni como héroe; la persona responsable aprueba la galería antes de escalar | Reducir la marca a neutros en la galería |

## Si lo repites, haz esto distinto
- Pregunta la licencia de derivados al **empezar**.
- Inicia sesión en Creator antes de armar nada, y guarda cada export en el repo en cuanto exista.
- Para objetos, fondos y escenas, ve directo al **export por código**; deja Creator para lo que de verdad lo necesite.
- Define **piel y pelo como roles propios** desde el primer `parts.json`.
- Escribe el gate y los fixtures que fallan **antes** del primer personaje.
- Mide el contraste de cada paleta y anota los límites aceptados con quién los aceptó.
- Revisa en el navegador real, recargando la página completa, antes de decir "hecho".

## Orquestación (por si la reproduces)
Cada etapa fue un script de workflow con los mismos tres movimientos: un agente **constructor**, uno o dos **verificadores adversariales** (lentes: "especificación y gates", "UX, accesibilidad y rendimiento") y un agente de **arreglo** que confirma
cada problema antes de tocar nada. El arte tuvo, además, un **director de arte** (otro agente) con una ronda de arreglo. Todo lo de Creator, un solo agente secuencial. Los subagentes corrieron con un modelo más barato que el principal.
En agentes sin workflows se hace igual, una etapa a la vez: `prompts.md`.
