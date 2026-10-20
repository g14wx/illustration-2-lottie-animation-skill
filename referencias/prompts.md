# Prompts por etapa (para copiar y pegar)

Son las instrucciones que se usaron en la sesión de origen, limpias y con variables. Sirven en cualquier agente: Claude Code, Codex, OpenCode,
Antigravity o Gemini. Corre **una etapa a la vez** y, si puedes, en una sesión nueva por etapa: arranca liviana y no arrastra lo anterior.

Reemplaza antes de pegar:
- `SK`: carpeta del skill (por ejemplo `~/.claude/skills/animate-illustrations-with-lottie`).
- `P`: carpeta del arte en el proyecto (donde viven `roles.json`, los `parts.json` y los Lottie).
- `W`: carpeta de trabajo **fuera del repo y fuera de `/tmp`** (capturas, HTML de revisión).
- `PACK`: carpeta donde descomprimiste el pack (**fuera del repo**, sin trackear).
- `ID`: nombre del asset (`persona`, `bombilla`, `fondo-oficina`…).
- `CHROME` y `LOTTIE_LIGHT`: variables de entorno de los scripts (ruta de Chrome y de `lottie_light.min.js`).

## Cómo repartir el trabajo con subagentes (Claude Code)
- **En paralelo:** el arte fuera de línea de cada personaje, objeto, fondo o escena (cada uno en su carpeta); los verificadores; los renders de revisión.
- **En secuencia:** todo lo que toque LottieFiles Creator (una sola pestaña viva = **un solo agente**), la galería, y cualquier archivo que dos agentes escribirían.
- Cada subagente recibe: el prompt de su etapa con las variables ya resueltas, su carpeta de salida, las rutas que puede leer y el formato del reporte. Nada más: un agente con poco contexto cuesta menos y se equivoca menos.
- **Modelo más barato para subagentes (opcional).** Todo lo mecánico (generar piezas, correr scripts, escribir pruebas, revisar) rinde bien con un modelo intermedio; guarda el modelo grande para decidir y para integrar.
  En Claude Code se elige con el parámetro `model` de la herramienta de agentes; en la sesión de origen todos los subagentes y workflows usaron el modelo intermedio.
- **Forma de cada etapa** (con workflows de Claude Code, un script por etapa; en otros agentes, tres sesiones seguidas):
  1. un agente **constructor**;
  2. uno o dos **verificadores adversariales**, que no arreglan nada y buscan romper lo hecho (lentes: "especificación y gates" y "UX, accesibilidad y rendimiento");
  3. un agente de **arreglo** que confirma cada problema antes de tocar nada (puede refutarlo con evidencia).
  Para el arte, un **director de arte** que devuelve `{ pass, score, fixes }`; si no pasa, una ronda de arreglo (máximo dos).
- El agente principal **no confía en el "verde" de los subagentes**: corre él mismo el gate y mira las capturas.
- Referencia de forma del script (según los de la sesión de origen; consulta la skill `workflow-authoring` de tu entorno para la API real):
  ```js
  phase('Build');  const rep = await agent(PROMPT_CONSTRUCTOR, { label: 'build:ID', model: 'sonnet' })
  phase('Verify'); const v = await parallel(LENTES.map((l) => () => agent(`${l}\n\nREPORTE:\n${rep}`, { label: 'verify', model: 'sonnet', schema: VEREDICTO })))
  phase('Fix');    const fix = await agent(`${PROMPT_ARREGLO}\n\n${JSON.stringify(v.flatMap((x) => x.issues))}`, { label: 'fix', model: 'sonnet' })
  ```
  Los textos de prompt van en template literals (comillas invertidas): las comillas simples sin escapar rompen el script.

