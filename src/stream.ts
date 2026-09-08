import type { HistoryEntry, UnmatchedLine } from './parse';
import {
  ZSH_EXTENDED_PATTERN,
  FISH_CMD_PATTERN,
  FISH_WHEN_PATTERN,
  FISH_PATHS_HEADER_PATTERN,
  FISH_PATH_ITEM_PATTERN,
  endsWithOddTrailingBackslashes,
  unescapeFishCommand,
} from './parse';

/** A line source: whatever the caller reads their file with (e.g. `readline.createInterface`). */
export type LineSource = AsyncIterable<string> | Iterable<string>;

export interface StreamParseOptions {
  /**
   * Called for each line that doesn't fit the expected format, as it's
   * encountered. There's no `unmatchedLines` array here the way the
   * `*Detailed` functions have one - collecting every unmatched line
   * would defeat the point of streaming a file you can't fully hold in
   * memory. Pass a callback if you want to log or count them.
   */
  onUnmatchedLine?: (line: UnmatchedLine) => void;
}

/**
 * Same rules as `parseBashHistoryDetailed`, but consumes a line source
 * (async or sync) and yields entries one at a time instead of reading
 * the whole file into a string first. Pair with `readline.createInterface`
 * over a `fs.createReadStream` to parse a multi-gigabyte history file
 * without holding it all in memory.
 */
export async function* streamBashHistory(
  lines: LineSource,
  options: StreamParseOptions = {}
): AsyncGenerator<HistoryEntry> {
  let pendingTimestamp: number | null = null;
  let lineNumber = 0;

  for await (const rawLine of lines) {
    lineNumber++;
    if (rawLine === '') {
      continue;
    }

    const timestampMatch = rawLine.match(/^#(\d+)$/);
    if (timestampMatch) {
      pendingTimestamp = Number(timestampMatch[1]);
      continue;
    }

    if (rawLine.startsWith('#')) {
      options.onUnmatchedLine?.({ line: lineNumber, text: rawLine });
    }

    yield { command: rawLine, timestamp: pendingTimestamp };
    pendingTimestamp = null;
  }
}

interface LogicalLine {
  text: string;
  startLineNumber: number;
}

/** Streaming counterpart of `joinBackslashContinuations` in parse.ts. */
async function* joinBackslashContinuationsStream(lines: LineSource): AsyncGenerator<LogicalLine> {
  let buffer: string | null = null;
  let startLineNumber = 0;
  let lineNumber = 0;

  for await (const rawLine of lines) {
    lineNumber++;
    if (buffer === null) {
      startLineNumber = lineNumber;
    }
    const current = buffer === null ? rawLine : `${buffer}\n${rawLine}`;

    if (endsWithOddTrailingBackslashes(current)) {
      buffer = current.slice(0, -1);
    } else {
      yield { text: current, startLineNumber };
      buffer = null;
    }
  }

  if (buffer !== null) {
    yield { text: buffer, startLineNumber };
  }
}

/**
 * Same rules as `parseZshHistoryDetailed`, but consumes a line source
 * and yields entries one at a time. A backslash-continued command still
 * only needs to hold its own (small) buffer in memory, not the rest of
 * the file.
 */
export async function* streamZshHistory(
  lines: LineSource,
  options: StreamParseOptions = {}
): AsyncGenerator<HistoryEntry> {
  for await (const { text: line, startLineNumber } of joinBackslashContinuationsStream(lines)) {
    if (line.trim() === '') {
      continue;
    }

    const match = line.match(ZSH_EXTENDED_PATTERN);
    if (match) {
      yield { command: match[3], timestamp: Number(match[1]) };
      continue;
    }

    if (line.startsWith(': ')) {
      options.onUnmatchedLine?.({ line: startLineNumber, text: line });
    }
    yield { command: line, timestamp: null };
  }
}

/**
 * Same rules as `parseFishHistoryDetailed`, but consumes a line source
 * and yields entries one at a time. Still only ever holds a single
 * pending command in memory while it waits for the `when:` line (or
 * end of input) that completes it.
 */
export async function* streamFishHistory(
  lines: LineSource,
  options: StreamParseOptions = {}
): AsyncGenerator<HistoryEntry> {
  let pendingCommand: string | null = null;
  let lineNumber = 0;

  for await (const rawLine of lines) {
    lineNumber++;
    if (rawLine === '') {
      continue;
    }

    const cmdMatch = rawLine.match(FISH_CMD_PATTERN);
    if (cmdMatch) {
      if (pendingCommand !== null) {
        yield { command: pendingCommand, timestamp: null };
      }
      pendingCommand = unescapeFishCommand(cmdMatch[1]);
      continue;
    }

    if (pendingCommand !== null) {
      const whenMatch = rawLine.match(FISH_WHEN_PATTERN);
      if (whenMatch) {
        yield { command: pendingCommand, timestamp: Number(whenMatch[1]) };
        pendingCommand = null;
        continue;
      }
    }

    if (FISH_PATHS_HEADER_PATTERN.test(rawLine) || FISH_PATH_ITEM_PATTERN.test(rawLine)) {
      continue;
    }

    options.onUnmatchedLine?.({ line: lineNumber, text: rawLine });
  }

  if (pendingCommand !== null) {
    yield { command: pendingCommand, timestamp: null };
  }
}
