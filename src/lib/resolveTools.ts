export function pythonCandidates(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    return ['python', 'python3', 'py'];
  }
  return ['python3', 'python'];
}

export async function resolvePythonExecutable(options: {
  configured?: string;
  fromExtension?: string;
  platform: NodeJS.Platform;
  exists: (command: string) => Promise<boolean>;
}): Promise<string | undefined> {
  const configured = options.configured?.trim();
  if (configured) {
    return configured;
  }
  const fromExtension = options.fromExtension?.trim();
  if (fromExtension && (await options.exists(fromExtension))) {
    return fromExtension;
  }
  for (const candidate of pythonCandidates(options.platform)) {
    if (await options.exists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function pickTypescriptRunner(available: { tsx: boolean; tsNode: boolean }): string | undefined {
  if (available.tsx) {
    return 'tsx';
  }
  if (available.tsNode) {
    return 'ts-node';
  }
  return undefined;
}

export async function firstExisting(
  commands: readonly string[],
  exists: (command: string) => Promise<boolean>,
): Promise<string | undefined> {
  for (const command of commands) {
    if (await exists(command)) {
      return command;
    }
  }
  return undefined;
}