## Reglas comunes (pégalas al inicio de cada prompt)
```
REGLAS COMUNES
- Lector final: una persona del equipo. Español corto y simple; identificadores técnicos tal cual.
- Paleta: SOLO los colores de P/roles.json (claves). Nada de colores nuevos. Piel y pelo tienen rol propio.
- Trabaja solo en P y en W. No hagas git commit/push/stash. No toques archivos fuera de lo que te indico. No instales dependencias.
- El pack (PACK) tiene licencia comercial: no lo copies al repo, no copies sus rutas ni sus SVG/PNG a ningún documento. Los derivados solo se commitean en repos privados.
- Un solo Chrome headless a la vez, renders chicos (--size 200 a 400). Perfil propio. Cierra lo que abras.
- Lo que no verificaste lo dices como "no verificado". No reportes "verde" sin pegar la salida real del comando.
- Tope de pasos: 40 (constructor), 60 (verificador). Cerca del tope, cierra y anota lo que faltó.
- Reporte final: (1) archivos tocados, (2) salida real de los comandos, (3) rutas de los PNG, (4) debilidades honestas.
```

---

## E0. Orientación y licencia
```
Lee el pack en PACK (solo nombres de archivo y su LICENSE/README si existe; no copies nada).
Contesta, con cita del texto de la licencia: ¿cubre modificar las piezas, crear personajes nuevos a partir de ellas y animarlas? ¿Permite publicarlas en la web de un producto? ¿Hay límites de uso en un SaaS?
Si la licencia no lo dice, escribe "no está claro" y redacta la pregunta exacta para el proveedor (3 líneas).
Entrega: tabla de nombres de archivo del pack (cuántos SVG, cuántos PNG, categorías por nombre) y la lista de dudas de licencia. No inventes lo que la licencia no dice.
```

## E1. Inventario y elección de donantes
```
Haz una hoja de contactos de los PNG de PACK en W (una imagen con miniaturas y el nombre debajo). Léela.
Elige donantes para: (a) un personaje piloto en pose neutra de pie, 3/4 mirando a un lado, (b) 2 personajes más con siluetas distintas, (c) objetos y escenas que quieras animar.
Para cada donante: nombre de archivo, por qué sirve (qué piezas aprovecharías: cabeza, pelo, manos, zapatos), y los colores que usa:
  node SK/scripts/build-parts.mjs --colors DONANTE.svg
Los SVG de estos packs suelen traer fills por clases .cls-N en un <style>, <line> invisibles, y cada pieza como un path de relleno seguido de su aro negro. Dime qué ves distinto.
Entrega la lista corta de donantes (máx. 6) con justificación. No copies SVG al repo todavía.
```

## E2. Mapear las piezas de un donante
```
Donante: PACK/DONANTE.svg. Objetivo: decidir qué índices forman cada pieza.
  node SK/scripts/index-svg.mjs PACK/DONANTE.svg --png W/ID-indices.png --size 1000
  node SK/scripts/build-parts.mjs --list PACK/DONANTE.svg
Lee el PNG. Cada relleno va seguido de su aro de contorno: los índices van en pareja. El HTML (ID.index.html) deja ocultar elementos con "solo estos" (p. ej. 12-15, 20) para ver cómo quedaría una pieza.
Entrega una tabla: pieza -> índices (por ejemplo cabeza = 18-19, flequillo = 20-21), y los colores del donante que necesitan mapa a un rol (piel y pelo con rol propio).
Si el donante no trae viewBox 0 0 1000 1000, dilo.
```

## E3. Piloto: piezas y parts.json
```
Diseña el personaje piloto ID en estilo del pack, listo para rig (neutro, de pie, 3/4, brazos algo separados, pies a la anchura de hombros; ocupa ~85 % de la altura del lienzo 1000 x 1000, pies hacia y~940).
- Kitbash: cabeza, pelo, manos y zapatos de los donantes elegidos (copia SOLO los donantes que uses a P/ID/donors/).
- Extremidades, torso y cuello: DIBÚJALOS como cápsulas con extremos redondos centrados en los pivotes (mismo contorno, 4 unidades). No recortes extremidades del donante. Mira SK/ejemplos/extremidades.mjs.
- Piezas (de abajo hacia arriba): brazo/antebrazo/mano de atrás, muslo/pierna/zapato de atrás y de adelante, torso, cuello, cabeza, oreja, pelo, ojos, cejas, 3 bocas (neutra, sonrisa, "o"), brazo/antebrazo/mano de adelante. Cada una en su propio SVG, a coordenadas finales.
- P/ID/parts.json según SK/plantillas/parts.schema.md: donors, palette (piel y pelo con rol propio), parts (con node), joints (hombro, codo, muñeca, cadera, rodilla, tobillo, cuello, cintura), rig, segments.
- Genera las piezas:  node SK/scripts/build-parts.mjs P/ID/parts.json --roles P/roles.json
- Renders (W): (1) pose neutra; (2) prueba de articulaciones: brazo y pierna en poses extremas con grupos anidados; (3) expresiones; (4) junto a 2 PNG del pack, a la misma escala.
Entrega: lista de piezas con z-order, coordenadas de pivotes, donantes usados, rutas de PNG, debilidades.
```

