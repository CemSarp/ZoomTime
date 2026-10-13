import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodeBounds, type SavedBounds } from './window-state.ts';

export function readSettings(file: string): { bounds: SavedBounds; error: boolean } {
  try {
    if (statSync(file).size > 16_384) throw new Error('Oversized preferences');
    return { bounds: decodeBounds(JSON.parse(readFileSync(file, 'utf8'))), error: false };
  } catch (error) {
    return { bounds: decodeBounds(null), error: (error as NodeJS.ErrnoException).code !== 'ENOENT' };
  }
}
export function writeSettings(file: string, bounds: SavedBounds): boolean {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(temporary, JSON.stringify(decodeBounds(bounds)), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
    return true;
  } catch {
    try { unlinkSync(temporary); } catch { /* A failed write may not have created the temporary file. */ }
    return false;
  }
}
