export interface Point { readonly x: number; readonly y: number }
export type Orientation = 'H' | 'V';
export type Theme = 'open' | 'islands' | 'reefs' | 'mines';
export type Ability = 'recon' | 'heavy' | 'torpedo';
export type Difficulty = 'easy' | 'hard';
export type Random = () => number;
export enum State { SETUP = 'SETUP', PLAYING = 'PLAYING', CHECK_ELIMINATION = 'CHECK_ELIMINATION', GAME_OVER = 'GAME_OVER' }
export enum CellState { EMPTY = 'EMPTY', SHIP = 'SHIP', OBSTACLE = 'OBSTACLE', MINE = 'MINE', HIT = 'HIT', MISS = 'MISS' }
export const key = (p: Point): string => `${p.x},${p.y}`;
export const FLEET: readonly { name: string; size: number; ability?: Ability }[] = [
  { name: 'Portaviones', size: 5, ability: 'recon' },
  { name: 'Acorazado', size: 4, ability: 'heavy' },
  { name: 'Submarino', size: 3, ability: 'torpedo' },
  { name: 'Crucero', size: 3 },
  { name: 'Destructor', size: 2 },
];
export const COOLDOWNS: Readonly<Record<Ability, number>> = { recon: 3, heavy: 4, torpedo: 3 };
export interface ConfigOptions { size: 10 | 15 | 20; theme: Theme; players: number; humans: number; difficulty: Difficulty }
export class GameConfig implements ConfigOptions {
  readonly size: 10 | 15 | 20;
  readonly theme: Theme;
  readonly players: number;
  readonly humans: number;
  readonly difficulty: Difficulty;
  constructor(options: ConfigOptions) {
    if (![10, 15, 20].includes(options.size) || !Number.isInteger(options.players) || options.players < 2 || options.players > 4 ||
        !Number.isInteger(options.humans) || options.humans < 1 || options.humans > options.players ||
        !['open', 'islands', 'reefs', 'mines'].includes(options.theme) || !['easy', 'hard'].includes(options.difficulty)) {
      throw new Error('Configuración inválida: de 2 a 4 jugadores, al menos un humano y un mapa válido.');
    }
    this.size = options.size; this.theme = options.theme; this.players = options.players;
    this.humans = options.humans; this.difficulty = options.difficulty;
  }
}
export class Ship {
  readonly hits = new Set<string>();
  coordinates: readonly Point[] = [];
  orientation: Orientation = 'H';
  /** Índice de turno propio en el que se puede volver a activar la habilidad. */
  readyAt = 0;
  constructor(readonly type: string, readonly size: number, readonly ability?: Ability) {
    if (!Number.isInteger(size) || size < 1) throw new Error('Tamaño de nave inválido.');
  }
  get health(): number { return this.size - this.hits.size; }
  get is_sunk(): boolean { return this.health === 0; }
}
export class Cell {
  state = CellState.EMPTY;
  reef = false;
  ship?: Ship;
  /** Última información conocida por cada observador; no es visión compartida. */
  readonly visibility = new Map<number, CellState>();
}
export interface Impact { point: Point; state: CellState; sunk?: string; sunkCells?: readonly Point[]; explosion?: boolean; damage?: boolean }
/** La IA recibe esta interfaz, sin acceso al terreno oculto ni a las naves reales. */
export interface TargetView { readonly size: number; stateAt(point: Point): CellState }
/** Contrato del dominio: las implementaciones de IA pueden sustituirse libremente. */
export interface AttackStrategy {
  choose(view: TargetView, target: number): Point;
  observe(target: number, impacts: readonly Impact[]): void;
  priority(target: number): number;
}
export interface Action { target: number; point: Point; ability?: Ability; orientation?: Orientation }
export interface TurnResult { actor: number; target: number; ability?: Ability; impacts: Impact[]; eliminated: number[]; winner?: number }
