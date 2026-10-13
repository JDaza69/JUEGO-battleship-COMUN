import type { Ability, Action, Orientation, Point, TurnResult } from '../domain/models';
export interface ActionReceiver { perform(action: Action): TurnResult }
export interface Command { execute(receiver: ActionReceiver): TurnResult }
export class AttackCommand implements Command {
  constructor(readonly target: number, readonly point: Point) {}
  execute(receiver: ActionReceiver): TurnResult { return receiver.perform({ target: this.target, point: this.point }); }
}
export class AbilityCommand implements Command {
  constructor(readonly target: number, readonly point: Point, readonly ability: Ability, readonly orientation: Orientation = 'H') {}
  execute(receiver: ActionReceiver): TurnResult { return receiver.perform({ target: this.target, point: this.point, ability: this.ability, orientation: this.orientation }); }
}
