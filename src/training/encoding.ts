import type { Observation } from '../core/types';
import { moveCell, relativeAction, simulateMove } from '../core';
import { observationSize } from './config';
/** Cell-major head/body/food/body-order/obstacle channels, followed by absolute direction one-hot. */
export function encodeObservation(observation: Observation, profile?: 'compact-v2'): Float32Array {
  if (profile === 'compact-v2') return encodeRelative(observation);
  const cells = observation.config.width * observation.config.height;
  const result = new Float32Array(observationSize(observation.config.width, observation.config.height));
  observation.snake.forEach((cell, i) => {
    result[cell * 5 + (i === 0 ? 0 : 1)] = 1;
    result[cell * 5 + 3] = (observation.snake.length - i) / cells;
  });
  if (observation.food !== null) result[observation.food * 5 + 2] = 1;
  for (const cell of observation.config.obstacles) result[cell * 5 + 4] = 1;
  result[cells * 5 + observation.direction] = 1;
  return result;
}

/** Egocentric features share what is learned across head positions and board sizes.
 * No planner, future food, score reward, or RNG state is supplied to the policy. */
function encodeRelative(o: Observation): Float32Array {
  const { width, height } = o.config, head = o.snake[0], scale = Math.max(width, height);
  const result = new Float32Array(12);
  const occupied = new Set([...o.snake.slice(0,-1), ...o.config.obstacles]);
  for (let i = 0; i < 3; i++) {
    const direction = relativeAction(o.direction, i);
    result[i] = simulateMove(o,direction).collision ? 1 : 0;
    let cell = head, wall = 0, clear = 0, blocked = false;
    while ((cell = moveCell(cell,direction,width,height)) >= 0) {
      wall++;
      if (occupied.has(cell)) blocked = true;
      if (!blocked) clear++;
    }
    result[5+i] = wall / scale; result[8+i] = clear / scale;
  }
  if (o.food !== null) {
    const dx = (o.food % width - head % width) / scale;
    const dy = (Math.floor(o.food / width) - Math.floor(head / width)) / scale;
    result[3] = [-dy, dx, dy, -dx][o.direction];
    result[4] = [dx, dy, -dx, -dy][o.direction];
  }
  result[11] = o.snake.length / (width * height - o.config.obstacles.length);
  return result;
}

export function trainingReward(before: Observation, after: Observation, original: number, profile?: 'compact-v2'): number {
  if (!profile) return original;
  if (after.terminated) return after.reason === 'filled' ? 20 : -10;
  if (after.score > before.score) return 10;
  const distance = (o: Observation) => o.food === null ? 0 : Math.abs(o.snake[0] % o.config.width - o.food % o.config.width) + Math.abs(Math.floor(o.snake[0] / o.config.width) - Math.floor(o.food / o.config.width));
  return -0.01 + 0.5 * (distance(before) - distance(after));
}
