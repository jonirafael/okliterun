import * as vscode from 'vscode';

interface PythonEnvironmentPath {
  path?: string;
}

interface PythonResolved {
  executable?: { uri?: { fsPath?: string } };
}

interface PythonEnvironments {
  getActiveEnvironmentPath(resource?: vscode.Uri): PythonEnvironmentPath;
  resolveEnvironment(env: PythonEnvironmentPath | string): Promise<PythonResolved | undefined>;
  getEnvironmentVariables?(resource?: vscode.Uri): Record<string, string | undefined> | undefined;
}

interface PythonExports {
  environments?: PythonEnvironments;
  settings?: {
    getExecutionDetails?(resource?: vscode.Uri): { execCommand?: string[] } | undefined;
  };
}

export interface PythonResolution {
  executable?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Read the Python extension's selected interpreter, when that extension is installed.
 * A missing extension or an unexpected API shape falls through to PATH lookup.
 */
export async function getPythonEnvironment(resource: vscode.Uri | undefined): Promise<PythonResolution> {
  try {
    const extension = vscode.extensions.getExtension<PythonExports>('ms-python.python');
    if (!extension) {
      return {};
    }
    const api = extension.isActive ? extension.exports : await extension.activate();
    const env = normalizeEnv(api.environments?.getEnvironmentVariables?.(resource));
    const environments = api.environments;
    if (environments?.getActiveEnvironmentPath && environments.resolveEnvironment) {
      const active = environments.getActiveEnvironmentPath(resource);
      const resolved = await environments.resolveEnvironment(active);
      const fsPath = resolved?.executable?.uri?.fsPath;
      if (fsPath && fsPath.trim()) {
        return { executable: fsPath, env };
      }
      if (active?.path && looksLikePythonCommand(active.path)) {
        return { executable: active.path, env };
      }
    }
    const legacy = api.settings?.getExecutionDetails?.(resource)?.execCommand?.[0];
    if (typeof legacy === 'string' && legacy.trim()) {
      return { executable: legacy, env };
    }
    return { env };
  } catch (error) {
    console.error('[OkLiteRun] Python extension API failed', error);
    return {};
  }
}

function looksLikePythonCommand(command: string): boolean {
  const base = command.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  return base === 'python' || base === 'python.exe' || base === 'py' || base === 'py.exe' || /^python\d/.test(base);
}

function normalizeEnv(
  value: Record<string, string | undefined> | undefined,
): Record<string, string | undefined> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value;
}
