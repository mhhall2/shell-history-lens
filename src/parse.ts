export interface HistoryEntry {
  command: string;
  timestamp: number | null;
}

/**
 * Plain bash history has no timestamps: one command per line.
 * With `HISTTIMEFORMAT` set, bash writes a `#<epoch seconds>` line before
 * each command. We accept both in the same input and only attach a
 * timestamp to the command that immediately follows a `#...` line.
 */
export function parseBashHistory(text: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let pendingTimestamp: number | null = null;

  for (const rawLine of text.split('\n')) {
    if (rawLine === '') {
      continue;
    }

    const timestampMatch = rawLine.match(/^#(\d+)$/);
    if (timestampMatch) {
      pendingTimestamp = Number(timestampMatch[1]);
      continue;
    }

    entries.push({ command: rawLine, timestamp: pendingTimestamp });
    pendingTimestamp = null;
  }

  return entries;
}

const ZSH_EXTENDED_PATTERN = /^: (\d+):(\d+);([\s\S]*)$/;

/**
 * Zsh extended history (`setopt EXTENDED_HISTORY`) writes
 * `: <start>:<duration>;<command>`. Multi-line commands are stored with
 * a literal backslash before the newline, so we rejoin those before
 * matching the pattern. Lines without the prefix fall back to plain
 * history with no timestamp, since EXTENDED_HISTORY can be toggled
 * partway through a session.
 */
export function parseZshHistory(text: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];

  for (const line of joinBackslashContinuations(text)) {
    if (line.trim() === '') {
      continue;
    }

    const match = line.match(ZSH_EXTENDED_PATTERN);
    if (match) {
      entries.push({ command: match[3], timestamp: Number(match[1]) });
    } else {
      entries.push({ command: line, timestamp: null });
    }
  }

  return entries;
}

function joinBackslashContinuations(text: string): string[] {
  const logicalLines: string[] = [];
  let buffer: string | null = null;

  for (const rawLine of text.split('\n')) {
    const current = buffer === null ? rawLine : `${buffer}\n${rawLine}`;

    if (endsWithOddTrailingBackslashes(current)) {
      buffer = current.slice(0, -1);
    } else {
      logicalLines.push(current);
      buffer = null;
    }
  }

  if (buffer !== null) {
    logicalLines.push(buffer);
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

/**
 * Fish's history file is YAML-ish, not one-command-per-line: each entry
 * is a `- cmd: ...` line followed by indented `when:` (epoch seconds)
 * and optional `paths:` metadata we don't need. We track the most
 * recently seen command and attach it to the next `when:` we find, so a
 * command missing a `when:` (or the final entry in a truncated file)
 * still comes through with a null timestamp instead of being dropped.
 */
export function parseFishHistory(text: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let pendingCommand: string | null = null;

  for (const rawLine of text.split('\n')) {
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
      }
    }
  }

  if (pendingCommand !== null) {
    entries.push({ command: pendingCommand, timestamp: null });
  }

  return entries;
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
