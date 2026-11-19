import { dialog, ipcMain, clipboard, type BrowserWindow } from 'electron';
import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppResult } from './contract';
import { localDeckSchema } from './deckscape/lib/deck-record';
import { deckBackupText } from './deckscape/lib/deck-backup-text';
import { parseDeckBackup } from './deckscape/lib/import-backup';

const invalid: AppResult<{ saved: boolean }> = { ok: false, error: { code: 'INVALID_EXPORT', message: 'This draft could not be exported. Check its name and card entries, then retry.' } };

async function save(window: BrowserWindow, name: string, extension: string, bytes: Uint8Array): Promise<AppResult<{ saved: boolean }>> {
  let temporary: string | undefined;
  try {
    const selected = await dialog.showSaveDialog(window, { title: 'Export deck', defaultPath: name,
      filters: [{ name: extension === 'json' ? 'Deckscape backup' : 'Promotional image', extensions: [extension] }], properties: ['showOverwriteConfirmation'] });
    if (selected.canceled || !selected.filePath) return { ok: true, data: { saved: false } };
    if (!isAbsolute(selected.filePath)) return invalid;
    const staged = join(dirname(selected.filePath), `.${basename(selected.filePath)}.${randomUUID()}.tmp`);
    const file = await open(staged, 'wx');
    temporary = staged;
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await rename(staged, selected.filePath);
    temporary = undefined;
    return { ok: true, data: { saved: true } };
  } catch {
    return { ok: false, error: { code: 'EXPORT_FAILED', message: 'The file could not be saved. Your draft is unchanged. Check available space and folder access, then retry.' } };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
  }
}

export function registerDesktopExports(window: BrowserWindow, trusted: (event: Electron.IpcMainInvokeEvent) => boolean) {
  ipcMain.handle('deck:exportImage', async (event, input: unknown, name: unknown) => {
    if (!trusted(event) || !(input instanceof Uint8Array) || input.length < 24 || input.length > 10 * 1024 * 1024
      || typeof name !== 'string' || !/^deckscape-[a-z0-9-]{1,80}\.png$/.test(name)) return invalid;
    const bytes = Buffer.from(input);
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.subarray(12,16).toString() !== 'IHDR'
      || bytes.readUInt32BE(16) !== 1200 || bytes.readUInt32BE(20) !== 630) return invalid;
    return save(window, name, 'png', bytes);
  });
  ipcMain.handle('deck:copyText', async (event, text: unknown): Promise<AppResult<{ copied: boolean }>> => {
    if (!trusted(event) || typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1_000_000) {
      return { ok: false, error: { code: 'INVALID_EXPORT', message: 'This card list could not be copied.' } };
    }
    try { await clipboard.writeText(text); return { ok: true, data: { copied: true } }; }
    catch { return { ok: false, error: { code: 'CLIPBOARD_UNAVAILABLE', message: 'The clipboard is unavailable. Select the card list and copy it manually.' } }; }
  });
  ipcMain.handle('deck:exportBackup', async (event, input: unknown) => {
    if (!trusted(event)) return invalid;
    const parsed = localDeckSchema.safeParse(input);
    if (!parsed.success) return invalid;
    const text = deckBackupText(parsed.data);
    try { parseDeckBackup(text); } catch { return invalid; }
    return save(window, 'deckscape-draft.json', 'json', Buffer.from(text, 'utf8'));
  });
}
