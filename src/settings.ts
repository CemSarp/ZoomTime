import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodePreferences, type Preferences } from './preferences.ts';
import { decodeBounds, type SavedBounds } from './window-state.ts';

export function readSettings(file: string): { bounds: SavedBounds; preferences: Preferences; error: boolean } {
  try {
    if (statSync(file).size > 16_384) throw new Error('Oversized preferences');
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return { bounds: decodeBounds(value), preferences: decodePreferences(value?.preferences), error: false };
  } catch (error) {
    return { bounds: decodeBounds(null), preferences: decodePreferences(null), error: (error as NodeJS.ErrnoException).code !== 'ENOENT' };
  }
}
export function writeSettings(file: string, bounds: SavedBounds, preferences: Preferences = decodePreferences(null)): boolean {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(temporary, JSON.stringify({ ...decodeBounds(bounds), preferences: decodePreferences(preferences) }), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
    return true;
  } catch {
    try { unlinkSync(temporary); } catch { /* A failed write may not have created the temporary file. */ }
    return false;
  }
}
