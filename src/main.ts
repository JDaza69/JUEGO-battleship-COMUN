import './style.css';
import { AbilityCommand, AIPlayer, AttackCommand, CellState, FLEET, GameManager, Ship, State, type Ability, type ConfigOptions, type Orientation, type Point, type Theme, type TurnResult } from './engine';
import { BoardRenderer } from './ui/board-renderer';

const app = document.querySelector<HTMLDivElement>('#app')!;
const themes: { id: Theme; name: string; subtitle: string; icon: string; description: string }[] = [
  { id: 'open', name: 'Mar abierto', subtitle: 'AGUAS LIBRES', icon: '≈', description: 'Sin obstáculos. Solo tú, tu flota y la estrategia.' },
  { id: 'islands', name: 'Archipiélago escondido', subtitle: 'TERRENO BLOQUEADO', icon: '▲', description: 'Las islas impiden el despliegue y detienen los torpedos.' },
  { id: 'reefs', name: 'Estrecho de corales', subtitle: 'AGUAS PELIGROSAS', icon: '⋔', description: 'Cada segmento desplegado en un arrecife recibe daño.' },
  { id: 'mines', name: 'Campo de minas', subtitle: 'REACCIÓN EN CADENA', icon: '✳︎', description: 'Un disparo cercano detona minas en un área de 3 × 3.' },
];
const abilityNames: Record<Ability, string> = { recon: 'Reconocimiento aéreo', heavy: 'Gran calibre', torpedo: 'Torpedo sigiloso' };
let game: GameManager | undefined;
let orientation: Orientation = 'H';
let setupIndex = 0;
let targetId = 1;
let selectedAction: 'shot' | Ability = 'shot';
let timer: ReturnType<typeof setTimeout> | undefined;
const logs: string[] = [];
let status = '';
let selectedTheme: Theme = 'open';
const coord = (point: Point) => `${String.fromCharCode(65 + point.x)}${point.y + 1}`;
const escape = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shell = (body: string) => `<div class="shell"><header class="masthead"><a class="brand" href="#" id="home"><span class="brand-icon">⚓</span><span>FLOTA <b>TÁCTICA</b><small>COMANDO NAVAL · ESTRATEGIA POR TURNOS</small></span></a><span class="header-tag">OPERACIÓN / LOCAL</span></header>${body}<footer>Una acción. Un turno. Toda una flota. <span>2–4 COMANDANTES / SIN CONEXIÓN EXTERNA</span></footer></div>`;
function homeLink(): void {
  byId('home').onclick = event => {
    event.preventDefault();
    if (!game || game.state === State.GAME_OVER || window.confirm('¿Abandonar la partida actual y volver al menú?')) showConfig();
  };
}
function notice(message: string): void { status = message; const node = document.getElementById('notice'); if (node) node.textContent = message; }
function showConfig(): void {
  if (timer) clearTimeout(timer);
  game = undefined; logs.length = 0; status = ''; selectedAction = 'shot'; orientation = 'H';
  app.innerHTML = shell(`<main><div class="eyebrow">CENTRO DE OPERACIONES <span class="dot"></span> LISTO PARA DESPLEGAR</div><section class="intro"><div><h1>Domina el mar.<br><em>Anticipa el próximo movimiento.</em></h1><p>Despliega cinco naves, explora aguas desconocidas y encuentra la flota rival antes de que encuentre la tuya.</p></div><div class="radar" aria-hidden="true"><div class="radar-sweep"></div><i></i><i></i><i></i><span>SECTOR 07 / SONAR ACTIVO</span></div></section>
  <form id="config"><div class="section-heading"><span>01 / ELIGE EL TEATRO DE OPERACIONES</span><small>CUATRO FORMAS DE COMBATIR</small></div><div class="map-grid">${themes.map(theme => `<button type="button" class="map-card ${theme.id === selectedTheme ? 'selected' : ''}" data-map="${theme.id}" aria-pressed="${theme.id === selectedTheme}"><div class="map-art ${theme.id}"><span>${theme.icon}</span><div class="map-grid-lines"></div></div><div class="map-copy"><small>${theme.subtitle}</small><h3>${theme.name}</h3><p>${theme.description}</p></div></button>`).join('')}</div>
  <div class="section-heading"><span>02 / CONFIGURA LA MISIÓN</span><small>PARTIDAS LOCALES, SIN CUENTAS</small></div><div class="settings"><label>Tamaño del mapa<select id="size"><option value="10">10 × 10 · Rápido</option><option value="15">15 × 15 · Estándar</option><option value="20">20 × 20 · Táctico</option></select></label><label>Jugadores totales<select id="players"><option>2</option><option>3</option><option>4</option></select></label><label>Jugadores humanos<select id="humans"><option value="1">1 · Contra IA</option><option value="2">2 · Pass & Play</option></select></label><label>Estrategia de la IA<select id="difficulty"><option value="easy">Fácil · Disparos aleatorios</option><option value="hard">Difícil · Caza con memoria</option></select></label></div><div class="launch-row"><p id="mode-hint">Un comandante humano contra una IA. Despliegue manual o automático.</p><button class="primary" type="submit">Preparar flota <span>→</span></button></div></form>
  <details class="rules"><summary>Manual de combate y habilidades</summary><p>Una acción por turno: disparo simple o habilidad. Reconocimiento revela 3 × 3 sin daño; gran calibre ataca 2 × 2 desde la esquina elegida; el torpedo viaja al este (H) o al sur (V) hasta la primera nave, roca o mina. Recargas: 3, 4 y 3 turnos propios completos. Una nave hundida pierde su habilidad.</p><p>Las minas se activan al disparar a una casilla vecina, incluso diagonal, y encadenan explosiones. Rocas y arrecifes son visibles; barcos y minas se ocultan a los rivales. El reconocimiento conserva la última información observada. Las primeras cinco filas permiten un despliegue seguro. Gana la última flota activa.</p><p>Teclado: flechas y Enter sobre el tablero; R alterna orientación. En Pass & Play, entrega el dispositivo cuando aparezca la pantalla de relevo.</p></details></main>`);
  homeLink();
  document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(button => button.onclick = () => {
    selectedTheme = button.dataset.map as Theme;
    document.querySelectorAll('[data-map]').forEach(node => { const active = (node as HTMLElement).dataset.map === selectedTheme; node.classList.toggle('selected', active); node.setAttribute('aria-pressed', String(active)); });
  });
  const updateHint = () => {
    const players = Number(byId<HTMLSelectElement>('players').value), humans = Number(byId<HTMLSelectElement>('humans').value);
    byId('mode-hint').textContent = humans === players ? `${humans} humanos en Pass & Play. Las flotas permanecen privadas durante el relevo.` : `${humans} humano${humans > 1 ? 's' : ''} y ${players - humans} IA${players - humans > 1 ? 's' : ''}. Despliegue manual o automático.`;
    byId<HTMLSelectElement>('difficulty').disabled = humans === players;
  };
  byId('players').onchange = () => {
    const total = Number(byId<HTMLSelectElement>('players').value), previous = Number(byId<HTMLSelectElement>('humans').value);
    byId('humans').innerHTML = Array.from({ length: total }, (_, i) => `<option value="${i + 1}">${i + 1}${i === 0 ? ' · Contra IA' : i + 1 === total ? ' · Pass & Play' : ' · Mixto'}</option>`).join('');
    byId<HTMLSelectElement>('humans').value = String(Math.min(previous, total)); updateHint();
  };
  byId('humans').onchange = updateHint;
  byId<HTMLFormElement>('config').onsubmit = event => {
    event.preventDefault();
    game = new GameManager({ size: Number(byId<HTMLSelectElement>('size').value) as ConfigOptions['size'], theme: selectedTheme, players: Number(byId<HTMLSelectElement>('players').value), humans: Number(byId<HTMLSelectElement>('humans').value), difficulty: byId<HTMLSelectElement>('difficulty').value as ConfigOptions['difficulty'] });
    game.players.filter(player => player instanceof AIPlayer).forEach(player => game!.autoPlace(player.id));
    setupIndex = 0;
    if (game.config.humans > 1) curtain(game.players[0].name, 'Despliegue privado', showPlacement); else showPlacement();
  };
}
function curtain(player: string, label: string, next: () => void): void {
  // No se renderiza ninguna flota bajo una superposición: los canvas privados se retiran del DOM.
  app.innerHTML = shell(`<main class="curtain"><div class="privacy-icon">⚓</div><div class="eyebrow">${label}</div><h1>Al mando:<br><em>${player}</em></h1><p>Entrega el dispositivo al comandante indicado.<br>El siguiente tablero es información confidencial.</p><button id="reveal" class="primary">Soy ${player} · Continuar →</button></main>`);
  homeLink(); byId('reveal').onclick = next;
}
function shipList(playerId: number, setup = false): string {
  const player = game!.players[playerId];
  return `<div class="fleet-list">${FLEET.map((spec, index) => {
    const ship = player.board.ships.find(item => item.type === spec.name);
    return `<div class="fleet-row ${ship?.is_sunk ? 'sunk' : ''} ${setup && index === player.board.ships.length ? 'next-ship' : ''}"><div><strong>${spec.name}</strong><small>${spec.ability ? abilityNames[spec.ability] : 'Unidad de combate'}</small></div><span class="segments">${Array.from({ length: spec.size }, (_, i) => `<i class="${ship && i < ship.health ? 'active' : ''}"></i>`).join('')}</span><span class="fleet-state">${setup ? ship ? 'LISTA' : 'PENDIENTE' : ship?.is_sunk ? 'HUNDIDA' : `${ship?.health ?? 0}/${spec.size}`}</span></div>`;
  }).join('')}</div>`;
}
function showPlacement(): void {
  const currentGame = game!, player = currentGame.players[setupIndex], spec = FLEET[player.board.ships.length];
  status = '';
  app.innerHTML = shell(`<main><div class="eyebrow">DESPLIEGUE / ${player.name.toUpperCase()} / ${themes.find(theme => theme.id === currentGame.config.theme)!.name.toUpperCase()}</div><div class="page-heading"><div><h1>Prepara tu flota.</h1><p>${spec ? `Coloca el ${spec.name} (${spec.size} casillas).` : 'Cinco naves desplegadas. Tu flota está lista.'}</p></div><span class="pill">${player.board.ships.length} / 5 NAVES</span></div><div class="deployment"><section class="board-panel"><div class="panel-heading"><h2>Aguas propias</h2><span>${currentGame.config.size} × ${currentGame.config.size}</span></div><canvas id="placement-board" tabindex="0" role="application" aria-label="Colocación de naves. Usa flechas y Enter." aria-describedby="board-help"></canvas><p id="board-help" class="board-help">Selecciona la primera casilla. R para girar. Rocas y minas bloquean; arrecifes dañan.</p><p id="notice" role="status" class="notice"></p></section><aside class="sidebar"><div class="panel-heading"><h2>Orden de batalla</h2><span>17 CASILLAS</span></div>${shipList(player.id, true)}<div class="placement-controls"><button id="rotate" class="secondary">Orientación: ${orientation === 'H' ? 'Horizontal →' : 'Vertical ↓'} <kbd>R</kbd></button><button id="auto" class="secondary">↻ Despliegue automático</button><button id="clear" class="text-button">Limpiar colocación</button><button id="ready" class="primary" ${!spec && player.board.alive ? '' : 'disabled'}>${setupIndex + 1 < currentGame.config.humans ? 'Siguiente comandante →' : 'Iniciar combate →'}</button></div><div class="intel-note"><small>INTELIGENCIA DEL TERRENO</small><p>${themes.find(theme => theme.id === currentGame.config.theme)!.description}</p><p>Las primeras cinco filas son una zona de despliegue segura. La colocación automática evita arrecifes.</p></div></aside></div></main>`);
  homeLink();
  const renderer = new BoardRenderer(byId<HTMLCanvasElement>('placement-board'), player.board, {
    observer: player.id, owner: true,
    preview: point => spec ? { cells: player.board.coordinates(point, spec.size, orientation).filter(p => player.board.inside(p)), valid: player.board.is_valid_placement(new Ship(spec.name, spec.size, spec.ability), point, orientation) } : { cells: [], valid: true },
    onSelect: point => { try { currentGame.placeShip(player.id, point, orientation); showPlacement(); } catch (error) { notice((error as Error).message); } },
  });
  byId('rotate').onclick = () => { orientation = orientation === 'H' ? 'V' : 'H'; byId('rotate').innerHTML = `Orientación: ${orientation === 'H' ? 'Horizontal →' : 'Vertical ↓'} <kbd>R</kbd>`; renderer.draw(); };
  byId('auto').onclick = () => { currentGame.autoPlace(player.id); showPlacement(); };
  byId('clear').onclick = () => { currentGame.clearPlacement(player.id); showPlacement(); };
  byId('ready').onclick = () => {
    if (setupIndex + 1 < currentGame.config.humans) { setupIndex++; curtain(currentGame.players[setupIndex].name, 'Despliegue privado', showPlacement); }
    else { currentGame.start(); if (currentGame.config.humans > 1) curtain(currentGame.current.name, 'Primer turno de combate', showCombat); else showCombat(); }
  };
}
function previewAction(point: Point): { cells: Point[]; valid: boolean } {
  const board = game!.players[targetId].board, cells: Point[] = [];
  if (selectedAction === 'recon') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push({ x: point.x + dx, y: point.y + dy });
  else if (selectedAction === 'heavy') for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) cells.push({ x: point.x + dx, y: point.y + dy });
  else if (selectedAction === 'torpedo') for (let i = 0; i < board.size; i++) cells.push({ x: point.x + (orientation === 'H' ? i : 0), y: point.y + (orientation === 'V' ? i : 0) });
  else cells.push(point);
  return { cells: cells.filter(p => board.inside(p)), valid: selectedAction !== 'shot' || ![CellState.HIT, CellState.MISS, CellState.OBSTACLE].includes(board.view(point, game!.current.id)) };
}
function record(result: TurnResult): void {
  const actor = game!.players[result.actor].name, target = game!.players[result.target].name;
  const hits = result.impacts.filter(impact => impact.damage).length;
  const sunk = [...new Set(result.impacts.flatMap(impact => impact.sunk ? [impact.sunk] : []))];
  const explosions = result.impacts.some(impact => impact.explosion);
  const text = result.ability === 'recon' ? `${actor} reconoce las aguas de ${target}.` : `${actor} → ${target}: ${result.ability ? abilityNames[result.ability] : `disparo ${coord(result.impacts[0].point)}`} · ${hits ? `${hits} impacto${hits > 1 ? 's' : ''}` : 'agua'}${explosions ? ' · mina detonada' : ''}${sunk.length ? ` · ${sunk.join(', ')} hundido` : ''}.`;
  logs.unshift(`${actor} → ${target}: ${result.ability ? abilityNames[result.ability] : 'disparo simple'}.`);
  for (const id of result.eliminated) logs.unshift(`${game!.players[id].name} ha perdido su flota y queda fuera de combate.`);
  // El diario público no contiene coordenadas, impactos ni resultados del reconocimiento.
  // El informe detallado se muestra solo al actor antes de entregar el dispositivo.
  status = text;
}
function showCombat(): void {
  const currentGame = game!;
  if (currentGame.state === State.GAME_OVER) { showVictory(); return; }
  const player = currentGame.current;
  if (player instanceof AIPlayer) { runAI(); return; }
  const rivals = currentGame.players.filter(rival => rival !== player && !rival.eliminated);
  if (!rivals.some(rival => rival.id === targetId)) targetId = rivals[0].id;
  if (selectedAction !== 'shot' && !currentGame.abilityStatus(player, selectedAction).available) selectedAction = 'shot';
  app.innerHTML = shell(`<main><div class="eyebrow">COMBATE / ${themes.find(theme => theme.id === currentGame.config.theme)!.name.toUpperCase()} / TURNO PROPIO ${player.turns + 1}</div><div class="page-heading"><div><h1>${player.name}, al mando.</h1><p>Selecciona un rival y una acción. Cada maniobra termina tu turno.</p></div><div class="player-pills">${currentGame.players.map(rival => `<span class="pill ${rival === player ? 'current' : ''} ${rival.eliminated ? 'eliminated' : ''}">${rival.name}${rival.eliminated ? ' · FUERA' : ''}</span>`).join('')}</div></div><div class="combat-grid"><section class="board-panel"><div class="panel-heading"><h2>Tu flota</h2><span>AGUAS PROPIAS</span></div><canvas id="own-board" aria-label="Tu tablero y daños recibidos"></canvas>${shipList(player.id)}</section><section class="board-panel target-panel"><div class="panel-heading"><h2>Radar de ataque</h2><select id="target" aria-label="Rival objetivo">${rivals.map(rival => `<option value="${rival.id}" ${rival.id === targetId ? 'selected' : ''}>${rival.name}</option>`).join('')}</select></div><canvas id="target-board" tabindex="0" role="application" aria-label="Tablero rival. Flechas para moverse, Enter para atacar." aria-describedby="combat-help"></canvas><div class="legend"><span class="legend-ship">■ Reconocido</span><span class="legend-hit">× Impacto</span><span class="legend-miss">• Agua</span><span>▲ Roca</span><span>⋔ Arrecife</span></div><p id="combat-help" class="board-help">${selectedAction === 'shot' ? 'Disparo simple: selecciona una casilla desconocida.' : selectedAction === 'recon' ? 'Reconocimiento: selecciona el centro del área 3 × 3.' : selectedAction === 'heavy' ? 'Gran calibre: selecciona la esquina superior izquierda del área 2 × 2.' : `Torpedo: selecciona el inicio de la trayectoria hacia ${orientation === 'H' ? 'el este →' : 'el sur ↓'}.`}</p></section></div>
  <section class="action-panel"><div class="section-heading"><span>ÓRDENES DE COMBATE</span><small>UNA ACCIÓN POR TURNO</small></div><div class="action-grid"><button class="action ${selectedAction === 'shot' ? 'selected' : ''}" data-action="shot"><span>◎</span><strong>Disparo simple</strong><small>Una casilla · Siempre disponible</small></button>${(['recon', 'heavy', 'torpedo'] as Ability[]).map(ability => { const availability = currentGame.abilityStatus(player, ability); return `<button class="action ${selectedAction === ability ? 'selected' : ''}" data-action="${ability}" ${availability.available ? '' : 'disabled'}><span>${ability === 'recon' ? '⌖' : ability === 'heavy' ? '▦' : '→'}</span><strong>${abilityNames[ability]}</strong><small>${availability.sunk ? 'Nave hundida' : availability.remaining ? `Recarga: ${availability.remaining} turno${availability.remaining > 1 ? 's' : ''}` : ability === 'recon' ? 'Área 3 × 3 · Recarga 3 turnos' : ability === 'heavy' ? 'Área 2 × 2 · Recarga 4 turnos' : 'Ataque en línea · Recarga 3 turnos'}</small></button>`; }).join('')}</div>${selectedAction === 'torpedo' ? `<button id="rotate" class="secondary small">Dirección: ${orientation === 'H' ? 'Este →' : 'Sur ↓'} <kbd>R</kbd></button>` : ''}<p id="notice" role="status" class="notice">${escape(status)}</p></section><details class="journal"><summary>Diario de operaciones · ${currentGame.history.length} acciones</summary><ol>${logs.slice(0, 15).map(log => `<li>${escape(log)}</li>`).join('')}</ol></details></main>`);
  homeLink();
  new BoardRenderer(byId<HTMLCanvasElement>('own-board'), player.board, { observer: player.id, owner: true });
  new BoardRenderer(byId<HTMLCanvasElement>('target-board'), currentGame.players[targetId].board, { observer: player.id, preview: previewAction, onSelect: point => {
    try {
      const command = selectedAction === 'shot' ? new AttackCommand(targetId, point) : new AbilityCommand(targetId, point, selectedAction, orientation);
      record(currentGame.execute(command)); selectedAction = 'shot';
      if (currentGame.state === State.GAME_OVER) showVictory();
      else showReport(currentGame.history[currentGame.history.length - 1]);
    } catch (error) { notice((error as Error).message); }
  } });
  byId('target').onchange = () => { targetId = Number(byId<HTMLSelectElement>('target').value); showCombat(); };
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.onclick = () => { selectedAction = button.dataset.action as typeof selectedAction; showCombat(); });
  const rotate = document.getElementById('rotate'); if (rotate) rotate.onclick = () => { orientation = orientation === 'H' ? 'V' : 'H'; showCombat(); };
}
function showReport(result: TurnResult): void {
  const currentGame = game!, actor = currentGame.players[result.actor], target = currentGame.players[result.target];
  app.innerHTML = shell(`<main><div class="eyebrow">INFORME PRIVADO / ${actor.name.toUpperCase()}</div><div class="page-heading"><div><h1>${result.ability === 'recon' ? 'Zona reconocida.' : 'Maniobra completada.'}</h1><p>${escape(status)}</p></div><button id="end-turn" class="primary">Finalizar turno →</button></div><section class="board-panel report-board"><div class="panel-heading"><h2>Radar: ${target.name}</h2><span>VISIBILIDAD DE ${actor.name.toUpperCase()}</span></div><canvas id="report-board" aria-label="Información revelada por tu última maniobra"></canvas><div class="legend"><span class="legend-ship">■ Nave reconocida</span><span class="legend-hit">× Impacto</span><span class="legend-miss">• Agua</span></div><p class="board-help">Revisa el informe antes de entregar el dispositivo. No hay acciones adicionales en este turno.</p></section></main>`);
  homeLink();
  new BoardRenderer(byId<HTMLCanvasElement>('report-board'), target.board, { observer: actor.id });
  byId('end-turn').onclick = () => {
    status = '';
    if (currentGame.current instanceof AIPlayer) runAI();
    else curtain(currentGame.current.name, 'Relevo de mando', showCombat);
  };
}
function runAI(): void {
  const currentGame = game!;
  app.innerHTML = shell(`<main class="curtain"><div class="thinking-radar"></div><div class="eyebrow">COMBATE EN CURSO</div><h1>${currentGame.current.name}<br><em>está calculando su ataque.</em></h1><p>Las flotas permanecen ocultas durante los turnos automáticos.</p></main>`); homeLink();
  timer = setTimeout(() => {
    if (game !== currentGame || currentGame.state !== State.PLAYING) return;
    try {
      const result = currentGame.aiTurn();
      record(result);
      if (result.winner !== undefined) showVictory();
      else if (currentGame.current instanceof AIPlayer) runAI();
      else if (currentGame.config.humans > 1) curtain(currentGame.current.name, 'Relevo de mando', () => { status = ''; showCombat(); });
      else { status = ''; showCombat(); }
    } catch (error) {
      app.innerHTML = shell(`<main class="curtain"><h1>Operación detenida</h1><p role="alert">${escape((error as Error).message)}</p><button id="restart" class="primary">Nueva misión</button></main>`);
      homeLink(); byId('restart').onclick = showConfig;
    }
  }, 650);
}
function showVictory(): void {
  const currentGame = game!;
  app.innerHTML = shell(`<main class="curtain"><div class="privacy-icon">⚑</div><div class="eyebrow">MISIÓN COMPLETADA</div><h1>${currentGame.winner!.name}<br><em>controla estas aguas.</em></h1><p>Última flota en pie después de ${currentGame.history.length} acciones.<br>${themes.find(theme => theme.id === currentGame.config.theme)!.name} · ${currentGame.config.size} × ${currentGame.config.size}</p><button id="restart" class="primary">Preparar una nueva misión →</button><details class="journal"><summary>Ver informe final</summary><ol>${logs.map(log => `<li>${escape(log)}</li>`).join('')}</ol></details></main>`);
  homeLink(); byId('restart').onclick = showConfig;
}
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'r' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) document.getElementById('rotate')?.click();
});
showConfig();
