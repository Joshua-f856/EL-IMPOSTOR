# 🕵️ EL IMPOSTOR

> Juego social de deducción por roles para grupos. Debate, vota y descubre quién es el impostor antes de que sea demasiado tarde.

---

## 📖 Descripción

**El Impostor** es un juego de fiesta multijugador basado en navegador, jugado en un solo dispositivo compartido. Cada jugador recibe un rol secreto — Civil, Impostor o Sr. Blanco — y debe usar pistas, debate y votación para ganar.

### 🎮 Modos de juego

| Modo | Jugadores mínimos | Descripción |
|------|-------------------|-------------|
| 🕵️ Clásico | 3 | Civiles vs Impostores |
| 🎩 Misterio | 5 | Se añade el Sr. Blanco, que no conoce la palabra |
| 🌪️ Caos | 6 | Roles y cantidad de impostores aleatorios |

### 🏆 Condiciones de victoria

- **Civiles ganan** → eliminan a todos los impostores y al Sr. Blanco
- **Impostor gana** → iguala o supera en número a los civiles
- **Sr. Blanco gana** → es expulsado y adivina correctamente la palabra secreta

---

## ✨ Características

- 🎭 Sistema de roles: Civil, Impostor, Sr. Blanco
- 🃏 Revelación de carta con animación 3D flip
- 🗳️ Dos modos de votación: por turnos y general
- 🔁 Sistema anti-repetición de impostor entre rondas
- 📂 El impostor puede conocer la categoría (configurable)
- 🤝 Los impostores pueden conocerse entre sí (configurable)
- ⏱️ Cronómetro de debate configurable
- 🎨 6 temas de color: azul, rojo, amarillo, verde, naranja, púrpura
- 🌙 Modo oscuro / claro
- 🗂️ Categorías y palabras totalmente personalizables
- 💾 Persistencia con LocalStorage (guarda configuración entre sesiones)
- 📤 Exportar / 📥 Importar datos en formato JSON
- 📳 Vibración y 🔊 sonidos por evento
- ♿ Navegación accesible con teclado
- 📱 Diseño responsive (móvil y escritorio)
- 🌐 Partículas animadas en el fondo (Canvas API)

---

## 🛠️ Tecnologías utilizadas

| Tecnología | Uso |
|------------|-----|
| HTML5 | Estructura del juego |
| CSS3 | Diseño, animaciones, temas, responsive |
| JavaScript (Vanilla) | Lógica del juego, estados, DOM |
| Canvas API | Animación de partículas en el fondo |
| LocalStorage API | Persistencia de datos |
| Web Vibration API | Feedback táctil en móvil |
| HTML5 Audio API | Efectos de sonido |

> ⚠️ Sin frameworks ni librerías externas. Todo en HTML, CSS y JS puro.

---

## 📁 Estructura del proyecto

```
el-impostor/
├── index.html        # Estructura: todas las pantallas (offline y online)
├── style.css         # Estilos, temas, animaciones y pantallas online
├── script.js         # Modo offline, categorías en la nube y arranque de Firebase
├── online.js         # Modo online completo (salas, sincronización, motor del anfitrión)
├── social.js         # Chat de voz P2P (WebRTC) y reacciones flotantes
├── firestore.rules   # Reglas de seguridad de Firestore (publicar en la consola)
├── manifest.webmanifest  # PWA: nombre, colores e iconos de la app instalable
├── sw.js             # Service worker (red primero, caché solo sin conexión)
├── icons/            # Iconos de la app (ver sección "Iconos y PWA")
├── tests/            # Simulador (Firestore en memoria) que juega partidas completas
└── sonido/           # Efectos de sonido (.mp3) en juego/, resultados/, ui/ y especiales/
```

---

## 🚀 Instalación y ejecución

No requiere instalación, servidor ni dependencias.

### Opción A — Abrir directamente

1. Descarga o clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/el-impostor.git
   ```
2. Abre el archivo `index.html` en tu navegador:
   ```
   Doble clic en index.html
   ```
3. ¡Listo! El juego corre completamente en el navegador.

### Opción B — Con servidor local (recomendado para sonidos)

```bash
# Con VS Code: instala la extensión "Live Server" y haz clic en "Go Live"

