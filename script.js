// 1. Importar Firebase y Firestore desde la CDN oficial
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { initOnline } from "./online.js";
import { efectoFinPartida, limpiarEfectos } from "./efectos.js";

// 2. Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCwzYGf8xlxQP7ROxDSQr1cvdoIzZQzcrc",
  authDomain: "juego-impostor-2046xo.firebaseapp.com",
  projectId: "juego-impostor-2046xo",
  storageBucket: "juego-impostor-2046xo.firebasestorage.app",
  messagingSenderId: "956691147406",
  appId: "1:956691147406:web:b11ba47ea56f0a978d37df"
};

// 3. Inicializar Firebase y la Base de Datos
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log("¡Firebase conectado con éxito!");


/*
 * Sincronización de categorías con Cloud Firestore.
 * Los documentos existentes se identifican por su ID real.
 */

const LS_PREFIX = 'impostor_';

const estado = {
  jugadores: ['Jugador 1', 'Jugador 2', 'Jugador 3'],
  categorias: {
    'Comida': [
      { palabra: 'Pizza', pistas: ['Queso', 'Circular', 'Horno'] },
      { palabra: 'Sancocho', pistas: ['Sopa', 'Gallina', 'Culantro'] }
    ],
    'Animales': [
      { palabra: 'Perro', pistas: ['Ladrar', 'Mascota', 'Hueso'] },
      { palabra: 'Gato', pistas: ['Maullar', 'Mascota', 'Bigotes'] }
    ]
  },
  categoriasSeleccionadas: ['Comida', 'Animales'],
  modoJuego: 'clasico',
  tipoVotacion: 'general',
  numJugadores: 3,
  numImpostores: 1,
  pistaImpostor: 'si',
  categoriaImpostor: 'no',
  impostoresSeConocen: 'no',
  duracionPartida: 3,
  numRondas: 10,
  estadisticas: {}
};

const categoriaDocIds = new Map();

async function guardarCategoriaNube(nombreCategoria, listaPalabras = []) {
  try {
    const idExistente = categoriaDocIds.get(nombreCategoria);

    const datos = {
      nombre: nombreCategoria,
      palabras: listaPalabras,
      actualizadoEn: serverTimestamp()
    };

    if (idExistente) {
      // Actualiza el documento existente; no crea un duplicado.
      await setDoc(
        doc(db, "categorias", idExistente),
        datos,
        { merge: true }
      );
    } else {
      // Solo crea un documento si todavía no conocemos uno para esta categoría.
      const referencia = await addDoc(
        collection(db, "categorias"),
        {
          ...datos,
          creadoEn: serverTimestamp()
        }
      );

      categoriaDocIds.set(nombreCategoria, referencia.id);
    }

    console.log("Categoría guardada en Firestore:", nombreCategoria);
    return true;
  } catch (error) {
    console.error("Error al guardar la categoría:", error);
    crearModal({
      title: "Error de sincronización",
      body: "<p>No se pudieron guardar los cambios en la nube. Revisa tu conexión y las reglas de Firestore.</p>",
      okText: "Cerrar",
      onCancel: null
    });
    return false;
  }
}

// Mantiene compatible la llamada que ya usa agregarCategoria().
async function guardarNuevaCategoriaNube(nombreCategoria, listaPalabras = []) {
  return guardarCategoriaNube(nombreCategoria, listaPalabras);
}

async function eliminarCategoriaNube(nombreCategoria) {
  try {
    const id = categoriaDocIds.get(nombreCategoria);

    if (!id) {
      console.error("No se encontró el ID de Firestore para:", nombreCategoria);
      return false;
    }

    await deleteDoc(doc(db, "categorias", id));
    categoriaDocIds.delete(nombreCategoria);

    console.log("Categoría eliminada de Firestore:", nombreCategoria);
    return true;
  } catch (error) {
    console.error("Error al eliminar categoría:", error);
    crearModal({
      title: "Error de sincronización",
      body: "<p>No se pudo eliminar la categoría de la nube.</p>",
      okText: "Cerrar",
      onCancel: null
    });
    return false;
  }
}

function escucharCategoriasFirebase() {
  return onSnapshot(
    collection(db, "categorias"),
    (snapshot) => {
      if (snapshot.empty) return; // nube vacía: se conservan las categorías locales
      const categoriasNuevas = {};
      const idsNuevos = new Map();

      snapshot.forEach((documento) => {
        const data = documento.data();

        if (
          typeof data.nombre === "string" &&
          Array.isArray(data.palabras)
        ) {
          categoriasNuevas[data.nombre] = data.palabras;
          idsNuevos.set(data.nombre, documento.id);
        }
      });

      // Mantiene seleccionadas las categorías que todavía existen.
      const seleccionAnterior = estado.categoriasSeleccionadas || [];

      estado.categorias = categoriasNuevas;
      categoriaDocIds.clear();

      idsNuevos.forEach((id, nombre) => {
        categoriaDocIds.set(nombre, id);
      });

      estado.categoriasSeleccionadas = Object.keys(categoriasNuevas)
        .filter((nombre) =>
          seleccionAnterior.includes(nombre)
        );

      // Si no había ninguna selección válida, selecciona todas.
      if (estado.categoriasSeleccionadas.length === 0) {
        estado.categoriasSeleccionadas = Object.keys(categoriasNuevas);
      }

      saveAll();

      console.log(
        "Categorías recibidas de Firestore:",
        Object.keys(estado.categorias).length
      );

      if (typeof mostrarCategorias === "function") {
        mostrarCategorias();
      }

      if (typeof mostrarSeleccionCategorias === "function") {
        mostrarSeleccionCategorias();
      }
    },
    (error) => {
      console.error("Error al sincronizar categorías:", error);
    }
  );
}

escucharCategoriasFirebase();


let orden = [], indiceActual = 0, palabraRonda = "", pistasRonda = [], palabraImpostor = "";
let impostores = [], srBlanco = [], jugadoresActivos = [], civilesRestantes = 0;
let impostoresOriginales = [], srBlancoOriginales = [];
let categoriaActual = "", palabraEnEdicionIndex = -1, categoriaRonda = "";
let tiempoRestante = 0, cronometroInterval = null, cronometroActivo = false;
let votosRonda = {}, indiceVotante = 0, ordenVotacion = [], votoActual = null;
let votoGeneral = null;
let cartaRevelada = false;
let ordenSrBlanco = [];
let historialSrBlanco = [];
let historialImpostores = [];
let ganador = null;
let partidaFinalizada = false;
let ultimoExpulsado = null;
let rolUltimoExpulsado = null;

// ============================== CONSTANTES DE CONFIGURACIÓN (evita "números mágicos") ==============================
const CONFIG_JUEGO = {
  MIN_JUGADORES: 3,
  MAX_JUGADORES: 20,
  MIN_JUGADORES_MISTERIO: 5,
  MIN_JUGADORES_CAOS: 6,
  MAX_RONDAS: 50,
  MAX_LONGITUD_NOMBRE: 20,
  MAX_LONGITUD_CATEGORIA: 30,
  MAX_LONGITUD_PISTA: 25,
  TIEMPO_CUENTA_REGRESIVA_MS: 1000,
  TIEMPO_TRAS_CUENTA_MS: 2000,
  TIEMPO_FOCO_MODAL_MS: 40,
  TIEMPO_INICIO_MUSICA_MS: 500,
  SIMILITUD_MINIMA_SR_BLANCO: 0.6,
  VOLUMEN_GENERAL: 0.6,
  VOLUMEN_MUSICA_MENU: 0.3,
  VOLUMEN_TENSION: 0.4,
  VOLUMEN_TIEMPO_ACABANDO: 0.5,
  VERSION_DATOS: '2.0'
};

// Modo de depuración: actívalo desde la consola con `activarDebug()`.
// Nunca se activa solo ni se expone en la interfaz normal del juego.
let DEBUG_MODE = false;
function activarDebug() { DEBUG_MODE = true; console.info('🐞 Modo debug activado'); mostrarDebugInfo(); }
function desactivarDebug() { DEBUG_MODE = false; console.info('🐞 Modo debug desactivado'); }
function mostrarDebugInfo() {
  if (!DEBUG_MODE) return;
  console.log('--- DEBUG EL IMPOSTOR ---', {
    categoriaRonda, palabraRonda, impostores, srBlanco,
    rondaActual, indiceActual, jugadorActivo: orden[indiceActual],
    palabrasUsadas
  });
}

// ============================== REGISTRO CENTRAL DE TEMPORIZADORES ==============================
// Todos los setTimeout/setInterval del juego se registran aquí para poder
// cancelarlos de una sola vez (al reiniciar, salir al menú o importar datos).
const temporizadoresActivos = new Set();

function crearTimeout(fn, ms) {
  const id = setTimeout(() => { temporizadoresActivos.delete(id); fn(); }, ms);
  temporizadoresActivos.add(id);
  return id;
}

function crearIntervalo(fn, ms) {
  const id = setInterval(fn, ms);
  temporizadoresActivos.add(id);
  return id;
}

function limpiarTemporizador(id) {
  clearTimeout(id);
  clearInterval(id);
  temporizadoresActivos.delete(id);
}

function limpiarTodosLosTemporizadores() {
  temporizadoresActivos.forEach(id => {
    clearTimeout(id);
    clearInterval(id);
  });
  temporizadoresActivos.clear();
  cronometroInterval = null;
  cronometroActivo = false;
}

// ============================== VALIDADORES REUTILIZABLES ==============================
// Validan la forma de los datos antes de usarlos, para que una categoría
// mal importada o editada a mano nunca rompa una partida.
function validarPistas(pistas) {
  return Array.isArray(pistas) && pistas.length > 0 && pistas.every(p => typeof p === 'string' && p.trim().length > 0);
}

function validarPalabra(item) {
  return !!item && typeof item.palabra === 'string' && item.palabra.trim().length > 0 && validarPistas(item.pistas);
}

function validarCategoria(nombreCategoria) {
  const lista = estado.categorias && estado.categorias[nombreCategoria];
  return Array.isArray(lista) && lista.some(validarPalabra);
}

function obtenerCategoriasValidas() {
  return Object.keys(estado.categorias || {}).filter(validarCategoria);
}

