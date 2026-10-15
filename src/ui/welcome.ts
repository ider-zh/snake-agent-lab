import type { AgentId } from '../core/types';

export const PREFERENCES_KEY = 'snake-lab-play-v1';
export const DEMO = { strategy: 'hamiltonian-shortcut' as AgentId, size: 8, seed: 42, speed: 20, manual: false, obstacles: false, completionBudget: true, overlay: true };
export const DEFAULT_PLAY = { ...DEMO, strategy: 'astar' as AgentId, size: 12, speed: 8 };
export type PlayPreferences = typeof DEFAULT_PLAY;

export function readPreferences(ids: readonly string[]): PlayPreferences | null {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (!value || !ids.includes(value.strategy) || ![8, 9, 12, 16, 20].includes(value.size) ||
      !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff ||
      !Number.isInteger(value.speed) || value.speed < 1 || value.speed > 30 ||
      ['manual', 'obstacles', 'completionBudget', 'overlay'].some(key => typeof value[key] !== 'boolean')) return null;
    return value as PlayPreferences;
  } catch { return null; }
}
export function savePreferences(value: PlayPreferences) {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* Private/storage-disabled browsing still works. */ }
}