# O con Python:
python -m http.server 8000
# Luego abre: http://localhost:8000
```

> 💡 Se recomienda usar un servidor local para que los sonidos funcionen correctamente en todos los navegadores.

---

## 🎯 ¿Cómo jugar?

1. **Configura** el número de jugadores y escribe sus nombres
2. **Elige** el modo de juego (Clásico, Misterio o Caos)
3. **Selecciona** las categorías de palabras que quieres usar
4. **Inicia** la partida — cada jugador toca la pantalla para ver su rol en secreto
5. **Debate** — cada jugador da una pista sobre la palabra secreta sin revelarla
6. **Vota** — el grupo vota a quién quiere expulsar
7. ¡El juego continúa hasta que un bando gane!

---

## ⚙️ Opciones de configuración

| Opción | Descripción |
|--------|-------------|
| Número de jugadores | De 3 a 20 jugadores |
| Número de impostores | Según el modo y cantidad de jugadores |
| Dar pista al impostor | El impostor recibe una pista de la palabra |
| Conocer la categoría | El impostor sabe a qué categoría pertenece la palabra |
| Impostores se conocen | Los impostores ven quiénes son sus aliados |
| Duración del debate | Cronómetro opcional en minutos |
| Tipo de votación | Por turnos (secreto) o general (simultáneo) |

---

## 👤 Autor

**Joshua**
Estudiante de Desarrollo de Software — Panamá

---

## 📄 Licencia

Este proyecto fue desarrollado con fines educativos.



## 🌐 Multijugador online

### Flujo de una partida (el anfitrión coordina las transiciones)

1. **Lobby** – el anfitrión configura modo, pista/categoría/aliados del impostor, duración del debate, **tipo de votación** (general en vivo / secreta), **rondas máximas** y **capacidad** (por defecto 6). El número de impostores se calcula solo.
2. **Sala llena → inicio automático (privada y pública)** – cuando `jugadores = capacidad` (y se cumple el mínimo del modo), el anfitrión publica una **cuenta de 5 s visible para toda la sala** y la partida arranca sola para todos a la vez. Si alguien sale o se cambia la capacidad, la cuenta se cancela. En salas privadas el anfitrión también puede pulsar **Iniciar** antes (mínimo del modo). En las públicas solo arranca al llenarse.
3. **Cartas** – las cartas se escriben primero y el estado pasa a `jugando` al final, así todos ven su carta al mismo tiempo. Cada jugador la revela y pulsa **Listo**; la pantalla de espera muestra quién falta (`✅ Listo / 👀 Viendo su carta`). El anfitrión puede **empezar sin esperar** si alguien se quedó colgado.
4. **Cuenta regresiva 3-2-1** sincronizada con el reloj del servidor, con el texto **EMPIEZA «nombre»**. Quien empieza se elige al azar entre los vivos (nunca el Sr. Blanco, igual que offline).
5. **Debate** – todos los nombres en pantalla. Quien empieza **ya tiene la palabra** (🎙️ Habla ahora). Los demás pulsan **Hablar** (cola de turnos) y **Terminé de hablar** (queda ✔️ Ya habló). El debate acaba cuando **todos** pulsan **Listo para votar** o se agota el tiempo (aviso sonoro a los 10 s).
6. **Votación** – cada jugador elige y pulsa **Confirmar voto**. Se cuenta sola cuando **todos los vivos confirman** o a los **120 s** (quien no votó se abstiene). En modo *general* los votos se ven en vivo; en *secreta* solo el progreso.
7. **Expulsión** del más votado (empate = nadie sale). Si es el **Sr. Blanco**, tiene 30 s para adivinar la palabra.
8. **Resultado** (9 s) → nueva cuenta regresiva → nuevo debate… hasta que ganen civiles, impostores o el Sr. Blanco, o se agoten las rondas.
9. Al terminar el anfitrión pulsa **Nueva partida** (misma sala) o todos salen.

Los expulsados pasan a **modo espectador**. El chat se oculta mientras ves tu carta / esperas / cuenta regresiva para no taparla.

### 🎙️ Chat de voz y 😀 reacciones

Aparecen como una columna de botones en el borde izquierdo (se ocultan mientras ves tu carta, la espera y la cuenta regresiva).

- **🎙️ Voz P2P (WebRTC en malla):** cada jugador se conecta directamente con los demás; el audio no pasa por ningún servidor. Firestore solo se usa para la *señalización* (ofertas, respuestas y candidatos ICE en `salas/{codigo}/llamadas/{parId}`), y cada par solo puede leer/escribir su propia señalización.
  - Botón 🎙️ → entrar/salir. 🎤/🔇 → silenciar tu micrófono. Si el micrófono falla o lo deniegas, entras **solo para escuchar** (👂).
  - Lista de quién está en voz, con punto verde cuando alguien **habla**.
  - **Reglas del juego:** los **expulsados** pueden escuchar pero su micrófono se silencia durante la partida; mientras el **Sr. Blanco adivina** se silencian todos los micrófonos.
  - Requiere **https o localhost** y permiso de micrófono. Solo usa servidores STUN públicos: en redes muy restrictivas puede no conectar; añade tu servidor TURN en `ICE_SERVERS` (`social.js`). Al ser malla, lo ideal son ≤ 8 personas en voz.
- **😀 Reacciones:** 8 emojis (👍 👏 😂 😮 🤔 😡 🔥 🙈) que flotan en la pantalla de todos con tu nombre (1 por segundo, cada quien borra las suyas a los 10 s).

### 📱 Iconos y PWA

El juego se puede instalar como app (Android/iOS/escritorio). Coloca tus iconos en `icons/` con estos nombres (o cambia las rutas en `manifest.webmanifest` e `index.html`):

| Archivo | Tamaño | Uso |
|---|---|---|
| `icons/icon-192.png` | 192×192 | icono estándar |
| `icons/icon-512.png` | 512×512 | icono estándar grande |
| `icons/icon-maskable-512.png` | 512×512 | icono "maskable" (dibujo dentro del 80 % central) |
| `icons/apple-touch-icon.png` | 180×180 | iOS |
| `icons/favicon-32.png` | 32×32 | pestaña del navegador |

`sw.js` usa estrategia *red primero*: siempre baja la versión nueva y solo usa la caché si no hay conexión. Cambia `VERSION` en `sw.js` cuando quieras limpiar cachés antiguas. Los colores de la app están en `manifest.webmanifest` (`theme_color`, `background_color`).

### Robustez
- **Reconexión**: si recargas la página puedes volver a entrar a una sala privada con el mismo código (tu sesión anónima se conserva), incluso con la partida empezada.
- **Anfitrión caído**: los demás ven un aviso (⚠️) y la partida queda en pausa. Una sala pública cuyo anfitrión lleva >2 min sin latido se descarta y se crea una nueva.
- **Cupo atómico**: unirse suma `jugadoresCount` y crea el jugador en la misma transacción; las reglas rechazan pasarse de la capacidad.
- **Pantalla encendida**: se usa Wake Lock para que el móvil no se duerma durante la partida.

### Publicar las reglas de Firestore (obligatorio)

1. Firebase Console → **Authentication → Sign-in method → Anonymous → Activar**.
2. Firebase Console → **Firestore Database → Rules** → pega el contenido de `firestore.rules` → **Publicar**.
3. (Recomendado) **Firestore → Time-to-live**: política sobre el campo `expiraEn` de la colección `salas` para borrar salas viejas (los TTL no borran subcolecciones; es solo limpieza).

> Los módulos ES no funcionan abriendo `index.html` con doble clic (`file://`). Usa un servidor local: `python -m http.server 8000` o Live Server.

