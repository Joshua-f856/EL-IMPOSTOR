// =============================================================================
// efectos.js — Efectos visuales de fin de partida (sin librerías)
//
//   efectoFinPartida('civiles' | 'impostores' | 'srblanco')   -> elige el efecto según quién ganó
//   efectoVictoriaCivil()      confeti explosivo + brillo de pantalla/tarjeta + rebote elástico del título
//   efectoVictoriaImpostor()   sacudida fuerte + parpadeo rojo de daño en los bordes + desvanecimiento rápido
//   limpiarEfectos()           lo cancela todo al instante (se llama solo al salir de la pantalla de resultado)
//
// Reglas de diseño:
//   · Un efecto NUNCA puede romper la partida: todo va dentro de try/catch.
//   · Respeta "reducir movimiento" del sistema: sin confeti, sin sacudida, sin rebote; solo un brillo/tinte suave.
//   · Todo lo que crea (capas, canvas, clases, temporizadores) queda registrado y se retira solo.
//   · Los estilos están en style.css (sección «28. Efectos de fin de partida»).
// =============================================================================

const COLORES = ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#a78bfa', '#fb7185', '#fde047', '#ffffff'];
const MAX_PARTICULAS = 360;
const GRAVEDAD = 0.34;

const reg = { raf: 0, timers: new Set(), nodos: new Set(), clases: new Set(), onResize: null };

const porId = (id) => (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
const reducido = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
};
const segura = (fn) => (...a) => {
  try { return fn(...a); } catch (e) { console.warn('Efecto visual omitido:', e); }
};

// ---------------------------------------------------------------- registro y limpieza
function temporizar(fn, ms) {
  const t = setTimeout(() => {
    reg.timers.delete(t);
    try { fn(); } catch (e) { /* un efecto nunca debe romper nada */ }
  }, ms);
  reg.timers.add(t);
  return t;
}

function quitarNodo(n) {
  try { n.remove(); } catch (e) { /* ya no estaba */ }
  reg.nodos.delete(n);
}

// Capa a pantalla completa que se retira sola pasados `ms`
function capa(clase, ms) {
  const d = document.createElement('div');
  d.className = `fx-capa ${clase}`;
  d.setAttribute('aria-hidden', 'true');
  document.body.appendChild(d);
  reg.nodos.add(d);
  temporizar(() => quitarNodo(d), ms);
  return d;
}

// Añade una clase de animación (reiniciándola si ya estaba) y la quita al terminar
function conClase(el, clase, ms) {
  if (!el) return;
  el.classList.remove(clase);
  void el.offsetWidth; // fuerza el reflujo para poder repetir la animación
  el.classList.add(clase);
  const par = { el, clase };
  reg.clases.add(par);
  temporizar(() => { el.classList.remove(clase); reg.clases.delete(par); }, ms);
}

