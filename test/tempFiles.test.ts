import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeSource, isManagedTemp, removeTemp, tempScriptName, writeTempSource } from '../src/lib/tempFiles';

describe('temp script names', () => {
  it('keeps the original name when the extension matches', () => {
    expect(tempScriptName('java', 'Hello (1).java')).toBe('Hello (1).java');
    expect(tempScriptName('python', 'main.py')).toBe('main.py');
    expect(tempScriptName('cpp', 'widget.cc')).toBe('widget.cc');
    expect(tempScriptName('typescriptreact', 'App.tsx')).toBe('App.tsx');
  });

  it('uses a language default for untitled buffers', () => {
    expect(tempScriptName('python', 'Untitled-1')).toBe('OkLiteRun.py');
    expect(tempScriptName('java', undefined)).toBe('Main.java');
    expect(tempScriptName('powershell', 'Untitled-1')).toBe('OkLiteRun.ps1');
    expect(tempScriptName('c', '../etc/passwd')).toBe('OkLiteRun.c');
  });
});

describe('temp files on disk', () => {
  it('writes utf-8 and a BOM for PowerShell', async () => {
    const py = encodeSource('main.py', 'print(1)');
    expect(py[0]).not.toBe(0xef);
    expect(py.toString('utf8').endsWith('\n')).toBe(true);
    const ps1 = encodeSource('run.ps1', 'Write-Output 1');
    expect([...ps1.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const written = await writeTempSource('Hello (1).java', 'class Hello {}');
    expect(isManagedTemp(written.directory)).toBe(true);
    expect(path.basename(written.filePath)).toBe('Hello (1).java');
    const text = await fs.readFile(written.filePath, 'utf8');
    expect(text.startsWith('class Hello')).toBe(true);
    await removeTemp(written.directory);
    await expect(fs.stat(written.directory)).rejects.toThrow();
  });

  it('refuses to delete a path outside the temp root', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'okliterun-outside-'));
    await removeTemp(outside);
    const stat = await fs.stat(outside);
    expect(stat.isDirectory()).toBe(true);
    await fs.rm(outside, { recursive: true });
  });
});
