# 05 · Ruta LottieFiles Creator (MCP)

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

Armar el rig y animar dentro de LottieFiles Creator (creator.lottiefiles.com) manejado por su MCP local (`lottiefiles-creator`), y exportar el Lottie.
Es la ruta con la que se hizo el **primer personaje**. Para escalar ganó la ruta de código (`06-ruta-codigo.md`). Léela entera antes de empezar: casi todo lo difícil está en las trampas, no en los pasos.

## 0. Cuándo usarla y cuándo no
- **Úsala** para un personaje piloto que un humano quiere ver y retocar en la app, o cuando el humano prefiere keyframes a mano.
- **No la uses** para muchas piezas, props, fondos ni escenas: necesita una sesión iniciada, una sola pestaña y un humano que haga el export. Una pestaña = un agente a la vez. Por código se hace todo en archivos, en paralelo y reproducible.
- El MCP de Creator **no tiene herramienta de exportación**. Exportar siempre son clics en la app (sección 5).

## 1. Preparación (una vez)
1. **Inicia sesión en LottieFiles.** Sin sesión (modo invitado) Creator **no exporta** y todo el trabajo **se pierde al cerrar o recargar la pestaña**. Pasó una vez: se perdió el brazo de prueba del spike y hubo que rehacerlo.
2. Abre Creator en **una sola pestaña**.
3. **Settings → MCP Settings → Enable Local MCP.** Debe quedar activo para que el agente conecte con la pestaña.
4. Conecta el MCP `lottiefiles-creator` a tu agente (cómo se registra depende del agente; sin verificar aquí). Carga los esquemas de todas sus herramientas de una vez, porque el agente solo conoce los nombres hasta que se cargan.
5. Prueba con `list_scenes` y `read_scene`.
6. Si tu agente maneja Chrome con una extensión (la pestaña de Creator vivía en un grupo de pestañas de la extensión), el agente puede hacer los clics del export. Si no, los hace el humano (sección 7).

## 2. Reglas duras
| Haz | No hagas | Por qué |
|---|---|---|
| Una escena **nueva** por personaje (1000×1000, 30 fps) | Tocar otras escenas ni `Main Scene` | el export marca escenas; una prueba vieja se cuela |
| Una pieza por `import_asset`, con `name` = nombre de la pieza | Importar varias piezas en un mismo SVG | un SVG = una capa raíz: las piezas juntas no se pueden mover por separado |
| Jerarquía **solo con `group_layers`** | `create_scene_layer` | exporta 500×500 y `lottie_light` recorta con el tamaño de la capa |
| Anclas en **coordenadas del lienzo** (`set_anchor_point`) | Anclas relativas al centro | Creator las toma del lienzo |
| Confiar en **`read_keyframes`** | Confiar en `read_scene` tras mover anclas | `read_scene` muestra posiciones y bounds viejos |
| Claves en frames enteros con presets de easing | Easings a mano | los presets exportan bien (`o`/`i`) |
| Un agente secuencial en Creator | Dos agentes a la vez | hay una sola pestaña viva |
| Dejar la escena activa y el cabezal en un frame visible (`set_current_frame` 30) | Dejar otra escena activa | es la que se exporta |

**Nunca metas parches de JavaScript en la página de Creator** (monkey-patch). Colgó la página: hubo que recargar e iniciar sesión otra vez.

## 3. Receta de un personaje
Antes de Creator, deja listas las piezas y el spec: `parts.json` con articulaciones y `parts/*.svg` (los hace `build-parts.mjs`; ver la referencia de partes). Cada pieza es un SVG con `viewBox="0 0 1000 1000"` dibujada en su sitio final, así todas comparten el mismo marco.

1. **Escena.** `create_scene` con nombre del personaje, 1000×1000, 30 fps, duración 14 s (420 frames), `activate: true`.
2. **Importar** cada pieza de abajo hacia arriba (orden de z), una por `import_asset` (SVG con contenido en línea), `name` exacto. Tras cada una, `read_scene`: una capa raíz nueva.
3. **Anclas, antes de agrupar** (coordenadas del lienzo): brazo en el hombro, antebrazo en el codo, mano en la muñeca, muslo en la cadera, canilla en la rodilla, zapato en el tobillo, cabeza y sus piezas en el cuello, torso y cuello en la cintura.
4. **Jerarquía con `group_layers`, de adentro hacia afuera.** Justo después de crear cada grupo, ponle su ancla en su pivote:
   - `foreArmGrp` = antebrazo + mano, ancla en el codo; `armGrp` = brazo + `foreArmGrp`, ancla en el hombro (igual con las piernas);
   - `eyesGrp`, `headGrp` (cabeza con ojos, cejas y las tres bocas), `upperBodyGrp` en la cintura, `figureGrp` en el punto medio entre los tobillos, sobre el suelo.
   - Tras cada grupo: `read_scene`, revisa que las extremidades de atrás queden detrás del torso (`reorder_layer` si no) y que `read_keyframes` dé posición = ancla.