## E4. Director de arte (juez)
```
Eres un director de arte exigente. Juzga los renders del reporte que sigue contra los PNG originales del pack (léelos).
Criterios: (a) fidelidad de estilo (grosor de contorno a la misma escala, rellenos planos, proporciones, caras mínimas); (b) listo para rig (sin huecos ni bordes rotos en la prueba de articulaciones, orden de capas correcto); (c) paleta limitada a roles.json; (d) calidad: ¿se vería profesional como acento en una página seria?
Sé concreto: qué pieza, qué cambiar, con números.
Responde SOLO JSON: { "pass": bool, "score": 0-10, "fixes": ["…"] }

REPORTE:
<pega aquí el reporte del constructor>
```
Si `pass` es falso: vuelve a E3 con "REVISIÓN: aplica todos estos arreglos y vuelve a renderizar todo: <fixes>". Máximo dos rondas.

## E5a. Rig y animación por código (ruta recomendada para objetos, fondos y escenas; también sirve para el personaje)
```
Anima P/ID/parts.json añadiendo `rig` (nodos con joint, parent, at, rot), `plan` (claves [frame, valor, ease]) y `segments` (idle con autoplay y repeats; el resto sin autoplay), según SK/plantillas/parts.schema.md y el ejemplo SK/plantillas/parts.ejemplo.json.
Reglas de movimiento: easing sinusoidal ("io") en los loops; anticipación y continuación; menos de 1/3 de las piezas moviéndose a la vez; todos los segmentos empiezan y terminan en la pose neutra; ningún color se anima (para cambiar de color, una pieza extra superpuesta que cambia de opacidad); escala solo en el eje propio; una pieza que desaparece baja a 0,12 y se desvanece, nunca a 0 (el parpadeo de ojos llega a 0,1); nada parpadea más de 3 veces por segundo; markers separados por un frame; el último frame de cada segmento ya asentado en reposo.
Cada segmento <= 5 s contando sus pasadas (30 fps). `enter` + `idle` de un fondo suman un solo tope de 5 s.
Exporta y verifica:
  node SK/scripts/export-lottie.mjs P/ID/parts.json --roles P/roles.json --name ID --out P/ID/ID.json
  node SK/scripts/check-lottie.mjs P/ID/ID.json --roles P/roles.json --parts P/ID/parts.json
  node SK/scripts/render.mjs P/ID/ID.json --segment NOMBRE --at 0,15,30 --size 300 --out W/ID-NOMBRE.png     (por cada segmento)
Entrega la salida real de los tres comandos y los PNG. Si el gate falla, corrige el parts.json (no el JSON exportado) y vuelve a exportar.
```

