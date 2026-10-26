import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCommand } from '../src/lib/command';

function tool(command: string): string | undefined {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

describe('bash command lines', () => {
  it('runs a quoted python command whose path has spaces, quotes, unicode, and shell metacharacters', () => {
    const python = tool('python3');
    expect(python).toBeTruthy();
    const dir = path.join(os.tmpdir(), `oklite a'b $x (1) & "q" café ${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(os.tmpdir(), `okliterun-bash-${Date.now()}.txt`);
    const file = path.join(dir, 'main.py');
    fs.writeFileSync(
      file,
      `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("bash-ok", encoding="utf-8")\n`,
    );
    const plan = buildCommand({
      languageId: 'python',
      filePath: file,
      cwd: dir,
      shell: 'bash',
      platform: 'linux',
      pythonPath: python as string,
      shellScriptRunner: 'bash',
      powershellRunner: 'pwsh',
      executorMap: {},
      clearPreviousOutput: false,
    });
    execFileSync('bash', ['-c', plan.terminalCommand], { encoding: 'utf8' });
    expect(fs.readFileSync(marker, 'utf8')).toBe('bash-ok');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  });

  it('compiles and runs C through the bash && chain', () => {
    if (!tool('gcc')) {
      return;
    }
    const dir = path.join(os.tmpdir(), `oklite c (1) ${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(os.tmpdir(), `okliterun-bash-c-${Date.now()}.txt`);
    const file = path.join(dir, 'main.c');
    fs.writeFileSync(
      file,
      `#include <stdio.h>\nint main(void) {\n  FILE *f = fopen(${JSON.stringify(marker)}, "w");\n  if (!f) return 1;\n  fputs("c-ok", f);\n  fclose(f);\n  return 0;\n}\n`,
    );
    const plan = buildCommand({
      languageId: 'c',
      filePath: file,
      cwd: dir,
      shell: 'bash',
      platform: 'linux',
      pythonPath: 'python3',
      shellScriptRunner: 'bash',
      powershellRunner: 'pwsh',
      executorMap: {},
      clearPreviousOutput: false,
    });
    execFileSync('bash', ['-c', plan.terminalCommand], { encoding: 'utf8' });
    expect(fs.readFileSync(marker, 'utf8')).toBe('c-ok');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  });
});
