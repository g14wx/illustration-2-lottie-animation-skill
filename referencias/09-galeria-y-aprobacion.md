# Galería y aprobación humana

Nadie escala un estilo de animación sin que una persona lo mire. La galería es **una sola página** donde esa persona ve el arte
moverse, lo compara con los originales y decide. Hasta que aprueba el piloto, no se hace el resto del reparto.

Antes: `07-gate.md` (los Lottie ya pasan el gate). Los runtimes de las pantallas, en `08-web-runtime.md`. `SK` = carpeta del skill. Los comandos corren desde el proyecto, con `node SK/...`.

## 1. Qué muestra la galería
La plantilla es `plantillas/galeria.html` y la arma `plantillas/build-galeria.mjs`. Cada animación es una tarjeta:

| Elemento | Para qué sirve |
|---|---|
| Botón `▶ <segmento>` por cada marker | Ver cada segmento (`idle`, `walk`, `wave`…) con las pasadas que declara `parts.json` |
| Tabla segmento / frames / pasadas / segundos | Cada fila marca en rojo lo que pasa de 5 s. Es el mismo tope del gate |
| Interruptor **Movimiento reducido** | Con él activo ningún segmento se mueve y se ve el frame de reposo (lo que verá quien lo pide) |
| **Zoom 3x** | Amplía el dibujo hacia donde apunta el ratón. Sirve para mirar hombros, codos, caderas y rodillas: ahí se ven los cortes de las articulaciones |
| **PNG original** al lado (`png` en el manifiesto) | Se juzga si se respeta el estilo del pack: grosor de contorno, proporciones, caras, a la misma escala |
| Selector de **paleta** | "Autoría" (sin recolor) más las paletas del manifiesto (A, B, oscuro, provisional/oficial…). Recolorea con la misma función `recolor()` de la fachada |
| `--paper` en una paleta | Fondo del lienzo (para ver el modo oscuro) |
| Tarjeta **Composición** (`compose` en el manifiesto) | Un fondo y un personaje apilados en el mismo lienzo, cada uno con su selector y sus botones `▶`: se ve el fondo detrás y al personaje encima como en la pantalla |
| Sección **Pantallas reales** (`shots`) | Capturas de las pantallas donde irá el arte (PNG): quien aprueba lo ve en su contexto |
| Tarjetas de **notas** (`notes`) | Decisiones, límites aceptados y la tabla de números de contraste (ver sección 4), con título, texto y lista |

Cada tarjeta lleva el frame actual ("frame 37", "reposo") y el texto `use` del manifiesto (para qué pantalla es). La página no usa nada más que `lottie_light`.

### Cómo se arma
```bash
node SK/plantillas/build-galeria.mjs manifiesto.json --out galeria-final.html --player "$LOTTIE_LIGHT"
```
- `--player` mete el player **dentro** del HTML: funciona sin red. Sin él, la página carga `lottie_light` desde cdnjs con un hash de integridad (SRI).
  La plantilla fija `lottie-web 5.12.2` en cdnjs porque ese es el hash que se verificó. Los assets reales se sirven con la versión del proyecto (5.13.0).
  Si la diferencia te importa, usa `--player` con el mismo archivo que el proyecto.
- **`$LOTTIE_LIGHT` tiene que estar definida.** Si queda vacía, `--player ""` no mete nada: el script avisa por stderr y la galería carga 5.12.2 desde cdnjs (necesita red). Sin `--player` también avisa.
- Manifiesto (rutas relativas al manifiesto; `roles` y las paletas pueden ir como objeto o como ruta a un `.json`; todo `palettes` también puede ser una ruta):
```json
{ "title": "Piloto: personaje A", "intro": "Texto plano que ve quien aprueba.",
  "roles": "roles.json",
  "palettes": { "A": { "--illus-skin": "#f0c8a0", "--illus-hair": "#5a3d2b" }, "Oscuro": "paletas/oscuro.json" },
  "assets": [ { "id": "persona", "label": "Persona", "use": "Saluda en el formulario", "json": "persona/persona.json", "png": "originales/persona.png" },
              { "id": "oficina", "label": "Oficina", "use": "Fondo del formulario", "json": "oficina/oficina.json" } ],
  "compose": { "bgs": ["oficina"], "cast": ["persona"] },
  "shots": [ { "label": "Formulario 1280", "png": "capturas/formulario-1280.png" } ],
  "notes": [ { "title": "Contraste", "items": ["rasgos sobre piel 5,45:1 (claro)", "rasgos sobre piel 3,82:1 (oscuro)"] },
             { "title": "Límites aceptados", "text": "El pelo oscuro sin contorno se separa poco del fondo oscuro. Lo aceptó: <nombre>." } ] }
```
  - `json` incrusta el Lottie (un solo archivo que se abre con doble clic). `src` deja una URL relativa que la página lee con `fetch`: solo funciona servida por http, no con `file://`.
  - `png` incrusta el original; `pngSrc` lo deja como URL. `compose` es opcional: ids de assets ya declarados (uno desconocido es error). `shots` y `notes`, también opcionales.
  - Las claves de `palettes` que empiezan con `_` (por ejemplo `_comment`) se ignoran: puedes copiar `plantillas/paletas.ejemplo.json` tal cual dentro de `palettes`.
  - Ejemplos: `plantillas/roles.ejemplo.json` y `plantillas/paletas.ejemplo.json`. `scripts/autoprueba.mjs` arma una galería de ejemplo con los fixtures y la abre con Chrome.
