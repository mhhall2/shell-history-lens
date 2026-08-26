import type { HistoryEntry } from './parse';

export interface ExportedHistoryEntry {
  command: string;
  /** ISO 8601, or null when the shell didn't record a timestamp. */
  timestamp: string | null;
}

export interface JSONExportOptions {
  /** Pretty-print with 2-space indentation. Defaults to false. */
  pretty?: boolean;
}

/**
 * Converts epoch-second timestamps to ISO 8601 strings so exported data
 * is readable without knowing the timezone convention used elsewhere.
 * `Date` handles the epoch -> calendar conversion; we just scale to ms.
 */
export function toExportableEntries(entries: HistoryEntry[]): ExportedHistoryEntry[] {
  return entries.map((entry) => ({
    command: entry.command,
    timestamp: entry.timestamp === null ? null : new Date(entry.timestamp * 1000).toISOString(),
  }));
}

/** Serializes parsed entries to a JSON string with ISO 8601 timestamps. */
export function toJSON(entries: HistoryEntry[], options: JSONExportOptions = {}): string {
  return JSON.stringify(toExportableEntries(entries), null, options.pretty ? 2 : undefined);
}
