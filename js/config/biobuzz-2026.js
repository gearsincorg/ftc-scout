// BIOBUZZ (FTC 2026-2027) scouting form.
// Point values from Competition Manual TU08, Table 10-2.
// Change this file each season; the app builds the form, QR records and
// team summaries from it. Keep field ids short: they go into every QR code.
//
// Field types:
//   counter  +/- count            (pts = points per count)
//   toggle   yes/no               (pts = points when yes)
//   choice   one of `options`     (stored as 1..n, 0 = not set; no default)
//   rating   1..max               (0 = not rated)
//   text     free notes
// A section with `tint` (auto | teleop | end) is drawn as a coloured region, its title in the
// region's border colour. Without it, the section is a plain card with its title.
// `pair: true` puts a toggle on the same row as the toggle before it (the row's toggles share it equally).
// `pts` feeds the per-robot point estimate. Fields without `pts` are tracked
// but don't add points. `foul` marks points given to the opponent.

export default {
  id: 'biobuzz-2026',
  game: 'BIOBUZZ',
  season: 2026, // FTC API / FTCScout season = kickoff year
  manual: 'Competition Manual TU08, Table 10-2',

  sections: [
    {
      id: 'auto', title: 'AUTO', tint: 'auto',
      fields: [
        { id: 'ao', type: 'counter', label: 'Pollen in Hive' },   // into the CELL; misses aren't recorded
        { id: 'an', type: 'counter', label: 'Nectar in Hive' },
        { id: 'at', type: 'counter', label: 'HIVE TIPS', pts: 20 },
        { id: 'al', type: 'toggle', label: 'LEAVE', pts: 3 },
        { id: 'ap', type: 'toggle', label: 'AUTO PARK', pts: 5, pair: true },
      ],
    },
    {
      id: 'teleop', title: 'TELEOP', tint: 'teleop',
      fields: [
        { id: 'to', type: 'counter', label: 'Pollen in Hive' },   // into the CELL; misses aren't recorded
        { id: 'tn', type: 'counter', label: 'Nectar in Hive' },
        { id: 'tt', type: 'counter', label: 'HIVE TIPS', pts: 20 },
      ],
    },
    {
      id: 'end', title: 'ENDGAME', tint: 'end',
      fields: [
        // 2 each only if the alliance owns the FLOWER (estimate)
        { id: 'eo', type: 'counter', label: 'Pollen in Flower', pts: 2 },
        { id: 'ec', type: 'counter', label: 'Nectar in Flower', pts: 2 },
        { id: 'ep', type: 'toggle', label: 'TELEOP PARK', pts: 5 },
      ],
    },
    {
      id: 'other', title: 'PERFORMANCE', sub: '',
      fields: [
        { id: 'pc', type: 'choice', label: 'Pollen Collecting', options: ['Slow', 'Avg.', 'Fast'] },
        { id: 'nc', type: 'choice', label: 'Nectar Collecting', options: ['Slow', 'Avg.', 'Fast'] },
        { id: 'df', type: 'choice', label: 'Defense played', options: ['Light', 'Heavy'] }, // 1 = Light (was Some), 2 = Heavy (old records' 0 = None reads as not set)
        { id: 'dr', type: 'rating', label: 'Driver skill', max: 5 },
        { id: 'ns', type: 'toggle', label: 'MIA' },
        { id: 'bd', type: 'toggle', label: 'Broke', pair: true },
        { id: 'tp', type: 'toggle', label: 'Tipped', pair: true },
        { id: 'fn', type: 'counter', label: 'MINOR FOULS', foul: 5 },
        { id: 'fj', type: 'counter', label: 'MAJOR FOULS', foul: 20 },
        { id: 'nt', type: 'text', label: 'Notes', max: 200 },
      ],
    },
  ],

  // Team summary columns. `fn(d, est)` gets one record's field values and its
  // point estimate per section. agg: avg | pct (share of matches) | sum | max.
  metrics: [
    { id: 'pts', label: 'Est pts', agg: 'avg', fn: (d, e) => e.total },
    { id: 'apts', label: 'Auto pts', agg: 'avg', fn: (d, e) => e.auto },
    { id: 'tpts', label: 'Tele pts', agg: 'avg', fn: (d, e) => e.teleop },
    { id: 'epts', label: 'End pts', agg: 'avg', fn: (d, e) => e.end },
    { id: 'tips', label: 'Tips', agg: 'avg', fn: d => (d.at || 0) + (d.tt || 0) },
    { id: 'lch', label: 'In Hive', agg: 'avg', fn: d => (d.ao || 0) + (d.an || 0) + (d.to || 0) + (d.tn || 0) },  // POLLEN + NECTAR into the CELL
    { id: 'lv', label: 'Leave', agg: 'pct', fn: d => !!d.al },
    { id: 'pk', label: 'Park', agg: 'pct', fn: d => !!d.ep },
    { id: 'drv', label: 'Driver', agg: 'avg', fn: d => d.dr || null },
    { id: 'brk', label: 'Broke', agg: 'sum', fn: d => (d.bd || d.ns ? 1 : 0) },
    { id: 'foul', label: 'Foul pts', agg: 'avg', fn: (d, e) => e.foul },
  ],
  defaultSort: 'pts',
};
