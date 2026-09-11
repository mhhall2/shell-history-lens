#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HistoryEntry } from './parse';
import { streamBashHistory, streamZshHistory, streamFishHistory } from './stream';
import { mostUsed, filterByTimeRange } from './stats';
import { toJSON } from './export';

type Shell = 'bash' | 'zsh' | 'fish';

interface CliOptions {
  shell: Shell;
  file: string;
  top: number;
  baseCommandOnly: boolean;
  json: boolean;
  since: number | null;
  until: number | null;
}

function defaultHistoryFile(shell: Shell): string {
  switch (shell) {
    case 'bash':
      return join(homedir(), '.bash_history');
    case 'zsh':
      return join(homedir(), '.zsh_history');
    case 'fish':
      return join(homedir(), '.local', 'share', 'fish', 'fish_history');
  }
}

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function requireShell(value: string | undefined): Shell {
  if (value !== 'bash' && value !== 'zsh' && value !== 'fish') {
    throw new Error(`--shell must be one of bash, zsh, fish (got ${value ?? 'nothing'})`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    shell: 'zsh',
    file: '',
    top: 10,
    baseCommandOnly: false,
    json: false,
    since: null,
    until: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--shell':
        options.shell = requireShell(argv[++i]);
        break;
      case '--file':
        options.file = requireValue(arg, argv[++i]);
        break;
      case '--top':
        options.top = Number(requireValue(arg, argv[++i]));
        break;
      case '--base-command':
        options.baseCommandOnly = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--since':
        options.since = Number(requireValue(arg, argv[++i]));
        break;
      case '--until':
        options.until = Number(requireValue(arg, argv[++i]));
        break;
      default:
        throw new Error(`unrecognized argument: ${arg}`);
    }
  }

  if (options.file === '') {
    options.file = defaultHistoryFile(options.shell);
  }

  return options;
}

function streamEntries(shell: Shell, file: string): AsyncGenerator<HistoryEntry> {
  const lines = createInterface({ input: createReadStream(file) });
  switch (shell) {
    case 'bash':
      return streamBashHistory(lines);
    case 'zsh':
      return streamZshHistory(lines);
    case 'fish':
      return streamFishHistory(lines);
  }
}

/**
 * Buffers the whole file into `entries` before handing it to
 * `mostUsed`/`filterByTimeRange`/`toJSON`, which only work on arrays.
 * The point of going through `streamZshHistory` here is still real:
 * the file is read and parsed one line at a time via `createReadStream`,
 * so a bad line near the end of a huge file doesn't cost you a second
 * full read to find it.
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  let entries: HistoryEntry[] = [];
  for await (const entry of streamEntries(options.shell, options.file)) {
    entries.push(entry);
  }

  if (options.since !== null || options.until !== null) {
    entries = filterByTimeRange(entries, options.since ?? -Infinity, options.until ?? Infinity);
  }

  if (options.json) {
    console.log(toJSON(entries, { pretty: true }));
    return;
  }

  const top = mostUsed(entries, options.top, { baseCommandOnly: options.baseCommandOnly });
  for (const { command, count } of top) {
    console.log(`${count}\t${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
