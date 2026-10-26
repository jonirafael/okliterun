import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultExtension, hasLanguageExtension } from './languages';

const TEMP_ROOT_NAME = 'okliterun';

export function tempRoot(): string {
  return path.join(os.tmpdir(), TEMP_ROOT_NAME);
}

export function isManagedTemp(target: string): boolean {
  const root = path.resolve(tempRoot());
  const resolved = path.resolve(target);
  return resolved === root || resolved.startsWith(root + path.sep);
}

export function tempScriptName(languageId: string, originalBaseName: string | undefined): string {
  const cleaned = originalBaseName?.replace(/[\\/\r\n\0]/g, '').trim();
  if (cleaned && cleaned !== '.' && cleaned !== '..' && hasLanguageExtension(languageId, cleaned)) {
    return cleaned;
  }
  if (languageId === 'java') {
    return 'Main.java';
  }
  return `OkLiteRun${defaultExtension(languageId)}`;
}

export function encodeSource(fileName: string, contents: string): Buffer {
  const text = contents.endsWith('\n') ? contents : `${contents}\n`;
  if (fileName.toLowerCase().endsWith('.ps1')) {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  }
  return Buffer.from(text, 'utf8');
}

export async function writeTempSource(fileName: string, contents: string): Promise<{ filePath: string; directory: string }> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const directory = path.join(tempRoot(), id);
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  await fs.writeFile(filePath, encodeSource(fileName, contents));
  return { filePath, directory };
}

export async function removeTemp(target: string | undefined): Promise<void> {
  if (!target || !isManagedTemp(target)) {
    return;
  }
  await fs.rm(target, { recursive: true, force: true });
}

export async function cleanupStaleTempDirs(now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  const root = tempRoot();
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const dir = path.join(root, entry);
      if (!isManagedTemp(dir)) {
        return;
      }
      try {
        const stat = await fs.stat(dir);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch {
        // Another run may have removed it.
      }
    }),
  );
}
