# animate-illustrations-with-lottie

Una skill para agentes de código que convierte un pack de ilustraciones con licencia (un zip de SVG y PNG) en animaciones Lottie
listas para la web. Corta el arte en piezas, arma un rig, anima personajes, objetos, fondos y escenas, pasa cada Lottie por un gate
de calidad, arma una galería para que una persona apruebe el piloto y lo monta en la web con `lottie-web` (build light): carga
diferida, modo oscuro y movimiento reducido. Sirve con Claude Code, Codex, OpenCode, Kimi, Gemini CLI, Antigravity y cualquier agente
que lea Agent Skills. No necesita paquetes de npm ni de pip: solo Node 20 o más nuevo, y Python 3 para el instalador.

> **English.** An Agent Skill that turns a licensed SVG/PNG illustration pack into animated Lottie files for the web: it cuts the art into
> parts, builds a rig, animates characters, props, backgrounds and scenes, validates every file with a quality gate, builds a one-file
> approval gallery for a human to sign off a pilot, and ships it with `lottie-web` (light build). The default route is plain code
> (`parts.json` to Lottie, reproducible byte for byte); a LottieFiles Creator route is optional. Docs are in Spanish; install with `python3 instalar.py`.

## Contenido de esta página
1. [Qué hace y qué produce](#qué-hace-y-qué-produce)
2. [Requisitos](#requisitos)
3. [Instalación](#instalación)
4. [Uso](#uso)
5. [El método completo, por etapas](#el-método-completo-por-etapas)
6. [Referencia rápida de scripts](#referencia-rápida-de-scripts)
7. [Reglas que no se negocian](#reglas-que-no-se-negocian)
8. [Comprobar la skill](#comprobar-la-skill)
9. [Estructura del repo](#estructura-del-repo)
10. [Caso real y lecciones](#caso-real-y-lecciones)
11. [Privacidad y licencia del arte](#privacidad-y-licencia-del-arte)

`SKILL.md` es el archivo para el agente (qué ruta tomar, el flujo, las reglas). Esta página es para ti: qué hay, cómo se instala y cómo
se usa. El método completo, con el porqué de cada regla, está en [`referencias/`](referencias/).

---

## Qué hace y qué produce

```
zip del pack ──> piezas ──> rig ──> animación ──> Lottie ──> gate ──> galería (OK humano) ──> web
 (licencia)     (parts.json)        (plan)       (export)   (check)                          (lottie-web light)
```

| Archivo | Qué es |
|---|---|
| `roles.json` | La paleta de autoría: el color con que se dibuja, atado a un token CSS `--illus-*`. Cambiar la marca es cambiar un token; no se re-exporta nada. |
| `parts.json` (uno por ilustración) | La fuente de verdad: piezas, pivotes, rig, segmentos y plan de animación. |
| `parts/<pieza>.svg` | Una pieza por SVG, normalizada al lienzo de 1000 × 1000 (las escribe `build-parts.mjs`). |
| `<nombre>.json` | El Lottie: 30 fps, 1000 × 1000, un marker por animación y `meta.repeats`. Pasa el gate. |
| `galeria-final.html` | La galería de aprobación: un solo HTML con las animaciones, los originales al lado y las paletas. |
| `Illustration.tsx` o `illustration-vanilla.js` | La fachada de runtime que copias al proyecto web (el único archivo que importa `lottie-web`). |

### Ejemplo de resultado (los fixtures de este repo)
Con el personaje sintético `fixtures/persona` (dibujo original del repo, sin arte de terceros). Copia `fixtures/` a otra carpeta de trabajo
(`cp -r fixtures ~/prueba-lottie`, por ejemplo) y corre desde ahí, para no ensuciar el repo.
`SK` = la carpeta de la skill (el clon, o `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos se corren desde la carpeta de trabajo, no desde el clon:

```
node SK/scripts/build-parts.mjs persona/parts.json --roles roles.json
node SK/scripts/export-lottie.mjs persona/parts.json --roles roles.json --name persona
```
```
ok 25 parts → persona/parts
ok persona: 42 layers, 198 frames, idle 0+60, wave 61+75, happy 137+60, 38.1 KB → persona/persona.json
```
(Salida real; las rutas absolutas están acortadas.)
```
persona/
├── parts.json       25 piezas, 17 nodos de rig, 3 segmentos
├── parts/           25 SVG, uno por pieza
└── persona.json     42 capas, 198 frames, 38,1 KB
```

| Marker | Inicio (`tm`) | Duración (`dr`) | Pasadas | Total |
|---|---|---|---|---|
| `idle` | 0 | 60 frames | 2 | 4 s |
| `wave` | 61 | 75 frames | 1 | 2,5 s |
| `happy` | 137 | 60 frames | 1 | 2 s |

- Cada marker guarda **un** ciclo; el player lo repite. Las pasadas viajan en `meta.repeats` (`{"idle":2,"wave":1,"happy":1}`).
- Hay un frame de hueco entre markers (`61` = `0 + 60 + 1`).
- El reloj de los fixtures: 13 capas, 95 frames, 15,0 KB, con `idle` y `ring`.
- Referencias del caso real: un personaje de 28 piezas y 7 segmentos pesó 157 KB (417 frames); objetos 11 a 22 KB; un fondo 46 KB.
  El tope del gate es 450 frames y 200 KB.

### Lo que no hace
- No trae arte: los fixtures son dibujo sintético propio. El pack lo pones tú, con tu licencia.
- No vectoriza PNG. Lo que falta en un pack se dibuja en código.
- No usa gradientes, sombras, efectos, máscaras, mattes, expresiones, slots, sólidos, imágenes ni texto: el gate los rechaza.
- No decide la licencia ni aprueba el estilo: eso lo hace una persona (ver [Uso](#uso)).
- No te dice "se ve bien" sin haberlo visto con el player real. Sin Chrome ni player, exporta y valida, y dice qué no pudo mirar.

---

## Requisitos

| Requisito | ¿Obligatorio? | Para qué | Cómo se indica |
|---|---|---|---|
| Node 20 o más nuevo | Sí | Todos los scripts (solo biblioteca estándar; se usó Node 24) | `node --version` |
| Python 3 | Solo para instalar | `instalar.py` (solo biblioteca estándar) | `python3 --version` |
| git | Para clonar y actualizar | `git clone`, `git pull` | |
| Chrome o Chromium | Opcional | `render.mjs`, `index-svg.mjs --png`, abrir la galería | PATH, o `CHROME=<ruta>` |
| `lottie-web@5.13.0`, build light | Opcional | `render.mjs`, la galería sin red, las pruebas con player real | `npm i lottie-web@5.13.0 --save-exact` en tu proyecto, o `LOTTIE_LIGHT=<ruta a lottie_light.min.js>` |
| Cuenta de LottieFiles Creator, su MCP `lottiefiles-creator` y, si quieres que el agente haga los clics del export, una extensión de navegador para agentes | Opcional | Solo la ruta Creator | [`referencias/05-ruta-creator.md`](referencias/05-ruta-creator.md) |
| `puppeteer-core@25.12.0` | Opcional | Revisar la app real a 1280 y 390 px | [`referencias/10-verificacion-visual.md`](referencias/10-verificacion-visual.md) |

- `lottie-web` **no viene en este repo**.
- Sin Chrome ni player todo funciona menos `render.mjs`, la captura de `index-svg.mjs --png` y abrir la galería.
- `python3 instalar.py --revisar` te dice qué falta en tu máquina.

---

## Instalación

```sh
git clone https://github.com/g14wx/illustration-2-lottie-animation.git
cd illustration-2-lottie-animation
python3 instalar.py --revisar      # qué agentes hay y qué dependencias faltan (no instala nada)
python3 instalar.py                # instala en todos los agentes que encuentre
```

El instalador enlaza (o copia) esta carpeta con el nombre `animate-illustrations-with-lottie` dentro de la carpeta de skills de cada agente.
**El nombre de la carpeta clonada da igual**: el enlace lleva el nombre de la skill, no el del clon (comprobado con un clon llamado
`illustration-2-lottie-animation`).

### Opciones de `instalar.py`

| Opción | Qué hace |
|---|---|
| (sin opciones) | Instala en los agentes que encuentre, es decir, cuya carpeta personal existe (tabla de abajo). No instala en `agents`. |
| `--revisar` | Solo dice qué agentes hay y qué falta. No instala. Sale 1 si falta Node 20. |
| `--solo claude,codex` | Instala solo en esos agentes (nombres de la tabla, separados por coma). |
| `--todos` | Instala en todos los destinos de la tabla, aunque el agente no esté instalado. Incluye `agents`. |
| `--copiar` | Copia la carpeta (sin `.git`, `node_modules` ni `__pycache__`) en vez de enlazarla. |
| `--quitar` | Desinstala. Solo borra enlaces o copias de esta skill; una carpeta ajena con el mismo nombre no se toca. |
| `--home DIR` | Usa `DIR` como carpeta personal, para probar sin tocar tus agentes. |
| `-h`, `--help` | Muestra el uso. |

### Agente, carpeta de skills

| Agente | Se detecta si existe | Carpeta de skills |
|---|---|---|
| `claude` | `~/.claude` | `~/.claude/skills/` |
| `codex` | `~/.codex` | `~/.codex/skills/` |
| `opencode` | `~/.config/opencode` | `~/.config/opencode/skills/` |
| `kimi` | `~/.kimi` | `~/.kimi/skills/` |
| `gemini` | `~/.gemini` | `~/.gemini/skills/` |
| `antigravity` | `~/.gemini` | `~/.gemini/config/skills/` |
| `agents` | `~/.agents` | `~/.agents/skills/` (carpeta estándar de Agent Skills) |

- `gemini` y `antigravity` se detectan por la misma carpeta `~/.gemini`: si existe, se instala en las dos.
- `agents` solo se instala con `--solo agents` o `--todos`: Gemini también lee `~/.agents/skills` y vería la skill dos veces. `--quitar` sí la revisa.
- Si en un destino ya hay algo con ese nombre que no es esta skill, el instalador lo **salta** y lo dice (`SALTADO`).
- Si clonas dentro de una carpeta de skills, usa `git clone <url> animate-illustrations-with-lottie`. Así el instalador dice `YA ESTÁ INSTALADO AQUÍ` y no toca
  ni borra esa carpeta. Con el nombre por defecto (`illustration-2-lottie-animation`) quedan **dos entradas** en esa carpeta (el clon y el enlace) y el agente ve dos copias de la skill:
  borra el clon o vuelve a clonar con el nombre de la skill. `--quitar` solo borra el enlace.

### Linux y macOS, Windows, actualizaciones
- En Linux y macOS queda **enlazado**: un `git pull` en el clon actualiza todos los agentes a la vez.
- En Windows el instalador **copia** (no enlaza). Después de un `git pull`, vuelve a correr `python3 instalar.py`.
- Con `--copiar` pasa lo mismo que en Windows, también en Linux y macOS.

```sh
cd illustration-2-lottie-animation
git pull
python3 instalar.py        # solo hace falta si instalaste con copia (Windows o --copiar)
```

### Otro agente que lea Agent Skills
Copia o enlaza **esta carpeta entera**, con el nombre `animate-illustrations-with-lottie` y con `SKILL.md` en su raíz, dentro de la carpeta de skills de ese agente:

```sh
mkdir -p <carpeta-de-skills-del-agente>
ln -s "$(pwd)" <carpeta-de-skills-del-agente>/animate-illustrations-with-lottie        # enlace
# o, para una copia:  cp -r "$(pwd)" <carpeta-de-skills-del-agente>/animate-illustrations-with-lottie
```

### Agente sin soporte de skills
Hay dos formas. En las dos, `SK` es la carpeta donde clonaste esta skill.
1. Dile en el chat: «Lee `SK/SKILL.md` y sigue sus instrucciones. Abre `SK/referencias/` solo en la etapa que lo pida.»
2. Pon una línea en el archivo de instrucciones del proyecto que lea tu agente (por ejemplo `AGENTS.md`):
   ```
   Para animar ilustraciones con Lottie, lee y sigue <ruta>/animate-illustrations-with-lottie/SKILL.md.
   Los comandos usan SK = esa carpeta. Los prompts por etapa están en SK/referencias/prompts.md.
   ```

### Comprobar que quedó bien
```sh
node scripts/autoprueba.mjs        # desde la carpeta del clon: pruebas y cadena completa sobre los fixtures
```

---

## Uso

La skill se activa cuando le pides al agente algo de este tipo (el agente la reconoce por su descripción):

- «Tengo este zip de ilustraciones planas. Anímalo: un personaje que camine, salude y cambie de expresión, y cinco objetos.»
- «Arma el rig de este SVG y exporta un Lottie que pase el gate.»
- «Hazme una galería para que mi jefe apruebe el piloto antes de seguir.»
- «Monta estas animaciones Lottie en la pantalla de inicio, con carga diferida y que respeten el movimiento reducido.»
- «El arte sale en negativo en modo oscuro. Arréglalo.»
- "Animate the illustrations from this pack with Lottie. Start with one pilot character and a gallery I can approve."
- "Cut this SVG into parts, build a rig and export a Lottie that passes the gate. Use code export, not the LottieFiles Creator."
- "Put these Lottie files on the landing page with lazy loading and prefers-reduced-motion support."

El agente hace un **piloto** (un personaje con sus segmentos) y pide tu OK antes de repetir el trabajo con el resto del reparto,
los objetos, los fondos y las escenas. En Claude Code, los activos independientes pueden correr en paralelo con subagentes; en los demás
agentes se hace una etapa a la vez con los prompts de [`referencias/prompts.md`](referencias/prompts.md).

### Qué te va a preguntar el agente
Si no respondes, no sigue escalando «por si acaso». Puede avanzar solo en lo que no depende de tu decisión (herramientas, runtime).

| Cuándo | Qué decides tú |
|---|---|
| Antes de derivar nada | **Licencia**: si cubre modificar, crear derivados, animar y distribuir en un producto web (las preguntas para el proveedor están en [`01`](referencias/01-recepcion-del-pack.md)) |
| Paleta | **Piel y pelo**: tres pares candidatos renderizados, con la tabla de contraste; los límites que aceptas, por escrito |
| Piloto listo | **Estilo y movimiento** aprobados en la galería, antes de hacer el reparto («1A aprobado / 1B quiero cambios») |
| Antes de montar | La **tabla** pantalla, arte, segmento, cuándo se mueve (sin tabla aprobada, propone una; no inventa). Un icono neutro se puede sustituir por la ilustración; el icono de **estado** (error, éxito) se queda junto al arte, con texto y color |
| Si tus reglas de diseño prohíben animación, dependencias nuevas o héroes | Una **excepción escrita y acotada** (dónde sí, dónde no, límites) y la enmienda del documento de diseño |
| Ruta Creator | Los clics del export (si no hay extensión de navegador) |
| Antes de fusionar | **Aprobación final** del conjunto y confirmación de la licencia |

---

## El método completo, por etapas

`SK` = la carpeta de la skill (por ejemplo `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos se corren **desde la carpeta
del arte de tu proyecto**, con `node SK/scripts/...`. Una etapa a la vez.

| Etapa | Qué pasa | Detalle | Prompts |
|---|---|---|---|
| [1](#etapa-1-recepción-del-pack-y-licencia) | Recepción del pack y licencia | [`01`](referencias/01-recepcion-del-pack.md) | E0, E1, E2 |
| [2](#etapa-2-piezas-y-paleta-de-autoría-roles) | Piezas y paleta de autoría (roles) | [`02`](referencias/02-piezas-y-paleta.md) | E3, E7 |
| [3](#etapa-3-rig) | Rig | [`03`](referencias/03-rig.md) | E3, E4 |
| [4](#etapa-4-animación) | Animación | [`04`](referencias/04-animacion.md) | E5a, E5b |
| [5a](#etapa-5a-ruta-por-código-por-defecto) | Ruta por código (por defecto) | [`06`](referencias/06-ruta-codigo.md) | E5a, E9 |
| [5b](#etapa-5b-ruta-lottiefiles-creator) | Ruta LottieFiles Creator | [`05`](referencias/05-ruta-creator.md) | E5b |
| [6](#etapa-6-gate) | Gate | [`07`](referencias/07-gate.md) | E6 |
| [7](#etapa-7-galería-y-aprobación) | Galería y aprobación (y escalar) | [`09`](referencias/09-galeria-y-aprobacion.md) | E8, E9 |
| [8](#etapa-8-web-runtime) | Web runtime | [`08`](referencias/08-web-runtime.md) | E10, E11, E12 |
| [9](#etapa-9-verificación-visual) | Verificación visual | [`10`](referencias/10-verificacion-visual.md) | E13 |

Después de cada etapa de construcción, el prompt E14 (verificador adversarial) busca romper lo hecho y E15 (arreglo) confirma cada problema antes de tocar nada.
Si el arte no sale de un pack (todo se dibuja en código), salta las etapas 1 y 2 en lo que toca al pack (licencia, inventario, donantes); `roles.json` y el rig (etapa 3) siguen aplicando.

### Etapa 1. Recepción del pack y licencia
Deja la licencia aclarada, el pack inventariado y los donantes elegidos con sus índices. No escribe código.

- Antes de derivar nada, pregunta **por escrito** al proveedor si la licencia cubre modificar, crear derivados, animar y distribuir en un producto web.
  El nombre del archivo del zip no prueba nada.
- Sin respuesta: rama privada, derivados solo en repos privados, y la galería no sale del equipo.
- Extrae el zip **fuera del repo**. Inventario por nombre de archivo; mira los PNG como hoja de contactos.
- Elige donantes: pose neutra, de frente o 3/4. De ellos solo lo que no cruza una articulación (cabeza, pelo, cara).
- Cada relleno va seguido de su aro de contorno: los índices van en pareja (`[18, 19]`).
- Nunca se commitea el zip, los SVG o PNG del pack ni sus rutas.

```sh
node SK/scripts/index-svg.mjs donante.svg --png indices.png      # el número de cada elemento sobre el dibujo
node SK/scripts/build-parts.mjs --list donante.svg               # índice, tag, relleno y bbox (en `path`, el largo de `d`)
node SK/scripts/build-parts.mjs --colors donante.svg             # colores distintos y cuántos elementos usa cada uno
```
Detalle: [`referencias/01-recepcion-del-pack.md`](referencias/01-recepcion-del-pack.md).

### Etapa 2. Piezas y paleta de autoría (roles)
Del donante a piezas limpias, con un color por función para que cambiar la marca no obligue a re-exportar.

- `roles.json`: 6 a 8 roles; las claves son colores de autoría `#rrggbb` en minúscula y los valores, tokens `--illus-*`.
  **Las claves no se reescriben nunca**: si la marca cambia, cambia el valor del token.
- **Piel y pelo con rol propio desde el primer `parts.json`** (`palette` por pieza). Solo el relleno; el contorno sigue siendo tinta.
- `palette` mapea cada color del donante a un color de autoría. `build-parts` falla en voz alta ante un color sin regla;
  `--nearest` solo sirve para descubrir (lee la lista de `snapped` y escribe las reglas a mano).
- Una pieza de donante que no encaja con el rig lleva `transform` (`{ scale, rotate, mirror, dx, dy, about }`); `build-parts` lo hornea con `scripts/pathkit.mjs`.
- Para empezar, copia `plantillas/roles.ejemplo.json` y `plantillas/parts.ejemplo.json`. El formato está en [`plantillas/parts.schema.md`](plantillas/parts.schema.md).

```sh
node SK/scripts/build-parts.mjs parts.json --roles roles.json             # escribe parts/<pieza>.svg
node SK/scripts/build-parts.mjs parts.json --roles roles.json --nearest   # solo para descubrir colores casi iguales
# si el arte ya compartía piel o pelo con otras piezas:
node SK/scripts/split-roles.mjs split.json --spec parts.json --parts-dir parts --lottie a.json,b.json --roles roles.json --dry
```
Detalle: [`referencias/02-piezas-y-paleta.md`](referencias/02-piezas-y-paleta.md).

### Etapa 3. Rig
Pivotes, árbol, orden de capas y extremidades que no se cortan al girar.

- Un solo `parts.json` describe todo: `joints` (pivotes), `rig` (nodo, `parent`), `parts` (de **abajo hacia arriba**: el z-order), `limits`, `segments` y `plan`.
  Lienzo 1000 × 1000; ángulos en grados, positivo = horario.
- **Brazos y piernas no se recortan del donante**: se dibujan como cápsulas con articulaciones redondas ([`ejemplos/extremidades.mjs`](ejemplos/extremidades.mjs)).
  Los dos segmentos miden lo mismo en el pivote, el hijo no dibuja su borde superior y una tapa cubre la unión.
- Contorno: **4 unidades en personajes, 5 en props** (~1 px a la talla de pantalla). El gate no lo mide; el generador sí (`checkInkStroke` de `scripts/lib.mjs`).
- Pose neutra: ocupa ~85 % del alto, pies hacia y ≈ 930, centrada en x ≈ 500, con una ligera asimetría horneada en el arte.
- Una cara no se deforma: tres bocas (neutra, sonrisa, «o») que se alternan por opacidad.
- Un elenco comparte rig y plan: los personajes nuevos son un `parts.json` copiado con otras piezas (mismos nombres), o `reskin.mjs`.

```sh
node SK/ejemplos/extremidades.mjs brazo                                                    # escribe brazo/parts.json (un brazo que se dobla)
node SK/scripts/export-lottie.mjs brazo/parts.json --roles SK/plantillas/roles.ejemplo.json --name brazo
node SK/scripts/render.mjs brazo/brazo.json --segment bend --at 0,20,40 --size 300         # necesita Chrome y player
```
Detalle: [`referencias/03-rig.md`](referencias/03-rig.md).

### Etapa 4. Animación
`segments` y `plan` viven en el mismo `parts.json`, con valores **relativos al reposo**.

- Cada animación es un marker (un ciclo); las pasadas van en `segments[x].repeats`. 30 fps.
- La pose de reposo es el frame 0 de `idle`. Todo segmento empieza y termina ahí y deja 3 o 4 frames quietos al final. Un frame de hueco entre markers.
- Lo que arranca solo dura **5 s o menos contando sus pasadas** y luego queda quieto. Nada parpadea más de 3 veces por segundo. Sin loops continuos.
- Ningún color se anima. Solo transform y opacidad; la escala va en el eje propio. Al hacer desaparecer una pieza la escala baja a 0,12 y se desvanece, nunca a 0 (el parpadeo de ojos llega a 0,1).
- Menos de un tercio del rig se mueve a la vez; easing `io` en los loops; anticipación y continuación. El arte **no inventa progreso**.
- Catálogo: personaje `idle`, `walk`, `wave`, `point`, `happy`, `surprised`, `thinking`; props `idle` más una acción; fondos `idle` más `enter`.

```json
"segments": { "idle": { "autoplay": true, "repeats": 2 }, "wave": {} },
"plan": { "keys": { "idle": { "dr": 60, "keys": { "chestGrp": { "sy": [[0, 1, "io"], [30, 1.02, "io"], [60, 1]] } } } } }
```
```sh
node SK/scripts/render.mjs persona/persona.json --segment wave --at 0,18,36,60 --size 300 --out wave.png
```
Detalle: [`referencias/04-animacion.md`](referencias/04-animacion.md).

### Etapa 5a. Ruta por código (por defecto)
`parts.json` a Lottie plano, sin abrir ningún editor. Es obligatoria para props, fondos, escenas y reparto.

- Sin cuenta, sin pestaña, reproducible byte a byte, revisable en git y en paralelo.
- El Lottie es una composición plana: cada nodo del rig es una capa null con `parent`, cada pieza una capa de forma, sin precomps. El z-order es el de `parts`.
- **`build-parts` va siempre antes de exportar** (salvo piezas con `svg` propio, como los props y las extremidades de `ejemplos/`), y si falla no exportes:
  `export-lottie` lee `parts/<pieza>.svg` de cada pieza sin `svg` propio, y un `parts/` viejo se usaría en silencio.
- Si falla el lint del plan, no escribe nada. Si falla la verificación posterior (z-order, reposo, gate), el archivo **sí** se escribe para poder mirarlo, y sale 1.
  Renderiza solo si el último export imprimió `ok`.
- Si algo falla, corrige `parts.json`, nunca el JSON exportado.
- Un prop nuevo se hace copiando [`ejemplos/bombilla.mjs`](ejemplos/bombilla.mjs) (cambia su `import` a la ruta real de `SK/scripts/lib.mjs`).

```sh
node SK/scripts/build-parts.mjs persona/parts.json --roles roles.json && \
node SK/scripts/export-lottie.mjs persona/parts.json --roles roles.json --name persona       # lint + export + z-order + reposo + gate
node SK/scripts/render.mjs persona/persona.json --segment wave --at 0,18,36,60 --size 300 --out wave.png

# un prop nuevo, de punta a punta
mkdir mi-prop && cp SK/plantillas/roles.ejemplo.json mi-prop/roles.json
node mi-prop.mjs mi-prop                                                                     # tu copia de bombilla.mjs: escribe mi-prop/parts.json
node SK/scripts/export-lottie.mjs mi-prop/parts.json --name mi-prop
node SK/scripts/render.mjs mi-prop/mi-prop.json --segment idea --at 0,6,12,22,34,46,60 --size 240 --out mi-prop/idea.png
```
Detalle: [`referencias/06-ruta-codigo.md`](referencias/06-ruta-codigo.md).

### Etapa 5b. Ruta LottieFiles Creator
Solo si una persona quiere poner o retocar keyframes a mano, o ver el personaje piloto en el editor. Lee la referencia entera antes: lo difícil está en las trampas.

- Inicia sesión primero: en modo invitado Creator **no exporta** y el trabajo se pierde al cerrar la pestaña.
- **Una sola pestaña = un solo agente**, en secuencia. En Creator, activa Settings, MCP Settings, Enable Local MCP.
- Jerarquía solo con `group_layers` (nunca `create_scene_layer`: exporta 500 × 500). Anclas en coordenadas del lienzo. La verdad está en `read_keyframes`, no en `read_scene`.
- El MCP no exporta: son clics (Export, Save as new, solo tu escena, Lottie JSON, Download) de una persona o de una extensión de navegador. No inyectes JavaScript en la página.
- Lo primero que se ve en el editor es un **cuerpo de prueba** del rig, no el arte final: avísalo siempre.
- Creator no escribe `meta.repeats`: pásalo a la fachada como prop `repeats` o agrégalo al JSON.

```sh
node SK/scripts/check-lottie.mjs art/personaje-a.json --roles roles.json --parts art/personaje-a/parts.json
node SK/scripts/render.mjs art/personaje-a.json --segment wave --at 0,18,36,60 --size 300 --out wave.png
node SK/scripts/reskin.mjs base.json skin.json out.json         # personajes nuevos con la animación de un Lottie hecho en Creator
```
Detalle: [`referencias/05-ruta-creator.md`](referencias/05-ruta-creator.md).

### Etapa 6. Gate
Un Lottie no se entrega si el gate no pasa.

- `check-lottie.mjs` revisa: 30 fps, lienzo 1000 × 1000, hasta 450 frames y 200 KB; todo color dentro de `roles.json` y ninguno animado;
  sin gradientes, expresiones, efectos, máscaras, mattes, slots, remapeo de tiempo, texto, imagen, sólido, audio ni 3D; precomps de 1000 × 1000;
  markers enteros, sin repetir ni solaparse; y lo que arranca solo, de 5 s o menos (`enter` más `idle` juntos).
- **Pásalo siempre con `--parts`**: es lo que activa la revisión de markers y de duración.
- `export-lottie` lo corre solo. Córrelo tú después de un export de Creator, de `reskin`, de `split-roles` y en CI.
- Sale 0 con `ok …`; con fallos imprime `FAIL <archivo>: <mensaje>` y sale 1; sin argumentos sale 2.
- Un gate que no se puede probar que falla no es un gate: [`fixtures/check/`](fixtures/check/) trae 13 `bad-*.json`, uno por regla importante, y `autoprueba` exige que salgan 1.
- El gate **no** mira el grosor del contorno, la zona calma, el contraste ni el «nada parece progreso»: cada uno tiene otro dueño (tabla en `07`).

```sh
node SK/scripts/check-lottie.mjs persona/persona.json --roles roles.json --parts persona/parts.json
# ok persona/persona.json (42 layers, 3 markers, 38.1 KB)
```
Detalle y cómo agregar una regla: [`referencias/07-gate.md`](referencias/07-gate.md).

### Etapa 7. Galería y aprobación
Nadie escala un estilo sin que una persona lo vea moverse.

- **Piloto primero**: un personaje con sus segmentos, nada más. Arma la galería y pide el OK antes de hacer el resto.
- La galería es un solo HTML: botón `▶` por segmento, tabla de frames y segundos (en rojo lo que pasa de 5 s), **Movimiento reducido**, **Zoom 3x**,
  el PNG original al lado, selector de paletas (A/B, oscuro), composición de fondo y personaje, capturas de pantallas reales y notas.
- Toda paleta nueva se aprueba **con números** (rasgos sobre piel 3:1, texto cercano 4,5:1, bordes de controles 3:1), con tres pares candidatos y los límites aceptados por escrito.
- La galería incrusta arte derivado: es **privada** hasta tener la licencia confirmada. Una versión por avance, en la misma URL. No la guardes en el repo del proyecto.
- Después del OK, escala: reparto sobre el rig aprobado (`reskin.mjs` o copia de `parts.json`), props, fondos y escenas. Piel y pelo: `split-roles.mjs`. Otra paleta: `recolor.mjs`.
- `LOTTIE_LIGHT` tiene que estar definida al armar la galería; si queda vacía, la galería carga `lottie-web` 5.12.2 desde cdnjs y necesita red.
- El mensaje base para pedir la aprobación («1A / 1B», sin jerga, autocontenido) está en `09` §7.

```sh
node SK/plantillas/build-galeria.mjs manifiesto.json --out galeria-final.html --player "$LOTTIE_LIGHT"
node SK/scripts/recolor.mjs anim.json --vars paleta.json --roles roles.json --out anim-b.json      # otra paleta sin re-exportar
node SK/scripts/render.mjs fondo.json --frame <inicio de idle> --size 1000 --out fondo.png            # el PNG para zona-calma: de 1000 px; con otro tamaño falla
node SK/scripts/zona-calma.mjs fondo.png --max 0.05                                                  # tinta en la zona calma de un fondo
```
```json
{ "title": "Piloto: personaje A", "intro": "Texto plano que ve quien aprueba.", "roles": "roles.json",
  "palettes": { "A": { "--illus-skin": "#f0c8a0", "--illus-hair": "#5a3d2b" } },
  "assets": [ { "id": "persona", "label": "Persona", "use": "Saluda en el formulario", "json": "persona/persona.json", "png": "originales/persona.png" },
              { "id": "oficina", "label": "Oficina", "use": "Fondo del formulario", "json": "oficina/oficina.json" } ],
  "compose": { "bgs": ["oficina"], "cast": ["persona"] }, "shots": [], "notes": [] }
```
Las rutas son relativas al manifiesto. `png` (el original del pack, para comparar), `compose`, `shots` (capturas de pantallas reales) y `notes` (contraste, límites aceptados) son opcionales.
Detalle: [`referencias/09-galeria-y-aprobacion.md`](referencias/09-galeria-y-aprobacion.md).

### Etapa 8. Web runtime
Llevar los Lottie validados a una pantalla real.

- Player fijado: `lottie-web@5.13.0`, build light (46,4 KB gzip), renderer SVG. Versiones exactas, nunca `@latest`.
- Copia [`plantillas/Illustration.tsx`](plantillas/Illustration.tsx) (React 19) o [`plantillas/illustration-vanilla.js`](plantillas/illustration-vanilla.js) (sin framework).
  Es el **único** archivo que importa `lottie-web`: cambiar de player es editar un archivo.
- Carga diferida con `IntersectionObserver`; sin él (SSR, jsdom) no se importa `lottie-web`. El JSON sale como archivo propio y el chunk de entrada no lleva el player.
- `loop = pasadas - 1`; antes de `goToAndStop` va `resetSegments(true)`; con movimiento reducido solo se ve el frame de reposo.
- **Recolor desde el contenedor** (`getComputedStyle(contenedor)`), nunca desde `<html>`: si no, el arte sale en negativo en modo oscuro.
- Decorativo: `aria-hidden="true"`, cuadrado, sin texto. `onError` quita el bloque entero de arte. A 390 px el arte mide 342 px o menos y no hay scroll horizontal.
- La pantalla reacciona solo a cambios reales (`segmentFor` en [`plantillas/segment-for.example.mjs`](plantillas/segment-for.example.mjs)); nunca un `walk` en loop mientras «carga».

```sh
npm i lottie-web@5.13.0 --save-exact
cp SK/plantillas/Illustration.tsx src/components/Illustration.tsx      # o illustration-vanilla.js
```
```tsx
<Illustration src={personaUrl} roles={roles} segment={segment} onDone={() => setSegment(undefined)} className="max-w-60" />
```
```js
const ill = mountIllustration(el, { src: '/lottie/persona.json', roles, segment: 'wave' });   // sin framework
ill.play('happy');   ill.destroy();
```

| Prop | Qué hace |
|---|---|
| `src`, `roles` | URL del JSON; `roles.json` (color de autoría a token CSS) |
| `segment` | Pide **una** ráfaga (nombre de un marker). `undefined` = nada |
| `repeats` | Pasadas por segmento; pisa a `meta.repeats` |
| `onReady`, `onDone`, `onError` | Listo y quieto; ráfaga terminada o no reproducible; algo no cargó (oculta el contenedor) |
| `className` | Tamaño y posición |

Detalle (JSON como archivo propio con Vite, escena compuesta, modo oscuro, `segmentFor`): [`referencias/08-web-runtime.md`](referencias/08-web-runtime.md).

### Etapa 9. Verificación visual
«Hecho» es haberlo visto en un navegador real, a dos anchos, con movimiento reducido y en oscuro si la app lo tiene. Un test en verde no basta.

- 1280 y 390 px, normal y con `prefers-reduced-motion: reduce` (el SVG no cambia durante 1 s), y en oscuro si aplica.
- Sin scroll horizontal; arte de 342 px o menos a 390; solo requests al mismo origen; consola sin errores.
- Camino de fallo: si el JSON responde 404 por intercepción, desaparece el bloque entero de arte y la pantalla sigue.
- Contraste con la fórmula WCAG sobre los `fill` renderizados: texto 4,5:1; bordes de controles 3:1; rasgos de la cara sobre la piel 3:1.
- **Recarga la página completa** (una app con rutas `#` no recarga al cambiar el hash).
- **Un solo Chrome headless a la vez**, renders chicos (`--size 200` a `400`), perfil propio, capturas fuera de `/tmp`.
- Entrega: rutas de los PNG, los números medidos, la salida real de los comandos y lo que **no** pudiste comprobar.

```sh
node SK/scripts/render.mjs persona/persona.json --segment wave --at 0,18,36,60 --size 300 --out wave.png
node SK/scripts/render.mjs persona/persona.json --frame 0 --map oscuro.json --bg "#292929" --out oscuro.png   # otra paleta sin re-exportar
node SK/scripts/render.mjs persona/persona.json --views persona/parts.json --size 240 --out poses.png         # hoja con las poses de `views` (tu parts.json debe declararlas)
node SK/scripts/render.mjs persona/persona.json --rest-check --parts persona/parts.json                       # ¿el player dibuja el reposo al inicio y al final?
```
Detalle (Chrome headless por CLI, `puppeteer-core`, esqueleto de revisión): [`referencias/10-verificacion-visual.md`](referencias/10-verificacion-visual.md).

### Trabajo en paralelo o en secuencia
- **Cualquier agente (secuencial).** Una etapa a la vez, de preferencia en una sesión nueva por etapa. Copia el prompt de [`referencias/prompts.md`](referencias/prompts.md),
  resuelve las variables (`SK`, `P`, `W`, `PACK`, `ID`) y corre: constructor, luego verificador, luego arreglo.
- **Claude Code (en paralelo).** Subagentes con la herramienta de agentes o un script de workflow. En paralelo: el arte fuera de línea de cada personaje, objeto, fondo o escena,
  los verificadores y los renders. En secuencia: todo lo de Creator (una pestaña = un agente), la galería y cualquier archivo que dos agentes escribirían.
- Cada etapa tiene un **constructor**, uno o dos **verificadores adversariales** (lentes «especificación y gates» y «UX, accesibilidad y rendimiento») y un agente de **arreglo**.
  Para el arte, un **director de arte** que devuelve `{ pass, score, fixes }` (máximo dos rondas).
- No confíes en el «verde» que reporta un agente: corre tú el gate y mira los PNG.

---

## Referencia rápida de scripts

`node SK/scripts/<script>`. Los scripts no tienen `--help`: sin argumentos imprimen el uso y salen con 2 (menos `autoprueba.mjs`, que sin argumentos corre toda la cadena).
Códigos de salida: 0 bien, 1 falla (gate, verificación, falta Chrome o player), 2 uso incorrecto.

| Script | Qué hace | Uso |
|---|---|---|
| `index-svg.mjs` | Dibuja el número de índice de cada elemento sobre el SVG del donante (HTML con filtro «solo estos» y PNG) | `<donante.svg> [--out index.html] [--png index.png] [--size 1000]` |
| `build-parts.mjs` | Donante a piezas normalizadas, un SVG por pieza; también lista elementos y colores del donante | `<parts.json> [--roles roles.json] [--out carpeta] [--nearest]`, o `--list <donante.svg>`, o `--colors <donante.svg>` |
| `export-lottie.mjs` | `parts.json` a Lottie plano: lint del plan, export, z-order, reposo y gate | `<parts.json> [--out anim.json] [--name nombre] [--roles roles.json] [--parts-dir carpeta] [--max-kb N]` |
| `check-lottie.mjs` | El gate de calidad de un Lottie (de Creator o de `export-lottie`) | `<anim.json> [--roles roles.json] [--parts parts.json] [--max-kb 200] [--max-frames 450]` |
| `render.mjs` | Pinta frames con el player real en Chrome headless; compara el reposo | `<anim.json> [--frame 0,30 \| --segment nombre [--at 0,18] \| --views parts.json] [--size 400] [--out out.png] [--lottie-light ruta] [--map mapa.json] [--bg "#fff"] [--cols 4]`, o `--rest-check [--parts parts.json]` |
| `zona-calma.mjs` | Mide el % de tinta en la zona calma de un fondo (el PNG sale de `render.mjs fondo.json --frame <inicio de idle> --size 1000 --out fondo.png`; con otro `--size` falla con `the zone is outside the PNG`) | `<fondo.png> [--x 350,650] [--y 80,930] [--margen 10] [--oscuro 100] [--max 0.05]` |
| `recolor.mjs` | Cambia los colores de un Lottie por los valores de otro tema o mapa, sin re-exportar | `<anim.json> (--vars vars.json \| --map mapa.json) [--roles roles.json] [--out out.json]` |
| `split-roles.mjs` | Da a unas piezas su propio color de autoría (piel, pelo) en el spec, los SVG, los Lottie y `roles.json` | `<split.json> (--spec parts.json \| --lottie a.json,b.json) [--roles roles.json] [--parts-dir carpeta] [--dry]` |
| `reskin.mjs` | Cambia el dibujo de las piezas de un personaje animado por el de otro, sin tocar rig ni animación | `<base.json> <skin.json> <out.json>` |
| `autoprueba.mjs` | Comprueba la skill en esta máquina: pruebas unitarias y cadena completa sobre los fixtures | `[--salida carpeta] [--sin-unitarias]` |

`lib.mjs` (ayudas compartidas) y `pathkit.mjs` (mover, girar, espejar y escalar paths) son bibliotecas. Los `*.test.mjs` son las pruebas.

### Variables de entorno
| Variable | Para qué | Si falta |
|---|---|---|
| `LOTTIE_LIGHT` | Ruta a `lottie_light.min.js`. En `render.mjs` también existe `--lottie-light`; en `build-galeria.mjs`, `--player` | Busca `node_modules/lottie-web/build/player/lottie_light.min.js` subiendo desde la carpeta actual. Si no lo halla, `render.mjs` sale 1 y dice qué falta |
| `CHROME` | Ruta de Chrome o Chromium | Busca `google-chrome-stable`, `google-chrome`, `chromium`, `chromium-browser`, `chrome` y `microsoft-edge` en el `PATH`, y las rutas típicas de macOS y Windows |

### `plantillas/`, `ejemplos/` y `fixtures/`
| Archivo | Para qué |
|---|---|
| [`plantillas/parts.schema.md`](plantillas/parts.schema.md) | El formato exacto de `parts.json` (y de `split.json`) |
| `plantillas/parts.ejemplo.json`, `roles.ejemplo.json`, `paletas.ejemplo.json` | Ejemplos para copiar: una ilustración, una paleta de autoría, tres paletas para la galería |
| `plantillas/Illustration.tsx`, `illustration-vanilla.js` | La fachada de runtime: React 19 y sin framework (la segunda lleva las pruebas con player real) |
| `plantillas/segment-for.example.mjs` | `segmentFor` y `propFor` puros (reaccionar solo a cambios reales), con su prueba de tabla |
| `plantillas/galeria.html`, `build-galeria.mjs` | La galería de aprobación y su constructor (`<manifiesto.json> [--out galeria-final.html] [--template galeria.html] [--player lottie_light.min.js]`; sin `--template` usa la `galeria.html` de `plantillas/`) |
| `plantillas/package.json` | Solo para que las pruebas lean `illustration-vanilla.js` como módulo ES. No se copia a tu proyecto |
| `ejemplos/bombilla.mjs` | Generador de un prop dibujado en código: `node SK/ejemplos/bombilla.mjs <carpeta>` escribe `<carpeta>/parts.json` |
| `ejemplos/extremidades.mjs` | Un brazo con articulaciones redondas: `node SK/ejemplos/extremidades.mjs <carpeta>`; también se importa (`limb`, `limbRig`, `capsule`) |
| [`fixtures/`](fixtures/LEEME.md) | Dibujo sintético para probar: un personaje, un reloj y 13 Lottie malos que el gate debe rechazar |

---

## Reglas que no se negocian

Son las de `SKILL.md`. Cada una tiene su porqué en `referencias/`.

**Color**
- Las claves de `roles.json` son colores de autoría y **no se reescriben nunca**: cambia el valor del token. Si no, hay que re-exportar todo.
- Piel y pelo tienen rol propio desde el primer `parts.json` (`palette` por pieza). Solo el relleno; el contorno sigue siendo tinta.
- Todo color del Lottie está en `roles.json`. **Ningún color se anima**: el cambio de color es una pieza extra que cambia de opacidad.
- El color de marca dentro de una ilustración es **adorno**, sin el significado de acción que tiene en la interfaz, y ningún token de estado (advertencia, error) entra como decoración.
- Sin gradientes, sombras, efectos `ef`, máscaras, mattes, expresiones, slots, sólidos, imágenes ni texto. El gate los rechaza.

**Tiempo y movimiento**
- Pose de reposo = frame 0 de `idle`. Todo segmento empieza y termina ahí (salvo `offPoseStart`) y deja 3 o 4 frames quietos al final.
- Un frame de hueco entre markers (`tm` = fin anterior + 1). `export-lottie` lo hace solo.
- Lo que arranca solo dura **5 s o menos contando sus pasadas** y luego queda quieto; `enter` más `idle` de un fondo suman un solo tope.
  Sin loops continuos. Nada parpadea más de 3 veces por segundo. Las ráfagas separadas por menos de 1 s comparten tope.
- Escala solo en el eje propio. Al hacer desaparecer una pieza la escala baja a 0,12 y se desvanece, nunca a 0 (el parpadeo de ojos llega a 0,1). El arte **no inventa progreso** (sin barras que se llenan, sin `walk` mientras carga).
- Menos de un tercio del rig se mueve a la vez (nodos con claves entre todos los nodos del rig; cómo contar: [`referencias/04-animacion.md`](referencias/04-animacion.md)); easing sinusoidal (`io`) en los loops; anticipación y continuación.

**Dibujo**
- Contorno de ~1 px a la talla de pantalla: **4 unidades en personajes, 5 en props** (a 1000 px de lienzo). El gate no lo mide; el generador sí (`checkInkStroke` de `scripts/lib.mjs`).
- Los dos segmentos de una extremidad miden lo mismo en el pivote; el hijo no dibuja su borde superior; una tapa cubre la unión.
- Caras: tres bocas (neutra, sonrisa, «o») que se alternan por opacidad. Una cara no se deforma, se cambian piezas.
- Fondos para componer detrás de personajes: **zona calma** x 350 a 650, pies en y ≈ 930, sin tinta ahí (se mide con `scripts/zona-calma.mjs`).

**Runtime web**
- `aria-hidden="true"`, cuadrado, sin texto ni `<title>` dentro. Es decorativo.
- Carga diferida con `IntersectionObserver`; sin él (SSR, jsdom) no se importa `lottie-web`. El JSON sale como archivo propio y el chunk de entrada no lleva el player.
- `loop = pasadas - 1`; antes de `goToAndStop` va `resetSegments(true)`; con movimiento reducido solo se ve el frame de reposo.
- **Recolor desde el contenedor** (`getComputedStyle(contenedor)`), nunca desde `<html>`: si no, el arte sale en negativo en modo oscuro.
- `onError` quita el bloque entero de arte. A 390 px el arte mide 342 px o menos y no hay scroll horizontal.
- Versiones exactas, nunca `@latest`.

**Licencia y privacidad**
- El pack, sus SVG/PNG y sus rutas **no entran** al repo ni a ningún documento. Los derivados (piezas, Lottie, galería) solo en repos privados.
- Compruébalo antes de derivar. La galería incrusta arte derivado: privada hasta tener la licencia confirmada por escrito.

**Disciplina**
- Un solo Chrome headless a la vez, renders chicos (`--size 200` a `400`), perfil propio. Las herramientas y las capturas viven fuera de `/tmp`.
- No confíes en el «verde» que reporta un agente: corre tú el gate y mira los PNG. «Hecho» = salida real + captura vista.
- Lo que no verificaste lo dices como «no verificado».

---

## Comprobar la skill

Desde la raíz del repo (o de donde esté instalada):

```sh
node --test --test-concurrency=1   # las pruebas unitarias: 160 en esta versión (un archivo a la vez, así solo hay un Chrome)
node scripts/autoprueba.mjs        # pruebas más la cadena completa sobre los fixtures
node scripts/autoprueba.mjs --salida out    # además deja los PNG, HTML y Lottie en out/ para mirarlos
LOTTIE_LIGHT=/ruta/a/lottie_light.min.js node scripts/autoprueba.mjs     # con el player real
```

- **`node --test` va sin carpeta.** `node --test scripts/` (con una carpeta) falla en Node 24 con `Cannot find module '.../scripts'`.
- **`--test-concurrency=1`** hace que node corra un archivo de prueba a la vez. Sin él corre varios en paralelo y los tres que usan Chrome (`build-galeria`, `render`, `illustration-player`)
  pueden abrir varios Chrome a la vez. La opción existe desde Node 20.10; `autoprueba.mjs` la pasa sola. No sirve en `NODE_OPTIONS`.
- `autoprueba` usa un proyecto inventado ([`fixtures/`](fixtures/LEEME.md)): un personaje y un reloj sintéticos, y 13 Lottie malos que el gate debe rechazar.
  Recorre `index-svg`, `build-parts`, `export-lottie`, `check-lottie`, los fixtures malos, `recolor`, `split-roles`, `reskin`, `render`, la galería,
  las plantillas y los ejemplos, y `instalar.py` en un HOME de prueba (instala, no pisa a otra skill, copia y quita).
- Sale con un código distinto de 0 si algo falla. La última línea resume: `autoprueba: 18 ok, 0 omitidas, 0 con falla` con Chrome y player.
- **Qué es un `SKIP`.** Lo que necesita Chrome o `lottie_light.min.js` se omite con una línea clara si falta, por ejemplo
  `SKIP render: frames del Lottie con el player real (lottie_light) en Chrome: no hay lottie_light.min.js (LOTTIE_LIGHT=<ruta> o npm i lottie-web@5.13.0)`.
  **Un `SKIP` no es una falla**: dice qué no se pudo comprobar. Sin `LOTTIE_LIGHT`, `node --test` da 155 pasan y 5 omitidas.
- Si `CHROME` apunta a una ruta que no existe, los pasos con Chrome **fallan** en vez de omitirse: corrige la ruta o quita la variable.

---

## Estructura del repo

```
.
├── README.md                    esta página: qué es, cómo se instala y cómo se usa
├── SKILL.md                     instrucciones para el agente (ruta, flujo, reglas, puntos de decisión)
├── instalar.py                  instalador y revisor de dependencias (solo biblioteca estándar)
├── referencias/                 el método completo, con el porqué de cada regla
│   ├── 01-recepcion-del-pack.md     licencia, zip, inventario, donantes, qué no se commitea
│   ├── 02-piezas-y-paleta.md        roles.json, build-parts paso a paso, piel y pelo, tokens por tema
│   ├── 03-rig.md                    parts.json campo por campo, pivotes, z-order, cápsulas, contorno, elenco
│   ├── 04-animacion.md              segmentos, recetas de personaje, props, fondos y escenas, presupuestos
│   ├── 05-ruta-creator.md           LottieFiles Creator por MCP: preparación, reglas duras, export, trampas
│   ├── 06-ruta-codigo.md            la ruta por defecto, reskin, split-roles, composición, un prop nuevo
│   ├── 07-gate.md                   cada regla de check-lottie con su porqué; cómo agregar una
│   ├── 08-web-runtime.md            player, carga diferida, fachada, movimiento reducido, modo oscuro
│   ├── 09-galeria-y-aprobacion.md   galería, paletas A/B, contraste, ciclo de aprobación y mensaje base
│   ├── 10-verificacion-visual.md    Chrome headless, render.mjs, puppeteer-core, 1280 y 390, evidencia
│   ├── 11-lecciones.md              errores que pasaron (síntoma, causa, arreglo) y trampas ya evitadas
│   ├── 12-caso-real.md              la sesión de origen contada de forma genérica
│   └── prompts.md                   prompts E0 a E15 para copiar y pegar, y cómo repartir con subagentes
├── scripts/                     los motores (build-parts, index-svg, export-lottie, check-lottie, reskin,
│                                split-roles, recolor, render, zona-calma), las bibliotecas lib y pathkit,
│                                autoprueba.mjs y los *.test.mjs (las pruebas)
├── plantillas/                  formato de parts.json, ejemplos, fachada de runtime (React y sin framework),
│                                segmentFor y la galería de aprobación con su constructor
├── ejemplos/                    bombilla.mjs (un prop) y extremidades.mjs (un brazo con articulaciones)
└── fixtures/                    dibujo original sintético para probar (LEEME.md): donors/, persona/, reloj/,
                                 roles.json y check/ (un Lottie válido y 13 malos)
```

---

## Caso real y lecciones

### El caso
La skill nace de una sesión real de unos dos días, hecha por un lead dev con agentes de código, y está contada sin nombres de cliente en
[`referencias/12-caso-real.md`](referencias/12-caso-real.md). Un producto B2B con dos apps web compró la licencia de un pack comercial de ilustraciones planas
(50 SVG y 100 PNG) y pidió verlas animadas, con una excepción escrita a sus reglas de diseño sobrias.

| Etapa | Resultado |
|---|---|
| Decisión de runtime | `lottie-web` build light detrás de una fachada con carga diferida (puntaje 8,10 contra 6,70 de `lottie-react`, 6,65 de SVG con CSS y 5,65 de dotLottie con WASM) |
| Herramientas antes que arte | El gate y sus fixtures malos se escribieron **antes** de animar nada |
| Spike en Creator | Un brazo de prueba respondió 7 preguntas antes de rigear un cuerpo |
| Piloto | Un personaje de 28 piezas y 7 segmentos (417 frames, 157 KB), aprobado en una galería |
| Escalar | 3 personajes, 5 objetos, 3 fondos y 5 escenas; los objetos, fondos y escenas **sin Creator**, por código |
| Web | Chunk del player de 46,8 KB gzip, fuera del chunk de entrada; arte en 7 pantallas del front y una escena de 4 piezas en el login del CRM |

El caso cuenta también las 13 decisiones de la persona responsable, los riesgos con su plan B y qué haría distinto quien lo repita.

### Lecciones destacadas
Las diez que más ahorran trabajo. La lista completa, como síntoma, causa y arreglo, está en [`referencias/11-lecciones.md`](referencias/11-lecciones.md).

1. **Pregunta la licencia de derivados al empezar**, no al final. Un pack puede cubrir «usar tal cual» y no «recortar, derivar y animar».
2. **Piel y pelo con rol propio desde el primer `parts.json`.** Separarlos después costó una tarea entera y un riesgo constante.
3. **Las claves de `roles.json` no se reescriben nunca.** Un test las comparaba con los tokens y se puso rojo al llegar la paleta oficial: se arregló el test, no las claves. Todo el arte cambió solo.
4. **No recortes extremidades del donante.** El aro negro queda a la vista y deja un hueco al girar; se dibujan como cápsulas con articulaciones redondas.
5. **Para objetos, fondos y escenas no hace falta Creator.** El export por código es reproducible, no depende de una pestaña única y deja el z-order en `parts.json`.
6. **`lottie_light` termina un segmento un frame antes y cae en el siguiente marker.** De ahí el frame de hueco entre markers y los 3 o 4 frames quietos al final.
7. **`loop = pasadas - 1`**, y `resetSegments(true)` antes de `goToAndStop`. Si no, salen pasadas de más y frames equivocados.
8. **El arte salió en negativo en modo oscuro** porque se leían los tokens de `<html>`. Léelos del contenedor, y recarga la página completa al comprobarlo (con rutas `#` el hash no recarga).
9. **El peso lo da la estructura, no la animación.** 28 piezas y 7 segmentos pesaron 157 KB; el tope pasó de 120 a 200 KB. Los decimales ayudan poco (`precision` de 3 a 2 es el último recurso); para bajar peso, quita piezas o claves.
10. **Commitea los exports antes de correr el gate en clon limpio**, y no confíes en el «verde» que reporta un agente: «hecho» es salida real más una captura vista.

---

## Privacidad y licencia del arte

- Este repositorio **no lleva arte de terceros ni datos de clientes**. Los fixtures son dibujo original sintético, hecho para esta skill.
- El pack de ilustraciones, los `parts.json` con sus índices reales, los Lottie derivados y las galerías con arte derivado van en el repo **privado** de cada proyecto, nunca aquí.
- Un pack comercial puede **no cubrir derivados** (piezas recortadas, personajes nuevos, animación). Antes de publicar o fusionar, confirma por escrito con el proveedor que la licencia
  cubre modificar, crear obras derivadas, animar y distribuir en un producto web. [`referencias/01-recepcion-del-pack.md`](referencias/01-recepcion-del-pack.md) trae las preguntas.
- Mientras no haya respuesta: rama privada, derivados solo en repos privados y la galería (que incrusta arte derivado y los PNG originales) no sale del equipo.
- No guardes la galería final en el repo del proyecto, y no la pegues en un servicio público.
- **Licencia del código: pendiente de definir por el autor.** Este repositorio todavía no tiene un archivo `LICENSE`.
