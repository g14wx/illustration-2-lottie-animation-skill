# Lecciones aprendidas

Dos listas. La **A** son errores y hallazgos que pasaron de verdad en la sesión de origen, como **síntoma -> causa -> arreglo**.
La **B** son trampas que las herramientas y las plantillas ya evitan: no se vieron fallar, pero se diseñó contra ellas y conviene saber por qué.
Lo que no se pudo confirmar con una medida se dice. El detalle técnico de cada tema está en `01-recepcion-del-pack.md` a `07-gate.md`; el runtime, en `08-web-runtime.md`.

## A. Errores que pasaron

### Arte, paleta y rig
- **Los números del overlay de índices se tapaban entre sí** (0, 1 y 22 apilados sobre la cara) -> cada etiqueta iba en el centro de su elemento -> cada número busca el primer hueco libre.
  `index-svg.mjs` ya lo hace; en el fixture de persona se leen los 26.
- **El filamento de una bombilla y las costuras de un sobre medían medio píxel a 160 px** (trazo de 3,2) -> contorno demasiado fino -> contorno **>= 5 unidades en objetos y >= 4 en personajes** (~1 px a la talla de pantalla), y todo el contorno de tinta de una pieza del mismo grosor.
- **Tinta sobre un velo de marca no se leía** (3,3:1 en claro; blanco sobre azul claro, 1,8:1 en oscuro) -> el alambre de tinta quedaba sobre el color -> se funde con una pieza de papel (`filamentOn`) que aparece solo cuando el velo está activo (papel sobre velo: 4,7:1 en claro; fondo oscuro sobre velo: 6,9:1).
- **La piel y el pelo compartían color con otras piezas** (la piel era el gris claro compartido; el pelo, la tinta) y la piel gris se veía rara -> la paleta de autoría no los separó desde el principio ->
  se les dio rol propio. Si ya es tarde, `split-roles.mjs` los separa en el spec, en los SVG y en los Lottie (solo el relleno; el contorno sigue siendo tinta) y hay que repetirlo en **cada exportación nueva**.
  Moraleja: **define piel y pelo como roles propios desde el primer `parts.json`** (`palette` por pieza).
- **El pelo de las escenas del pack no se pudo separar** -> su color de donante lo comparten ropa y objetos (el mango de un martillo), cambia de persona a persona o es la tinta -> se dejó gris y se documentó. La piel sí era única por escena y se mapeó.
- **Un test fallaba al cambiar la paleta de la marca** -> comparaba las claves de `roles.json` con los valores actuales de los tokens, pero las claves son **colores de autoría y no se reescriben nunca** -> se arregló el test, no las claves.
  Cuando llegó la paleta oficial, todo el arte cambió solo, sin re-exportar.
- **El Lottie del personaje pesó 157 KB y el presupuesto era 120 KB** -> el peso lo da la **estructura** (número de piezas y de claves), no la animación -> el presupuesto se recalibró a **200 KB** (`--max-kb`); los decimales ayudan poco (`precision` de 3 a 2 es el último recurso): lo que baja el peso es quitar piezas o claves.
- **La mano de "pensando" tapaba la boca** (la mano subía a la cara) -> la pose del brazo -> la mano bajo el mentón y la boca visible.
- **La caminata cruzaba las manos delante de la cadera (frame 79) y las piernas en tijera (frame 94)** -> el brazo no era opuesto a la pierna y la zancada era grande -> brazo opuesto a la pierna del mismo lado, piernas de +-14 grados, rodilla trasera doblada al empujar.
  Se vio renderizando los frames de las poses clave, no el movimiento. Previsualiza las poses fuera de línea antes de tocar el editor.
- **Un solo tono de piel para todo el reparto** (el pack traía varios) -> se aprobaron dos tokens, no más -> riesgo de diversidad aceptado y anotado; un segundo token de piel es otra decisión.
- **En oscuro, el pelo sin contorno casi no se separa** (1,8:1 contra piel y contra fondo) y la piel cambia de tono para que los rasgos blancos se lean (3,82:1) -> se aceptó porque ninguna pantalla enviada pinta arte oscuro; quedó en la lista de límites aceptados.

### Creator (LottieFiles) y exportación
- **Creator no exportaba y el trabajo se perdió al cerrar la pestaña** -> en modo invitado no exporta -> **inicia sesión antes de empezar**. Pasó una vez y hubo que rehacerlo.
  Exportar: Export -> "Save as new" / desmarcar otras escenas -> elegir la escena -> Export -> Download -> "Lottie JSON". Cae como `.tmp` o `.json` en Descargas (en WSL: `/mnt/c/Users/<usuario>/Downloads`); cópialo al repo.
