// Perfil, estadísticas por usuario, idioma, menú lateral, Google y cierre de sesión (Firestore/Auth simulados)
import * as FS from './mock-fs.mjs';
import * as AU from './mock-auth.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = console.log;
const falla = (m) => { throw new Error(m); };
const igual = (a, b, m) => { if (a !== b) falla(`${m}: esperaba ${JSON.stringify(b)} y fue ${JSON.stringify(a)}`); };

// ---- navegador mínimo
globalThis.window = globalThis;
const __ls = new Map();
globalThis.localStorage = { getItem: (k) => (__ls.has(k) ? __ls.get(k) : null), setItem: (k, v) => __ls.set(k, String(v)), removeItem: (k) => __ls.delete(k) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'es-ES' }, configurable: true });
const mk = () => {
  const cls = new Set(); const e = {
    dataset: {}, style: {}, children: [], childNodes: [], listeners: {}, attrs: {}, textContent: '', value: '', className: '',
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), toggle: (c, f) => { ((f === undefined) ? !cls.has(c) : f) ? cls.add(c) : cls.delete(c); }, contains: (c) => cls.has(c) },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(t, f) { this.listeners[t] = f; },
    appendChild(c) { this.children.push(c); this.childNodes.push(c); }, focus() { }, querySelectorAll: () => []
  }; return e;
};
const ids = {}; const $ = (id) => (ids[id] ||= mk());
const reg = { i18n: [], ph: [], title: [], lang: [] };
const kd = [];
const bodyCls = new Set();
globalThis.document = {
  documentElement: {}, activeElement: null, createElement: mk,
  body: { classList: { add: (c) => bodyCls.add(c), remove: (c) => bodyCls.delete(c), contains: (c) => bodyCls.has(c) } },
  querySelectorAll: (s) => ({ '[data-i18n]': reg.i18n, '[data-i18n-ph]': reg.ph, '[data-i18n-title]': reg.title, '[data-lang]': reg.lang }[s] || []),
  addEventListener: (t, f) => { if (t === 'keydown') kd.push(f); }
};
// elementos traducibles de ejemplo (los mismos atributos que usa index.html)
const tr = (id, clave) => { $(id).dataset.i18n = clave; reg.i18n.push($(id)); };
tr('t_salir', 'menu.salir'); tr('t_perfil', 'menu.perfil'); tr('t_puntos', 'perfil.puntos');
$('authApodo').dataset.i18nPh = 'auth.ph'; reg.ph.push($('authApodo'));
['es', 'en'].forEach((l) => { const b = mk(); b.dataset.lang = l; reg.lang.push(b); ids['lang_' + l] = b; });
$('drawerMenu'); $('drawerFondo').classList.add('oculto');

const { initPerfil, calcularDelta, gano, normalizarStats, statsVacias } = await import('./perfil-test.mjs');

// ============ 1) lógica pura ============
{
  const c = calcularDelta('civil', true), i = calcularDelta('impostor', true), s = calcularDelta('srblanco', false), p = calcularDelta('civil', false);
  log('1) puntos -> civil gana:', c.puntos, '| impostor gana:', i.puntos, '| Sr. Blanco pierde:', s.puntos, '| civil pierde:', p.puntos);
  igual(c.puntos, 60, 'civil gana'); igual(i.puntos, 85, 'impostor gana'); igual(s.puntos, 10, 'srblanco pierde'); igual(p.puntos, 10, 'civil pierde');
  igual(i.impostor, 1, 'cuenta impostor'); igual(i.victoriasImpostor, 1, 'victoria impostor'); igual(s.srBlanco, 1, 'cuenta srBlanco'); igual(c.victoriasCivil, 1, 'victoria civil');
  igual(gano('civil', 'civiles'), true, 'gano civil'); igual(gano('impostor', 'civiles'), false, 'impostor pierde'); igual(gano('srblanco', 'empate'), false, 'empate');
  const n = normalizarStats({ puntos: -5, victorias: '7', partidas: NaN, x: 3 }); igual(n.puntos, 0, 'negativo'); igual(n.victorias, 7, 'texto numérico'); igual(n.partidas, 0, 'NaN'); igual(Object.keys(n).length, 8, 'solo 8 contadores');
}

