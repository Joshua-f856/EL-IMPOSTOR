// ==========================================================================
// 🌐 online.js — Modo online (salas privadas y públicas)
//
// Flujo (el anfitrión es la única fuente de verdad de las transiciones):
//   esperando (sala LLENA -> cuenta de 5 s -> inicio automático, privada o pública)
//   -> jugando (cada uno ve su carta; N/N "Listo")
//   -> cuenta (3-2-1 sincronizado) -> debate (hablar / "listo para votar" 3/3)
//   -> votando (votos acumulados; cuando TODOS confirman se cuentan)
//   -> [adivinando (Sr. Blanco)] -> resultado -> cuenta -> debate ... -> finalizada
//
// Firestore:
//   salas/{codigo}                 estado, partida, ronda, rondaNum, config, resultado, autoInicioMs,
//                                  empiezaUid/empiezaNombre, debateFinMs, votacionFinMs...
//   salas/{codigo}/jugadores/{uid} nombre, vivo, listoPartida, listoVotarRonda, votoRonda,
//                                  pidioPalabraRonda, habloRonda, latidoEn, intentoPalabra
//   salasPublicas/activa           puntero a la sala pública que está esperando jugadores
//   salas/{codigo}/privado/{uid}   rol/palabra de ESE jugador (solo él y el anfitrión lo leen)
//   salas/{codigo}/secreto/ronda   palabra y roles reales (solo anfitrión)
//   salas/{codigo}/votos/{uid}     voto de la ronda (en "general" lo leen todos: tiempo real)
//   salas/{codigo}/chat/{id}       mensajes
// ==========================================================================
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  runTransaction,
  addDoc,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { crearSocial } from "./social.js";
import { crearMatrizQR } from "./qr.js";
import { efectoFinPartida } from "./efectos.js";

const CARACTERES_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones
const NOMBRES_MODO = { clasico: 'Clásico', misterio: 'Misterio', caos: 'Caos' };

const escapeHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Máximo de impostores según modo. Garantiza que los civiles empiecen siendo
// mayoría (si enemigos >= civiles, los impostores ganarían en el primer voto).
export function maxImpostoresPorModo(total, modo) {
  if (modo === 'misterio') return Math.max(1, Math.floor((total - 3) / 2));
  if (modo === 'caos') return Math.max(1, Math.min(Math.floor(total / 3), Math.floor((total - 3) / 2)));
  return Math.max(1, Math.floor((total - 1) / 2));
}

/**
 * Reparte roles con la MISMA lógica que el modo offline.
 * ids: lista de uids. Devuelve { impostores: [uid], srBlanco: [uid] }.
 * h = { seleccionarImpostoresSinRepetir, obtenerCandidatoSrBlanco, mezclarArray }
 */
export function repartirRoles(ids, cfg, h) {
  const total = ids.length;
  let impostores = [];
  let srBlanco = [];

  if (cfg.modo === 'misterio') {
    const numImp = Math.min(cfg.numImpostores, maxImpostoresPorModo(total, 'misterio'));
    impostores = h.seleccionarImpostoresSinRepetir(ids, numImp);
    const restantes = ids.filter((id) => !impostores.includes(id));
    if (restantes.length > 0) srBlanco = [h.obtenerCandidatoSrBlanco(restantes)];
  } else if (cfg.modo === 'caos') {
    const maxImp = maxImpostoresPorModo(total, 'caos');
    const numImp = Math.floor(Math.random() * maxImp) + 1;
    impostores = h.seleccionarImpostoresSinRepetir(ids, numImp);
    const restantes = ids.filter((id) => !impostores.includes(id));
    let numSr = (total >= 8 && Math.random() > 0.5) ? 2 : 1;
    numSr = Math.min(numSr, Math.max(1, numImp - 1));
    numSr = Math.min(numSr, Math.floor((total - 2 * numImp - 1) / 2)); // civiles > enemigos
    srBlanco = numSr > 0 ? h.mezclarArray(restantes).slice(0, numSr) : [];
  } else {
    const numImp = Math.min(cfg.numImpostores, maxImpostoresPorModo(total, 'clasico'));
    impostores = h.seleccionarImpostoresSinRepetir(ids, numImp);
  }
  return { impostores, srBlanco };
}