## E5b. Rig y animación en LottieFiles Creator (MCP `lottiefiles-creator`)
```
Usa SOLO las herramientas del MCP lottiefiles-creator (carga sus schemas con UNA búsqueda en bloque). UNA pestaña viva: trabaja en secuencia.
Inicia sesión antes de empezar (sin sesión no se puede exportar y el trabajo se pierde al cerrar). No inyectes JavaScript en la página.
1) create_scene "ID": 1000 x 1000, 30 fps, duración 14 s (420 frames). Actívala.
2) import_asset de cada SVG de P/ID/parts/ (tipo SVG, contenido = texto del archivo), de abajo hacia arriba, con name = nombre de la pieza.
   Verifica con read_scene: una capa raíz nueva por pieza.
3) set_anchor_point en coordenadas del LIENZO (no relativas al centro) en cada pivote, ANTES de agrupar.
4) Jerarquía SOLO con group_layers (nunca create_scene_layer: exporta 500 x 500 y lottie_light lo recorta). Construye de adentro hacia afuera
   y fija el ancla de cada grupo en su pivote recién creado:
     antebrazo+mano @codo -> brazo @hombro;  pierna inferior+zapato @rodilla -> pierna @cadera;  ojos @ojos;  cabeza @cuello;
     cuerpo superior @cintura;  figura @punto medio entre los tobillos.
   Tras cada group_layers: read_scene y read_keyframes (la posición debe ser igual al ancla). La verdad es read_keyframes, no read_scene.
5) Las bocas alternativas con opacidad 0 (un keyframe estático) para que se vea la neutra.
6) Segmentos con add_segment (nombres y rangos EXACTOS; el marker exporta dr = fin - inicio) y apply_keyframes con easings preestablecidos:
   idle      0-71     respiración (escala del cuerpo 100 -> 101,5 -> 100), cabeza 0 -> 1,5 grados -> 0, parpadeo (ojos escala Y 100 -> 10 -> 100 en 6 frames)
   walk      72-101   un ciclo en el sitio (se repite 3 veces): piernas +-14 grados, brazo OPUESTO a la pierna del mismo lado, rebote del cuerpo -6 px
                      dos veces por ciclo, rodilla trasera doblada al empujar, primer frame = último
   wave      102-176  anticipación y brazo levantado hacia fuera (hombro +70..+110, codo +70..+100; NO a -150: tapa la cara), antebrazo oscila tres veces, vuelve; sonrisa visible; cabeza 0 -> 3 -> 0 grados
   point     177-236  brazo a -85 grados, se mantiene, vuelve; cabeza se inclina hacia el punto
   happy     237-296  sonrisa, ojos entrecerrados, saltito de -24 px con anticipación, brazos algo abiertos
   surprised 297-356  boca "o", ojos más grandes, cejas arriba, inclinación hacia atrás
   thinking  357-416  mano BAJO EL MENTÓN (no sobre la boca), cabeza inclinada 6 grados, ojos arriba, una ceja arriba
   Todos empiezan y terminan en la pose neutra exacta. Las bocas cambian con dos keyframes a un frame de distancia.
7) Verifica con read_keyframes (primer y último frame de cada segmento = neutro) y list_segments (7 nombres, rangos exactos).
   Deja la escena activa y el cabezal en el frame 30.
Entrega: árbol de capas con ids, anclas, claves por segmento con lectura de vuelta (frame: valor) y lo que no pudiste hacer.
```
Exportar lo hace una persona (o un agente con control del navegador): Export -> "Save as new" / desmarcar otras escenas -> elegir la escena -> Export -> Download -> "Lottie JSON";
copia el archivo a `P/ID/ID.json` y pásalo por E6. Aviso para quien mira capturas del editor: lo primero que se ve es un cuerpo de prueba del rig, no el arte final.

## E6. Gate y revisión visual de un asset
```
Valida P/ID/ID.json:
  node SK/scripts/check-lottie.mjs P/ID/ID.json --roles P/roles.json --parts P/ID/parts.json
Si falla, no lo arregles a mano: dime qué regla y qué pieza, y corrige el parts.json (o, si es un export de Creator, la animación) y reexporta.
Renderiza con el player real (un Chrome a la vez):
  node SK/scripts/render.mjs P/ID/ID.json --segment NOMBRE --at 0,25,50 --size 300 --out W/ID-NOMBRE.png        (por segmento; --at son frames LOCALES; el último útil es dr: el player termina en dr - 1)
  node SK/scripts/render.mjs P/ID/ID.json --map W/mapa-oscuro.json --bg "#292929" --frame 0 --out W/ID-oscuro.png
Y lo que dibuja el player (sin PNG; sale 1 si algo difiere del reposo):
  node SK/scripts/render.mjs P/ID/ID.json --rest-check --parts P/ID/parts.json
Lee los PNG. Revisa: primer y último frame iguales al reposo, articulaciones sin huecos (acércate), orden de capas, contorno legible a la talla real, nada que sugiera avance falso.
Entrega la salida real de cada comando y tu juicio por segmento.
```

