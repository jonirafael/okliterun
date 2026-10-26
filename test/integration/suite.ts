import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Mocha from 'mocha';
import * as vscode from 'vscode';

let sequence = 0;

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 60000 });
  const suite = Mocha.Suite.create(mocha.suite, 'OkLiteRun');
  const workspace = process.env.OKLITERUN_TEST_WORKSPACE ?? '';
  const python = process.env.OKLITERUN_PYTHON ?? 'python3';

  suite.beforeAll(async function prepare() {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension('jonirafael.okliterun');
    assert.ok(extension, 'OkLiteRun did not load');
    await extension.activate();
    const config = vscode.workspace.getConfiguration('okliterun');
    await config.update('pythonPath', python, vscode.ConfigurationTarget.Global);
    await config.update('runInTerminal', false, vscode.ConfigurationTarget.Global);
    await config.update('saveBeforeRun', true, vscode.ConfigurationTarget.Global);
    await config.update('cwd', 'fileDir', vscode.ConfigurationTarget.Global);
    await config.update('clearPreviousOutput', true, vscode.ConfigurationTarget.Global);
    await config.update('executorMap', {}, vscode.ConfigurationTarget.Global);
  });

  suite.addTest(new Mocha.Test('registers the run and stop commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert(commands.includes('okliterun.run'));
    assert(commands.includes('okliterun.stop'));
  }));

  suite.addTest(new Mocha.Test('runs python from a path that contains spaces', async () => {
    const marker = path.join(workspace, `marker-space-${next()}.txt`);
    const file = path.join(workspace, 'space dir', 'hello.py');
    await runFile(file, pythonWrites(marker, 'space-ok'));
    assert.equal(await waitForText(marker, 15000), 'space-ok');
  }));

  suite.addTest(new Mocha.Test('uses the file directory as the working directory', async () => {
    const marker = path.join(workspace, `marker-cwd-${next()}.txt`);
    const file = path.join(workspace, 'nested', 'pkg', 'cwd.py');
    await runFile(file, `import os\nfrom pathlib import Path\nPath(${JSON.stringify(marker)}).write_text(os.getcwd(), encoding='utf-8')\n`);
    const actual = fs.realpathSync((await waitForText(marker, 15000)).trim());
    assert.equal(actual, fs.realpathSync(path.dirname(file)));
  }));

  suite.addTest(new Mocha.Test('can use the workspace root as the working directory', async () => {
    const config = vscode.workspace.getConfiguration('okliterun');
    await config.update('cwd', 'workspaceRoot', vscode.ConfigurationTarget.Global);
    try {
      const marker = path.join(workspace, `marker-root-${next()}.txt`);
      const file = path.join(workspace, 'nested', 'root.py');
      await runFile(file, `import os\nfrom pathlib import Path\nPath(${JSON.stringify(marker)}).write_text(os.getcwd(), encoding='utf-8')\n`);
      const actual = fs.realpathSync((await waitForText(marker, 15000)).trim());
      assert.equal(actual, fs.realpathSync(workspace));
    } finally {
      await config.update('cwd', 'fileDir', vscode.ConfigurationTarget.Global);
    }
  }));

  suite.addTest(new Mocha.Test('runs only the selected lines', async () => {
    const skip = path.join(workspace, `marker-skip-${next()}.txt`);
    const hit = path.join(workspace, `marker-hit-${next()}.txt`);
    const file = path.join(workspace, 'select me', 'part.py');
    const contents = `open(${JSON.stringify(skip)}, "w").write("skip")\nopen(${JSON.stringify(hit)}, "w").write("hit")\n`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    const document = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const line = document.lineAt(1);
    editor.selection = new vscode.Selection(line.range.start, line.range.end);
    await vscode.commands.executeCommand('okliterun.run');
    assert.equal(await waitForText(hit, 15000), 'hit');
    await delay(300);
    assert.equal(fs.existsSync(skip), false);
  }));

  suite.addTest(new Mocha.Test('saves dirty edits before running', async () => {
    const marker = path.join(workspace, `marker-save-${next()}.txt`);
    const file = path.join(workspace, 'save', 'dirty.py');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'print("old")\n');
    const document = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const replaced = await editor.edit((builder) => {
      const end = document.lineAt(document.lineCount - 1).range.end;
      builder.replace(new vscode.Range(new vscode.Position(0, 0), end), pythonWrites(marker, 'saved'));
    });
    assert.equal(replaced, true);
    assert.equal(document.isDirty, true);
    await vscode.commands.executeCommand('okliterun.run');
    assert.equal(await waitForText(marker, 15000), 'saved');
    assert.match(fs.readFileSync(file, 'utf8'), /saved/);
  }));

  suite.addTest(new Mocha.Test('stops a running python process', async () => {
    const started = path.join(workspace, `marker-started-${next()}.txt`);
    const finished = path.join(workspace, `marker-finished-${next()}.txt`);
    const file = path.join(workspace, 'sleep', 'nap.py');
    const contents = [
      'import pathlib, time',
      `pathlib.Path(${JSON.stringify(started)}).write_text("1", encoding="utf-8")`,
      'time.sleep(30)',
      `pathlib.Path(${JSON.stringify(finished)}).write_text("1", encoding="utf-8")`,
      '',
    ].join('\n');
    const pending = runFile(file, contents);
    await waitForText(started, 15000);
    await vscode.commands.executeCommand('okliterun.stop');
    await pending;
    await delay(400);
    assert.equal(fs.existsSync(finished), false);
  }));

  suite.addTest(new Mocha.Test('does not run when the configured python is missing', async () => {
    const config = vscode.workspace.getConfiguration('okliterun');
    await config.update('pythonPath', '/definitely/missing/okliterun-python', vscode.ConfigurationTarget.Global);
    try {
      const marker = path.join(workspace, `marker-missing-${next()}.txt`);
      const file = path.join(workspace, 'missing', 'nope.py');
      await runFile(file, pythonWrites(marker, 'should-not'));
      await delay(500);
      assert.equal(fs.existsSync(marker), false);
    } finally {
      await config.update('pythonPath', python, vscode.ConfigurationTarget.Global);
    }
  }));

  suite.addTest(new Mocha.Test('runs python in the integrated terminal', async () => {
    const config = vscode.workspace.getConfiguration('okliterun');
    await config.update('runInTerminal', true, vscode.ConfigurationTarget.Global);
    try {
      const marker = path.join(workspace, `marker-terminal-${next()}.txt`);
      const file = path.join(workspace, 'term dir', 'hello.py');
      await runFile(file, pythonWrites(marker, 'terminal-ok'));
      assert.equal(await waitForText(marker, 25000), 'terminal-ok');
    } finally {
      await config.update('runInTerminal', false, vscode.ConfigurationTarget.Global);
    }
  }));

  if (commandExists('gcc')) {
    suite.addTest(new Mocha.Test('compiles and runs a C file whose path has spaces', async () => {
      const marker = path.join(workspace, `marker-c-${next()}.txt`);
      const file = path.join(workspace, 'c dir', 'main.c');
      const contents = [
        '#include <stdio.h>',
        'int main(void) {',
        `  FILE *f = fopen(${JSON.stringify(marker)}, "w");`,
        '  if (!f) return 1;',
        '  fputs("c-ok", f);',
        '  fclose(f);',
        '  return 0;',
        '}',
        '',
      ].join('\n');
      await runFile(file, contents);
      assert.equal(await waitForText(marker, 20000), 'c-ok');
    }));
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed`));
        return;
      }
      resolve();
    });
  });
}

function next(): number {
  sequence += 1;
  return sequence;
}

function pythonWrites(marker: string, text: string): string {
  return `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text(${JSON.stringify(text)}, encoding="utf-8")\n`;
}

async function runFile(file: string, contents: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.endsWith('\n') ? contents : `${contents}\n`);
  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document, { preview: false });
  await vscode.commands.executeCommand('okliterun.run');
}

async function waitForText(file: string, timeoutMs: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf8');
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${file}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function commandExists(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
