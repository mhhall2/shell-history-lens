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

- `streamBashHistory(lines)` / `streamZshHistory(lines)` /
  `streamFishHistory(lines)` — same parsing rules, but consume an
  async or sync iterable of lines and yield `HistoryEntry` values one
  at a time instead of returning an array, for files too large to read
  into memory as a single string.
- `frequencyByCommandStream(entries, options)` / `dedupeStream(entries, options)`
  — same results as `frequencyByCommand` and `dedupe`, but consume an
  async or sync iterable of entries so you can pipe the output of the
  `stream*History` functions straight through without ever holding the
  full entry list in memory.

Every function is pure: same input, same output, no hidden state.

## Streaming

`parseBashHistory` and friends take the whole file as a string, which is
fine until the file is big enough that reading it into memory first is
the problem. `streamBashHistory(lines)` / `streamZshHistory(lines)` /
`streamFishHistory(lines)` take an async or sync iterable of lines
instead and yield `HistoryEntry` values one at a time, so you can pipe a
multi-gigabyte `.zsh_history` through without holding more than the
current entry (and, for zsh, a pending backslash-continued command) in
memory:

```ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { streamZshHistory } from './src';

const lines = createInterface({ input: createReadStream(`${process.env.HOME}/.zsh_history`) });

for await (const entry of streamZshHistory(lines)) {
  if (entry.command.startsWith('git ')) {
    console.log(entry.command);
  }
}
```

There's no `unmatchedLines` array here — collecting one would defeat
the point of streaming a file you can't fully hold in memory. Pass
`{ onUnmatchedLine }` instead if you want to log or count malformed
lines as they're found.

`dedupe` and `frequencyByCommand` have streaming counterparts too,
since building the full `HistoryEntry[]` array just to hand it to one
of them defeats the point of having parsed the file as a stream in the
first place:

```ts
import { streamZshHistory, frequencyByCommandStream, dedupeStream } from './src';

const lines = createInterface({ input: createReadStream(`${process.env.HOME}/.zsh_history`) });
const top = await frequencyByCommandStream(streamZshHistory(lines), { baseCommandOnly: true });
```

Both hold memory proportional to the number of *distinct* commands
seen, not the number of entries in the source. `frequencyByCommandStream`
can't return anything until the source is exhausted (it's a total
count), and neither can `dedupeStream` with the default `keep: 'last'`
(a later duplicate can still change what gets kept for a command). With
`keep: 'first'`, though, `dedupeStream` yields each command the moment
it's first seen, since that occurrence is already final.

## CLI

`src/cli.ts` compiles to `dist/cli.js` and wires `fs.createReadStream`
through `readline` into the stream parsers, so it never reads a whole
history file into memory before parsing it. Run it directly with:

```sh
node dist/cli.js --shell zsh --top 5
node dist/cli.js --shell bash --file /path/to/.bash_history --base-command
node dist/cli.js --shell fish --json > history.json
node dist/cli.js --shell zsh --since 1700000000 --until 1700086400
```

With no `--file`, it looks in the usual place for the given shell
(`~/.zsh_history`, `~/.bash_history`, or
`~/.local/share/fish/fish_history`). `--json` prints the full parsed
history via `toJSON`; otherwise it prints the top N commands (10 by
default, change with `--top`) one per line as `count<TAB>command`.

## Tests

Run with `npm test`, which compiles with `tsc` and runs the compiled
output through Node's built-in test runner. No test framework is
installed — `node --test` is standard library as of Node 18.

## License

MIT, see [LICENSE](LICENSE).
