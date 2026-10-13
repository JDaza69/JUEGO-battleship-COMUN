import { Cell, CellState, Ship, FLEET, key, type Ability, type Impact, type Orientation, type Point, type Random, type TargetView, type Theme } from './models';
import { generateTerrain } from './terrain';

export class Board {
  readonly cells: Cell[][];
  readonly ships: Ship[] = [];
  constructor(readonly size: number, readonly theme: Theme, private readonly random: Random = Math.random) {
    if (!Number.isInteger(size) || size < 5) throw new Error('Tamaño de tablero inválido.');
    this.cells = Array.from({ length: size }, () => Array.from({ length: size }, () => new Cell()));
    generateTerrain(this.cells, theme, random);
  }
  inside(p: Point): boolean { return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < this.size && p.y < this.size; }
  cell(p: Point): Cell { if (!this.inside(p)) throw new Error('Casilla fuera del tablero.'); return this.cells[p.y][p.x]; }
  coordinates(p: Point, size: number, o: Orientation): Point[] {
    return Array.from({ length: size }, (_, i) => ({ x: p.x + (o === 'H' ? i : 0), y: p.y + (o === 'V' ? i : 0) }));
  }
  is_valid_placement(ship: Ship, p: Point, o: Orientation): boolean {
    return ['H', 'V'].includes(o) && !this.ships.includes(ship) && !this.ships.some(s => s.type === ship.type) &&
      this.coordinates(p, ship.size, o).every(q => this.inside(q) && this.cell(q).state === CellState.EMPTY && !this.cell(q).ship);
  }
  place_ship(ship: Ship, p: Point, o: Orientation): void {
    if (!this.is_valid_placement(ship, p, o)) throw new Error('La nave se solapa, sale del tablero o ocupa una roca o mina.');
    ship.coordinates = this.coordinates(p, ship.size, o); ship.orientation = o;
    for (const q of ship.coordinates) {
      const cell = this.cell(q); cell.ship = ship; cell.state = CellState.SHIP;
      // Cada segmento situado sobre un arrecife comienza dañado. No es un obstáculo.
      if (cell.reef) { ship.hits.add(key(q)); cell.state = CellState.HIT; }
    }
    this.ships.push(ship);
  }
  clearFleet(): void {
    for (const row of this.cells) for (const cell of row) if (cell.ship) {
      cell.ship = undefined; cell.state = CellState.EMPTY; cell.visibility.clear();
    }
    this.ships.length = 0;
  }
  autoPlace(): void {
    if (this.ships.length) throw new Error('Limpia la flota antes de colocar automáticamente.');
    // Se colocan primero las naves mayores y se evitan arrecifes. La banda segura
    // permite un fallback determinista si una distribución aleatoria agota el espacio.
    for (const spec of FLEET) {
      const ship = new Ship(spec.name, spec.size, spec.ability);
      const options: { point: Point; orientation: Orientation }[] = [];
      for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) for (const orientation of ['H', 'V'] as const) {
        const point = { x, y };
        if (this.is_valid_placement(ship, point, orientation) && this.coordinates(point, ship.size, orientation).every(q => !this.cell(q).reef)) options.push({ point, orientation });
      }
      if (!options.length) {
        this.clearFleet();
        FLEET.forEach((item, y) => this.place_ship(new Ship(item.name, item.size, item.ability), { x: 0, y }, 'H'));
        return;
      }
      const choice = options[Math.floor(this.random() * options.length)];
      this.place_ship(ship, choice.point, choice.orientation);
    }
  }
  get alive(): boolean { return this.ships.some(ship => !ship.is_sunk); }
  view(p: Point, observer: number, owner = false): CellState {
    const cell = this.cell(p);
    // Rocas y arrecifes son geografía pública; las minas y barcos permanecen ocultos.
    return owner ? cell.state : cell.visibility.get(observer) ?? (cell.state === CellState.OBSTACLE ? CellState.OBSTACLE : CellState.EMPTY);
  }
  targetView(observer: number): TargetView { return { size: this.size, stateAt: point => this.view(point, observer) }; }
  receive_attack(x: number, y: number, observer = 0): Impact[] {
    const origin = { x, y }; this.cell(origin);
    const queue = [origin], visited = new Set<string>(), impacts: Impact[] = [];
    // Un disparo a distancia Chebyshev <= 1 activa una mina. La explosión cubre
    // 3x3, respeta las rocas y puede activar minas contiguas sin bucles infinitos.
    for (let i = 0; i < queue.length; i++) {
      const point = queue[i];
      if (!this.inside(point) || visited.has(key(point))) continue;
      visited.add(key(point));
      const cell = this.cell(point), mine = cell.state === CellState.MINE;
      const damage = !!cell.ship && cell.state !== CellState.HIT;
      if (![CellState.OBSTACLE, CellState.HIT, CellState.MISS].includes(cell.state)) {
        if (cell.ship) { cell.ship.hits.add(key(point)); cell.state = CellState.HIT; }
        else cell.state = CellState.MISS;
      }
      cell.visibility.set(observer, cell.state);
      if (cell.ship?.is_sunk) for (const segment of cell.ship.coordinates) this.cell(segment).visibility.set(observer, CellState.HIT);
      impacts.push({ point, state: cell.state, damage, explosion: mine, sunk: cell.ship?.is_sunk ? cell.ship.type : undefined, sunkCells: cell.ship?.is_sunk ? cell.ship.coordinates : undefined });
      if (cell.state === CellState.OBSTACLE) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = { x: point.x + dx, y: point.y + dy };
        if (this.inside(q) && (mine || this.cell(q).state === CellState.MINE)) queue.push(q);
      }
    }
    return impacts;
  }
  apply_ability(ability: Ability, point: Point, observer: number, orientation: Orientation = 'H'): Impact[] {
    this.cell(point);
    if (!['recon', 'heavy', 'torpedo'].includes(ability) || !['H', 'V'].includes(orientation)) throw new Error('Habilidad u orientación inválida.');
    if (ability === 'recon') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const p = { x: point.x + dx, y: point.y + dy };
        if (this.inside(p)) this.cell(p).visibility.set(observer, this.cell(p).state);
      }
      return [];
    }
    const impacts: Impact[] = [];
    if (ability === 'heavy') {
      // La casilla seleccionada es la esquina superior izquierda; se recorta en los bordes.
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const p = { x: point.x + dx, y: point.y + dy };
        if (this.inside(p)) impacts.push(...this.receive_attack(p.x, p.y, observer));
      }
    } else {
      // Torpedo H: este. Torpedo V: sur. Se detiene en la primera nave, roca o mina.
      for (let p = { ...point }; this.inside(p); p = { x: p.x + (orientation === 'H' ? 1 : 0), y: p.y + (orientation === 'V' ? 1 : 0) }) {
        const cell = this.cell(p), stop = !!cell.ship || [CellState.OBSTACLE, CellState.MINE].includes(cell.state);
        impacts.push(...this.receive_attack(p.x, p.y, observer));
        if (stop) break;
      }
    }
    // Un área puede alcanzar una casilla a través de varios disparos/explosiones.
    const unique = new Map<string, Impact>();
    for (const impact of impacts) {
      const previous = unique.get(key(impact.point));
      unique.set(key(impact.point), { ...impact, explosion: !!impact.explosion || !!previous?.explosion, damage: !!impact.damage || !!previous?.damage });
    }
    return [...unique.values()];
  }
}