function normalizarNombre(texto) {
  // Ignora mayúsculas, espacios extra y emojis para comparar nombres/categorías.
  return (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validarTextoCampo(texto, maxLongitud) {
  const limpio = (texto || '').trim();
  if (!limpio) return { valido: false, motivo: 'El campo no puede estar vacío.' };
  if (limpio.replace(/\s/g, '').length === 0) return { valido: false, motivo: 'El campo no puede ser solo espacios.' };
  if (limpio.length > maxLongitud) return { valido: false, motivo: `Máximo ${maxLongitud} caracteres.` };
  return { valido: true, texto: limpio };
}

// ============================== SISTEMA DE SONIDOS COMPLETO ==============================
// Ruta base real de la carpeta de sonidos (¡singular, según el proyecto!)
const SONIDOS_BASE = "sonido/";

// Formato de los efectos: "mp3" (por defecto) o "webm" (Opus, más ligero). Para pasar a webm ejecuta
// `sh convertir_sonidos.sh` (crea un .webm junto a cada .mp3) y cambia esta constante a "webm".
// Si un .webm no existe o el navegador no lo soporta, se usa automáticamente el .mp3 de respaldo.
const FORMATO_AUDIO = "webm";

function crearAudio(ruta) {
  const base = ruta.replace(/\.(mp3|webm)$/i, "");
  const soportaWebm = !!new Audio().canPlayType('audio/webm; codecs="opus"');
  const ext = FORMATO_AUDIO === "webm" && soportaWebm ? "webm" : "mp3";
  const a = new Audio(`${SONIDOS_BASE}${base}.${ext}`);
  a.preload = "auto";
  // Si el archivo no existe o falla al cargar, lo marcamos para no
  // intentar reproducirlo en bucle generando errores en consola.
  a.addEventListener("error", () => {
    if (ext === "webm" && !a._reintentoMp3) {
      a._reintentoMp3 = true; // respaldo: el mismo sonido en mp3
      a.src = `${SONIDOS_BASE}${base}.mp3`;
      a.load();
      return;
    }
    a._fallo = true;
    console.warn(`No se pudo cargar el sonido: ${a.src}`);
  });
  return a;
}

const sonidos = {
  // 🎮 SONIDOS DE JUEGO
  revelar: crearAudio("juego/revelar.mp3"),
  votar: crearAudio("juego/votar.mp3"),
  eliminar: crearAudio("juego/eliminar.mp3"),
  cuenta_regresiva: crearAudio("juego/cuenta_regresiva.mp3"),
  tension: crearAudio("juego/tension.mp3"),

  // 🏆 SONIDOS DE RESULTADOS
  victoria: crearAudio("resultados/victoria.mp3"),
  derrota: crearAudio("resultados/derrota.mp3"),
  empate: crearAudio("resultados/empate.mp3"),
  sr_blanco_gana: crearAudio("resultados/sr_blanco_gana.mp3"),

  // 🖱️ SONIDOS DE UI
  click: crearAudio("ui/click.mp3"),
  hover: crearAudio("ui/hover.mp3"),
  whoosh: crearAudio("ui/whoosh.mp3"),

  // ⚡ SONIDOS ESPECIALES
  alerta: crearAudio("especiales/alerta.mp3"),
  error: crearAudio("especiales/error.mp3"),
  musica_menu: crearAudio("especiales/musica_menu.mp3"),
  tiempo_acabando: crearAudio("especiales/tiempo_acabando.mp3")
};

// Configurar volúmenes por defecto
Object.keys(sonidos).forEach(key => {
  if (sonidos[key]) {
    sonidos[key].volume = CONFIG_JUEGO.VOLUMEN_GENERAL;
  }
});

// Volúmenes específicos
if (sonidos.musica_menu) sonidos.musica_menu.volume = CONFIG_JUEGO.VOLUMEN_MUSICA_MENU;
if (sonidos.tension) sonidos.tension.volume = CONFIG_JUEGO.VOLUMEN_TENSION;
if (sonidos.tiempo_acabando) sonidos.tiempo_acabando.volume = CONFIG_JUEGO.VOLUMEN_TIEMPO_ACABANDO;

// Bandera global de silencio (opcional, controlable desde la UI si se agrega un botón)
let sonidoSilenciado = false;

function reproducirSonido(nombre, opciones = {}) {
  if (sonidoSilenciado) return;

  const s = sonidos[nombre];
  if (!s) {
    console.warn(`Sonido "${nombre}" no encontrado`);
    return;
  }
  if (s._fallo) return; // ya sabemos que este archivo no carga, evitamos spamear errores

  // Detener el sonido si ya está reproduciéndose (opcional)
  if (opciones.detener !== false) {
    s.pause();
    s.currentTime = 0;
  }

  // Aplicar volumen personalizado si se especifica
  if (opciones.volumen !== undefined) {
    s.volume = opciones.volumen;
  }

  // Reproducir en loop si se especifica
  s.loop = !!opciones.loop;

  const intento = s.play();
  if (!intento || typeof intento.then !== "function") return;
  intento.then(() => ocultarAvisoAudio()).catch(err => {
    // Los navegadores bloquean el autoplay con sonido hasta que el usuario
    // interactúa con la página. Se muestra un aviso discreto («toca para activar el sonido»); la
    // música en bucle se retoma sola en cuanto el usuario toque la pantalla.
    if (err && err.name === "NotAllowedError") {
      if (opciones.loop) pendientesAutoplay.push({ nombre, opciones });
      mostrarAvisoAudio();
    } else {
      console.warn(`Error al reproducir "${nombre}":`, err);
    }
  });
}

// ---- Audio bloqueado por el navegador (política de autoplay) ----
// Cola de sonidos en bucle (música) que el navegador bloqueó; se retoman al desbloquear.
const pendientesAutoplay = [];
let audioDesbloqueado = false;
let avisoAudioEl = null;
// WAV silencioso mínimo: sirve para "pedir permiso" de audio sin que se escuche nada
const WAV_SILENCIO = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA";
const EVENTOS_DESBLOQUEO = ["pointerdown", "click", "keydown", "touchstart"];

function mostrarAvisoAudio() {
  if (audioDesbloqueado || avisoAudioEl || !document.body) return;
  avisoAudioEl = document.createElement("button");
  avisoAudioEl.type = "button";
  avisoAudioEl.id = "avisoAudio";
  avisoAudioEl.className = "aviso-audio";
  avisoAudioEl.textContent = "🔊 Toca para activar el sonido";
  avisoAudioEl.setAttribute("aria-label", "Tocar para activar el sonido del juego");
  avisoAudioEl.addEventListener("click", destrabarAutoplay);
  document.body.appendChild(avisoAudioEl);
}

function ocultarAvisoAudio() {
  audioDesbloqueado = true;
  if (avisoAudioEl) { avisoAudioEl.remove(); avisoAudioEl = null; }
  EVENTOS_DESBLOQUEO.forEach(ev => document.removeEventListener(ev, destrabarAutoplay));
}

// Se ejecuta con la primera interacción real del usuario (o al tocar el aviso)
function destrabarAutoplay() {
  if (audioDesbloqueado) return;
  try {
    const sonda = new Audio(WAV_SILENCIO);
    const p = sonda.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        ocultarAvisoAudio();
        const cola = pendientesAutoplay.splice(0, pendientesAutoplay.length);
        cola.forEach(({ nombre, opciones }) => reproducirSonido(nombre, opciones));
      }).catch(() => { /* sigue bloqueado: el aviso permanece y se reintenta en el próximo toque */ });
    }
  } catch (e) { /* un fallo de audio nunca debe romper la aplicación */ }
}
EVENTOS_DESBLOQUEO.forEach(ev => document.addEventListener(ev, destrabarAutoplay, { passive: true }));

function detenerSonido(nombre) {
  const s = sonidos[nombre];
  if (s) {
    s.pause();
    s.currentTime = 0;
  }
}

function detenerTodosSonidos() {
  Object.keys(sonidos).forEach(key => {
    if (sonidos[key]) {
      sonidos[key].pause();
      sonidos[key].currentTime = 0;
    }
  });
}

// ============================== ROTACIÓN DE CATEGORÍAS Y PALABRAS SIN REPETIR ==============================
let ordenCategoriasRonda = [];
let indiceCategoriaRonda = 0;
let palabrasUsadas = []; // guarda "categoria|palabra" ya usadas en la partida actual

function prepararOrdenCategorias() {
  // Solo se consideran categorías que realmente existen y tienen al menos
  // una palabra válida (palabra + pistas). Esto evita que una categoría
  // borrada, vacía o mal importada rompa la rotación.
  const categoriasValidasSeleccionadas = (estado.categoriasSeleccionadas || [])
    .filter(cat => validarCategoria(cat));

  const seleccionActual = [...categoriasValidasSeleccionadas].sort().join('|');
  const seleccionGuardada = [...ordenCategoriasRonda].sort().join('|');

  // Si aún no hay orden, o el usuario cambió las categorías seleccionadas, se recalcula
  if (ordenCategoriasRonda.length === 0 || seleccionActual !== seleccionGuardada) {
    ordenCategoriasRonda = mezclarArray(categoriasValidasSeleccionadas);
    indiceCategoriaRonda = 0;
  }
}

function obtenerSiguienteCategoria() {
  prepararOrdenCategorias();

  // Si ninguna categoría seleccionada es válida, no hay nada que devolver.
  if (ordenCategoriasRonda.length === 0) {
    console.warn('No hay categorías válidas seleccionadas.');
    return null;
  }

  if (indiceCategoriaRonda >= ordenCategoriasRonda.length) {
    // Se recorrieron todas las categorías seleccionadas: se vuelve a barajar el orden
    ordenCategoriasRonda = mezclarArray(ordenCategoriasRonda);
    indiceCategoriaRonda = 0;
  }
  const categoria = ordenCategoriasRonda[indiceCategoriaRonda];
  indiceCategoriaRonda++;
  return categoria;
}

/**
 * Elige una palabra sin repetir dentro de la categoría indicada.
 * Devuelve null si la categoría no existe, está vacía o no tiene
 * ninguna palabra válida (palabra + pistas en forma de arreglo).
 */
function elegirPalabraDeCategoria(categoria) {
  if (!validarCategoria(categoria)) {
    console.warn('Categoría inexistente o sin palabras válidas:', categoria);
    return null;
  }

  const palabras = estado.categorias[categoria].filter(validarPalabra);

  let disponibles = palabras.filter(p => !palabrasUsadas.includes(`${categoria}|${p.palabra}`));

  // Si ya se usaron todas las palabras de esta categoría, se reinicia solo su historial
  if (disponibles.length === 0) {
    palabrasUsadas = palabrasUsadas.filter(clave => !clave.startsWith(`${categoria}|`));
    disponibles = palabras;
  }

  const elegida = disponibles[Math.floor(Math.random() * disponibles.length)];
  palabrasUsadas.push(`${categoria}|${elegida.palabra}`);
  // Se devuelve una copia para que nadie modifique por referencia las
  // pistas originales de la categoría (ver también generarPalabraParecida).
  return { palabra: elegida.palabra, pistas: [...elegida.pistas] };
}