export function initOnline(deps) {
  const {
    app, db, $, estado, CONFIG_JUEGO, saveAll,
    cambiarPantalla, crearModal, confirmModal, reproducirSonido, vibrar,
    validarTextoCampo, normalizarNombre, mezclarArray,
    obtenerSiguienteCategoria, elegirPalabraDeCategoria,
    seleccionarImpostoresSinRepetir, obtenerCandidatoSrBlanco,
    verificarVictoriaSrBlanco: verificarSrDeps
  } = deps;

  // Si script.js no entrega la función, se usa una comparación básica (nunca debe romper la partida)
  const verificarVictoriaSrBlanco = typeof verificarSrDeps === 'function'
    ? verificarSrDeps
    : (a, b) => {
      const n = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
      return !!n(a) && n(a) === n(b);
    };

  const MS_CUENTA = 3200;        // 3-2-1 sincronizado
  const MS_RESULTADO = 9000;     // pausa en la pantalla de resultado
  const MS_ADIVINAR = 30000;     // tiempo del Sr. Blanco para adivinar
  const MS_LATIDO = 25000;       // latido de presencia / reloj del servidor
  const MS_DORMIDO = 75000;      // sin latido => se marca 💤
  const MS_VOTACION = 120000;    // tope de la votación: pasado ese tiempo se cuentan los votos recibidos
  const MS_AUTOINICIO = 5000;    // sala llena => cuenta de 5 s visible para todos y arranca sola
  const HOST_MUERTO_MS = 130000; // anfitrión sin latido => la sala pública se considera abandonada
  const LOTE = 9;                // escrituras por lote (las reglas limitan las lecturas por petición)

  // ------------------------------------------------------------------ estado
  const hooks = { activo: false, revelar: () => revelar(), siguiente: () => siguiente(), irAVotacion: () => irAVotarOnline() };
  window.__online = hooks; // script.js lo consulta en revelarPalabra() y siguienteJugador()
  window.__onlinePublica = () => unirsePartidaPublica();

  const auth = getAuth(app);
  let authPromesa = null;

  let sesion = null;            // { codigo, uid, nombre, esHost, publica }
  let salaActual = null;
  let jugadoresActuales = [];
  let votosActuales = [];
  let privadoActual = null;
  let unsubSala = null, unsubJugadores = null, unsubChat = null, unsubVotos = null, unsubCarta = null;
  let temporizadorCarta = null;
  let intervaloTick = null, intervaloLatido = null;
  let chatPanel = null;
  let pantallaOnline = null;
  let partidaMostrada = 0;      // partida cuya carta ya cargué
  let cartaRevelada = false;
  let rondaVista = 0;
  let seleccionVoto = null;
  let votoEnCurso = false;
  let votoLocalRonda = 0;
  let accionHost = null;
  let avisoPermisos = false;
  let offsetMs = 0;             // reloj del servidor - reloj local
  let latidoEnviadoLocal = 0;
  let ultimoNumeroCuenta = null;
  let autoBloqueadaClave = '';  // evita reintentar el inicio automático si falló con la misma sala
  let iniciandoPartida = false;
  let avisoRelojRonda = 0;
  let efectoFinClave = '';      // evita repetir el efecto de victoria en cada repintado
  let wakeLock = null;
  // --- reconexión
  let estadoRed = 'ok';                  // 'ok' | 'reconectando'
  let ultimoAckLatido = 0;               // último latido confirmado por el servidor
  let ocultoDesde = 0;
  let intervaloRecuperacion = null;
  let temporizadorReenganche = null;
  let reintentosListeners = 0;
  let sondeando = false;
  let avisoFalloMostrado = false;

  const ahora = () => Date.now() + offsetMs;
  const refSala = () => doc(db, 'salas', sesion.codigo);
  const refJugador = (uid) => doc(db, 'salas', sesion.codigo, 'jugadores', uid);

  // -------------------------------------------------------------------- auth
  function asegurarAuth() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (!authPromesa) {
      authPromesa = signInAnonymously(auth)
        .then((cred) => cred.user)
        .catch((err) => { authPromesa = null; throw err; });
    }
    return authPromesa;
  }
  // script.js espera esto en la pantalla de carga (con tope de tiempo)
  window.__onlineListo = asegurarAuth().then(() => true).catch((e) => {
    console.warn('Auth anónima no disponible todavía:', e.code || e);
    return false;
  });

  function modal(title, bodyHtml, okText = 'Entendido', onOk = null) {
    crearModal({ title, body: bodyHtml, okText, cancelText: '', onOk, onCancel: null });
  }

  function errorAuth(err) {
    reproducirSonido('error');
    if (err && (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation')) {
      modal('Falta activar el acceso anónimo',
        '<p>En la consola de Firebase ve a <strong>Authentication → Sign-in method</strong> y activa <strong>Anonymous</strong>.</p>');
    } else {
      modal('Sin conexión', '<p>No se pudo iniciar sesión en Firebase. Revisa tu internet e inténtalo de nuevo.</p>');
    }
  }

  function errorRed(err, accion) {
    console.error(`Error al ${accion}:`, err);
    reproducirSonido('error');
    const permisos = err && err.code === 'permission-denied';
    modal('Error de red',
      permisos
        ? '<p>Firestore rechazó la operación. ¿Ya publicaste las reglas de <code>firestore.rules</code> (Firebase Console → Firestore → Rules → Publicar)?</p>'
        : `<p>No se pudo ${escapeHtml(accion)}. Inténtalo de nuevo.</p>`);
  }

  // ---------------------------------------------------------------- utilidades
  function generarCodigo() {
    let c = '';
    for (let i = 0; i < 6; i++) c += CARACTERES_CODIGO.charAt(Math.floor(Math.random() * CARACTERES_CODIGO.length));
    return c;
  }

  // ------------------------------------------------------------------ apodo (localStorage)
  const CLAVE_APODO = 'impostor_apodo';
  const CLAVE_SESION = 'impostor_sesion_online';
  const APODO_DEFECTO = 'Jugador Anónimo';
  const MS_SESION_VALIDA = 3 * 60 * 60 * 1000; // una sesión guardada caduca a las 3 h

  function apodoGuardado() {
    try { return localStorage.getItem(CLAVE_APODO) || ''; } catch (e) { return ''; }
  }
  function guardarApodo(texto) {
    try {
      if (texto) localStorage.setItem(CLAVE_APODO, texto);
      else localStorage.removeItem(CLAVE_APODO);
    } catch (e) { /* modo privado / sin almacenamiento: se ignora */ }
  }

  // Apodo vacío => "Jugador Anónimo" (no se guarda el valor por defecto). Devuelve siempre un objeto.
  function resolverApodo(crudo) {
    const t = String(crudo || '').trim();
    if (!t) return { valido: true, texto: APODO_DEFECTO, anonimo: true };
    const val = validarTextoCampo(t, CONFIG_JUEGO.MAX_LONGITUD_NOMBRE);
    if (!val.valido) return { valido: false, motivo: val.motivo };
    return { valido: true, texto: val.texto, anonimo: false };
  }

  // Nombre libre dentro de una sala: los anónimos se numeran (Jugador Anónimo 2, 3...); un apodo escrito que
  // ya existe se rechaza (devuelve null).
  function nombreLibre(lista, uid, val) {
    const usados = lista.filter((j) => j.uid !== uid).map((j) => normalizarNombre(j.nombre));
    if (!usados.includes(normalizarNombre(val.texto))) return val.texto;
    if (!val.anonimo) return null;
    for (let n = 2; n <= 99; n++) {
      const c = `${APODO_DEFECTO} ${n}`;
      if (!usados.includes(normalizarNombre(c))) return c;
    }
    return `${APODO_DEFECTO} ${Math.floor(Math.random() * 900) + 100}`;
  }

  // Campo "Tu nombre" de la pantalla de sala: vacío => anónimo; lo escrito se recuerda
  function leerNombre() {
    const r = resolverApodo($('nombreJugadorOnline')?.value);
    if (!r.valido) {
      reproducirSonido('error');
      modal('Apodo no válido', `<p>${escapeHtml(r.motivo)}</p>`);
      return null;
    }
    guardarApodo(r.anonimo ? '' : r.texto);
    return r;
  }

  function minimoPorModo(modo) {
    if (modo === 'misterio') return CONFIG_JUEGO.MIN_JUGADORES_MISTERIO;
    if (modo === 'caos') return CONFIG_JUEGO.MIN_JUGADORES_CAOS;
    return CONFIG_JUEGO.MIN_JUGADORES;
  }

  // Pantallas donde el chat NO debe tapar nada (cartas secretas, espera y cuenta regresiva)
  const SIN_CHAT = new Set(['revelar', 'esperaOnline', 'cuentaRegresivaOnline']);
  function actualizarChatVisible() {
    if (chatPanel) chatPanel.classList.toggle('oculto', SIN_CHAT.has(pantallaOnline));
    social.visible(!SIN_CHAT.has(pantallaOnline));
  }

  function mostrarPantallaOnline(id) {
    if (pantallaOnline === id) return;
    pantallaOnline = id;
    cambiarPantalla(id);
    actualizarChatVisible();
  }

  // Cambia el HTML solo si realmente cambió (evita parpadeos y clics perdidos)
  function setHtml(el, html) {
    if (!el || el._h === html) return;
    el._h = html;
    el.innerHTML = html;
  }
  function setTxt(id, txt) { const el = $(id); if (el && el.textContent !== txt) el.textContent = txt; }
  function mostrarEl(id, visible) { const el = $(id); if (el) el.classList.toggle('oculto', !visible); }

  // Reduce la fuente hasta que el texto quepa en su contenedor (cualquier pantalla)
  function autoFit(el, min = 12) {
    if (!el) return;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    let n = 0;
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > min && n++ < 40) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }
  window.autoFitTexto = autoFit;

  const vivosDe = () => jugadoresActuales.filter((j) => j.vivo !== false);
  const yo = () => jugadoresActuales.find((j) => j.uid === sesion?.uid);
  const yoVivo = () => yo()?.vivo !== false;
  const nombreDe = (uid) => jugadoresActuales.find((j) => j.uid === uid)?.nombre || 'Jugador';
  const dormido = (j) => {
    const t = j.latidoEn && j.latidoEn.toMillis ? j.latidoEn.toMillis() : null;
    return t !== null && ahora() - t > MS_DORMIDO;
  };

  // Chat de voz P2P (WebRTC) + reacciones flotantes. Ver social.js
  const social = crearSocial({
    db,
    getSesion: () => sesion,
    getSala: () => salaActual,
    getJugadores: () => jugadoresActuales,
    modal, sonido: reproducirSonido, escapeHtml, dormido
  });
  const esGeneral = () => (salaActual?.config?.tipoVotacion || 'general') === 'general';

  function configDesdeEstado() {
    return {
      modo: estado.modoJuego || 'clasico',
      numImpostores: estado.numImpostores || 1,
      pistaImpostor: estado.pistaImpostor || 'si',
      categoriaImpostor: estado.categoriaImpostor || 'no',
      impostoresSeConocen: estado.impostoresSeConocen || 'no',
      duracionPartida: estado.duracionPartida || 3,
      tipoVotacion: estado.tipoVotacion || 'general',
      maxRondas: 0,
      maxJugadores: Math.max(3, Math.min(CONFIG_JUEGO.MAX_JUGADORES || 20, Number(estado.maxJugadores || 6)))
    };
  }

  function leerConfigPanel() {
    const base = (salaActual && salaActual.config) || configDesdeEstado();
    if (!$('onModo')) return base;
    return {
      modo: $('onModo').value || base.modo,
      numImpostores: Math.max(1, Number(base.numImpostores || 1)),
      pistaImpostor: $('onPista')?.value || base.pistaImpostor,
      categoriaImpostor: $('onCategoriaImp')?.value || base.categoriaImpostor,
      impostoresSeConocen: $('onAliados')?.value || base.impostoresSeConocen,
      duracionPartida: Math.max(1, Math.min(30, parseInt($('onDuracion')?.value) || base.duracionPartida)),
      tipoVotacion: $('onVotacion')?.value || base.tipoVotacion || 'general',
      maxRondas: Math.max(0, parseInt($('onRondas')?.value) || 0),
      maxJugadores: Math.max(
        jugadoresActuales.length,
        minimoPorModo($('onModo')?.value || base.modo),
        Math.min(CONFIG_JUEGO.MAX_JUGADORES || 20, parseInt($('onMaxJugadores')?.value) || base.maxJugadores || 3)
      )
    };
  }

  // ------------------------------------------------------------ crear / unirse
  const nuevoJugador = (uid, nombre) => ({
    uid, nombre, vivo: true, listoPartida: 0, listoVotarRonda: 0, votoRonda: 0,
    pidioPalabraRonda: 0, unidoEn: serverTimestamp()
  });

  async function crearSalaPrivadaOnline() {
    if (sesion) { modal('Ya estás en una sala', '<p>Sal de la sala actual antes de crear otra.</p>'); return; }
    const val = leerNombre();
    if (!val) return;
    reproducirSonido('click');

    let user;
    try { user = await asegurarAuth(); } catch (e) { return errorAuth(e); }

    try {
      let codigo = null;
      for (let i = 0; i < 8 && !codigo; i++) {
        const candidato = generarCodigo();
        const existe = await getDoc(doc(db, 'salas', candidato));
        if (!existe.exists()) codigo = candidato;
      }
      if (!codigo) throw new Error('No se pudo generar un código libre');

      const batch = writeBatch(db);
      batch.set(doc(db, 'salas', codigo), {
        codigo,
        tipoSala: 'privada',
        publica: false,
        hostUid: user.uid,
        anfitrion: val.texto,
        estado: 'esperando',
        partida: 0,
        ronda: 0,
        rondaNum: 0,
        jugadoresCount: 1,
        config: configDesdeEstado(),
        creadoEn: serverTimestamp(),
        expiraEn: Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000) // para una política TTL
      });
      batch.set(doc(db, 'salas', codigo, 'jugadores', user.uid), nuevoJugador(user.uid, val.texto));
      await batch.commit();
      iniciarSesion({ codigo, uid: user.uid, nombre: val.texto, esHost: true });
    } catch (e) {
      errorRed(e, 'crear la sala');
    }
  }

  const msTs = (t) => (t && t.toMillis ? t.toMillis() : 0);

  function nombreRepetido(lista, uid, nombre) {
    return lista.some((j) => j.uid !== uid && normalizarNombre(j.nombre) === normalizarNombre(nombre));
  }

  // Partidas públicas: la primera persona crea la sala y queda como anfitriona; las demás
  // entran a esa misma sala mientras esté esperando, tenga cupo y su anfitrión siga conectado.
  async function unirsePartidaPublica() {
    if (sesion) { modal('Ya estás en una partida', '<p>Sal de tu sala actual antes de buscar una partida pública.</p>'); return; }
    const val = leerNombre();
    if (!val) return;
    reproducirSonido('click');
    let user;
    try { user = await asegurarAuth(); } catch (e) { return errorAuth(e); }

    try {
      const colaRef = doc(db, 'salasPublicas', 'activa');
      const cfgNueva = configDesdeEstado();
      let nombreFinal = val.texto;

      // Pre-chequeo de nombre repetido (las transacciones no pueden consultar colecciones)
      const colaPre = await getDoc(colaRef);
      if (colaPre.exists() && colaPre.data().codigoSala) {
        const previa = (await getDocs(collection(db, 'salas', colaPre.data().codigoSala, 'jugadores'))).docs.map((d) => d.data());
        nombreFinal = nombreLibre(previa, user.uid, val);
        if (!nombreFinal) {
          reproducirSonido('error');
          modal('Nombre en uso', '<p>Ya hay un jugador con ese nombre en la partida pública. Elige otro.</p>');
          return;
        }
      }

      const resultado = await runTransaction(db, async (tx) => {
        // ---- 1) TODAS las lecturas primero
        const colaSnap = await tx.get(colaRef);
        let viva = null;
        if (colaSnap.exists() && colaSnap.data().codigoSala) {
          const cod = colaSnap.data().codigoSala;
          const salaRef = doc(db, 'salas', cod);
          const salaSnap = await tx.get(salaRef);
          if (salaSnap.exists()) {
            const d = salaSnap.data();
            const [miSnap, hostSnap] = await Promise.all([
              tx.get(doc(db, 'salas', cod, 'jugadores', user.uid)),
              tx.get(doc(db, 'salas', cod, 'jugadores', d.hostUid))
            ]);
            const hd = hostSnap.exists() ? hostSnap.data() : null;
            const t = hd ? (msTs(hd.latidoEn) || msTs(hd.unidoEn) || Date.now()) : 0;
            viva = {
              cod, salaRef, d,
              yaEstoy: miSnap.exists(),
              hostVivo: d.hostUid === user.uid || (!!hd && Date.now() - t < HOST_MUERTO_MS)
            };
          }
        }
        let nuevoCodigo = null;
        const puedeUnirse = viva && viva.d.estado === 'esperando' && viva.hostVivo;
        const cupo = puedeUnirse ? Math.max(3, Number(viva.d.config?.maxJugadores || 3)) : 0;
        const cantidad = puedeUnirse ? Number(viva.d.jugadoresCount || 0) : 0;
        const entra = puedeUnirse && (viva.yaEstoy || viva.d.hostUid === user.uid || cantidad < cupo);
        if (!entra) {
          for (let i = 0; i < 12 && !nuevoCodigo; i++) {
            const candidato = generarCodigo();
            const sn = await tx.get(doc(db, 'salas', candidato));
            if (!sn.exists()) nuevoCodigo = candidato;
          }
          if (!nuevoCodigo) throw new Error('No se pudo reservar una sala pública. Inténtalo de nuevo.');
        }

        // ---- 2) escrituras
        if (entra) {
          if (viva.yaEstoy || viva.d.hostUid === user.uid) return { codigo: viva.cod, esHost: viva.d.hostUid === user.uid };
          tx.set(doc(db, 'salas', viva.cod, 'jugadores', user.uid), nuevoJugador(user.uid, nombreFinal));
          tx.update(viva.salaRef, { jugadoresCount: cantidad + 1 });
          return { codigo: viva.cod, esHost: false };
        }
        tx.set(doc(db, 'salas', nuevoCodigo), {
          codigo: nuevoCodigo, tipoSala: 'publica', publica: true,
          hostUid: user.uid, anfitrion: nombreFinal, estado: 'esperando', partida: 0, ronda: 0, rondaNum: 0,
          jugadoresCount: 1, config: cfgNueva, creadoEn: serverTimestamp(),
          expiraEn: Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000)
        });
        tx.set(doc(db, 'salas', nuevoCodigo, 'jugadores', user.uid), nuevoJugador(user.uid, nombreFinal));
        tx.set(colaRef, { codigoSala: nuevoCodigo, hostUid: user.uid, actualizadoEn: serverTimestamp() });
        return { codigo: nuevoCodigo, esHost: true, creada: true };
      });

      iniciarSesion({ codigo: resultado.codigo, uid: user.uid, nombre: nombreFinal, esHost: resultado.esHost, publica: true });
      if (resultado.creada) modal('Partida pública creada', '<p>Eres el anfitrión. Configura la partida: cuando la sala se llene, la partida empieza sola para todos.</p>');
    } catch (e) { errorRed(e, 'buscar o crear una partida pública'); }
  }

  // Une al jugador a una sala por código. Devuelve { ok:true } o { error, extra }.
  async function intentarUnirseACodigo(codigo, val) {
    let user;
    try { user = await asegurarAuth(); } catch (e) { return { error: 'auth', extra: e }; }
    try {
      const salaRef = doc(db, 'salas', codigo);
      const previa = await getDoc(salaRef);
      if (!previa.exists()) return { error: 'noexiste' };
      const lista = (await getDocs(collection(db, 'salas', codigo, 'jugadores'))).docs.map((d) => d.data());
      const nombreFinal = nombreLibre(lista, user.uid, val);
      if (!nombreFinal) return { error: 'nombre' };

      const miRef = doc(db, 'salas', codigo, 'jugadores', user.uid);
      const r = await runTransaction(db, async (tx) => {
        const [salaSnap, miSnap] = await Promise.all([tx.get(salaRef), tx.get(miRef)]);
        if (!salaSnap.exists()) return { error: 'noexiste' };
        const d = salaSnap.data();
        if (d.estado === 'cerrada') return { error: 'cerrada' };
        // Reconexión: si ya eres parte de la sala puedes volver a entrar aunque la partida haya empezado
        if (miSnap.exists()) return { ok: true, d, nombre: miSnap.data().nombre };
        if (d.estado !== 'esperando') return { error: 'empezada' };
        const cupo = Math.max(3, Math.min(CONFIG_JUEGO.MAX_JUGADORES || 20, Number(d.config?.maxJugadores || 3)));
        const cantidad = Number(d.jugadoresCount || 0);
        if (cantidad >= cupo) return { error: 'llena', extra: cupo };
        tx.set(miRef, nuevoJugador(user.uid, nombreFinal));
        tx.update(salaRef, { jugadoresCount: cantidad + 1 });
        return { ok: true, d, nombre: nombreFinal };
      });
      if (r.error) return r;
      iniciarSesion({ codigo, uid: user.uid, nombre: r.nombre, esHost: r.d.hostUid === user.uid, publica: !!r.d.publica });
      return { ok: true };
    } catch (e) {
      return { error: 'red', extra: e };
    }
  }

  function mostrarErrorUnirse(r, codigo) {
    reproducirSonido('error');
    switch (r.error) {
      case 'auth': errorAuth(r.extra); break;
      case 'noexiste': modal('Sala no encontrada', `<p>La sala <strong>${escapeHtml(codigo)}</strong> no existe o ya terminó.</p>`); break;
      case 'nombre': modal('Nombre en uso', '<p>Ya hay un jugador con ese nombre en la sala. Elige otro.</p>'); break;
      case 'llena': modal('Sala llena', `<p>La sala ya tiene el máximo configurado de ${r.extra} jugadores.</p>`); break;
      case 'red': errorRed(r.extra, 'unirse a la sala'); break;
      default: modal('No se puede entrar', '<p>Esa partida ya empezó o la sala fue cerrada.</p>');
    }
  }

  async function unirseSalaPrivadaPorCodigo() {
    if (sesion) { modal('Ya estás en una sala', '<p>Sal de la sala actual antes de unirte a otra.</p>'); return; }
    const val = leerNombre();
    if (!val) return;
    const codigo = ($('codigoSalaInput')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (codigo.length !== 6) {
      reproducirSonido('error');
      modal('Código inválido', '<p>El código de la sala tiene 6 caracteres.</p>');
      return;
    }
    reproducirSonido('click');
    const r = await intentarUnirseACodigo(codigo, val);
    if (!r.ok) mostrarErrorUnirse(r, codigo);
  }

  // ------------------------------------------------- entrada por enlace / QR (pantalla de apodo)
  let entradaPendiente = '';

  function codigoDeEnlace() {
    try {
      const p = new URLSearchParams(location.search);
      let c = p.get('sala') || '';
      if (!c && location.hash) c = new URLSearchParams(location.hash.replace(/^#/, '')).get('sala') || '';
      c = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return c.length === 6 ? c : '';
    } catch (e) { return ''; }
  }

  function limpiarEnlaceDeLaURL() {
    try {
      const u = new URL(location.href);
      u.searchParams.delete('sala');
      if (/(^|[#&])sala=/.test(u.hash)) u.hash = '';
      history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
    } catch (e) { /* nada */ }
  }

  function mostrarPantallaApodo(codigo) {
    entradaPendiente = codigo;
    setTxt('apodoSalaCodigo', codigo);
    const input = $('apodoInput');
    if (input) input.value = apodoGuardado();
    setTxt('apodoError', '');
    mostrarEl('apodoError', false);
    const btn = $('btnEntrarApodo');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Entrar a la sala'; }
    cambiarPantalla('apodoOnline');
    pantallaOnline = null;
    setTimeout(() => { try { if (input) input.focus(); } catch (e) { /* nada */ } }, 150);
  }

  function errorApodo(texto) {
    reproducirSonido('error');
    setTxt('apodoError', texto);
    mostrarEl('apodoError', true);
    const btn = $('btnEntrarApodo');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Entrar a la sala'; }
  }

  async function entrarConApodo() {
    if (!entradaPendiente || sesion) return;
    const codigo = entradaPendiente;
    const val = resolverApodo($('apodoInput')?.value);
    if (!val.valido) { errorApodo(val.motivo); return; }
    guardarApodo(val.anonimo ? '' : val.texto);
    reproducirSonido('click');
    const btn = $('btnEntrarApodo');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    mostrarEl('apodoError', false);

    const r = await intentarUnirseACodigo(codigo, val);
    if (r.ok) { entradaPendiente = ''; limpiarEnlaceDeLaURL(); return; }
    if (r.error === 'nombre') { errorApodo('Ese apodo ya está en uso en la sala. Prueba con otro.'); return; }
    entradaPendiente = '';
    limpiarEnlaceDeLaURL();
    cambiarPantalla('salaOnline');
    mostrarErrorUnirse(r, codigo);
  }

  function cancelarApodo() {
    entradaPendiente = '';
    limpiarEnlaceDeLaURL();
    reproducirSonido('click');
    cambiarPantalla('seleccionModoJuego');
  }

  // Compartir: enlace con ?sala=CODIGO y QR del mismo enlace
  function enlaceDeSala() {
    if (!sesion || sesion.publica) return '';
    const base = location.href.split('#')[0].split('?')[0];
    return `${base}?sala=${sesion.codigo}`;
  }

  function avisoSinHttp() {
    if (location.protocol !== 'file:') return false;
    modal('Publica el juego primero', '<p>Abriste el juego como archivo local (<code>file://</code>), así que el enlace no funcionaría en otros dispositivos. Publícalo (GitHub Pages, Firebase Hosting…) o usa un servidor local.</p>');
    return true;
  }

  async function compartirEnlaceSala() {
    const url = enlaceDeSala();
    if (!url || avisoSinHttp()) return;
    reproducirSonido('click');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'El Impostor', text: `Únete a mi sala ${sesion.codigo}`, url });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const mostrar = () => modal('Enlace de la sala', `<p style="overflow-wrap:anywhere;"><strong>${escapeHtml(url)}</strong></p>`);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        const b = $('btnCompartirEnlace');
        if (b) { b.textContent = '✅ Enlace copiado'; setTimeout(() => { b.textContent = '🔗 Compartir enlace'; }, 1800); }
      }).catch(mostrar);
    } else mostrar();
  }

  function mostrarQRSala() {
    const url = enlaceDeSala();
    if (!url || avisoSinHttp()) return;
    reproducirSonido('click');
    try {
      const { size, modulos } = crearMatrizQR(url, 'M');
      const px = 8, margen = 4, total = (size + margen * 2) * px;
      const canvas = document.createElement('canvas');
      canvas.width = total; canvas.height = total;
      const g = canvas.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, total, total);
      g.fillStyle = '#000000';
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modulos[y][x]) g.fillRect((x + margen) * px, (y + margen) * px, px, px);
      modal('📷 Escanea para unirte',
        `<div style="text-align:center;"><img alt="Código QR de la sala ${escapeHtml(sesion.codigo)}" src="${canvas.toDataURL('image/png')}" style="width:min(100%,280px);height:auto;image-rendering:pixelated;background:#fff;border-radius:8px;"><p style="margin:10px 0 0;">Sala <strong>${escapeHtml(sesion.codigo)}</strong></p></div>`);
    } catch (e) {
      console.error('No se pudo generar el QR:', e);
      modal('No se pudo generar el QR', '<p>Usa el botón «Compartir enlace» o el código de la sala.</p>');
    }
  }

  // ------------------------------------------------------------------- sesión
  function iniciarSesion(s) {
    sesion = s;
    hooks.activo = true;
    salaActual = null;
    jugadoresActuales = [];
    votosActuales = [];
    partidaMostrada = 0;
    rondaVista = 0;
    privadoActual = null;
    pantallaOnline = null;
    seleccionVoto = null;
    votoLocalRonda = 0;
    accionHost = null;
    autoBloqueadaClave = '';
    iniciandoPartida = false;
    estadoRed = 'ok';
    ultimoAckLatido = Date.now();
    reintentosListeners = 0;
    avisoFalloMostrado = false;
    guardarSesion(s);

    if ($('lobbyCodigo')) $('lobbyCodigo').textContent = s.publica ? 'PARTIDA PÚBLICA' : s.codigo;
    const codigoWrap = $('lobbyCodigo')?.closest('div');
    if (codigoWrap) codigoWrap.classList.toggle('oculto', !!s.publica);
    const tituloLobby = $('lobby')?.querySelector('h2');
    if (tituloLobby) tituloLobby.textContent = s.publica ? '🌍 PARTIDA PÚBLICA' : '🔒 TU SALA';
    ensureChatPanel();
    escucharChat();
    configurarPanelHost();
    mostrarPantallaOnline('lobby');
    escucharSala();
    escucharJugadores();
    intervaloTick = setInterval(tick, 250);
    latir();
    intervaloLatido = setInterval(latir, MS_LATIDO);
    social.iniciar();
    social.visible(!SIN_CHAT.has(pantallaOnline));
    document.addEventListener('visibilitychange', alVolverVisible);
    window.addEventListener('offline', alPerderRed);
    window.addEventListener('online', alVolverRed);
    pedirWakeLock();
  }

  // Al volver a la pestaña: latido inmediato y re-evaluar (los navegadores frenan los temporizadores en segundo plano)
  function alVolverVisible() {
    if (!sesion) return;
    if (document.hidden) { ocultoDesde = Date.now(); return; }
    const estuvoOculto = ocultoDesde ? Date.now() - ocultoDesde : 0;
    ocultoDesde = 0;
    ultimoAckLatido = Date.now(); // el navegador pausó los temporizadores: no es una caída de red
    latir();
    pedirWakeLock();
    // Tras mucho rato en segundo plano los sockets suelen quedar muertos: se vuelven a abrir los listeners
    if (estuvoOculto > 20000) reenganchar();
    sondearConexion();
    tick();
  }

  // ------------------------------------------------------------------ red: detectar y recuperar
  function avisoRed(texto, tipo) {
    setTxt('avisoRedOnline', texto);
    const el = $('avisoRedOnline');
    if (el) el.dataset.tipo = tipo || 'info';
    mostrarEl('avisoRedOnline', !!texto);
  }
  function ocultarAvisoRed() { avisoRed('', 'info'); }

  function marcarReconectando() {
    if (!sesion || estadoRed === 'reconectando') return;
    estadoRed = 'reconectando';
    avisoRed('📡 Sin conexión. Reconectando… tu partida se conserva.', 'alerta');
    if (!intervaloRecuperacion) intervaloRecuperacion = setInterval(sondearConexion, 4000);
  }

  // La conexión volvió: se reabren los listeners y se envía un latido. El estado de la partida vive en
  // Firestore (y las escrituras pendientes se envían solas), por eso no se pierde nada.
  function alRecuperarConexion() {
    if (!sesion || estadoRed === 'ok') return;
    estadoRed = 'ok';
    reintentosListeners = 0;
    avisoFalloMostrado = false;
    if (intervaloRecuperacion) { clearInterval(intervaloRecuperacion); intervaloRecuperacion = null; }
    reenganchar();
    avisoRed('✅ Reconectado', 'ok');
    setTimeout(() => { if (estadoRed === 'ok') ocultarAvisoRed(); }, 2200);
  }

  async function sondearConexion() {
    if (!sesion || sondeando) return;
    sondeando = true;
    try {
      await getDocFromServer(refSala());
      alRecuperarConexion();
    } catch (e) {
      const sinRed = !e || !e.code || e.code === 'unavailable' || e.code === 'deadline-exceeded';
      if (sinRed) marcarReconectando();
      else alRecuperarConexion(); // otro error (p. ej. permisos) = el servidor sí respondió
    } finally {
      sondeando = false;
    }
  }

  function alPerderRed() { marcarReconectando(); }
  function alVolverRed() { if (sesion) sondearConexion(); }

  // Vuelve a abrir (sin tocar el estado local) todo lo que escucha a Firestore
  function reenganchar() {
    if (!sesion) return;
    if (temporizadorReenganche) { clearTimeout(temporizadorReenganche); temporizadorReenganche = null; }
    if (unsubSala) { unsubSala(); unsubSala = null; }
    if (unsubJugadores) { unsubJugadores(); unsubJugadores = null; }
    if (unsubVotos) { unsubVotos(); unsubVotos = null; }
    if (unsubChat) { unsubChat(); unsubChat = null; }
    accionHost = null;
    escucharSala();
    escucharJugadores();
    escucharChat();
    if (salaActual) ajustarListenerVotos();
    if (salaActual?.estado === 'jugando' && !privadoActual) partidaMostrada = 0; // vuelve a pedir la carta
    latir();
    social.reenganchar();
    social.jugadores();
  }

  // Un listener terminó con error: se reintenta con espera creciente (1,5 s, 3 s, 6 s...) sin molestar al jugador
  function alErrorListener(nombre, err) {
    console.warn(`Listener "${nombre}" interrumpido:`, err && (err.code || err));
    if (!sesion || temporizadorReenganche) return;
    if (err && err.code === 'permission-denied') {
      if (!avisoPermisos) { avisoPermisos = true; errorRed(err, 'leer los datos de la sala'); }
      return;
    }
    marcarReconectando();
    if (reintentosListeners >= 6) {
      if (!avisoFalloMostrado) {
        avisoFalloMostrado = true;
        reproducirSonido('error');
        modal('No se pudo reconectar', '<p>Sigue sin haber conexión estable con la sala. Comprueba tu internet y pulsa «Reintentar». Tu partida no se ha perdido.</p>',
          'Reintentar', () => { reintentosListeners = 0; avisoFalloMostrado = false; reenganchar(); });
      }
      return;
    }
    const espera = Math.min(15000, 1500 * (2 ** reintentosListeners++));
    temporizadorReenganche = setTimeout(() => { temporizadorReenganche = null; reenganchar(); }, espera);
  }

  // ------------------------------------------------------------------ sesión guardada (reanudar tras recargar)
  function guardarSesion(s) {
    try {
      localStorage.setItem(CLAVE_SESION, JSON.stringify({
        codigo: s.codigo, uid: s.uid, nombre: s.nombre, esHost: !!s.esHost, publica: !!s.publica, t: Date.now()
      }));
    } catch (e) { /* sin almacenamiento */ }
  }
  function borrarSesionGuardada() { try { localStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ } }
  function leerSesionGuardada() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
      if (!g || !g.codigo || !g.uid || Date.now() - (g.t || 0) > MS_SESION_VALIDA) { borrarSesionGuardada(); return null; }
      return g;
    } catch (e) { return null; }
  }

  async function reanudarSesion(g) {
    avisoRed('🔄 Reconectando a tu partida…', 'info');
    for (let intento = 0; intento < 3; intento++) {
      try {
        const user = await asegurarAuth();
        if (user.uid !== g.uid) { borrarSesionGuardada(); ocultarAvisoRed(); return false; }
        const [salaSnap, miSnap] = await Promise.all([
          getDoc(doc(db, 'salas', g.codigo)),
          getDoc(doc(db, 'salas', g.codigo, 'jugadores', g.uid))
        ]);
        if (!salaSnap.exists() || salaSnap.data().estado === 'cerrada' || !miSnap.exists()) {
          borrarSesionGuardada(); ocultarAvisoRed(); return false; // la sala ya no existe
        }
        iniciarSesion({ codigo: g.codigo, uid: g.uid, nombre: miSnap.data().nombre, esHost: salaSnap.data().hostUid === g.uid, publica: !!salaSnap.data().publica });
        avisoRed('✅ Volviste a tu partida', 'ok');
        setTimeout(() => { if (estadoRed === 'ok') ocultarAvisoRed(); }, 2200);
        return true;
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1500 * (intento + 1)));
      }
    }
    ocultarAvisoRed(); // sin red: se muestra el menú, la sesión guardada se conserva para el próximo intento
    return false;
  }

  // Lo llama script.js al terminar la pantalla de carga. Devuelve true si ya llevó al jugador a otra pantalla.
  async function arranqueOnline() {
    const enlace = codigoDeEnlace();
    const g = leerSesionGuardada();
    if (enlace && !(g && g.codigo === enlace)) { mostrarPantallaApodo(enlace); return true; }
    if (!g) return false;
    if (enlace) limpiarEnlaceDeLaURL();
    return reanudarSesion(g);
  }
  async function pedirWakeLock() {
    try {
      if (!('wakeLock' in navigator) || wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function soltarWakeLock() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* nada */ }
    wakeLock = null;
  }

  function detenerListeners() {
    if (unsubSala) { unsubSala(); unsubSala = null; }
    if (unsubJugadores) { unsubJugadores(); unsubJugadores = null; }
    if (unsubChat) { unsubChat(); unsubChat = null; }
    if (unsubVotos) { unsubVotos(); unsubVotos = null; }
    social.detener();
    if (unsubCarta) { unsubCarta(); unsubCarta = null; }
    if (temporizadorCarta) { clearTimeout(temporizadorCarta); temporizadorCarta = null; }
    if (intervaloTick) { clearInterval(intervaloTick); intervaloTick = null; }
    if (intervaloLatido) { clearInterval(intervaloLatido); intervaloLatido = null; }
    if (chatPanel) { chatPanel.remove(); chatPanel = null; }
    document.removeEventListener('visibilitychange', alVolverVisible);
    window.removeEventListener('offline', alPerderRed);
    window.removeEventListener('online', alVolverRed);
    if (intervaloRecuperacion) { clearInterval(intervaloRecuperacion); intervaloRecuperacion = null; }
    if (temporizadorReenganche) { clearTimeout(temporizadorReenganche); temporizadorReenganche = null; }
    estadoRed = 'ok';
    ocultarAvisoRed();
    soltarWakeLock();
    mostrarEl('avisoConexionOnline', false);
  }

  function limpiarSesionLocal() {
    detenerListeners();
    borrarSesionGuardada();
    sesion = null;
    salaActual = null;
    jugadoresActuales = [];
    votosActuales = [];
    privadoActual = null;
    partidaMostrada = 0;
    cartaRevelada = false;
    pantallaOnline = null;
    hooks.activo = false;
    const btn = $('btnSiguiente');
    if (btn) btn.textContent = 'Siguiente Jugador'; // lo usa el modo offline
  }

  function cerrarPorSala(mensaje) {
    limpiarSesionLocal();
    cambiarPantalla('salaOnline');
    modal('Sala cerrada', `<p>${escapeHtml(mensaje)}</p>`);
  }

  async function abandonarSala() {
    const s = sesion;
    if (!s) return;
    const estadoAntesDeSalir = salaActual?.estado;
    let eliminado = false;
    limpiarSesionLocal();
    try {
      if (s.esHost) await updateDoc(doc(db, 'salas', s.codigo), { estado: 'cerrada' });
      else if (estadoAntesDeSalir === 'esperando') {
        eliminado = await runTransaction(db, async (tx) => {
          const roomRef = doc(db, 'salas', s.codigo);
          const playerRef = doc(db, 'salas', s.codigo, 'jugadores', s.uid);
          const [room, mio] = await Promise.all([tx.get(roomRef), tx.get(playerRef)]);
          if (room.exists() && room.data().estado === 'esperando' && mio.exists()) {
            const cnt = Number(room.data().jugadoresCount || 1);
            if (cnt > 1) tx.update(roomRef, { jugadoresCount: cnt - 1 });
            tx.delete(playerRef);
            return true;
          }
          return false;
        });
      }
      if (!eliminado) await deleteDoc(doc(db, 'salas', s.codigo, 'jugadores', s.uid));
    } catch (e) {
      console.warn('No se pudo limpiar la sala al salir:', e);
    }
  }

  function salirDeSalaOnline() {
    if (!sesion) { cambiarPantalla('salaOnline'); return; }
    const aviso = sesion.esHost
      ? '¿Salir? Como eres el anfitrión, la sala se cerrará para todos.'
      : '¿Salir de la sala?';
    confirmModal(aviso, async (ok) => {
      if (!ok) return;
      await abandonarSala();
      cambiarPantalla('salaOnline');
    });
  }

  // Latido: presencia (💤) y sincronización con el reloj del servidor
  function latir() {
    if (!sesion) return;
    latidoEnviadoLocal = Date.now();
    updateDoc(refJugador(sesion.uid), { latidoEn: serverTimestamp() })
      .then(() => {
        ultimoAckLatido = Date.now();
        if (sesion) guardarSesion(sesion); // mantiene viva la sesión guardada mientras juegas
        if (estadoRed !== 'ok') alRecuperarConexion();
      })
      .catch(() => { latidoEnviadoLocal = 0; });
  }

  // ---------------------------------------------------------------- listeners
  function escucharSala() {
    unsubSala = onSnapshot(doc(db, 'salas', sesion.codigo), (snap) => {
      if (!sesion) return;
      if (!snap.exists()) { cerrarPorSala('La sala ya no existe.'); return; }
      const sala = snap.data();
      const primeraLectura = !salaActual;
      salaActual = sala;
      if (sala.estado === 'cerrada') {
        if (!sesion.esHost) cerrarPorSala('El anfitrión cerró la sala.');
        return;
      }
      if (primeraLectura && sala.estado === 'esperando' && sesion.esHost) configurarPanelHost();
      ajustarListenerVotos();
      render();
    }, (err) => alErrorListener('sala', err));
  }

  function escucharJugadores() {
    unsubJugadores = onSnapshot(collection(db, 'salas', sesion.codigo, 'jugadores'), (snap) => {
      if (!sesion) return;
      const msDe = (j) => (j.unidoEn && j.unidoEn.toMillis ? j.unidoEn.toMillis() : Number.MAX_SAFE_INTEGER);
      jugadoresActuales = snap.docs.map((d) => ({ ...d.data(), _pend: d.metadata.hasPendingWrites }))
        .sort((a, b) => msDe(a) - msDe(b));
      // sincroniza el reloj con el servidor usando mi propio latido confirmado
      const mio = jugadoresActuales.find((j) => j.uid === sesion.uid);
      if (mio && !mio._pend && mio.latidoEn && mio.latidoEn.toMillis && latidoEnviadoLocal) {
        offsetMs = mio.latidoEn.toMillis() - (latidoEnviadoLocal + Date.now()) / 2;
        latidoEnviadoLocal = 0;
      }
      pintarLobby();
      social.jugadores();
      render();
    }, (err) => alErrorListener('jugadores', err));
  }

  // Los votos en vivo solo los puede leer el anfitrión, o todos si la votación es "general".
  function ajustarListenerVotos() {
    if (!sesion || !salaActual) return;
    const necesario = sesion.esHost || esGeneral();
    if (necesario && !unsubVotos) {
      unsubVotos = onSnapshot(collection(db, 'salas', sesion.codigo, 'votos'), (snap) => {
        votosActuales = snap.docs.map((d) => d.data());
        render();
      }, (err) => { unsubVotos = null; alErrorListener('votos', err); });
    } else if (!necesario && unsubVotos) {
      unsubVotos(); unsubVotos = null; votosActuales = [];
    }
  }

  const votosValidos = () => {
    if (!salaActual) return [];
    const ids = new Set(vivosDe().map((j) => j.uid));
    return votosActuales.filter((v) => v.ronda === salaActual.ronda && ids.has(v.uid) && ids.has(v.targetUid));
  };

  // -------------------------------------------------------------------- lobby
  function configurarPanelHost() {
    const panel = $('lobbyConfigHost');
    if (!panel) return;
    panel.classList.toggle('oculto', !sesion.esHost);
    if (!sesion.esHost) return;

    const c = (salaActual && salaActual.config) || configDesdeEstado();
    if ($('onModo')) $('onModo').value = c.modo;
    if ($('onPista')) $('onPista').value = c.pistaImpostor;
    if ($('onCategoriaImp')) $('onCategoriaImp').value = c.categoriaImpostor;
    if ($('onAliados')) $('onAliados').value = c.impostoresSeConocen;
    if ($('onDuracion')) $('onDuracion').value = c.duracionPartida;
    if ($('onVotacion')) $('onVotacion').value = c.tipoVotacion || 'general';
    if ($('onRondas')) $('onRondas').value = String(c.maxRondas || 0);
    if ($('onMaxJugadores')) $('onMaxJugadores').value = c.maxJugadores || 3;
    pintarCategoriasPanel();
  }

  function pintarCategoriasPanel() {
    const cont = $('onCategorias');
    if (!cont) return;
    cont.innerHTML = '';
    Object.keys(estado.categorias).forEach((cat, i) => {
      const fila = document.createElement('div');
      fila.className = 'categoria-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `onc-${i}`;
      cb.checked = estado.categoriasSeleccionadas.includes(cat);
      cb.addEventListener('change', () => {
        if (!cb.checked && estado.categoriasSeleccionadas.length <= 1) {
          cb.checked = true;
          reproducirSonido('error');
          modal('Error', '<p>Mínimo 1 categoría.</p>');
          return;
        }
        if (cb.checked) {
          if (!estado.categoriasSeleccionadas.includes(cat)) estado.categoriasSeleccionadas.push(cat);
        } else {
          estado.categoriasSeleccionadas = estado.categoriasSeleccionadas.filter((c) => c !== cat);
        }
        reproducirSonido('click');
        saveAll();
      });
      const label = document.createElement('label');
      label.setAttribute('for', cb.id);
      label.textContent = cat;
      fila.appendChild(cb);
      fila.appendChild(label);
      cont.appendChild(fila);
    });
  }

  function guardarConfigLobby() {
    if (!sesion || !sesion.esHost) return;
    const config = leerConfigPanel();
    if ($('onMaxJugadores') && Number($('onMaxJugadores').value) !== config.maxJugadores) $('onMaxJugadores').value = String(config.maxJugadores);
    // actualización optimista para que el botón "Iniciar" reaccione sin esperar a la red
    if (salaActual) salaActual = { ...salaActual, config };
    pintarBotonIniciar();
    updateDoc(refSala(), { config })
      .catch((e) => console.warn('No se pudo guardar la configuración:', e));
  }

  $('onModo')?.addEventListener('change', () => {
    const minimo = minimoPorModo($('onModo').value);
    const cap = $('onMaxJugadores');
    if (cap && Number(cap.value) < minimo) cap.value = String(minimo);
    guardarConfigLobby();
  });

  ['onModo', 'onPista', 'onCategoriaImp', 'onAliados', 'onDuracion', 'onVotacion', 'onRondas', 'onMaxJugadores'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('change', guardarConfigLobby);
  });

  function pintarLobby() {
    const cont = $('lobbyJugadores');
    if (!cont || !sesion) return;
    const html = jugadoresActuales.map((j) => {
      const esAnfitrion = salaActual ? j.uid === salaActual.hostUid : false;
      return `<div class="jugador-item"><span>${esAnfitrion ? '👑' : '👤'} ${escapeHtml(j.nombre)}${j.uid === sesion.uid ? ' (tú)' : ''}</span></div>`;
    }).join('');
    setHtml(cont, html);
    setTxt('lobbyContador', String(jugadoresActuales.length));
    setTxt('lobbyCapacidad', String(Math.max(3, Number(salaActual?.config?.maxJugadores || 3))));
    pintarBotonIniciar();
  }

  function pintarResumenLobby() {
    const el = $('lobbyResumen');
    if (!el || !salaActual) return;
    const c = salaActual.config || {};
    const modo = NOMBRES_MODO[c.modo] || 'Clásico';
    const voto = (c.tipoVotacion || 'general') === 'general' ? 'votación general (en vivo)' : 'votación secreta';
    const rondas = c.maxRondas > 0 ? `${c.maxRondas} rondas máx.` : 'sin límite de rondas';
    el.textContent = sesion && sesion.esHost
      ? (sesion.publica ? 'Configura la partida y espera a que la sala se llene.' : '')
      : `🎮 ${modo} · ${voto} · ${rondas}${sesion?.publica ? ' · Pública' : ''}`;
  }

  function pintarBotonIniciar() {
    const btn = $('btnIniciarOnline');
    const aviso = $('lobbyAviso');
    if (!btn || !aviso || !sesion) return;
    const s = salaActual;
    const n = jugadoresActuales.length;
    const resto = s && s.autoInicioMs ? Math.ceil((Number(s.autoInicioMs) - ahora()) / 1000) : 0;

    if (!sesion.esHost) {
      btn.classList.add('oculto');
      const cap = Math.max(3, Number(s?.config?.maxJugadores || 3));
      aviso.textContent = n >= cap && s?.autoInicioMs
        ? `✅ Sala llena (${n}/${cap}). La partida empieza en ${Math.max(0, resto)} s…`
        : `⏳ Jugadores: ${n}/${cap}. Esperando a que la sala se llene o a que el anfitrión inicie...`;
      return;
    }
    const cfg = leerConfigPanel();
    const minimo = minimoPorModo(cfg.modo);
    const cap = Math.max(3, Number(cfg.maxJugadores || 3));
    const llena = n >= cap;
    btn.classList.remove('oculto');
    if (llena && n >= minimo) {
      aviso.textContent = s?.autoInicioMs
        ? `✅ Sala llena (${n}/${cap}). La partida empieza sola en ${Math.max(0, resto)} s (o pulsa Iniciar).`
        : `✅ Sala llena (${n}/${cap}). Iniciando…`;
      btn.disabled = false;
    } else if (sesion.publica && !llena) {
      aviso.textContent = `Esperando jugadores: ${n} / ${cap}. La partida empieza sola cuando la sala se llene.`;
      btn.disabled = true;
    } else if (n < minimo) {
      aviso.textContent = `Faltan jugadores: el modo ${NOMBRES_MODO[cfg.modo]} necesita mínimo ${minimo} (hay ${n}).`;
      btn.disabled = true;
    } else {
      aviso.textContent = `Jugadores: ${n} / ${cap}. Empieza sola al llenarse la sala, o pulsa Iniciar cuando quieras.`;
      btn.disabled = false;
    }
    btn.style.opacity = btn.disabled ? '0.5' : '1';
  }

  function copiarCodigoSala() {
    if (!sesion) return;
    const codigo = sesion.codigo;
    const hecho = () => { reproducirSonido('click'); const b = $('btnCopiarCodigo'); if (b) { b.textContent = '✅ Copiado'; setTimeout(() => { b.textContent = '📋 Copiar código'; }, 1500); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo).then(hecho).catch(() => modal('Código de sala', `<p><strong>${escapeHtml(codigo)}</strong></p>`));
    } else {
      modal('Código de sala', `<p><strong>${escapeHtml(codigo)}</strong></p>`);
    }
  }

  // ----------------------------------------------------- iniciar partida y roles
  const claveAuto = () => {
    const c = leerConfigPanel();
    return `${jugadoresActuales.length}:${c.maxJugadores}:${c.modo}`;
  };

  // Lo ejecuta SOLO el anfitrión (botón o inicio automático al llenarse la sala).
  // Orden: 1) se escriben las cartas privadas por lotes, 2) en un último paso se cambia el estado de la
  // sala a 'jugando'. Así ningún jugador ve el cambio de estado antes de tener su carta.
  async function iniciarPartidaHostOnline(auto = false) {
    auto = auto === true;
    if (!sesion || !sesion.esHost || !salaActual || salaActual.estado !== 'esperando' || iniciandoPartida) return;
    const cfg = { ...leerConfigPanel() };
    const jugadores = [...jugadoresActuales];
    const minimo = minimoPorModo(cfg.modo);
    const cap = Math.max(3, Number(cfg.maxJugadores || 3));

    const fallo = (titulo, html) => {
      reproducirSonido('error');
      modal(titulo, html);
      if (auto) {
        autoBloqueadaClave = claveAuto();
        updateDoc(refSala(), { autoInicioMs: 0 }).catch(() => {});
      }
    };
    if (jugadores.length < minimo) return fallo('Faltan jugadores', `<p>El modo ${NOMBRES_MODO[cfg.modo]} necesita mínimo ${minimo} jugadores.</p>`);
    if (sesion.publica && jugadores.length < cap) return fallo('Sala incompleta', '<p>La partida pública empieza cuando la sala esté llena.</p>');

    const categoria = obtenerSiguienteCategoria();
    const pick = categoria ? elegirPalabraDeCategoria(categoria) : null;
    if (!pick) return fallo('Sin categorías', '<p>Selecciona al menos una categoría con palabras válidas.</p>');

    iniciandoPartida = true;
    autoBloqueadaClave = '';
    const btn = $('btnIniciarOnline');
    if (btn) btn.disabled = true;

    try {
      const ids = jugadores.map((j) => j.uid);
      const nombrePorUid = Object.fromEntries(jugadores.map((j) => [j.uid, j.nombre]));
      // Cantidad de impostores automática según el tamaño de la sala
      cfg.numImpostores = Math.max(1, Math.round(ids.length / (cfg.modo === 'misterio' ? 6 : 5)));
      const { impostores, srBlanco } = repartirRoles(ids, cfg, {
        seleccionarImpostoresSinRepetir, obtenerCandidatoSrBlanco, mezclarArray
      });
      const partida = (salaActual.partida || 0) + 1;
      const ronda = (salaActual.ronda || 0) + 1;
      const codigo = sesion.codigo;
      const roles = {};
      const privados = {};

      ids.forEach((uid) => {
        if (srBlanco.includes(uid)) {
          roles[uid] = 'srblanco';
          privados[uid] = { rol: 'srblanco', partida };
        } else if (impostores.includes(uid)) {
          roles[uid] = 'impostor';
          const aliados = impostores.filter((id) => id !== uid).map((id) => nombrePorUid[id]);
          privados[uid] = {
            rol: 'impostor',
            partida,
            aliados: cfg.impostoresSeConocen === 'si' ? aliados : null,
            categoria: cfg.categoriaImpostor === 'si' ? categoria : null,
            pista: cfg.pistaImpostor === 'si' && pick.pistas.length > 0
              ? pick.pistas[Math.floor(Math.random() * pick.pistas.length)]
              : null
          };
        } else {
          roles[uid] = 'civil';
          privados[uid] = { rol: 'civil', partida, palabra: pick.palabra, categoria };
        }
      });

      // 1) cartas privadas (y revivir a quien siga marcado como expulsado) por lotes
      for (let i = 0; i < jugadores.length; i += LOTE) {
        const batch = writeBatch(db);
        jugadores.slice(i, i + LOTE).forEach((j) => {
          batch.set(doc(db, 'salas', codigo, 'privado', j.uid), privados[j.uid]);
          if (j.vivo === false) batch.update(doc(db, 'salas', codigo, 'jugadores', j.uid), { vivo: true });
        });
        await batch.commit();
      }

      // 2) secreto del anfitrión + cambio de estado => TODOS pasan a ver su carta a la vez
      const fin = writeBatch(db);
      fin.set(doc(db, 'salas', codigo, 'secreto', 'ronda'), { partida, palabra: pick.palabra, categoria, roles });
      fin.update(doc(db, 'salas', codigo), {
        estado: 'jugando', partida, ronda, rondaNum: 1, config: cfg,
        jugadoresCount: ids.length, resultado: null, pendiente: null, adivinaUid: null,
        autoInicioMs: 0, empiezaUid: null, empiezaNombre: ''
      });
      await fin.commit();
      reproducirSonido('whoosh');
    } catch (e) {
      if (btn) btn.disabled = false;
      errorRed(e, 'iniciar la partida');
    } finally {
      iniciandoPartida = false;
    }
  }

  // --------------------------------------------------------------- carta online
  // La carta se ESCUCHA en tiempo real (no es una lectura única): si el documento todavía no llegó,
  // o la conexión parpadea, la carta aparece sola en cuanto esté disponible. Solo si pasan 12 s sin
  // recibirla se muestra un aviso con el motivo real y un botón para reintentar.
  function cargarMiCarta(partida) {
    privadoActual = null;
    if (unsubCarta) { unsubCarta(); unsubCarta = null; }
    if (temporizadorCarta) { clearTimeout(temporizadorCarta); temporizadorCarta = null; }
    let ultimoError = null;
    const codigo = sesion.codigo;
    const uid = sesion.uid;

    unsubCarta = onSnapshot(doc(db, 'salas', codigo, 'privado', uid), (snap) => {
      if (!sesion || sesion.codigo !== codigo) return;
      if (!snap.exists() || snap.data().partida !== partida) return; // aún no llegó la de esta partida
      if (privadoActual && privadoActual.partida === partida) return; // ya mostrada
      ultimoError = null;
      privadoActual = snap.data();
      if (temporizadorCarta) { clearTimeout(temporizadorCarta); temporizadorCarta = null; }
      prepararCartaOnline();
      pantallaOnline = null; // fuerza el cambio aunque se repita la pantalla
      mostrarPantallaOnline('revelar');
    }, (err) => {
      ultimoError = err;
      console.error('Error escuchando tu carta:', err);
    });

    temporizadorCarta = setTimeout(() => {
      temporizadorCarta = null;
      if (!sesion || privadoActual || salaActual?.estado !== 'jugando' || salaActual.partida !== partida) return;
      const codigoErr = ultimoError ? (ultimoError.code || ultimoError.message || 'desconocido') : 'la carta no llegó';
      reproducirSonido('error');
      const cuerpo = ultimoError && ultimoError.code === 'permission-denied'
        ? '<p>Firestore rechazó la lectura de tu carta. Publica las reglas de <code>firestore.rules</code> (Firestore → Rules → Publicar) y recarga con Ctrl+F5.</p>'
        : `<p>No se recibió tu carta (motivo: <code>${escapeHtml(String(codigoErr))}</code>). Comprueba tu conexión y pulsa Reintentar.</p>`;
      modal('No se pudo cargar tu carta', cuerpo, 'Reintentar', () => { partidaMostrada = 0; render(); });
    }, 12000);
  }

  function prepararCartaOnline() {
    cartaRevelada = false;
    if ($('nombreJugador')) $('nombreJugador').textContent = `Tu carta: ${sesion.nombre}`;
    if ($('rolJugador')) $('rolJugador').textContent = 'Toca la carta para revelar tu rol';
    const caja = $('palabraCaja');
    if (caja) {
      caja.classList.remove('flipped', 'bloqueado');
      const front = caja.querySelector('.card-front');
      if (front) front.setAttribute('aria-hidden', 'false');
    }
    const back = $('palabraContenido');
    if (back) {
      back.setAttribute('aria-hidden', 'true');
      back.classList.remove('civil', 'impostor', 'srblanco');
      back.innerHTML = '';
      back.style.fontSize = '';
    }
    const btn = $('btnSiguiente');
    if (btn) {
      btn.textContent = '✅ Listo';
      btn.disabled = false;
      btn.classList.add('oculto');
    }
  }

  function revelar() {
    const caja = $('palabraCaja');
    const contenido = $('palabraContenido');
    if (!caja || !contenido || !privadoActual) return;
    if (caja.classList.contains('bloqueado') || cartaRevelada) return;

    cartaRevelada = true;
    caja.classList.add('flipped', 'bloqueado');
    const front = caja.querySelector('.card-front');
    if (front) front.setAttribute('aria-hidden', 'true');
    contenido.setAttribute('aria-hidden', 'false');
    reproducirSonido('revelar');
    vibrar(100);

    const p = privadoActual;
    contenido.classList.remove('civil', 'impostor', 'srblanco');

    if (p.rol === 'srblanco') {
      contenido.classList.add('srblanco');
      $('rolJugador').innerHTML = 'Eres <strong style="color: white;">SR. BLANCO</strong> 🎩';
      contenido.innerHTML = '<strong>NO TIENES PALABRA</strong><div class="pistas-info">🎭 Improvisa tus pistas</div>';
    } else if (p.rol === 'impostor') {
      contenido.classList.add('impostor');
      $('rolJugador').innerHTML = '¡Eres <strong style="color: #ef4444;">IMPOSTOR</strong>! 🕵️';

      let html = '<div class="impostor-info-wrapper">';
      if (Array.isArray(p.aliados)) {
        html += p.aliados.length > 0
          ? `<div class="info-box info-box-aliados"><div class="info-box-titulo">🤝 Tus aliados</div><div class="aliados-lista">${p.aliados.map((a) => `<span class="aliado-badge">${escapeHtml(a)}</span>`).join('')}</div></div>`
          : '<div class="info-box info-box-aliados"><div class="info-box-titulo">🕵️ Eres el único impostor</div></div>';
      }
      if (p.categoria) {
        html += `<div class="info-box info-box-categoria"><div class="info-box-titulo">📂 Categoría</div><div class="info-box-categoria-nombre">${escapeHtml(p.categoria)}</div></div>`;
      }
      if (p.pista) {
        html += `<div class="pista-impostor-wrapper"><div class="pista-label">🕵️ Pista clave</div><div class="pista-contenido">${escapeHtml(p.pista)}</div></div>`;
      }
      if (!p.pista && !p.categoria && !Array.isArray(p.aliados)) {
        html += '<div style="font-size:0.7em; opacity:0.8;">Sin información adicional</div>';
      }
      html += '</div>';
      contenido.innerHTML = html;
    } else {
      contenido.classList.add('civil');
      $('rolJugador').innerHTML = 'Eres <strong style="color: #3b82f6;">CIVIL</strong> 👥';
      contenido.innerHTML = `${escapeHtml(p.palabra)}<div class="categoria-info">Categoría: ${escapeHtml(p.categoria)}</div>`;
    }
    requestAnimationFrame(() => autoFit(contenido, 14));

    const btn = $('btnSiguiente');
    if (btn) btn.classList.remove('oculto', 'oculto-animado');
  }

  // "Listo": avisa a la sala que ya viste tu carta
  async function siguiente() {
    if (!sesion || !salaActual || salaActual.estado !== 'jugando') return;
    reproducirSonido('click');
    const btn = $('btnSiguiente');
    if (btn) btn.disabled = true;
    try {
      await updateDoc(refJugador(sesion.uid), { listoPartida: salaActual.partida });
    } catch (e) {
      if (btn) btn.disabled = false;
      errorRed(e, 'avisar que estás listo');
    }
  }

  // ============================ RENDER (según estado de la sala) ============================
  function render() {
    if (!sesion || !salaActual) return;
    const s = salaActual;
    social.sala();
    if (s.ronda !== rondaVista) { rondaVista = s.ronda; seleccionVoto = null; }
    switch (s.estado) {
      case 'esperando':
        privadoActual = null; partidaMostrada = 0;
        mostrarPantallaOnline('lobby');
        pintarResumenLobby(); pintarBotonIniciar();
        break;
      case 'jugando': pintarJugando(); break;
      case 'cuenta': pintarCuenta(); break;
      case 'debate': pintarDebate(); break;
      case 'votando': pintarVotacion(); break;
      case 'adivinando': pintarAdivinando(); break;
      case 'resultado':
      case 'finalizada': pintarResultado(); break;
      default: break;
    }
    evaluarHost();
  }

  function pintarJugando() {
    const s = salaActual;
    if (s.partida !== partidaMostrada) {
      partidaMostrada = s.partida;
      cargarMiCarta(s.partida);
      return;
    }
    const mio = yo();
    if (!privadoActual || !mio || mio.listoPartida !== s.partida) return;
    mostrarPantallaOnline('esperaOnline');
    const vivos = vivosDe();
    const listos = vivos.filter((j) => j.listoPartida === s.partida);
    const faltan = vivos.filter((j) => j.listoPartida !== s.partida);
    setTxt('esperaContador', `${listos.length} / ${vivos.length} listos`);
    setTxt('esperaMensaje', faltan.length === 0
      ? '✅ Todos vieron su carta. ¡Empieza la cuenta regresiva!'
      : '⏳ Esperando a que los demás vean su carta...');
    setHtml($('esperaJugadores'), vivos.map((j) => {
      const ok = j.listoPartida === s.partida;
      return `<div class="jugador-item"><span class="nombre-jugador">${escapeHtml(j.nombre)}${j.uid === sesion.uid ? ' (tú)' : ''}</span><small>${ok ? '✅ Listo' : (dormido(j) ? '💤 Sin señal' : '👀 Viendo su carta')}</small></div>`;
    }).join(''));
    mostrarEl('btnForzarCuentaOnline', !!sesion.esHost && faltan.length > 0);
  }

  function forzarCuentaOnline() {
    if (!sesion?.esHost || salaActual?.estado !== 'jugando') return;
    confirmModal('¿Empezar ya sin esperar a quienes aún no pulsaron «Listo»?', (ok) => {
      if (ok) pasarACuenta().catch((e) => errorRed(e, 'iniciar la cuenta regresiva'));
    });
  }

  function pintarCuenta() {
    mostrarPantallaOnline('cuentaRegresivaOnline');
    setTxt('jugadorEmpiezaOnline', salaActual.empiezaNombre ? `EMPIEZA ${salaActual.empiezaNombre.toUpperCase()}` : '¡PREPÁRENSE!');
    actualizarCuenta();
  }

  function actualizarCuenta() {
    const rest = Number(salaActual.cuentaFinMs || 0) - ahora();
    const n = rest <= 0 ? '¡Ya!' : String(Math.min(3, Math.ceil(rest / 1000)));
    if (n !== ultimoNumeroCuenta) {
      ultimoNumeroCuenta = n;
      setTxt('numeroRegresivoOnline', n);
      if (n !== '¡Ya!') reproducirSonido('cuenta_regresiva');
    }
  }

  const msDe = (t) => (t && t.toMillis ? t.toMillis() : Number.MAX_SAFE_INTEGER);
  function colaPalabra() {
    return vivosDe().filter((j) => j.pidioPalabraRonda === salaActual.ronda)
      .sort((a, b) => msDe(a.pidioPalabraEn) - msDe(b.pidioPalabraEn));
  }

  function filasDebate() {
    const s = salaActual;
    const cola = colaPalabra();
    return jugadoresActuales.map((j) => {
      let chip;
      if (j.vivo === false) chip = '👁️ Expulsado';
      else if (cola[0] && cola[0].uid === j.uid) chip = '🎙️ Tiene la palabra';
      else if (cola.some((c) => c.uid === j.uid)) chip = `✋ En cola #${cola.findIndex((c) => c.uid === j.uid)}`;
      else if (j.listoVotarRonda === s.ronda) chip = '🗳️ Listo para votar';
      else if (j.habloRonda === s.ronda) chip = '✔️ Ya habló';
      else chip = dormido(j) ? '💤 Sin señal' : '🟢 En partida';
      if (j.vivo !== false && j.listoVotarRonda === s.ronda && cola.some((c) => c.uid === j.uid)) chip += ' · 🗳️';
      return `<div class="jugador-item ${j.vivo === false ? 'jugador-expulsado' : ''}"><span class="nombre-jugador">${escapeHtml(j.nombre)}${j.uid === sesion.uid ? ' (tú)' : ''}</span><small>${chip}</small></div>`;
    }).join('');
  }

  function textoRonda() {
    const s = salaActual;
    const max = Number(s.config?.maxRondas || 0);
    return `Ronda ${s.rondaNum || 1}${max > 0 ? ` de ${max}` : ''}`;
  }

  function pintarDebate() {
    const s = salaActual;
    const vivo = yoVivo();
    mostrarPantallaOnline(vivo ? 'debateOnline' : 'espectadorOnline');
    const filas = filasDebate();
    const vivos = vivosDe();
    const listos = vivos.filter((j) => j.listoVotarRonda === s.ronda).length;

    if (!vivo) {
      setHtml($('espectadorJugadoresOnline'), filas);
      setTxt('espectadorMensaje', 'Has sido expulsado: puedes mirar el debate y escribir en el chat, pero ya no puedes hablar ni votar.');
      setTxt('espectadorEstadoOnline', `${textoRonda()} · Debate · ${listos}/${vivos.length} listos para votar`);
      return;
    }
    setHtml($('debateJugadoresOnline'), filas);
    setTxt('debateRonda', textoRonda());
    setTxt('debateListos', `🗳️ Listos para votar: ${listos} / ${vivos.length}`);
    const colaTurno = colaPalabra();
    setTxt('debateTurno', colaTurno[0]
      ? `🎙️ Habla ahora: ${colaTurno[0].nombre}${colaTurno[0].uid === sesion.uid ? ' (¡tú!)' : ''}`
      : '🔇 Nadie tiene la palabra. Pulsa «Hablar» para pedir tu turno.');
    setTxt('debateHablaron', `🗣️ Ya hablaron: ${vivos.filter((j) => j.habloRonda === s.ronda).length} / ${vivos.length}`);
    const mio = yo();
    const listoYo = mio?.listoVotarRonda === s.ronda;
    const cola = colaPalabra();
    const enCola = cola.some((j) => j.uid === sesion.uid);
    const hablando = cola[0] && cola[0].uid === sesion.uid;
    const hab = $('btnPedirPalabra');
    if (hab) {
      hab.textContent = hablando ? '✅ Terminé de hablar' : enCola ? '↩️ Cancelar mi turno' : '✋ Hablar';
      hab.disabled = listoYo;
    }
    const votar = $('btnIrVotacionOnline');
    if (votar) {
      votar.textContent = listoYo ? `✅ Esperando a los demás (${listos}/${vivos.length})` : '🗳️ Listo para votar';
      votar.disabled = listoYo;
    }
    mostrarEl('btnForzarVotacionOnline', !!sesion.esHost);
    actualizarReloj();
    ensureChatPanel();
  }

  function actualizarReloj() {
    const s = salaActual;
    if (!s || s.estado !== 'debate') return;
    const seg = Math.max(0, Math.ceil((Number(s.debateFinMs || 0) - ahora()) / 1000));
    const txt = `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
    setTxt('cronometroOnline', txt);
    const el = $('cronometroOnline');
    if (el) el.classList.toggle('cronometro-urgente', seg <= 10);
    if (seg === 10 && avisoRelojRonda !== s.ronda) { avisoRelojRonda = s.ronda; reproducirSonido('tiempo_acabando'); }
  }

  async function pedirPalabraOnline() {
    if (!sesion || !salaActual || salaActual.estado !== 'debate' || !yoVivo()) return;
    const ronda = salaActual.ronda;
    const enCola = yo()?.pidioPalabraRonda === ronda;
    try {
      const hablando = colaPalabra()[0]?.uid === sesion.uid;
      await updateDoc(refJugador(sesion.uid), enCola
        ? (hablando ? { pidioPalabraRonda: 0, habloRonda: ronda } : { pidioPalabraRonda: 0 })
        : { pidioPalabraRonda: ronda, pidioPalabraEn: serverTimestamp() });
      reproducirSonido('click');
    } catch (e) { errorRed(e, 'pedir la palabra'); }
  }

  // Cada jugador vivo toca "Listo para votar"; cuando todos lo han hecho el anfitrión abre la votación.
  async function irAVotarOnline() {
    if (!sesion || !salaActual || salaActual.estado !== 'debate' || !yoVivo()) return;
    try {
      await updateDoc(refJugador(sesion.uid), { listoVotarRonda: salaActual.ronda });
      reproducirSonido('click');
    } catch (e) { errorRed(e, 'avisar que estás listo para votar'); }
  }

  function forzarVotacionOnline() {
    if (!sesion?.esHost || salaActual?.estado !== 'debate') return;
    confirmModal('¿Abrir la votación ahora sin esperar a los demás?', (ok) => { if (ok) abrirVotacion().catch((e) => errorRed(e, 'abrir la votación')); });
  }

  // ----------------------------------------------------------------- votación
  function pintarVotacion() {
    const s = salaActual;
    const vivo = yoVivo();
    const vivos = vivosDe();
    const validos = votosValidos();
    const confirmados = vivos.filter((j) => j.votoRonda === s.ronda || validos.some((v) => v.uid === j.uid));
    const yaVote = votoLocalRonda === s.ronda || yo()?.votoRonda === s.ronda || validos.some((v) => v.uid === sesion.uid);
    const faltan = vivos.filter((j) => !confirmados.includes(j)).map((j) => j.nombre);
    const general = esGeneral();

    if (!vivo) {
      mostrarPantallaOnline('espectadorOnline');
      setHtml($('espectadorJugadoresOnline'), jugadoresActuales.map((j) => {
        const n = general ? validos.filter((v) => v.targetUid === j.uid).length : 0;
        const chip = j.vivo === false ? '👁️ Expulsado' : (general && n ? `🗳️ ${n} voto(s)` : (confirmados.includes(j) ? '✅ Ya votó' : '⏳ Pensando…'));
        return `<div class="jugador-item ${j.vivo === false ? 'jugador-expulsado' : ''}"><span class="nombre-jugador">${escapeHtml(j.nombre)}${j.uid === sesion.uid ? ' (tú)' : ''}</span><small>${chip}</small></div>`;
      }).join(''));
      setTxt('espectadorMensaje', 'Has sido expulsado: puedes observar la votación y seguir usando el chat, pero no puedes votar.');
      setTxt('espectadorEstadoOnline', `${textoRonda()} · Votación · ${confirmados.length}/${vivos.length} votos`);
      return;
    }

    mostrarPantallaOnline('votacion');
    setTxt('tituloVotacion', `🗳️ VOTACIÓN · ${textoRonda().toUpperCase()}`);
    const instr = document.querySelector('#votacion .instruccion-votacion');
    if (instr) {
      instr.textContent = general
        ? 'Elige a quién crees que es el impostor y pulsa «Confirmar voto». Verás los votos en vivo; al votar todos, se expulsa al más votado.'
        : 'Elige a quién crees que es el impostor y pulsa «Confirmar voto». Los votos son secretos hasta el final.';
    }

    const miVoto = validos.find((v) => v.uid === sesion.uid);
    const candidatos = vivos.filter((j) => j.uid !== sesion.uid);
    const html = candidatos.map((j) => {
      const recibidos = general ? validos.filter((v) => v.targetUid === j.uid) : [];
      const sel = !yaVote && seleccionVoto === j.uid;
      const esMiVoto = yaVote && miVoto && miVoto.targetUid === j.uid;
      const badge = general && recibidos.length
        ? `<small class="voto-badge">🗳️ ${recibidos.length} · ${recibidos.map((v) => escapeHtml(v.nombre)).join(', ')}</small>`
        : (esMiVoto ? '<small class="voto-badge">✅ tu voto</small>' : '');
      return `<button type="button" class="jugador-item votacion-item${sel ? ' votacion-seleccionado' : ''}${esMiVoto ? ' votacion-mio' : ''}" data-voto-uid="${escapeHtml(j.uid)}"${yaVote ? ' disabled' : ''}><span class="nombre-jugador">${escapeHtml(j.nombre)}</span>${badge}</button>`;
    }).join('');
    setHtml($('listaVotacion'), html);

    setTxt('votacionProgreso', yaVote
      ? `✅ Voto registrado. Votos: ${confirmados.length} / ${vivos.length}${faltan.length ? ` · Faltan: ${faltan.join(', ')}` : ''}`
      : `Votos confirmados: ${confirmados.length} / ${vivos.length}`);

    const btn = $('btnConfirmarVotacion');
    if (btn) {
      btn.classList.toggle('oculto', yaVote);
      btn.disabled = !seleccionVoto || votoEnCurso;
      btn.textContent = seleccionVoto ? `Confirmar voto por ${nombreDe(seleccionVoto)}` : 'Elige a un jugador';
    }
    mostrarEl('btnForzarVotosOnline', !!sesion.esHost);
    actualizarCronoVotacion();
    ensureChatPanel();
  }

  function actualizarCronoVotacion() {
    const s = salaActual;
    if (!s || s.estado !== 'votando' || !s.votacionFinMs) return;
    const seg = Math.max(0, Math.ceil((Number(s.votacionFinMs) - ahora()) / 1000));
    setTxt('votacionCrono', `⏱️ Tiempo para votar: ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`);
  }

  $('listaVotacion')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-voto-uid]');
    if (!b || b.disabled || !sesion || salaActual?.estado !== 'votando' || !yoVivo()) return;
    seleccionVoto = b.dataset.votoUid;
    reproducirSonido('click');
    render();
  });

  async function confirmarVotoOnline() {
    if (!sesion || !salaActual || salaActual.estado !== 'votando' || !yoVivo() || votoEnCurso) return;
    const s = salaActual;
    const target = vivosDe().find((j) => j.uid === seleccionVoto && j.uid !== sesion.uid);
    if (!target) { modal('Selecciona un jugador', '<p>Elige a quién quieres votar.</p>'); return; }
    votoEnCurso = true;
    render();
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'salas', sesion.codigo, 'votos', sesion.uid), {
        uid: sesion.uid, nombre: sesion.nombre, targetUid: target.uid, targetNombre: target.nombre,
        ronda: s.ronda, creadoEn: serverTimestamp()
      });
      batch.update(refJugador(sesion.uid), { votoRonda: s.ronda });
      await batch.commit();
      votoLocalRonda = s.ronda;
      reproducirSonido('votar');
      vibrar(60);
    } catch (e) { errorRed(e, 'registrar el voto'); }
    finally { votoEnCurso = false; render(); }
  }
  $('btnConfirmarVotacion')?.addEventListener('click', confirmarVotoOnline);

  function forzarVotosOnline() {
    if (!sesion?.esHost || salaActual?.estado !== 'votando') return;
    confirmModal('¿Cerrar la votación ahora con los votos recibidos? Quien no haya votado se abstiene.', (ok) => {
      if (ok) procesarVotacion().catch((e) => errorRed(e, 'procesar la votación'));
    });
  }

  // ------------------------------------------------------- Sr. Blanco adivina
  function pintarAdivinando() {
    const s = salaActual;
    mostrarPantallaOnline('adivinarOnline');
    const soyYo = s.adivinaUid === sesion.uid;
    const nombre = nombreDe(s.adivinaUid);
    const g = jugadoresActuales.find((j) => j.uid === s.adivinaUid);
    const enviado = g && g.intentoRonda === s.ronda;
    setTxt('adivinarTitulo', soyYo ? '🎩 ¡Eras el Sr. Blanco!' : `🎩 ${nombre} era el Sr. Blanco`);
    setTxt('adivinarTexto', soyYo
      ? (enviado ? 'Intento enviado. Esperando el resultado…' : 'Tienes una última oportunidad: escribe la palabra secreta. Si aciertas, ¡ganas tú!')
      : `${nombre} intenta adivinar la palabra secreta. ¡Si acierta, gana!`);
    mostrarEl('adivinarForm', soyYo && !enviado);
    actualizarAdivinar();
  }

  function actualizarAdivinar() {
    const s = salaActual;
    if (!s || s.estado !== 'adivinando') return;
    setTxt('adivinarCrono', `${Math.max(0, Math.ceil((Number(s.adivinaFinMs || 0) - ahora()) / 1000))} s`);
  }

  async function enviarAdivinanzaOnline() {
    if (!sesion || !salaActual || salaActual.estado !== 'adivinando' || salaActual.adivinaUid !== sesion.uid) return;
    const texto = ($('adivinarInput')?.value || '').trim().slice(0, 40);
    if (!texto) { modal('Escribe una palabra', '<p>Escribe tu intento antes de enviarlo.</p>'); return; }
    try {
      await updateDoc(refJugador(sesion.uid), { intentoPalabra: texto, intentoRonda: salaActual.ronda });
      reproducirSonido('click');
    } catch (e) { errorRed(e, 'enviar tu intento'); }
  }
  $('btnEnviarAdivinanza')?.addEventListener('click', enviarAdivinanzaOnline);
  $('adivinarInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarAdivinanzaOnline(); });

  // ---------------------------------------------------------------- resultado
  const NOMBRE_ROL = { civil: 'Civil', impostor: 'Impostor', srblanco: 'Sr. Blanco' };

  function pintarResultado() {
    const s = salaActual;
    const r = s.resultado || {};
    const fin = s.estado === 'finalizada';
    mostrarPantallaOnline('resultado');
    setTxt('resultadoTitulo', r.titulo || (fin ? '🏁 Partida finalizada' : 'Resultado de la ronda'));

    let html = `<span>${escapeHtml(r.mensaje || 'La ronda ha terminado.')}</span>`;
    if (Array.isArray(r.resumen) && r.resumen.length) {
      html += '<div class="resumen-votos-online"><strong>Votos recibidos</strong>'
        + r.resumen.map((x) => `<p>${escapeHtml(x.nombre)}: ${x.votos}</p>`).join('') + '</div>';
    }
    if (Array.isArray(r.detalle) && r.detalle.length) {
      html += '<div class="resumen-votos-online"><strong>Quién votó a quién</strong>'
        + r.detalle.map((x) => `<p>${escapeHtml(x.votante)} → ${escapeHtml(x.objetivo)}</p>`).join('') + '</div>';
    }
    if (fin && Array.isArray(r.rolesFinal)) {
      html += '<div class="resumen-votos-online"><strong>Roles</strong>'
        + r.rolesFinal.map((x) => `<p>${escapeHtml(x.nombre)}: ${escapeHtml(NOMBRE_ROL[x.rol] || x.rol)}</p>`).join('') + '</div>';
    }
    setHtml($('resultadoMensaje'), html);

    mostrarEl('btnResultado', false);
    mostrarEl('btnIrVotacion', false);
    mostrarEl('btnContinuarRondaOnline', !fin && !!sesion.esHost);
    mostrarEl('btnNuevaPartidaOnline', fin && !!sesion.esHost);
    mostrarEl('btnVolverMultijugador', fin);
    if (!fin) setTxt('btnContinuarRondaOnline', '▶️ Continuar ahora');
    actualizarTemporizadorResultado();
    ensureChatPanel();
    // Efectos de fin de partida: una sola vez por partida y ganador, en todos los dispositivos a la vez
    if (fin && r.ganador) {
      const clave = `${s.partida}:${r.ganador}`;
      if (clave !== efectoFinClave) { efectoFinClave = clave; efectoFinPartida(r.ganador); }
    }
  }

  function actualizarTemporizadorResultado() {
    const s = salaActual;
    if (!s || (s.estado !== 'resultado' && s.estado !== 'finalizada')) return;
    if (s.estado === 'finalizada') {
      setTxt('resultadoTemporizador', sesion.esHost ? '' : '⏳ Esperando a que el anfitrión inicie una nueva partida (o puedes salir).');
      return;
    }
    const seg = Math.max(0, Math.ceil((Number(s.resultadoFinMs || 0) - ahora()) / 1000));
    setTxt('resultadoTemporizador', `⏱️ Siguiente debate en ${seg} s`);
  }
  $('btnContinuarRondaOnline')?.addEventListener('click', () => continuarRondaOnline());
  $('btnNuevaPartidaOnline')?.addEventListener('click', () => nuevaPartidaOnline());
  $('btnVolverMultijugador')?.addEventListener('click', () => volverASalaMultijugador());
  $('btnForzarVotacionOnline')?.addEventListener('click', forzarVotacionOnline);
  $('btnForzarVotosOnline')?.addEventListener('click', forzarVotosOnline);
  $('btnPedirPalabra')?.addEventListener('click', pedirPalabraOnline);
  $('btnIrVotacionOnline')?.addEventListener('click', irAVotarOnline);
  $('btnForzarCuentaOnline')?.addEventListener('click', forzarCuentaOnline);
  $('btnEntrarApodo')?.addEventListener('click', entrarConApodo);
  $('btnCancelarApodo')?.addEventListener('click', cancelarApodo);
  $('btnCompartirEnlace')?.addEventListener('click', compartirEnlaceSala);
  $('btnMostrarQR')?.addEventListener('click', mostrarQRSala);
  $('apodoInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); entrarConApodo(); } });
  // El campo "Tu nombre" recuerda el último apodo usado
  if ($('nombreJugadorOnline') && !$('nombreJugadorOnline').value) $('nombreJugadorOnline').value = apodoGuardado();

  // ============== MOTOR DEL ANFITRIÓN (única fuente de verdad de las transiciones) ==============
  function tick() {
    if (!sesion || !salaActual) return;
    const s = salaActual;
    if (s.estado === 'cuenta') actualizarCuenta();
    else if (s.estado === 'debate') actualizarReloj();
    else if (s.estado === 'votando') actualizarCronoVotacion();
    else if (s.estado === 'adivinando') actualizarAdivinar();
    else if (s.estado === 'esperando') pintarBotonIniciar();
    else if (s.estado === 'resultado' || s.estado === 'finalizada') actualizarTemporizadorResultado();
    if (s.estado !== 'cuenta') ultimoNumeroCuenta = null;
    actualizarAvisoHost();
    // Si el servidor lleva demasiado sin confirmar mi latido (y la pestaña está visible) => probable caída silenciosa
    if (estadoRed === 'ok' && !document.hidden && ultimoAckLatido && Date.now() - ultimoAckLatido > MS_LATIDO * 2 + 10000) {
      marcarReconectando();
      sondearConexion();
    }
    evaluarHost();
  }

  // Si el anfitrión pierde la conexión la partida se detiene (él es el motor): se avisa al resto.
  function actualizarAvisoHost() {
    let txt = '';
    if (sesion && !sesion.esHost && salaActual && salaActual.estado !== 'cerrada') {
      const h = jugadoresActuales.find((j) => j.uid === salaActual.hostUid);
      if (h && dormido(h)) txt = '⚠️ El anfitrión no responde. La partida está en pausa; si no vuelve, sal de la sala.';
    }
    setTxt('avisoConexionOnline', txt);
    mostrarEl('avisoConexionOnline', !!txt);
  }

  function hostAccion(clave, fn) {
    if (accionHost === clave) return;
    accionHost = clave;
    Promise.resolve().then(fn).catch((e) => {
      console.error('Error del anfitrión en', clave, e);
      if (e && e.code === 'permission-denied' && !avisoPermisos) {
        avisoPermisos = true;
        errorRed(e, 'avanzar la partida');
      }
    }).finally(() => { setTimeout(() => { if (accionHost === clave) accionHost = null; }, 1500); });
  }

  function evaluarHost() {
    if (!sesion?.esHost || !salaActual) return;
    const s = salaActual;
    const vivos = vivosDe();
    const base = `${s.estado}:${s.partida}:${s.ronda}`;
    switch (s.estado) {
      case 'esperando': evaluarAutoInicio(); break;
      case 'jugando':
        if (vivos.length && vivos.every((j) => j.listoPartida === s.partida)) hostAccion(base, pasarACuenta);
        break;
      case 'cuenta':
        if (ahora() >= Number(s.cuentaFinMs || 0)) hostAccion(base, pasarADebate);
        break;
      case 'debate':
        if (vivos.length && vivos.every((j) => j.listoVotarRonda === s.ronda)) hostAccion(`${base}:todos`, abrirVotacion);
        else if (ahora() >= Number(s.debateFinMs || 0)) hostAccion(`${base}:tiempo`, abrirVotacion);
        break;
      case 'votando':
        if (vivos.length && votosValidos().length >= vivos.length) hostAccion(base, procesarVotacion);
        else if (s.votacionFinMs && ahora() >= Number(s.votacionFinMs)) hostAccion(`${base}:tiempo`, procesarVotacion);
        break;
      case 'adivinando': {
        const g = jugadoresActuales.find((j) => j.uid === s.adivinaUid);
        const intento = g && g.intentoRonda === s.ronda ? g.intentoPalabra : null;
        if (intento || !g || ahora() >= Number(s.adivinaFinMs || 0)) hostAccion(`${base}:${intento || ''}`, () => resolverAdivinanza(intento));
        break;
      }
      case 'resultado':
        if (ahora() >= Number(s.resultadoFinMs || 0)) hostAccion(base, continuarRondaOnline);
        break;
      default: break;
    }
  }

  // Sala llena (privada o pública): el anfitrión publica una cuenta de 5 s que ve TODA la sala y,
  // al terminar, inicia la partida para todos a la vez. Si alguien sale o cambia la capacidad, se cancela.
  function evaluarAutoInicio() {
    const s = salaActual;
    const cfg = leerConfigPanel();
    const n = jugadoresActuales.length;
    const cap = Math.max(3, Number(cfg.maxJugadores || 3));
    const llena = n >= cap && n >= minimoPorModo(cfg.modo);
    if (!llena) {
      if (s.autoInicioMs) hostAccion(`auto-off:${n}:${cap}`, () => updateDoc(refSala(), { autoInicioMs: 0 }));
      return;
    }
    if (autoBloqueadaClave === claveAuto()) return;
    if (!s.autoInicioMs) {
      hostAccion(`auto-on:${n}:${cap}`, () => updateDoc(refSala(), { autoInicioMs: ahora() + MS_AUTOINICIO }));
      return;
    }
    if (ahora() >= Number(s.autoInicioMs)) hostAccion(`auto-go:${n}:${cap}`, () => iniciarPartidaHostOnline(true));
  }

  // Transacción protegida: solo aplica si la sala sigue en el estado/ronda esperados.
  // `extra(tx, datosSala)` puede hacer lecturas y luego escrituras dentro de la misma transacción.
  async function txSala(cond, cambios, extra) {
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(refSala());
      if (!snap.exists() || !cond(snap.data())) return false;
      if (extra) await extra(tx, snap.data());
      tx.update(refSala(), cambios);
      return true;
    });
  }

  // Quien abre el debate: al azar entre los vivos, evitando al Sr. Blanco (como en el modo offline)
  async function elegirQuienEmpieza() {
    const vivos = vivosDe();
    let roles = {};
    try {
      const sn = await getDoc(doc(db, 'salas', sesion.codigo, 'secreto', 'ronda'));
      if (sn.exists()) roles = sn.data().roles || {};
    } catch (e) { console.warn('No se pudieron leer los roles para elegir quién empieza:', e); }
    const validos = vivos.filter((j) => roles[j.uid] !== 'srblanco');
    const lista = validos.length ? validos : vivos;
    return lista[Math.floor(Math.random() * lista.length)] || null;
  }

  async function pasarACuenta() {
    const s = salaActual;
    const empieza = await elegirQuienEmpieza();
    await txSala((d) => d.estado === 'jugando' && d.partida === s.partida, {
      estado: 'cuenta', cuentaFinMs: ahora() + MS_CUENTA,
      empiezaUid: empieza ? empieza.uid : null, empiezaNombre: empieza ? empieza.nombre : ''
    });
  }

  // Al abrir el debate, quien empieza queda automáticamente como primero en la cola de palabra
  async function pasarADebate() {
    const s = salaActual;
    const min = Math.max(1, Number(s.config?.duracionPartida || 3));
    await txSala((d) => d.estado === 'cuenta' && d.ronda === s.ronda,
      { estado: 'debate', debateFinMs: ahora() + min * 60000 },
      async (tx, d) => {
        if (!d.empiezaUid) return;
        const p = await tx.get(refJugador(d.empiezaUid));
        if (p.exists() && p.data().vivo !== false) {
          tx.update(refJugador(d.empiezaUid), { pidioPalabraRonda: d.ronda, pidioPalabraEn: serverTimestamp() });
        }
      });
  }

  async function abrirVotacion() {
    const s = salaActual;
    await txSala((d) => d.estado === 'debate' && d.ronda === s.ronda,
      { estado: 'votando', votacionInicioMs: ahora(), votacionFinMs: ahora() + MS_VOTACION });
  }

  async function continuarRondaOnline() {
    if (!sesion?.esHost || !salaActual || salaActual.estado !== 'resultado') return;
    const s = salaActual;
    const empieza = await elegirQuienEmpieza();
    try {
      await txSala((d) => d.estado === 'resultado' && d.ronda === s.ronda, {
        estado: 'cuenta', ronda: s.ronda + 1, rondaNum: (s.rondaNum || 1) + 1,
        cuentaFinMs: ahora() + MS_CUENTA, resultado: null,
        empiezaUid: empieza ? empieza.uid : null, empiezaNombre: empieza ? empieza.nombre : ''
      });
    } catch (e) { errorRed(e, 'continuar la partida'); }
  }

  // Cuenta votos (lee los documentos frescos), expulsa al más votado y evalúa la victoria
  async function procesarVotacion() {
    const s = salaActual;
    if (!sesion?.esHost || !s || s.estado !== 'votando') return;
    const [votosSnap, secretoSnap] = await Promise.all([
      getDocs(collection(db, 'salas', sesion.codigo, 'votos')),
      getDoc(doc(db, 'salas', sesion.codigo, 'secreto', 'ronda'))
    ]);
    const secreto = secretoSnap.exists() ? secretoSnap.data() : { roles: {}, palabra: '' };
    const roles = secreto.roles || {};
    const vivos = vivosDe();
    const ids = new Set(vivos.map((j) => j.uid));
    const votos = votosSnap.docs.map((d) => d.data())
      .filter((v) => v.ronda === s.ronda && ids.has(v.uid) && ids.has(v.targetUid));

    const cuenta = {};
    votos.forEach((v) => { cuenta[v.targetUid] = (cuenta[v.targetUid] || 0) + 1; });
    const max = Math.max(0, ...Object.values(cuenta));
    const tops = Object.keys(cuenta).filter((u) => cuenta[u] === max);
    const resumen = Object.keys(cuenta).map((u) => ({ nombre: nombreDe(u), votos: cuenta[u] })).sort((a, b) => b.votos - a.votos);
    const detalle = votos.map((v) => ({ votante: v.nombre || nombreDe(v.uid), objetivo: v.targetNombre || nombreDe(v.targetUid) }));

    // Empate (o nadie votó): no se expulsa a nadie, igual que en el modo offline
    if (tops.length !== 1 || max === 0) {
      await cerrarRonda({ estadoEsperado: 'votando', s, resumen, detalle, expulsado: null, roles, palabra: secreto.palabra });
      return;
    }
    const expulsado = vivos.find((j) => j.uid === tops[0]);
    if (!expulsado) return;

    if (roles[expulsado.uid] === 'srblanco') {
      // El Sr. Blanco expulsado tiene una última oportunidad de adivinar la palabra
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(refSala());
        if (!snap.exists() || snap.data().estado !== 'votando' || snap.data().ronda !== s.ronda) return;
        tx.update(refJugador(expulsado.uid), { vivo: false });
        tx.update(refSala(), {
          estado: 'adivinando', adivinaUid: expulsado.uid, adivinaFinMs: ahora() + MS_ADIVINAR,
          pendiente: { resumen, detalle, expulsadoUid: expulsado.uid, expulsadoNombre: expulsado.nombre }
        });
      });
      return;
    }
    await cerrarRonda({ estadoEsperado: 'votando', s, resumen, detalle, expulsado, roles, palabra: secreto.palabra });
  }

  async function resolverAdivinanza(intento) {
    const s = salaActual;
    if (!sesion?.esHost || !s || s.estado !== 'adivinando') return;
    const secretoSnap = await getDoc(doc(db, 'salas', sesion.codigo, 'secreto', 'ronda'));
    const secreto = secretoSnap.exists() ? secretoSnap.data() : { roles: {}, palabra: '' };
    const p = s.pendiente || {};
    const expulsado = jugadoresActuales.find((j) => j.uid === (p.expulsadoUid || s.adivinaUid))
      || { uid: s.adivinaUid, nombre: nombreDe(s.adivinaUid), vivo: false };
    const acierto = !!intento && !!secreto.palabra && verificarVictoriaSrBlanco(intento, secreto.palabra);
    await cerrarRonda({
      estadoEsperado: 'adivinando', s, resumen: p.resumen || [], detalle: p.detalle || [],
      expulsado, roles: secreto.roles || {}, palabra: secreto.palabra, srGano: acierto, srIntento: intento || null
    });
  }

  async function cerrarRonda({ estadoEsperado, s, resumen, detalle, expulsado, roles, palabra, srGano = false, srIntento = null }) {
    const restantes = vivosDe().filter((j) => !expulsado || j.uid !== expulsado.uid);
    const rolDe = (uid) => roles[uid] || 'civil';
    const enemigos = restantes.filter((j) => rolDe(j.uid) !== 'civil').length;
    const civiles = restantes.length - enemigos;
    const rondaNum = s.rondaNum || 1;
    const maxRondas = Number(s.config?.maxRondas || 0);

    let ganador = null;
    if (srGano) ganador = 'srblanco';
    else if (enemigos === 0) ganador = 'civiles';
    else if (enemigos >= civiles) ganador = 'impostores';
    else if (maxRondas > 0 && rondaNum >= maxRondas) ganador = 'empate';

    const rolExp = expulsado ? rolDe(expulsado.uid) : null;
    let titulo = expulsado ? '🚪 Jugador expulsado' : '⚖️ ¡EMPATE!';
    let mensaje = expulsado
      ? `${expulsado.nombre} fue expulsado y era ${NOMBRE_ROL[rolExp]}.`
      : 'Nadie recibió mayoría de votos. No se expulsa a nadie.';
    if (rolExp === 'srblanco') {
      mensaje += srGano ? ` Adivinó la palabra («${srIntento}»).` : (srIntento ? ` Intentó «${srIntento}» y falló.` : ' No logró adivinar la palabra.');
    }
    if (ganador === 'civiles') { titulo = '🏆 ¡VICTORIA CIVIL!'; mensaje += ' Todos los enemigos fueron eliminados.'; }
    else if (ganador === 'impostores') { titulo = '😈 ¡VICTORIA IMPOSTOR!'; mensaje += ' Los enemigos igualan o superan a los civiles.'; }
    else if (ganador === 'srblanco') { titulo = '🎩 ¡GANA EL SR. BLANCO!'; }
    else if (ganador === 'empate') { titulo = '⚖️ Partida empatada'; mensaje += ' Se agotaron las rondas.'; }
    else mensaje += ' La partida continúa.';
    if (ganador && palabra) mensaje += ` Palabra secreta: ${palabra}.`;

    const resultado = {
      ronda: s.ronda, rondaNum, titulo, mensaje, gameOver: !!ganador, ganador,
      expulsadoUid: expulsado ? expulsado.uid : null,
      expulsadoNombre: expulsado ? expulsado.nombre : null,
      rolExpulsado: rolExp,
      resumen: resumen || [], detalle: detalle || [],
      palabra: ganador ? (palabra || null) : null,
      rolesFinal: ganador ? jugadoresActuales.map((j) => ({ nombre: j.nombre, rol: rolDe(j.uid) })) : null
    };

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(refSala());
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.estado !== estadoEsperado || d.ronda !== s.ronda) return;
      if (expulsado && expulsado.vivo !== false) tx.update(refJugador(expulsado.uid), { vivo: false });
      tx.update(refSala(), {
        estado: ganador ? 'finalizada' : 'resultado',
        resultado, resultadoFinMs: ahora() + MS_RESULTADO, adivinaUid: null, pendiente: null
      });
    });
    if (expulsado) reproducirSonido('eliminar');
  }

  // El anfitrión devuelve a todos al lobby con la misma sala y configuración
  async function nuevaPartidaOnline() {
    if (!sesion?.esHost || !salaActual || salaActual.estado !== 'finalizada') return;
    try {
      const lista = [...jugadoresActuales];
      const muertos = lista.filter((j) => j.vivo === false);
      for (let i = 0; i < muertos.length; i += LOTE) {
        const b = writeBatch(db);
        muertos.slice(i, i + LOTE).forEach((j) => b.update(refJugador(j.uid), { vivo: true }));
        await b.commit();
      }
      await updateDoc(refSala(), {
        estado: 'esperando', resultado: null, pendiente: null, adivinaUid: null, autoInicioMs: 0,
        empiezaUid: null, empiezaNombre: '', jugadoresCount: lista.length
      });
    } catch (e) { errorRed(e, 'preparar una nueva partida'); }
  }

  async function volverASalaMultijugador() {
    const s = sesion;
    if (s) {
      limpiarSesionLocal();
      try {
        if (s.esHost) await updateDoc(doc(db, 'salas', s.codigo), { estado: 'cerrada' });
        await deleteDoc(doc(db, 'salas', s.codigo, 'jugadores', s.uid));
      } catch (e) { console.warn('No se pudo cerrar la sala al volver al menú:', e); }
    }
    cambiarPantalla('salaOnline');
  }

  // --------------------------------------------------------------------- chat
  function ensureChatPanel() {
    if (chatPanel || !sesion) return;
    chatPanel = document.createElement('section');
    chatPanel.id = 'chatPartidaGlobal';
    chatPanel.className = 'chat-partida-global';
    chatPanel.innerHTML = `<div class="chat-partida-cabecera"><strong>💬 Chat de la partida</strong><button type="button" id="btnOcultarChatOnline" aria-label="Ocultar chat">−</button></div><div id="chatMensajesOnline" class="chat-mensajes-online" aria-live="polite"></div><form id="formChatOnline" class="chat-form-online"><input id="chatInputOnline" maxlength="240" placeholder="Escribe un mensaje…" autocomplete="off" aria-label="Mensaje de chat"><button type="submit">Enviar</button></form>`;
    document.body.appendChild(chatPanel);
    actualizarChatVisible();
    $('btnOcultarChatOnline')?.addEventListener('click', () => chatPanel?.classList.toggle('chat-minimizado'));
    $('formChatOnline')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('chatInputOnline'); const texto = (input?.value || '').trim();
      if (!texto || !sesion) return;
      input.value = '';
      try { await addDoc(collection(db, 'salas', sesion.codigo, 'chat'), { uid: sesion.uid, nombre: sesion.nombre, texto, creadoEn: serverTimestamp() }); }
      catch (err) { errorRed(err, 'enviar el mensaje'); }
    });
  }

  function escucharChat() {
    if (!sesion || unsubChat) return;
    const q = query(collection(db, 'salas', sesion.codigo, 'chat'), orderBy('creadoEn', 'desc'), limit(50));
    unsubChat = onSnapshot(q, (snap) => {
      ensureChatPanel();
      const cont = $('chatMensajesOnline'); if (!cont) return;
      const mensajes = snap.docs.map((d) => d.data()).reverse();
      cont.innerHTML = mensajes.map((m) => `<div class="chat-mensaje"><strong>${escapeHtml(m.nombre || 'Jugador')}</strong><span>${escapeHtml(m.texto || '')}</span></div>`).join('');
      cont.scrollTop = cont.scrollHeight;
    }, (err) => { unsubChat = null; alErrorListener('chat', err); });
  }

  return {
    crearSalaPrivadaOnline,
    unirseSalaPrivadaPorCodigo,
    iniciarPartidaHostOnline,
    salirDeSalaOnline,
    copiarCodigoSala,
    unirsePartidaPublica,
    pedirPalabraOnline,
    irAVotarOnline,
    iniciarVotacionOnline: forzarVotacionOnline, // compatibilidad con el HTML anterior
    confirmarVotoOnline,
    nuevaPartidaOnline,
    volverASalaMultijugador,
    socialOnline: social,
    arranqueOnline,
    entrarConApodo,
    cancelarApodo,
    compartirEnlaceSala,
    mostrarQRSala
  };
}
