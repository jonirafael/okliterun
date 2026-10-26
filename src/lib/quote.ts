import type { ShellKind } from './shell';

/**
 * Quote one argument for the given shell.
 * Bash, zsh, and WSL use POSIX single quotes. PowerShell uses single quotes
 * with doubled apostrophes. cmd.exe uses double quotes and caret-escapes `%` and `!`.
 */
export function quoteArg(value: string, shell: ShellKind): string {
  switch (shell) {
    case 'powershell':
    case 'pwsh':
      return quotePowerShell(value);
    case 'cmd':
      return quoteCmd(value);
    default:
      return quotePosix(value);
  }
}

export function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function quotePowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Prepare a cmd.exe argument so a trailing backslash cannot escape the closing quote.
 * Windows file names cannot end in `\`. Drive roots become `C:\.`.
 */
export function prepareCmdArgument(value: string): string {
  if (!value.endsWith('\\')) {
    return value;
  }
  if (/^[A-Za-z]:\\+$/.test(value)) {
    return `${value[0]}:\\.`;
  }
  const stripped = value.replace(/\\+$/, '');
  return stripped.length > 0 ? stripped : `${value}.`;
}

export function quoteCmd(value: string): string {
  const prepared = prepareCmdArgument(value);
  let out = '"';
  for (const ch of prepared) {
    if (ch === '"') {
      out += '""';
    } else if (ch === '%' || ch === '!') {
      // Break out of the quoted region. `^` only escapes outside quotes.
      out += `"^${ch}"`;
    } else {
      out += ch;
    }
  }
  out += '"';
  return out;
}
