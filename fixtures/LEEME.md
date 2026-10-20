# Fixtures

Todo lo de esta carpeta es **dibujo original sintético** del skill: ninguna pieza, ruta ni color viene de un pack de ilustraciones ni de
un cliente. Están hechos para que los scripts y las pruebas tengan con qué trabajar, con la misma estructura que un pack comercial:
estilos por clase `.cls-N` en un `<style>`, elementos `<line>` invisibles, y cada pieza como un relleno seguido de su aro de contorno
(un `path` negro con dos contornos y `fill-rule: evenodd`).

| Archivo | Qué es |
|---|---|
| `roles.json` | Paleta de autoría de ocho colores. Piel (`#f0c8a0`) y pelo (`#5a3d2b`) tienen rol propio desde el principio. Valores = tokens `--illus-*`. |
| `donors/persona.svg` | Persona plana de frente (26 elementos). |
| `donors/reloj.svg` | Reloj despertador (16 elementos). |
| `persona/parts.json` | 25 piezas, 17 nodos de rig, segmentos `idle` (2 pasadas, 4 s), `wave` (2,5 s) y `happy` (2 s). |
| `reloj/parts.json` | 8 piezas, 5 nodos, segmentos `idle` y `ring` (el minutero da una vuelta). |
| `check/` | `valid.json` + `parts.json`, y los `bad-*.json` que `check-lottie` debe rechazar (uno por regla). `parts-autoplay-largo.json` es un `parts.json` cuyo `idle` dura 5,9 s. |

## Índices del donante `persona.svg` (los que usa `persona/parts.json`)
Cada relleno va seguido de su aro. Con `node SK/scripts/index-svg.mjs SK/fixtures/donors/persona.svg --png indices.png` se ven sobre el dibujo.

| Índices | Pieza | | Índices | Pieza |
|---|---|---|---|---|
| 0-1 | pelo de atrás | | 14-17 | brazos del donante (no se usan) |
| 2-3 | cuello | | 18-19 | cabeza |
| 4-5 | torso | | 20-21 | flequillo |
| 6-9 | zapatos del donante (no se usan) | | 22, 23 | ojos (sin aro) |
| 10-13 | piernas del donante (no se usan) | | 24, 25 | boca neutra y sonrisa |

Brazos, piernas, manos y zapatos de `persona/parts.json` son cápsulas dibujadas en código (`ejemplos/extremidades.mjs` explica la técnica):
un miembro recortado del donante dejaría el borde del aro a la vista al girar.

`reloj.svg`: 0-1 campana izquierda, 2-3 campana derecha, 4-5 cuerpo, 6-7 esfera, 8-11 marcas de hora, 12 horario, 13 minutero, 14-15 eje.

## Regenerar
Los SVG y los `parts.json` salen de un generador que no se publica (son sintéticos y estables). Para otra ilustración de prueba, copia estos
archivos y cambia lo que necesites.