- **Una capa exportaba a 500 x 500 y `lottie_light` la recortaba** -> se creó con `create_scene_layer` -> usa solo `group_layers` (exporta 1000 x 1000). `check-lottie` rechaza esas precomps (`bad-precomp-size`).
- **Las posiciones que mostraba `read_scene` no coincidían** después de mover un ancla -> `read_scene` enseña posiciones y bounds viejos -> la verdad es `read_keyframes`. El ancla va en coordenadas del lienzo, no relativas al centro.
- **La persona que aprobaba creyó que el resultado era un cuerpo de piezas simples** -> lo primero que se ve en Creator es el "rig body", un cuerpo de prueba para validar pivotes -> dilo siempre al mostrar capturas del editor.
- **La página de Creator se colgó** -> se le inyectó JavaScript propio (un parche) -> no lo hagas, solo herramientas MCP. Hubo que recargar la página e iniciar sesión.
- **Creator no tiene herramienta de exportar** -> el humano hace un clic, o un agente con control del navegador (una extensión) hace esos clics.
- **Se descubrió que Creator no hacía falta para exportar** -> `export-lottie.mjs` lee `parts.json` (rig + plan de animación) y escribe un Lottie plano con **capas null con `parent`** y una capa de forma por pieza ->
  para objetos, fondos y escenas se usa el código: reproducible, sin pestaña única, y deja el z-order de `parts.json` como fuente de verdad.
  Con precomps (`group_layers`) no se puede armar, por ejemplo, un sobre cuya carta va **entre** la solapa y el bolsillo.
- **Los colores del export tienen 4 decimales** (0,0824 x 255 = 21) y el nombre del marker sale como texto (`cm`): se esperaba un problema y no lo fue; el redondeo del gate coincide. Los nombres de marker repetidos no se detectaban al autorar; el `check-lottie` de este skill ya los detecta (`marker name "x" is repeated`).

### Gate y reproducción
- **Un segmento "se comía" el primer frame del siguiente** -> `lottie_light`, al acabar `playSegments([tm, tm + dr])`, queda en `tm + dr - 1` y después cae en el primer frame del marker siguiente -> separa los markers por un frame (`tm` = fin anterior + 1) y deja asentados en reposo los últimos frames de cada segmento.
- **`idle` repetido salía una pasada de más o de menos** -> en `lottie_light`, `loop = N` repite N veces después de la primera pasada (N + 1 en total) -> `loop = pasadas - 1`. Lo fija una prueba con el player real.
- **`goToAndStop` caía en un frame equivocado después de una ráfaga** -> tras `playSegments` los frames son relativos al segmento -> `resetSegments(true)` antes de `goToAndStop`.
- **El `idle` de un fondo se cortaba a media oscilación** -> `enter` + `idle` x 2 pasadas sumaban 5,47 s (con `idle` de 60 frames) y la fachada los junta en una sola ráfaga con tope de 5 s -> `idle` de 48 frames (4,67 s en total).
  `check-lottie --parts` ahora suma `enter` + `idle`.
- **Un fondo se veía completo, desaparecía y se armaba** -> `lottie_light` pinta el frame 0 al cargar y ese frame es la escena completa -> aparca el fondo en el lienzo vacío (`goToAndStop(enter.tm)`) hasta que toque reproducir; con movimiento reducido, en el reposo de `idle`.
- **Una vuelta completa de 360° no pasaba el chequeo de reposo** -> llega al frame `dr - 1` a toda velocidad, no asentada -> déjale 3 o 4 frames quietos al final.
- **El botón `▶` de la galería no avanzaba en Chrome headless** -> el tiempo virtual no hace avanzar `requestAnimationFrame` -> la galería se verifica montada y recoloreada en headless; la reproducción se ve en un navegador normal, o con el reloj de lottie congelado y avanzado a mano.