## E7. Paleta, piel y pelo
```
Estado: roles.json tiene claves de AUTORÍA (colores con que se dibuja) -> token CSS. Esas claves NO se reescriben cuando cambia la marca; cambiar la paleta es cambiar el valor de los tokens.
Tarea: dar a piel y pelo un rol propio.
- Si el arte aún no existe: pon `palette` por pieza en parts.json (piel y pelo con su color de autoría) y añade las dos claves a roles.json.
- Si el arte ya comparte colores con otras piezas: escribe split.json (formato en SK/plantillas/parts.schema.md) y corre
    node SK/scripts/split-roles.mjs split.json --spec P/ID/parts.json --lottie P/ID/ID.json --roles P/roles.json --dry      (mira cuántos cambia)
    node SK/scripts/split-roles.mjs split.json --spec P/ID/parts.json --lottie P/ID/ID.json --roles P/roles.json
  Hay que repetirlo en cada exportación nueva de Creator. Solo cambia el relleno; el contorno sigue siendo tinta.
- Prepara 3 candidatos de piel/pelo y renderízalos en 3 personajes (render.mjs --map). Por cada uno, mide contraste de los rasgos sobre la piel (mínimo 3:1) en claro y en oscuro. Descarta con motivo los que se funden con la tinta o se ven de caricatura.
Entrega: tabla de candidatos con los contrastes, el elegido, y los límites aceptados (el pelo sin contorno en oscuro, un solo tono de piel…).
```

## E8. Galería de aprobación
```
Arma la galería para aprobar. Manifiesto en W/manifiesto.json (formato en el encabezado de SK/plantillas/build-galeria.mjs): assets con json y png original, roles, paletas (A, B y oscuro; "--paper" para el fondo), y en `notes` la tabla de contraste y los límites aceptados. Si hay fondos y personajes, `compose` (ids de assets) y, si ya hay capturas de pantallas reales, `shots`. Encoge los PNG originales (webp chico): un Artifact pesa como máximo 16 MB.
  node SK/plantillas/build-galeria.mjs W/manifiesto.json --out W/galeria-final.html --player "$LOTTIE_LIGHT"
Ábrela una vez con Chrome (headless, un solo Chrome) y confirma que monta todas las tarjetas sin errores. Prueba el selector de paleta y el interruptor de movimiento reducido.
Publícala como página PRIVADA (en Claude Code, un Artifact privado). NO la compartas fuera del equipo: incrusta arte derivado del pack y la licencia de derivados no está confirmada.
Redacta el mensaje de aprobación con la plantilla de la sección 7 de referencias/09-galeria-y-aprobacion.md: autocontenido, sin jerga, con la decisión al final ("1A / 1B"). Avisa que lo primero que se ve en el editor es el cuerpo de prueba si publicas capturas.
Entrega: ruta del HTML, enlace (si lo hay) y el borrador del mensaje. No lo envíes: la persona responsable lo revisa primero.
```

## E9. Reparto, objetos, fondos y escenas (después de aprobado el piloto)
Un agente por activo, en paralelo, cada uno en su carpeta `P/ID/`. Todos terminan con E4 (director de arte) y E6 (gate).
```
REPARTO (ID = personaje nuevo). Misma lista de piezas, mismos pivotes y mismos segmentos que el piloto ya aprobado (copia joints, segments y z-order del parts.json del piloto): su animación lo mueve sin cambios. Cambian solo los dibujos (otros donantes, pelo, ropa, gafas…). Silueta, pelo y ropa deben distinguirse de un vistazo del piloto. Conserva las tapas de hombro y rodilla.
Si el piloto se animó en Creator, la animación solo vive en su JSON: usa reskin.
  node SK/scripts/reskin.mjs P/piloto/piloto.json P/ID/skin.json P/ID/ID.json
(skin.json = Lottie cuyas piezas tienen los MISMOS NOMBRES de capa que las del piloto, dibujadas en coordenadas del lienzo y en la misma pose de reposo).
Si el piloto se animó por código (E5a), copia `rig`, `plan` y `segments` de su parts.json al nuevo y exporta con E5a: no hace falta reskin.
Verifica: check-lottie, render de las poses clave con las mismas rotaciones que el piloto, y una imagen del reparto junto al piloto.

OBJETO (ID = sobre, lupa, gráfico, reloj, bombilla…). Un lienzo de 1000 x 1000, objeto centrado en ~60-70 %. Dibujado en código (pieza `svg` propia), contorno 5, profundidad con una placa gris oscura desplazada (+18, +18) en lo grande, lo pequeño plano. Segmentos: `idle` y 1 o 2 acciones, cada uno con repeats 1. Cambios de color con piezas extra que cambian de opacidad; escala solo en el eje propio; el reloj no retrocede. Exporta con E5a.

FONDO (ID = oficina, ciudad, tienda…). Para componer DETRÁS de los personajes: deja una zona calma sin tinta en x 350-650 con los pies del personaje en y ~930. Segmentos: `idle` ambiental (nubes, hojas, vapor: pocos píxeles) y `enter` (la escena se arma; su frame 0 es el lienzo vacío; declara `offPoseStart`). `enter` + `idle` x repeats <= 5 s en total. Contorno 5. Sin texto (el letrero va vacío). Comprueba la zona calma midiendo píxeles de tinta en esa franja, y compón fondo + personaje en una imagen.

ESCENA (ID = correo, mantenimiento, no encontrado, búsqueda, carga). Parte de un SVG del pack: conserva su composición, recolorea con `palette`, separa una pieza fija (todo lo que no se mueve) y unas pocas móviles. Animación ligera: respirar, parpadear, el objeto. Nada que sugiera avance (no barras que se llenan ni contadores). Compara el reposo con el PNG original.
```

