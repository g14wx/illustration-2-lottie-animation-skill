# 01. Recepción del pack

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

Qué hacer cuando te llega un zip de ilustraciones (SVG + PNG) y quieres animarlo. Este paso no escribe código: deja la licencia
aclarada, el pack inventariado y los donantes elegidos con sus índices de path. Lo siguiente es `02-piezas-y-paleta.md`.

## 1. La licencia, antes que nada
Un pack comercial suele cubrir "usar la ilustración tal cual". Animarla implica **modificar** (recortar piezas), **crear
derivados** (personajes nuevos con esas piezas) y **entregar** los JSON animados al navegador de cada visitante. Nada de eso
está claro por defecto (es el razonamiento del skill, no una respuesta del proveedor: **sin confirmar** en el caso real).

- El zip del caso real **no traía ningún texto de licencia**. El nombre interno de los zips decía "free" aunque la licencia era
  comprada. El nombre del archivo no prueba nada.
- Pregúntalo por escrito al proveedor (copia y pega, en español o inglés):
  1. ¿Puedo **modificar** las ilustraciones (recortar piezas, recolorear)? / May I modify them (cut parts, recolor)?
  2. ¿Puedo crear **obras derivadas** (personajes u objetos nuevos hechos con sus piezas)? / May I create derivative works?
  3. ¿Puedo **animarlas** (Lottie, vídeo)? / May I animate them?
  4. ¿Puedo **distribuir** el resultado: en un producto web (el JSON viaja al navegador del usuario), en un repo público, en un
     skill o plantilla compartida? / May I redistribute the result?
  5. ¿Cuántos proyectos, sitios o usuarios cubre? ¿Cubre entregarlo a un cliente? ¿Está ligada a una persona o cuenta?
  6. ¿Exige atribución? ¿Cambia algo si es un SaaS de pago?
- Guarda la respuesta (fecha, quién, texto) junto a la decisión del proyecto, nunca dentro del skill.
- Mientras no haya respuesta: se puede trabajar en una **rama privada**. No se hace merge a la rama principal, no se publica y
  **los derivados se commitean solo en un repo privado**.
- Una galería de aprobación que muestre arte derivado (ver `09-galeria-y-aprobacion.md`) **no se comparte fuera del equipo** hasta
  tener la respuesta. Un Artifact o página privada sigue siendo un host de terceros.
- La web (docs, tutoriales, galerías de otros) se usa **solo para técnica**. Nunca para bajar arte sin licencia.
- Si el proveedor ofrece un servidor MCP: la clave de API se registra en tu terminal, no en el chat. Según el paquete que se
  revisó (no se llegó a probar registrado), buscar funciona sin clave y bajar el SVG limpio exige clave; con cuenta gratis los
  packs de pago salen con marca de agua.

## 2. Abrir el zip fuera del repo
- Extrae en una carpeta de trabajo **fuera** del repo (o en una carpeta ignorada por git). Entre comillas: los nombres llevan
  espacios, comas y `_`.
- El caso real era un **zip dentro de un zip**: uno con los SVG (50) y otro con los PNG (100: carpetas `1x` y `2x`).
  Los nombres son `categoría _ palabras clave, otra, otra.svg`. Las palabras clave dicen qué escena es ("man", "woman", "mail").
- Si lo bajaste en Windows y lo ves desde WSL, aparecen archivos `*:Zone.Identifier`. Se borran y no se commitean.

```sh
unzip -q "pack.zip" -d <carpeta-de-trabajo>
unzip -q "<carpeta-de-trabajo>/<pack>-SVG.zip" -d <carpeta-de-trabajo>/svg
unzip -q "<carpeta-de-trabajo>/<pack>-PNG.zip" -d <carpeta-de-trabajo>/png
```

## 3. Cómo son estos SVG (y por qué `build-parts` está hecho así)
Lo típico de un pack exportado de Illustrator, igual que `fixtures/donors/*.svg`:
- Lienzo `viewBox="0 0 1000 1000"`. Si no lo es, `build-parts` avisa por stderr: las piezas no coincidirían con el lienzo del skill
  (escala el donante primero).
- Los colores van en clases `.cls-N` dentro de un `<style>`, no en el elemento.
- Hay `<line>` invisibles (solo relleno). `build-parts` y `index-svg` no los cuentan.
- Cada pieza es un **relleno seguido de su aro de contorno** (un path negro con `fill-rule: evenodd`). Si tomas el índice 12 y
  no el 13, pierdes el contorno.
- Los ojos suelen ser círculos pequeños **sin aro**.
- Decenas de paths planos, sin grupos: 68 en el primero que se miró, 121 en uno de los grandes.
- Colores casi iguales pero no idénticos (dos marrones de pelo a un tono de distancia) y pieles de varios tonos.
- 1 de 50 traía un `<g>` con `clip-path`. `build-parts` lo rechaza en voz alta (no cae al negro): sin `<g>` con
  `class/fill/stroke/style/transform`, sin `style=""`, sin clases sin regla. Ese donante se descarta o se limpia a mano.

