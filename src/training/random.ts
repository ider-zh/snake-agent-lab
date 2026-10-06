/** A separate serializable stream for exploration, initialization, replay and evolution. */
export class TrainingRandom {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    let t = this.state = (this.state + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(max: number): number { return Math.floor(this.next() * max); }
  normal(): number { return Math.sqrt(-2 * Math.log(Math.max(this.next(), 1e-12))) * Math.cos(2 * Math.PI * this.next()); }
}
export function nextTrainingSeed(rng: TrainingRandom, excluded: readonly number[]): number {
  let seed: number;
  do { seed = rng.int(0x7fffffff) + 1; } while (excluded.includes(seed));
  return seed;
}
