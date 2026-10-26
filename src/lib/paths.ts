export function basenameOf(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return index < 0 ? filePath : filePath.slice(index + 1);
}

export function dirnameOf(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (index < 0) {
    return '.';
  }
  if (index === 0) {
    return filePath[0] === '\\' ? '\\' : '/';
  }
  if (index === 2 && /[A-Za-z]:/.test(filePath.slice(0, 2))) {
    return filePath.slice(0, 3);
  }
  return filePath.slice(0, index);
}

export function stripExtension(filePath: string): string {
  const base = basenameOf(filePath);
  const dir = filePath.slice(0, filePath.length - base.length);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return filePath;
  }
  return dir + base.slice(0, dot);
}

export function fileNameNoExt(filePath: string): string {
  const base = basenameOf(filePath);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return base;
  }
  return base.slice(0, dot);
}

/** Convert `C:\foo\bar` to `/mnt/c/foo/bar`. Non-Windows paths are returned with slashes normalized. */
export function windowsPathToWsl(input: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(input);
  if (!match) {
    return input.replace(/\\/g, '/');
  }
  const rest = match[2].replace(/\\/g, '/');
  return rest.length > 0 ? `/mnt/${match[1].toLowerCase()}/${rest}` : `/mnt/${match[1].toLowerCase()}/`;
}

/** Inverse of {@link windowsPathToWsl} for `/mnt/<drive>/...` paths. */
export function wslPathToWindows(input: string): string | undefined {
  const match = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(input);
  if (!match) {
    return undefined;
  }
  const rest = match[2].replace(/\//g, '\\');
  return `${match[1].toUpperCase()}:\\${rest}`;
}

export function hasNewline(value: string | undefined): boolean {
  return Boolean(value && /[\r\n]/.test(value));
}

export function resolveWorkingDirectory(input: {
  mode: 'fileDir' | 'workspaceRoot';
  sourceDir?: string;
  workspaceRoot?: string;
  fallbackDir: string;
}): { cwd: string; notice?: string } {
  if (input.mode === 'workspaceRoot') {
    if (input.workspaceRoot && input.workspaceRoot.trim()) {
      return { cwd: input.workspaceRoot };
    }
    return {
      cwd: input.sourceDir || input.fallbackDir,
      notice: 'OkLiteRun is set to use the workspace root, but no workspace folder is open. Using the file directory instead.',
    };
  }
  if (input.sourceDir && input.sourceDir.trim()) {
    return { cwd: input.sourceDir };
  }
  if (input.workspaceRoot && input.workspaceRoot.trim()) {
    return {
      cwd: input.workspaceRoot,
      notice: 'OkLiteRun is using the workspace folder because this file has not been saved yet.',
    };
  }
  return { cwd: input.fallbackDir };
}
