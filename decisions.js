// The questions, the options considered, and (once decided) the verdict and reason.
// verdict: 'open' | 'chosen' | 'rejected'. 'show' is applied on top of the current settings.
const DECISIONS = [
  {
    id: 'fence',
    question: 'How do heart rate and the tissue heat map share the space below the profile?',
    why: 'Since 2018 the toolbar turns one off when the other is turned on (cfd4c4282). Then the two bands were drawn at fixed, overlapping positions. Since 2021 (d0beae59f) bands stack, so the overlap can no longer happen.',
    options: [
      { label: 'Either/or, as today', show: { fence: 'exclusive', bands: { hr: true, tissues: false } }, verdict: 'open', reason: '' },
      { label: 'Stack every band, no limit', show: { fence: 'stack' }, verdict: 'open', reason: '' },
      { label: 'Stack, within a height budget', show: { fence: 'budget' }, verdict: 'open', reason: '' },
    ],
  },
  {
    id: 'order',
    question: 'In what order are the bands stacked?',
    why: 'The order should be fixed, so that bands do not move when another is toggled, and should follow a rule that tells future bands where they go.',
    options: [
      { label: 'Today: heart rate lowest, then tissues, pp gases, temperature', show: { order: 'today' }, verdict: 'open', reason: '' },
      { label: 'By subject: gas and deco lowest (tissues, pp gases), then the diver (SAC, heart rate), then temperature', show: { order: 'subject' }, verdict: 'open', reason: '' },
      { label: 'SAC next to the profile, where the pressure lines are', show: { order: 'sacNearProfile' }, verdict: 'open', reason: '' },
    ],
  },
  {
    id: 'pairing',
    question: 'Do SAC and heart rate get a band each, or share one?',
    why: 'Both describe the diver rather than the gas, and few dive computers record heart rate. Sharing saves a band, but puts two scales in one band.',
    options: [
      { label: 'A band each, both scales on the left', show: { pairing: 'separate' }, verdict: 'open', reason: '' },
      { label: 'One band: SAC on the left, heart rate on the right', show: { pairing: 'shared' }, verdict: 'open', reason: '' },
    ],
  },
  {
    id: 'oneside',
    question: 'In a shared band with only one trace, which side is its scale on?',
    why: 'A dive without heart rate, or with SAC turned off, leaves half of a shared band empty.',
    options: [
      { label: 'Sides never move: heart rate stays on the right', show: { pairing: 'shared', oneSide: 'fixed', bands: { sac: false, hr: true } }, verdict: 'open', reason: '' },
      { label: 'A lone trace moves its scale to the left', show: { pairing: 'shared', oneSide: 'left', bands: { sac: false, hr: true } }, verdict: 'open', reason: '' },
    ],
  },
  {
    id: 'window',
    question: 'How wide is the SAC smoothing window?',
    why: 'Shearwater transmitters report in 0.138 bar steps, so a short window is noisy. mikeller prefers a fixed width that users can understand. The momentary SAC today uses about 1 minute.',
    options: [
      { label: '30 s', show: { sacWindow: 30 }, verdict: 'open', reason: '' },
      { label: '1 min (about today)', show: { sacWindow: 60 }, verdict: 'open', reason: '' },
      { label: '90 s', show: { sacWindow: 90 }, verdict: 'open', reason: '' },
      { label: '2 min', show: { sacWindow: 120 }, verdict: 'open', reason: '' },
    ],
  },
  {
    id: 'scale',
    question: 'What range does the SAC scale cover?',
    why: 'Descents read high (cold water shrinks the tank pressure while the diver works hardest), so one spike can flatten the rest of the trace.',
    options: [
      { label: '0 to the highest value', show: { sacScale: 'max' }, verdict: 'open', reason: '' },
      { label: '0 to mean + N standard deviations, spikes clipped', show: { sacScale: 'sd' }, verdict: 'open', reason: '' },
      { label: '0 to a percentile, spikes clipped', show: { sacScale: 'pct' }, verdict: 'open', reason: '' },
    ],
  },
  {
    id: 'gray',
    question: 'How are two traces in one band told apart in a grayscale print?',
    why: 'Each profile colour has a grayscale twin in core/color.cpp, mostly black with some transparency, and the printed image is then converted to gray. Nothing uses dashes or patterns today.',
    options: [
      { label: 'Grayscale palette as today', show: { grayscale: true, dashShared: false, pairing: 'shared' }, verdict: 'open', reason: '' },
      { label: 'Dash the right-hand trace', show: { grayscale: true, dashShared: true, pairing: 'shared' }, verdict: 'open', reason: '' },
    ],
  },
];