- **Peso.** El HTML lleva los Lottie y los PNG en base64. Un Artifact de Claude pesa como máximo **16 MB** y `build-galeria` avisa por stderr si el HTML pasa de eso. Antes de incrustar,
  encoge los originales y las capturas (webp chico, unos cientos de px de lado: solo sirven para comparar el estilo). Un original a 1000 px en PNG es lo que más pesa.
- Límite conocido: el botón `▶` no se probó con reproducción real en Chrome headless (el tiempo virtual no avanza `requestAnimationFrame`). La galería monta, recolorea y muestra los reposos. Para ver el movimiento, ábrela en un navegador normal.

## 2. Qué incluir en cada versión
Se publicaron seis versiones (v1 a v6) en la misma URL. Cada una sumó lo que se había construido hasta ese momento
(la plantilla soporta todo lo de la lista: tarjetas por activo, `compose`, `shots`, `notes` y la paleta provisional/oficial como paleta del manifiesto):
- v1: el personaje piloto (7 segmentos), Play por segmento, movimiento reducido, zoom, comparación con los PNG originales y la paleta A/B.
- v3 en adelante: el reparto completo y los objetos (props).
- v5: además las escenas y la composición de fondos con personajes encima.
- v6: además capturas de las pantallas reales y un selector "Provisional / oficial" que mapea los colores de autoría a los de la marca cuando esa paleta llegó.
(Verificado en la sesión: v3, v5 y v6. v1 es lo que pedía el alcance de la tarea de la galería; v2 y v4 fueron pasos intermedios cuyo detalle no está verificado.)

Mantén la regla: **una versión por avance**, sin cambiar la URL, para que quien aprueba no pierda el enlace.

## 3. Paletas A/B
Cuando hay una decisión de color que no es obvia, la galería deja alternar **sin recargar**.
- Caso real: la **A** dejaba piel y pelo en los grises neutros compartidos; la **B** les daba dos tokens propios (`--illus-skin`, `--illus-hair`), con valor para claro y para oscuro.
  El humano eligió la B. Se avisó al cliente porque esos dos colores quedan fuera de su paleta oficial (excepción acotada: solo ilustraciones).
- Antes de elegir se renderizaron **tres pares** de piel/pelo en tres personajes. Dos se descartaron por razones concretas: uno daba una piel terracota con el pelo casi negro, que se funde con la tinta;
  otro, una piel pálida de caricatura. Lleva siempre 3 candidatos y di por qué se descarta cada uno.
- Un solo tono de piel para todo el reparto es un riesgo de diversidad (el pack original traía varios tonos). Si el proyecto tiene público diverso, ponlo como decisión explícita (un segundo token de piel es otra decisión), no lo dejes escondido.

## 4. Sección de números de contraste
Toda paleta nueva se aprueba **con números**, no con "se ve bien". Escríbelos en una tarjeta de `notes` del manifiesto (lista de pares con su valor medido) o en el mensaje de aprobación. La plantilla no los calcula sola.
Fórmula y herramientas: `10-verificacion-visual.md`. Umbrales:

| Qué | Mínimo |
|---|---|
| Rasgos de la cara (tinta) sobre la piel | 3:1 |
| Texto cerca del arte | 4,5:1 |
| Bordes de controles y foco | 3:1 |
| Detalles puramente decorativos | sin mínimo, pero anótalos como límite aceptado |

Escribe una fila por par y por tema (claro y oscuro), con el valor medido. Caso real:

