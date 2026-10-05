import type { Direction, GameConfig, Observation, Snapshot, StepResult } from './types';
export * from './types';

export const DEFAULT_CONFIG: GameConfig = Object.freeze({
  width: 12, height: 12, initialLength: 3, initialization: 'standard',
  obstacles: Object.freeze([]) as unknown as number[], maxSteps: 5000, maxNoFood: 500,
});

function integer(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return value;
}

export function normalizeConfig(input: Partial<GameConfig> = {}): GameConfig {
  const c = { ...DEFAULT_CONFIG, ...input };
  integer(c.width, 'width', 1, 64); integer(c.height, 'height', 1, 64);
  integer(c.maxSteps, 'maxSteps', 0, 100_000_000); integer(c.maxNoFood, 'maxNoFood', 0, 100_000_000);
  if (!Array.isArray(c.obstacles)) throw new Error('obstacles must be an array');
  c.obstacles = [...new Set(c.obstacles.map(cell => integer(cell, 'obstacle cell', 0, c.width * c.height - 1)))].sort((a, b) => a - b);
  integer(c.initialLength, 'initialLength', 1, c.width * c.height - c.obstacles.length);
  if (c.initialization !== 'standard' && c.initialization !== 'cycle') throw new Error('Unknown initialization');
  if (c.initialization === 'cycle' && (c.obstacles.length || c.width < 2 || c.height < 2 || (c.width % 2 && c.height % 2))) {
    throw new Error('Cycle initialization requires an obstacle-free rectangle with both dimensions > 1 and an even side');
  }
  return c;
}

/** Mulberry32, with an explicit serializable state. Streams are owned by callers. */
export class SeededRandom {
  private value: number;
  constructor(seed = 1) {
    if (!Number.isFinite(seed) || !Number.isInteger(seed)) throw new Error('seed must be a finite integer');
    this.value = seed >>> 0;
  }
  get state(): number { return this.value; }
  set state(value: number) { this.value = integer(value, 'rngState', 0, 0xffffffff); }
  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let n = this.value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  }
  int(n: number): number { integer(n, 'random range', 1, 4294967296); return Math.floor(this.next() * n); }
}

export function relativeAction(direction: Direction, index: number): Direction {
  integer(direction, 'direction', 0, 3); integer(index, 'relative action', 0, 2);
  return ((direction + index + 3) % 4) as Direction;
}

/** Returns -1 outside the board, without horizontal wrapping. */
export function moveCell(cell: number, direction: Direction, width: number, height: number): number {
  const x = cell % width, y = Math.floor(cell / width);
  if (direction === 0) return y > 0 ? cell - width : -1;
  if (direction === 1) return x < width - 1 ? cell + 1 : -1;
  if (direction === 2) return y < height - 1 ? cell + width : -1;
  return x > 0 ? cell - 1 : -1;
}
export function directionBetween(from: number, to: number, width: number): Direction {
  if (to === from - width) return 0;
  if (to === from + 1 && Math.floor(from / width) === Math.floor(to / width)) return 1;
  if (to === from + width) return 2;
  if (to === from - 1 && Math.floor(from / width) === Math.floor(to / width)) return 3;
  throw new Error('Cells must be orthogonally adjacent');
}

/** A complete, simple cycle. When width is odd, transpose an even-width cycle. */
export function cycle(width: number, height: number): number[] {
  integer(width, 'width', 2, 64); integer(height, 'height', 2, 64);
  if (width % 2 && height % 2) throw new Error('Hamiltonian cycle requires at least one even dimension');
  if (width % 2) return cycle(height, width).map(cell => (cell % height) * width + Math.floor(cell / height));
  const result = [0];
  for (let y = 1; y < height; y++) result.push(y * width);
  for (let x = 1; x < width; x++) {
    if (x % 2) for (let y = height - 1; y >= 1; y--) result.push(y * width + x);
    else for (let y = 1; y < height; y++) result.push(y * width + x);
  }
  for (let x = width - 1; x > 0; x--) result.push(x);
  return result;
}

