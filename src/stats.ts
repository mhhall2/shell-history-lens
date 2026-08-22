import type { HistoryEntry } from './parse';

export interface CommandFrequency {
  command: string;
  count: number;
}

export interface DedupeOptions {
  /** Which occurrence's position and timestamp to keep. Defaults to 'last'. */
  keep?: 'first' | 'last';
}

export interface FrequencyOptions {
  /** Count by binary name (e.g. `git`) instead of the full command line. */
  baseCommandOnly?: boolean;
}

/**
 * Collapses repeated commands to a single entry, preserving first-seen
 * order. `keep: 'last'` (the default) keeps the most recent timestamp,
 * which matches what you usually want when summarizing "what did I run".
 */
export function dedupe(entries: HistoryEntry[], options: DedupeOptions = {}): HistoryEntry[] {
  const keep = options.keep ?? 'last';
  const indexByCommand = new Map<string, number>();
  const result: HistoryEntry[] = [];

  for (const entry of entries) {
    const existingIndex = indexByCommand.get(entry.command);
    if (existingIndex === undefined) {
      indexByCommand.set(entry.command, result.length);
      result.push(entry);
    } else if (keep === 'last') {
      result[existingIndex] = entry;
    }
  }

  return result;
}

/**
 * Strips leading env var assignments (`FOO=bar cmd`) and a leading
 * `sudo`, then returns the first remaining token. Returns an empty
 * string if the command is blank or only assignments.
 */
export function extractBaseCommand(command: string): string {
  const tokens = command.trim().split(/\s+/).filter((token) => token.length > 0);

  let i = 0;
  while (i < tokens.length && isEnvAssignment(tokens[i])) {
    i++;
  }
  if (tokens[i] === 'sudo') {
    i++;
  }

  return tokens[i] ?? '';
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

/**
 * Counts occurrences, sorted highest first, then alphabetically to
 * keep output deterministic when counts tie.
 */
export function frequencyByCommand(
  entries: HistoryEntry[],
  options: FrequencyOptions = {}
): CommandFrequency[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const key = options.baseCommandOnly ? extractBaseCommand(entry.command) : entry.command;
    if (key === '') {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count || a.command.localeCompare(b.command));
}

export function mostUsed(
  entries: HistoryEntry[],
  limit: number,
  options?: FrequencyOptions
): CommandFrequency[] {
  return frequencyByCommand(entries, options).slice(0, limit);
}

/** Both bounds are inclusive, in epoch seconds. Entries with no timestamp are excluded. */
export function filterByTimeRange(
  entries: HistoryEntry[],
  startEpochSeconds: number,
  endEpochSeconds: number
): HistoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.timestamp !== null &&
      entry.timestamp >= startEpochSeconds &&
      entry.timestamp <= endEpochSeconds
  );
}
