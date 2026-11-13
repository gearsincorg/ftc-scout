// BIOBUZZ (FTC 2026-2027) scouting form.
// Point values from Competition Manual TU08, Table 10-2.
// Change this file each season; the app builds the form, QR records and
// team summaries from it. Keep field ids short: they go into every QR code.
//
// Field types:
//   counter  +/- count            (pts = points per count)
//   toggle   yes/no               (pts = points when yes)
//   choice   one of `options`     (value stored as option index)
//   rating   1..max               (0 = not rated)
//   text     free notes
// `pts` feeds the per-robot point estimate. Fields without `pts` are tracked
// but don't add points. `foul` marks points given to the opponent.

export default {
  id: 'biobuzz-2026',
  game: 'BIOBUZZ',
  season: 2026, // FTC API / FTCScout season = kickoff year
  manual: 'Competition Manual TU08, Table 10-2',

  sections: [
    {
      id: 'auto', title: 'AUTO', sub: '0:30, no drivers',
      fields: [
        { id: 'al', type: 'toggle', label: 'LEAVE', pts: 3 },
        { id: 'ac', type: 'counter', label: 'Launched into CELL' },
        { id: 'am', type: 'counter', label: 'Missed launches' },
        { id: 'at', type: 'counter', label: 'HIVE TIPS', pts: 20 },
        { id: 'ap', type: 'toggle', label: 'AUTO PARK', pts: 5 },
      ],
    },
    {
      id: 'teleop', title: 'TELEOP', sub: '2:00',
      fields: [
        { id: 'tc', type: 'counter', label: 'Launched into CELL' },
        { id: 'tm', type: 'counter', label: 'Missed launches' },
        { id: 'tt', type: 'counter', label: 'HIVE TIPS', pts: 20 },
        { id: 'tg', type: 'counter', label: 'Put in GARDEN', pts: 1 },
      ],
    },
    {
      id: 'end', title: 'ENDGAME', sub: 'last 1:00',
      fields: [
        { id: 'ef', type: 'counter', label: 'Placed in FLOWER', pts: 2 }, // 2 each only if the alliance owns it (estimate)
        { id: 'en', type: 'counter', label: 'Topped a FLOWER with NECTAR' },
        { id: 'ep', type: 'toggle', label: 'TELEOP PARK', pts: 5 },
      ],
    },
    {
      id: 'other', title: 'ROBOT & DRIVERS', sub: '',
      fields: [
        { id: 'df', type: 'choice', label: 'Defense played', options: ['None', 'Some', 'Heavy'] },
        { id: 'dr', type: 'rating', label: 'Driver skill', max: 5 },
        { id: 'ns', type: 'toggle', label: 'No show' },
        { id: 'bd', type: 'toggle', label: 'Broke down / stopped' },
        { id: 'tp', type: 'toggle', label: 'Tipped over' },
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
    { id: 'lch', label: 'Launches', agg: 'avg', fn: d => (d.ac || 0) + (d.tc || 0) },
    {
      id: 'acc', label: 'Accuracy', agg: 'avg', pct: true,
      fn: d => {
        const made = (d.ac || 0) + (d.tc || 0), tries = made + (d.am || 0) + (d.tm || 0);
        return tries ? made / tries : null; // null = skip this match in the average
      },
    },
    { id: 'lv', label: 'Leave', agg: 'pct', fn: d => !!d.al },
    { id: 'pk', label: 'Park', agg: 'pct', fn: d => !!d.ep },
    { id: 'drv', label: 'Driver', agg: 'avg', fn: d => d.dr || null },
    { id: 'brk', label: 'Broke', agg: 'sum', fn: d => (d.bd || d.ns ? 1 : 0) },
    { id: 'foul', label: 'Foul pts', agg: 'avg', fn: (d, e) => e.foul },
  ],
  defaultSort: 'pts',
};