// ============================== FUNCIONES AUXILIARES ==============================
function mezclarArray(array) {
  if (!Array.isArray(array)) return [];
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function inicializarOrdenSrBlanco() {
  ordenSrBlanco = mezclarArray([...estado.jugadores]);
}

function obtenerPrimerJugadorValido() {
  const candidatos = orden.filter(j => !srBlanco.includes(j));
  return candidatos.length > 0 ? candidatos[0] : orden[0];
}

function seleccionarImpostoresSinRepetir(jugadores, cantidad) {
  let candidatos = jugadores.filter(j => !historialImpostores.includes(j));

  if (candidatos.length === 0) {
    historialImpostores = [];
    candidatos = [...jugadores];
  }

  if (candidatos.length < cantidad) {
    const adicionales = jugadores.filter(j => !candidatos.includes(j));
    candidatos = [...candidatos, ...adicionales];
  }

  const seleccionados = mezclarArray(candidatos).slice(0, cantidad);
  historialImpostores = [...historialImpostores, ...seleccionados].slice(-5);

  return seleccionados;
}

// ============================== RONDAS ==============================
let rondaActual = 1;
let MAX_RONDAS = 10;

function siguienteRonda() {
  detenerTodosSonidos();

  if (rondaActual >= MAX_RONDAS) {
    reproducirSonido('whoosh');
    cambiarPantalla('inicio');
    rondaActual = 1;

    // --- CÓDIGO NUEVO: Reiniciar la barra a 0% ---
    const barraProgreso = document.querySelector('.progress-bar');
    if (barraProgreso) {
      barraProgreso.style.width = '0%';
    }
    // ---------------------------------------------

    return;
  }
  rondaActual++;
  mostrarCuentaRegresivaRonda();
}

function mostrarCuentaRegresivaRonda() {
  reproducirSonido('cuenta_regresiva');
  cambiarPantalla('cuentaRegresiva');
  actualizarProgresoRondas();

  if ($('jugadorEmpieza')) {
    $('jugadorEmpieza').textContent = `RONDA ${rondaActual} / ${MAX_RONDAS}`;
  }

  let contador = 3;
  const numeroEl = $('numeroRegresivo');
  if (numeroEl) numeroEl.textContent = contador;

  const intervalo = crearIntervalo(() => {
    contador--;
    if (contador > 0) {
      if (numeroEl) numeroEl.textContent = contador;
      reproducirSonido('click');
    } else {
      limpiarTemporizador(intervalo);
      if (numeroEl) numeroEl.textContent = '¡YA!';
      reproducirSonido('alerta');
      crearTimeout(() => reiniciarRonda(), CONFIG_JUEGO.TIEMPO_TRAS_CUENTA_MS);
    }
  }, CONFIG_JUEGO.TIEMPO_CUENTA_REGRESIVA_MS);
}

function actualizarProgresoRondas() {
  const info = $('progressInfo');
  const bar = $('progressBar');

  if (info)
    info.textContent = `Ronda ${rondaActual} / ${MAX_RONDAS}`;

  if (bar)
    bar.style.width =
      `${Math.min(100, (rondaActual / MAX_RONDAS) * 100)}%`;
}

function reiniciarRonda() {
  impostores = [];
  srBlanco = [];
  jugadoresActivos = [...estado.jugadores];
  votosRonda = {};
  indiceVotante = 0;
  ordenVotacion = [];
  votoActual = null;
  partidaFinalizada = false;
  ultimoExpulsado = null;
  rolUltimoExpulsado = null;
  iniciarJuego();
}

function empezarPartida() {
  reproducirSonido('whoosh');
  MAX_RONDAS = parseInt($('numRondas')?.value || 10);
  rondaActual = 1;
  palabrasUsadas = [];          // 👈 reinicia palabras usadas de la partida anterior
  ordenCategoriasRonda = [];    // 👈 fuerza recalcular el orden de categorías
  indiceCategoriaRonda = 0;
  indiceActual = 0;
  votosRonda = {};
  orden = [];
  impostores = [];
  srBlanco = [];
  jugadoresActivos = [];
  ganador = null;
  ultimoExpulsado = null;
  rolUltimoExpulsado = null;
  cartaRevelada = false;
  partidaFinalizada = false;
  actualizarVisibilidadEstadisticas();
  inicializarOrdenSrBlanco();
  iniciarJuego();
}

function vibrar(patron = 100) {
  if (navigator.vibrate) {
    navigator.vibrate(patron);
  }
}

// ============================== UTILIDADES DOM ==============================
const $ = id => document.getElementById(id);

function cambiarPantalla(id) {
  reproducirSonido('whoosh');
  // los efectos de victoria/derrota solo viven en la pantalla de resultado
  if (id !== 'resultado') limpiarEfectos();
  document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
  const pantalla = $(id);
  if (pantalla) pantalla.classList.add('activa');
  document.body.dataset.state = id;

  // Reproducir música de menú solo en pantalla de inicio
  if (id === 'inicio') {
    // Al volver al menú principal se cancela cualquier cronómetro o cuenta
    // regresiva de una partida anterior, para que nunca sigan corriendo
    // "fantasmas" en segundo plano.
    limpiarTodosLosTemporizadores();
    reproducirSonido('musica_menu', { loop: true, volumen: CONFIG_JUEGO.VOLUMEN_MUSICA_MENU });
  } else {
    detenerSonido('musica_menu');
  }
  actualizarVisibilidadEstadisticas();
}

// ============================== TEMA Y MODO OSCURO ==============================
function cambiarTema(tema) {
  reproducirSonido('click');
  document.body.dataset.theme = tema;
  localStorage.setItem(LS_PREFIX + 'tema', tema);

  document.querySelectorAll('.tema-btn').forEach(btn => {
    btn.classList.remove('activo');
  });

  const btnActivo = document.querySelector(`[data-tema="${tema}"]`);
  if (btnActivo) btnActivo.classList.add('activo');
}

function cargarTema() {
  const temaGuardado = localStorage.getItem(LS_PREFIX + 'tema') || 'azul';
  cambiarTema(temaGuardado);
}

function toggleDarkMode() {
  reproducirSonido('click');
  document.body.classList.toggle('dark');
  const btn = document.querySelector('.header-controles .icon-btn');
  if (btn) btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
  localStorage.setItem(LS_PREFIX + 'darkMode', document.body.classList.contains('dark'));
}

function rotarTema() {
  const temas = ['azul', 'rojo', 'amarillo', 'verde', 'naranja', 'purpura',
    'negro', 'gris', 'azul_noche', 'bosque', 'chocolate'];
  const temaActual = document.body.dataset.theme || 'azul';
  const indiceActual = temas.indexOf(temaActual);
  const siguienteIndice = (indiceActual + 1) % temas.length;
  const siguienteTema = temas[siguienteIndice];

  cambiarTema(siguienteTema);
}

// ============================== AJUSTES DE JUGADORES E IMPOSTORES ==============================
function ajustarNumeroJugadores(delta) {
  const input = $('numJugadores');
  if (!input) return;
  let valor = (parseInt(input.value) || CONFIG_JUEGO.MIN_JUGADORES) + delta;
  if (valor < CONFIG_JUEGO.MIN_JUGADORES) valor = CONFIG_JUEGO.MIN_JUGADORES;
  if (valor > CONFIG_JUEGO.MAX_JUGADORES) valor = CONFIG_JUEGO.MAX_JUGADORES;
  input.value = valor;
  mostrarJugadores();
  actualizarLimitesImpostores();
  actualizarSeleccionModo();
  saveAll();
  reproducirSonido('click');
}

function ajustarNumeroImpostores(delta) {
  const input = $('numImpostores');
  if (!input) return;
  let valor = (parseInt(input.value) || 1) + delta;
  if (valor < 1) valor = 1;

  const maxImp = calcularMaximosImpostores();
  if (valor > maxImp) valor = maxImp;

  input.value = valor;
  saveAll();
  reproducirSonido('click');
}

function ajustarNumeroRondas(delta) {
  const input = $('numRondas');
  if (!input) return;
  let valor = (parseInt(input.value) || 1) + delta;
  if (valor < 1) valor = 1;
  if (valor > CONFIG_JUEGO.MAX_RONDAS) valor = CONFIG_JUEGO.MAX_RONDAS;
  input.value = valor;
  saveAll();
  reproducirSonido('click');
}

function calcularMaximosImpostores() {
  const totalJugadores = estado.jugadores.length;
  const modo = estado.modoJuego;

  if (modo === 'clasico') {
    return Math.max(1, Math.floor((totalJugadores - 1) / 2));
  }

  if (modo === 'misterio') {
    return Math.max(1, Math.floor((totalJugadores - 2) / 2));
  }

  if (modo === 'caos') {
    return Math.max(1, Math.floor((totalJugadores - 3) / 2));
  }

  return Math.max(1, Math.floor(totalJugadores / 4));
}

function actualizarLimitesImpostores() {
  const input = $('numImpostores');
  if (!input) return;

  const maxImp = calcularMaximosImpostores();
  const valorActual = parseInt(input.value);

  if (valorActual > maxImp) {
    input.value = maxImp;
    saveAll();
  }

  mostrarInfoLimiteImpostores(maxImp);
}

function mostrarInfoLimiteImpostores(maxImp) {
  let infoElement = document.getElementById('infoLimiteImpostores');

  if (!infoElement) {
    infoElement = document.createElement('div');
    infoElement.id = 'infoLimiteImpostores';
    infoElement.style.cssText = `
      font-size: 0.85em;
      color: #94a3b8;
      margin-top: 5px;
      font-style: italic;
    `;

    const container = $('numImpostores')?.parentElement;
    if (container) {
      container.appendChild(infoElement);
    }
  }

  const modo = estado.modoJuego;
  const totalJugadores = estado.jugadores.length;

  const modoInfo = {
    'clasico': { nombre: 'Clásico', minimo: 3 },
    'misterio': { nombre: 'Misterio (+ 1 Sr. Blanco)', minimo: 5 },
    'caos': { nombre: 'Caos (+ Sr. Blancos variables)', minimo: 6 }
  };

  const info = modoInfo[modo] || { nombre: modo, minimo: 3 };

  if (totalJugadores < info.minimo) {
    infoElement.innerHTML = `⚠️ <strong>Mínimo ${info.minimo} jugadores</strong> para modo ${info.nombre}`;
    infoElement.style.color = '#ef4444';
  } else if (modo === 'caos') {
    infoElement.innerHTML = `⚠️ En modo Caos, el número de impostores es <strong>aleatorio</strong>; este valor se ignora.`;
    infoElement.style.color = '#f59e0b';
  } else {
    infoElement.innerHTML = `Máximo ${maxImp} impostores en modo ${info.nombre}`;
    infoElement.style.color = '#94a3b8';
  }
}

function guardarLocal() {
  saveAll();
}

let _guardarDebounceId = null;

/**
 * Guarda el estado en localStorage de inmediato (sin debounce).
 * Úsalo solo cuando el guardado tiene que quedar aplicado ya mismo
 * (por ejemplo, justo antes de una importación o de recargar la página).
 */
function guardarInmediato() {
  // 1. Guardar los nombres de los jugadores actuales de los inputs
  const inputsJugadores = document.querySelectorAll('.jugador-input');
  if (inputsJugadores.length > 0) {
    estado.jugadores = Array.from(inputsJugadores).map(input => input.value);
  }

  // 2. Guardar las categorías que están seleccionadas
  const checkboxes = document.querySelectorAll('.categoria-checkbox');
  if (checkboxes.length > 0) {
    estado.categoriasSeleccionadas = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);
  }

  // 3. Actualizar el resto de opciones en el objeto estado
  if ($('numJugadores')) estado.numJugadores = parseInt($('numJugadores').value) || estado.jugadores.length;
  if ($('numImpostores')) estado.numImpostores = parseInt($('numImpostores').value) || 1;
  if ($('pistaImpostor')) estado.pistaImpostor = $('pistaImpostor').value || 'si';
  if ($('duracionPartida')) estado.duracionPartida = parseInt($('duracionPartida').value) || 3;
  if ($('numRondas')) estado.numRondas = parseInt($('numRondas').value) || 10;
  if ($('tipoVotacion')) estado.tipoVotacion = $('tipoVotacion').value || 'general';

  // ✅ NUEVAS OPCIONES
  if ($('categoriaImpostor')) estado.categoriaImpostor = $('categoriaImpostor').value || 'no';
  if ($('impostoresSeConocen')) estado.impostoresSeConocen = $('impostoresSeConocen').value || 'no';

  // 4. Guardar todo el objeto 'estado' en el localStorage
  try {
    localStorage.setItem(LS_PREFIX + 'estado', JSON.stringify(estado));
  } catch (err) {
    // Puede fallar si el navegador está en modo privado o si se llenó el
    // almacenamiento; se avisa una sola vez en consola en lugar de romper el juego.
    console.warn('No se pudo guardar el estado en localStorage:', err);
  }
}

/**
 * Versión con debounce de guardarInmediato: agrupa guardados que ocurren en
 * ráfaga (por ejemplo, mientras se escribe en varios campos seguidos) en una
 * sola escritura a localStorage, para no golpear el disco en cada tecla.
 */
const saveAll = () => {
  if (_guardarDebounceId) limpiarTemporizador(_guardarDebounceId);
  _guardarDebounceId = crearTimeout(() => {
    _guardarDebounceId = null;
    guardarInmediato();
  }, 150);
};
const loadAll = () => {
  cargarTema();

  // Mantener la lógica del Dark Mode independiente si así lo prefieres
  if (localStorage.getItem(LS_PREFIX + 'darkMode') === 'true') {
    document.body.classList.add('dark');
    const btn = document.querySelector('.header-controles .icon-btn');
    if (btn) btn.textContent = '☀️';
  }

  let estadoCargado = null;
  try {
    const savedState = localStorage.getItem(LS_PREFIX + 'estado');
    if (savedState) estadoCargado = JSON.parse(savedState);
  } catch (err) {
    console.warn('Los datos guardados estaban corruptos y no se pudieron cargar:', err);
    estadoCargado = null;
  }

  if (estadoCargado) {
    // Restaurar datos en el objeto estado principal
    estado.jugadores = Array.isArray(estadoCargado.jugadores) ? estadoCargado.jugadores : estado.jugadores;
    estado.categorias = (estadoCargado.categorias && typeof estadoCargado.categorias === 'object')
      ? estadoCargado.categorias
      : estado.categorias;
    estado.categoriasSeleccionadas =
      (Array.isArray(estadoCargado.categoriasSeleccionadas) ? estadoCargado.categoriasSeleccionadas : estado.categoriasSeleccionadas)
        .filter(c => validarCategoria(c));

    if (estado.categoriasSeleccionadas.length === 0) {
      estado.categoriasSeleccionadas = obtenerCategoriasValidas();
    }
    estado.modoJuego = estadoCargado.modoJuego || 'clasico';
    estado.tipoVotacion = estadoCargado.tipoVotacion || 'general';
    estado.estadisticas = (estadoCargado.estadisticas && typeof estadoCargado.estadisticas === 'object') ? estadoCargado.estadisticas : {};

    // Restaurar los valores en los selectores visuales
    if ($('numJugadores')) $('numJugadores').value = estadoCargado.numJugadores || estado.jugadores.length;
    if ($('numImpostores')) $('numImpostores').value = estadoCargado.numImpostores || 1;
    if ($('pistaImpostor')) $('pistaImpostor').value = estadoCargado.pistaImpostor || 'si';
    if ($('duracionPartida')) $('duracionPartida').value = estadoCargado.duracionPartida || 3;
    if ($('numRondas')) $('numRondas').value = estadoCargado.numRondas || 10;
    if ($('tipoVotacion')) $('tipoVotacion').value = estadoCargado.tipoVotacion || 'general';

    // ✅ CARGAR NUEVAS OPCIONES
    if ($('categoriaImpostor')) $('categoriaImpostor').value = estadoCargado.categoriaImpostor || 'no';
    if ($('impostoresSeConocen')) $('impostoresSeConocen').value = estadoCargado.impostoresSeConocen || 'no';
  }

  actualizarSeleccionModo();
};

// ============================== MODALES ==============================
function crearModal({
  title = '',
  body = '',
  okText = 'Aceptar',
  cancelText = 'Cancelar',
  onOk = null,
  onCancel = null
}) {
  reproducirSonido('alerta');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  if (title) {
    const h = document.createElement('h3');
    h.textContent = title;
    modal.appendChild(h);
  }
  const b = document.createElement('div');
  b.className = 'modal-body';
  if (typeof body === 'string') b.innerHTML = body;
  else b.appendChild(body);
  modal.appendChild(b);
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  if (onCancel !== null || cancelText) {
    const btnCancel = document.createElement('button');
    btnCancel.className = 'icon-small';
    btnCancel.textContent = cancelText;
    btnCancel.addEventListener('click', () => {
      reproducirSonido('click');
      document.body.removeChild(overlay);
      if (onCancel) onCancel();
    });
    actions.appendChild(btnCancel);
  }
  const btnOk = document.createElement('button');
  btnOk.className = 'btn main-btn';
  btnOk.textContent = okText;
  btnOk.addEventListener('click', () => {
    reproducirSonido('click');
    document.body.removeChild(overlay);
    if (onOk) onOk();
  });
  actions.appendChild(btnOk);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  crearTimeout(() => btnOk.focus(), CONFIG_JUEGO.TIEMPO_FOCO_MODAL_MS);
}

function confirmModal(message, cb) {
  crearModal({
    title: 'Confirmar',
    body: `<p>${message}</p>`,
    okText: 'Sí',
    cancelText: 'No',
    onOk: () => cb(true),
    onCancel: () => cb(false)
  });
}

// ============================== MENÚ DESPLEGABLE DINÁMICO ==============================
function ensureHeaderControls() {
  if (document.querySelector('.header-extra-controls')) return;
  const header = document.querySelector('header');
  if (!header) return;

  const container = document.createElement('div');
  container.className = 'header-extra-controls';
  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';
  const menuIcon = document.createElement('span');
  menuIcon.className = 'menu-icon';
  menuIcon.textContent = '⚙️';
  menuIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    reproducirSonido('click');
    dropdown.classList.toggle('open');
  });
  const dropdownContent = document.createElement('div');
  dropdownContent.className = 'dropdown-content';

  const exp = document.createElement('button');
  exp.innerHTML = '📤';
  exp.addEventListener('click', () => {
    reproducirSonido('click');
    dropdown.classList.remove('open');
    exportarDatos();
  });

  const imp = document.createElement('button');
  imp.innerHTML = '📥';
  imp.addEventListener('click', () => {
    reproducirSonido('click');
    dropdown.classList.remove('open');
    importarDatos();
  });

  const restore = document.createElement('button');
  restore.innerHTML = '🔄';
  restore.addEventListener('click', () => {
    reproducirSonido('click');
    dropdown.classList.remove('open');
    restablecerTodo();
  });

  const temaBtn = document.createElement('button');
  temaBtn.innerHTML = '🎨';
  temaBtn.addEventListener('click', () => {
    reproducirSonido('click');
    rotarTema();
  });

  dropdownContent.appendChild(temaBtn);
  dropdownContent.appendChild(exp);
  dropdownContent.appendChild(imp);
  dropdownContent.appendChild(restore);
  dropdown.appendChild(menuIcon);
  dropdown.appendChild(dropdownContent);
  container.appendChild(dropdown);
  header.appendChild(container);
  document.addEventListener('click', () => dropdown.classList.remove('open'));
}

