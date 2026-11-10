// =============================================================================
// i18n.js — Inglés para TODAS las pantallas (el español es el idioma base del código)
//
// Cómo funciona: cuando el idioma activo es «en» (<html lang="en">, lo fija perfil.js), un observador
// recorre el DOM y traduce los textos y atributos (placeholder, title, aria-label, alt) que aparecen
// en cualquier pantalla, modal o mensaje dinámico. Al volver a «es» se restauran los textos originales.
//
//   · EXACTO   : texto completo (sin espacios sobrantes) → traducción
//   · PATRONES : frases con partes variables (nombres, números, tiempos)
//   · Para dejar algo sin traducir (por ejemplo, un nombre de jugador) basta con translate="no" o la
//     clase .nombre-jugador / .aliado-badge en el elemento.
//
// Para añadir un texto nuevo: agrégalo a EXACTO (o a PATRONES si lleva variables). Lo que falte
// simplemente se queda en español, nunca rompe nada.
// =============================================================================

const EXACTO = {
  // ------------------------------------------------------------ cabecera, carga y menús
  'EL JUEGO DEL IMPOSTOR | Multijugador Online Gratis': 'THE IMPOSTOR GAME | Free Online Multiplayer',
  'Este juego necesita JavaScript.': 'This game needs JavaScript.',
  '📱 PARTIDA LOCAL': '📱 LOCAL GAME',
  '👥 Configurar Jugadores': '👥 Set Up Players',
  '🎮 Modos de Juego': '🎮 Game Modes',
  '🕵️ Configurar Impostores': '🕵️ Set Up Impostors',
  '⏳ Configurar Tiempo': '⏳ Set Up Timer',
  '🗳️ Modo de Votación': '🗳️ Voting Mode',
  '🗂️ Editar Categorías': '🗂️ Edit Categories',
  '▶️ INICIAR JUEGO': '▶️ START GAME',
  'Volver': 'Back',
  '¡AQUÍ NADIE ES DE FIAR!': 'NOBODY HERE CAN BE TRUSTED!',
  'Detectando sospechosos . . .': 'Detecting suspects . . .',
  '🎮 ¿CÓMO QUIERES JUGAR?': '🎮 HOW DO YOU WANT TO PLAY?',
  'Modo Offline': 'Offline Mode',
  'Juega localmente pasando el dispositivo con tus amigos en la misma sala.': 'Play locally by passing the device around with your friends in the same room.',
  'Modo Online': 'Online Mode',
  'Crea una sala privada con código o únete a una partida pública multijugador.': 'Create a private room with a code or join a public multiplayer game.',
  '🔊 Toca para activar el sonido': '🔊 Tap to turn on sound',
  'Tocar para activar el sonido del juego': 'Tap to turn on the game sound',
  'Abrir menú': 'Open menu',
  'Cerrar menú': 'Close menu',
  'Cambiar modo claro/oscuro': 'Switch light/dark mode',
  'Menú': 'Menu',
  'Cerrar': 'Close',
  'Mi cuenta': 'My account',
  'Mi perfil': 'My profile',
  'Recursos': 'Resources',
  'Reglas del juego': 'Game rules',
  'Ayúdanos a mejorar': 'Help us improve',
  'Apoya al desarrollador': 'Support the developer',
  'Ajustes': 'Settings',
  'Cambiar tema': 'Change theme',
  'Exportar datos': 'Export data',
  'Importar datos': 'Import data',
  'Estadísticas de partidas locales': 'Local game stats',
  'Restablecer todo': 'Reset everything',
  'Idioma': 'Language',
  'Idioma / Language': 'Language',
  'Cerrar sesión': 'Log out',

  // ------------------------------------------------------------ sala online
  '🌐 SALA MULTIJUGADOR': '🌐 MULTIPLAYER ROOM',
  'Tu Nombre de Jugador:': 'Your player name:',
  '🔒 Crear Sala Privada': '🔒 Create Private Room',
  '¿Ya tienes un código?': 'Already have a code?',
  '🔑 Unirme con código': '🔑 Join with code',
  '🌍 Jugar partida pública': '🌍 Play public game',
  '🕵️ ¿CÓMO TE LLAMAS?': '🕵️ WHAT\'S YOUR NAME?',
  'Vas a entrar a la sala': 'You are about to join room',
  'Tu apodo:': 'Your nickname:',
  'Si lo dejas vacío entrarás como «Jugador Anónimo». Tu apodo se recordará en este dispositivo.': 'If you leave it empty you will join as «Anonymous Player». Your nickname will be remembered on this device.',
  '✅ Entrar a la sala': '✅ Join the room',
  'Cancelar': 'Cancel',
  '🔒 TU SALA': '🔒 YOUR ROOM',
  '🌍 PARTIDA PÚBLICA': '🌍 PUBLIC GAME',
  'PARTIDA PÚBLICA': 'PUBLIC GAME',
  'Código de la sala:': 'Room code:',
  '📋 Copiar código': '📋 Copy code',
  '🔗 Compartir enlace': '🔗 Share link',
  '📷 Código QR': '📷 QR code',
  'Modo de juego': 'Game mode',
  'Clásico (mín. 3)': 'Classic (min. 3)',
  'Misterio (mín. 5)': 'Mystery (min. 5)',
  'Caos (mín. 6)': 'Chaos (min. 6)',
  '¿Dar pista al impostor?': 'Give the impostor a hint?',
  'Sí': 'Yes',
  'No': 'No',
  '¿El impostor conoce la categoría?': 'Does the impostor know the category?',
  '¿Los impostores se conocen?': 'Do the impostors know each other?',
  'Duración del debate (minutos)': 'Debate length (minutes)',
  'Tipo de votación': 'Voting type',
  'General (votos visibles en tiempo real)': 'Open (votes visible in real time)',
  'Secreta (votos ocultos hasta el final)': 'Secret (votes hidden until the end)',
  'Rondas máximas': 'Maximum rounds',
  'Sin límite': 'No limit',
  'Cantidad de jugadores en la partida': 'Number of players in the game',
  'Categorías': 'Categories',
  'Salir de la sala': 'Leave room',
  '🃏 Carta vista': '🃏 Card seen',
  '▶️ Iniciar Partida': '▶️ Start Game',
  '⏭️ (Anfitrión) Empezar sin esperar': '⏭️ (Host) Start without waiting',
  '🕵️ Eres el único impostor': '🕵️ You are the only impostor',

  // ------------------------------------------------------------ configuración
  '🗳️ Configurar Modo de Votación': '🗳️ Set Up Voting Mode',
  'Tipo de Votación:': 'Voting type:',
  'Votación General (todos votan a la vez)': 'Open voting (everyone votes at once)',
  'Por Turnos (cada jugador vota en secreto)': 'By turns (each player votes in secret)',
  'Por Turnos:': 'By turns:',
  'Cada jugador vota sin que otros vean.': 'Each player votes without others seeing.',
  'General:': 'Open:',
  'Todos votan simultáneamente al mismo jugador.': 'Everyone votes for a player at the same time.',
  '🎮 Selecciona el Modo de Juego': '🎮 Choose the Game Mode',
  'Clásico': 'Classic',
  'Los civiles conocen la palabra secreta; el impostor solo recibe una pista (si está activada). ¡Descubre al impostor!': 'Civilians know the secret word; the impostor only gets a hint (if enabled). Find the impostor!',
  'Mínimo: 3 jugadores': 'Minimum: 3 players',
  'Misterio': 'Mystery',
  '¡El': '',
  'EL IMPOSTOR': 'THE IMPOSTOR',
  'Sr. Blanco': 'Mr. White',
  'no tiene palabra! Si lo eliminan y adivina la palabra, gana inmediatamente.': 'has no word! If he is eliminated and guesses the word, he wins immediately.',
  'Mínimo: 5 jugadores': 'Minimum: 5 players',
  'Caos': 'Chaos',
  'Número ALEATORIO de impostores. Reglas especiales, eventos sorpresa. ¡Caos total!': 'RANDOM number of impostors. Special rules, surprise events. Total chaos!',
  'Mínimo: 6 jugadores': 'Minimum: 6 players',
  'Cantidad de Jugadores:': 'Number of players:',
  'Número de Impostores:': 'Number of impostors:',
  '📂 Si activas esto, el impostor verá a qué categoría pertenece la palabra.': '📂 If you turn this on, the impostor will see which category the word belongs to.',
  '¿Los impostores se conocen entre sí?': 'Do the impostors know each other?',
  '🤝 Si activas esto, los impostores verán quiénes son sus aliados al revelar la carta.': '🤝 If you turn this on, impostors will see who their allies are when they reveal their card.',
  '⏳ Configurar Duración': '⏳ Set Up Duration',
  'Duración de partida (minutos):': 'Game length (minutes):',
  '🔁 Número de rondas': '🔁 Number of rounds',
  '⏰ Si el tiempo llega a cero, los impostores ganan automáticamente.': '⏰ If time runs out, the impostors win automatically.',
  'Agregar Categoría': 'Add Category',
  'Palabra principal:': 'Main word:',
  'Pistas (separadas por coma):': 'Hints (separated by commas):',
  'Guardar Palabra/Pistas': 'Save Word/Hints',
  'Volver a Categorías': 'Back to Categories',
  '✅ Categorías de la Partida': '✅ Game Categories',
  'Selecciona las categorías que se usarán:': 'Choose the categories to use:',
  '▶️ Empezar a jugar': '▶️ Start playing',
  'Ej: DetectiveX': 'e.g. DetectiveX',
  'Jugador Anónimo': 'Anonymous Player',
  'Nombre de la nueva categoría': 'New category name',
  'Ej: Pizza': 'e.g. Pizza',
  'Ej: Queso, Circular, Tomate': 'e.g. Cheese, Round, Tomato',

  // ------------------------------------------------------------ partida
  'Toca la carta para revelar tu rol': 'Tap the card to reveal your role',
  'Toca para revelar tu rol': 'Tap to reveal your role',
  'La palabra secreta es...': 'The secret word is...',
  'Siguiente Jugador': 'Next Player',
  '¡Prepárense para el debate!': 'Get ready for the debate!',
  '¡PREPÁRENSE!': 'GET READY!',
  '¡YA!': 'GO!',
  '¡Ya!': 'Go!',
  '💬 FASE DE DEBATE': '💬 DEBATE PHASE',
  'Los jugadores dicen una palabra o frase relacionada con la palabra secreta.': 'Players say a word or phrase related to the secret word.',
  'Cuando estén listos, procedan a votar.': 'When you are ready, go ahead and vote.',
  'Ir a Votación': 'Go to Voting',
  '🗳️ Ir a Votación': '🗳️ Go to Voting',
  'Pulsa': 'Tap',
  'Hablar': 'Speak',
  'para pedir tu turno y, cuando todos hayan terminado,': 'to ask for your turn and, when everyone has finished,',
  'Listo para votar': 'Ready to vote',
  '. La votación empieza cuando todos estén listos.': '. Voting starts when everyone is ready.',
  '👥 Jugadores': '👥 Players',
  '✋ Hablar': '✋ Speak',
  '🗳️ Listo para votar': '🗳️ Ready to vote',
  '⏭️ (Anfitrión) Abrir votación ya': '⏭️ (Host) Open voting now',
  '👁️ Modo espectador': '👁️ Spectator mode',
  'Has sido expulsado. Puedes seguir la partida y usar el chat, pero no puedes votar ni pedir la palabra.': 'You have been expelled. You can keep following the game and use the chat, but you cannot vote or ask to speak.',
  'La partida continúa en tiempo real.': 'The game continues in real time.',
  '🎩 Sr. Blanco': '🎩 Mr. White',
  '✅ Enviar intento': '✅ Submit guess',
  '🗳️ VOTACIÓN': '🗳️ VOTING',
  '🗳️ VOTACIÓN GENERAL': '🗳️ OPEN VOTING',
  'Cada jugador vota en secreto. Los votos se revelarán al final de la ronda.': 'Each player votes in secret. Votes will be revealed at the end of the round.',
  '⏭️ (Anfitrión) Cerrar votación ya': '⏭️ (Host) Close voting now',
  'Continuar': 'Continue',
  '▶️ Continuar ahora': '▶️ Continue now',
  '🔄 Nueva partida (misma sala)': '🔄 New game (same room)',
  '↩️ Salir de la sala': '↩️ Leave room',
  'Confirmar voto': 'Confirm vote',
  'Confirmar votación': 'Confirm voting',
  'Elige a un jugador': 'Choose a player',
  'Selecciona un jugador': 'Select a player',
  'Escribe una palabra': 'Type a word',
  '🔁 Siguiente ronda': '🔁 Next round',
  '⏰ ¡Tiempo agotado!': '⏰ Time\'s up!',
  'Se acabó el tiempo de debate.': 'The debate time is over.',
  '¡Hora de votar!': 'Time to vote!',
  'NO TIENES PALABRA': 'YOU HAVE NO WORD',
  '🎭 Improvisa tus pistas': '🎭 Improvise your clues',
  '¡Eres': 'You are',
  'IMPOSTOR': 'IMPOSTOR',
  'Eres': 'You are',
  'CIVIL': 'CIVILIAN',
  '🤝 Tus aliados': '🤝 Your allies',
  '📂 Categoría': '📂 Category',
  '🕵️ Pista clave': '🕵️ Key hint',
  'Sin información adicional': 'No additional information',
  'Categoría:': 'Category:',

  // ------------------------------------------------------------ resultados
  '⚠️ Sin votos': '⚠️ No votes',
  'Nadie votó. Se reinicia la votación.': 'Nobody voted. Voting restarts.',
  '⚖️ ¡EMPATE!': '⚖️ TIE!',
  'Nadie es expulsado.': 'Nobody is expelled.',
  'fue expulsado': 'was expelled',
  '✅ ¡Impostor eliminado!': '✅ Impostor eliminated!',
  '🏆 ¡VICTORIA CIVIL!': '🏆 CIVILIAN VICTORY!',
  '✅ ¡Acierto!': '✅ Correct!',
  '❌ ¡Error!': '❌ Wrong!',
  '⚠️ Todos los impostores eliminados, pero aún queda el Sr. Blanco.': '⚠️ All impostors eliminated, but Mr. White is still out there.',
  '🎯 ¡Continúa votando para encontrarlo!': '🎯 Keep voting to find him!',
  '¡Todos los enemigos fueron eliminados!': 'All enemies were eliminated!',
  'Todos los enemigos fueron eliminados.': 'All enemies were eliminated.',
  'era el': 'was',
  'El Sr. Blanco intentará adivinar la palabra secreta...': 'Mr. White will try to guess the secret word...',
  'adivinó correctamente?': 'guess correctly?',
  '✅ CORRECTO': '✅ CORRECT',
  '❌ INCORRECTO': '❌ WRONG',
  '🎉 ¡VICTORIA DEL SR. BLANCO!': '🎉 MR. WHITE WINS!',
  'adivinó correctamente la palabra secreta.': 'guessed the secret word correctly.',
  '📘 Palabra correcta:': '📘 Correct word:',
  '🎩 Sr. Blanco Falló': '🎩 Mr. White Failed',
  'falló al adivinar la palabra.': 'failed to guess the word.',
  '😈 ¡VICTORIA IMPOSTOR!': '😈 IMPOSTOR VICTORY!',
  '📘 Palabra secreta:': '📘 Secret word:',
  '🕵️ Impostores:': '🕵️ Impostors:',
  '🎩 Sr. Blanco:': '🎩 Mr. White:',
  '👥 Civiles restantes:': '👥 Civilians left:',
  '🕵️ Impostores restantes:': '🕵️ Impostors left:',
  '🎩 Sr. Blanco restantes:': '🎩 Mr. White left:',
  '💬 Seguir debate': '💬 Keep debating',
  'Seguir debate': 'Keep debating',
  'era': 'was',
  'Todos votan simultáneamente al mismo jugador.': 'Everyone votes for the same player at the same time.',
  '🚪 Último expulsado:': '🚪 Last expelled:',

  // ------------------------------------------------------------ errores y avisos (modales)
  'Error': 'Error',
  'Error de sincronización': 'Sync error',
  'No se pudieron guardar los cambios en la nube. Revisa tu conexión y las reglas de Firestore.': 'Changes could not be saved to the cloud. Check your connection and the Firestore rules.',
  'No se pudo eliminar la categoría de la nube.': 'The category could not be deleted from the cloud.',
  'El campo no puede estar vacío.': 'This field cannot be empty.',
  'El campo no puede ser solo espacios.': 'This field cannot be only spaces.',
  'No se pudo generar el archivo de exportación.': 'The export file could not be generated.',
  'El archivo no es un JSON válido.': 'The file is not valid JSON.',
  '❌ Archivo no compatible': '❌ Unsupported file',
  'Deshacer importación': 'Undo import',
  '↩️ Importación deshecha': '↩️ Import undone',
  'Se restauraron tus datos anteriores.': 'Your previous data was restored.',
  'No se pudo deshacer la importación.': 'The import could not be undone.',
  'Los datos se importaron correctamente.': 'The data was imported successfully.',
  'Si algo no se ve bien, puedes deshacer la importación.': 'If something looks wrong, you can undo the import.',
  '❌ Acción no permitida': '❌ Action not allowed',
  'Solo puedes consultar las estadísticas desde el menú principal.': 'You can only view the stats from the main menu.',
  '¡Todavía no hay estadísticas!': 'No stats yet!',
  'Aún no has registrado ninguna partida. Cuando termines de jugar tu primera partida, aquí aparecerán las estadísticas de todos los jugadores.': 'You have not played any game yet. Once you finish your first game, the stats of all players will appear here.',
  '▶️ ¡Vamos a jugar!': '▶️ Let\'s play!',
  'Tus estadísticas se guardarán automáticamente.': 'Your stats will be saved automatically.',
  'Jugador': 'Player',
  '🏆 Victorias': '🏆 Wins',
  '🕵️ Veces Impostor': '🕵️ Times Impostor',
  '😈 Victorias Impostor': '😈 Impostor Wins',
  '👥 Victorias Civil': '👥 Civilian Wins',
  '🎩 Veces Sr. Blanco': '🎩 Times Mr. White',
  '🎯 Aciertos Sr. Blanco': '🎯 Mr. White Hits',
  'Mínimo 3 jugadores.': 'Minimum 3 players.',
  'Mínimo 1 categoría.': 'Minimum 1 category.',
  'Ya existe una categoría con ese nombre.': 'A category with that name already exists.',
  'Mínimo 1 palabra.': 'Minimum 1 word.',
  'Agrega al menos una pista.': 'Add at least one hint.',
  '❌ Nombre vacío': '❌ Empty name',
  'Todos los jugadores necesitan un nombre. Revisa "Configurar Jugadores".': 'Every player needs a name. Check "Set Up Players".',
  'Dos o más jugadores tienen el': 'Two or more players have the',
  'mismo nombre': 'same name',
  'Esto rompe la lógica del juego (votos, roles y eliminaciones se identifican por nombre).': 'This breaks the game logic (votes, roles and eliminations are identified by name).',
  '💡 Ve a "Configurar Jugadores" y asegúrate de que cada nombre sea único.': '💡 Go to "Set Up Players" and make sure every name is unique.',
  '💡 Agrega más jugadores en "Configurar Jugadores"': '💡 Add more players in "Set Up Players"',
  'Selecciona al menos una categoría antes de jugar.': 'Select at least one category before playing.',
  'No hay ninguna categoría válida seleccionada. Revisa «Editar categorías».': 'There is no valid category selected. Check «Edit categories».',
  '¿Restablecer todo? Se borrarán la configuración, los nombres de jugadores, las estadísticas locales y el tema. Tu perfil y tu idioma se conservan.': 'Reset everything? Settings, player names, local stats and the theme will be erased. Your profile and language are kept.',
  'Información': 'Information',
  'Esta opción estará disponible próximamente.': 'This option will be available soon.',
  'Entendido': 'Got it',

  // ------------------------------------------------------------ online: errores y estados
  'Falta activar el acceso anónimo': 'Anonymous sign-in is not enabled',
  'Sin conexión': 'No connection',
  'No se pudo iniciar sesión en Firebase. Revisa tu internet e inténtalo de nuevo.': 'Could not sign in to Firebase. Check your internet and try again.',
  'Error de red': 'Network error',
  'Apodo no válido': 'Invalid nickname',
  'Ya estás en una sala': 'You are already in a room',
  'Sal de la sala actual antes de crear otra.': 'Leave the current room before creating another.',
  'Ya estás en una partida': 'You are already in a game',
  'Sal de tu sala actual antes de buscar una partida pública.': 'Leave your current room before looking for a public game.',
  'Ya hay un jugador con ese nombre en la partida pública. Elige otro.': 'There is already a player with that name in the public game. Pick another.',
  'Partida pública creada': 'Public game created',
  'Eres el anfitrión. Configura la partida: cuando la sala se llene, la partida empieza sola para todos.': 'You are the host. Set up the game: when the room fills up, it starts on its own for everyone.',
  'Sala no encontrada': 'Room not found',
  'Ya hay un jugador con ese nombre en la sala. Elige otro.': 'There is already a player with that name in the room. Pick another.',
  'Sala llena': 'Room full',
  'No se puede entrar': 'Cannot join',
  'Esa partida ya empezó o la sala fue cerrada.': 'That game has already started or the room was closed.',
  'Sal de la sala actual antes de unirte a otra.': 'Leave the current room before joining another.',
  'Código inválido': 'Invalid code',
  'El código de la sala tiene 6 caracteres.': 'The room code has 6 characters.',
  'Ese apodo ya está en uso en la sala. Prueba con otro.': 'That nickname is already in use in the room. Try another.',
  'Publica el juego primero': 'Publish the game first',
  'Enlace de la sala': 'Room link',
  '📷 Escanea para unirte': '📷 Scan to join',
  'No se pudo generar el QR': 'The QR code could not be generated',
  'Usa el botón «Compartir enlace» o el código de la sala.': 'Use the «Share link» button or the room code.',
  'Código de sala': 'Room code',
  '📡 Sin conexión. Reconectando… tu partida se conserva.': '📡 Offline. Reconnecting… your game is kept.',
  'No se pudo reconectar': 'Could not reconnect',
  'Sigue sin haber conexión estable con la sala. Comprueba tu internet y pulsa «Reintentar». Tu partida no se ha perdido.': 'There is still no stable connection to the room. Check your internet and tap «Retry». Your game has not been lost.',
  '🔄 Reconectando a tu partida…': '🔄 Reconnecting to your game…',
  '✅ Volviste a tu partida': '✅ You are back in your game',
  'Sala cerrada': 'Room closed',
  '¿Salir? Como eres el anfitrión, la sala se cerrará para todos.': 'Leave? Since you are the host, the room will close for everyone.',
  '¿Salir de la sala?': 'Leave the room?',
  'La sala ya no existe.': 'The room no longer exists.',
  'El anfitrión cerró la sala.': 'The host closed the room.',
  'votación general (en vivo)': 'open voting (live)',
  'votación secreta': 'secret voting',
  'sin límite de rondas': 'no round limit',
  'Configura la partida y espera a que la sala se llene.': 'Set up the game and wait for the room to fill up.',
  'Sala incompleta': 'Room not full',
  'La partida pública empieza cuando la sala esté llena.': 'The public game starts when the room is full.',
  'Sin categorías': 'No categories',
  'Selecciona al menos una categoría con palabras válidas.': 'Select at least one category with valid words.',
  'No se pudo cargar tu carta': 'Could not load your card',
  '✅ Todos vieron su carta. ¡Empieza la cuenta regresiva!': '✅ Everyone saw their card. The countdown starts!',
  '⏳ Esperando a que los demás vean su carta...': '⏳ Waiting for the others to see their card...',
  '¿Empezar ya sin esperar a quienes aún no pulsaron «Listo»?': 'Start now without waiting for those who have not pressed «Ready» yet?',
  '✅ Listo': '✅ Ready',
  '💤 Sin señal': '💤 No signal',
  '👀 Viendo su carta': '👀 Looking at their card',
  '🎙️ Tiene la palabra': '🎙️ Has the floor',
  '✔️ Ya habló': '✔️ Already spoke',
  '🟢 En partida': '🟢 In game',
  'Has sido expulsado: puedes mirar el debate y escribir en el chat, pero ya no puedes hablar ni votar.': 'You have been expelled: you can watch the debate and write in the chat, but you can no longer speak or vote.',
  '🔇 Nadie tiene la palabra. Pulsa «Hablar» para pedir tu turno.': '🔇 Nobody has the floor. Tap «Speak» to ask for your turn.',
  '✅ Terminé de hablar': '✅ I\'m done speaking',
  '¿Abrir la votación ahora sin esperar a los demás?': 'Open voting now without waiting for the others?',
  '✅ Ya votó': '✅ Already voted',
  'Has sido expulsado: puedes observar la votación y seguir usando el chat, pero no puedes votar.': 'You have been expelled: you can watch the voting and keep using the chat, but you cannot vote.',
  'Elige a quién crees que es el impostor y pulsa «Confirmar voto». Verás los votos en vivo; al votar todos, se expulsa al más votado.': 'Choose who you think the impostor is and tap «Confirm vote». You will see the votes live; when everyone has voted, the most voted player is expelled.',
  'Elige a quién crees que es el impostor y pulsa «Confirmar voto». Los votos son secretos hasta el final.': 'Choose who you think the impostor is and tap «Confirm vote». Votes are secret until the end.',
  '✅ tu voto': '✅ your vote',
  'Elige a quién quieres votar.': 'Choose who you want to vote for.',
  '¿Cerrar la votación ahora con los votos recibidos? Quien no haya votado se abstiene.': 'Close voting now with the votes received? Anyone who has not voted abstains.',
  '🎩 ¡Eras el Sr. Blanco!': '🎩 You were Mr. White!',
  'Intento enviado. Esperando el resultado…': 'Guess sent. Waiting for the result…',
  'Tienes una última oportunidad: escribe la palabra secreta. Si aciertas, ¡ganas tú!': 'You have one last chance: type the secret word. If you get it right, you win!',
  'Escribe tu intento antes de enviarlo.': 'Type your guess before sending it.',
  '🏁 Partida finalizada': '🏁 Game over',
  'Resultado de la ronda': 'Round result',
  'La ronda ha terminado.': 'The round is over.',
  'Quién votó a quién': 'Who voted for whom',
  '⏳ Esperando a que el anfitrión inicie una nueva partida (o puedes salir).': '⏳ Waiting for the host to start a new game (or you can leave).',
  '⚠️ El anfitrión no responde. La partida está en pausa; si no vuelve, sal de la sala.': '⚠️ The host is not responding. The game is paused; if they do not come back, leave the room.',
  '🚪 Jugador expulsado': '🚪 Player expelled',
  'Nadie recibió mayoría de votos. No se expulsa a nadie.': 'Nobody received a majority of votes. Nobody is expelled.',
  'No logró adivinar la palabra.': 'Did not manage to guess the word.',
  'Los enemigos igualan o superan a los civiles.': 'The enemies equal or outnumber the civilians.',
  '🎩 ¡GANA EL SR. BLANCO!': '🎩 MR. WHITE WINS!',
  '⚖️ Partida empatada': '⚖️ Game tied',
  'Se agotaron las rondas.': 'The rounds ran out.',
  'La partida continúa.': 'The game continues.',
  '💬 Chat de la partida': '💬 Game chat',
  'Ocultar chat': 'Hide chat',
  'Escribe un mensaje…': 'Type a message…',
  'Mensaje de chat': 'Chat message',
  'Enviar': 'Send',
  'Unirme al chat de voz': 'Join voice chat',
  'Salir del chat de voz': 'Leave voice chat',
  'Silenciar / activar micrófono': 'Mute / unmute microphone',
  'Silenciar o activar micrófono': 'Mute or unmute microphone',
  'Reacciones': 'Reactions',
  'Voz no disponible': 'Voice not available',
  'Tu navegador no soporta llamadas de voz (WebRTC). Prueba con Chrome, Edge, Firefox o Safari actualizado.': 'Your browser does not support voice calls (WebRTC). Try an up-to-date Chrome, Edge, Firefox or Safari.',
  'Sin micrófono': 'No microphone',
  'solo para escuchar': 'listen only',
  'No se pudo entrar a la voz': 'Could not join the voice chat',

  // ------------------------------------------------------------ perfil / acceso
  '¡Bienvenido!': 'Welcome!',
  'Editar perfil': 'Edit profile',
  'Elige tu apodo y tu avatar': 'Pick your nickname and avatar',
  'Apodo': 'Nickname',
  'Si lo dejas vacío serás «Jugador Anónimo».': 'If you leave it empty you will be «Anonymous Player».',
  'Avatar': 'Avatar',
  'Continuar con Google': 'Continue with Google',
  'Invitado': 'Guest',
  'Cuenta vinculada': 'Linked account',
  'Puntos': 'Points',
  'Victorias': 'Wins',
  'Partidas': 'Games',
  'Impostor': 'Impostor',
  'Detalle': 'Details',
  'Victorias como impostor': 'Wins as impostor',
  'Victorias como civil': 'Wins as civilian',
  'Veces Sr. Blanco': 'Times as Mr. White',
  'Victorias como Sr. Blanco': 'Wins as Mr. White',
  'Cuenta': 'Account',
  'Vincular con Google': 'Link with Google',
  '📊 Estadísticas': '📊 Stats',
  'Ventana bloqueada': 'Window blocked',
  'Dominio no autorizado': 'Unauthorized domain',
  'Google no está activado': 'Google is not enabled',
  'Cuenta ya registrada': 'Account already registered',
  'Error de conexión': 'Connection error',
  'Error con Google': 'Google error',
  'Tu navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes e inténtalo nuevamente.': 'Your browser blocked the Google window. Allow pop-ups and try again.',
  'Agrega el dominio de tu juego en Firebase Authentication → Settings → Authorized domains.': 'Add your game domain in Firebase Authentication → Settings → Authorized domains.',
  'En Firebase entra en Authentication → Sign-in method y activa el proveedor Google.': 'In Firebase go to Authentication → Sign-in method and enable the Google provider.',
  'Esta cuenta de Google ya está vinculada a otro usuario. Intenta entrar directamente con esa cuenta.': 'This Google account is already linked to another user. Try signing in directly with that account.',
  'No se pudo conectar con Google. Comprueba tu conexión a Internet.': 'Could not connect to Google. Check your Internet connection.',
  'Google se ha vinculado, pero no se pudieron sincronizar los datos con Firestore. Comprueba tu conexión y las reglas de seguridad.': 'Google was linked, but the data could not be synced with Firestore. Check your connection and the security rules.',
  'Cada jugador recibe en secreto un rol:': 'Each player secretly gets a role:',
  'Civil': 'Civilian',
  'o': 'or',
  '(según el modo).': '(depending on the mode).',
  'Se debate por rondas dando pistas sobre la palabra secreta y después se vota. El más votado es expulsado (si hay empate, nadie sale).': 'Players debate in rounds, giving hints about the secret word, and then vote. The most voted player is expelled (on a tie, nobody leaves).',
  'Civiles ganan': 'Civilians win',
  'si eliminan a todos los impostores y al Sr. Blanco.': 'if they eliminate every impostor and Mr. White.',
  'El impostor gana': 'The impostor wins',
  'si iguala o supera en número a los civiles.': 'by matching or outnumbering the civilians.',
  'El Sr. Blanco gana': 'Mr. White wins',
  'si es expulsado y adivina la palabra secreta.': 'if expelled and correctly guesses the secret word.',
  'Eres invitado: tus estadísticas solo existen en este dispositivo. Vincula tu cuenta de Google para conservarlas.': 'You are a guest: your stats only exist on this device. Link your Google account to keep them.',
  'Puntos: +10 por partida, +50 por victoria y +25 extra si ganas como impostor o Sr. Blanco.': 'Points: +10 per game, +50 per win and +25 extra if you win as impostor or Mr. White.',

  // ------------------------------------------------------------ varios
  'Pública': 'Public',
  '(tú)': '(you)',
  'Reintentar': 'Retry',
  'Aceptar': 'OK',
  'Salir': 'Leave',
  'Guardar': 'Save',
  'Eliminar': 'Delete',
  'Editar': 'Edit',
  'Agregar': 'Add'
};