## E10. Fachada y runtime en la app
```
Integra la fachada en el proyecto (lee primero SK/referencias/08-web-runtime.md):
- Copia SK/plantillas/Illustration.tsx (o illustration-vanilla.js) a la carpeta de componentes y ajusta las rutas. Es el ÚNICO archivo que importa lottie-web.
- Dependencia: lottie-web en versión exacta (5.13.0), solo el build light. No uses @latest. Si otra sesión integra dependencias, pídele que la agregue.
- Los JSON salen como archivos propios (Vite: import.meta.glob(..., { query: '?url&no-inline' }); si no usas Vite, la carpeta pública). roles.json va aparte y no es una animación.
- Pruebas: aria-hidden; sin IntersectionObserver no se importa nada; loop = pasadas - 1; tope de 5 s; movimiento reducido no reproduce; pausa fuera de pantalla; destroy al desmontar; marker que no existe -> reposo; color leído del CONTENEDOR (envuelve en un div que redefine la variable y comprueba el color que llega a loadAnimation).
- Si usas `name`/`REPEATS` en vez de `src`/`repeats`: una prueba que compare REPEATS con el parts.json de cada asset y exija que cada segmento con sus pasadas quepa en 5 s.
  Excepción: un prop declara `idle` con 1 pasada y la fachada nunca lo pide (el reposo es su frame 0); esa prueba no debe exigir que `idle` figure en la tabla de lo que se reproduce.
- **Activo provisional.** Si el arte aún no está listo, copia un export cualquiera (el del piloto) con el **nombre final** del activo y con los mismos markers que tendrá el real, y monta la fachada con él.
  Cuando llegue el real, se reemplaza el archivo sin tocar el componente. La fachada ya tolera un marker que falta (se queda en el reposo).
- Build: el chunk de entrada no debe contener el player (busca 'bodymovin'); el player va en su propio chunk; mide su tamaño; los JSON salen como archivos.
Entrega: diff por archivo, salida real de pruebas y build, tamaño del chunk del player.
```

## E11. Montaje en pantallas
```
Monta el arte en las pantallas según la TABLA APROBADA (pantalla -> activo -> segmento -> cuándo se mueve). Si no hay tabla aprobada, párate y propón una (no inventes).
- Función pura segmentFor(prev, status): paso nuevo -> 'point'; aviso nuevo -> 'thinking'; fallo -> 'surprised'; primera carga y poll igual -> null. Sin timers ni avance simulado. Con prueba de tabla (parte de `SK/plantillas/segment-for.example.mjs`).
- Objetos acompañantes: propFor(status); su ráfaga solo con un cambio real de paso; fuera del flujo (absolute) para que no mueva el layout.
- onError: la pantalla quita el bloque entero de arte.
- La pantalla de lectura de datos/resultados NO lleva ilustración (datos reales o nada).
- Tamaños: a 390 px de ancho ningún contenedor de arte pasa de 342 px; aside max-w-40 lg:max-w-60 (adapta a tu escala).
Antes de editar una ruta: confirma QUÉ componente monta (hay proyectos con dos páginas de login). Entrega: diff por archivo, salida de pruebas/tipos/gates.
```