### Cómo probar
1. Abre 3+ pestañas/dispositivos (alguna en incógnito para tener otro usuario anónimo).
2. En una: **Crear sala privada** (o *Jugar partida pública*). En las otras: entra con el código (o pulsa *partida pública*).
3. El anfitrión ajusta la capacidad; al llenarse la sala arranca sola.

### Pruebas automáticas
La carpeta `tests/` simula Firestore en memoria y juega partidas completas con 4-6 clientes (sala privada, pública, Misterio con Sr. Blanco, votación secreta, varias rondas, sala pública llena, anfitrión caído y nueva partida) y, con un WebRTC simulado, la señalización de voz, reacciones, reconexión y silencio automático. No requiere dependencias:

```bash
cd tests && sh preparar.sh && node privada.mjs && node publica-misterio.mjs && node multironda.mjs && node publica-llena.mjs && node voz.mjs
```

> El simulador valida la lógica del cliente (no el audio real ni las reglas de seguridad) (para eso usa el *Rules Playground* de la consola o el emulador de Firebase).

---

## 🗂️ Qué hace cada archivo

| Archivo | Función |
|---|---|
| `index.html` | Todas las pantallas (`<section class="pantalla">`). Solo una tiene `.activa`. Incluye las pantallas online: `salaOnline`, `lobby`, `revelar`, `esperaOnline`, `cuentaRegresivaOnline`, `debateOnline`, `votacion`, `adivinarOnline`, `resultado`, `espectadorOnline` y el aviso `avisoConexionOnline`. |
| `style.css` | Temas, modo oscuro, animación 3D de la carta, `.oculto`, estilos de lobby/debate/chat/aviso. |
| `script.js` | Modo offline completo, categorías sincronizadas con Firestore, sonidos, modales, estadísticas, exportar/importar. Al final llama `initOnline({...})` y expone las funciones al HTML (`window`). |
| `social.js` | Voz P2P con WebRTC (malla, señalización por Firestore, indicador de quién habla, silencio automático) y reacciones flotantes. Lo crea `online.js` con `crearSocial({...})`. |
| `manifest.webmanifest` / `sw.js` | App instalable (PWA) y caché de respaldo sin conexión. |
| `online.js` | Modo online. `initOnline(deps)` devuelve las funciones que usa el HTML. Contiene: auth anónima, crear/unirse a salas, listeners, render por estado, motor del anfitrión (`evaluarHost` + transiciones), votación, Sr. Blanco, chat. |
| `firestore.rules` | Seguridad: solo el anfitrión escribe estado/roles/`vivo`; cada jugador solo sus campos de interacción; roles privados; votos visibles según tipo; chat solo para miembros; cola pública protegida. |

