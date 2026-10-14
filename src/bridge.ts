import type { Bounds, WindowMode } from './window-state.ts';
import type { CallingEvent, CallingState, CaptureAction } from './calling-service.ts';
import type { ClientMessage } from './protocol.ts';
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
  getCallingState(): Promise<CallingState>;
  createHost(endpoint: string): Promise<void>;
  copyInvitation(): Promise<void>;
  importInvitation(): Promise<void>;
  resetPairing(): Promise<void>;
  retryConnection(): Promise<void>;
  authorizeCapture(action: CaptureAction): Promise<void>;
  releaseCapture(): Promise<void>;
  sendSignal(message: ClientMessage): Promise<void>;
  onCallEvent(callback: (event: CallingEvent) => void): () => void;
}
