import type { HistoryEntry } from './parse';

export interface ExportedHistoryEntry {
  command: string;
  /**
   * ISO 8601, or null when the shell didn't record a timestamp or the
   * recorded value doesn't fit in a JS `Date`.
   */
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
    timestamp: entry.timestamp === null ? null : epochSecondsToISOString(entry.timestamp),
  }));
}

/**
 * A corrupted history file can produce a timestamp `Date` can't
 * represent (a `#<epoch>` or `when:` line with a digit run long enough
 * to overflow to `Infinity`, for instance). `toISOString()` throws in
 * that case rather than returning a sentinel, so we check first and
 * fall back to null instead of taking down the whole export.
 */
function epochSecondsToISOString(epochSeconds: number): string | null {
  const date = new Date(epochSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Serializes parsed entries to a JSON string with ISO 8601 timestamps. */
export function toJSON(entries: HistoryEntry[], options: JSONExportOptions = {}): string {
  return JSON.stringify(toExportableEntries(entries), null, options.pretty ? 2 : undefined);
}
