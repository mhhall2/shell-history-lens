export type { HistoryEntry, UnmatchedLine, HistoryParseResult } from './parse';
export {
  parseBashHistory,
  parseZshHistory,
  parseFishHistory,
  parseBashHistoryDetailed,
  parseZshHistoryDetailed,
  parseFishHistoryDetailed,
} from './parse';

export type { CommandFrequency, DedupeOptions, FrequencyOptions } from './stats';
export {
  dedupe,
  extractBaseCommand,
  frequencyByCommand,
  mostUsed,
  filterByTimeRange,
} from './stats';

export type { ExportedHistoryEntry, JSONExportOptions } from './export';
export { toExportableEntries, toJSON } from './export';