type MoveState = Pick<Observation, 'config' | 'snake' | 'food' | 'direction'>;
export interface Movement {
  direction: Direction; illegal: boolean; head: number; ate: boolean;
  collision: 'wall' | 'body' | 'obstacle' | null; snake: number[];
}
/** Shared movement semantics for the environment and full-path agent simulation. */
export function simulateMove(state: MoveState, action: Direction): Movement {
  const illegal = !Number.isInteger(action) || action < 0 || action > 3 || action === (state.direction + 2) % 4;
  const direction = illegal ? state.direction : action;
  const head = moveCell(state.snake[0], direction, state.config.width, state.config.height);
  const ate = head >= 0 && head === state.food;
  const occupied = state.snake.slice(0, ate ? state.snake.length : -1);
  const collision = head < 0 ? 'wall' : state.config.obstacles.includes(head) ? 'obstacle' : occupied.includes(head) ? 'body' : null;
  return { direction, illegal, head, ate, collision, snake: collision ? [...state.snake] : [head, ...occupied] };
}
export function legalActions(observation: Observation): Direction[] {
  if (observation.terminated || observation.truncated) return [];
  return ([0, 1, 2, 3] as Direction[]).filter(action => {
    const move = simulateMove(observation, action);
    return !move.illegal && !move.collision;
  });
}

function initialSnake(config: GameConfig): { snake: number[]; direction: Direction } {
  if (config.initialization === 'cycle') {
    const route = cycle(config.width, config.height);
    return { snake: route.slice(0, config.initialLength).reverse(), direction: directionBetween(route[config.initialLength - 1], route[config.initialLength % route.length], config.width) };
  }
  const { width, height, initialLength } = config, obstacles = new Set(config.obstacles);
  const center = Math.floor(height / 2) * width + Math.floor(width / 2);
  const row = Array.from({ length: initialLength }, (_, i) => center - i);
  if (initialLength <= center % width + 1 && row.every(c => !obstacles.has(c))) return { snake: row, direction: 1 };
  // Deterministic bounded backtracking also handles small obstacle maps. Reject an
  // impossible requested length rather than silently changing the experiment.
  const starts = [center, ...Array.from({ length: width * height }, (_, i) => i).filter(i => i !== center)];
  let attempts = 0;
  for (const start of starts) {
    if (obstacles.has(start)) continue;
    const path = [start], used = new Set([start]), stack = [0];
    while (path.length < initialLength && path.length) {
      if (++attempts > 200_000) throw new Error('Initial snake search budget exhausted; shorten initialLength or change obstacles');
      const depth = path.length - 1;
      if (stack[depth] === 4) { used.delete(path.pop()!); stack.pop(); continue; }
      const direction = ([3, 2, 0, 1] as Direction[])[stack[depth]++];
      const next = moveCell(path[depth], direction, width, height);
      if (next < 0 || used.has(next) || obstacles.has(next)) continue;
      path.push(next); used.add(next); stack.push(0);
    }
    if (path.length === initialLength) return { snake: path, direction: path.length > 1 ? directionBetween(path[1], path[0], width) : 1 };
  }
  throw new Error('No contiguous initial snake fits this map');
}