## 4. Inventario
Haz una tabla (en tu carpeta de trabajo, no en el skill). Una fila por donante que te interese:

| Archivo | Pose / vista | Piezas útiles | Colores únicos de piel | Notas |
|---|---|---|---|---|
| `…man.svg` | frente, 3/4 | cabeza, pelo | sí | cara mínima (ojo punto) |

- Mira los PNG `1x` en grupos de 3 o 4 con la herramienta de imágenes del agente. Hacen de hoja de contacto.
- `node SK/scripts/build-parts.mjs --list <donante.svg>` da índice, etiqueta, relleno y bbox de cada elemento
  (en `path`, el largo de `d`, no el bbox). `--colors <donante.svg>` lista los colores distintos y cuántos elementos usa cada uno.
- Un donante sin colores propios para la piel (la piel comparte color con ropa u objetos) **no se podrá separar después**
  (`02-piezas-y-paleta.md` §6). Anótalo ya.

## 5. Elegir donantes
- **Pose**: vista de frente o 3/4 y postura neutra o casi. Una mano en la cadera o un brazo levantado cuesta rediseñarlo.
- **Qué sale del donante**: lo que **no cruza una articulación** y mantiene el estilo: cabeza, oreja, pelo, ojos, ceja, boca.
  Brazos, piernas, torso y cuello se **dibujan** (`03-rig.md`). En el caso real el plan decía cabeza, pelo, manos y zapatos del
  donante; al final solo quedaron cabeza, oreja, pelo, ojos, una ceja, la boca neutra y los cordones. Manos y zapatos se
  dibujaron: el aro recortado se ve al rotar.
- **Mezclar donantes** (cabeza de uno, pelo de otro) funciona si se reescalan al mismo tamaño y grosor de contorno. El escalado,
  giro y espejo se aplican a los **datos del path** (`03-rig.md` §10), no con `transform`.
- **Cara mínima** (ojo de punto, boca de línea): encaja con parpadeo, sonrisa y sorpresa.
- **Un donante con pelo propio y de color único** facilita el rol de pelo. Si el pelo es de la tinta o comparte color con otra cosa,
  tendrás que cortarlo en su propia pieza.
- Elige donantes **distintos por silueta** (pelo, ropa) si vas a hacer un elenco: se reconocen de un vistazo.

## 6. Overlay de índices (elegir los paths)
```sh
node SK/scripts/index-svg.mjs <donante.svg> --png index.png      # también escribe <donante>.index.html
```
- Dibuja el número de cada elemento sobre el SVG. Es **el mismo índice** que usan `indices` de `parts.json` y `--list`.
- Relleno y aro comparten centro: cada número busca el primer hueco libre alrededor, así se leen todos. Si dos números se ven
  juntos, son relleno y aro (el aro es el siguiente).
- El HTML trae una tabla con relleno y bbox (pasar el ratón resalta el elemento) y un campo **"solo estos"** (`12-15, 20`) para
  ver cómo quedaría una pieza antes de escribirla.
- Si el navegador cuenta distinto que `build-parts`, el HTML lo avisa: hay un elemento no soportado y los índices no valen.
- Sin Chrome, el `.index.html` se abre a mano o te quedas con `--list`. La captura PNG usa `$CHROME` o el Chrome del PATH.
- Escribe en `parts.json` `{ "name": "head", "donor": "clave", "indices": [18, 19] }`. Una nota por pieza (de dónde sale, qué
  transformación se le hizo) te ahorra repetir el overlay.

## 7. Qué no se commitea nunca
En cualquier repo **público**, skill o plantilla compartida:
- el zip, los SVG y PNG originales, las capturas del pack;
- `parts.json` con donantes e índices reales, `parts/*.svg`, los Lottie exportados y la galería con arte derivado;
- `*:Zone.Identifier`, tokens, `.env`, rutas de tu máquina.

En el repo **privado** del proyecto sí van los donantes usados, `parts.json`, `parts/` y los Lottie. Regla de higiene:
```gitignore
resources/
*.zip
*:Zone.Identifier
```
Los fixtures de este skill son dibujo **original sintético**: son lo único que se puede compartir.

## 8. Los PNG originales
- Solo sirven para **comparar**: pon el original al lado de lo animado y juzga si se respeta el estilo (grosor del contorno,
  proporciones, caras). Se usan `1x`.
- No se vectorizan ni se usan como fuente de trazado.
- Si los embebes en una galería, esa galería es privada (§1).

## Lista de salida
- [ ] Pregunta de licencia enviada y registrada (o decisión explícita de seguir en rama privada).
- [ ] Zip fuera del repo, `resources/` ignorado, sin `Zone.Identifier`.
- [ ] Tabla de inventario con donantes elegidos y por qué.
- [ ] Overlay visto de cada donante y `indices` anotados por pieza.
- [ ] Anotado qué donantes no permiten separar la piel o el pelo.
