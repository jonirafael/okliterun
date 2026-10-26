export function terminalEnvironment(options: {
  platform: NodeJS.Platform;
  shell: 'bash' | 'zsh' | 'pwsh' | 'powershell' | 'cmd' | 'wsl';
  pythonEnv?: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  if (options.pythonEnv) {
    for (const [key, value] of Object.entries(options.pythonEnv)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }
  }
  env.PYTHONUNBUFFERED = '1';
  if (!env.PYTHONIOENCODING) {
    env.PYTHONIOENCODING = 'utf-8';
  }
  if (options.platform === 'win32' && (options.shell === 'bash' || options.shell === 'zsh')) {
    env.MSYS_NO_PATHCONV = '1';
    env.MSYS2_ARG_CONV_EXCL = '*';
  }
  return env;
}
