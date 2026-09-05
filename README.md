# shell-history-lens

Every shell writes its history file in a slightly different way. Plain
bash is one command per line. Bash with `HISTTIMEFORMAT` set interleaves
`#<epoch>` timestamp lines. Zsh with `EXTENDED_HISTORY` prefixes each
command with `: <start>:<duration>;`. Fish writes a YAML-ish sequence of
`- cmd:` / `when:` records instead of plain text. Multi-line commands
get escaped differently depending on the shell. If you've ever tried to
write a quick script to answer "what do I actually run most often",
you've probably hit at least one of these formats and given up halfway.

This library does the parsing and the boring statistics, and nothing
else. It doesn't touch the filesystem, doesn't know your `$HOME`, and
doesn't print anything. You read the history file yourself and hand
the library a string; it hands you back data. That also means every
function here is trivial to unit test: no fixtures on disk, no mocking
`fs`, just strings in and arrays out.

## Install

No published package yet. Compile with `tsc` and use the output in
`dist/`, or copy `src/` into your project — there are no runtime
dependencies to bring along.

## Usage

```ts
import { readFileSync } from 'node:fs';
import { parseZshHistory, mostUsed, dedupe } from './src';

const raw = readFileSync(`${process.env.HOME}/.zsh_history`, 'utf8');
const entries = parseZshHistory(raw);

// top 5 binaries you actually run, ignoring flags/args and sudo/env prefixes
console.log(mostUsed(entries, 5, { baseCommandOnly: true }));
// => [ { command: 'git', count: 812 }, { command: 'npm', count: 340 }, ... ]

// collapse repeated commands, keeping the most recent run of each
const unique = dedupe(entries, { keep: 'last' });
```

Bash history, with or without `HISTTIMEFORMAT`:

```ts
import { parseBashHistory, filterByTimeRange } from './src';

const entries = parseBashHistory(readFileSync(`${process.env.HOME}/.bash_history`, 'utf8'));

// commands run in a given window (requires HISTTIMEFORMAT to have been set)
const lastHour = filterByTimeRange(entries, startEpoch, endEpoch);
```

Fish history:

```ts
import { parseFishHistory } from './src';

const entries = parseFishHistory(
  readFileSync(`${process.env.HOME}/.local/share/fish/fish_history`, 'utf8')
);
```

## What's here

- `parseBashHistory(text)` / `parseZshHistory(text)` /
  `parseFishHistory(text)` — turn raw history file contents into
  `HistoryEntry[]` (`{ command, timestamp }`, timestamp is `null` when
  the shell didn't record one).
- `parseBashHistoryDetailed(text)` / `parseZshHistoryDetailed(text)` /
  `parseFishHistoryDetailed(text)` — same parsing, but return
  `{ entries, unmatchedLines }` so you can see which lines didn't fit
  the expected format for that shell (a corrupted `#<epoch>` line, a
  `when:` with a non-numeric value, and so on). Malformed lines still
  come through best-effort in `entries`; `unmatchedLines` just tells
  you where to look.
- `dedupe(entries, options)` — collapse repeats, keeping first or last
  occurrence.
- `extractBaseCommand(command)` — pull the actual binary out of a
  command line, skipping `FOO=bar` env assignments and a leading
  `sudo`.
- `frequencyByCommand(entries, options)` / `mostUsed(entries, n, options)`
  — count usage, optionally grouped by base command instead of the
  full line.
- `filterByTimeRange(entries, start, end)` — inclusive epoch-second
  window filter.
- `toJSON(entries, options)` / `toExportableEntries(entries)` — export
  parsed entries as JSON with epoch timestamps converted to ISO 8601,
  so exported data is readable without knowing which timezone
  convention the rest of your tooling uses.

Every function is pure: same input, same output, no hidden state.

## Tests

Run with `npm test`, which compiles with `tsc` and runs the compiled
output through Node's built-in test runner. No test framework is
installed — `node --test` is standard library as of Node 18.

## Not here yet

Everything above reads the whole history file into a string first. For
a multi-hundred-thousand-line `.zsh_history` that's still fine, but
there's no streaming entry point yet for parsing a file incrementally
without holding the whole text in memory at once.

## License

MIT, see [LICENSE](LICENSE).
