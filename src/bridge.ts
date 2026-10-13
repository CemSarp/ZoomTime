import type { Bounds, WindowMode } from './window-state.ts';
export interface WindowState {
  mode: WindowMode;
  bounds: Bounds;
  preferencesError: boolean;
}
export interface ZoomTimeBridge {
  getState(): Promise<WindowState>;
  setMode(mode: WindowMode): Promise<WindowState>;
  restore(): Promise<WindowState>;
  close(): Promise<void>;
  onState(callback: (state: WindowState) => void): () => void;
}
