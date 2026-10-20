# parts.json: formato

Un solo archivo describe una ilustración (personaje, objeto, fondo o escena). Lo leen `build-parts.mjs`, `export-lottie.mjs`,
`check-lottie.mjs --parts` y `split-roles.mjs`. Un ejemplo completo y válido: `plantillas/parts.ejemplo.json`. Los campos que
empiezan con guion bajo (`_comment…`) los ignoran todos los scripts.

Coordenadas: todo vive en un lienzo de **1000 × 1000**. Ángulos en grados, **positivo = horario**. `y` positivo = hacia abajo.

## Campos de nivel superior
| Campo | Qué es | Quién lo usa |
|---|---|---|
| `donors` | `{ clave: "ruta/al/donante.svg" }`, relativa a este archivo. Vacío si todo se dibuja en código. | build-parts |
| `palette` | `{ "#color-del-donante": "#color-de-autoría" }`. Cada valor debe ser clave de `roles.json`. `"#000000"` = el negro por defecto del donante (la tinta). | build-parts |
| `parts` | Lista de piezas, **de abajo hacia arriba** (la primera va al fondo). Ver abajo. | build-parts, export-lottie |
| `joints` | `{ nombre: { x, y } }`: pivotes con nombre, en coordenadas del lienzo. | export-lottie |
| `rig` | Árbol de nodos. Ver abajo. | export-lottie |
| `limits` | Opcional. `{ "nodo.canal": [mín, máx] }` en valores relativos al reposo. Una clave fuera de rango hace fallar el lint. Para escalas sirve `nodo.s`. | export-lottie (lint) |
| `segments` | `{ nombre: { autoplay?, repeats? } }`. Cada uno será un marker del Lottie. | export-lottie, check-lottie |
| `plan` | Las claves de animación. Ver abajo. | export-lottie |
| `views` | Opcional. `{ segmento: [frames locales] }`: las poses que hay que mirar (`render.mjs <anim.json> --views parts.json` pinta el reposo y esos frames en una hoja). Los frames van de 0 a `dr`. | render, export-lottie (lint) |
| `precision` | Opcional. Decimales de las coordenadas del Lottie (3 por defecto; baja a 2 si el peso importa). | export-lottie |

## `parts[]`
Cada pieza es **o** `{ name, donor, indices }` (elementos de un donante) **o** `{ name, svg }` (dibujo propio). Además:
| Campo | Qué es |
|---|---|
| `name` | Único. Es el nombre de la capa del Lottie (y de `parts/<name>.svg`). **No puede repetir el nombre de un nodo del rig.** |
| `node` | Nodo del rig del que cuelga: la pieza se mueve, gira y escala con él. Sin `node`, queda fija. |
| `donor`, `indices` | Clave de `donors` y los índices de elemento (en orden de documento, sin `<line>` ni `<defs>`). Salen de `index-svg.mjs` o `build-parts.mjs --list`. Cada relleno va con su aro de contorno: el índice del aro es el siguiente. |
| `svg` | Dibujo propio: solo `path`, `circle`, `ellipse`, `rect`, `polygon`, `polyline`; colores `#rrggbb` que existan en `roles.json`; sin gradientes. Los arcos de `path` deben ser circulares. |
| `palette` | Opcional, solo en piezas de donante: pisa al `palette` general en esa pieza (piel y pelo con color propio). |
| `transform` | Opcional, solo en piezas de donante: ajusta el dibujo al rig al construir la pieza. `{ scale, rotate, mirror, dx, dy, about }`: primero el espejo (eje vertical por `about`), luego la escala, el giro en grados (+ = horario) alrededor de `about` y al final se suma `(dx, dy)`. `about` = `[x, y]`; sin él, el centro de la pieza. Las figuras pasan a `<path>` y el grosor del trazo se escala con la figura. Una clave desconocida es error. Ver `scripts/pathkit.mjs`. |
| `rest.o` | Opcional. Opacidad en reposo. Poner 0 en una pieza que solo aparece durante una animación: **ningún color se anima**; el cambio de color se hace superponiendo piezas y animando su opacidad. |
| `note` | Texto libre. |

