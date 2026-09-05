export interface HistoryEntry {
  command: string;
  timestamp: number | null;
}

/** A line that didn't match the expected format for its shell (1-indexed). */
export interface UnmatchedLine {
  line: number;
  text: string;
}

export interface HistoryParseResult {
  entries: HistoryEntry[];
  unmatchedLines: UnmatchedLine[];
}

/**
 * Plain bash history has no timestamps: one command per line.
 * With `HISTTIMEFORMAT` set, bash writes a `#<epoch seconds>` line before
 * each command. We accept both in the same input and only attach a
 * timestamp to the command that immediately follows a `#...` line.
 *
 * A line starting with `#` that isn't a clean `#<digits>` timestamp is
 * ambiguous - it's still treated as a literal command line (that's a
 * valid, if unusual, bash history entry), but it's also reported in
 * `unmatchedLines` since it may really be a corrupted timestamp.
 */
export function parseBashHistoryDetailed(text: string): HistoryParseResult {
  const entries: HistoryEntry[] = [];
  const unmatchedLines: UnmatchedLine[] = [];
  let pendingTimestamp: number | null = null;

  const rawLines = text.split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    if (rawLine === '') {
      continue;
    }

    const timestampMatch = rawLine.match(/^#(\d+)$/);
    if (timestampMatch) {
      pendingTimestamp = Number(timestampMatch[1]);
      continue;
    }

    if (rawLine.startsWith('#')) {
      unmatchedLines.push({ line: i + 1, text: rawLine });
    }

    entries.push({ command: rawLine, timestamp: pendingTimestamp });
    pendingTimestamp = null;
  }

  return { entries, unmatchedLines };
}

export function parseBashHistory(text: string): HistoryEntry[] {
  return parseBashHistoryDetailed(text).entries;
}

const ZSH_EXTENDED_PATTERN = /^: (\d+):(\d+);([\s\S]*)$/;

/**
 * Zsh extended history (`setopt EXTENDED_HISTORY`) writes
 * `: <start>:<duration>;<command>`. Multi-line commands are stored with
 * a literal backslash before the newline, so we rejoin those before
 * matching the pattern. Lines without the prefix fall back to plain
 * history with no timestamp, since EXTENDED_HISTORY can be toggled
 * partway through a session.
 *
 * A line that starts with `: ` but doesn't fully match the extended
 * format (a truncated duration, non-numeric start time, and so on) is
 * still treated as a fallback plain command, but it's also reported in
 * `unmatchedLines` - plain zsh commands rarely start with `: `, so this
 * usually means a corrupted extended-history line rather than a real
 * toggle.
 */
export function parseZshHistoryDetailed(text: string): HistoryParseResult {
  const entries: HistoryEntry[] = [];
  const unmatchedLines: UnmatchedLine[] = [];

  for (const { text: line, startLineNumber } of joinBackslashContinuations(text)) {
    if (line.trim() === '') {
      continue;
    }

    const match = line.match(ZSH_EXTENDED_PATTERN);
    if (match) {
      entries.push({ command: match[3], timestamp: Number(match[1]) });
      continue;
    }

    if (line.startsWith(': ')) {
      unmatchedLines.push({ line: startLineNumber, text: line });
    }
    entries.push({ command: line, timestamp: null });
  }

  return { entries, unmatchedLines };
}

export function parseZshHistory(text: string): HistoryEntry[] {
  return parseZshHistoryDetailed(text).entries;
}

interface LogicalLine {
  text: string;
  /** 1-indexed line number in the original text where this logical line starts. */
  startLineNumber: number;
}

function joinBackslashContinuations(text: string): LogicalLine[] {
  const logicalLines: LogicalLine[] = [];
  let buffer: string | null = null;
  let startLineNumber = 0;

  const rawLines = text.split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    if (buffer === null) {
      startLineNumber = i + 1;
    }
    const current = buffer === null ? rawLine : `${buffer}\n${rawLine}`;

    if (endsWithOddTrailingBackslashes(current)) {
      buffer = current.slice(0, -1);
    } else {
      logicalLines.push({ text: current, startLineNumber });
      buffer = null;
    }
  }

  if (buffer !== null) {
    logicalLines.push({ text: buffer, startLineNumber });
  }

  return logicalLines;
}

function endsWithOddTrailingBackslashes(line: string): boolean {
  let count = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) {
    count++;
  }
  return count % 2 === 1;
}

const FISH_CMD_PATTERN = /^- cmd: (.*)$/;
const FISH_WHEN_PATTERN = /^\s+when: (\d+)$/;
const FISH_PATHS_HEADER_PATTERN = /^\s+paths:\s*$/;
const FISH_PATH_ITEM_PATTERN = /^\s+- .*$/;

/**
 * Fish's history file is YAML-ish, not one-command-per-line: each entry
 * is a `- cmd: ...` line followed by indented `when:` (epoch seconds)
 * and optional `paths:` metadata we don't need. We track the most
 * recently seen command and attach it to the next `when:` we find, so a
 * command missing a `when:` (or the final entry in a truncated file)
 * still comes through with a null timestamp instead of being dropped.
 *
 * `paths:` headers and their indented `- ` list items are recognized
 * and skipped since we don't use them. Any other line that isn't a
 * `- cmd:`, a `when:` attached to a pending command, or paths metadata
 * is reported in `unmatchedLines` instead of being silently dropped -
 * that covers a `when:` with a non-numeric value, a `when:` with no
 * command before it, or a genuinely unrecognized line.
 */
export function parseFishHistoryDetailed(text: string): HistoryParseResult {
  const entries: HistoryEntry[] = [];
  const unmatchedLines: UnmatchedLine[] = [];
  let pendingCommand: string | null = null;

  const rawLines = text.split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    if (rawLine === '') {
      continue;
    }

    const cmdMatch = rawLine.match(FISH_CMD_PATTERN);
    if (cmdMatch) {
      if (pendingCommand !== null) {
        entries.push({ command: pendingCommand, timestamp: null });
      }
      pendingCommand = unescapeFishCommand(cmdMatch[1]);
      continue;
    }

    if (pendingCommand !== null) {
      const whenMatch = rawLine.match(FISH_WHEN_PATTERN);
      if (whenMatch) {
        entries.push({ command: pendingCommand, timestamp: Number(whenMatch[1]) });
        pendingCommand = null;
        continue;
      }
    }

    if (FISH_PATHS_HEADER_PATTERN.test(rawLine) || FISH_PATH_ITEM_PATTERN.test(rawLine)) {
      continue;
    }

    unmatchedLines.push({ line: i + 1, text: rawLine });
  }

  if (pendingCommand !== null) {
    entries.push({ command: pendingCommand, timestamp: null });
  }

  return { entries, unmatchedLines };
}

export function parseFishHistory(text: string): HistoryEntry[] {
  return parseFishHistoryDetailed(text).entries;
}

/**
 * Fish escapes backslashes and embedded newlines when it writes a
 * command to history (`\` -> `\\`, newline -> `\n`). Unescape both so
 * multi-line commands come back out the way they were typed.
 */
function unescapeFishCommand(raw: string): string {
  let result = '';

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === 'n') {
        result += '\n';
        i++;
        continue;
      }
      if (next === '\\') {
        result += '\\';
        i++;
        continue;
      }
    }
    result += raw[i];
  }

  return result;
}
