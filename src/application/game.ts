import { EasyStrategy, HardStrategy } from '../ai/strategies';
import { Board } from '../domain/board';
import { AIPlayer, HumanPlayer, type Player } from '../domain/player';
import { CellState, COOLDOWNS, FLEET, GameConfig, Ship, State, type Ability, type Action, type ConfigOptions, type Orientation, type Point, type Random, type TurnResult } from '../domain/models';
import { AttackCommand, type ActionReceiver, type Command } from './commands';
import { GameStateMachine } from './state-machine';

export class GameManager implements ActionReceiver {
  private readonly machine = new GameStateMachine();
  get state(): State { return this.machine.state; }
  readonly players: Player[];
  readonly config: GameConfig;
  private currentIndex = 0;
  winner?: Player;
  readonly history: TurnResult[] = [];
  constructor(config: ConfigOptions, private readonly random: Random = Math.random) {
    this.config = new GameConfig(config);
    this.players = Array.from({ length: config.players }, (_, id) => {
      const board = new Board(config.size, config.theme, random);
      return id < config.humans ? new HumanPlayer(id, `Jugador ${id + 1}`, board) :
        new AIPlayer(id, `IA ${id + 1}`, board, config.difficulty === 'hard' ? new HardStrategy(random) : new EasyStrategy(random));
    });
  }
  get current(): Player { return this.players[this.currentIndex]; }
  private setupPlayer(id: number): Player {
    if (this.state !== State.SETUP) throw new Error('La colocación solo se permite antes del combate.');
    const player = this.players[id]; if (!player) throw new Error('Jugador inválido.'); return player;
  }
  placeShip(player: number, point: Point, orientation: Orientation): void {
    const board = this.setupPlayer(player).board, spec = FLEET[board.ships.length];
    if (!spec) throw new Error('La flota ya está completa.');
    board.place_ship(new Ship(spec.name, spec.size, spec.ability), point, orientation);
  }
  autoPlace(player: number): void { const board = this.setupPlayer(player).board; board.clearFleet(); board.autoPlace(); }
  clearPlacement(player: number): void { this.setupPlayer(player).board.clearFleet(); }
  start(): void {
    if (this.state !== State.SETUP || this.players.some(player => player.board.ships.length !== FLEET.length || !player.board.alive || FLEET.some(spec => !player.board.ships.some(ship => ship.type === spec.name && ship.size === spec.size && ship.ability === spec.ability)))) throw new Error('Todos los jugadores deben desplegar cinco naves y tener una flota activa.');
    this.machine.transition(State.PLAYING);
  }
  abilityStatus(player: Player, ability: Ability): { available: boolean; remaining: number; sunk: boolean } {
    const ship = player.board.ships.find(item => item.ability === ability);
    const remaining = Math.max(0, (ship?.readyAt ?? 0) - player.turns);
    return { available: !!ship && !ship.is_sunk && remaining === 0, remaining, sunk: !ship || ship.is_sunk };
  }
  execute(command: Command): TurnResult {
    if (this.state !== State.PLAYING) throw new Error('No es la fase de combate.');
    return command.execute(this);
  }
  perform(action: Action): TurnResult {
    if (this.state !== State.PLAYING) throw new Error('No es la fase de combate.');
    const actor = this.current, target = this.players[action.target];
    if (!target || target === actor || target.eliminated) throw new Error('Selecciona un rival activo.');
    target.board.cell(action.point); // Valida antes de modificar cooldown, daños o turno.
    let impacts;
    if (action.ability) {
      if (!this.abilityStatus(actor, action.ability).available) throw new Error('La habilidad está en recarga o su nave está hundida.');
      impacts = target.board.apply_ability(action.ability, action.point, actor.id, action.orientation);
      // Usar en el turno t bloquea los siguientes N turnos propios; disponible en t+N+1.
      actor.board.ships.find(ship => ship.ability === action.ability)!.readyAt = actor.turns + COOLDOWNS[action.ability] + 1;
    } else {
      if ([CellState.HIT, CellState.MISS, CellState.OBSTACLE].includes(target.board.view(action.point, actor.id))) throw new Error('Casilla ya atacada o bloqueada.');
      impacts = target.board.receive_attack(action.point.x, action.point.y, actor.id);
    }
    if (actor instanceof AIPlayer) actor.strategy.observe(target.id, impacts);
    actor.turns++;
    this.machine.transition(State.CHECK_ELIMINATION);
    const eliminated: number[] = [];
    for (const player of this.players) if (!player.eliminated && !player.board.alive) { player.eliminated = true; eliminated.push(player.id); }
    const active = this.players.filter(player => !player.eliminated);
    if (active.length === 1) { this.winner = active[0]; this.machine.transition(State.GAME_OVER); }
    else {
      do { this.currentIndex = (this.currentIndex + 1) % this.players.length; } while (this.current.eliminated);
      this.machine.transition(State.PLAYING);
    }
    const result = { actor: actor.id, target: target.id, ability: action.ability, impacts, eliminated, winner: this.winner?.id };
    this.history.push(result); return result;
  }
  aiTurn(): TurnResult {
    const actor = this.current;
    if (!(actor instanceof AIPlayer) || this.state !== State.PLAYING) throw new Error('No es un turno de IA.');
    const rivals = this.players.filter(player => player !== actor && !player.eliminated);
    const priority = Math.max(...rivals.map(player => actor.strategy.priority(player.id)));
    const preferred = rivals.filter(player => actor.strategy.priority(player.id) === priority);
    const target = preferred[Math.floor(this.random() * preferred.length)];
    return this.execute(new AttackCommand(target.id, actor.strategy.choose(target.board.targetView(actor.id), target.id)));
  }
}