### Web
- **El arte salió en negativo en modo oscuro** -> `recolor` leía los tokens de `<html class="dark">` -> subárbol `.light` + tarjeta clara + leer `getComputedStyle(contenedor)`, con una prueba que lo fija. Ver `08-web-runtime.md`, sección 13.
- **El arreglo parecía no funcionar** -> la app usa rutas por `#` y cambiar el hash no recarga la página -> recarga la página completa. Ver `10-verificacion-visual.md`, sección 5.
- **La primera versión del login se hizo en el archivo equivocado** -> había dos páginas de login y la que se renderizaba era otra -> antes de editar, **verifica qué componente monta la ruta** (busca en el router, o abre la pantalla en el navegador y comprueba).

### Proceso
- **Se perdieron capturas, herramientas y hasta el brief de la sesión** -> el scratchpad `/tmp` se borra al reiniciar (pasó dos veces) -> las herramientas viven en el repo y el trabajo importante se commitea o se guarda fuera de `/tmp`.
- **El gate en clon limpio fallaba aunque en mi carpeta funcionaba** -> los exports no estaban commiteados, y `git add -N` (intención de agregar) dio falsos fallos -> **commitea antes** de correr el gate en clon limpio.
  Un gate que compara "regenerado contra commiteado" falla mientras no commiteas.
- **Un gate que buscaba una frase exacta en un documento se rompió** -> alguien cambió el texto a propósito -> el gate busca la **regla que sigue vigente**, no la redacción.
- **El chequeo de "no hay colores hex sueltos en el código" también escaneó las pruebas** -> los colores de prueba parecían colores de UI -> márcalos con la excepción que defina el proyecto (un comentario), o evita el hex en la prueba.
- **Un script de workflow se rompió al leerse** -> comillas simples sin escapar dentro del texto de un prompt -> usa template literals. Además, un `sed` con `\&\&` literal rompió un gate.
- **Una corrida de pruebas falló por timeout** -> dos sesiones cargaban la máquina a la vez, y una prueba importaba un módulo pesado dentro de cada test -> se importa una vez en `beforeAll` con un timeout holgado, y se respetan las ventanas "sin carga" del otro.
- **Había otra sesión integrando (fusionando) a la vez** -> tocar sus archivos calientes o sus ramas rompe su trabajo -> ramas congeladas y la sesión integradora fusiona; las dependencias nuevas las agrega ella (versión exacta, publicada hace más de dos semanas, sin `@latest`).
- **Una rama de vista previa con merges locales no se podía fusionar** (arrastraba commits ajenos) -> se entrega **un commit** para `cherry-pick`, no la rama.
- **La licencia puede no cubrir derivados** (piezas recortadas, personajes nuevos, animación) -> riesgo abierto hasta confirmarlo con el proveedor -> el pack no se commitea; los derivados solo en repos privados; la galería (que los incrusta) no sale del equipo hasta tener la confirmación por escrito.
- **A la persona que aprobaba le faltaba contexto** -> los mensajes suponían un hilo previo y no distinguían qué escribía el asistente -> un mensaje por tema, autocontenido, sin jerga, con ejemplo y cómo responder ("1A / 1B"); dice que lo escribe una IA. Ver `09-galeria-y-aprobacion.md`.