## E12. Escena compuesta (varias piezas en un mismo cuadrado)
```
Compón fondo + N personajes en un escenario cuadrado (ver el ejemplo de la sección 10 de 08-web-runtime.md):
- Personajes: escala 0,8 con origen en los pies (~93 % de la altura), desplazados en x; el primero deja sitio al brazo que saluda.
- Revelar con opacidad SOLO cuando las N piezas avisaron onReady; entonces pasar los segmentos a todas a la vez (fondo: enter; los demás: sus acciones). La escena entera se mueve como máximo la ráfaga más larga (<= 5 s) y queda quieta.
- Si una pieza falla, desaparece el escenario entero y el resto de la pantalla no cambia.
- Si la app tiene tema oscuro: el escenario es un subárbol `.light` sobre una tarjeta clara, y la fachada lee getComputedStyle(contenedor). Con prueba.
Entrega: capturas a 1280 y 390 (el escenario solo desde el breakpoint grande), con y sin movimiento reducido, y una a mitad de la ráfaga.
```

## E13. Verificación visual de las pantallas
```
Verifica en navegador real (lee referencias/10-verificacion-visual.md). Un solo navegador a la vez. Servidor de desarrollo en un puerto propio.
puppeteer-core instalado en W/pptr con versión exacta y publicada hace más de dos semanas; mocks de la API con los datos de las pruebas existentes.
Por cada pantalla con arte, a 1280 x 900 y 390 x 844, normal y con prefers-reduced-motion: reduce (y oscuro si hay tema oscuro):
- captura; scrollWidth <= innerWidth; ancho del contenedor de arte <= 342 px a 390;
- en reducido, el svg del arte no cambia durante 1 s; en normal, la ráfaga dura <= 5 s y luego queda quieta;
- Network: solo mismo origen; consola sin errores; el arte no pide nada si no entró a la vista (móvil sin scroll);
- caso de fallo: 404 al JSON de una pieza -> desaparece el bloque entero;
- contraste: texto 4,5:1, bordes de controles 3:1, rasgos sobre piel 3:1 (mide con los fill reales del svg); foco visible.
Recarga la página entera en cada navegación (rutas con # no recargan solas).
Lee las capturas y juzga espaciado (nada pegado), jerarquía (el arte apoya, no compite) y estados vacío/carga/error.
Entrega: rutas de PNG, números medidos, salida de consola/Network, y lo que no pudiste comprobar.
```

## E14. Verificador adversarial (úsalo después de cada etapa de construcción)
```
Eres un VERIFICADOR adversarial. No arregles nada. Tu lente: <ELIGE UNA>
 - ESPECIFICACIÓN + GATES: relee la decisión y los criterios de aceptación; CORRE los gates tú mismo (no te fíes del reporte); revisa git status: solo cambiaron los archivos permitidos; sin colores hex fuera de los tokens; el chunk de entrada no tiene el player.
 - UX + ACCESIBILIDAD + RENDIMIENTO: intenta REFUTAR la calidad. Lee las capturas del reporte. Revisa: decorativo y aria-hidden, sin texto en la animación, movimiento reducido sin reproducir, ráfagas <= 5 s y sin loops, nada que parpadee, pausa fuera de pantalla, destroy al desmontar, carrera de carga, recolor correcto, reacciones solo a cambios reales, layout a 390 px sin desborde, jerarquía y espaciado, tamaños de los chunks. La sobreingeniería cuenta como problema.
Responde JSON: { "pass": bool, "issues": [{ "severity": "blocker|major|minor", "file": "", "problem": "", "fix": "" }], "evidence": "" }

REPORTE DEL CONSTRUCTOR (afirmaciones sin verificar):
<pega aquí>
```

## E15. Arreglo
```
Aplica los arreglos de la lista que CONFIRMES que son reales (revisa cada uno; refuta con evidencia los que no). Diffs mínimos. Después vuelve a correr los gates y la verificación visual de lo que cambiaste, y pega la salida real.
PROBLEMAS: <JSON de los verificadores>
REPORTE DEL CONSTRUCTOR: <pega aquí>
```
