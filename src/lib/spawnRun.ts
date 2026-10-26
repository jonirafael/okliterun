import { spawn, type ChildProcess } from 'node:child_process';
import { killProcessTree } from './processTree';
import { shellCommandArgs, type ShellKind } from './shell';

export interface SpawnPlanOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  directSteps?: string[][];
  shellCommand?: string;
  shell?: ShellKind;
  shellPath?: string;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
}

export interface ManagedProcess {
  done: Promise<number | null>;
  cancel: () => Promise<void>;
}

export function spawnPlan(options: SpawnPlanOptions): ManagedProcess {
  let child: ChildProcess | undefined;
  let cancelled = false;
  let settled = false;
  let resolveDone: (code: number | null) => void = () => undefined;
  let rejectDone: (error: Error) => void = () => undefined;
  const done = new Promise<number | null>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const finish = (code: number | null) => {
    if (settled) {
      return;
    }
    settled = true;
    resolveDone(code);
  };
  const fail = (error: Error) => {
    if (settled) {
      return;
    }
    settled = true;
    rejectDone(error);
  };

  const cancel = async (): Promise<void> => {
    cancelled = true;
    const pid = child?.pid;
    if (pid && pid > 1) {
      await killProcessTree(pid, { includeRoot: true });
    } else {
      child?.kill('SIGKILL');
    }
  };

  void (async () => {
    try {
      if (options.directSteps && options.directSteps.length > 0) {
        for (const argv of options.directSteps) {
          if (cancelled) {
            finish(null);
            return;
          }
          const code = await runArgv(argv, options, (next) => {
            child = next;
          });
          if (cancelled) {
            finish(null);
            return;
          }
          if (code !== 0) {
            finish(code);
            return;
          }
        }
        finish(0);
        return;
      }
      if (!options.shellCommand || !options.shell) {
        fail(new Error('OkLiteRun has nothing to run.'));
        return;
      }
      const invoked = shellCommandArgs(options.shell, options.shellCommand);
      const exe = options.shellPath?.trim() ? options.shellPath : invoked.command;
      const code = await runArgv([exe, ...invoked.args], options, (next) => {
        child = next;
      });
      finish(cancelled ? null : code);
    } catch (error) {
      if (cancelled) {
        finish(null);
        return;
      }
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return { done, cancel };
}

function runArgv(
  argv: string[],
  options: SpawnPlanOptions,
  setChild: (child: ChildProcess) => void,
): Promise<number> {
  const executable = argv[0];
  if (!executable) {
    return Promise.reject(new Error('OkLiteRun has nothing to run.'));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv.slice(1), {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    setChild(child);
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => options.onStdout(chunk));
    child.stderr?.on('data', (chunk: string) => options.onStderr(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
