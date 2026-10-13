import { State } from '../domain/models';
const transitions: Readonly<Record<State, readonly State[]>> = {
  [State.SETUP]: [State.PLAYING],
  [State.PLAYING]: [State.CHECK_ELIMINATION],
  [State.CHECK_ELIMINATION]: [State.PLAYING, State.GAME_OVER],
  [State.GAME_OVER]: [],
};
/** Transiciones explícitas: no se puede atacar en setup ni reabrir una partida terminada. */
export class GameStateMachine {
  private value = State.SETUP;
  get state(): State { return this.value; }
  transition(next: State): void {
    if (!transitions[this.value].includes(next)) throw new Error(`Transición inválida: ${this.value} → ${next}`);
    this.value = next;
  }
}
