// The questions, the options considered, and (once decided) the verdict and reason.
// verdict: 'open' | 'chosen' | 'rejected'. 'show' is applied on top of the current settings.
const DECISIONS = [
  {
    id: 'fence',
    question: 'How do heart rate and the tissue heat map share the space below the profile?',
    why: 'Since 2018 the toolbar turns one off when the other is turned on (cfd4c4282). Then the two bands were drawn at fixed, overlapping positions. Since 2021 (d0beae59f) bands stack, so the overlap can no longer happen.',
    options: [
      { label: 'Either/or, as today', show: { fence: 'exclusive', bands: { hr: true, tissues: false } }, verdict: 'rejected', reason: 'The overlap it prevented went away when bands started to stack, and it stops a diver with heart rate data from seeing the tissue heat map.' },
      { label: 'Stack every band, no limit', show: { fence: 'stack' }, verdict: 'rejected', reason: 'With every band on, the profile gets about half of the height (43% with a band each for SAC and heart rate), and in a print box it becomes hard to read.' },
      { label: 'Stack, within a height budget', show: { fence: 'budget' }, verdict: 'chosen', reason: 'Bands keep their proportions to each other, and the profile always keeps most of the height. 40% looks right at every size tried, including the print size.' },
    ],
  },
  {
    id: 'order',
    question: 'In what order are the bands stacked?',
    why: 'The order should be fixed, so that bands do not move when another is toggled, and should follow a rule that tells future bands where they go.',
    options: [
      { label: 'Today: heart rate lowest, then tissues, pp gases, temperature', show: { order: 'today' }, verdict: 'rejected', reason: 'It has no rule behind it, so it does not say where a new band goes, and it puts heart rate between the tank bar and the tissues, which both concern the gas.' },
      { label: 'By subject: gas and deco lowest (tissues, pp gases), then the diver (SAC, heart rate), then temperature', show: { order: 'subject' }, verdict: 'chosen', reason: 'The tank bar shows which gas is breathed, and the tissues and partial pressures show its effect, so they sit together. What describes the diver comes next, and temperature stays next to the profile, as today.' },
      { label: 'SAC next to the profile, where the pressure lines are', show: { order: 'sacNearProfile' }, verdict: 'rejected', reason: 'The pressure lines are drawn across the middle of the profile, so being next to the profile does not bring SAC closer to them, and it separates SAC from heart rate.' },
    ],
  },
  {
    id: 'pairing',
    question: 'Do SAC and heart rate get a band each, or share one?',
    why: 'Both describe the diver rather than the gas, and few dive computers record heart rate. Sharing saves a band, but puts two scales in one band.',
    options: [
      { label: 'A band each, both scales on the left', show: { pairing: 'separate' }, verdict: 'rejected', reason: 'It costs a band for heart rate, which few dive computers record.' },
      { label: 'One band: SAC on the left, heart rate on the right', show: { pairing: 'shared' }, verdict: 'chosen', reason: 'Both describe the diver, and sharing saves a band. Heart rate goes on the right because fewer divers have it.' },
    ],
  },
  {
    id: 'grid',
    question: 'In a shared band, whose grid lines are drawn?',
    why: 'Two independent scales each want their own grid lines, and the two sets compete. SAC is the main trace, so its scale can own the grid and heart rate can label the same lines.',
    options: [
      { label: 'Each scale has its own grid lines', show: { pairing: 'shared', secondaryTicks: 'own', bands: { sac: true, hr: true } }, verdict: 'rejected', reason: 'Two interleaved sets of grid lines compete for attention.' },
      { label: 'SAC owns the grid; heart rate labels its lines with whatever value falls there', show: { pairing: 'shared', secondaryTicks: 'labels', bands: { sac: true, hr: true } }, verdict: 'rejected', reason: 'One set of lines, but labels such as 96 and 113 are hard to read between.' },
      { label: 'SAC owns the grid; the heart rate range is chosen so its labels on those lines are round numbers', show: { pairing: 'shared', secondaryTicks: 'aligned', bands: { sac: true, hr: true } }, verdict: 'chosen', reason: 'One set of lines with round labels on both sides. The cost: the top of the SAC scale is rounded up to a grid line, and the heart rate range is set by those lines rather than by its own data.' },
    ],
  },
  {
    id: 'oneside',
    question: 'In a shared band with only one trace, which side is its scale on?',
    why: 'A dive without heart rate, or with SAC turned off, leaves half of a shared band empty.',
    options: [
      { label: 'Sides never move: heart rate stays on the right', show: { pairing: 'shared', oneSide: 'fixed', bands: { sac: false, hr: true } }, verdict: 'chosen', reason: 'A scale is always where the diver learned to look for it.' },
      { label: 'A lone trace moves its scale to the left', show: { pairing: 'shared', oneSide: 'left', bands: { sac: false, hr: true } }, verdict: 'rejected', reason: 'Heart rate would change sides from one dive to the next.' },
    ],
  },
  {
    id: 'window',
    question: 'How wide is the SAC smoothing window?',
    why: 'Shearwater transmitters report in 0.138 bar steps, so a short window is noisy. mikeller prefers a fixed width that users can understand. The momentary SAC today uses about 1 minute.',
    options: [
      { label: '30 s', show: { sacWindow: 30 }, verdict: 'chosen', reason: 'Keeps short events, such as hard finning or a gas-sharing drill, that wider windows flatten. On a 112-minute sidemount dive the spread only narrows a little from 30 s to 1 min (5th to 95th percentile 12.9 to 28.1 against 13.6 to 26.9 l/min; see #5136). This page smooths the exported SAC, which already spans about a minute, so a real 30 s window is noisier than shown here.' },
      { label: '1 min (about today)', show: { sacWindow: 60 }, verdict: 'rejected', reason: 'Little smoother than 30 s, at the cost of detail.' },
      { label: '90 s', show: { sacWindow: 90 }, verdict: 'rejected', reason: 'Smoother, but short events are flattened.' },
      { label: '2 min', show: { sacWindow: 120 }, verdict: 'rejected', reason: 'Removes most of the jitter, but also flattens the descent and short events.' },
    ],
  },
  {
    id: 'scale',
    question: 'What range does the SAC scale cover?',
    why: 'Descents read high (cold water shrinks the tank pressure while the diver works hardest), so one spike can flatten the rest of the trace.',
    options: [
      { label: '0 to the highest value', show: { sacScale: 'max' }, verdict: 'rejected', reason: 'A descent spike sets the scale and squashes the rest of the dive into the bottom of the band.' },
      { label: '0 to mean + N standard deviations, spikes clipped', show: { sacScale: 'sd', sacN: 2 }, verdict: 'chosen', reason: 'With N = 2, the descent spikes are clipped (and marked) and the rest of the dive uses the band. The limit follows the spread of each dive.' },
      { label: '0 to a percentile, spikes clipped', show: { sacScale: 'pct' }, verdict: 'rejected', reason: 'Gives a similar result, but the right percentile depends on how much of the dive is descent. Kept as the fallback if the standard deviation proves too sensitive to long descents.' },
    ],
  },
  {
    id: 'gray',
    question: 'How are two traces in one band told apart in a grayscale print?',
    why: 'Each profile colour has a grayscale twin in core/color.cpp, mostly black with some transparency, and the printed image is then converted to gray. Nothing uses dashes or patterns today.',
    options: [
      { label: 'Grayscale palette as today', show: { grayscale: true, dashShared: false, pairing: 'shared' }, verdict: 'rejected', reason: 'Both traces print as black lines and cannot be told apart.' },
      { label: 'Dash the right-hand trace', show: { grayscale: true, dashShared: true, pairing: 'shared' }, verdict: 'chosen', reason: 'Tells the traces apart in any print. It would be the first dashed line in the profile.' },
    ],
  },
];
