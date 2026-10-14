import type { GameState } from './GameState';
import { runFrame } from './GameLoop';

export type Listener = (state: GameState) => void;

/**
 * Hält den einen `GameState`. Szene und UI lesen über `getState`/`subscribe`
 * und schreiben nur über `dispatch` mit einer puren Action aus `core`.
 */
export interface Store {
  getState(): GameState;
  dispatch(action: (state: GameState) => GameState): GameState;
  /** Treibt die Simulation um `frameMs` (fester Tick, Rest bleibt im Akkumulator). */
  advance(frameMs: number): GameState;
  subscribe(listener: Listener): () => void;
}

export function createStore(initial: GameState): Store {
  let state = initial;
  let accumulatorMs = 0;
  const listeners = new Set<Listener>();
  const set = (next: GameState): GameState => {
    if (next !== state) {
      state = next;
      for (const l of listeners) l(state);
    }
    return state;
  };
  return {
    getState: () => state,
    dispatch: (action) => set(action(state)),
    advance(frameMs) {
      const r = runFrame(state, accumulatorMs, frameMs);
      accumulatorMs = r.accumulatorMs;
      return set(r.state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