// ============ entorno ============
const app = { __auth: { currentUser: null, __uid: 'uA' } };
const espias = { reiniciarAuth: 0, salirSala: 0 };
const modales = []; let pantalla = null;
const online = {
  asegurarAuth: () => (app.__auth.currentUser ? Promise.resolve(app.__auth.currentUser) : AU.signInAnonymously(app.__auth).then((c) => c.user)),
  reiniciarAuth: () => { espias.reiniciarAuth++; }, abandonarSalaSilenciosa: async () => { espias.salirSala++; }
};
const api = initPerfil({
  app, db: {}, $, cambiarPantalla: (id) => { pantalla = id; }, crearModal: (m) => modales.push(m), confirmModal: (msg, cb) => { modales.push({ confirm: msg }); cb(true); },
  reproducirSonido() { }, validarTextoCampo: (t) => (t.length > 20 ? { valido: false, motivo: 'demasiado largo' } : { valido: true, texto: t }),
  normalizarNombre: (t) => String(t || '').toLowerCase().trim(), CONFIG_JUEGO: { MAX_LONGITUD_NOMBRE: 20 }, online
});
const doc = (uid) => FS.__store.get('usuarios/' + uid);

// ============ 2) primera vez: acceso con apodo vacío ============
{
  const mostro = await api.perfilArranque();
  log('2) primera vez -> pantalla de acceso:', mostro, '|', pantalla, '| avatares dibujados:', $('authAvatares').children.length);
  igual(mostro, true, 'debía mostrar el acceso'); igual(pantalla, 'authPerfil', 'pantalla'); igual($('authAvatares').children.length, 12, '12 avatares');
  $('authApodo').value = '   ';
  await api.confirmarAuth();
  await sleep(50);
  log('   sin escribir apodo ->', api.obtenerPerfil().nombre, '| va a:', pantalla, '| apodo guardado:', localStorage.getItem('impostor_apodo'));
  igual(api.obtenerPerfil().nombre, 'Jugador Anónimo', 'nombre por defecto'); igual(pantalla, 'seleccionModoJuego', 'va al menú'); igual(localStorage.getItem('impostor_apodo'), null, 'no guarda el apodo por defecto');
  igual(doc('uA').nombre, 'Jugador Anónimo', 'documento remoto creado'); igual(doc('uA').stats.partidas, 0, 'stats remotas en cero');
  igual(await api.perfilArranque(), false, 'con perfil ya no vuelve a pedirlo');   // 2.ª visita
}

// ============ 3) editar perfil: apodo + avatar seleccionable ============
{
  api.editarPerfil();
  $('authApodo').value = 'Beto';
  $('authAvatares').children[2].listeners.click();            // 🦊 -> tercer avatar
  const activo = $('authAvatares').children.filter((b) => b.classList.contains('activo')).map((b) => b.dataset.avatar);
  log('3) avatar activo:', activo.join(), '| vista previa:', $('authAvatarActual').textContent);
  igual(activo.length, 1, 'un solo avatar activo'); igual(activo[0], '🦊', 'avatar elegido');
  await api.confirmarAuth(); await sleep(50);
  igual(api.obtenerPerfil().nombre, 'Beto', 'nombre editado'); igual(localStorage.getItem('impostor_apodo'), 'Beto', 'apodo recordado'); igual($('nombreJugadorOnline').value, 'Beto', 'campo de sala');
  igual(pantalla, 'perfilUsuario', 'vuelve al perfil'); igual($('perfilAvatar').textContent, '🦊', 'avatar en el perfil'); igual($('drawerNombre').textContent, 'Beto', 'nombre en el menú');
  igual(doc('uA').avatar, '🦊', 'avatar remoto');
  $('authApodo').value = 'x'.repeat(30); api.editarPerfil(); $('authApodo').value = 'x'.repeat(30); await api.confirmarAuth();
  igual($('authError').classList.contains('oculto'), false, 'debía mostrar el error de apodo largo'); log('   apodo demasiado largo -> error visible OK');
}

