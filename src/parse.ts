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
