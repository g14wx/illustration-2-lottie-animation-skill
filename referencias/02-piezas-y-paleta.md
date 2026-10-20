# 02. Piezas y paleta

> `SK` = carpeta del skill (con `instalar.py`: `~/.claude/skills/animate-illustrations-with-lottie`). Los comandos `node SK/...` se corren **desde la carpeta del arte de tu proyecto** (donde vive `parts.json`), con `SK` delante.

Cómo pasar de un donante a piezas limpias, y cómo se decide el color para que cambiar la marca no obligue a tocar un Lottie.
Antes: `01-recepcion-del-pack.md` (donantes elegidos e índices). Después: `03-rig.md`.

## 1. Qué produce este paso
- `parts/<pieza>.svg`: un SVG por pieza, `viewBox="0 0 1000 1000"`, con **solo colores de autoría** (claves de `roles.json`).
- `roles.json`: `{ color de autoría: token CSS }`.
- Un `palette` en `parts.json`: `{ color del donante: color de autoría }`.

Cadena completa, de izquierda a derecha:

```
color del donante --palette (parts.json)--> color de autoría --roles.json--> token CSS --recolor() en el navegador--> valor actual
   #6a4a35                                    #5a3d2b                         --illus-hair                              (lo que diga tu CSS)
```

## 2. La paleta de autoría (`roles.json`)
Todo se dibuja con un puñado de colores **fijos**. Esos colores van dentro de cada Lottie. En el navegador, `recolor()` cambia
cada uno por el valor actual de su token. Cambiar la marca es cambiar un token en tu CSS: **nada se vuelve a exportar**. Se
probó en vivo: cuando llegó la paleta oficial de la marca, todo el arte cambió solo.

```json
{
  "#1b1b1f": "--illus-ink",      "#ffffff": "--illus-paper",    "#3366cc": "--illus-brand",
  "#e4e4e7": "--illus-gray-100", "#8d8d95": "--illus-gray-500", "#4a4a52": "--illus-gray-700",
  "#f0c8a0": "--illus-skin",     "#5a3d2b": "--illus-hair"
}
```
(es `fixtures/roles.json`; el de `plantillas/roles.ejemplo.json` trae lo mismo con un `_comment`)

- **6 a 8 roles.** Cada rol es una **función** (tinta, papel, marca, tres grises, piel, pelo), no un tono. No añadas un rol por cada
  color parecido del donante: se mapean todos al mismo (§5).
- Claves en minúscula `#rrggbb`. Valores `--nombre` de token. Nombres neutros (`--illus-*`): el skin no sabe cómo se llama tu marca.
- **La marca es un solo acento.** El objeto protagonista la lleva (la carta, la bombilla); el resto va en tinta, papel y grises.
  Repetirla en camisa y pantalón del mismo personaje la diluye.
- Sin gradientes. Sin sombras con color. Profundidad con una placa gris desplazada (`03-rig.md` §7).
- **Cómo repartir los colores del donante** (regla que sirvió en 5 escenas): piel → rol de piel; el azul del donante → marca;
  prendas principales y pelo oscuro → gris oscuro; secundarios (amarillos, verdes, zapatos) → gris medio; blanco → papel;
  negro `#000000` → tinta (también el aro de contorno).
  - **Salvedad de "blanco → papel":** en oscuro, `--illus-paper` pasa a un tono oscuro, y una prenda blanca mapeada a papel se ve **negra con contorno
    blanco**. Si la prenda debe seguir clara en oscuro, dale un rol propio en vez de papel.
- Dónde lo buscan los scripts: `--roles`, o `roles.json` junto al archivo, una carpeta arriba o en la carpeta actual.
- Fuera de `roles.json`: `check-lottie` rechaza el Lottie (`color #… not in roles.json`) y `build-parts` rechaza la paleta
  (`palette values not in roles.json`).

## 3. Las claves no se reescriben nunca
**El error real.** Un test del proyecto comprobaba que **cada clave de `roles.json` fuera el valor actual de su token** en el CSS.
Pasó mientras la paleta era provisional. Cuando llegó la paleta definitiva, el test se puso rojo. La tentación fue "arreglar"
`roles.json` con los colores nuevos. Era el test el que estaba mal.

**Por qué las claves son intocables.** Las claves son los colores que ya están **dentro de los Lottie exportados**. Si cambias
una clave: `check-lottie` rechaza todos los Lottie (color fuera de roles) y `recolor()` ya no encuentra su color, así que el arte
queda con el color de autoría sin teñir. Habría que volver a exportar todo.

