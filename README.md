# Flota táctica

Juego de estrategia naval por turnos en **HTML5 Canvas + TypeScript**. Permite de 2 a 4 jugadores: un humano contra IAs, varios humanos en **Pass & Play**, o grupos mixtos. Cada participante tiene una flota y un tablero independiente.

## Ejecutar

Requisitos: **Node.js 22.12 o posterior** y npm (se probó con Node 24). No necesita backend, cuentas, claves ni servicios externos.

```bash
cd /workspace/LO-PRIMERO   # O la carpeta donde clonaste el proyecto
npm ci                   # Instalación reproducible con package-lock.json
npm run dev
```

Abre la dirección que indique Vite en el navegador (puerto predeterminado 5173). Para compilar y revisar la versión de producción:

```bash
npm run build
npm run preview
```

`dist/` contiene la web estática compilada. Puede alojarse en cualquier servidor de archivos estáticos. No carga fuentes, imágenes ni APIs externas; después de cargar el juego, todas las reglas se ejecutan localmente. La partida vive en memoria: recargar la página la reinicia.

## Cómo jugar

1. Selecciona uno de los cuatro mapas, el tamaño 10×10, 15×15 o 20×20, el total de participantes y cuántos son humanos. El resto son IAs fáciles o difíciles.
2. Cada humano despliega su flota haciendo clic en la primera casilla de cada barco. **R** cambia entre orientación horizontal y vertical. También puedes desplegar automáticamente o limpiar y recolocar toda la flota. Las IAs se colocan automáticamente.
3. En combate, elige un rival activo y un disparo o habilidad; pulsa una casilla del radar rival. El motor valida la acción antes de gastar el turno.
4. Revisa tu informe privado y pulsa **Finalizar turno**. En Pass & Play aparece una pantalla de relevo antes de mostrar el tablero del próximo humano. Los tableros anteriores se retiran del DOM.
5. Los jugadores eliminados se omiten en la rotación. Gana la última flota con al menos un segmento intacto.

Los tableros interactivos también aceptan **flechas + Enter o Espacio**. Los controles tienen foco visible y el diseño se adapta a móvil. Seleccionar una acción no la ejecuta hasta que se elija una casilla.

### Flota y habilidades

| Nave | Casillas | Habilidad | Recarga |
| --- | ---: | --- | ---: |
| Portaviones | 5 | Reconocimiento aéreo: revela 3×3 centrado en la casilla elegida, sin daño | 3 turnos propios |
| Acorazado | 4 | Gran calibre: ataca 2×2 desde la esquina superior izquierda elegida | 4 turnos propios |
| Submarino | 3 | Torpedo sigiloso: recorre una línea hasta la primera nave, roca o mina | 3 turnos propios |
| Crucero | 3 | Disparo normal | — |
| Destructor | 2 | Disparo normal | — |

Una acción, incluso reconocimiento, termina el turno. Usar una habilidad en el turno propio `t` bloquea los siguientes `N` turnos propios completos: vuelve a estar disponible en `t + N + 1`. Los turnos de otros jugadores no reducen la recarga. Las habilidades de naves hundidas quedan deshabilitadas.

El torpedo viaja **al este en H** o **al sur en V** desde la casilla seleccionada; se detiene también ante un segmento ya dañado. Las áreas 2×2 y 3×3 se recortan al borde. Gran calibre puede afectar casillas ya conocidas, pero no vuelve a dañar segmentos dañados. Un disparo normal no puede repetir una casilla conocida como HIT/MISS ni apuntar a una roca.

### Mapas

| Mapa | Regla |
| --- | --- |
| Mar abierto | Agua sin obstáculos |
| Archipiélago escondido | Rocas públicas: impiden colocar barcos, bloquean el disparo en esa casilla y detienen torpedos; no reciben daño |
| Estrecho de corales | Arrecifes públicos: permiten colocar barcos, pero cada segmento colocado encima empieza dañado |
| Campo de minas | Minas ocultas: no permiten colocar barcos; un disparo a la mina o a una casilla adyacente, incluso diagonal, detona una explosión 3×3; otras minas próximas a los impactos pueden encadenarse |

Cada tablero genera su terreno independientemente. Las primeras cinco filas están libres de terreno peligroso para garantizar espacio para toda la flota, incluso en 10×10. La colocación automática evita arrecifes; un humano puede asumir ese daño al colocar manualmente. No existe movimiento de naves durante el combate.

### Niebla de guerra e IA

`Cell.visibility` almacena la última información conocida por **cada observador**. El reconocimiento es una instantánea: no otorga visión continua ni revela datos a terceros. Cuando se hunde una nave, sus segmentos se revelan al atacante. El diario público omite coordenadas, impactos y resultados de reconocimiento.

