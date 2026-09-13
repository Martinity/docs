/**
 * TOC index -> Datacenter (table 5) header ID mappings.
 * Source: the modding tool's `_TARGET_STATIC` / `_TARGET_MAP` tables.
 */

/** One TOC index resolves directly to one Datacenter header. */
export interface StaticHeaderEntry {
  tocIndex: number;
  /** [table, hid, category] */
  hid: readonly [number, number];
  category: string;
}

/**
 * A contiguous block of TOC indices shares one category's block of
 * Datacenter headers. `hidPrefix`'s last element is the first header's
 * index within the category; headers run hidPrefix[2] .. hidPrefix[2] + count - 1.
 */
export interface HeaderRangeEntry {
  start: number;
  end: number;
  /** [table, category, firstHeaderIndex] */
  hidPrefix: readonly [number, number, number];
  category: string;
}

export const DATACENTER_STATIC: readonly StaticHeaderEntry[] = [
  { tocIndex: 186, hid: [5, 0], category: 'Script'},
  { tocIndex: 204, hid: [5, 1], category: 'Message'},
  { tocIndex: 185, hid: [5, 7], category: 'Script'},
  { tocIndex: 187, hid: [5, 9], category: 'Script'},
  { tocIndex: 203, hid: [5, 10], category: 'Paf'},
  { tocIndex: 189, hid: [5, 11], category: 'Texture'},
  { tocIndex: 190, hid: [5, 12], category: 'Texture'},
  { tocIndex: 191, hid: [5, 13], category: 'Texture'},
  { tocIndex: 192, hid: [5, 14], category: 'Texture'},
  { tocIndex: 193, hid: [5, 15], category: 'Texture'},
  { tocIndex: 194, hid: [5, 16], category: 'Texture'},
  { tocIndex: 195, hid: [5, 17], category: 'Texture'},
  { tocIndex: 196, hid: [5, 18], category: 'Texture'},
  { tocIndex: 197, hid: [5, 19], category: 'Texture'},
  { tocIndex: 198, hid: [5, 20], category: 'Texture'},
  { tocIndex: 199, hid: [5, 21], category: 'Texture'},
  { tocIndex: 200, hid: [5, 22], category: 'Texture'},
  { tocIndex: 201, hid: [5, 23], category: 'Texture'},
  { tocIndex: 206, hid: [5, 25], category: 'Script'},
  { tocIndex: 179, hid: [5, 26], category: 'Sound'},
  { tocIndex: 178, hid: [5, 27], category: 'Sound'},
  { tocIndex: 177, hid: [5, 28], category: 'Sound'},
  { tocIndex: 176, hid: [5, 29], category: 'Sound'},
  { tocIndex: 180, hid: [5, 30], category: 'Sound'},
  { tocIndex: 188, hid: [5, 31], category: 'Sound'},
];

export const DATACENTER_RANGES: readonly HeaderRangeEntry[] = [
  { start: 1206, end: 1511, hidPrefix: [5, 2, 0], category: 'Characters'},
  { start: 1511, end: 1682, hidPrefix: [5, 3, 0], category: 'Enemies'},
  { start: 1688, end: 1939, hidPrefix: [5, 4, 0], category: 'Equipment'},
  { start: 1939, end: 2126, hidPrefix: [5, 5, 0], category: 'Weapons'},
  { start: 2126, end: 2426, hidPrefix: [5, 6, 0], category: 'Map Assets'},
];