5. **Bocas.** Las dos que no son la neutra, con opacidad 0 (clave estática en el frame 0).
6. **Animar** con `apply_keyframes` (frames enteros). Para grupos anidados haz `switch_scene` a la escena fuente de la precomp, pon las claves y vuelve. Cada segmento empieza y termina en la pose neutra. Valores de cada segmento: `04-animacion.md`.
7. **Segmentos.** `add_segment` con el nombre y el rango exactos (`idle` 0..71, `walk` 72..101, `wave` 102..176, `point` 177..236, `happy` 237..296, `surprised` 297..356, `thinking` 357..416). Un frame de separación entre uno y otro.
8. **Verificar.** `read_keyframes` (primer y último frame de cada segmento = neutro; al menos 2 claves por propiedad animada) y `list_segments` (nombres y rangos exactos).
9. **Dejar listo** el export: escena activa, cabezal en el frame 30.

### Reparto con otras pieles (reskin)
Para personajes nuevos con las animaciones de uno ya aprobado: crea una escena `<id>-skin` (1000×1000, 30 fps, 1 s), importa **todas** las piezas nuevas con el **mismo nombre** que las del base, y nada más (sin anclas, grupos ni animación). `read_scene` debe mostrar tantas capas raíz como piezas, con los nombres exactos. Exporta esa escena y trasplanta con `node SK/scripts/reskin.mjs base.json skin.json out.json` (ver `06-ruta-codigo.md`).

## 4. Lo que respondió el spike (hechos de Creator)
Se armó un brazo mínimo (hombro, codo, mano, dos segmentos), se exportó y se reprodujo con `lottie_light` 5.13.0.

| Pregunta | Respuesta |
|---|---|
| ¿Importar un SVG colapsa las piezas? | **No.** Cada `import_asset` da una capa raíz, pero es una precomp (`ty` 0) de una escena oculta (`file`, `file_1`…) con una capa de forma en (0,0). El marco 1000×1000 se conserva y las coordenadas del SVG valen tal cual |
| ¿`set_anchor_point` compensa la posición? | **Sí**, con el ancla en coordenadas del lienzo (ej. hombro `{x:560,y:300}`). La posición queda con una sola clave igual al ancla |
| ¿Las precomps exportan a 1000×1000? | **Con `group_layers`, sí. Con `create_scene_layer`, no** (500×500; el gate la rechaza) |
| ¿Los segmentos salen como markers? | **Sí:** `markers` con `cm` (nombre en texto), `tm` (inicio) y `dr` = fin − inicio. `wave` 0–74 → `dr` 74 |
| ¿Trae `ef`, `sid`, máscaras o mattes? | **No**, si no los usaste. Los easings sí salen (`o`/`i`) |
| ¿Trae una capa sólido? | **No** |
| ¿Colores y nombres? | Colores con 4 decimales (`0.0824` → 21 → `#151515`; el gate redondea a 8 bits y coincide). `cm` es texto. **Un nombre de marker repetido no lo detecta Creator**: evítalo al crear segmentos |

Señales raras que no fueron problema pero conviene conocer:
- Las capas de `group_layers` empiezan en posición (250,250), lo que sugiere un tamaño de capa de 500×500. El export final salió a 1000×1000: **el gate es el árbitro**, mira las `w`/`h` de cada capa `ty` 0 del JSON exportado, no las del asset.
- `read_scene` da bounds distorsionados en grupos anidados tras mover anclas. Usa `read_keyframes`.
- `read_keyframes` no devuelve easing. Es normal; se ve en el export.
- No uses lo que el gate rechaza: sombras, desenfoques y tintes (efectos `ef`), máscaras, mattes, slots (`sid`) y texto. Temas y máquinas de estado no se usaron ni se necesitan en un Lottie JSON.

## 5. Exportar (clics exactos de la sesión)
Hechos con la interfaz de octubre de 2026. Si cambia, guíate por los **nombres** de los botones, no por coordenadas.