## B. Trampas que ya están evitadas (reglas con su porqué)
- **No recortes extremidades del donante** -> el recorte deja el borde del aro a la vista y un hueco al girar -> redibújalas como **cápsulas con articulaciones redondas**: los dos segmentos miden lo mismo en el pivote, el hijo no dibuja su borde superior y una tapa (copia sin trazo, 4 unidades más estrecha de ancho: `w - 4`) cubre el tramo que queda dentro del padre. `ejemplos/extremidades.mjs`.
- **Los índices van en parejas** (relleno y su aro negro, seguidos) -> si separas el aro, la pieza pierde el contorno. Mira el overlay (`index-svg.mjs`) antes de escribir `indices`.
- **Colores casi iguales del pack** -> `build-parts` falla en voz alta ante un color fuera de la paleta. Mira `build-parts.mjs --colors donante.svg`; mapea en `palette`, o usa `--nearest` (acerca al rol más parecido y avisa cada cambio).
- **El donante debe traer `viewBox="0 0 1000 1000"`** -> si no, las piezas no coinciden con el lienzo; `build-parts` avisa por stderr.
- **Ningún color se anima** (`bad-animated-color`) -> el cambio de color se hace con una pieza extra superpuesta y su **opacidad** (velo de marca de una bombilla: sube en 4 frames, baja en 18, una sola vez; muy por debajo de 3 destellos por segundo).
- **Nada baja a escala 0** -> queda un trazo de pelo; el mínimo es 0,12 con desvanecido.
- **Escala solo en el eje propio** -> un rayo (o una barra) se dibuja recto (vertical); su nodo lleva el ángulo como giro estático y solo se anima `sy`. Así el ancho y el contorno no cambian.
- **El tiempo no retrocede** -> la manecilla de las horas de un reloj solo da un golpe de ~7° al llegar el minutero y vuelve.
- **Profundidad sin sombras ni degradados** (están prohibidos) -> una placa gris oscura desplazada (+18, +18) detrás de lo grande; lo pequeño va plano.
- **Zona calma para los personajes** -> x 350-650, pies en y ~930, sin tinta del fondo ahí (medido: 0,00-0,01 % de tinta oscura; el método está en `04-animacion.md` §4 y `scripts/zona-calma.mjs`). Con poses amplias el personaje igual queda encima de un árbol o un toldo.
- **Bocas como 3 piezas** (neutra, sonrisa, "o") que se alternan por opacidad con dos keyframes a un frame de distancia, en vez de deformar una boca.
- **Movimiento sobrio** -> menos de 1/3 de las piezas moviéndose a la vez; easing sinusoidal en los loops; anticipación y continuación; nada parpadea más de 3 veces por segundo.
- **Una sola pestaña viva en Creator** -> todo lo que toque Creator va en **un solo agente, secuencial**. El arte fuera de línea y la revisión sí van en paralelo.
- **El JSON pequeño se incrusta como `data:`** si el bundler lo decide -> `?url&no-inline` (Vite) o el equivalente; verifica en el build que el chunk de entrada no tiene el player.
- **Sin `IntersectionObserver` (SSR, jsdom) nunca se importa lottie** -> las pruebas de pantalla no cargan el player. (La falla exacta de jsdom no se midió.)
- **`onError` quita el bloque entero** -> un prop no queda flotando sobre el texto y no queda hueco.
- **Escena de varias piezas** -> se revela cuando todas avisaron `onReady`, y arrancan juntas; si no, aparecen una a una.
- **El arte nunca inventa progreso** -> sin `walk` en loop mientras carga, ni barras que se llenan, ni contadores: solo reacciona a cambios reales (`segmentFor`).
- **Un prop al lado del personaje va fuera del flujo** (`absolute`) -> al aparecer no cambia el tamaño del personaje ni mueve la pantalla.
- **A 390 px de ancho, el arte mide <= 342 px** -> `w-full` + `aspect-square` + `max-w-*`, nunca un ancho fijo.
- **La galería con CDN solo sirve para revisar** -> `build-galeria.mjs --player <lottie_light.min.js>` mete el player y funciona sin red. Los assets reales no usan CDN.
- **Subagentes** -> agentes cortos con un paquete de contexto pequeño (un agente que da muchos pasos relee toda su conversación en cada uno); si tu entorno lo permite, un **modelo más barato** para subagentes. La sesión de origen usó siempre el modelo intermedio.
- **Un icono neutro se puede sustituir por la ilustración; un estado (error, éxito) no.** Los estados siempre llevan icono + texto + color: la ilustración va **junto** al icono de estado, no en su lugar.
- **El color de marca dentro de una ilustración es ornamento**, sin el significado de acción que tiene en la interfaz, y ningún token de estado (advertencia, error) entra como adorno: perderían su significado.
- **Un player con pocas versiones es un riesgo menor si lo aíslas** -> versión fijada + exports en Lottie estándar + una sola puerta (la fachada): cambiarlo es editar un archivo.
- **Si las reglas de diseño del cliente prohíben animación, dependencias nuevas o héroes**, escribe una excepción acotada y enmienda el documento citándola (ver `12-caso-real.md`, decisión 13). No lo hagas "por esta vez".
- **Cada pregunta de un spike lleva su plan B escrito antes de probar** (ver "Riesgos y plan B" en `12-caso-real.md`): aplanar un nivel de precomp, inyectar los markers con ~10 líneas de post-proceso, redondear colores y normalizar `cm`, o una tolerancia de ±1/255 en el gate.
- **Cuando cambias una herramienta compartida** (`export-lottie`, `check-lottie`, `build-parts`, `pathkit`): regenera todos los activos y exige `git diff --quiet` sobre los exports (`07-gate.md` §8). Una herramienta que solo agrega algo no debe cambiar ni un byte de lo ya exportado.
- **No confíes en el "verde" que reporta un agente** -> "hecho" es la salida real del gate en un clon limpio, más el build y una prueba de humo.
