import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCommand } from '../src/lib/command';
import { spawnPlan } from '../src/lib/spawnRun';

function tool(command: string): string | undefined {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

describe('spawnPlan', () => {
  it('runs node with a path that contains spaces, quotes, and unicode', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oklite run "café" '));
    const marker = path.join(os.tmpdir(), `okliterun-node-${Date.now()}.txt`);
    const file = path.join(dir, 'main (1).js');
    fs.writeFileSync(file, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'node-ok');\n`);
    const plan = buildCommand({
      languageId: 'javascript',
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
    let stderr = '';
    const managed = spawnPlan({
      cwd: dir,
      env: process.env,
      directSteps: plan.directSteps,
      onStdout: () => undefined,
      onStderr: (chunk) => {
        stderr += chunk;
      },
    });
    const code = await managed.done;
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(fs.readFileSync(marker, 'utf8')).toBe('node-ok');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  });

  it('uses the requested working directory for python', async () => {
    const python = tool('python3');
    expect(python).toBeTruthy();
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oklite cwd '));
    const sourceDir = path.join(root, 'nested (1)');
    fs.mkdirSync(sourceDir);
    const marker = path.join(root, 'cwd.txt');
    const file = path.join(sourceDir, 'main.py');
    fs.writeFileSync(file, `import os\nfrom pathlib import Path\nPath(${JSON.stringify(marker)}).write_text(os.getcwd(), encoding='utf-8')\n`);
    const plan = buildCommand({
      languageId: 'python',
      filePath: file,
      cwd: root,
      shell: 'bash',
      platform: 'linux',
      pythonPath: python as string,
      shellScriptRunner: 'bash',
      powershellRunner: 'pwsh',
      executorMap: {},
      clearPreviousOutput: false,
    });
    const managed = spawnPlan({
      cwd: root,
      env: process.env,
      directSteps: plan.directSteps,
      onStdout: () => undefined,
      onStderr: () => undefined,
    });
    expect(await managed.done).toBe(0);
    expect(fs.realpathSync(fs.readFileSync(marker, 'utf8').trim())).toBe(fs.realpathSync(root));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('compiles and runs C from a directory with spaces', async () => {
    if (!tool('gcc')) {
      return;
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oklite c (1) '));
    const marker = path.join(os.tmpdir(), `okliterun-c-${Date.now()}.txt`);
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
    let stderr = '';
    const managed = spawnPlan({
      cwd: dir,
      env: process.env,
      directSteps: plan.directSteps,
      onStdout: () => undefined,
      onStderr: (chunk) => {
        stderr += chunk;
      },
    });
    const code = await managed.done;
    expect(code, stderr).toBe(0);
    expect(fs.readFileSync(marker, 'utf8')).toBe('c-ok');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  });
});
