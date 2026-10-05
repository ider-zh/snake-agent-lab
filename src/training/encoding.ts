import type { Observation } from '../core/types';
import { observationSize } from './config';
/** Cell-major head/body/food/body-order/obstacle channels, followed by absolute direction one-hot. */
export function encodeObservation(observation: Observation): Float32Array {
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
