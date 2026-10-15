import type { UpdateState } from './updates.ts';
import type { Preferences } from './preferences.ts';
import type { Bounds, WindowMode } from './window-state.ts';
import type { CallingEvent, CallingState, CaptureAction } from './calling-service.ts';
import type { ClientMessage } from './protocol.ts';
export interface WindowState {
  mode: WindowMode;
  bounds: Bounds;
  preferencesError: boolean;
  preferences: Preferences;
  fullScreen: boolean;
  minimized: boolean;
}
export interface ZoomTimeBridge {
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  revealUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
  getState(): Promise<WindowState>;
  setMode(mode: WindowMode): Promise<WindowState>;
  setPreferences(preferences: Preferences): Promise<WindowState>;
  setupHost(): Promise<void>;
  setFullScreen(enabled: boolean): Promise<WindowState>;
  minimize(): Promise<void>;
  restore(): Promise<WindowState>;
  close(): Promise<void>;
  onSettings(callback: () => void): () => void;
  onState(callback: (state: WindowState) => void): () => void;
  getCallingState(): Promise<CallingState>;
  createHost(endpoint: string): Promise<void>;
  copyInvitation(): Promise<void>;
  importInvitation(): Promise<void>;
  resetPairing(): Promise<void>;
  retryConnection(): Promise<void>;
  authorizeDeviceCheck(): Promise<void>;
  releaseDeviceCheck(): Promise<void>;
  authorizeCapture(action: CaptureAction): Promise<void>;
  releaseCapture(): Promise<void>;
  sendSignal(message: ClientMessage): Promise<void>;
  onCallEvent(callback: (event: CallingEvent) => void): () => void;
}