// ============ 4) estadísticas personales ============
{
  await api.registrarPartida({ rol: 'civil', gano: true, clave: 'SALA1:1' });
  await api.registrarPartida({ rol: 'civil', gano: true, clave: 'SALA1:1' });          // repetida => no cuenta
  await api.registrarPartida({ rol: 'impostor', gano: true, clave: 'SALA1:2' });
  await api.registrarPartida({ rol: 'srblanco', gano: false, clave: 'SALA1:3' });
  await sleep(50);
  const s = api.obtenerPerfil().stats;
  log('4) stats ->', JSON.stringify({ puntos: s.puntos, victorias: s.victorias, partidas: s.partidas, impostor: s.impostor }));
  igual(s.puntos, 155, 'puntos'); igual(s.victorias, 2, 'victorias'); igual(s.partidas, 3, 'partidas (la repetida no cuenta)'); igual(s.impostor, 1, 'veces impostor');
  igual(s.victoriasImpostor, 1, 'v. impostor'); igual(s.victoriasCivil, 1, 'v. civil'); igual(s.srBlanco, 1, 'veces Sr. Blanco');
  igual($('statPuntos').textContent, '155', 'tarjeta Puntos'); igual($('statVictorias').textContent, '2', 'tarjeta Victorias'); igual($('statPartidas').textContent, '3', 'tarjeta Partidas'); igual($('statImpostor').textContent, '1', 'tarjeta Impostor');
  igual(doc('uA').stats.puntos, 155, 'Firestore puntos'); igual(doc('uA').stats.partidas, 3, 'Firestore partidas');
  igual(api.registrarSiEsMio(' BETO ', { rol: 'civil', gano: false }), true, 'partida local del mismo jugador'); await sleep(30);
  igual(api.registrarSiEsMio('Otro', { rol: 'civil', gano: false }), false, 'otro jugador no suma');
  igual(api.obtenerPerfil().stats.partidas, 4, 'partida local sumada'); log('   partida local de «Beto» sumó; la de «Otro» no OK');
  // reconciliación: si lo local supera a la nube (p. ej. escrituras perdidas), se sube
  api.obtenerPerfil().stats.partidas = 50;
  await api.abrirPerfil(); await sleep(80);
  igual(doc('uA').stats.partidas, 50, 'la nube alcanza lo local');
}

// ============ 5) idioma ============
{
  api.cambiarIdioma('en');
  log('5) inglés ->', $('t_salir').textContent, '|', $('t_perfil').textContent, '| placeholder:', $('authApodo').attrs.placeholder, '| guardado:', localStorage.getItem('impostor_idioma'));
  igual($('t_salir').textContent, 'Log out', 'menu.salir'); igual($('t_puntos').textContent, 'Points', 'perfil.puntos'); igual(localStorage.getItem('impostor_idioma'), 'en', 'persistencia');
  igual(ids.lang_en.classList.contains('activo'), true, 'chip English activo'); igual(ids.lang_es.classList.contains('activo'), false, 'chip Español apagado'); igual(ids.lang_en.attrs['aria-pressed'], 'true', 'aria-pressed');
  ids.lang_es.listeners.click();                                                     // el chip también funciona con clic
  igual($('t_salir').textContent, 'Cerrar sesión', 'vuelve a español'); igual(api.obtenerIdioma(), 'es', 'idioma actual');
}

// ============ 6) menú lateral ============
{
  api.abrirMenuLateral();
  log('6) menú abierto -> panel:', ids.drawerMenu.classList.contains('abierto'), '| fondo visible:', !ids.drawerFondo.classList.contains('oculto'), '| scroll bloqueado:', bodyCls.has('drawer-abierto'), '| aria-hidden:', ids.drawerMenu.attrs['aria-hidden']);
  igual(ids.drawerMenu.classList.contains('abierto'), true, 'abierto'); igual(ids.drawerFondo.classList.contains('oculto'), false, 'fondo'); igual(bodyCls.has('drawer-abierto'), true, 'scroll'); igual(ids.btnMenuLateral.attrs['aria-expanded'], 'true', 'aria-expanded');
  kd.forEach((f) => f({ key: 'Escape' }));
  igual(ids.drawerMenu.classList.contains('abierto'), false, 'Esc cierra'); igual(bodyCls.has('drawer-abierto'), false, 'scroll libre');
  api.abrirMenuLateral(); bodyCls.add('modal-abierto'); kd.forEach((f) => f({ key: 'Escape' }));
  igual(ids.drawerMenu.classList.contains('abierto'), true, 'con un modal encima, Esc no cierra el menú'); bodyCls.delete('modal-abierto');
  ids.drawerMenu.listeners.touchstart({ touches: [{ clientX: 250 }] }); ids.drawerMenu.listeners.touchend({ changedTouches: [{ clientX: 120 }] });
  igual(ids.drawerMenu.classList.contains('abierto'), false, 'deslizar a la izquierda cierra'); log('   Esc, modal encima y deslizar OK');
  api.alternarMenuLateral(); igual(ids.drawerMenu.classList.contains('abierto'), true, 'alternar abre'); api.alternarMenuLateral(); igual(ids.drawerMenu.classList.contains('abierto'), false, 'alternar cierra');
  api.abrirAyuda(); igual(modales.at(-1).title, 'Información', 'sin enlace => «próximamente»'); api.abrirReglas(); igual(modales.at(-1).title, 'Reglas del juego', 'reglas');
}