- **Fácil:** elige casillas aleatorias válidas sin repetir, con memoria separada por rival.
- **Difícil:** después de un HIT, prioriza el mismo rival y busca N, S, E, O. Cada nuevo HIT amplía la frontera; al hundir una nave elimina su caza, conservando otras naves pendientes. Si agota la frontera, vuelve al ataque aleatorio.

Las IAs usan disparos simples; las habilidades tácticas están disponibles para los humanos. Las estrategias reciben únicamente `TargetView`, sin acceso a barcos ni minas ocultas. Se puede añadir una política de habilidades a `aiTurn()` sin modificar el renderer.

## Arquitectura

```text
src/
  domain/
    models.ts          GameConfig, Cell, Ship, contratos, flota y cooldowns
    terrain.ts         Generación de los cuatro mapas
    board.ts           Board: colocación, visibilidad, daño y habilidades
    player.ts          Player, HumanPlayer, AIPlayer
  ai/
    strategies.ts      EasyStrategy y HardStrategy implementan AttackStrategy
  application/
    state-machine.ts   Transiciones permitidas y sus guardas
    commands.ts        Command, AttackCommand, AbilityCommand, ActionReceiver
    game.ts            GameManager: turnos, validación, eliminación e historial
  ui/
    board-renderer.ts  Canvas y entrada de coordenadas, sin reglas de combate
  engine.ts            API pública del motor
  main.ts              Pantallas, eventos y relevo entre jugadores
  style.css            Diseño adaptable
```

El dominio y la aplicación no dependen del DOM, Canvas ni Vite. Se pueden reutilizar desde una CLI, otro renderer o un servidor autoritativo.

- **Responsabilidad única:** terreno genera geografía; Board resuelve reglas espaciales; GameManager coordina turnos; Canvas dibuja.
- **Strategy:** AIPlayer recibe una estrategia intercambiable mediante el contrato `AttackStrategy`.
- **Command:** la interfaz crea `AttackCommand` o `AbilityCommand`; el receptor valida y ejecuta. Un error no consume el turno. Los resultados se registran en `history`; el historial es de resultados, no un sistema de deshacer.
- **State Machine:** `GameStateMachine` impide transiciones ilegales y centraliza el flujo.
- **Interfaces pequeñas e inversión de dependencias:** las estrategias dependen de `TargetView`, los comandos de `ActionReceiver`; el azar puede inyectarse para pruebas reproducibles.

```mermaid
stateDiagram-v2
  [*] --> SETUP
  SETUP --> PLAYING: Todas las flotas listas
  PLAYING --> CHECK_ELIMINATION: Acción válida
  CHECK_ELIMINATION --> PLAYING: Más de un jugador activo
  CHECK_ELIMINATION --> GAME_OVER: Última flota activa
  GAME_OVER --> [*]
```

Ejemplo de uso sin interfaz:

```ts
import { GameManager, AttackCommand, AbilityCommand } from './src/engine';

const game = new GameManager({
  size: 15, theme: 'mines', players: 3, humans: 1, difficulty: 'hard',
});
for (const player of game.players) game.autoPlace(player.id);
game.start();
const report = game.execute(new AbilityCommand(1, { x: 4, y: 4 }, 'recon'));
// Avanza ahora la IA cuyo turno corresponda, o envía el siguiente comando humano.
// game.aiTurn();
// game.execute(new AttackCommand(targetId, { x: 5, y: 4 }));
```

Las APIs `Board.place_ship()`, `Board.is_valid_placement()`, `Board.receive_attack()` y `Board.apply_ability()` también pueden usarse para herramientas o pruebas. Para una partida normal conviene enviar acciones y despliegue a través de GameManager: esas operaciones verifican la fase y el rival.

## Validación

```bash
npm test                  # Reglas del motor y partidas completas reproducibles
npm run build             # TypeScript estricto + compilación web
npx playwright install chromium
npm run test:ui           # Pruebas funcionales reales de navegador
```

Si ya tienes Chromium instalado, evita otra descarga con:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

Las pruebas del motor incluyen configuraciones inválidas, colocación, salud, privacidad, arrecifes, cadenas de minas, límites, torpedos, caza de la IA, cooldowns, errores atómicos, eliminación y **72 partidas completas**: cuatro mapas × tres tamaños × tres cantidades de jugadores × dos dificultades. Las pruebas de navegador cubren el menú móvil, colocación manual/automática, informes privados, relevos turnos de IA y una partida Pass & Play hasta la victoria.

Pass & Play es privacidad visual en un dispositivo compartido, no una barrera frente a quien inspeccione la memoria del navegador. El multijugador por red y el guardado persistente quedan fuera del alcance de esta base local.