// ============================== FUNCIONES DEL MENÚ DESPLEGABLE ==============================
function exportarDatos() {
  // Exporta absolutamente todo lo que puede restaurarse: jugadores,
  // categorías, selección activa, configuración y estadísticas.
  const data = {
    version: CONFIG_JUEGO.VERSION_DATOS,
    exportadoEn: new Date().toISOString(),
    jugadores: estado.jugadores,
    categorias: estado.categorias,
    categoriasSeleccionadas: estado.categoriasSeleccionadas,
    estadisticas: estado.estadisticas,
    configuracion: {
      modoJuego: estado.modoJuego,
      tipoVotacion: estado.tipoVotacion,
      numJugadores: estado.numJugadores,
      numImpostores: estado.numImpostores,
      pistaImpostor: estado.pistaImpostor,
      duracionPartida: estado.duracionPartida,
      numRondas: estado.numRondas,
      categoriaImpostor: estado.categoriaImpostor,
      impostoresSeConocen: estado.impostoresSeConocen
    }
  };

  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'impostor_data.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('No se pudo exportar los datos:', err);
    reproducirSonido('error');
    crearModal({ title: 'Error', body: '<p>No se pudo generar el archivo de exportación.</p>', okText: 'Cerrar' });
  }
}

/**
 * Comprueba que el JSON importado tenga la forma mínima esperada antes de
 * tocar el estado del juego. Nunca confía "a ciegas" en un archivo externo.
 * Devuelve { valido, motivo, categoriasLimpias, totalPalabrasInvalidas }.
 */
function validarDatosImportados(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { valido: false, motivo: 'El archivo no contiene un objeto JSON válido.' };
  }
  if (!parsed.categorias || typeof parsed.categorias !== 'object' || Array.isArray(parsed.categorias)) {
    return { valido: false, motivo: 'El archivo no tiene un campo "categorias" válido.' };
  }

  const categoriasLimpias = {};
  let totalPalabrasInvalidas = 0;

  Object.keys(parsed.categorias).forEach(nombreCrudo => {
    const nombre = (nombreCrudo || '').trim();
    if (!nombre) return;
    const lista = parsed.categorias[nombreCrudo];
    if (!Array.isArray(lista)) return;

    const palabrasValidas = [];
    const palabrasVistas = new Set();
    lista.forEach(item => {
      if (!validarPalabra(item)) { totalPalabrasInvalidas++; return; }
      const clave = normalizarNombre(item.palabra);
      if (palabrasVistas.has(clave)) return; // evita palabras duplicadas dentro de la categoría
      palabrasVistas.add(clave);
      // Copia propia: nunca se reutiliza el arreglo de pistas del archivo importado.
      palabrasValidas.push({ palabra: item.palabra.trim(), pistas: [...item.pistas] });
    });

    if (palabrasValidas.length > 0) {
      categoriasLimpias[nombre] = palabrasValidas;
    }
  });

  if (Object.keys(categoriasLimpias).length === 0) {
    return { valido: false, motivo: 'Ninguna categoría del archivo tiene palabras válidas.' };
  }

  const jugadoresValidos = Array.isArray(parsed.jugadores)
    ? parsed.jugadores.filter(j => typeof j === 'string' && j.trim().length > 0)
    : null;

  const categoriasSeleccionadas = Array.isArray(parsed.categoriasSeleccionadas)
    ? parsed.categoriasSeleccionadas.filter(c => categoriasLimpias[c])
    : null;

  const estadisticasValidas = (parsed.estadisticas && typeof parsed.estadisticas === 'object' && !Array.isArray(parsed.estadisticas))
    ? parsed.estadisticas
    : null;

  return {
    valido: true,
    categoriasLimpias,
    jugadoresValidos,
    categoriasSeleccionadas,
    estadisticasValidas,
    totalPalabrasInvalidas,
    versionArchivo: typeof parsed.version === 'string' ? parsed.version : null
  };
}

function importarDatos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        reproducirSonido('error');
        crearModal({ title: 'Error', body: '<p>El archivo no es un JSON válido.</p>', okText: 'Cerrar' });
        return;
      }

      const resultado = validarDatosImportados(parsed);
      if (!resultado.valido) {
        reproducirSonido('error');
        crearModal({ title: '❌ Archivo no compatible', body: `<p>${resultado.motivo}</p>`, okText: 'Cerrar' });
        return;
      }

      const avisoVersion = (resultado.versionArchivo && resultado.versionArchivo !== CONFIG_JUEGO.VERSION_DATOS)
        ? `<p style="opacity:.8;font-size:.9em;">⚠️ El archivo fue exportado con la versión ${resultado.versionArchivo}, distinta a la actual (${CONFIG_JUEGO.VERSION_DATOS}). Se intentará importar de todas formas.</p>`
        : '';
      const avisoInvalidas = resultado.totalPalabrasInvalidas > 0
        ? `<p style="opacity:.8;font-size:.9em;">Se ignoraron ${resultado.totalPalabrasInvalidas} palabra(s) mal formadas.</p>`
        : '';

      confirmModal(`¿Reemplazar categorías actuales por las del archivo? ${avisoVersion}${avisoInvalidas}`, (ok) => {
        if (!ok) return;

        // Respaldo automático del estado actual: si algo sale mal, se puede deshacer.
        let respaldo = null;
        try {
          respaldo = JSON.parse(JSON.stringify(estado));
          localStorage.setItem(LS_PREFIX + 'backup_pre_import', JSON.stringify(respaldo));
        } catch (err) {
          console.warn('No se pudo crear respaldo antes de importar:', err);
        }

        limpiarTodosLosTemporizadores();

        estado.categorias = resultado.categoriasLimpias;
        estado.categoriasSeleccionadas = resultado.categoriasSeleccionadas && resultado.categoriasSeleccionadas.length > 0
          ? resultado.categoriasSeleccionadas
          : Object.keys(estado.categorias);
        if (resultado.jugadoresValidos && resultado.jugadoresValidos.length > 0) {
          estado.jugadores = resultado.jugadoresValidos;
        }
        if (resultado.estadisticasValidas) {
          estado.estadisticas = resultado.estadisticasValidas;
        }
        // Se resetean los contadores de rotación para que la nueva selección
        // de categorías/palabras se recalcule desde cero.
        ordenCategoriasRonda = [];
        indiceCategoriaRonda = 0;
        palabrasUsadas = [];

        guardarInmediato();
        mostrarCategorias();
        mostrarJugadores();
        mostrarSeleccionCategorias();

        crearModal({
          title: '✅ Datos importados',
          body: respaldo
            ? '<p>Los datos se importaron correctamente.</p><p style="font-size:.9em;opacity:.8;">Si algo no se ve bien, puedes deshacer la importación.</p>'
            : '<p>Los datos se importaron correctamente.</p>',
          okText: 'Cerrar',
          cancelText: respaldo ? 'Deshacer importación' : '',
          onCancel: respaldo ? () => deshacerImportacion() : null
        });
      });
    };
    reader.readAsText(file);
  });
  input.click();
}

/** Restaura el estado guardado justo antes de la última importación. */
function deshacerImportacion() {
  try {
    const crudo = localStorage.getItem(LS_PREFIX + 'backup_pre_import');
    if (!crudo) return;
    const respaldo = JSON.parse(crudo);
    Object.assign(estado, respaldo);
    guardarInmediato();
    mostrarCategorias();
    mostrarJugadores();
    mostrarSeleccionCategorias();
    reproducirSonido('whoosh');
    crearModal({ title: '↩️ Importación deshecha', body: '<p>Se restauraron tus datos anteriores.</p>', okText: 'Cerrar' });
  } catch (err) {
    console.warn('No se pudo deshacer la importación:', err);
    reproducirSonido('error');
    crearModal({ title: 'Error', body: '<p>No se pudo deshacer la importación.</p>', okText: 'Cerrar' });
  }
}

function restablecerTodo() {
  confirmModal('¿Restablecer todo?', (ok) => {
    if (ok) {
      limpiarTodosLosTemporizadores();
      detenerTodosSonidos();
      reproducirSonido('whoosh');
      location.reload();
    }
  });
}

