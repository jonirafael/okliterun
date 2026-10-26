import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'okliterun-it-'));
  const python = execFileSync('which', ['python3'], { encoding: 'utf8' }).trim();
  process.env.OKLITERUN_TEST_WORKSPACE = workspace;
  process.env.OKLITERUN_PYTHON = python;
  const extensionDevelopmentPath = path.resolve(__dirname, '..');
  const extensionTestsPath = path.resolve(__dirname, 'suite.js');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust'],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
