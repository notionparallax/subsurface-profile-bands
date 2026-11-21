# Subsurface profile bands

An interactive prototype for the bands below the dive profile in [Subsurface](https://github.com/subsurface/subsurface): which can be shown together, in what order, and how much of the height they may take.

**Live page:** https://notionparallax.github.io/subsurface-profile-bands/

It supports two pieces of work:

- letting heart rate and the tissue heat map be shown at the same time (today the toolbar turns one off when the other is turned on), and
- a SAC trace, proposed in [subsurface#5136](https://github.com/subsurface/subsurface/issues/5136).

The page has a section for each decision, listing the options considered. Each option has a button that sets the prototype to it. Each view has its own URL, so a link shows exactly what someone is looking at.

## What is real and what is approximate

- **Data:** real Subsurface profile exports (`save_profiledata()`), converted by `tools/mkdata.py`. Dive 233 is the dive attached to [subsurface#5125](https://github.com/subsurface/subsurface/issues/5125). `test36.xml` is from Subsurface's test data and has heart rate. The "dive 233 + heart rate" option stretches test36's heart rate over dive 233; it is only there to show both traces together.
- **Layout:** band fractions and stacking follow `ProfileScene::updateAxes()` in `profile-widget/profilescene.cpp`. The height budget, the SAC band and the shared band are the proposals being tested.
- **Drawing:** colours and their grayscale twins follow `core/color.cpp`; the tissue colours port `colorScale()` from `profile-widget/divepercentageitem.cpp`. Everything else is a simplified drawing, not Subsurface's code.
- **SAC smoothing:** the page averages the exported momentary SAC (itself about a 1-minute window) over the chosen window. A real implementation would take the pressure drop over the window.

## Files

- `index.html`, `style.css`, `app.js`: the page.
- `decisions.js`: the questions, options, verdicts and reasons.
- `data.js`: generated dive data.
- `tools/mkdata.py`: converts Subsurface CSV profile exports into `data.js`.

No build step; open `index.html` in a browser.

## Licence

GPL-2.0, as Subsurface, since parts of the drawing are ported from Subsurface's code.
