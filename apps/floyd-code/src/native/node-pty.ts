import { loadNativePackage } from './native-require';

type TerminalModule = typeof import('node-pty');

export function spawn(...args: Parameters<TerminalModule['spawn']>): ReturnType<TerminalModule['spawn']> {
  const terminal = loadNativePackage<TerminalModule>('node-pty');
  if (terminal === null) throw new Error('The portable app is missing its command-window files.');
  return terminal.spawn(...args);
}