| Par | Claro | Oscuro |
|---|---|---|
| Rasgos (tinta) sobre piel | 5,45:1 | 3,82:1 (tinta blanca) |
| Pelo contra piel | sin dato | 1,84:1 (aceptado, el pelo no lleva contorno) |
| Pelo contra el fondo oscuro | sin dato | 1,88:1 (aceptado) |
| Contornos blancos sobre fondo oscuro de un prop | | 14,6:1 |
| Placas e interiores de un prop | | 8,6:1 |
| Cristal apagado de un prop contra el fondo | | 1,7:1 (los contornos hacen el trabajo) |

Los números bajos no se esconden: cada uno va a una lista de **límites conocidos y aceptados**, con quién lo aceptó. Ejemplos que se anotaron:
el pelo oscuro sin contorno apenas se separa del fondo oscuro; la piel cambia de tono entre temas; el pelo de las escenas del pack es gris a propósito
(comparte color con ropa y objetos); ninguna pantalla enviada pintaba arte oscuro, así que esos límites solo se ven en la galería.

## 5. Publicarla en privado
La galería **incrusta arte derivado del pack** (y, si usas `png`, los originales). Un pack comercial puede no cubrir derivados.
- No la compartas fuera del equipo hasta tener por escrito el alcance de la licencia. Pregúntalo al proveedor al empezar, no al final.
- En Claude Code: publícala como un Artifact. Es **privado por defecto**; no copies el enlace a canales abiertos. En otros agentes: entrega el HTML a mano al equipo, o súbelo a una URL interna con acceso restringido. Nada de pegarla en un servicio público ni en un repo público.
- Los derivados (piezas recortadas, personajes nuevos, Lottie) se commitean solo en repos privados. El pack original no se commitea nunca (carpeta sin trackear).
- No guardes `galeria-final.html` en el repo del proyecto: es un archivo de revisión, se regenera.

## 6. El ciclo de aprobación: piloto primero, luego escalar
1. **Piloto.** Un solo personaje con sus 7 segmentos, armado y validado con el gate. Nada más. Costo bajo; sirve para descubrir problemas de estilo y de herramientas antes de repetir el trabajo veinte veces.
2. **Galería v1** con paleta A/B, y los números de contraste.
3. **La persona decide.** Aprueba, pide ajustes o elige A/B. Su respuesta se guarda donde el proyecto guarda decisiones (un ADR o equivalente), con fecha, variante elegida y límites aceptados.
4. **Escalar.** Reparto por `reskin.mjs` sobre el rig aprobado, objetos y fondos por código, escenas del pack con animación ligera. Una galería nueva por avance.
5. **Montaje en pantallas.** La persona aprueba qué arte va en qué pantalla antes de montarlo. En el caso real se aprobó con un "aprobado + ?": se pidió un signo de interrogación dentro de la lupa de la pantalla "no encontrado".
6. **Verificación visual de las pantallas reales** (`10-verificacion-visual.md`) y capturas en la galería (v6).
7. **Aprobación final** del conjunto antes de fusionar.

Reglas del ciclo:
- Si la persona no responde, no sigas escalando "por si acaso". Puedes avanzar en lo que no depende de su decisión (herramientas, runtime), pero no en el reparto.
- Si pide un ajuste, regenera con los scripts (en el caso real los generadores daban la misma salida byte a byte entre corridas) y publica una versión nueva. No parches a mano el JSON exportado.
- Cuando llegó la paleta oficial de la marca, **todo el arte cambió solo**: solo cambian los tokens, no se re-exporta nada. Eso solo funciona si las claves de `roles.json` son colores de autoría que nunca se reescriben.

## 7. Cómo pedir la aprobación (mensaje base)
Escribe el mensaje para alguien que no vio nada antes. Corto, sin jerga, con la decisión al final.
```
Hola. Te escribe el asistente de IA del proyecto.
Qué es: la primera ilustración animada (un personaje con 7 movimientos) para las pantallas públicas.
Por qué importa: si el estilo te gusta, hacemos el resto del reparto con el mismo método; si no, cambiarlo ahora es barato.
Qué hay que mirar (galería privada, no la reenvíes fuera del equipo): <enlace>
  - Prueba cada botón ▶. Prueba "Movimiento reducido". Activa "Zoom 3x" y pasa el ratón por hombros y codos.
  - A la derecha de cada dibujo está el original del pack, para comparar el estilo.
Decisiones:
  1. Estilo y movimiento: 1A aprobado / 1B quiero cambios (dime cuáles).
  2. Piel y pelo: 2A grises neutros / 2B colores propios (la tabla de contraste está arriba).
Responde con "1A, 2B" o similar.
```
Aviso para quien lo vea en Creator o en un editor: lo primero que se ve en el editor es el **cuerpo de prueba** (piezas simples para validar los pivotes), no el arte final. Dilo siempre, porque se confundió una vez con el resultado.