// frases con partes variables: [expresión, reemplazo]
const PATRONES = [
  [/^Jugador (\d+)$/, 'Player $1'],
  [/^Categoría: (.+)$/, 'Category: $1'],
  [/^(\d+) jugadores$/, '$1 players'],
  [/^(\d+) rondas$/, '$1 rounds'],
  [/^(\d+) rondas máx\.$/, '$1 rounds max.'],
  [/^Ronda (\d+)( \/ (\d+))?$/, 'Round $1$2'],
  [/^RONDA (\d+) \/ (\d+)$/, 'ROUND $1 / $2'],
  [/^Turno de: (.+)$/, 'Turn: $1'],
  [/^Turno de (.+)$/, '$1\'s turn'],
  [/^🗳️ Turno de: (.+)$/, '🗳️ Turn: $1'],
  [/^EMPIEZA (.+)$/, '$1 STARTS'],
  [/^Tu carta: (.+)$/, 'Your card: $1'],
  [/^👥 Jugadores \($/, '👥 Players ('],
  [/^(\d+) \/ (\d+) listos$/, '$1 / $2 ready'],
  [/^Máximo (\d+) impostores en modo (.+)$/, 'Maximum $1 impostors in $2 mode'],
  [/^⚠️ ?Mínimo (\d+) jugadores para modo (.+)$/, '⚠️ Minimum $1 players for $2 mode'],
  [/^Mínimo (\d+) jugadores para modo (.+)$/, 'Minimum $1 players for $2 mode'],
  [/^Min\. (\d+) jugadores$/, 'Min. $1 players'],
  [/^Mín\. (\d+) jugadores$/, 'Min. $1 players'],
  [/^⚠️ En modo Caos, el número de impostores es aleatorio; este valor se ignora\.$/, '⚠️ In Chaos mode the number of impostors is random; this value is ignored.'],
  [/^modo (.+)$/, '$1 mode'],
  [/^requiere al menos$/, 'requires at least'],
  [/^El$/, 'The'],
  [/^Jugadores actuales:$/, 'Current players:'],
  [/^¿Eliminar (.+)\?$/, 'Delete $1?'],
  [/^Máximo (\d+) caracteres\.$/, 'Maximum $1 characters.'],
  [/^La categoría "(.*)" no tiene palabras cargadas\.$/, 'The category "$1" has no words loaded.'],
  [/^Ya existe la palabra "(.+)" en esta categoría\.$/, 'The word "$1" already exists in this category.'],
  [/^La pista "(.+)" supera los (\d+) caracteres\.$/, 'The hint "$1" is longer than $2 characters.'],
  [/^Palabra: (.+)$/, 'Word: $1'],
  [/^: (\d+) votos \((.*)\)$/, ': $1 votes ($2)'],
  [/^(\d+) votos$/, '$1 votes'],
  [/^🗳️ (\d+) voto\(s\)$/, '🗳️ $1 vote(s)'],
  [/^🗳️ VOTACIÓN · (.+)$/, '🗳️ VOTING · $1'],
  [/^Confirmar voto por (.+)$/, 'Confirm vote for $1'],
  [/^✅ Voto registrado\. Votos: (\d+) \/ (\d+)(.*)$/, '✅ Vote registered. Votes: $1 / $2$3'],
  [/^⏱️ Tiempo para votar: (.+)$/, '⏱️ Time to vote: $1'],
  [/^🗳️ Listos para votar: (\d+) \/ (\d+)$/, '🗳️ Ready to vote: $1 / $2'],
  [/^✅ Esperando a los demás \((\d+)\/(\d+)\)$/, '✅ Waiting for the others ($1/$2)'],
  [/^🎙️ Habla ahora: (.+)$/, '🎙️ Speaking now: $1'],
  [/^🗣️ Ya hablaron: (\d+) \/ (\d+)$/, '🗣️ Already spoke: $1 / $2'],
  [/^(.*) · Debate · (\d+)\/(\d+) listos para votar$/, '$1 · Debate · $2/$3 ready to vote'],
  [/^(.*) · Votación · (\d+)\/(\d+) votos$/, '$1 · Voting · $2/$3 votes'],
  [/^🎩 (.+) era el Sr\. Blanco$/, '🎩 $1 was Mr. White'],
  [/^(.+) intenta adivinar la palabra secreta\. ¡Si acierta, gana!$/, '$1 is trying to guess the secret word. If they get it right, they win!'],
  [/^Palabra secreta: (.+)\.$/, 'Secret word: $1.'],
  [/^Adivinó la palabra \(«(.+)»\)\.$/, 'Guessed the word («$1»).'],
  [/^Intentó «(.+)» y falló\.$/, 'Tried «$1» and failed.'],
  [/^Esperando jugadores: (\d+) \/ (\d+)\. La partida empieza sola cuando la sala se llene\.$/, 'Waiting for players: $1 / $2. The game starts by itself when the room fills up.'],
  [/^Jugadores: (\d+) \/ (\d+)\. Empieza sola al llenarse la sala, o pulsa Iniciar cuando quieras\.$/, 'Players: $1 / $2. It starts by itself when the room is full, or tap Start whenever you want.'],
  [/^Faltan jugadores: el modo (.+) necesita mínimo (\d+) \(hay (\d+)\)\.$/, 'Not enough players: $1 mode needs at least $2 ($3 here).'],
  [/^El modo (.+) necesita mínimo (\d+) jugadores\.$/, '$1 mode needs at least $2 players.'],
  [/^✅ Sala llena \((\d+)\/(\d+)\)\. La partida empieza en (\d+) s…$/, '✅ Room full ($1/$2). The game starts in $3 s…'],
  [/^✅ Sala llena \((\d+)\/(\d+)\)\. La partida empieza sola en (\d+) s \(o pulsa Iniciar\)\.$/, '✅ Room full ($1/$2). The game starts by itself in $3 s (or tap Start).'],
  [/^✅ Sala llena \((\d+)\/(\d+)\)\. Iniciando…$/, '✅ Room full ($1/$2). Starting…'],
  [/^⏳ Jugadores: (\d+)\/(\d+)\. Esperando a que la sala se llene o a que el anfitrión inicie\.\.\.$/, '⏳ Players: $1/$2. Waiting for the room to fill up or for the host to start...'],
  [/^La sala (\w+) no existe o ya terminó\.$/, 'Room $1 does not exist or has already ended.'],
  [/^La sala ya tiene el máximo configurado de (\d+) jugadores\.$/, 'The room already has the configured maximum of $1 players.'],
  [/^Sala$/, 'Room'],
  [/^Únete a mi sala (\w+)$/, 'Join my room $1'],
  [/^Código QR de la sala (\w+)$/, 'QR code of room $1'],
  [/^Reaccionar con (.+)$/, 'React with $1'],
  [/^Conectado como (.+)\. Tus estadísticas se guardan en tu cuenta\.$/, 'Signed in as $1. Your stats are saved to your account.'],
  [/^Se ignoraron (\d+) palabra\(s\) mal formadas\.$/, '$1 malformed word(s) were ignored.'],
  [/^¿Reemplazar categorías actuales por las del archivo\?(.*)$/, 'Replace the current categories with the ones in the file?$1'],
  [/^⚠️ El archivo fue exportado con la versión (.+), distinta a la actual \((.+)\)\. Se intentará importar de todas formas\.$/, '⚠️ The file was exported with version $1, different from the current one ($2). We will try to import it anyway.']
];

const OMITIR = 'script,style,textarea,input,code,[translate="no"],.nombre-jugador,.aliado-badge,.pista-contenido,.categoria-info b';
const OMITIR_ATTR = '[translate="no"]'; // los placeholder de los input sí se traducen
const ATRIBUTOS = ['placeholder', 'aria-label', 'title', 'alt'];

let idioma = 'es';
const originales = new WeakMap();   // nodo de texto → texto original en español
const traducidos = new WeakMap();   // nodo de texto → último texto traducido que escribimos
const attrOrig = new WeakMap();     // elemento → { atributo: { original, traducido } }
let obs = null;

export function traducir(texto) {
  if (idioma !== 'en' || typeof texto !== 'string') return texto;
  const m = texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return texto;
  const clave = m[2].replace(/\s+/g, ' ');
  let out = Object.prototype.hasOwnProperty.call(EXACTO, clave) ? EXACTO[clave] : undefined;
  if (out === undefined) {
    for (const [re, rep] of PATRONES) {
      if (re.test(clave)) { out = clave.replace(re, rep); break; }
    }
  }
  return out === undefined ? texto : m[1] + out + m[3];
}

const omitido = (el) => !!(el && el.closest && el.closest(OMITIR));

function procesarTexto(nodo) {
  const padre = nodo.parentElement;
  if (!padre || omitido(padre)) return;
  const actual = nodo.nodeValue;
  if (traducidos.has(nodo) && traducidos.get(nodo) === actual) return; // ya lo tradujimos nosotros
  if (idioma !== 'en') return;
  const nuevo = traducir(actual);
  if (nuevo !== actual) {
    originales.set(nodo, actual);
    traducidos.set(nodo, nuevo);
    nodo.nodeValue = nuevo;
  } else {
    originales.delete(nodo);
    traducidos.delete(nodo);
  }
}

function procesarAtributos(el) {
  if (!el || el.nodeType !== 1 || (el.closest && el.closest(OMITIR_ATTR))) return;
  for (const a of ATRIBUTOS) {
    if (!el.hasAttribute(a)) continue;
    const valor = el.getAttribute(a);
    const guardado = attrOrig.get(el) || {};
    if (guardado[a] && guardado[a].traducido === valor) continue;
    const nuevo = traducir(valor);
    if (nuevo !== valor) {
      guardado[a] = { original: valor, traducido: nuevo };
      attrOrig.set(el, guardado);
      el.setAttribute(a, nuevo);
    }
  }
}

function recorrer(raiz) {
  if (!raiz) return;
  if (raiz.nodeType === 3) { procesarTexto(raiz); return; }
  if (raiz.nodeType !== 1) return;
  procesarAtributos(raiz);
  const tw = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) procesarTexto(n); else procesarAtributos(n);
  }
}