1. Botón **Export** de la barra superior: abre el diálogo.
2. Elige **Save as new**: el export trabaja sobre una copia y no toca tu archivo.
3. Cambia el selector de animaciones a **vista de lista**. **Desmarca todas las escenas menos la tuya** (pruebas viejas, `Main Scene`). Pon el nombre del archivo (ej. `personaje-a`).
4. **Export → Workspace**: la animación sube al espacio de LottieFiles y se abre una vista previa. Mírala: si anima, el export está bien.
5. Elige el formato **Lottie JSON** estándar y pulsa **Download**.
6. El archivo cae en la carpeta de **Descargas** del navegador, con el nombre que diste o con un nombre aleatorio terminado en `.tmp`. Cópialo al repo.

Dónde está el archivo (WSL, con el navegador en Windows):
```
find /mnt/c/Users/<usuario>/Downloads -maxdepth 1 -type f -mmin -3 -printf '%TT %s %p\n' | sort | tail -3
```
En Linux o macOS, `~/Downloads`. En el spike el `.tmp` era el JSON: ábrelo para comprobarlo y renómbralo.

Después del export:
```
cp /mnt/c/Users/<usuario>/Downloads/personaje-a.json art/personaje-a.json
node SK/scripts/check-lottie.mjs art/personaje-a.json --roles roles.json --parts art/personaje-a/parts.json
node SK/scripts/render.mjs art/personaje-a.json --segment wave --at 0,18,36,60 --size 300 --out wave.png
```
- Mira el PNG (o la galería) antes de aprobar. El `render` pinta con el player real.
- Creator **no escribe `meta.repeats`** (cuántas pasadas repite cada marker). Pásalo a la fachada como prop `repeats`, o agrégalo al JSON:
  `node -e "const fs=require('fs'),f='art/personaje-a.json',j=JSON.parse(fs.readFileSync(f));j.meta={...j.meta,repeats:{idle:2,walk:3}};fs.writeFileSync(f,JSON.stringify(j))"`
- Si la piel y el pelo comparten color con otras piezas, sepáralos con `split-roles.mjs` **en cada export nuevo** (ver `06-ruta-codigo.md`).
- Si falla el peso: el personaje real (28 piezas, 7 markers) pesó 157 KB crudos y 26 KB comprimidos. El peso viene de la estructura, no de los decimales (ver `04-animacion.md`, presupuestos).

## 6. Dos fases: trabajo offline y trabajo en Creator
Creator es el cuello de botella (una pestaña). Todo lo que no necesita Creator se hace fuera, en paralelo:
- **Fuera de Creator (paralelo):** elegir donantes, dibujar piezas, `build-parts`, revisión de estilo contra el original, previsualizar poses.
- **En Creator (un agente, en secuencia):** importar, anclar, agrupar, animar, segmentar.
- **Pulido:** prueba la pose nueva en un previsualizador **antes** de tocar Creator y cambia solo las claves que hacen falta (lee las claves con `read_keyframes` primero y cambia lo mínimo). En este repo, `export-lottie` + `render` hacen de previsualizador sin Creator.
- **Verificador independiente, solo lectura:** otro agente que solo use `list_scenes`, `read_scene`, `read_keyframes`, `list_segments` y `switch_scene` (para mirar precomps y volver) confirma o refuta el informe del constructor. Termina con la escena del personaje activa.

## 7. Quién hace los clics
- **Con extensión de navegador para el agente:** el agente hace los clics del export en lotes (clic, espera, captura). Pide ubicar los controles por su descripción (por ejemplo "botón Export de la barra superior") y confirma con una captura antes de pulsar. Las coordenadas fijas son frágiles.
- **Sin extensión:** pídele al humano que exporte. Dile qué hacer, corto y sin jerga:
  > Abre Creator, entra en la escena `<nombre>`, pulsa **Export → Save as new**, deja marcada solo esa escena, elige **Lottie JSON** y descarga. Avísame cuando esté en Descargas.
- **Explica siempre qué es el "rig body".** Lo primero que se ve en Creator es un cuerpo de prueba (piezas simples para validar pivotes), **no el arte final**. El arte final se importa después. El humano lo confundió con el resultado una vez.

## 8. Errores reales
- **Trabajo perdido en modo invitado:** cerrar la pestaña borró el brazo del spike. Inicia sesión primero.
- **Monkey-patch de JS en la página:** colgó Creator. No lo hagas.
- **`create_scene_layer`:** el export salió a 500×500 y el player recortaba. Solo `group_layers`.
- **Mover anclas y mirar `read_scene`:** mostraba posiciones y bounds viejos, y parecía que algo se había movido. `read_keyframes` decía la verdad.
- **Pose de `thinking` con la mano sobre la boca:** se vio ya animada en Creator. El arreglo se probó primero en un previsualizador fuera de Creator y después se cambiaron solo esas claves.
