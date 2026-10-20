// segment-for.example.mjs: qué segmento de la ilustración corresponde a un cambio REAL del estado. Plantilla del skill: cópiala y cambia
// los nombres de estado y de paso por los de tu pantalla. Puras: sin timers ni avance simulado (el arte no inventa progreso).
// `prev` = el estado anterior que vio la pantalla (undefined en la primera carga). null = no hay nada que mostrar: un poll que trae lo mismo
// no mueve nada. La prueba de tabla va en scripts/segment-for.example.test.mjs.

/** @param {{status: string, step?: string, warnings: string[]} | undefined} prev
 *  @param {{status: string, step?: string, warnings: string[]} | undefined} s  @returns {string | null} */
export function segmentFor(prev, s) {
  if (!s) return null;
  if (s.status === 'failed') return prev?.status === 'failed' ? null : 'surprised'; // fallo -> sorpresa, una sola vez
  if (!prev) return null; // primera carga: no hay cambio que mostrar
  if (s.warnings.some((w) => !prev.warnings.includes(w))) return 'thinking'; // un aviso nuevo llega junto con el cambio de paso: se mira primero
  return s.step !== prev.step ? 'point' : null; // paso nuevo -> señalar
}

/** Objeto acompañante del paso en curso, con su ráfaga. Solo la pantalla decide cuándo pedirla (con un cambio real de paso); la primera
 *  carga o un poll igual lo dejan en reposo. null = sin paso en curso (en cola, fallido, terminado). Va fuera del flujo (absolute).
 *  @returns {{name: string, segment: string} | null} */
export function propFor(s) {
  if (s?.status !== 'running' || !s.step) return null;
  return s.step === 'last' ? { name: 'prop-chart', segment: 'grow' } : { name: 'prop-magnifier', segment: 'scan' };
}
