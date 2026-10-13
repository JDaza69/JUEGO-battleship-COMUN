import { Cell, CellState, type Random, type Theme } from './models';
export function generateTerrain(cells: Cell[][], theme: Theme, random: Random): void {
  // Cinco filas de despliegue seguras garantizan una flota completa incluso en 10x10.
  // Fuera de ellas, cada jugador recibe un terreno independiente del mismo tema.
  for (let y = 5; y < cells.length; y++) for (const cell of cells[y]) {
    const roll = random();
    switch (theme) {
      case 'open': break;
      case 'islands': if (roll < 0.12) cell.state = CellState.OBSTACLE; break;
      case 'reefs': if (roll < 0.18) cell.reef = true; break;
      case 'mines': if (roll < 0.1) cell.state = CellState.MINE; break;
    }
  }
}
