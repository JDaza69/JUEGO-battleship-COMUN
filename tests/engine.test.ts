import test from 'node:test';
import assert from 'node:assert/strict';
import { AbilityCommand, AIPlayer, AttackCommand, Board, CellState, EasyStrategy, FLEET, GameConfig, GameManager, GameStateMachine, HardStrategy, Ship, State, key, type Difficulty, type Point, type Theme } from '../src/engine';
function seeded(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function ready(players = 2): GameManager {
  const game = new GameManager({ size: 10, theme: 'open', players, humans: players, difficulty: 'easy' }, seeded(17));
  for (const player of game.players) {
    FLEET.forEach((spec, y) => game.placeShip(player.id, { x: 0, y }, 'H'));
  }
  game.start(); return game;
}
function unusedShot(game: GameManager): Point {
  const rival = game.players.find(p => p !== game.current && !p.eliminated)!;
  for (let y = 9; y >= 5; y--) for (let x = 9; x >= 0; x--) if (rival.board.view({ x, y }, game.current.id) === CellState.EMPTY) return { x, y };
  throw new Error('No quedan disparos de prueba.');
}
function skipWithWater(game: GameManager): void {
  const rival = game.players.find(p => p !== game.current && !p.eliminated)!;
  game.execute(new AttackCommand(rival.id, unusedShot(game)));
}
test('configuración: valida jugadores, humanos, tamaño, tema y dificultad', () => {
  const config = { size: 10 as const, theme: 'open' as const, players: 4, humans: 2, difficulty: 'hard' as const };
  assert.equal(new GameConfig(config).humans, 2);
  for (const invalid of [{ players: 1 }, { players: 5 }, { humans: 0 }, { humans: 5 }, { size: 12 }, { theme: 'unknown' }, { difficulty: 'unknown' }, { humans: 1.5 }]) {
    assert.throws(() => new GameConfig({ ...config, ...invalid } as typeof config));
  }
});
test('máquina de estados: solo permite las transiciones del ciclo táctico', () => {
  const machine = new GameStateMachine(); assert.throws(() => machine.transition(State.GAME_OVER));
  machine.transition(State.PLAYING); machine.transition(State.CHECK_ELIMINATION); machine.transition(State.PLAYING);
  machine.transition(State.CHECK_ELIMINATION); machine.transition(State.GAME_OVER);
  assert.throws(() => machine.transition(State.PLAYING));
});
test('colocación horizontal y vertical: límites, solapamiento, identidad y obstáculos', () => {
  const board = new Board(10, 'open'), first = new Ship('A', 3), second = new Ship('B', 2);
  assert.equal(board.is_valid_placement(first, { x: 8, y: 0 }, 'H'), false);
  board.place_ship(first, { x: 2, y: 2 }, 'H');
  assert.equal(board.is_valid_placement(second, { x: 3, y: 2 }, 'V'), false);
  board.cell({ x: 6, y: 6 }).state = CellState.OBSTACLE;
  assert.throws(() => board.place_ship(second, { x: 6, y: 6 }, 'V'));
  board.cell({ x: 6, y: 6 }).state = CellState.MINE;
  assert.throws(() => board.place_ship(second, { x: 6, y: 6 }, 'V'));
  board.place_ship(second, { x: 8, y: 8 }, 'V');
  assert.deepEqual(second.coordinates, [{ x: 8, y: 8 }, { x: 8, y: 9 }]);
  assert.throws(() => board.place_ship(new Ship('A', 3), { x: 0, y: 5 }, 'H'));
  assert.throws(() => board.cell({ x: .5, y: 0 }));
});
test('arrecifes: daño por segmento en colocación manual, sin daño adicional al repetir un impacto', () => {
  const board = new Board(10, 'reefs', () => 0), ship = new Ship('Prueba', 3);
  board.place_ship(ship, { x: 0, y: 4 }, 'V');
  assert.equal(ship.health, 1); assert.equal(ship.is_sunk, false);
  assert.equal(board.cell({ x: 0, y: 5 }).state, CellState.HIT);
  assert.equal(board.receive_attack(0, 5, 2)[0].damage, false);
  assert.equal(ship.health, 1);
  board.receive_attack(0, 4, 2); assert.equal(ship.is_sunk, true);
});
test('niebla individual: un rival no ve barcos ni minas; reconocer no hace daño ni revela a terceros', () => {
  const board = new Board(10, 'open'), ship = new Ship('Prueba', 3);
  board.place_ship(ship, { x: 2, y: 2 }, 'H'); board.cell({ x: 3, y: 3 }).state = CellState.MINE;
  assert.equal(board.view({ x: 2, y: 2 }, 1), CellState.EMPTY);
  board.apply_ability('recon', { x: 3, y: 2 }, 1);
  assert.equal(board.view({ x: 2, y: 2 }, 1), CellState.SHIP);
  assert.equal(board.view({ x: 3, y: 3 }, 1), CellState.MINE);
  assert.equal(board.view({ x: 2, y: 2 }, 2), CellState.EMPTY);
  assert.equal(ship.health, 3);
  board.receive_attack(2, 2, 2);
  assert.equal(board.view({ x: 2, y: 2 }, 1), CellState.SHIP); // Última información, no visión permanente.
  assert.equal(board.view({ x: 2, y: 2 }, 2), CellState.HIT);
});
test('ataques: salud, hundimiento, revelación del barco hundido y rocas impermeables', () => {
  const board = new Board(10, 'open'), ship = new Ship('Prueba', 2);
  board.place_ship(ship, { x: 0, y: 0 }, 'H'); board.cell({ x: 2, y: 0 }).state = CellState.OBSTACLE;
  board.receive_attack(0, 0, 1);
  const result = board.receive_attack(1, 0, 2);
  assert.equal(result[0].sunk, 'Prueba'); assert.equal(board.alive, false);
  assert.equal(board.view({ x: 0, y: 0 }, 2), CellState.HIT);
  assert.equal(board.receive_attack(2, 0, 1)[0].state, CellState.OBSTACLE);
});
test('minas: proximidad diagonal, explosiones encadenadas, bordes y ausencia de daño duplicado', () => {
  const board = new Board(10, 'open'), ship = new Ship('Prueba', 2);
  board.cell({ x: 1, y: 1 }).state = CellState.MINE;
  board.cell({ x: 2, y: 2 }).state = CellState.MINE;
  board.place_ship(ship, { x: 3, y: 2 }, 'V');
  const result = board.receive_attack(0, 0, 7);
  assert.equal(result.filter(i => i.explosion).length, 2);
  assert.equal(ship.health, 0);
  assert.equal(new Set(result.map(i => key(i.point))).size, result.length);
  assert.ok(result.every(i => board.inside(i.point)));
  board.receive_attack(0, 0, 7); assert.equal(ship.health, 0);
});
test('gran calibre: área 2x2 y recorte válido en la esquina del mapa', () => {
  const board = new Board(10, 'open'), ship = new Ship('Prueba', 3);
  board.place_ship(ship, { x: 4, y: 4 }, 'H');
  const impacts = board.apply_ability('heavy', { x: 4, y: 4 }, 1);
  assert.equal(impacts.length, 4); assert.equal(ship.health, 1);
  assert.equal(board.apply_ability('heavy', { x: 9, y: 9 }, 1).length, 1);
  assert.equal(board.apply_ability('recon', { x: 0, y: 0 }, 1).length, 0);
});
test('torpedo: se detiene ante la primera nave o roca; soporta ambas orientaciones', () => {
  const board = new Board(10, 'open'), ship = new Ship('Prueba', 2);
  board.place_ship(ship, { x: 5, y: 2 }, 'V');
  const horizontal = board.apply_ability('torpedo', { x: 0, y: 2 }, 1, 'H');
  assert.equal(horizontal.length, 6); assert.equal(ship.health, 1);
  board.cell({ x: 0, y: 3 }).state = CellState.OBSTACLE;
  assert.equal(board.apply_ability('torpedo', { x: 0, y: 0 }, 1, 'V').length, 4);
  const vertical = board.apply_ability('torpedo', { x: 5, y: 3 }, 1, 'V');
  assert.equal(vertical.length, 1); assert.equal(ship.health, 0);
});
test('IA fácil: no repite casillas y mantiene memoria separada por rival', () => {
  const strategy = new EasyStrategy(() => 0), board = new Board(10, 'open'), used = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const point = strategy.choose(board.targetView(0), 3);
    assert.equal(used.has(key(point)), false); used.add(key(point));
    strategy.observe(3, board.receive_attack(point.x, point.y, 0));
  }
  assert.throws(() => strategy.choose(board.targetView(0), 3));
  assert.deepEqual(strategy.choose(new Board(10, 'open').targetView(0), 4), { x: 0, y: 0 });
});
test('IA difícil: caza N,S,E,O tras HIT y abandona esa caza al hundir', () => {
  const board = new Board(10, 'open'), ship = new Ship('Prueba', 2), strategy = new HardStrategy(() => 0);
  board.place_ship(ship, { x: 4, y: 4 }, 'V');
  strategy.observe(3, board.receive_attack(4, 4, 0)); assert.equal(strategy.priority(3), 1);
  const north = strategy.choose(board.targetView(0), 3); assert.deepEqual(north, { x: 4, y: 3 });
  strategy.observe(3, board.receive_attack(north.x, north.y, 0));
  const south = strategy.choose(board.targetView(0), 3); assert.deepEqual(south, { x: 4, y: 5 });
  strategy.observe(3, board.receive_attack(south.x, south.y, 0));
  assert.equal(strategy.priority(3), 0); assert.equal(strategy.priority(4), 0);
});
test('IA difícil: mantiene la caza de otra nave cuando hunde una', () => {
  const board = new Board(10, 'open'), strategy = new HardStrategy(() => 0);
  board.place_ship(new Ship('A', 2), { x: 1, y: 1 }, 'H');
  board.place_ship(new Ship('B', 2), { x: 6, y: 6 }, 'H');
  strategy.observe(1, board.receive_attack(1, 1, 0)); strategy.observe(1, board.receive_attack(6, 6, 0));
  strategy.observe(1, board.receive_attack(2, 1, 0));
  assert.equal(strategy.priority(1), 1); assert.deepEqual(strategy.choose(board.targetView(0), 1), { x: 6, y: 5 });
});
test('Command: los errores no gastan turno ni cooldown ni modifican el historial', () => {
  const game = ready();
  assert.throws(() => game.execute(new AttackCommand(0, { x: 0, y: 0 })));
  assert.throws(() => game.execute(new AbilityCommand(1, { x: 10, y: 0 }, 'recon')));
  assert.throws(() => game.placeShip(0, { x: 8, y: 8 }, 'H'));
  assert.equal(game.current.id, 0); assert.equal(game.current.turns, 0);
  assert.equal(game.history.length, 0); assert.equal(game.abilityStatus(game.current, 'recon').available, true);
  game.execute(new AttackCommand(1, { x: 9, y: 9 })); skipWithWater(game);
  assert.throws(() => game.execute(new AttackCommand(1, { x: 9, y: 9 })));
  assert.equal(game.current.id, 0); assert.equal(game.current.turns, 1);
});
for (const [ability, duration] of [['recon', 3], ['heavy', 4], ['torpedo', 3]] as const) {
  test(`cooldown ${ability}: bloquea exactamente ${duration} turnos propios`, () => {
    const game = ready(4), actor = game.current;
    game.execute(new AbilityCommand(1, { x: 9, y: 9 }, ability));
    assert.equal(game.abilityStatus(actor, ability).remaining, duration);
    for (let i = 0; i < duration; i++) {
      while (game.current !== actor) skipWithWater(game);
      assert.equal(game.abilityStatus(actor, ability).available, false);
      assert.throws(() => game.execute(new AbilityCommand(1, { x: 9, y: 9 }, ability)));
      skipWithWater(game);
    }
    while (game.current !== actor) skipWithWater(game);
    assert.equal(game.abilityStatus(actor, ability).available, true);
    game.execute(new AbilityCommand(1, { x: 9, y: 9 }, ability));
  });
}
test('una nave hundida deshabilita su habilidad', () => {
  const game = ready();
  for (let x = 0; x < 5; x++) game.players[0].board.receive_attack(x, 0, 1);
  assert.equal(game.abilityStatus(game.current, 'recon').sunk, true);
  assert.throws(() => game.execute(new AbilityCommand(1, { x: 0, y: 0 }, 'recon')));
});
test('eliminación: omite jugadores sin flota y declara al último superviviente', () => {
  const game = ready(3);
  for (const target of [1, 2]) {
    for (const ship of game.players[target].board.ships) for (const point of ship.coordinates) game.players[target].board.receive_attack(point.x, point.y, 0);
    const result = game.execute(new AttackCommand(target, { x: 9, y: 9 }));
    assert.ok(result.eliminated.includes(target));
    if (target === 1) { assert.equal(game.current.id, 2); skipWithWater(game); assert.equal(game.current.id, 0); }
  }
  assert.equal(game.state, State.GAME_OVER); assert.equal(game.winner!.id, 0);
  assert.throws(() => game.execute(new AttackCommand(1, { x: 9, y: 8 })));
});
test('SETUP: requiere la flota completa y soporta limpiar y reubicar', () => {
  const game = new GameManager({ size: 10, theme: 'mines', players: 2, humans: 1, difficulty: 'easy' });
  assert.throws(() => game.start()); assert.throws(() => game.execute(new AttackCommand(1, { x: 0, y: 0 })));
  game.autoPlace(0); game.clearPlacement(0); assert.equal(game.players[0].board.ships.length, 0);
  game.autoPlace(0); game.autoPlace(1); game.start();
  assert.throws(() => game.clearPlacement(0)); assert.equal(game.state, State.PLAYING);
});
for (const theme of ['open', 'islands', 'reefs', 'mines'] as Theme[]) for (const size of [10, 15, 20] as const) {
  test(`terreno y despliegue reproducible: ${theme}, ${size}x${size}`, () => {
    const board = new Board(size, theme, () => .05);
    assert.equal(board.cells.length, size); assert.equal(board.cells[0].length, size);
    assert.equal(board.cell({ x: 0, y: 0 }).state, CellState.EMPTY);
    assert.equal(board.cell({ x: 0, y: 5 }).state, theme === 'islands' ? CellState.OBSTACLE : theme === 'mines' ? CellState.MINE : CellState.EMPTY);
    assert.equal(board.cell({ x: 0, y: 5 }).reef, theme === 'reefs');
    board.autoPlace(); assert.equal(board.ships.length, 5); assert.ok(board.ships.every(ship => ship.health === ship.size));
    assert.equal(new Set(board.ships.flatMap(ship => ship.coordinates.map(key))).size, 17);
  });
}
for (const theme of ['open', 'islands', 'reefs', 'mines'] as Theme[]) for (const size of [10, 15, 20] as const) for (const players of [2, 3, 4]) for (const difficulty of ['easy', 'hard'] as Difficulty[]) {
  test(`partida completa: ${players} jugadores, ${theme}, ${size}, ${difficulty}`, () => {
    const random = seeded(size * 71 + players * 13 + (difficulty === 'hard' ? 1 : 0));
    const game = new GameManager({ size, theme, players, humans: 1, difficulty }, random);
    for (const player of game.players) game.autoPlace(player.id);
    // El driver de prueba controla también al humano usando el contrato Strategy.
    const driver = difficulty === 'easy' ? new EasyStrategy(random) : new HardStrategy(random);
    game.start(); let actions = 0;
    while (game.state !== State.GAME_OVER && actions < players * (players - 1) * size * size) {
      const actor = game.current;
      if (actor instanceof AIPlayer) game.aiTurn();
      else {
        const target = game.players.find(player => player !== actor && !player.eliminated)!;
        const point = driver.choose(target.board.targetView(actor.id), target.id);
        const result = game.execute(new AttackCommand(target.id, point)); driver.observe(target.id, result.impacts);
      }
      actions++;
    }
    assert.equal(game.state, State.GAME_OVER);
    assert.equal(game.players.filter(player => !player.eliminated).length, 1);
    assert.ok(game.winner!.board.alive); assert.equal(game.history.length, actions);
  });
}