export function limpiarEfectos() {
  try {
    if (reg.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(reg.raf);
    reg.raf = 0;
    reg.timers.forEach((t) => clearTimeout(t));
    reg.timers.clear();
    reg.nodos.forEach((n) => { try { n.remove(); } catch (e) { /* nada */ } });
    reg.nodos.clear();
    reg.clases.forEach(({ el, clase }) => { try { el.classList.remove(clase); } catch (e) { /* nada */ } });
    reg.clases.clear();
    if (reg.onResize) { window.removeEventListener('resize', reg.onResize); reg.onResize = null; }
  } catch (e) { /* nada */ }
}

// ---------------------------------------------------------------- confeti explosivo (canvas)
function lanzarConfeti(titulo) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-confeti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  reg.nodos.add(canvas);
  const g = canvas.getContext && canvas.getContext('2d');
  if (!g) { quitarNodo(canvas); return; }

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  const medir = () => {
    W = window.innerWidth || 360;
    H = window.innerHeight || 640;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (g.setTransform) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  medir();
  reg.onResize = medir;
  window.addEventListener('resize', medir);

  const poca = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 4) <= 2; // móviles modestos
  const k = poca ? 0.55 : 1;
  const parts = [];
  let rafagasPendientes = 0;

  // Una ráfaga: n partículas desde (x,y), velocidades entre vMin y vMax, ángulos entre a0 y a1 (radianes)
  const rafaga = (x, y, n, vMin, vMax, a0, a1, vida = 3300) => {
    for (let i = 0; i < Math.round(n) && parts.length < MAX_PARTICULAS; i++) {
      const a = a0 + Math.random() * (a1 - a0);
      const v = vMin + Math.random() * (vMax - vMin);
      const w = 6 + Math.random() * 7;
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w, h: w * (0.45 + Math.random() * 0.7), forma: Math.random() < 0.28 ? 1 : 0,
        rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 0.4,
        fase: Math.random() * 6.283, vf: 0.12 + Math.random() * 0.2,
        color: COLORES[(Math.random() * COLORES.length) | 0], edad: 0, vida: vida + Math.random() * 700
      });
    }
  };
  const programar = (ms, fn) => {
    rafagasPendientes++;
    temporizar(() => { rafagasPendientes--; fn(); }, ms);
  };

  // 1) explosión desde el título   2) dos cañones laterales   3) segunda explosión más pequeña
  const r = titulo && titulo.getBoundingClientRect ? titulo.getBoundingClientRect() : null;
  const cx = r && r.width ? r.left + r.width / 2 : W / 2;
  const cy = r && r.height ? r.top + r.height / 2 : H * 0.35;
  rafaga(cx, cy, 130 * k, 7, 20, 0, Math.PI * 2);
  programar(260, () => {
    rafaga(-8, H * 0.92, 65 * k, 16, 30, -1.2, -0.75);          // cañón izquierdo (hacia arriba y a la derecha)
    rafaga(W + 8, H * 0.92, 65 * k, 16, 30, -2.4, -1.95);       // cañón derecho (hacia arriba y a la izquierda)
  });
  programar(900, () => rafaga(cx, cy, 75 * k, 6, 15, 0, Math.PI * 2, 2800));

  let ultimo = performance.now();
  const cuadro = () => {
    try {
      const ahora = performance.now();
      const dt = Math.min(48, Math.max(1, ahora - ultimo));
      ultimo = ahora;
      const f = dt / 16.67;
      g.clearRect(0, 0, W, H);
      const roce = Math.pow(0.985, f);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.edad += dt;
        if (p.edad >= p.vida || p.y > H + 40) { parts.splice(i, 1); continue; }
        p.vx *= roce;
        p.vy = p.vy * roce + GRAVEDAD * f;
        p.x += p.vx * f;
        p.y += p.vy * f;
        p.rot += p.vr * f;
        p.fase += p.vf * f;
        const resto = p.vida - p.edad;
        g.save();
        g.globalAlpha = resto < 700 ? Math.max(0, resto / 700) : 1;
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, Math.abs(Math.cos(p.fase)) * 0.9 + 0.1); // aleteo del papelito
        g.fillStyle = p.color;
        if (p.forma === 0) g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        else { g.beginPath(); g.arc(0, 0, p.w / 2, 0, 6.283); g.fill(); }
        g.restore();
      }
      if (parts.length || rafagasPendientes > 0) reg.raf = requestAnimationFrame(cuadro);
      else { reg.raf = 0; quitarNodo(canvas); if (reg.onResize) { window.removeEventListener('resize', reg.onResize); reg.onResize = null; } }
    } catch (e) {
      reg.raf = 0; quitarNodo(canvas); // si el navegador no soporta algo, se abandona el confeti sin ruido
    }
  };
  reg.raf = requestAnimationFrame(cuadro);
}

// ---------------------------------------------------------------- 🏆 victoria civil
export const efectoVictoriaCivil = segura(() => {
  limpiarEfectos();
  const suave = reducido();
  const tarjeta = porId('resultado');
  const titulo = porId('resultadoTitulo');
  const mensaje = porId('resultadoMensaje');

  capa('fx-velo-civil', 2800);                          // brillo dorado de pantalla
  if (tarjeta) conClase(tarjeta, 'fx-brillo-tarjeta', 3200); // halo de la tarjeta
  if (suave) return;                                    // "reducir movimiento": solo brillos suaves

  capa('fx-barrido', 1500);                             // barrido de luz diagonal
  conClase(titulo, 'fx-rebote-elastico', 1500);         // el título rebota como un resorte
  conClase(mensaje, 'fx-rebote-elastico-suave', 1500);  // y el detalle/puntaje lo sigue con retraso
  lanzarConfeti(titulo);
});

// ---------------------------------------------------------------- 😈 victoria impostor / Sr. Blanco
export const efectoVictoriaImpostor = segura(() => {
  limpiarEfectos();
  const suave = reducido();
  const tarjeta = porId('resultado');
  const titulo = porId('resultadoTitulo');
  const mensaje = porId('resultadoMensaje');
  const contenedor = (document.querySelector && document.querySelector('main.view-container')) || null;

  capa('fx-dano', suave ? 900 : 1500);                  // parpadeo rojo de daño en los bordes
  if (suave) return;                                    // sin sacudida ni desvanecimientos bruscos

  capa('fx-oscuro', 1000);                              // oscurecimiento que se desvanece rápido
  if (contenedor) conClase(contenedor, 'fx-shake-fuerte', 1000); // sacudida fuerte de toda la interfaz
  if (tarjeta) conClase(tarjeta, 'fx-brillo-peligro', 1700);
  conClase(titulo, 'fx-aparece-golpe', 800);            // el título "golpea" la pantalla
  conClase(mensaje, 'fx-aparece-suave', 1100);
});

// Atajo: elige el efecto según el ganador. Empate o ronda sin final => nada.
export function efectoFinPartida(ganador) {
  if (ganador === 'civiles') efectoVictoriaCivil();
  else if (ganador === 'impostores' || ganador === 'srblanco') efectoVictoriaImpostor();
}
