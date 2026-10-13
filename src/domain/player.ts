import type { AttackStrategy } from './models';
import { Board } from './board';
export abstract class Player {
  turns = 0;
  eliminated = false;
  constructor(readonly id: number, readonly name: string, readonly board: Board) {}
}
export class HumanPlayer extends Player {}
export class AIPlayer extends Player {
  constructor(id: number, name: string, board: Board, readonly strategy: AttackStrategy) { super(id, name, board); }
}