// ============================== PANEL DE ESTADÍSTICAS ==============================
function mostrarPanelEstadisticas() {
  // 👇 NUEVO: Bloqueo de seguridad integrado con tu UI
  if (document.body.dataset.state !== 'inicio') {
    reproducirSonido('error');
    crearModal({
      title: '❌ Acción no permitida',
      body: '<p>Las estadísticas solo se pueden ver desde la pantalla principal de configuración.</p>',
      okText: 'Entendido'
    });
    return; // Detiene la función aquí
  }

  reproducirSonido('click');
  const cont = $('contenidoEstadisticas');
  if (!cont) return;

  const nombres = Object.keys(estado.estadisticas);

  if (nombres.length === 0) {
    cont.innerHTML = '<p>Todavía no hay estadísticas. ¡Juega una ronda primero! 🎲</p>';
  } else {
    cont.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse: collapse; text-align:center;">
          <thead>
            <tr>
              <th style="padding:8px; text-align:left;">Jugador</th>
              <th style="padding:8px;">🏆 Victorias</th>
              <th style="padding:8px;">🕵️ Veces Impostor</th>
              <th style="padding:8px;">😈 Victorias Impostor</th>
              <th style="padding:8px;">👥 Victorias Civil</th>
              <th style="padding:8px;">🎩 Veces Sr. Blanco</th>
              <th style="padding:8px;">🎯 Aciertos Sr. Blanco</th>
            </tr>
          </thead>
          <tbody>
            ${nombres.map(nombre => {
      const s = estado.estadisticas[nombre];
      return `
                <tr style="border-top:1px solid rgba(128,128,128,0.3);">
                  <td style="padding:8px; text-align:left;"><strong>${nombre}</strong></td>
                  <td style="padding:8px;">${s.victorias}</td>
                  <td style="padding:8px;">${s.impostor}</td>
                  <td style="padding:8px;">${s.victoriasImpostor || 0}</td>
                  <td style="padding:8px;">${s.victoriasCivil || 0}</td>
                  <td style="padding:8px;">${s.srBlanco}</td>
                  <td style="padding:8px;">${s.victoriasSrBlanco}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  cambiarPantalla('panelEstadisticas');
}

// Función para controlar la visibilidad del botón o contenedor de estadísticas
function actualizarVisibilidadEstadisticas() {
  const contenedorEstadisticas = document.getElementById('contenedorEstadisticas');

  if (!contenedorEstadisticas) return;

  // 👇 MODIFICADO: Solo se muestra si la pantalla activa es 'inicio'
  if (document.body.dataset.state === 'inicio') {
    contenedorEstadisticas.style.display = 'block';
  } else {
    contenedorEstadisticas.style.display = 'none';
  }
}

function inicializarMenuDropdown() {
  const menuIcon = document.querySelector('.menu-icon');
  const dropdown = document.querySelector('.dropdown');

  if (menuIcon && dropdown) {
    menuIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      reproducirSonido('click');
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
}

// ============================== GESTIÓN DE JUGADORES ==============================
function mostrarJugadores() {
  const cont = $('listaJugadores');
  if (!cont) return;
  cont.innerHTML = '';
  const n = parseInt($('numJugadores')?.value || estado.jugadores.length);
  while (estado.jugadores.length < n) estado.jugadores.push(`Jugador ${estado.jugadores.length + 1}`);
  while (estado.jugadores.length > n) estado.jugadores.pop();
  estado.jugadores.forEach((j, i) => {
    const div = document.createElement('div');
    div.className = 'jugador-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = j;
    input.maxLength = CONFIG_JUEGO.MAX_LONGITUD_NOMBRE;
    input.addEventListener('input', e => {
      estado.jugadores[i] = e.target.value;
      saveAll();
    });
    const btn = document.createElement('button');
    btn.className = 'delete-btn';
    btn.textContent = 'X';
    btn.addEventListener('click', () => {
      if (estado.jugadores.length <= 3) {
        reproducirSonido('error');
        crearModal({
          title: 'Error',
          body: '<p>Mínimo 3 jugadores.</p>',
          okText: 'Cerrar',
          onCancel: null
        });
        return;
      }
      confirmModal(`¿Eliminar ${j}?`, (ok) => {
        if (!ok) return;
        reproducirSonido('eliminar');
        estado.jugadores.splice(i, 1);
        $('numJugadores').value = estado.jugadores.length;
        saveAll();
        mostrarJugadores();
      });
    });
    div.appendChild(input);
    div.appendChild(btn);
    cont.appendChild(div);
  });
  saveAll();
}

// ============================== GESTIÓN DE CATEGORÍAS ==============================
function mostrarCategorias() {
  const cont = $('categoriasLista');
  if (!cont) return;
  cont.innerHTML = '';
  Object.keys(estado.categorias).forEach(cat => {
    const div = document.createElement('div');
    div.className = 'categoria-item';
    const title = document.createElement('span');
    title.className = 'info-link';
    const catFuerte = document.createElement('strong');
    catFuerte.textContent = cat;
    title.appendChild(catFuerte);
    title.appendChild(document.createTextNode(` (${estado.categorias[cat].length})`));
    title.addEventListener('click', () => {
      reproducirSonido('click');
      abrirCategoria(cat);
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = 'X';
    delBtn.addEventListener('click', () => {
      if (Object.keys(estado.categorias).length <= 1) {
        reproducirSonido('error');
        crearModal({
          title: 'Error',
          body: '<p>Mínimo 1 categoría.</p>',
          okText: 'Cerrar',
          onCancel: null
        });
        return;
      }

      confirmModal(`¿Eliminar "${cat}"?`, async (ok) => {
        if (!ok) return;

        reproducirSonido("eliminar");

        // Guardar el nombre por si hay que restaurarlo si falla la nube.
        const palabrasAnteriores = estado.categorias[cat];

        delete estado.categorias[cat];
        estado.categoriasSeleccionadas =
          estado.categoriasSeleccionadas.filter(c => c !== cat);

        saveAll();
        mostrarCategorias();
        mostrarSeleccionCategorias();

        const eliminado = await eliminarCategoriaNube(cat);

        if (!eliminado) {
          // Restaurar la categoría en la interfaz si Firestore rechaza la operación.
          estado.categorias[cat] = palabrasAnteriores;

          if (!estado.categoriasSeleccionadas.includes(cat)) {
            estado.categoriasSeleccionadas.push(cat);
          }

          saveAll();
          mostrarCategorias();
          mostrarSeleccionCategorias();
        }
      });
    });

    div.appendChild(title);
    div.appendChild(delBtn);
    cont.appendChild(div);
  });
}

async function agregarCategoria() {
  const input = $('nuevaCategoria');
  if (!input) return;

  const validacion = validarTextoCampo(
    input.value,
    CONFIG_JUEGO.MAX_LONGITUD_CATEGORIA
  );

  if (!validacion.valido) {
    reproducirSonido('error');
    return crearModal({
      title: 'Error',
      body: `<p>${validacion.motivo}</p>`,
      okText: 'Cerrar',
      onCancel: null
    });
  }

  const name = validacion.texto;

  const yaExiste = Object.keys(estado.categorias).some(
    c => normalizarNombre(c) === normalizarNombre(name)
  );

  if (yaExiste) {
    reproducirSonido('error');
    return crearModal({
      title: 'Error',
      body: '<p>Ya existe una categoría con ese nombre.</p>',
      okText: 'Cerrar',
      onCancel: null
    });
  }

  reproducirSonido('click');

  const palabrasIniciales = [
    { palabra: "Ejemplo", pistas: ["pista1", "pista2", "pista3"] }
  ];

  estado.categorias[name] = palabrasIniciales;
  estado.categoriasSeleccionadas.push(name);
  input.value = '';
  saveAll();
  mostrarCategorias();
  mostrarSeleccionCategorias();

  // 🚀 AGREGA ESTA LÍNEA AL FINAL DE TU FUNCIÓN ACTUAL:
  await guardarNuevaCategoriaNube(name, palabrasIniciales);
}

function abrirCategoria(nombreCat) {
  categoriaActual = nombreCat;
  if ($('tituloCategoria')) $('tituloCategoria').textContent = `Editar: ${nombreCat}`;
  palabraEnEdicionIndex = -1;
  if ($('nuevaPalabra')) $('nuevaPalabra').value = '';
  if ($('pistasInput')) $('pistasInput').value = '';
  mostrarPalabras();
  cambiarPantalla('editarCategoria');
}

function mostrarPalabras() {
  const cont = $('palabrasLista');
  if (!cont) return;
  const palabras = estado.categorias[categoriaActual] || [];
  cont.innerHTML = '';
  palabras.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'jugador-item';
    const info = document.createElement('span');
    info.className = 'info-link';
    // Se usan nodos de texto (no innerHTML) para que una palabra o pista
    // con caracteres tipo < > nunca se interprete como HTML.
    const fuerte = document.createElement('strong');
    fuerte.textContent = item.palabra;
    const salto = document.createElement('br');
    const pequeno = document.createElement('small');
    pequeno.textContent = item.pistas.join(', ');
    info.appendChild(fuerte);
    info.appendChild(salto);
    info.appendChild(pequeno);
    info.addEventListener('click', () => {
      reproducirSonido('click');
      palabraEnEdicionIndex = index;
      $('nuevaPalabra').value = item.palabra;
      $('pistasInput').value = item.pistas.join(', ');
      $('nuevaPalabra').focus();
    });
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.textContent = 'X';
    del.addEventListener('click', () => {
      if (palabras.length <= 1) {
        reproducirSonido('error');
        return crearModal({ title: 'Error', body: '<p>Mínimo 1 palabra.</p>', okText: 'Cerrar', onCancel: null });
      }

      confirmModal(`¿Eliminar "${item.palabra}"?`, async (ok) => {
        if (!ok) return;

        reproducirSonido("eliminar");

        estado.categorias[categoriaActual].splice(index, 1);
        saveAll();
        mostrarPalabras();

        await guardarCategoriaNube(
          categoriaActual,
          estado.categorias[categoriaActual]
        );
      });
    });

    div.appendChild(info);
    div.appendChild(del);
    cont.appendChild(div);
  });
}

async function agregarPalabraYpistas() {
  const validacionPalabra = validarTextoCampo($('nuevaPalabra').value, CONFIG_JUEGO.MAX_LONGITUD_CATEGORIA);
  if (!validacionPalabra.valido) {
    reproducirSonido('error');
    return crearModal({ title: 'Error', body: `<p>Palabra: ${validacionPalabra.motivo}</p>`, okText: 'Cerrar', onCancel: null });
  }
  const palabra = validacionPalabra.texto;

  const pistasCrudas = $('pistasInput').value.split(',').map(s => s.trim()).filter(Boolean);
  if (pistasCrudas.length === 0) {
    reproducirSonido('error');
    return crearModal({ title: 'Error', body: '<p>Agrega al menos una pista.</p>', okText: 'Cerrar', onCancel: null });
  }
  const pistaDemasiadoLarga = pistasCrudas.find(p => p.length > CONFIG_JUEGO.MAX_LONGITUD_PISTA);
  if (pistaDemasiadoLarga) {
    reproducirSonido('error');
    return crearModal({ title: 'Error', body: `<p>La pista "${pistaDemasiadoLarga}" supera los ${CONFIG_JUEGO.MAX_LONGITUD_PISTA} caracteres.</p>`, okText: 'Cerrar', onCancel: null });
  }
  // Quita pistas duplicadas manteniendo el orden en que se escribieron
  const pistas = [...new Set(pistasCrudas.map(normalizarNombre))]
    .map(clave => pistasCrudas.find(p => normalizarNombre(p) === clave));

  const listaCategoria = estado.categorias[categoriaActual] || [];
  const yaExiste = listaCategoria.some((item, idx) =>
    idx !== palabraEnEdicionIndex && normalizarNombre(item.palabra) === normalizarNombre(palabra)
  );
  if (yaExiste) {
    reproducirSonido('error');
    return crearModal({ title: 'Error', body: `<p>Ya existe la palabra "${palabra}" en esta categoría.</p>`, okText: 'Cerrar', onCancel: null });
  }

  reproducirSonido('click');
  const newItem = { palabra, pistas };
  if (palabraEnEdicionIndex !== -1) {
    estado.categorias[categoriaActual][palabraEnEdicionIndex] = newItem;
  } else {
    estado.categorias[categoriaActual].push(newItem);
  }
  $('nuevaPalabra').value = '';
  $('pistasInput').value = '';
  palabraEnEdicionIndex = -1;

  saveAll();
  mostrarPalabras();

  await guardarCategoriaNube(
    categoriaActual,
    estado.categorias[categoriaActual]
  );
}

function mostrarSeleccionCategorias() {
  const cont = $('categoriasSeleccionLista');
  if (!cont) return;
  cont.innerHTML = '';
  Object.keys(estado.categorias).forEach(cat => {
    const div = document.createElement('div');
    div.className = 'categoria-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `cat-${cat}`;
    if (estado.categoriasSeleccionadas.includes(cat)) cb.checked = true;
    cb.addEventListener('change', () => {
      reproducirSonido('click');
      if (!cb.checked && estado.categoriasSeleccionadas.length <= 1) {
        cb.checked = true;
        reproducirSonido('error');
        return crearModal({ title: 'Error', body: '<p>Mínimo 1 categoría.</p>', okText: 'Cerrar', onCancel: null });
      }
      if (cb.checked) {
        if (!estado.categoriasSeleccionadas.includes(cat)) estado.categoriasSeleccionadas.push(cat);
      } else {
        estado.categoriasSeleccionadas = estado.categoriasSeleccionadas.filter(c => c !== cat);
      }
      saveAll();
    });
    const label = document.createElement('label');
    label.setAttribute('for', `cat-${cat}`);
    label.textContent = cat;
    div.appendChild(cb);
    div.appendChild(label);
    cont.appendChild(div);
  });
}

// ============================== SELECCIÓN DE MODO ==============================
function seleccionarModo(modo) {
  reproducirSonido('click');
  estado.modoJuego = modo;
  actualizarSeleccionModo();
  actualizarLimitesImpostores();
  saveAll();
}

function actualizarSeleccionModo() {
  const totalJugadores = estado.jugadores.length;

  const reglasMinimo = {
    clasico: CONFIG_JUEGO.MIN_JUGADORES,
    misterio: CONFIG_JUEGO.MIN_JUGADORES_MISTERIO,
    caos: CONFIG_JUEGO.MIN_JUGADORES_CAOS
  };

  ['clasico', 'misterio', 'caos'].forEach(m => {
    const card = document.querySelector(`[data-modo="${m}"]`);
    if (!card) return;

    const esSeleccionado = m === estado.modoJuego;
    const tieneJugadores = totalJugadores >= reglasMinimo[m];

    card.classList.toggle('modo-seleccionado', esSeleccionado);

    if (!tieneJugadores) {
      card.style.opacity = '0.6';
      card.style.pointerEvents = 'none';

      let badge = card.querySelector('.badge-minimo-warning');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'badge-minimo-warning';
        badge.style.cssText = `
          position: absolute;
          top: 8px;
          left: 8px;
          background: #ef4444;
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.75em;
          font-weight: bold;
        `;
        badge.textContent = `Min. ${reglasMinimo[m]} jugadores`;
        card.appendChild(badge);
      }
    } else {
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';

      const badge = card.querySelector('.badge-minimo-warning');
      if (badge) badge.remove();
    }
  });
}

function validarMinimoJugadoresPorModo() {
  const total = estado.jugadores.length;
  const modo = estado.modoJuego;

  const reglasMinimo = {
    clasico: CONFIG_JUEGO.MIN_JUGADORES,
    misterio: CONFIG_JUEGO.MIN_JUGADORES_MISTERIO,
    caos: CONFIG_JUEGO.MIN_JUGADORES_CAOS
  };

  const minimo = reglasMinimo[modo] || 3;

  if (total < minimo) {
    const nombreModo = {
      clasico: 'Clásico',
      misterio: 'Misterio',
      caos: 'Caos'
    };

    reproducirSonido('error');
    crearModal({
      title: '❌ Jugadores insuficientes',
      body: `
        <p>El <strong>modo ${nombreModo[modo]}</strong> requiere al menos 
        <strong>${minimo} jugadores</strong>.</p>
        <p>Jugadores actuales: <strong>${total}</strong></p>
        <p style="margin-top: 12px; font-size: 0.9em; opacity: 0.8;">
          💡 Agrega más jugadores en "Configurar Jugadores"
        </p>
      `,
      okText: 'Entendido',
      onCancel: null
    });

    return false;
  }

  return true;
}

// ============================== INICIO DE JUEGO ==============================
function validarNombresUnicos() {
  const vacios = estado.jugadores.some(j => !j || !j.trim());
  if (vacios) {
    reproducirSonido('error');
    crearModal({
      title: '❌ Nombre vacío',
      body: '<p>Todos los jugadores necesitan un nombre. Revisa "Configurar Jugadores".</p>',
      okText: 'Entendido',
      onCancel: null
    });
    return false;
  }

  const nombres = estado.jugadores.map(normalizarNombre);
  const duplicados = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  if (duplicados.length > 0) {
    reproducirSonido('error');
    crearModal({
      title: '❌ Nombres repetidos',
      body: `
        <p>Dos o más jugadores tienen el <strong>mismo nombre</strong>.</p>
        <p>Esto rompe la lógica del juego (votos, roles y eliminaciones se identifican por nombre).</p>
        <p style="margin-top:12px; font-size:0.9em; opacity:0.8;">
          💡 Ve a "Configurar Jugadores" y asegúrate de que cada nombre sea único.
        </p>
      `,
      okText: 'Entendido',
      onCancel: null
    });
    return false;
  }
  return true;
}

function iniciarJuego() {
  if (!validarMinimoJugadoresPorModo()) {
    cambiarPantalla('inicio');
    return;
  }

  if (!validarNombresUnicos()) {
    cambiarPantalla('configJugadores');
    return;
  }

  detenerTodosSonidos();
  reproducirSonido('whoosh');

  if (!estado.categoriasSeleccionadas || estado.categoriasSeleccionadas.length === 0) {
    reproducirSonido('error');
    crearModal({ title: 'Error', body: '<p>Selecciona al menos una categoría antes de jugar.</p>', okText: 'Cerrar' });
    cambiarPantalla('inicio');
    return;
  }

  orden = mezclarArray(estado.jugadores);
  indiceActual = 0;
  jugadoresActivos = [...estado.jugadores];

  // 🔁 Rota de categoría cada ronda sin repetir hasta agotar todas las seleccionadas
  categoriaRonda = obtenerSiguienteCategoria();

  // 🔒 Elige una palabra de esa categoría sin repetirla hasta agotar la categoría
  const pick = elegirPalabraDeCategoria(categoriaRonda);

  if (!pick) {
    reproducirSonido('error');
    crearModal({ title: 'Error', body: `<p>La categoría "${categoriaRonda}" no tiene palabras cargadas.</p>`, okText: 'Cerrar' });
    cambiarPantalla('inicio');
    return;
  }

  palabraRonda = pick.palabra;
  pistasRonda = [...pick.pistas];

  const numImp = parseInt($('numImpostores')?.value || 1);

  if (estado.modoJuego === 'clasico') {
    palabraImpostor = generarPalabraParecida(palabraRonda);
    impostores = seleccionarImpostoresSinRepetir(orden, numImp);
    srBlanco = [];
    civilesRestantes = estado.jugadores.length - numImp;

  } else if (estado.modoJuego === 'misterio') {
    impostores = seleccionarImpostoresSinRepetir(orden, numImp);
    const restantes = orden.filter(j => !impostores.includes(j));
    if (restantes.length > 0) {
      const elegido = obtenerCandidatoSrBlanco(restantes);
      srBlanco = [elegido];
      historialSrBlanco.push(elegido);
    } else {
      srBlanco = [];
    }
    civilesRestantes = estado.jugadores.length - numImp - srBlanco.length;

  } else if (estado.modoJuego === 'caos') {
    const total = jugadoresActivos.length;
    const maxImpostores = Math.max(1, Math.floor(total / 3));
    const numImpostores = Math.floor(Math.random() * maxImpostores) + 1;

    impostores = seleccionarImpostoresSinRepetir(orden, numImpostores);
    const restantes = orden.filter(j => !impostores.includes(j));

    let numSrBlanco = 1;
    if (total >= 8 && Math.random() > 0.5) {
      numSrBlanco = 2;
    }

    const maxSrBlancoPermitidos = Math.max(1, numImpostores - 1);
    numSrBlanco = Math.min(numSrBlanco, maxSrBlancoPermitidos);

    srBlanco = mezclarArray(restantes).slice(0, numSrBlanco);
    civilesRestantes = total - impostores.length - srBlanco.length;
  }

  // Guardamos quiénes eran los roles originales de esta ronda,
  // porque impostores/srBlanco se van vaciando a medida que se eliminan jugadores.
  impostoresOriginales = [...impostores];
  srBlancoOriginales = [...srBlanco];

  partidaFinalizada = false;

  const durMin = parseInt($('duracionPartida')?.value || 0);
  tiempoRestante = durMin > 0 ? durMin * 60 : 0;
  if (cronometroInterval) limpiarTemporizador(cronometroInterval);

  cambiarPantalla('revelar');
  prepararJugador();
}

// ============================== REVELACIÓN DE CARTAS ==============================
function prepararJugador() {
  cartaRevelada = false;
  const jugador = orden[indiceActual];
  if ($('nombreJugador')) $('nombreJugador').textContent = `Turno de: ${jugador}`;
  if ($('rolJugador')) $('rolJugador').textContent = 'Toca la carta para revelar tu rol';
  const caja = $('palabraCaja');
  if (caja) {
    caja.classList.remove('flipped');
    caja.classList.remove('bloqueado');
    const front = caja.querySelector('.card-front');
    if (front) front.setAttribute('aria-hidden', 'false');
    const back = $('palabraContenido');
    if (back) back.setAttribute('aria-hidden', 'true');
  }
  const btn = $('btnSiguiente');
  if (btn) btn.classList.add('oculto');
}

function revelarPalabra() {
  if (window.__online && window.__online.activo) return window.__online.revelar();
  const caja = $('palabraCaja');
  if (!caja || caja.classList.contains('bloqueado')) return;
  if (cartaRevelada) return;

  cartaRevelada = true;
  const jugador = orden[indiceActual];
  const contenido = $('palabraContenido');
  if (!contenido) return;

  caja.classList.add('flipped');
  caja.classList.add('bloqueado');

  const front = caja.querySelector('.card-front');
  if (front) front.setAttribute('aria-hidden', 'true');
  contenido.setAttribute('aria-hidden', 'false');

  const esImpostor = impostores.includes(jugador);
  const esSrBlanco = srBlanco.includes(jugador);

  reproducirSonido('revelar');
  vibrar(100);

  contenido.classList.remove('civil', 'impostor', 'srblanco'); // limpia estado anterior
  if (esSrBlanco) contenido.classList.add('srblanco');
  else if (esImpostor) contenido.classList.add('impostor');
  else contenido.classList.add('civil');

  if (esSrBlanco) {
    if ($('rolJugador')) $('rolJugador').innerHTML = 'Eres <strong style="color: white;">SR. BLANCO</strong> 🎩';
    contenido.innerHTML = `
      <strong>NO TIENES PALABRA</strong>
      <div class="pistas-info">🎭 Improvisa tus pistas</div>
    `;
  } else if (esImpostor) {
    if ($('rolJugador')) $('rolJugador').innerHTML = '¡Eres <strong style="color: #ef4444;">IMPOSTOR</strong>! 🕵️';

    const darPista = $('pistaImpostor')?.value === 'si';
    const darCategoria = $('categoriaImpostor')?.value === 'si';
    const conocenAliados = $('impostoresSeConocen')?.value === 'si';

    const aliados = impostores.filter(j => j !== jugador);

    let htmlContenido = '<div class="impostor-info-wrapper">';

    // ✅ Aliados
    if (conocenAliados) {
      if (aliados.length > 0) {
        htmlContenido += `
          <div class="info-box info-box-aliados">
            <div class="info-box-titulo">🤝 Tus aliados</div>
            <div class="aliados-lista">
              ${aliados.map(a => `<span class="aliado-badge">${a}</span>`).join('')}
            </div>
          </div>
        `;
      } else {
        htmlContenido += `
          <div class="info-box info-box-aliados">
            <div class="info-box-titulo">🕵️ Eres el único impostor</div>
          </div>
        `;
      }
    }

    // ✅ Categoría
    if (darCategoria) {
      htmlContenido += `
        <div class="info-box info-box-categoria">
          <div class="info-box-titulo">📂 Categoría</div>
          <div class="info-box-categoria-nombre">${categoriaRonda}</div>
        </div>
      `;
    }

    // ✅ Pista
    if (darPista && pistasRonda.length > 0) {
      const pista = pistasRonda[Math.floor(Math.random() * pistasRonda.length)];
      htmlContenido += `
        <div class="pista-impostor-wrapper">
          <div class="pista-label">🕵️ Pista clave</div>
          <div class="pista-contenido">${pista}</div>
        </div>
      `;
    }

    // Si nada está activo
    if (!darPista && !darCategoria && !conocenAliados) {
      htmlContenido += '<div style="font-size:0.7em; opacity:0.8;">Sin información adicional</div>';
    }

    htmlContenido += '</div>';
    contenido.innerHTML = htmlContenido;
  } else {
    if ($('rolJugador')) $('rolJugador').innerHTML = 'Eres <strong style="color: #3b82f6;">CIVIL</strong> 👥';
    contenido.innerHTML = `${palabraRonda}<div class="categoria-info">Categoría: ${categoriaRonda}</div>`;
  }

  const btn = $('btnSiguiente');
  if (btn) {
    btn.classList.remove('oculto');
    btn.classList.remove('oculto-animado');
  }
}

function siguienteJugador() {
  if (window.__online && window.__online.activo) return window.__online.siguiente();
  reproducirSonido('click');
  const caja = $('palabraCaja');
  if (caja) caja.classList.remove('bloqueado');

  indiceActual++;
  if (indiceActual >= orden.length) {
    mostrarCuentaRegresiva();
  } else {
    prepararJugador();
  }
}

function handleCardKeydown(ev) {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    revelarPalabra();
  }
}

function mostrarCuentaRegresiva() {
  detenerTodosSonidos();
  reproducirSonido('cuenta_regresiva');

  cambiarPantalla('cuentaRegresiva');
  const primerJugador = obtenerPrimerJugadorValido();
  if ($('jugadorEmpieza')) $('jugadorEmpieza').textContent = `EMPIEZA ${primerJugador.toUpperCase()}`;
  let contador = 3;
  const numeroEl = $('numeroRegresivo');
  if (numeroEl) numeroEl.textContent = contador;
  const intervalo = crearIntervalo(() => {
    contador--;
    if (contador > 0) {
      if (numeroEl) numeroEl.textContent = contador;
      reproducirSonido('click');
    } else {
      limpiarTemporizador(intervalo);
      if (numeroEl) numeroEl.textContent = '¡YA!';
      reproducirSonido('alerta');
      crearTimeout(() => iniciarDebate(), CONFIG_JUEGO.TIEMPO_TRAS_CUENTA_MS);
    }
  }, CONFIG_JUEGO.TIEMPO_CUENTA_REGRESIVA_MS);
}

// ============================== DEBATE Y CRONÓMETRO ==============================
function iniciarDebate() {
  detenerTodosSonidos();
  reproducirSonido('tension', { loop: true, volumen: 0.3 });
  actualizarProgresoRondas();

  cambiarPantalla('debate');
  const durMin = parseInt($('duracionPartida')?.value || 0);
  tiempoRestante = durMin > 0 ? durMin * 60 : 0;
  cronometroActivo = false;
  if (tiempoRestante > 0) {
    iniciarCronometro();
  }
  actualizarCronometroDisplay();
}

function iniciarCronometro() {
  if (cronometroInterval) limpiarTemporizador(cronometroInterval);
  cronometroActivo = true;
  cronometroInterval = crearIntervalo(() => {
    if (!cronometroActivo) return;
    tiempoRestante--;
    actualizarCronometroDisplay();

    // Advertencia cuando queden 30 segundos
    if (tiempoRestante === 30) {
      reproducirSonido('tiempo_acabando', { loop: true });
    }

    if (tiempoRestante <= 0) {
      limpiarTemporizador(cronometroInterval);
      cronometroActivo = false;
      detenerTodosSonidos();
      reproducirSonido('alerta');
      vibrar([100, 50, 100]);

      // ⏰ Ya no se pierde automático: pasa directo a la votación final
      crearModal({
        title: '⏰ ¡Tiempo agotado!',
        body: '<p>Se acabó el tiempo de debate.<br>¡Hora de votar!</p>',
        okText: '🗳️ Ir a votar',
        cancelText: '',
        onOk: () => {
          iniciarVotacion();
        }
      });
    }
  }, 1000);
}

function actualizarCronometroDisplay() {
  const minutos = Math.floor(tiempoRestante / 60);
  const segundos = tiempoRestante % 60;
  const disp = $('cronometroDisplay');
  if (disp) disp.textContent = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

// ============================== VOLVER AL DEBATE (después de expulsión) ==============================
function volverAlDebate() {
  cambiarPantalla('debate');

  // Si quedaba tiempo en el cronómetro, lo reanuda
  if (tiempoRestante > 0) {
    iniciarCronometro();
  }

  actualizarCronometroDisplay();

  // Actualizar la instrucción con jugadores activos restantes
  const instruccion = document.querySelector('.instruccion-debate');
  if (instruccion) {
    instruccion.textContent = `Quedan ${jugadoresActivos.length} jugadores activos. Sigan debatiendo.`;
  }
}

function irAVotacion() {
  if (cronometroInterval) {
    limpiarTemporizador(cronometroInterval);
    cronometroActivo = false;
  }
  detenerTodosSonidos();
  reproducirSonido('whoosh');
  iniciarVotacion();
}

// ============================== VOTACIÓN ==============================
function iniciarVotacion() {
  actualizarProgresoRondas();
  estado.tipoVotacion = $('tipoVotacion')?.value || 'general';
  if (estado.tipoVotacion === 'general') {
    votacionGeneral();
  } else {
    votacionPorTurnos();
  }
}

function votacionPorTurnos() {
  cambiarPantalla('votacion');
  votosRonda = {};
  votoActual = null;
  ordenVotacion = mezclarArray(jugadoresActivos);
  indiceVotante = 0;

  const btn = $('btnConfirmarVotacion');
  if (btn) {
    btn.classList.remove('oculto');
    btn.textContent = 'Confirmar voto';
    btn.onclick = registrarVoto;
  }

  mostrarVotacionJugador();
}

function votacionGeneral() {
  cambiarPantalla('votacion');
  if ($('tituloVotacion')) $('tituloVotacion').textContent = '🗳️ VOTACIÓN GENERAL';
  if (document.querySelector('.instruccion-votacion')) {
    document.querySelector('.instruccion-votacion').textContent = 'Todos votan simultáneamente al mismo jugador.';
  }
  const cont = $('listaVotacion');
  if (!cont) return;
  cont.innerHTML = jugadoresActivos.map(j =>
    `<div class="jugador-item votacion-item" onclick="seleccionarVotoGeneral('${j}')" data-jugador="${j}">
      <span>${j}</span>
    </div>`
  ).join('');
  const btn = $('btnConfirmarVotacion');
  if (btn) {
    btn.classList.remove('oculto');
    btn.onclick = confirmarVotacionGeneral;
    btn.textContent = 'Confirmar votación';
  }
  votoGeneral = null;
}

function seleccionarVotoGeneral(jugador) {
  reproducirSonido('votar');
  vibrar(50);

  document.querySelectorAll('.votacion-item').forEach(item => {
    item.classList.remove('votacion-seleccionado');
  });
  const item = document.querySelector(`[data-jugador="${jugador}"]`);
  if (item) {
    item.classList.add('votacion-seleccionado');
    votoGeneral = jugador;
  }
}

function confirmarVotacionGeneral() {
  if (!votoGeneral) {
    reproducirSonido('error');
    return crearModal({ title: 'Error', body: '<p>Selecciona a alguien.</p>', okText: 'Cerrar', onCancel: null });
  }
  reproducirSonido('click');
  votosRonda = {};
  votosRonda[votoGeneral] = [...jugadoresActivos];
  procesarResultadosVotacion();
}

function mostrarVotacionJugador() {
  const votante = ordenVotacion[indiceVotante];
  if ($('tituloVotacion')) $('tituloVotacion').textContent = `🗳️ Turno de: ${votante}`;
  const cont = $('listaVotacion');
  if (!cont) return;
  const opciones = jugadoresActivos.filter(j => j !== votante);
  cont.innerHTML = opciones.map(j =>
    `<div class="jugador-item votacion-item" onclick="seleccionarVoto('${j}')" data-jugador="${j}">
      <span>${j}</span>
    </div>`
  ).join('');
}

function seleccionarVoto(jugador) {
  reproducirSonido('votar');
  vibrar(50);

  document.querySelectorAll('.votacion-item').forEach(item => {
    item.classList.remove('votacion-seleccionado');
  });

  const item = document.querySelector(`[data-jugador="${jugador}"]`);
  if (item) {
    item.classList.add('votacion-seleccionado');
    votoActual = jugador;
  }
}

function registrarVoto() {
  if (!votoActual) {
    reproducirSonido('error');
    return crearModal({ title: 'Error', body: '<p>Selecciona a alguien.</p>', okText: 'Cerrar', onCancel: null });
  }

  reproducirSonido('click');
  const votante = ordenVotacion[indiceVotante];
  const votado = votoActual;
  if (!votosRonda[votado]) votosRonda[votado] = [];
  votosRonda[votado].push(votante);
  votoActual = null;
  indiceVotante++;
  if (indiceVotante >= ordenVotacion.length) {
    procesarResultadosVotacion();
  } else {
    mostrarVotacionJugador();
  }
}

// ============================== PROCESAMIENTO DE VOTACIÓN ==============================
function procesarResultadosVotacion() {
  if (partidaFinalizada) return;

  if (cronometroInterval) limpiarTemporizador(cronometroInterval);

  if (Object.keys(votosRonda).length === 0) {
    reproducirSonido('empate');
    mostrarResultado('⚠️ Sin votos', 'Nadie votó. Se reinicia la votación.', false);
    return;
  }

  let maxVotos = 0, candidatos = [];
  Object.keys(votosRonda).forEach(jugador => {
    const num = votosRonda[jugador].length;
    if (num > maxVotos) {
      maxVotos = num;
      candidatos = [jugador];
    } else if (num === maxVotos) {
      candidatos.push(jugador);
    }
  });

  let mensaje = '<div>';
  if (estado.tipoVotacion === 'general') {
    mensaje += `<p><strong>${Object.keys(votosRonda)[0]}</strong> fue expulsado</p>`;
  } else {
    Object.keys(votosRonda).forEach(jugador => {
      mensaje += `<p><strong>${jugador}</strong>: ${votosRonda[jugador].length} votos (${votosRonda[jugador].join(', ')})</p>`;
    });
  }
  mensaje += '</div>';

  if (candidatos.length > 1 || maxVotos === 0) {
    votosRonda = {};
    votoActual = null;
    indiceVotante = 0;
    reproducirSonido('empate');
    mostrarResultado(
      '⚖️ ¡EMPATE!',
      `${mensaje}<br><strong>Nadie es expulsado.</strong>`,
      false
    );
    return;
  }

  const elegido = candidatos[0];
  const eraImpostor = impostores.includes(elegido);
  const eraSrBlanco = srBlanco.includes(elegido);
  const rolElegido = obtenerRolJugador(elegido);

  reproducirSonido('eliminar');
  vibrar(200);

  if (eraSrBlanco && (estado.modoJuego === 'misterio' || estado.modoJuego === 'caos')) {
    permitirAdivinanza(elegido, mensaje);
    return;
  }

  eliminarJugador(elegido);

  let titulo, mensajeFinal;

  // Nota: el caso "eraSrBlanco" ya se maneja arriba con permitirAdivinanza()
  // y siempre corta con return, porque Sr. Blanco solo existe en modo
  // misterio/caos. Este punto del código solo se alcanza para Civil o Impostor.

  if (eraImpostor) {
    if (impostores.length === 0) {
      if (srBlanco.length > 0) {
        titulo = '✅ ¡Impostor eliminado!';
        mensajeFinal = `${mensaje}
          <p>🧾 <strong>${elegido}</strong> era <strong>${rolElegido}</strong></p>
          <p>⚠️ Todos los impostores eliminados, pero aún queda el Sr. Blanco.</p>
          <p>🎯 ¡Continúa votando para encontrarlo!</p>
          ${mostrarEstadoActual()}`;
        mostrarResultado(titulo, mensajeFinal, false);
        return;
      } else {
        titulo = '🏆 ¡VICTORIA CIVIL!';
        mensajeFinal = `${mensaje}
          <p>🧾 <strong>${elegido}</strong> era <strong>${rolElegido}</strong></p>
          <p>¡Todos los enemigos fueron eliminados!</p>
          <p>📘 Palabra secreta: <strong>${palabraRonda}</strong></p>`;
        reproducirSonido('victoria');
        partidaFinalizada = true;
        registrarEstadisticasRonda('civiles');
        mostrarResultado(titulo, mensajeFinal, true, 'civiles');
        return;
      }
    } else {
      titulo = '✅ ¡Acierto!';
      mensajeFinal = `${mensaje}
        <p>🧾 <strong>${elegido}</strong> era <strong>${rolElegido}</strong></p>
        <p>Quedan ${impostores.length} impostores.</p>
        ${mostrarEstadoActual()}`;
    }
  } else {
    const gameOver = verificarEstadoPartida();
    if (gameOver) return;

    titulo = '❌ ¡Error!';
    mensajeFinal = `${mensaje}
      <p>🧾 <strong>${elegido}</strong> era <strong>${rolElegido}</strong></p>
      ${mostrarEstadoActual()}`;
  }

  mostrarResultado(titulo, mensajeFinal, false);
}

// ============================== FUNCIONES AUXILIARES DE JUEGO ==============================
function distanciaLevenshtein(a, b) {
  const matriz = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matriz[i][0] = i;
  for (let j = 0; j <= b.length; j++) matriz[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }
  return matriz[a.length][b.length];
}

function normalizarTexto(texto) {
  return texto.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function obtenerCandidatoSrBlanco(jugadores) {
  let disponibles = jugadores.filter(j => !historialSrBlanco.includes(j));

  if (disponibles.length === 0) {
    historialSrBlanco = [];
    disponibles = [...jugadores];
  }

  return disponibles[Math.floor(Math.random() * disponibles.length)];
}

function verificarVictoriaSrBlanco(intento, palabraRonda) {
  const intentoNorm = normalizarTexto(intento);
  const palabraNorm = normalizarTexto(palabraRonda);

  if (!intentoNorm) return false;

  if (
    intentoNorm === palabraNorm ||
    intentoNorm === palabraNorm.slice(0, -1) ||
    palabraNorm === intentoNorm.slice(0, -1)
  ) {
    return true;
  }

  const distancia = distanciaLevenshtein(intentoNorm, palabraNorm);
  const maxLen = Math.max(intentoNorm.length, palabraNorm.length);
  const similitud = 1 - distancia / maxLen;

  return similitud >= 0.6;
}

function obtenerRolJugador(jugador) {
  if (impostores.includes(jugador)) return 'IMPOSTOR';
  if (srBlanco.includes(jugador)) return 'Sr. Blanco';
  return 'CIVIL';
}

function mostrarEstadoActual() {
  return `
    <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;">
      <p>👥 Civiles restantes: <strong>${civilesRestantes}</strong></p>
      <p>🕵️ Impostores restantes: <strong>${impostores.length}</strong></p>
      <p>🎩 Sr. Blanco restantes: <strong>${srBlanco.length}</strong></p>
    </div>
  `;
}

function permitirAdivinanza(jugador, mensajeVotos) {
  const modalBody = document.createElement('div');
  modalBody.innerHTML = `
    ${mensajeVotos}
    <br>
    <p><strong>${jugador}</strong> era el <span class="rol-misterio">Sr. Blanco</span> 🎩</p>
    <p>El Sr. Blanco intentará adivinar la palabra secreta...</p>
    <p style="margin-top:20px; font-size:1.1em;">
      ¿<strong>${jugador}</strong> adivinó correctamente?
    </p>
  `;

  crearModal({
    title: '🎩 Sr. Blanco - Adivinanza',
    body: modalBody,
    okText: '✅ CORRECTO',
    cancelText: '❌ INCORRECTO',
    onOk: () => {
      reproducirSonido('sr_blanco_gana');
      vibrar([100, 50, 100]);
      partidaFinalizada = true;
      registrarEstadisticasRonda('srblanco');
      mostrarResultado(
        '🎉 ¡VICTORIA DEL SR. BLANCO!',
        `<p><strong>${jugador}</strong> adivinó correctamente la palabra secreta.</p>
         <p>📘 Palabra correcta: <strong>${palabraRonda}</strong></p>`,
        true,
        'srblanco'
      );
    },
    onCancel: () => {
      eliminarJugador(jugador);
      if (verificarVictoriaCivil()) return;
      if (verificarEstadoPartida()) return;
      mostrarResultado(
        '🎩 Sr. Blanco Falló',
        `<p><strong>${jugador}</strong> falló al adivinar la palabra.</p>
         ${mostrarEstadoActual()}`,
        false
      );
    }
  });
}

// `ganador` ('civiles' | 'impostores' | 'srblanco') solo se usa cuando gameOver es true: dispara los efectos visuales
function mostrarResultado(titulo, mensaje, gameOver, ganador = null) {
  let resultado = $('resultado');
  if (!resultado) {
    resultado = document.createElement('section');
    resultado.id = 'resultado';
    resultado.className = 'pantalla';
    resultado.innerHTML = `
      <h2 id="resultadoTitulo" class="resultado-titulo"></h2>
      <p id="resultadoMensaje" class="resultado-mensaje"></p>
      <div style="display:flex; flex-direction:column; gap:12px; width:100%;">
        <button class="btn play-btn" id="btnResultado"></button>
        <button class="btn play-btn" id="btnIrVotacion" style="display:none;">🗳️ Ir a Votación</button>
      </div>`;
    document.body.appendChild(resultado);
  }

  $('resultadoTitulo').textContent = titulo;
  $('resultadoMensaje').innerHTML = mensaje;

  const btn = $('btnResultado');
  const btnVotar = $('btnIrVotacion');

  if (gameOver) {
    // ✅ Partida terminada → solo botón de siguiente ronda
    btn.textContent = '🔁 Siguiente ronda';
    btn.style.display = '';
    if (btnVotar) btnVotar.classList.add('oculto');
    btn.onclick = () => siguienteRonda();

  } else {
    // ✅ Partida continúa → botón "Seguir debate" + botón "Ir a Votación"
    btn.textContent = '💬 Seguir debate';
    btn.style.display = '';
    btn.onclick = () => {
      // Limpia votos anteriores
      votosRonda = {};
      votoActual = null;
      indiceVotante = 0;
      // Vuelve al debate y reanuda el cronómetro
      volverAlDebate();
    };

    if (btnVotar) {
      btnVotar.classList.remove('oculto');
      btnVotar.onclick = () => {
        votosRonda = {};
        votoActual = null;
        indiceVotante = 0;
        iniciarVotacion();
      };
    }
  }

  cambiarPantalla('resultado');
  if (gameOver && ganador) efectoFinPartida(ganador);
}

function generarPalabraParecida(palabra) {
  const todas = [];
  estado.categoriasSeleccionadas.forEach(cat => {
    estado.categorias[cat].forEach(p => {
      if (p.palabra !== palabra) todas.push(p.palabra);
    });
  });
  return todas.length > 0 ? todas[Math.floor(Math.random() * todas.length)] : palabra + ' (variante)';
}

function eliminarJugador(jugador) {
  ultimoExpulsado = jugador;

  if (impostores.includes(jugador)) {
    rolUltimoExpulsado = 'IMPOSTOR';
    impostores = impostores.filter(i => i !== jugador);

  } else if (srBlanco.includes(jugador)) {
    rolUltimoExpulsado = 'Sr. Blanco';
    srBlanco = srBlanco.filter(s => s !== jugador);

  } else {
    rolUltimoExpulsado = 'CIVIL';
    civilesRestantes = Math.max(0, civilesRestantes - 1);
  }

  jugadoresActivos = jugadoresActivos.filter(j => j !== jugador);
}

function verificarEstadoPartida() {
  if (partidaFinalizada) return true;

  const numCiviles = civilesRestantes;
  const numImpostores = impostores.length;
  const numSrBlanco = srBlanco.length;

  if ((numImpostores + numSrBlanco) >= numCiviles && numCiviles > 0) {
    partidaFinalizada = true;
    actualizarVisibilidadEstadisticas();
    reproducirSonido('derrota');
    registrarEstadisticasRonda('impostores');

    let mensajeExpulsado = '';
    if (ultimoExpulsado && rolUltimoExpulsado) {
      mensajeExpulsado = `<p>🚪 Último expulsado: <strong>${ultimoExpulsado}</strong> (${rolUltimoExpulsado})</p>`;
    }

    mostrarResultado(
      '😈 ¡VICTORIA IMPOSTOR!',
      `${mensajeExpulsado}
       <p>🕵️ Impostores: <strong>${impostores.join(', ')}</strong></p>
       <p>🎩 Sr. Blanco: <strong>${srBlanco.join(', ')}</strong></p>
       <p>👥 Civiles restantes: <strong>${numCiviles}</strong></p>
       <p>📘 Palabra secreta: <strong>${palabraRonda}</strong></p>`,
      true,
      'impostores'
    );
    return true;
  }

  return false;
}

function verificarVictoriaCivil() {
  if (impostores.length === 0 && srBlanco.length === 0) {
    partidaFinalizada = true;
    actualizarVisibilidadEstadisticas();
    reproducirSonido('victoria');
    registrarEstadisticasRonda('civiles');
    mostrarResultado(
      '🏆 ¡VICTORIA CIVIL!',
      `<p>Todos los enemigos fueron eliminados.</p>
       <p>📘 Palabra secreta: <strong>${palabraRonda}</strong></p>`,
      true,
      'civiles'
    );
    return true;
  }
  return false;
}

// ============================== CANVAS ANIMADO ==============================
const CONFIG = {
  themes: {
    azul: { primary: '#00c6ff', secondary: '#0072ff' },
    rojo: { primary: '#ff2a2a', secondary: '#aa0000' },
    amarillo: { primary: '#ffd700', secondary: '#ffaa00' },
    verde: { primary: '#00ff88', secondary: '#008844' },
    naranja: { primary: '#ff7b00', secondary: '#ff4400' },
    purpura: { primary: '#bd00ff', secondary: '#6600cc' },
    negro: { primary: '#1e293b', secondary: '#020617' },
    gris: { primary: '#64748b', secondary: '#334155' },
    azul_noche: { primary: '#312e81', secondary: '#1e1b4b' },
    bosque: { primary: '#065f46', secondary: '#064e3b' },
    chocolate: { primary: '#78350f', secondary: '#451a03' }
  },
  state: {
    activeTheme: 'azul',
    particleCount: 100,
    connectDist: 110
  }
};

const CanvasView = {
  canvas: document.getElementById('bg-canvas'),
  ctx: null,
  particles: [],
  mouse: { x: -1000, y: -1000 },

  init() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    for (let i = 0; i < CONFIG.state.particleCount; i++) {
      this.particles.push(
        new Particle(this.canvas.width, this.canvas.height)
      );
    }

    this.animate();
  },

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const temaActual = document.body.dataset.theme || 'azul';
    const theme = CONFIG.themes[temaActual] || CONFIG.themes.azul;
    const hex = theme.primary;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    this.particles.forEach((p, index) => {
      p.update(this.mouse);
      this.ctx.fillStyle = theme.primary;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();

      for (let j = index + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < CONFIG.state.connectDist) {
          this.ctx.beginPath();
          this.ctx.strokeStyle =
            `rgba(${r},${g},${b}, ${1 - dist / CONFIG.state.connectDist})`;
          this.ctx.lineWidth = 0.5;
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    });

    requestAnimationFrame(() => this.animate());
  }
};

class Particle {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
    this.size = Math.random() * 2 + 1;
  }

  update(mouse) {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > this.w) this.vx *= -1;
    if (this.y < 0 || this.y > this.h) this.vy *= -1;

    const dist = Math.hypot(mouse.x - this.x, mouse.y - this.y);
    if (dist < 120) {
      const force = (120 - dist) / 120;
      this.x -= ((mouse.x - this.x) / dist) * force * 1.5;
      this.y -= ((mouse.y - this.y) / dist) * force * 1.5;
    }
  }
}

// ============================== OBSERVADOR DE BOTONES DINÁMICOS ==============================
function observarBotonesDinamicos() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.matches && (node.matches('.btn') || node.matches('.icon-btn') || node.matches('.delete-btn'))) {
            node.addEventListener('click', () => {
              reproducirSonido('click');
              vibrar(30);
            });

            node.addEventListener('mouseenter', () => {
              reproducirSonido('hover', { volumen: 0.2 });
            });
          }

          if (node.querySelectorAll) {
            node.querySelectorAll('.btn, .icon-btn, .delete-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                reproducirSonido('click');
                vibrar(30);
              });

              btn.addEventListener('mouseenter', () => {
                reproducirSonido('hover', { volumen: 0.2 });
              });
            });
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ============================== AGREGAR SONIDOS A BOTONES ==============================
function agregarSonidoBoton(selector, sonido = 'click') {
  document.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      reproducirSonido(sonido);
      vibrar(30);
    });

    btn.addEventListener('mouseenter', () => {
      reproducirSonido('hover', { volumen: 0.2 });
    });
  });
}

// Registra el resultado de TODOS los jugadores al terminar una ronda.
// equipoGanador: 'civiles' | 'impostores' | 'srblanco'
function registrarEstadisticasRonda(equipoGanador) {
  estado.jugadores.forEach(jugador => {
    const esImpostor = impostoresOriginales.includes(jugador);
    const esSrBlanco = srBlancoOriginales.includes(jugador);
    const rol = esImpostor ? 'impostor' : (esSrBlanco ? 'srblanco' : 'civil');

    let gano = false;
    let acerto = false;

    if (equipoGanador === 'civiles') {
      gano = !esImpostor && !esSrBlanco;
    } else if (equipoGanador === 'impostores') {
      gano = esImpostor;
    } else if (equipoGanador === 'srblanco') {
      gano = esSrBlanco;
      acerto = esSrBlanco;
    }

    actualizarEstadisticas(jugador, rol, gano, esSrBlanco, acerto);
  });
}

// Función para registrar el resultado al finalizar la partida
function actualizarEstadisticas(nombreJugador, rol, gano, esSrBlanco = false, acerto = false) {
  if (!estado.estadisticas[nombreJugador]) {
    estado.estadisticas[nombreJugador] = {
      impostor: 0, civil: 0, srBlanco: 0,
      victorias: 0,
      victoriasImpostor: 0, victoriasCivil: 0, victoriasSrBlanco: 0
    };
  }

  const stats = estado.estadisticas[nombreJugador];

  // Compatibilidad con estadísticas guardadas antes de agregar estos campos
  if (stats.civil === undefined) stats.civil = 0;
  if (stats.victoriasImpostor === undefined) stats.victoriasImpostor = 0;
  if (stats.victoriasCivil === undefined) stats.victoriasCivil = 0;
  if (stats.victoriasSrBlanco === undefined) stats.victoriasSrBlanco = 0;

  if (rol === 'impostor') stats.impostor++;
  else if (rol === 'civil') stats.civil++;

  if (esSrBlanco) stats.srBlanco++;

  if (gano) {
    stats.victorias++;
    if (rol === 'impostor') stats.victoriasImpostor++;
    else if (esSrBlanco) stats.victoriasSrBlanco++;
    else stats.victoriasCivil++;
  }

  saveAll(); // Guarda automáticamente en localStorage al actualizar
}

// ============================== NUEVO: FLUJO DE CARGA Y MULTIJUGADOR ==============================

// Inicia la barra de carga automática al abrir la web
function iniciarPantallaCarga() {
  let progreso = 0;
  const barra = $('barraCargaGlobal');
  const textoPorcentaje = $('porcentajeCarga');

  if (!barra || !textoPorcentaje) return;

  const intervaloCarga = setInterval(() => {
    progreso += Math.floor(Math.random() * 15) + 5;
    if (progreso >= 100) {
      progreso = 100;
      clearInterval(intervaloCarga);

      // Pasa a la pantalla de selección de modo (Offline/Online)
      crearTimeout(async () => {
        // Si se abrió un enlace/QR de sala (?sala=XXXXXX) o hay una partida en curso guardada, online.js
        // lleva al jugador a la pantalla de apodo o lo reconecta; si no, menú normal.
        let tomado = false;
        try {
          tomado = typeof window.arranqueOnline === 'function' ? await window.arranqueOnline() : false;
        } catch (e) { console.warn('No se pudo iniciar el modo online:', e); }
        if (!tomado) cambiarPantalla('seleccionModoJuego');
      }, 600);
    }
    barra.style.width = progreso + '%';
    textoPorcentaje.textContent = progreso + '%';
  }, 120);
}

// Elección entre Offline u Online
function elegirModoJuego(modo) {
  reproducirSonido('click');
  if (modo === 'offline') {
    // Te lleva al menú principal de juego local
    cambiarPantalla('inicio');
  } else if (modo === 'online') {
    // Te lleva a la sala de multijugador online
    cambiarPantalla('salaOnline');
  }
}

// ============================== INICIALIZACIÓN ==============================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Cargar datos iniciales
  loadAll();
  inicializarMenuDropdown();

  // 🚀 INICIAR LA PANTALLA DE CARGA SI EXISTE
  if ($('pantallaCarga')) {
    iniciarPantallaCarga();
  }

  // Inicializar canvas animado si existe
  if (document.getElementById('bg-canvas')) {
    CanvasView.init();
  }

  const card = $('palabraCaja');
  if (card) {
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', handleCardKeydown);
  }

  // 2. Renderizar la interfaz
  mostrarJugadores();
  mostrarCategorias();
  mostrarSeleccionCategorias();
  actualizarLimitesImpostores();

  // 3. Activar escuchadores estáticos
  if ($('numJugadores')) {
    $('numJugadores').addEventListener('change', () => {
      mostrarJugadores();
      actualizarLimitesImpostores();
      actualizarSeleccionModo();
      saveAll();
    });
  }

  if ($('numImpostores')) $('numImpostores').addEventListener('change', saveAll);
  if ($('pistaImpostor')) $('pistaImpostor').addEventListener('change', saveAll);
  if ($('duracionPartida')) $('duracionPartida').addEventListener('change', saveAll);
  if ($('numRondas')) $('numRondas').addEventListener('change', saveAll);
  if ($('tipoVotacion')) {
    $('tipoVotacion').addEventListener('change', () => {
      estado.tipoVotacion = $('tipoVotacion').value;
      saveAll();
    });
  }

  // ✅ Escuchadores para las nuevas opciones
  if ($('categoriaImpostor')) $('categoriaImpostor').addEventListener('change', saveAll);
  if ($('impostoresSeConocen')) $('impostoresSeConocen').addEventListener('change', saveAll);

  // 4. Sonidos y utilidades visuales
  agregarSonidoBoton('.btn');
  agregarSonidoBoton('.icon-btn');
  agregarSonidoBoton('.delete-btn');
  agregarSonidoBoton('.modo-card');
  observarBotonesDinamicos();

  document.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      reproducirSonido('whoosh');
    });
  });

  crearTimeout(() => {
    reproducirSonido('musica_menu', { loop: true, volumen: CONFIG_JUEGO.VOLUMEN_MUSICA_MENU });
  }, CONFIG_JUEGO.TIEMPO_INICIO_MUSICA_MS);
});
// ============================== LISTENERS DINÁMICOS GLOBALES ==============================
// Estos se delegan al documento completo, por lo que está bien que queden sueltos fuera del DOMContentLoaded.

// Escuchar cambios en los inputs de nombres dinámicos
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('jugador-input')) {
    saveAll();
  }
});

// Escuchar cambios en los checkboxes de las categorías dinámicas
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('categoria-checkbox')) {
    saveAll();
  }
});

// ============================== EXPONER FUNCIONES AL HTML ==============================
// Con <script type="module"> las funciones no son globales, así que los
// onclick="..." del HTML (y los generados dinámicamente) no las encuentran.
const online = initOnline({
  app, db, $, estado, CONFIG_JUEGO, saveAll,
  cambiarPantalla, crearModal, confirmModal, reproducirSonido, vibrar,
  validarTextoCampo, normalizarNombre, mezclarArray,
  obtenerSiguienteCategoria, elegirPalabraDeCategoria,
  seleccionarImpostoresSinRepetir, obtenerCandidatoSrBlanco,
  verificarVictoriaSrBlanco
});

Object.assign(window, online, {
  rotarTema, exportarDatos, importarDatos, mostrarPanelEstadisticas, restablecerTodo,
  toggleDarkMode, cambiarPantalla, guardarLocal, seleccionarModo,
  ajustarNumeroJugadores, ajustarNumeroImpostores, ajustarNumeroRondas,
  agregarCategoria, agregarPalabraYpistas, empezarPartida,
  revelarPalabra, siguienteJugador, irAVotacion,
  seleccionarVoto, seleccionarVotoGeneral,
  activarDebug, desactivarDebug,
  iniciarPantallaCarga, elegirModoJuego
});