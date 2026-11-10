// =============================================================================
// social.js — Chat de voz P2P (WebRTC en malla) y reacciones flotantes
//
// Firestore:
//   salas/{codigo}/jugadores/{uid}.vozSesion          '' = fuera de la voz; texto = sesión de voz activa
//   salas/{codigo}/llamadas/{uidA_uidB}               señalización de UN par (ids ordenados alfabéticamente)
//        offerer, answerer, sesionId, vozSesion, offer{type,sdp}, answer{type,sdp}|null
//   salas/{codigo}/llamadas/{par}/candidatos/{id}     candidatos ICE {de, sesionId, candidate(JSON)}
//   salas/{codigo}/reacciones/{id}                    {uid, nombre, emoji, creadoEn}
//
// Reglas del juego aplicadas a la voz:
//   · Los expulsados (espectadores) pueden ESCUCHAR pero su micrófono queda silenciado.
//   · Mientras el Sr. Blanco adivina, todos los micrófonos se silencian (nadie puede soplar la palabra).
//
// Limitación: solo hay servidores STUN públicos. En redes muy restrictivas (NAT simétrico, algunas
// redes móviles/corporativas) haría falta un servidor TURN propio (ver ICE_SERVERS).
// =============================================================================
import {
  doc, collection, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Para redes difíciles añade aquí tu TURN: { urls: 'turn:tu.servidor:3478', username: '...', credential: '...' }
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
export const EMOJIS_REACCION = ['👍', '👏', '😂', '😮', '🤔', '😡', '🔥', '🙈']; // deben coincidir con firestore.rules
const MAX_REINTENTOS = 5;
const UMBRAL_VOZ = 16;          // 0-255: nivel a partir del cual se marca "hablando"
const MAX_FLOTANTES = 24;

export function crearSocial(ctx) {
  const { db, getSesion, getSala, getJugadores, modal, sonido, escapeHtml, dormido } = ctx;

  const voz = {
    activa: false, stream: null, silenciado: false, sesion: '',
    pares: new Map(), ctxAudio: null, medidor: null, analizadorLocal: null, hablandoLocal: false
  };
  let rail = null, btnVoz = null, btnMute = null, btnReacc = null, paleta = null, listaVoz = null, capa = null;
  let unsubReacc = null;
  let inicioMs = 0, ultimaReaccion = 0, ocupadoUnirse = false;
  const vistas = new Set();

  const yo = () => getJugadores().find((j) => j.uid === getSesion()?.uid);
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const parIdDe = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const refPar = (id) => doc(db, 'salas', getSesion().codigo, 'llamadas', id);
  const colCand = (id) => collection(db, 'salas', getSesion().codigo, 'llamadas', id, 'candidatos');

  function crearEl(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  // ------------------------------------------------------------------ UI
  function construirUI() {
    if (rail || !getSesion()) return;
    rail = crearEl('div', 'social-rail');
    btnVoz = crearEl('button', 'social-btn', '🎙️');
    btnVoz.type = 'button';
    btnVoz.title = 'Unirme al chat de voz';
    btnVoz.setAttribute('aria-label', 'Unirme al chat de voz');
    btnMute = crearEl('button', 'social-btn oculto', '🎤');
    btnMute.type = 'button';
    btnMute.title = 'Silenciar / activar micrófono';
    btnMute.setAttribute('aria-label', 'Silenciar o activar micrófono');
    btnReacc = crearEl('button', 'social-btn', '😀');
    btnReacc.type = 'button';
    btnReacc.title = 'Reacciones';
    btnReacc.setAttribute('aria-label', 'Reacciones');
    paleta = crearEl('div', 'social-paleta oculto');
    EMOJIS_REACCION.forEach((em) => {
      const b = crearEl('button', 'social-btn pequeno', em);
      b.type = 'button';
      b.setAttribute('aria-label', `Reaccionar con ${em}`);
      b.addEventListener('click', () => enviarReaccion(em));
      paleta.appendChild(b);
    });
    listaVoz = crearEl('div', 'voz-lista oculto');
    listaVoz.setAttribute('aria-live', 'polite');

    btnVoz.addEventListener('click', () => (voz.activa ? salirVoz() : unirseVoz()));
    btnMute.addEventListener('click', alternarSilencio);
    btnReacc.addEventListener('click', () => paleta.classList.toggle('oculto'));

    rail.appendChild(btnVoz);
    rail.appendChild(btnMute);
    rail.appendChild(btnReacc);
    rail.appendChild(paleta);
    rail.appendChild(listaVoz);
    document.body.appendChild(rail);

    capa = crearEl('div', 'reacciones-capa');
    capa.setAttribute('aria-hidden', 'true');
    document.body.appendChild(capa);
  }

  function pintarBotones() {
    if (!btnVoz) return;
    btnVoz.textContent = voz.activa ? '📴' : '🎙️';
    btnVoz.title = voz.activa ? 'Salir del chat de voz' : 'Unirme al chat de voz';
    btnVoz.classList.toggle('activo', voz.activa);
    if (btnMute) {
      btnMute.classList.toggle('oculto', !voz.activa || !voz.stream);
      const forzado = voz.activa && voz.stream && !puedeHablar();
      btnMute.textContent = (voz.silenciado || forzado) ? '🔇' : '🎤';
      btnMute.classList.toggle('activo', !(voz.silenciado || forzado));
    }
  }

  function pintarLista() {
    if (!listaVoz) return;
    const s = getSesion();
    if (!s) return;
    const enVoz = getJugadores().filter((j) => j.vozSesion && !dormido(j));
    if (!enVoz.length) { listaVoz.classList.add('oculto'); listaVoz.innerHTML = ''; return; }
    listaVoz.classList.remove('oculto');
    listaVoz.innerHTML = enVoz.map((j) => {
      const esYo = j.uid === s.uid;
      const par = voz.pares.get(j.uid);
      let estado = '';
      if (esYo) estado = voz.stream ? (puedeHablar() && !voz.silenciado ? '' : ' 🔇') : ' 👂';
      else if (voz.activa) estado = !par ? '' : (par.estado === 'ok' ? '' : (par.estado === 'error' ? ' ⚠️' : ' …'));
      const habla = esYo ? voz.hablandoLocal : !!(par && par.hablando);
      return `<div class="voz-item${habla ? ' hablando' : ''}"><span class="voz-punto"></span>${escapeHtml(j.nombre)}${esYo ? ' (tú)' : ''}${estado}</div>`;
    }).join('');
  }

  // ------------------------------------------------------------------ micrófono
  function puedeHablar() {
    const sala = getSala();
    const mio = yo();
    if (!sala || !mio) return false;
    if (sala.estado === 'adivinando') return false;
    if (mio.vivo === false && sala.estado !== 'esperando' && sala.estado !== 'finalizada') return false;
    return true;
  }

  function aplicarMicrofono() {
    if (!voz.stream) return;
    const on = puedeHablar() && !voz.silenciado;
    voz.stream.getAudioTracks().forEach((t) => { t.enabled = on; });
    pintarBotones();
  }

  function alternarSilencio() {
    if (!voz.activa || !voz.stream) return;
    voz.silenciado = !voz.silenciado;
    aplicarMicrofono();
    pintarLista();
  }

  // ------------------------------------------------------------------ voz: entrar / salir
  async function unirseVoz() {
    if (voz.activa || ocupadoUnirse || !getSesion()) return;
    if (typeof RTCPeerConnection === 'undefined') {
      modal('Voz no disponible', '<p>Tu navegador no soporta llamadas de voz (WebRTC). Prueba con Chrome, Edge, Firefox o Safari actualizado.</p>');
      return;
    }
    ocupadoUnirse = true;
    try {
      let stream = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin mediaDevices (¿usas https o localhost?)');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false
        });
      } catch (e) {
        console.warn('Micrófono no disponible:', e);
        modal('Sin micrófono', `<p>No se pudo usar el micrófono (${escapeHtml(String(e && (e.name || e.message) || 'error'))}). Entrarás <strong>solo para escuchar</strong>. Para hablar, permite el micrófono en el navegador y vuelve a entrar.</p>`);
      }
      if (!getSesion()) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }

      voz.stream = stream;
      voz.silenciado = false;
      voz.sesion = rid();
      voz.activa = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          voz.ctxAudio = voz.ctxAudio || new AC();
          if (voz.ctxAudio.state === 'suspended') voz.ctxAudio.resume().catch(() => {});
          if (stream) {
            const src = voz.ctxAudio.createMediaStreamSource(stream);
            voz.analizadorLocal = voz.ctxAudio.createAnalyser();
            voz.analizadorLocal.fftSize = 256;
            src.connect(voz.analizadorLocal);
          }
        }
      } catch (e) { console.warn('Medidor de voz no disponible:', e); }
      if (!voz.medidor) voz.medidor = setInterval(medirNiveles, 250);

      aplicarMicrofono();
      pintarBotones();
      await updateDoc(doc(db, 'salas', getSesion().codigo, 'jugadores', getSesion().uid), { vozSesion: voz.sesion });
      sonido('click');
      sincronizarPares();
      pintarLista();
    } catch (e) {
      console.error('No se pudo entrar a la voz:', e);
      await salirVoz(false);
      modal('No se pudo entrar a la voz', `<p>${escapeHtml(String(e && (e.code || e.message) || e))}</p>`);
    } finally {
      ocupadoUnirse = false;
    }
  }

  async function salirVoz(avisar = true) {
    const estabaActiva = voz.activa;
    voz.activa = false;
    [...voz.pares.keys()].forEach(cerrarPar);
    if (voz.stream) { voz.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* nada */ } }); voz.stream = null; }
    voz.analizadorLocal = null;
    voz.hablandoLocal = false;
    if (voz.medidor) { clearInterval(voz.medidor); voz.medidor = null; }
    const s = getSesion();
    voz.sesion = '';
    pintarBotones();
    pintarLista();
    if (estabaActiva && s) {
      try { await updateDoc(doc(db, 'salas', s.codigo, 'jugadores', s.uid), { vozSesion: '' }); }
      catch (e) { /* la sala pudo cerrarse o ya saliste */ }
      if (avisar) sonido('click');
    }
  }

  // ------------------------------------------------------------------ pares (una conexión por jugador)
  function sincronizarPares() {
    const s = getSesion();
    if (!voz.activa || !s) return;
    const otros = getJugadores().filter((j) => j.uid !== s.uid);
    const presentes = new Set();
    for (const j of otros) {
      if (!j.vozSesion || dormido(j)) continue;
      presentes.add(j.uid);
      const par = voz.pares.get(j.uid);
      if (par && par.vozSesionOtro !== j.vozSesion) { cerrarPar(j.uid); crearPar(j); continue; }
      if (!par) crearPar(j);
      else { par.vozSesionOtro = j.vozSesion; if (!par.soyOferente) procesarDoc(par); }
    }
    for (const uid of [...voz.pares.keys()]) if (!presentes.has(uid)) cerrarPar(uid);
    pintarLista();
  }

  function crearPar(otro) {
    const s = getSesion();
    const id = parIdDe(s.uid, otro.uid);
    const par = {
      uid: otro.uid, id, soyOferente: s.uid < otro.uid, vozSesionOtro: otro.vozSesion,
      pc: null, sesionId: null, intentos: 0, respondida: false, ocupado: false,
      cands: [], docData: null, unsubDoc: null, unsubCand: null, estado: 'conectando',
      audio: null, analizador: null, hablando: false, timerReintento: null
    };
    voz.pares.set(otro.uid, par);
    par.unsubDoc = onSnapshot(refPar(id), (snap) => {
      if (!snap.exists()) return;
      par.docData = snap.data();
      procesarDoc(par);
    }, (err) => console.error('Error en señalización de voz:', err));
    par.unsubCand = onSnapshot(colCand(id), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data();
        if (d.de === s.uid) return;
        par.cands.push({ id: ch.doc.id, sesionId: d.sesionId, cand: d.candidate, aplicado: false });
      });
      aplicarCandidatos(par);
    }, (err) => console.error('Error en candidatos ICE:', err));
    if (par.soyOferente) iniciarOferta(par);
  }

  function nuevaConexion(par) {
    cerrarConexion(par);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    par.pc = pc;
    par.estado = 'conectando';
    pc.onicecandidate = (e) => {
      if (!e.candidate || par.pc !== pc || !getSesion()) return;
      const c = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
      addDoc(colCand(par.id), { de: getSesion().uid, sesionId: par.sesionId, candidate: JSON.stringify(c) }).catch(() => {});
    };
    pc.ontrack = (e) => {
      const flujo = (e.streams && e.streams[0]) || (typeof MediaStream !== 'undefined' ? new MediaStream([e.track]) : null);
      if (flujo) conectarAudio(par, flujo);
    };
    pc.onconnectionstatechange = () => {
      if (par.pc !== pc) return;
      const st = pc.connectionState;
      par.estado = st === 'connected' ? 'ok' : (st === 'failed' || st === 'closed' ? 'error' : 'conectando');
      pintarLista();
      if (st === 'failed') reiniciarPar(par);
    };
    return pc;
  }

  async function iniciarOferta(par) {
    if (!voz.activa || !getSesion() || par.ocupado) return;
    par.ocupado = true;
    try {
      par.intentos++;
      par.sesionId = `${voz.sesion}-${par.intentos}`;
      par.respondida = false;
      const pc = nuevaConexion(par);
      if (voz.stream) voz.stream.getAudioTracks().forEach((t) => pc.addTrack(t, voz.stream));
      else pc.addTransceiver('audio', { direction: 'recvonly' });
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      await setDoc(refPar(par.id), {
        offerer: getSesion().uid, answerer: par.uid, sesionId: par.sesionId, vozSesion: voz.sesion,
        offer: { type: oferta.type, sdp: oferta.sdp }, answer: null, creadoEn: serverTimestamp()
      });
    } catch (e) {
      console.error('No se pudo crear la oferta de voz:', e);
      par.estado = 'error';
    } finally {
      par.ocupado = false;
      pintarLista();
    }
  }

  async function procesarDoc(par) {
    const d = par.docData;
    const s = getSesion();
    if (!d || !s || !voz.activa || voz.pares.get(par.uid) !== par) return;
    if (par.soyOferente) {
      // Espero la respuesta de MI oferta actual
      if (d.offerer !== s.uid || d.sesionId !== par.sesionId || !d.answer || par.respondida) return;
      const pc = par.pc;
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      par.respondida = true;
      try {
        await pc.setRemoteDescription(d.answer);
        aplicarCandidatos(par);
      } catch (e) { console.error('Respuesta de voz inválida:', e); par.estado = 'error'; pintarLista(); }
      return;
    }
    // Soy quien responde: acepto solo ofertas de la sesión de voz VIGENTE del otro jugador
    if (d.offerer !== par.uid || !d.offer || d.sesionId === par.sesionId || par.ocupado) return;
    if (!par.vozSesionOtro || d.vozSesion !== par.vozSesionOtro) return;
    par.ocupado = true;
    try {
      par.sesionId = d.sesionId;
      par.cands = par.cands.filter((c) => c.sesionId === par.sesionId);
      const pc = nuevaConexion(par);
      await pc.setRemoteDescription(d.offer);
      if (voz.stream) voz.stream.getAudioTracks().forEach((t) => pc.addTrack(t, voz.stream));
      const respuesta = await pc.createAnswer();
      await pc.setLocalDescription(respuesta);
      aplicarCandidatos(par);
      await updateDoc(refPar(par.id), { answer: { type: respuesta.type, sdp: respuesta.sdp } });
    } catch (e) {
      console.error('No se pudo responder la llamada de voz:', e);
      par.estado = 'error';
    } finally {
      par.ocupado = false;
      pintarLista();
      // si llegó una oferta más nueva mientras respondía, se procesa ahora
      if (par.docData && par.docData.sesionId !== par.sesionId) setTimeout(() => procesarDoc(par), 0);
    }
  }

  function aplicarCandidatos(par) {
    const pc = par.pc;
    if (!pc || !pc.remoteDescription) return;
    for (const c of par.cands) {
      if (c.aplicado || c.sesionId !== par.sesionId) continue;
      c.aplicado = true;
      try { pc.addIceCandidate(JSON.parse(c.cand)).catch(() => {}); } catch (e) { /* candidato inválido */ }
    }
  }

  function reiniciarPar(par) {
    if (!par.soyOferente || par.timerReintento) return;
    if (par.intentos >= MAX_REINTENTOS) { par.estado = 'error'; pintarLista(); return; }
    par.timerReintento = setTimeout(() => {
      par.timerReintento = null;
      if (voz.activa && voz.pares.get(par.uid) === par) iniciarOferta(par);
    }, 1500);
  }

  function cerrarConexion(par) {
    if (par.pc) {
      const pc = par.pc;
      par.pc = null;
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null;
      try { pc.close(); } catch (e) { /* nada */ }
    }
    if (par.audio) { try { par.audio.srcObject = null; par.audio.remove(); } catch (e) { /* nada */ } par.audio = null; }
    par.analizador = null;
    par.hablando = false;
  }

  function cerrarPar(uid) {
    const par = voz.pares.get(uid);
    if (!par) return;
    voz.pares.delete(uid);
    if (par.timerReintento) { clearTimeout(par.timerReintento); par.timerReintento = null; }
    if (par.unsubDoc) par.unsubDoc();
    if (par.unsubCand) par.unsubCand();
    cerrarConexion(par);
    pintarLista();
  }

  function conectarAudio(par, flujo) {
    if (par.audio) { try { par.audio.remove(); } catch (e) { /* nada */ } }
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = flujo;
    document.body.appendChild(audio);
    if (typeof audio.play === 'function') { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
    par.audio = audio;
    try {
      if (voz.ctxAudio) {
        const src = voz.ctxAudio.createMediaStreamSource(flujo);
        par.analizador = voz.ctxAudio.createAnalyser();
        par.analizador.fftSize = 256;
        src.connect(par.analizador);
      }
    } catch (e) { /* sin medidor: solo se pierde el indicador de "hablando" */ }
  }

  // ------------------------------------------------------------------ indicador "hablando"
  function nivel(analizador) {
    if (!analizador) return 0;
    const datos = new Uint8Array(analizador.frequencyBinCount);
    analizador.getByteFrequencyData(datos);
    let suma = 0;
    for (let i = 0; i < datos.length; i++) suma += datos[i];
    return suma / (datos.length || 1);
  }

  function medirNiveles() {
    let cambio = false;
    const local = voz.stream && puedeHablar() && !voz.silenciado && nivel(voz.analizadorLocal) > UMBRAL_VOZ;
    if (!!local !== voz.hablandoLocal) { voz.hablandoLocal = !!local; cambio = true; }
    voz.pares.forEach((par) => {
      const h = nivel(par.analizador) > UMBRAL_VOZ;
      if (h !== par.hablando) { par.hablando = h; cambio = true; }
    });
    if (cambio) pintarLista();
  }

  // ------------------------------------------------------------------ reacciones
  async function enviarReaccion(emoji) {
    const s = getSesion();
    if (!s || !EMOJIS_REACCION.includes(emoji)) return;
    const t = Date.now();
    if (t - ultimaReaccion < 900) return; // anti-spam
    ultimaReaccion = t;
    if (paleta) paleta.classList.add('oculto');
    try {
      const ref = await addDoc(collection(db, 'salas', s.codigo, 'reacciones'), {
        uid: s.uid, nombre: s.nombre, emoji, creadoEn: serverTimestamp()
      });
      // limpieza: cada quien borra su propia reacción pasados unos segundos
      setTimeout(() => { deleteDoc(ref).catch(() => {}); }, 10000);
    } catch (e) { console.error('No se pudo enviar la reacción:', e); }
  }

  function flotar(emoji, nombre) {
    if (!capa || capa.childNodes && capa.childNodes.length > MAX_FLOTANTES) return;
    const el = crearEl('div', 'reaccion-flotante');
    el.style.left = `${8 + Math.random() * 78}%`;
    el.appendChild(crearEl('span', 'reaccion-emoji', emoji));
    el.appendChild(crearEl('small', 'reaccion-nombre', nombre || ''));
    capa.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) { /* nada */ } }, 3400);
  }

  function escucharReacciones() {
    const s = getSesion();
    if (!s || unsubReacc) return;
    inicioMs = Date.now();
    const q = query(collection(db, 'salas', s.codigo, 'reacciones'), orderBy('creadoEn', 'desc'), limit(20));
    unsubReacc = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'added' || vistas.has(ch.doc.id)) return;
        vistas.add(ch.doc.id);
        const d = ch.doc.data();
        const t = d.creadoEn && d.creadoEn.toMillis ? d.creadoEn.toMillis() : Date.now();
        if (t < inicioMs - 3000) return; // ignora el historial anterior a mi entrada
        flotar(d.emoji, d.nombre);
      });
      if (vistas.size > 300) vistas.clear();
    }, (err) => console.error('Error escuchando reacciones:', err));
  }

  // ------------------------------------------------------------------ API para online.js
  return {
    iniciar() { construirUI(); escucharReacciones(); pintarBotones(); },
    detener() {
      salirVoz(false);
      if (unsubReacc) { unsubReacc(); unsubReacc = null; }
      vistas.clear();
      [rail, capa].forEach((e) => { if (e) { try { e.remove(); } catch (x) { /* nada */ } } });
      rail = btnVoz = btnMute = btnReacc = paleta = listaVoz = capa = null;
    },
    // el listado de jugadores cambió (entró/salió alguien, cambió vozSesion, latidos...)
    jugadores() { sincronizarPares(); aplicarMicrofono(); pintarLista(); },
    // cambió el estado de la sala (espectador, adivinando...)
    sala() { aplicarMicrofono(); pintarLista(); },
    visible(v) { if (rail) rail.classList.toggle('oculto', !v); },
    unirseVoz, salirVoz, enviarReaccion,
    estadoDebug() {
      return {
        activa: voz.activa,
        pares: [...voz.pares.values()].map((p) => ({ uid: p.uid, estado: p.estado, sesionId: p.sesionId })),
        flotantes: capa && capa.childNodes ? capa.childNodes.length : 0
      };
    }
  };
}