## `rig`
`{ nodo: { joint, parent, at?, rot? } }`.
- `joint`: nombre de un pivote de `joints`. El nodo gira y escala alrededor de ese punto.
- `parent`: nombre de otro nodo, o `null` (raíz). Un hijo hereda todo el movimiento del padre (hombro → codo → muñeca).
- `at`: `{ x, y }`, dónde cae el pivote en reposo si no es el mismo punto de `joint` (rayos de una bombilla, que se abren en abanico).
- `rot`: giro estático de reposo en grados. Las claves del plan son relativas a él.

Un nodo se exporta como capa null con `parent`; una pieza, como capa de forma hija de su nodo. El resultado es una composición plana.

## `segments`
`{ idle: { autoplay: true, repeats: 2 }, wave: {} }`.
- `repeats`: entero ≥ 1. El Lottie guarda UN ciclo y el player lo repite. Se copia a `meta.repeats` del Lottie.
- `autoplay`: arranca solo al verse. Su duración × `repeats` debe ser ≤ 5 s (WCAG 2.2.2). check-lottie y el lint lo comprueban.
- Todo segmento declarado debe tener su entrada en `plan.keys`, y al revés.

## `plan`
```json
"plan": {
  "markers": { "idle": { "tm": 0, "dr": 60 } },
  "keys": {
    "idle": {
      "dr": 60,
      "offPoseStart": ["root"],
      "keys": {
        "chestGrp": { "sy": [[0, 1, "io"], [30, 1.02, "io"], [60, 1]] }
      }
    }
  }
}
```
El bloque no lleva comentarios: se copia tal cual dentro de un `parts.json` (JSON no admite `//`). Qué es cada campo:
- `markers`: opcional. Si falta, se calcula.
- `dr`: frames del segmento (30 fps).
- `offPoseStart`: opcional. Nodos que empiezan fuera de reposo por diseño (un fondo que "entra").
- Clave de animación: `[frame, valor, ease?]`. Los frames crecen de `0` a `dr`. El valor es **relativo al reposo**.
- Canales: `x`, `y` (px), `r` (grados), `s` (escala uniforme), `sx`, `sy` (escala por eje; `sx` y `sy` juntos deben tener las mismas claves de tiempo), `o` (opacidad 0..1). Reposo: 0 en `x y r`, 1 en `s sx sy o`.
- Objetivo de una clave: un nodo del rig o, solo para `o`, una pieza. Opacidad en más de un nodo de la misma cadena de una pieza es error.
- `ease` es la interpolación desde esa clave hasta la siguiente: `lin`, `io` (entra y sale suave), `i` (acelera), `o` (frena), `hold` (escalón), `cr` (Catmull-Rom por las claves).
- Que el final se **asiente**: el player termina un segmento en `dr - 1` y luego salta al reposo; `export-lottie` compara ese frame con el reposo (tolerancia: 2,5 px, 0,6° de giro, 5 % de opacidad). Una vuelta completa que llega al final a toda velocidad no pasa: déjale 3 o 4 frames quietos al final.
- Todo segmento **empieza y termina en reposo** (rotaciones módulo 360: una vuelta completa, 360, termina en reposo). `export-lottie` lo comprueba leyendo el JSON exportado.
- **Markers:** si falta `plan.markers`, el primero arranca en 0 y cada uno siguiente un frame después de que acabe el anterior. Ese frame de separación hace falta: `lottie_light`, al terminar un `playSegments([tm, tm + dr])`, cae en el primer frame del siguiente marker.
- Peso: máximo 450 frames en total y 200 KB (ajustable con `--max-kb`). El peso lo da la estructura (nº de piezas y de claves), no la animación.

## `split.json` (split-roles.mjs)
`{ "splits": [ { "from": "#e4e4e7", "to": "#f0c8a0", "token": "--illus-skin", "parts": ["head", "neck"], "only": "fill" } ] }`
Da a esas piezas un color de autoría propio y lo registra en `roles.json`. Mejor aún: define piel y pelo en `palette` desde el principio.

## Manifiesto de la galería (build-galeria.mjs)
Ver el encabezado de `plantillas/build-galeria.mjs`.