function restaurar() {
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) {
      if (originales.has(n) && traducidos.get(n) === n.nodeValue) n.nodeValue = originales.get(n);
      originales.delete(n);
      traducidos.delete(n);
    } else {
      const g = attrOrig.get(n);
      if (g) {
        for (const a of Object.keys(g)) if (n.getAttribute(a) === g[a].traducido) n.setAttribute(a, g[a].original);
        attrOrig.delete(n);
      }
    }
  }
}

const TITULOS = {
  es: 'El Impostor | Juego de deducción social online gratis',
  en: 'The Impostor | Free online social deduction game'
};
let tituloOriginal = null;

function aplicarIdioma(nuevo) {
  const l = nuevo === 'en' ? 'en' : 'es';
  if (l === idioma && obs && tituloOriginal !== null) return;
  idioma = l;
  if (tituloOriginal === null) tituloOriginal = document.title;
  document.title = l === 'en' ? TITULOS.en : (tituloOriginal || TITULOS.es);
  if (l === 'en') recorrer(document.body); else restaurar();
  if (obs) obs.takeRecords();
}

export function iniciarI18n() {
  if (obs || typeof MutationObserver === 'undefined') return;
  obs = new MutationObserver((registros) => {
    if (idioma !== 'en') return;
    for (const r of registros) {
      if (r.type === 'characterData') procesarTexto(r.target);
      else if (r.type === 'attributes') procesarAtributos(r.target);
      else r.addedNodes.forEach((n) => recorrer(n));
    }
    obs.takeRecords(); // descarta los cambios que acabamos de escribir nosotros
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });

  // perfil.js fija <html lang> al cambiar de idioma: es la señal para traducir o restaurar
  new MutationObserver(() => aplicarIdioma(document.documentElement.lang))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  aplicarIdioma(document.documentElement.lang);
}

export const idiomaActual = () => idioma;