// ============ 7) vincular Google (conserva el uid y las estadísticas) ============
{
  const antes = api.obtenerPerfil().stats.partidas;
  await api.conGoogle(); await sleep(50);
  log('7) invitado + Google ->', $('drawerSub').textContent, '| uid conservado:', app.__auth.currentUser.uid, '| partidas:', api.obtenerPerfil().stats.partidas);
  igual(app.__auth.currentUser.uid, 'uA', 'mismo uid'); igual($('drawerSub').textContent, 'ana@gmail.com', 'cuenta vinculada visible'); igual($('perfilTipoCuenta').textContent, 'Cuenta vinculada', 'etiqueta'); igual(api.obtenerPerfil().stats.partidas, antes, 'estadísticas intactas');
  igual($('btnPerfilVincular').classList.contains('oculto'), true, 'ya no ofrece vincular');
}

// ============ 8) cerrar sesión: cuenta vinculada conserva sus datos en la nube ============
{
  await api.cerrarSesion(); await sleep(80);
  log('8) logout (vinculada) -> mensaje:', modales.filter((m) => m.confirm).at(-1).confirm.slice(0, 40) + '…', '| pantalla:', pantalla, '| salió de la sala:', espias.salirSala, '| reinició auth:', espias.reiniciarAuth);
  igual(pantalla, 'authPerfil', 'redirige a la pantalla de acceso'); igual(espias.salirSala, 1, 'abandona la sala'); igual(espias.reiniciarAuth, 1, 'reinicia auth');
  igual(localStorage.getItem('perfil_x'), null, 'n/a'); igual(localStorage.getItem('impostor_perfil_uA'), null, 'borra el perfil local'); igual(localStorage.getItem('impostor_apodo'), null, 'borra el apodo');
  igual(doc('uA').stats.partidas, 50, 'la nube conserva las estadísticas'); igual($('nombreJugadorOnline').value, '', 'campo de sala vacío');
  igual(api.obtenerPerfil(), null, 'sin perfil activo'); igual(app.__auth.currentUser.uid !== 'uA', true, 'nuevo usuario anónimo');
}

// ============ 9) otro usuario no hereda datos; volver con Google recupera los de la nube ============
{
  $('authApodo').value = 'Zoe'; await api.confirmarAuth(); await sleep(30);
  await api.registrarPartida({ rol: 'civil', gano: true, clave: 'S2:1' }); await sleep(30);
  const uidZoe = app.__auth.currentUser.uid;
  log('9) usuario nuevo «Zoe» (' + uidZoe + ') -> partidas:', api.obtenerPerfil().stats.partidas, '| partidas de Beto en su doc:', doc('uA').stats.partidas);
  igual(api.obtenerPerfil().stats.partidas, 1, 'sus datos son solo suyos'); igual(doc('uA').stats.partidas, 50, 'el doc de Beto no cambió'); igual(doc(uidZoe).nombre, 'Zoe', 'doc de Zoe');
  // Google: la cuenta ya existía (uA) => se entra a ella y se cargan sus datos
  FS.__store.set('usuarios/uGOOGLE', { nombre: 'Ana G', avatar: '🦄', stats: { ...statsVacias(), partidas: 10, victorias: 4, puntos: 340, impostor: 2 } });
  AU.__cfg.linkError = 'auth/credential-already-in-use';
  await api.conGoogle(); await sleep(80);
  const p = api.obtenerPerfil();
  log('   Google (cuenta existente) -> uid:', app.__auth.currentUser.uid, '| nombre:', p.nombre, '| partidas:', p.stats.partidas, '| puntos:', $('statPuntos').textContent, '| salió de la sala:', espias.salirSala);
  igual(app.__auth.currentUser.uid, 'uGOOGLE', 'entró a la cuenta existente'); igual(p.nombre, 'Ana G', 'nombre de la nube'); igual(p.avatar, '🦄', 'avatar de la nube'); igual(p.stats.partidas, 10, 'partidas de la nube'); igual($('statPuntos').textContent, '340', 'tarjeta con datos de la cuenta');
  AU.__cfg.linkError = null;
  const err = modales.length; AU.__cfg.linkError = 'auth/operation-not-allowed';
  app.__auth.currentUser = { uid: 'uZ', isAnonymous: true, providerData: [] }; await api.conGoogle();
  igual(modales.at(-1).body.includes('Authentication'), true, 'explica cómo activar Google'); log('   Google sin configurar -> mensaje de ayuda OK');
}
log('✅ PRUEBA DE PERFIL, ESTADÍSTICAS, IDIOMA, MENÚ Y SESIÓN OK');
process.exit(0);