export class Game {
  private config!: GameConfig;
  private snake!: number[];
  private food: number | null = null;
  private direction: Direction = 1;
  private score = 0;
  private steps = 0;
  private noFood = 0;
  private terminated = false;
  private truncated = false;
  private reason: Observation['reason'] = null;
  private seed = 1;
  private random = new SeededRandom();
  constructor(config: Partial<GameConfig> = {}, seed = 1) { this.reset(seed, config); }
  reset(seed = this.seed, config: Partial<GameConfig> = this.config ?? {}): Observation {
    const normalized = normalizeConfig(config), initial = initialSnake(normalized), random = new SeededRandom(seed);
    this.config = normalized; this.seed = seed >>> 0; this.random = random;
    this.snake = initial.snake; this.direction = initial.direction;
    this.score = 0; this.steps = 0; this.noFood = 0; this.truncated = false;
    this.terminated = this.snake.length === this.config.width * this.config.height - this.config.obstacles.length;
    this.reason = this.terminated ? 'filled' : null;
    this.food = this.terminated ? null : this.spawnFood();
    return this.observe();
  }
  private spawnFood(): number | null {
    const used = new Set([...this.snake, ...this.config.obstacles]);
    const available = this.config.width * this.config.height - used.size;
    if (!available) return null;
    let rank = this.random.int(available);
    for (let cell = 0; cell < this.config.width * this.config.height; cell++) if (!used.has(cell) && rank-- === 0) return cell;
    throw new Error('Food allocation invariant failed');
  }
  observe(): Observation {
    return Object.freeze({ config: Object.freeze({ ...this.config, obstacles: Object.freeze([...this.config.obstacles]) as unknown as number[] }),
      snake: Object.freeze([...this.snake]), food: this.food, direction: this.direction, score: this.score,
      steps: this.steps, noFood: this.noFood, terminated: this.terminated, truncated: this.truncated, reason: this.reason });
  }
  step(action: Direction): StepResult {
    if (this.terminated || this.truncated) return { observation: this.observe(), reward: 0, events: [], terminated: this.terminated, truncated: this.truncated };
    const move = simulateMove({ config: this.config, snake: this.snake, food: this.food, direction: this.direction }, action);
    const events: string[] = move.illegal ? ['illegal-action'] : [];
    this.direction = move.direction; this.steps++; this.noFood++;
    let reward = -0.001;
    if (move.collision) {
      this.terminated = true; this.reason = move.collision; reward = -1; events.push(move.collision);
    } else {
      this.snake = move.snake;
      if (move.ate) {
        this.score++; this.noFood = 0; reward = 1; events.push('eat');
        if (this.snake.length === this.config.width * this.config.height - this.config.obstacles.length) {
          this.food = null; this.terminated = true; this.reason = 'filled'; reward++; events.push('filled');
        } else this.food = this.spawnFood();
      }
      if (!this.terminated && this.config.maxSteps > 0 && this.steps >= this.config.maxSteps) {
        this.truncated = true; this.reason = 'step-limit'; events.push('step-limit');
      } else if (!this.terminated && this.config.maxNoFood > 0 && this.noFood >= this.config.maxNoFood) {
        this.truncated = true; this.reason = 'no-progress'; events.push('no-progress');
      }
    }
    return { observation: this.observe(), reward, events, terminated: this.terminated, truncated: this.truncated };
  }
  snapshot(): Snapshot {
    const obs = this.observe();
    return { ...obs, config: { ...obs.config, obstacles: [...obs.config.obstacles] }, snake: [...obs.snake], version: 'snake-core-v1', seed: this.seed, rngState: this.random.state };
  }
  restore(snapshot: Snapshot): Observation {
    if (!snapshot || snapshot.version !== 'snake-core-v1') throw new Error('Incompatible snapshot version');
    const config = normalizeConfig(snapshot.config), area = config.width * config.height;
    if (!Array.isArray(snapshot.snake) || !snapshot.snake.length || snapshot.snake.length > area - config.obstacles.length) throw new Error('Invalid snapshot snake');
    const snake = snapshot.snake.map(cell => integer(cell, 'snake cell', 0, area - 1));
    if (new Set(snake).size !== snake.length || snake.some(cell => config.obstacles.includes(cell))) throw new Error('Overlapping snapshot snake');
    for (let i = 1; i < snake.length; i++) directionBetween(snake[i - 1], snake[i], config.width);
    integer(snapshot.direction, 'direction', 0, 3); integer(snapshot.score, 'score', 0, area);
    integer(snapshot.steps, 'steps', 0, 100_000_000); integer(snapshot.noFood, 'noFood', 0, snapshot.steps);
    integer(snapshot.seed, 'seed', 0, 0xffffffff); integer(snapshot.rngState, 'rngState', 0, 0xffffffff);
    if (snake.length !== config.initialLength + snapshot.score) throw new Error('Snapshot score does not match snake length');
    if (typeof snapshot.terminated !== 'boolean' || typeof snapshot.truncated !== 'boolean' || (snapshot.terminated && snapshot.truncated)) throw new Error('Invalid snapshot end flags');
    if (snapshot.terminated ? !['wall', 'body', 'obstacle', 'filled'].includes(snapshot.reason ?? '') : snapshot.truncated ? !['step-limit', 'no-progress'].includes(snapshot.reason ?? '') : snapshot.reason !== null) throw new Error('Invalid snapshot end reason');
    if (snapshot.food !== null) {
      integer(snapshot.food, 'food', 0, area - 1);
      if (snake.includes(snapshot.food) || config.obstacles.includes(snapshot.food)) throw new Error('Occupied snapshot food');
    } else if (snapshot.reason !== 'filled') throw new Error('Missing food in unfilled snapshot');
    if ((snapshot.reason === 'filled') !== (snake.length === area - config.obstacles.length)) throw new Error('Invalid filled state');
    if (snapshot.reason === 'filled' && snapshot.food !== null) throw new Error('Filled snapshot cannot have food');
    this.config = config; this.snake = snake; this.food = snapshot.food; this.direction = snapshot.direction;
    this.score = snapshot.score; this.steps = snapshot.steps; this.noFood = snapshot.noFood;
    this.terminated = snapshot.terminated; this.truncated = snapshot.truncated; this.reason = snapshot.reason;
    this.seed = snapshot.seed; this.random = new SeededRandom(snapshot.seed); this.random.state = snapshot.rngState;
    return this.observe();
  }
  hash(): string {
    const serialized = JSON.stringify(this.snapshot());
    let hash = 2166136261;
    for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
