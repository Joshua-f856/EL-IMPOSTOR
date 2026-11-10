// ==========================================================================
// 👤 perfil.js — Perfil, estadísticas por usuario, idioma, menú lateral, Google y cierre de sesión
//
// Datos:
//   Firestore  usuarios/{uid}  ->  { nombre, avatar, stats{8 contadores}, actualizado }
//   localStorage
//     impostor_perfil_<uid>   copia local del perfil (+ claves de partidas ya contadas)
//     impostor_apodo          apodo para la sala online (vacío = «Jugador Anónimo», no se guarda)
//     impostor_idioma         'es' | 'en'
//
// Reglas de Firestore necesarias (añádelas a firestore.rules):
//   match /usuarios/{uid} {
//     allow read, write: if request.auth != null && request.auth.uid == uid;
//   }
// ==========================================================================
import {
  getAuth,
  linkWithPopup,
  signInWithPopup,
  signInWithCredential,
  signOut,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Enlaces del menú «Ayúdanos a mejorar» y «Apoya al desarrollador».
// Si están vacíos se muestra un aviso de «próximamente».
const ENLACE_AYUDA = 'https://docs.google.com/forms/d/e/1FAIpQLScOpQ_o1jgW03ToPQfZ3NuXuD2U5GFGxOACp2jqRKi0ldPbPQ/viewform?usp=dialog';
const ENLACE_APOYO = 'https://pin.it/7ouKemphj';

const APODO_DEFECTO = 'Jugador Anónimo';
const AVATAR_DEFECTO = '🕵️';
const AVATARES = ['🕵️', '🐱', '🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🤖', '👻', '🐲'];
const CLAVE_APODO = 'impostor_apodo';
const CLAVE_IDIOMA = 'impostor_idioma';
const PREFIJO_PERFIL = 'impostor_perfil_';
const MAX_CLAVES = 50; // últimas partidas ya contadas (evita sumar dos veces la misma)

// ------------------------------------------------------------------ lógica pura (exportada)
const CONTADORES = ['puntos', 'victorias', 'partidas', 'impostor', 'victoriasImpostor', 'victoriasCivil', 'srBlanco', 'victoriasSrBlanco'];

export const statsVacias = () => Object.fromEntries(CONTADORES.map((k) => [k, 0]));

// Solo conserva los 8 contadores, como enteros >= 0
export function normalizarStats(s) {
  const origen = s && typeof s === 'object' ? s : {};
  const out = statsVacias();
  for (const k of CONTADORES) {
    const n = Number(origen[k]);
    out[k] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

// ¿Ganó este rol con el equipo ganador indicado?
export function gano(rol, ganador) {
  return (rol === 'civil' && ganador === 'civiles')
    || (rol === 'impostor' && ganador === 'impostores')
    || (rol === 'srblanco' && ganador === 'srblanco');
}

// +10 por partida, +50 por victoria y +25 extra si ganas como impostor o Sr. Blanco
export function calcularDelta(rol, ganoPartida) {
  const d = statsVacias();
  d.partidas = 1;
  d.puntos = 10;
  if (rol === 'impostor') d.impostor = 1;
  if (rol === 'srblanco') d.srBlanco = 1;
  if (ganoPartida) {
    d.victorias = 1;
    d.puntos += 50;
    if (rol === 'impostor') { d.victoriasImpostor = 1; d.puntos += 25; }
    else if (rol === 'srblanco') { d.victoriasSrBlanco = 1; d.puntos += 25; }
    else d.victoriasCivil = 1;
  }
  return d;
}

// ------------------------------------------------------------------ textos (es / en)
const TEXTOS = {
  es: {
    'auth.titulo': '¡Bienvenido!',
    'auth.editar': 'Editar perfil',
    'auth.sub': 'Elige tu apodo y tu avatar',
    'auth.apodo': 'Apodo',
    'auth.ph': 'Jugador Anónimo',
    'auth.nota': 'Si lo dejas vacío serás «Jugador Anónimo».',
    'auth.avatar': 'Avatar',
    'auth.continuar': 'Continuar',
    'auth.google': 'Continuar con Google',
    'auth.cancelar': 'Cancelar',
    'auth.apodoInvalido': 'Apodo no válido.',
    'auth.errorRed': 'No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.',
    'perfil.titulo': 'Mi perfil',
    'perfil.puntos': 'Puntos',
    'perfil.victorias': 'Victorias',
    'perfil.partidas': 'Partidas',
    'perfil.impostor': 'Impostor',
    'perfil.detalle': 'Detalle',
    'perfil.vImpostor': 'Victorias como impostor',
    'perfil.vCivil': 'Victorias como civil',
    'perfil.srVeces': 'Veces Sr. Blanco',
    'perfil.vSr': 'Victorias como Sr. Blanco',
    'perfil.nota': 'Puntos: +10 por partida, +50 por victoria y +25 extra si ganas como impostor o Sr. Blanco.',
    'perfil.cuenta': 'Cuenta',
    'perfil.editar': 'Editar perfil',
    'perfil.vincular': 'Vincular con Google',
    'perfil.volver': 'Volver',
    'cuenta.invitado': 'Invitado',
    'cuenta.vinculada': 'Cuenta vinculada',
    'cuenta.infoInvitado': 'Eres invitado: tus estadísticas solo existen en este dispositivo. Vincula tu cuenta de Google para conservarlas.',
    'cuenta.infoVinculada': 'Conectado como {email}. Tus estadísticas se guardan en tu cuenta.',
    'menu.abrir': 'Abrir menú',
    'menu.cerrar': 'Cerrar menú',
    'menu.titulo': 'Menú',
    'menu.cuenta': 'Mi cuenta',
    'menu.perfil': 'Mi perfil',
    'menu.recursos': 'Recursos',
    'menu.reglas': 'Reglas del juego',
    'menu.ayuda': 'Ayúdanos a mejorar',
    'menu.apoyo': 'Apoya al desarrollador',
    'menu.ajustes': 'Ajustes',
    'menu.tema': 'Cambiar tema',
    'menu.exportar': 'Exportar datos',
    'menu.importar': 'Importar datos',
    'menu.stats': 'Estadísticas de partidas locales',
    'menu.reset': 'Restablecer todo',
    'menu.idioma': 'Idioma',
    'menu.salir': 'Cerrar sesión',
    'salir.invitado': '¿Cerrar sesión? Como invitado perderás tus estadísticas, porque solo existen en este dispositivo.',
    'salir.vinculada': '¿Cerrar sesión? Tus estadísticas se conservan en tu cuenta de Google y las recuperarás al volver a entrar.',
    'info.titulo': 'Información',
    'info.proximamente': 'Esta opción estará disponible próximamente.',
    'info.ok': 'Entendido',
    'reglas.titulo': 'Reglas del juego',
    'reglas.cuerpo':
      '<p>Cada jugador recibe en secreto un rol: <strong>Civil</strong>, <strong>Impostor</strong> o <strong>Sr. Blanco</strong> (según el modo).</p>'
      + '<p>Se debate por rondas dando pistas sobre la palabra secreta y después se vota. El más votado es expulsado (si hay empate, nadie sale).</p>'
      + '<ul>'
      + '<li><strong>Civiles ganan</strong> si eliminan a todos los impostores y al Sr. Blanco.</li>'
      + '<li><strong>El impostor gana</strong> si iguala o supera en número a los civiles.</li>'
      + '<li><strong>El Sr. Blanco gana</strong> si es expulsado y adivina la palabra secreta.</li>'
      + '</ul>',
    'google.faltaTitulo': 'Falta activar Google',
    'google.falta': '<p>En la consola de Firebase ve a <strong>Authentication → Sign-in method</strong> y activa <strong>Google</strong>. Comprueba también que tu dominio esté en «Authorized domains».</p>',
    'google.bloqueado': '<p>El navegador bloqueó la ventana emergente. Permítela e inténtalo de nuevo.</p>',
    'google.errorTitulo': 'No se pudo continuar con Google',
    'google.error': '<p>Inténtalo de nuevo en unos segundos.</p>'
  },
  en: {
    'auth.titulo': 'Welcome!',
    'auth.editar': 'Edit profile',
    'auth.sub': 'Pick your nickname and avatar',
    'auth.apodo': 'Nickname',
    'auth.ph': 'Anonymous Player',
    'auth.nota': 'If you leave it empty you will be «Anonymous Player».',
    'auth.avatar': 'Avatar',
    'auth.continuar': 'Continue',
    'auth.google': 'Continue with Google',
    'auth.cancelar': 'Cancel',
    'auth.apodoInvalido': 'Invalid nickname.',
    'auth.errorRed': 'Could not sign in. Check your connection and try again.',
    'perfil.titulo': 'My profile',
    'perfil.puntos': 'Points',
    'perfil.victorias': 'Wins',
    'perfil.partidas': 'Games',
    'perfil.impostor': 'Impostor',
    'perfil.detalle': 'Details',
    'perfil.vImpostor': 'Wins as impostor',
    'perfil.vCivil': 'Wins as civilian',
    'perfil.srVeces': 'Times as Mr. White',
    'perfil.vSr': 'Wins as Mr. White',
    'perfil.nota': 'Points: +10 per game, +50 per win and +25 extra if you win as impostor or Mr. White.',
    'perfil.cuenta': 'Account',
    'perfil.editar': 'Edit profile',
    'perfil.vincular': 'Link with Google',
    'perfil.volver': 'Back',
    'cuenta.invitado': 'Guest',
    'cuenta.vinculada': 'Linked account',
    'cuenta.infoInvitado': 'You are a guest: your stats only exist on this device. Link your Google account to keep them.',
    'cuenta.infoVinculada': 'Signed in as {email}. Your stats are saved to your account.',
    'menu.abrir': 'Open menu',
    'menu.cerrar': 'Close menu',
    'menu.titulo': 'Menu',
    'menu.cuenta': 'My account',
    'menu.perfil': 'My profile',
    'menu.recursos': 'Resources',
    'menu.reglas': 'Game rules',
    'menu.ayuda': 'Help us improve',
    'menu.apoyo': 'Support the developer',
    'menu.ajustes': 'Settings',
    'menu.tema': 'Change theme',
    'menu.exportar': 'Export data',
    'menu.importar': 'Import data',
    'menu.stats': 'Local game stats',
    'menu.reset': 'Reset everything',
    'menu.idioma': 'Language',
    'menu.salir': 'Log out',
    'salir.invitado': 'Log out? As a guest you will lose your stats, because they only exist on this device.',
    'salir.vinculada': 'Log out? Your stats are kept in your Google account and you will get them back when you sign in again.',
    'info.titulo': 'Information',
    'info.proximamente': 'This option will be available soon.',
    'info.ok': 'Got it',
    'reglas.titulo': 'Game rules',
    'reglas.cuerpo':
      '<p>Each player secretly gets a role: <strong>Civilian</strong>, <strong>Impostor</strong> or <strong>Mr. White</strong> (depending on the mode).</p>'
      + '<p>Players debate in rounds, giving hints about the secret word, and then vote. The most voted player is expelled (on a tie, nobody leaves).</p>'
      + '<ul>'
      + '<li><strong>Civilians win</strong> if they eliminate every impostor and Mr. White.</li>'
      + '<li><strong>The impostor wins</strong> by matching or outnumbering the civilians.</li>'
      + '<li><strong>Mr. White wins</strong> if expelled and correctly guesses the secret word.</li>'
      + '</ul>',
    'google.faltaTitulo': 'Google sign-in is not enabled',
    'google.falta': '<p>In the Firebase console go to <strong>Authentication → Sign-in method</strong> and enable <strong>Google</strong>. Also check that your domain is listed under «Authorized domains».</p>',
    'google.bloqueado': '<p>The browser blocked the pop-up window. Allow it and try again.</p>',
    'google.errorTitulo': 'Could not continue with Google',
    'google.error': '<p>Please try again in a few seconds.</p>'
  }
};

// ------------------------------------------------------------------ módulo principal
export function initPerfil({
  app, db, $, cambiarPantalla, crearModal, confirmModal, reproducirSonido,
  validarTextoCampo, normalizarNombre, CONFIG_JUEGO, online
}) {
  const auth = getAuth(app);

  let idioma = 'es';
  let perfil = null;            // { uid, nombre, avatar, stats, claves }
  let modoEdicion = false;      // la pantalla de acceso se usa para editar el perfil
  let enAcceso = false;         // la pantalla de acceso está visible
  let avatarElegido = AVATAR_DEFECTO;
  let ocupadoAuth = false;
  let ocupadoGoogle = false;
  let menuAbierto = false;

  // ------------------------------------------------------------ utilidades
  const t = (clave, vars) => {
    const tabla = TEXTOS[idioma] || TEXTOS.es;
    let s = tabla[clave] !== undefined ? tabla[clave] : (TEXTOS.es[clave] !== undefined ? TEXTOS.es[clave] : clave);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
    return s;
  };
  const setTxt = (id, txt) => { const e = $(id); if (e && e.textContent !== txt) e.textContent = txt; };
  const ocultar = (id, si) => { const e = $(id); if (e) e.classList.toggle('oculto', !!si); };
  const sonido = (n) => { try { reproducirSonido(n); } catch (e) { /* sin audio */ } };
  const ir = (pantalla) => { enAcceso = pantalla === 'authPerfil'; cambiarPantalla(pantalla); };
  const info = (titulo, cuerpo) => crearModal({ title: titulo, body: cuerpo, okText: t('info.ok'), cancelText: '', onOk: null, onCancel: null });

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* modo privado */ } };

  const nombreValido = (n) => (typeof n === 'string' && n.trim() ? n.trim() : APODO_DEFECTO);
  const avatarValido = (a) => (typeof a === 'string' && a ? a : AVATAR_DEFECTO);
  const emailDe = (u) => (!u ? '' : (u.email || ((u.providerData || []).find((p) => p && p.email) || {}).email || ''));
  const esVinculada = () => { const u = auth.currentUser; return !!u && !u.isAnonymous; };

  async function esperarAuth() {
    // Firebase restaura la sesión guardada de forma asíncrona; hay que esperarla
    if (typeof auth.authStateReady === 'function') { try { await auth.authStateReady(); } catch (e) { /* se ignora */ } }
  }

  // ------------------------------------------------------------ idioma
  function aplicarIdioma() {
    document.documentElement.lang = idioma;
    document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach((e) => e.setAttribute('placeholder', t(e.dataset.i18nPh)));
    document.querySelectorAll('[data-i18n-title]').forEach((e) => {
      const txt = t(e.dataset.i18nTitle);
      e.setAttribute('title', txt);
      e.setAttribute('aria-label', txt);
    });
    document.querySelectorAll('[data-lang]').forEach((b) => {
      const on = b.dataset.lang === idioma;
      b.classList.toggle('activo', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    refrescarUI();
  }

  function cambiarIdioma(l) {
    if (!TEXTOS[l]) return;
    idioma = l;
    lsSet(CLAVE_IDIOMA, l);
    aplicarIdioma();
  }
  const obtenerIdioma = () => idioma;

  // ------------------------------------------------------------ almacenamiento
  function leerLocal(uid) {
    try {
      const crudo = lsGet(PREFIJO_PERFIL + uid);
      if (!crudo) return null;
      const o = JSON.parse(crudo);
      return {
        uid,
        nombre: nombreValido(o.nombre),
        avatar: avatarValido(o.avatar),
        stats: normalizarStats(o.stats),
        claves: Array.isArray(o.claves) ? o.claves.slice(-MAX_CLAVES) : []
      };
    } catch (e) { return null; }
  }

  function guardarLocal() {
    if (!perfil) return;
    lsSet(PREFIJO_PERFIL + perfil.uid, JSON.stringify({
      nombre: perfil.nombre, avatar: perfil.avatar, stats: perfil.stats, claves: perfil.claves
    }));
  }

  const refUsuario = (uid) => doc(db, 'usuarios', uid);

  async function leerNube(uid) {
    try {
      const snap = await getDoc(refUsuario(uid));
      return snap.exists() ? snap.data() : null;
    } catch (e) {
      console.warn('Perfil: no se pudo leer de la nube:', e && (e.code || e));
      return null;
    }
  }

  async function guardarNube(p = perfil) {
    if (!p) return false;
    try {
      await setDoc(refUsuario(p.uid), {
        nombre: p.nombre, avatar: p.avatar, stats: p.stats, actualizado: serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('Perfil: no se pudo guardar en la nube:', e && (e.code || e));
      return false;
    }
  }

  // Apodo recordado para la sala online (vacío = anónimo, no se guarda)
  function aplicarApodoLocal(texto) {
    if (texto) lsSet(CLAVE_APODO, texto); else lsDel(CLAVE_APODO);
    const campo = $('nombreJugadorOnline');
    if (campo) campo.value = texto || '';
  }

  // Si el perfil ya tiene un apodo propio, lo usa como apodo de sala (sin pisar lo que haya escrito)
  function sincronizarApodo(forzar = false) {
    if (!perfil) return;
    const propio = perfil.nombre !== APODO_DEFECTO ? perfil.nombre : '';
    const campo = $('nombreJugadorOnline');
    if (forzar || (propio && !lsGet(CLAVE_APODO))) {
      if (propio) lsSet(CLAVE_APODO, propio); else if (forzar) lsDel(CLAVE_APODO);
    }
    if (campo && (forzar || !campo.value)) campo.value = propio || (forzar ? '' : campo.value);
  }

  async function crearPerfilBase(uid) {
    const nube = await leerNube(uid);
    if (nube) {
      return { uid, nombre: nombreValido(nube.nombre), avatar: avatarValido(nube.avatar), stats: normalizarStats(nube.stats), claves: [] };
    }
    return { uid, nombre: nombreValido(lsGet(CLAVE_APODO)), avatar: AVATAR_DEFECTO, stats: statsVacias(), claves: [] };
  }

  function adoptar(p) {
    perfil = p;
    guardarLocal();
    sincronizarApodo();
    refrescarUI();
  }

  // Si lo local supera a la nube (escrituras perdidas) se sube; si la nube supera a lo local se toma
  async function reconciliar() {
    if (!perfil) return;
    const uid = perfil.uid;
    const nube = await leerNube(uid);
    if (!perfil || perfil.uid !== uid) return;
    if (!nube) { await guardarNube(); return; }
    const remoto = normalizarStats(nube.stats);
    let subir = false;
    for (const k of CONTADORES) {
      if (perfil.stats[k] > remoto[k]) subir = true;
      else if (remoto[k] > perfil.stats[k]) perfil.stats[k] = remoto[k];
    }
    guardarLocal();
    refrescarUI();
    if (subir) await guardarNube();
  }

  // ------------------------------------------------------------ interfaz
  function refrescarUI() {
    const user = auth.currentUser;
    const vinc = !!user && !user.isAnonymous;
    const nombre = perfil ? perfil.nombre : APODO_DEFECTO;
    const avatar = perfil ? perfil.avatar : AVATAR_DEFECTO;
    const tipo = vinc ? t('cuenta.vinculada') : t('cuenta.invitado');
    setTxt('drawerNombre', nombre);
    setTxt('drawerAvatar', avatar);
    setTxt('drawerSub', vinc ? (emailDe(user) || tipo) : t('cuenta.invitado'));
    setTxt('perfilNombre', nombre);
    setTxt('perfilAvatar', avatar);
    setTxt('perfilTipoCuenta', tipo);
    setTxt('perfilCuentaInfo', vinc ? t('cuenta.infoVinculada', { email: emailDe(user) }) : t('cuenta.infoInvitado'));
    ocultar('btnPerfilVincular', vinc);
    const s = perfil ? perfil.stats : statsVacias();
    setTxt('statPuntos', String(s.puntos));
    setTxt('statVictorias', String(s.victorias));
    setTxt('statPartidas', String(s.partidas));
    setTxt('statImpostor', String(s.impostor));
    setTxt('statVImpostor', String(s.victoriasImpostor));
    setTxt('statVCivil', String(s.victoriasCivil));
    setTxt('statSrVeces', String(s.srBlanco));
    setTxt('statVSr', String(s.victoriasSrBlanco));
  }

  function dibujarAvatares() {
    const cont = $('authAvatares');
    if (!cont || cont.children.length) return; // se dibujan una sola vez
    AVATARES.forEach((av) => {
      const b = document.createElement('button');
      b.setAttribute('type', 'button');
      b.className = 'avatar-opcion';
      b.dataset.avatar = av;
      b.textContent = av;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', av);
      b.addEventListener('click', () => marcarAvatar(av));
      cont.appendChild(b);
    });
  }

  function marcarAvatar(av) {
    avatarElegido = av;
    const cont = $('authAvatares');
    if (cont) {
      Array.from(cont.children).forEach((b) => {
        const on = b.dataset.avatar === av;
        b.classList.toggle('activo', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    setTxt('authAvatarActual', av);
  }

  function mostrarError(msg) {
    const e = $('authError');
    if (!e) return;
    e.textContent = msg;
    e.classList.remove('oculto');
  }
  function ocultarError() {
    const e = $('authError');
    if (!e) return;
    e.textContent = '';
    e.classList.add('oculto');
  }

  function prepararAcceso(editando) {
    modoEdicion = !!editando;
    dibujarAvatares();
    const campo = $('authApodo');
    if (campo) campo.value = editando && perfil && perfil.nombre !== APODO_DEFECTO ? perfil.nombre : '';
    marcarAvatar(editando && perfil ? perfil.avatar : AVATAR_DEFECTO);
    ocultarError();
    ocultar('btnAuthCancelar', !editando);
    ocultar('btnAuthGoogle', editando && esVinculada());
    const titulo = $('authTitulo');
    if (titulo) {
      const clave = editando ? 'auth.editar' : 'auth.titulo';
      titulo.dataset.i18n = clave;
      titulo.textContent = t(clave);
    }
    ir('authPerfil');
  }

  // ------------------------------------------------------------ arranque
  // Devuelve true si mostró la pantalla de acceso (primera vez o tras cerrar sesión)
  async function perfilArranque() {
    await esperarAuth();
    const user = auth.currentUser;
    if (user) {
      if (perfil && perfil.uid === user.uid) return false;
      const local = leerLocal(user.uid);
      if (local) {
        adoptar(local);
        reconciliar().catch(() => { });
        return false;
      }
      if (!user.isAnonymous) { // cuenta de Google en un dispositivo nuevo: recupera su perfil de la nube
        const nube = await leerNube(user.uid);
        if (nube) {
          adoptar(await crearPerfilBase(user.uid));
          return false;
        }
      }
    }
    prepararAcceso(false);
    return true;
  }

  // Entró por enlace/QR o reanudó una partida: el perfil se prepara sin mostrar nada
  async function perfilAsegurar() {
    try {
      await esperarAuth();
      const user = auth.currentUser || await online.asegurarAuth();
      if (perfil && perfil.uid === user.uid) return perfil;
      const local = leerLocal(user.uid);
      adoptar(local || await crearPerfilBase(user.uid));
      if (!local) await guardarNube();
      return perfil;
    } catch (e) {
      console.warn('Perfil: no se pudo preparar:', e && (e.code || e));
      return null;
    }
  }

  // ------------------------------------------------------------ acceso / edición
  async function confirmarAuth() {
    if (ocupadoAuth) return;
    const campo = $('authApodo');
    const crudo = String((campo && campo.value) || '').trim();
    ocultarError();

    let nombre = APODO_DEFECTO;
    let anonimo = true;
    if (crudo) {
      const val = validarTextoCampo(crudo, CONFIG_JUEGO.MAX_LONGITUD_NOMBRE);
      if (!val || !val.valido) {
        sonido('error');
        mostrarError((val && val.motivo) || t('auth.apodoInvalido'));
        return;
      }
      nombre = val.texto;
      anonimo = false;
    }

    ocupadoAuth = true;
    const boton = $('btnAuthContinuar');
    if (boton) boton.disabled = true;
    try {
      let user;
      try { user = await online.asegurarAuth(); } catch (e) {
        sonido('error');
        mostrarError(t('auth.errorRed'));
        return;
      }
      const editando = modoEdicion;
      if (!perfil || perfil.uid !== user.uid) perfil = leerLocal(user.uid) || await crearPerfilBase(user.uid);
      perfil.nombre = nombre;
      perfil.avatar = avatarElegido;
      guardarLocal();
      aplicarApodoLocal(anonimo ? '' : nombre);
      refrescarUI();
      await guardarNube();
      modoEdicion = false;
      ir(editando ? 'perfilUsuario' : 'seleccionModoJuego');
    } finally {
      ocupadoAuth = false;
      if (boton) boton.disabled = false;
    }
  }

  function editarPerfil() {
    sonido('click');
    if (!perfil) { prepararAcceso(false); return; }
    prepararAcceso(true);
  }

  function cancelarAuth() {
    sonido('click');
    modoEdicion = false;
    ir(perfil ? 'perfilUsuario' : 'seleccionModoJuego');
  }

  async function abrirPerfil() {
    cerrarMenuLateral();
    sonido('click');
    if (!perfil) await perfilAsegurar();
    if (!perfil) { prepararAcceso(false); return; }
    refrescarUI();
    ir('perfilUsuario');
    try { await reconciliar(); } catch (e) { /* sin red: se muestran los datos locales */ }
  }

  function volverDePerfil() {
    sonido('click');
    ir('seleccionModoJuego');
  }

  // ------------------------------------------------------------ estadísticas
  async function registrarPartida({ rol, gano: ganoPartida, clave } = {}) {
    if (!perfil) await perfilAsegurar();
    if (!perfil) return false;
    if (clave && perfil.claves.includes(clave)) return false; // partida ya contada
    const delta = calcularDelta(rol, !!ganoPartida);
    for (const k of CONTADORES) perfil.stats[k] += delta[k];
    if (clave) perfil.claves = perfil.claves.concat(clave).slice(-MAX_CLAVES);
    guardarLocal();
    refrescarUI();
    await guardarNube();
    return true;
  }

  // Partida local (offline): solo suma si el jugador es quien inició sesión (mismo nombre)
  function registrarSiEsMio(nombreJugador, { rol, gano: ganoPartida } = {}) {
    if (!perfil) return false;
    if (normalizarNombre(nombreJugador) !== normalizarNombre(perfil.nombre)) return false;
    registrarPartida({ rol, gano: ganoPartida }).catch(() => { });
    return true;
  }

  // ------------------------------------------------------------ Google
  async function entrarACuentaExistente() {
    const user = auth.currentUser;
    if (!user) return;
    const anterior = perfil;
    try { await online.abandonarSalaSilenciosa(); } catch (e) { /* no estaba en una sala */ }
    try { online.reiniciarAuth(); } catch (e) { /* se ignora */ }
    if (anterior && anterior.uid !== user.uid) lsDel(PREFIJO_PERFIL + anterior.uid);
    const nube = await leerNube(user.uid);
    if (nube) {
      perfil = { uid: user.uid, nombre: nombreValido(nube.nombre), avatar: avatarValido(nube.avatar), stats: normalizarStats(nube.stats), claves: [] };
    } else {
      perfil = {
        uid: user.uid,
        nombre: anterior ? anterior.nombre : APODO_DEFECTO,
        avatar: anterior ? anterior.avatar : AVATAR_DEFECTO,
        stats: anterior ? anterior.stats : statsVacias(),
        claves: anterior ? anterior.claves : []
      };
    }
    guardarLocal();
    sincronizarApodo(true);
    refrescarUI();
    if (!nube) await guardarNube();
  }


async function conGoogle() {
  if (ocupadoGoogle) return;

  ocupadoGoogle = true;
  sonido('click');

  try {
    const usuarioActual = auth.currentUser;
    const perfilAnterior = perfil;

    const provider = new GoogleAuthProvider();

    provider.setCustomParameters({
      prompt: 'select_account'
    });

    let usuarioGoogle = null;
    let cambioCuenta = false;

    try {
      if (usuarioActual && usuarioActual.isAnonymous) {
        // Vincular Google al invitado.
        // Conserva el UID y las estadísticas del jugador.
        const resultado = await linkWithPopup(
          usuarioActual,
          provider
        );

        usuarioGoogle = resultado.user;

      } else if (!usuarioActual) {
        // No existe sesión: iniciar sesión con Google.
        const resultado = await signInWithPopup(
          auth,
          provider
        );

        usuarioGoogle = resultado.user;
        cambioCuenta = true;

      } else {
        // Ya existe una cuenta vinculada.
        refrescarUI();
        return;
      }

    } catch (error) {
      const codigo = error?.code;

      // La cuenta de Google ya pertenece a otro usuario.
      if (
        codigo === 'auth/credential-already-in-use' ||
        codigo === 'auth/email-already-in-use'
      ) {
        const credencial =
          GoogleAuthProvider.credentialFromError(error);

        if (!credencial) {
          throw new Error('NO_SE_PUDO_RECUPERAR_CREDENCIAL');
        }

        const resultado = await signInWithCredential(
          auth,
          credencial
        );

        usuarioGoogle = resultado.user;
        cambioCuenta = true;

      } else {
        throw error;
      }
    }

    if (!usuarioGoogle) {
      throw new Error('USUARIO_GOOGLE_NO_DISPONIBLE');
    }

    // ------------------------------------------------
    // CASO 1: Entró en una cuenta Google diferente.
    // ------------------------------------------------
    if (cambioCuenta) {
      await entrarACuentaExistente();

      modoEdicion = false;

      if (enAcceso) {
        ir('seleccionModoJuego');
      }

      sonido('click');
      return;
    }

    // ------------------------------------------------
    // CASO 2: Vinculó correctamente al invitado.
    // ------------------------------------------------

    // Comprobar que el perfil conserva el UID original.
    if (perfilAnterior && perfilAnterior.uid === usuarioGoogle.uid) {
      perfil = perfilAnterior;
    }

    // Si no existía perfil, recuperar o crear uno.
    if (!perfil || perfil.uid !== usuarioGoogle.uid) {
      perfil = leerLocal(usuarioGoogle.uid) ||
        await crearPerfilBase(usuarioGoogle.uid);
    }

    guardarLocal();

    // Guardar estadísticas y perfil en Firestore.
    const guardado = await guardarNube();

    refrescarUI();

    if (!guardado) {
      info(
        'Cuenta vinculada',
        '<p>Google se ha vinculado, pero no se pudieron sincronizar los datos con Firestore. Comprueba tu conexión y las reglas de seguridad.</p>'
      );
      return;
    }

    if (enAcceso) {
      modoEdicion = false;
      ir('perfilUsuario');
    }

    sonido('click');

  } catch (error) {
    const codigo = error?.code || error?.message || '';

    console.error(
      'ERROR AL VINCULAR GOOGLE:',
      codigo,
      error
    );

    if (
      codigo === 'auth/popup-closed-by-user' ||
      codigo === 'auth/cancelled-popup-request'
    ) {
      return;
    }

    if (codigo === 'auth/popup-blocked') {
      info(
        'Ventana bloqueada',
        '<p>Tu navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes e inténtalo nuevamente.</p>'
      );

    } else if (
      codigo === 'auth/unauthorized-domain'
    ) {
      info(
        'Dominio no autorizado',
        '<p>Agrega el dominio de tu juego en Firebase Authentication → Settings → Authorized domains.</p>'
      );

    } else if (
      codigo === 'auth/operation-not-allowed' ||
      codigo === 'auth/admin-restricted-operation'
    ) {
      info(
        'Google no está activado',
        '<p>En Firebase entra en Authentication → Sign-in method y activa el proveedor Google.</p>'
      );

    } else if (
      codigo === 'auth/credential-already-in-use' ||
      codigo === 'auth/email-already-in-use'
    ) {
      info(
        'Cuenta ya registrada',
        '<p>Esta cuenta de Google ya está vinculada a otro usuario. Intenta entrar directamente con esa cuenta.</p>'
      );

    } else if (
      codigo === 'auth/network-request-failed'
    ) {
      info(
        'Error de conexión',
        '<p>No se pudo conectar con Google. Comprueba tu conexión a Internet.</p>'
      );

    } else {
      info(
        'Error con Google',
        '<p>No se pudo completar la vinculación. Código: ' +
        String(codigo) +
        '</p>'
      );
    }

    sonido('error');

  } finally {
    ocupadoGoogle = false;
  }
}


  // ------------------------------------------------------------ cerrar sesión
  async function hacerCierre() {
    try { await online.abandonarSalaSilenciosa(); } catch (e) { /* no estaba en una sala */ }
    if (perfil) lsDel(PREFIJO_PERFIL + perfil.uid);
    lsDel(CLAVE_APODO);
    const campo = $('nombreJugadorOnline');
    if (campo) campo.value = '';
    try { await signOut(auth); } catch (e) { console.warn('Perfil: signOut falló:', e && (e.code || e)); }
    try { online.reiniciarAuth(); } catch (e) { /* se ignora */ }
    perfil = null;
    modoEdicion = false;
    refrescarUI();
    try { await online.asegurarAuth(); } catch (e) { /* se pedirá de nuevo al continuar */ }
    prepararAcceso(false);
  }

  function cerrarSesion() {
    cerrarMenuLateral();
    sonido('click');
    const msg = esVinculada() ? t('salir.vinculada') : t('salir.invitado');
    return new Promise((resolver) => {
      confirmModal(msg, (ok) => {
        if (!ok) { resolver(false); return; }
        hacerCierre().then(() => resolver(true), () => resolver(false));
      });
    });
  }

  // ------------------------------------------------------------ menú lateral
  function abrirMenuLateral() {
    const menu = $('drawerMenu');
    if (!menu) return;
    menuAbierto = true;
    refrescarUI();
    menu.classList.add('abierto');
    menu.setAttribute('aria-hidden', 'false');
    ocultar('drawerFondo', false);
    document.body.classList.add('drawer-abierto');
    const boton = $('btnMenuLateral');
    if (boton) boton.setAttribute('aria-expanded', 'true');
    try { menu.focus(); } catch (e) { /* sin foco */ }
  }

  function cerrarMenuLateral() {
    const menu = $('drawerMenu');
    if (!menu) return;
    const estabaAbierto = menuAbierto;
    menuAbierto = false;
    menu.classList.remove('abierto');
    menu.setAttribute('aria-hidden', 'true');
    ocultar('drawerFondo', true);
    document.body.classList.remove('drawer-abierto');
    const boton = $('btnMenuLateral');
    if (boton) {
      boton.setAttribute('aria-expanded', 'false');
      if (estabaAbierto) { try { boton.focus(); } catch (e) { /* sin foco */ } }
    }
  }

  function alternarMenuLateral() {
    if (menuAbierto) cerrarMenuLateral(); else abrirMenuLateral();
  }

  // ------------------------------------------------------------ recursos del menú
  function abrirEnlaceOInfo(url) {
    cerrarMenuLateral();
    sonido('click');
    if (url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { /* bloqueado */ } return; }
    info(t('info.titulo'), '<p>' + t('info.proximamente') + '</p>');
  }
  const abrirAyuda = () => abrirEnlaceOInfo(ENLACE_AYUDA);
  const abrirApoyo = () => abrirEnlaceOInfo(ENLACE_APOYO);

  function abrirReglas() {
    cerrarMenuLateral();
    sonido('click');
    info(t('reglas.titulo'), t('reglas.cuerpo'));
  }

  // ------------------------------------------------------------ inicio
  const guardado = lsGet(CLAVE_IDIOMA);
  if (guardado && TEXTOS[guardado]) idioma = guardado;

  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.lang)));

  const campoApodo = $('authApodo');
  if (campoApodo) campoApodo.addEventListener('keydown', (e) => { if (e && e.key === 'Enter') confirmarAuth(); });

  // Esc cierra el menú (salvo que haya un modal encima)
  document.addEventListener('keydown', (e) => {
    if (e && e.key === 'Escape' && menuAbierto && !document.body.classList.contains('modal-abierto')) cerrarMenuLateral();
  });

  // Deslizar el menú hacia la izquierda lo cierra
  const panel = $('drawerMenu');
  if (panel) {
    panel.setAttribute('tabindex', '-1');
    let x0 = null;
    panel.addEventListener('touchstart', (e) => { x0 = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const x1 = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : x0;
      if (x1 - x0 < -60) cerrarMenuLateral();
      x0 = null;
    }, { passive: true });
  }

  aplicarIdioma();

  return {
    perfilArranque, perfilAsegurar,
    confirmarAuth, editarPerfil, cancelarAuth, abrirPerfil, volverDePerfil,
    conGoogle, cerrarSesion,
    abrirMenuLateral, cerrarMenuLateral, alternarMenuLateral,
    abrirAyuda, abrirReglas, abrirApoyo,
    cambiarIdioma, obtenerIdioma,
    obtenerPerfil: () => perfil,
    registrarPartida, registrarSiEsMio
  };
}
