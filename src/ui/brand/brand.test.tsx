/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrandBoard } from './BrandBoard';

let visibility: (visible: boolean) => void;
let reduced = false;
let motion: () => void;
beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { visibility = visible => callback([{ isIntersecting: visible }]); }
    observe() { visibility(true); }
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_event: string, listener: () => void) => { motion = listener; }, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses one real engine timer in StrictMode, stops offscreen and preserves a user pause', () => {
  const { container } = render(<StrictMode><BrandBoard/></StrictMode>);
  const board = container.querySelector('.brand-live')!;
  act(() => vi.advanceTimersByTime(1000));
  expect(board.getAttribute('data-steps')).toBe('20');
  act(() => visibility(false));
  act(() => vi.advanceTimersByTime(1000));
  expect(board.getAttribute('data-steps')).toBe('20');
  act(() => visibility(true));
  fireEvent.click(screen.getByLabelText('暂停实时演示'));
  act(() => visibility(false)); act(() => visibility(true));
  act(() => vi.advanceTimersByTime(1000));
  expect(board.getAttribute('data-steps')).toBe('20');
  fireEvent.click(screen.getByLabelText('继续实时演示'));
  act(() => vi.advanceTimersByTime(1000));
  expect(board.getAttribute('data-steps')).toBe('40');
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  act(() => vi.advanceTimersByTime(1000));
  expect(board.getAttribute('data-steps')).toBe('40');
  hidden.mockReturnValue(false);
  fireEvent(document, new Event('visibilitychange'));
  act(() => { reduced = true; motion(); });
  act(() => vi.advanceTimersByTime(1000));
  expect(board.getAttribute('data-steps')).toBe('40');
});

it('fills all 64 cells at exactly 675 real engine steps and never auto-restarts', () => {
  const { container } = render(<BrandBoard/>);
  act(() => vi.advanceTimersByTime(40000));
  expect(container.querySelector('.brand-live')?.getAttribute('data-steps')).toBe('675');
  expect(screen.getByRole('status').textContent).toContain('64 格，全部抵达');
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('得分 61，步数 675');
  act(() => vi.advanceTimersByTime(40000));
  expect(container.querySelector('.brand-live')?.getAttribute('data-steps')).toBe('675');
});