### Colecciones de Firestore

| Ruta | Quién escribe | Quién lee |
|---|---|---|
| `categorias/{id}` | cualquier usuario autenticado | todos |
| `salasPublicas/activa` | quien crea la sala pública | autenticados |
| `salas/{codigo}` | anfitrión (y ±1 de `jugadoresCount` al unirse/salir) | autenticados (solo `get`) |
| `salas/{codigo}/jugadores/{uid}` | el propio jugador (campos de interacción); anfitrión (`vivo`, turno inicial) | autenticados |
| `salas/{codigo}/privado/{uid}` | anfitrión | ese jugador + anfitrión |
| `salas/{codigo}/secreto/ronda` | anfitrión | anfitrión |
| `salas/{codigo}/votos/{uid}` | el votante (solo en `votando`, jugador vivo → vivo, no a sí mismo) | anfitrión; todos si la votación es *general* |
| `salas/{codigo}/chat/{id}` | miembros | miembros |
| `salas/{codigo}/reacciones/{id}` | miembros (solo los 8 emojis permitidos) | miembros |
| `salas/{codigo}/llamadas/{parId}` | el par: quien ofrece escribe la oferta, quien responde solo `answer` | solo esos 2 jugadores |
| `salas/{codigo}/llamadas/{parId}/candidatos/{id}` | el par (cada uno los suyos) | solo esos 2 jugadores |

### Estados de la sala (`salas/{codigo}.estado`)
`esperando → jugando → cuenta → debate → votando → [adivinando] → resultado → cuenta → … → finalizada → (nueva partida) esperando`. También `cerrada` cuando el anfitrión sale.

### Limitaciones conocidas
- El anfitrión es el "servidor": un anfitrión malintencionado podría leer los roles. Para blindarlo del todo habría que mover el motor a Cloud Functions.
- Si el anfitrión cierra la pestaña a mitad de partida, la partida queda en pausa (los demás reciben un aviso y pueden salir).
- Las categorías (`categorias`) son globales y compartidas por todos los usuarios de la app.

---

## 👤 Autor

**Joshua**
Estudiante de Desarrollo de Software — Panamá

## 📄 Licencia

Este proyecto fue desarrollado con fines educativos.
