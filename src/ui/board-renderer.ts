import { Board, CellState, key, type Point } from '../engine';

export interface BoardOptions {
  observer: number;
  owner?: boolean;
  onSelect?: (point: Point) => void;
  preview?: (point: Point) => { cells: readonly Point[]; valid: boolean };
}
const colors = { water: '#102d38', line: '#244854', ship: '#759790', hit: '#ff7864', miss: '#5c8090', rock: '#68787c', mine: '#e9b769', scan: '#71d7c4' };
/** Canvas solo dibuja. No modifica el dominio ni decide si una acción es válida. */
export class BoardRenderer {
  private point?: Point;
  private readonly margin = 25;
  private readonly side = 540;
  private readonly context: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly board: Board, private readonly options: BoardOptions) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no admite Canvas 2D.');
    this.context = context;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = this.side * ratio; canvas.height = this.side * ratio;
    context.scale(ratio, ratio);
    canvas.addEventListener('pointermove', event => { this.point = this.fromPointer(event); this.draw(); });
    canvas.addEventListener('pointerleave', () => { this.point = undefined; this.draw(); });
    canvas.addEventListener('click', event => { const point = this.fromPointer(event); if (point) this.options.onSelect?.(point); });
    canvas.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      const point = this.point ?? { x: 0, y: 0 };
      if (event.key === 'Enter' || event.key === ' ') this.options.onSelect?.(point);
      else {
        this.point = { x: Math.max(0, Math.min(board.size - 1, point.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))), y: Math.max(0, Math.min(board.size - 1, point.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))) };
        canvas.setAttribute('aria-label', `Tablero, casilla ${String.fromCharCode(65 + this.point.x)}${this.point.y + 1}. Flechas para moverse, Enter para seleccionar.`);
      }
      this.draw();
    });
    this.draw();
  }
  private get unit(): number { return (this.side - this.margin - 5) / this.board.size; }
  private fromPointer(event: MouseEvent): Point | undefined {
    const rect = this.canvas.getBoundingClientRect();
    const point = { x: Math.floor(((event.clientX - rect.left) * this.side / rect.width - this.margin) / this.unit), y: Math.floor(((event.clientY - rect.top) * this.side / rect.height - this.margin) / this.unit) };
    return this.board.inside(point) ? point : undefined;
  }
  draw(): void {
    const ctx = this.context, unit = this.unit;
    ctx.clearRect(0, 0, this.side, this.side);
    ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < this.board.size; i++) {
      ctx.fillStyle = '#83a0a7'; ctx.fillText(String.fromCharCode(65 + i), this.margin + (i + .5) * unit, 11);
      ctx.fillText(String(i + 1), 10, this.margin + (i + .5) * unit);
    }
    const preview = this.point ? this.options.preview?.(this.point) : undefined;
    const highlighted = new Set(preview?.cells.map(key));
    for (let y = 0; y < this.board.size; y++) for (let x = 0; x < this.board.size; x++) {
      const point = { x, y }, cell = this.board.cell(point), state = this.board.view(point, this.options.observer, this.options.owner);
      const left = this.margin + x * unit, top = this.margin + y * unit, cx = left + unit / 2, cy = top + unit / 2;
      ctx.fillStyle = colors.water; ctx.fillRect(left, top, unit - 1, unit - 1);
      ctx.strokeStyle = colors.line; ctx.lineWidth = .5; ctx.strokeRect(left, top, unit - 1, unit - 1);
      if (cell.reef) {
        ctx.strokeStyle = '#597a5b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - unit * .25, cy + unit * .22); ctx.lineTo(cx, cy - unit * .16); ctx.lineTo(cx + unit * .24, cy + unit * .22); ctx.stroke();
      }
      if (state === CellState.SHIP || (this.options.owner && cell.ship)) {
        ctx.fillStyle = this.options.owner ? colors.ship : colors.scan;
        ctx.fillRect(left + unit * .17, top + unit * .17, unit * .66, unit * .66);
        ctx.fillStyle = '#0b252b'; ctx.fillRect(left + unit * .42, top + unit * .3, unit * .16, unit * .4);
      }
      if (state === CellState.OBSTACLE) {
        ctx.fillStyle = colors.rock; ctx.beginPath(); ctx.moveTo(left + unit * .15, top + unit * .75); ctx.lineTo(left + unit * .23, top + unit * .35); ctx.lineTo(left + unit * .62, top + unit * .18); ctx.lineTo(left + unit * .86, top + unit * .67); ctx.closePath(); ctx.fill();
      }
      if (state === CellState.MINE) {
        ctx.strokeStyle = colors.mine; ctx.fillStyle = colors.mine; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, unit * .16, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * unit * .3, cy + Math.sin(a) * unit * .3); ctx.stroke(); }
      }
      if (state === CellState.HIT) {
        ctx.strokeStyle = colors.hit; ctx.lineWidth = Math.max(2, unit * .07);
        ctx.beginPath(); ctx.moveTo(cx - unit * .2, cy - unit * .2); ctx.lineTo(cx + unit * .2, cy + unit * .2); ctx.moveTo(cx + unit * .2, cy - unit * .2); ctx.lineTo(cx - unit * .2, cy + unit * .2); ctx.stroke();
      }
      if (state === CellState.MISS) { ctx.fillStyle = colors.miss; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, unit * .065), 0, Math.PI * 2); ctx.fill(); }
      if (highlighted.has(key(point))) {
        ctx.fillStyle = preview?.valid ? '#71d7c444' : '#ff786444'; ctx.fillRect(left, top, unit - 1, unit - 1);
        ctx.strokeStyle = preview?.valid ? '#71d7c4' : '#ff7864'; ctx.lineWidth = 1; ctx.strokeRect(left + 1, top + 1, unit - 3, unit - 3);
      }
    }
    if (this.point) {
      ctx.strokeStyle = '#f0deb7'; ctx.lineWidth = 2;
      ctx.strokeRect(this.margin + this.point.x * unit + 1, this.margin + this.point.y * unit + 1, unit - 3, unit - 3);
    }
  }
}
