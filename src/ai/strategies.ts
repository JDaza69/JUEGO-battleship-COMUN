import { CellState, key, type Impact, type Point, type Random, type TargetView, type AttackStrategy } from '../domain/models';
export class EasyStrategy implements AttackStrategy {
  protected readonly attacked = new Map<number, Set<string>>();
  constructor(protected readonly random: Random = Math.random) {}
  choose(view: TargetView, target: number): Point {
    const options: Point[] = [], used = this.attacked.get(target) ?? new Set<string>();
    for (let y = 0; y < view.size; y++) for (let x = 0; x < view.size; x++) {
      const point = { x, y };
      if (!used.has(key(point)) && ![CellState.HIT, CellState.MISS, CellState.OBSTACLE].includes(view.stateAt(point))) options.push(point);
    }
    if (!options.length) throw new Error('No quedan objetivos válidos.');
    return options[Math.floor(this.random() * options.length)];
  }
  observe(target: number, impacts: readonly Impact[]): void {
    const used = this.attacked.get(target) ?? new Set<string>();
    for (const impact of impacts) used.add(key(impact.point));
    this.attacked.set(target, used);
  }
  priority(_target: number): number { return 0; }
}
export class HardStrategy extends EasyStrategy {
  private readonly hunts = new Map<number, { point: Point; source: Point }[]>();
  choose(view: TargetView, target: number): Point {
    const candidates = this.hunts.get(target) ?? [];
    // FIFO explora N,S,E,O de cada impacto. Al encontrar otro segmento añade sus
    // vecinos, formando una búsqueda contigua. Solo utiliza información observable.
    while (candidates.length) {
      const point = candidates.shift()!.point;
      if (point.x >= 0 && point.y >= 0 && point.x < view.size && point.y < view.size &&
          !this.attacked.get(target)?.has(key(point)) && ![CellState.HIT, CellState.MISS, CellState.OBSTACLE].includes(view.stateAt(point))) return point;
    }
    return super.choose(view, target);
  }
  observe(target: number, impacts: readonly Impact[]): void {
    super.observe(target, impacts);
    const sunkCells = new Set(impacts.flatMap(impact => impact.sunkCells ?? []).map(key));
    let candidates = (this.hunts.get(target) ?? []).filter(item => !sunkCells.has(key(item.source)));
    for (const impact of impacts) if (impact.state === CellState.HIT && !sunkCells.has(key(impact.point))) {
      for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) candidates.push({ point: { x: impact.point.x + dx, y: impact.point.y + dy }, source: impact.point });
    }
    // Conserva cazas de otras naves cuando se hunde una; elimina duplicados.
    const seen = new Set<string>();
    candidates = candidates.filter(item => {
      const pointKey = key(item.point);
      if (this.attacked.get(target)?.has(pointKey) || seen.has(pointKey)) return false;
      seen.add(pointKey); return true;
    });
    this.hunts.set(target, candidates);
  }
  override priority(target: number): number { return (this.hunts.get(target)?.length ?? 0) > 0 ? 1 : 0; }
}