**Arreglo.** El test ahora comprueba que cada clave **apunta a un token que existe y resuelve a un color**. Las claves siguen
como estaban. Un test mínimo (`node --test`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const roles = JSON.parse(readFileSync('roles.json', 'utf8'));
const css = readFileSync('tokens.css', 'utf8');
test('cada rol apunta a un token que existe', () => {
  for (const [hex, token] of Object.entries(roles).filter(([k]) => k.startsWith('#'))) {
    assert.match(hex, /^#[0-9a-f]{6}$/, hex);
    assert.match(css, new RegExp(`${token}\\s*:`), `${token} no está en tokens.css`);
  }
});
```

Un candado extra y barato: una prueba que exige que las claves originales **sigan estando** (no que valgan algo).
Y una regla de equipo: si alguien quiere "actualizar roles.json", la respuesta es "cambia el token".

## 4. `build-parts`, paso a paso
Desde la carpeta del arte de tu proyecto (con `SK` delante, como arriba):

1. **Colores del donante.**
   ```sh
   node SK/scripts/build-parts.mjs --colors <donante.svg>
   ```
   Una línea por color y cuántos elementos lo usan. `#000000` es el negro por defecto de los elementos sin relleno (la tinta).
2. **Elementos.**
   ```sh
   node SK/scripts/build-parts.mjs --list <donante.svg>      # índice, tag, relleno, bbox (en `path`, el largo de `d`)
   node SK/scripts/index-svg.mjs <donante.svg> --png index.png
   ```
3. **Escribe `parts.json`**: `donors` (ruta relativa a ese archivo), `palette` (donante → autoría) y `parts`
   (`{ name, donor, indices }`). Formato campo por campo: `plantillas/parts.schema.md` y `03-rig.md` §2.
4. **Construye.**
   ```sh
   node SK/scripts/build-parts.mjs <parts.json> --roles roles.json [--out carpeta]
   ```
   Escribe `<out>/<pieza>.svg` (por defecto `parts/` junto a `parts.json`) y dice `ok N parts → carpeta`.
   **Siempre antes de exportar, y no exportes si falla** (`build-parts … && export-lottie …`): `export-lottie` lee esa carpeta (`06-ruta-codigo.md` §2).
5. **Mira el conjunto**: exporta y renderiza (`03-rig.md` §13). Una pieza suelta casi nunca enseña el fallo.

Qué hace (para que sepas qué esperar):
- Cuenta `path, circle, ellipse, rect, polygon, polyline` en orden de documento, sin `<defs>` ni `<line>`.
- Pasa las clases `.cls-N` a atributos `fill`/`stroke` y mapea cada color por `palette`.
- Un relleno y su aro se piden juntos: `indices: [12, 13]`. Un ojo sin aro, `[22]`.
- Si la pieza del donante no encaja con el rig (otra escala, inclinada, de otro donante o espejada), `transform: { scale, rotate, mirror, dx, dy, about }`
  la ajusta al construir (`03-rig.md` §10). Solo en piezas con `donor` e `indices`; las figuras pasan a `<path>`.
- Una pieza con `svg` propio (dibujada en código) **no pasa por la validación de paleta**: sus colores solo los ve `check-lottie`
  después de exportar. Dibújala ya con colores de `roles.json`.

Errores que verás (todos paran con exit 1, nada cae al negro):
| Mensaje | Causa |
|---|---|
| `colors not in palette: #8b5b2c (head[2], head[3])` | un color del donante sin regla. Los lista **todos** de golpe y, entre paréntesis, dónde se usa (`pieza[índice del donante]`) |
| `palette values not in roles.json: #…` | mapeaste a un color que no es rol |
| `index N out of range (donor "x" has M elements)` | índice mal copiado o donante distinto |
| `class "cls-3" … has no rule in <style>` | selector que no es `.cls-N` ni lista con comas |
| `<g> with class/fill/stroke/style/transform is not supported` | el donante agrupa con estilos: límpialo |
| `style="" attribute is not supported` | estilos en línea |
| `warning: donor … has viewBox …, not "0 0 1000 1000"` | (aviso, no falla) reescala el donante |

Techo conocido: es una expresión regular sobre SVG de Illustrator (un elemento por etiqueta). Si el pack cambia de forma, el paso
siguiente es un parser XML.

## 5. Tolerancia de cuantización
Dos cosas distintas: colores casi iguales del donante, y el redondeo a 8 bits de Lottie.

**Colores casi iguales del donante.** Los packs usan tonos que se parecen pero no son idénticos (en el donante de prueba, dos
marrones de pelo: `#6a4a35` y `#6b4b36`). Sin regla, `build-parts` falla con `colors not in palette: #6b4b36`. Es lo correcto: te
obliga a decidir.
- Lo normal: añade la línea al `palette` (`"#6b4b36": "#5a3d2b"`), a mano.
- `--nearest`: acerca cada color sin regla al color de `roles.json` **más parecido** (distancia RGB al cuadrado) y avisa
  `snapped #6b4b36 -> #5a3d2b`. Necesita `--roles`.
  ```sh
  node SK/scripts/build-parts.mjs parts.json --roles roles.json --nearest
  ```
- **No tiene umbral.** Siempre elige uno, aunque sea absurdo: una piel naranja puede caer en la marca, un gris claro en papel.
  Úsalo una vez para descubrir, **lee la lista de `snapped`**, escribe los correctos en `palette` a mano y quita la bandera.

**Redondeo a 8 bits.** Lottie guarda el color como 0..1. Los scripts lo vuelven `#rrggbb` con `Math.round(v * 255)` (igual en
`check-lottie`, `recolor` y `split-roles`). Creator exporta con 4 decimales (`0.0824` → 21 → `#151515`), así que el ida y vuelta es
exacto. La tolerancia es **cero** en este nivel: un color está en `roles.json` o no está.
- Si algún otro exportador escribe 3 decimales (`0.08` → `#141414`), el color caerá fuera de roles. Mídelo con
  `check-lottie` antes de aceptar ese exportador.
- `export-lottie` escribe los colores con 4 decimales (`hex2c`).

## 6. Piel y pelo: roles propios desde el primer día
**Qué pasó.** Al principio, en el caso real, la piel era el gris claro compartido y el pelo era la tinta. Cuando se decidió dar
color de verdad a piel y pelo (dos tokens solo para ilustraciones), había que **separarlos sobre arte ya hecho y exportado**:
1. en `parts.json`, por nombre de pieza (cabeza, oreja, cuello, manos, tobillos, antebrazos desnudos, pelo);
2. en los Lottie ya exportados, con un script;
3. y **repetirlo en cada exportación nueva**.
Costó una tarea entera y un riesgo constante: teñir de marrón el contorno del pelo, o dejar un cuello gris.

**Regla.** Define `--illus-skin` y `--illus-hair` como roles desde el primer día, aunque al principio valgan un gris y la tinta.
Así decidir el color de la piel es cambiar un token.

- Caso general: la piel del donante tiene un color único → entrada en el `palette` general.
  ```json
  "palette": { "#f6c9a5": "#f0c8a0", "#6a4a35": "#5a3d2b", "#6b4b36": "#5a3d2b", "#000000": "#1b1b1f" }
  ```
- Caso mixto: el mismo color de donante es piel en una pieza y otra cosa en otra → `palette` **dentro de la pieza**, que pisa al
  general solo ahí:
  ```json
  { "name": "hand", "donor": "d", "indices": [30, 31], "palette": { "#e9e9ec": "#f0c8a0" } }
  ```
- **Qué es piel:** cabeza, oreja, cuello, manos, antebrazos desnudos, tobillos. **Qué no:** el pantalón gris, botones, camisas.
- **Solo el relleno.** El contorno sigue siendo tinta. En el pelo, el relleno es pelo y el aro es tinta.
- Rasgos de la cara (tinta) sobre la piel: mínimo **3:1**. En el caso real: 5,45:1 en claro y 3,82:1 en oscuro (tinta blanca).
- Se compararon 3 pares en el reparto antes de elegir: uno daba una piel terracota con el pelo casi negro, que se funde con la
  tinta; otro, una piel pálida de caricatura. Renderiza candidatos y mira; no decidas por el hex.

**Si el arte ya los comparte:** `split-roles.mjs`.
```sh
node SK/scripts/split-roles.mjs split.json --spec parts.json --parts-dir parts --lottie a.json,b.json --roles roles.json --dry
node SK/scripts/split-roles.mjs split.json --spec parts.json --parts-dir parts --lottie a.json,b.json --roles roles.json
```
```json
{ "splits": [ { "from": "#e4e4e7", "to": "#f0c8a0", "token": "--illus-skin", "parts": ["head", "neck"], "only": "fill" } ] }
```
- Exige `--spec` o `--lottie`. `--dry` solo cuenta los cambios.
- Cambia, para esas piezas por **nombre**: (1) `parts.json` (el `svg` propio y un `palette` de pieza para las de donante),
  (2) los `parts/*.svg`, (3) los Lottie, también dentro de sus precomps, (4) `roles.json` recibe `to → token`.
- **Reescribe los archivos en el sitio.** Haz commit antes.
- Límite: si relleno y aro de la pieza tienen el mismo color (un aro negro que también es relleno), `from` toca los dos. Da al
  relleno un color de donante propio en `palette` y no hace falta el script.
- Vuelve a correrlo sobre **cualquier exportación nueva hecha antes del cambio** (por ejemplo una de Creator con el arte viejo).
  Con la ruta de código, regenera con `export-lottie` y listo.

**Por qué el pelo de las escenas no se pudo separar.** El generador de escenas del caso real pintaba **por color del donante**,
con un solo `palette` por escena. La piel del donante tenía un color único en cada escena: se mapeó. El pelo no:
- compartía color con ropa y objetos (el mango de un martillo);
- variaba de persona a persona (marrón en una, rojo en otra);
- o era negro, el mismo `#000000` de la tinta.
Mapear ese color habría cambiado otras cosas o solo algunos pelos. Solo se separa **cortando el pelo en su propia pieza** (índices
propios y `palette` de pieza). No se hizo: quedó gris, documentado. Si un donante no deja separar la piel o el pelo, ya lo
anotaste en `01-recepcion-del-pack.md` §4.

**Límites que se aceptaron (decláralos tú también):**
- Un solo tono de piel para todo el elenco. El pack tenía varios (marrón, naranja, rojo): riesgo de diversidad. Un segundo token
  (`--illus-skin-2`) es una decisión aparte, y barata si la piel ya es un rol.
- En oscuro, el pelo sin contorno casi no se separa del fondo ni de la piel (1,84:1 y 1,88:1). Ninguna pantalla real pintaba
  arte oscuro, así que se aceptó.
- En oscuro, los brillos finos del pelo (trazos delgados en un gris frío) se leen como **alambres** sobre un pelo marrón. Aceptado; la
  alternativa es un brillo en el mismo rol del pelo.
- En oscuro, una prenda blanca mapeada a `--illus-paper` se ve negra con contorno blanco (ver la salvedad en §2). Aceptado o con rol propio.
- La piel cambia de tono entre temas (necesario para que los rasgos lleguen a 3:1).

## 7. Tokens por tema
Cada token tiene un valor por tema. El arte no sabe de temas: lee el valor del token.

```css
:root, .light { --illus-ink: #1b1b1f; --illus-paper: #ffffff; --illus-skin: #f0c8a0; /* … */ }
.dark         { --illus-ink: #ffffff; --illus-paper: #292929; --illus-skin: #…;      /* … */ }
```
- Ver otras paletas sin tocar el CSS ni re-exportar:
  ```sh
  node SK/scripts/recolor.mjs anim.json --vars paleta.json --roles roles.json --out anim-b.json   # { "--illus-ink": "#fff", … }
  node SK/scripts/render.mjs anim.json --frame 0 --map mapa.json --bg "#292929"                   # { "#1b1b1f": "#ffffff", … }
  ```
  `plantillas/paletas.ejemplo.json` trae tres paletas para la galería (`09-galeria-y-aprobacion.md`).
- **El modo oscuro no es "invertir".** La tinta pasa a blanco y la piel a un tono oscuro **para que los rasgos blancos lleguen a 3:1**.
  La paleta "Oscuro" de `plantillas/paletas.ejemplo.json` es un ejemplo para ver el mecanismo: tinta blanca sobre su piel da 4,31:1
  y la piel contra el fondo, 3,38:1. Mide tu paleta, no copies esa.
- Mide con la fórmula WCAG, no a ojo:
  ```js
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  ```
  Mínimos: rasgos sobre piel 3:1; texto vecino 4,5:1.
- La opción segura en una app con tema oscuro es no pintar el arte oscuro: el escenario es un subárbol `.light` sobre una tarjeta clara
  y la fachada lee los tokens del **contenedor**, no de `<html>`. Si no, el arte sale en negativo. Detalle y prueba: `08-web-runtime.md` §13.

## Lista de salida
- [ ] `roles.json` con 6 a 8 roles, **piel y pelo incluidos**; claves en minúscula; valores `--illus-*`.
- [ ] `palette` cubre todos los colores de cada donante usado (`--colors`); los `snapped` revisados y escritos a mano.
- [ ] `build-parts` termina en `ok N parts` sin avisos de `viewBox`.
- [ ] Test de roles que mira "el token existe", no "la clave vale el token".
- [ ] Contraste de rasgos sobre piel medido en cada tema que se muestre.
