# Glass

A design system for displays behind a two-way mirror, built for the agents that write to them. Black is the
mirror; light is the only material; sizes come from viewing distance; content arrives as plain text by role, never as markup,
and is trimmed to fit before it reaches the glass.

Built inside a smart-mirror app and published from it as its own repo. Nothing here depends on the app. Paths below are
relative to this folder: run the scripts from here (`node scripts/test.mjs`) or with a `glass/` prefix from the app.

```
index.html              the living style guide (served at /glass/): generated from the tokens and schema
screen.html             the screen: renders a Glass link (#g=…) or a fixture (?fixture=rest|busy|alert|chart). Static, no requests
glass.css               everything in one import (tokens, base, layout, components)
css/tokens.css          generated from tokens/tokens.json: never edit by hand
js/content.mjs          content rules: clean, check and trim role content (server, tests, browser)
js/text.mjs             Glass text: the plain format agents write, parsed against the schema (§9)
js/state.mjs            screen state and apply(): text in, new state out. Pure, so it runs anywhere (Mac, API, page)
js/link.mjs             a whole screen state in a URL fragment: versioned, compressed, URL-safe
js/screen.mjs           the screen page's script: decode, render, clock, expiry, ticker
js/render.mjs           components as escaped markup, zone placement, fit policy, icons
js/chart.mjs            charts on any card (chart: line | bars, data, labels, series, unit): thin marks, brightness not colour
schema/roles.json       roles: zone, priority, lifetime, limits per field
fixtures/               Glass text with sample data and a frozen clock, for checks, snapshots and the style guide
tests/snapshots/        approved screenshots for scripts/visual.mjs
docs/principles.md      the research and the rules, each tied to a token, check or schema rule
docs/agent.md           Glass text reference for agents: generated, keep it loaded
docs/content.md         how to write for the glass
research/interface/     study: which format agents should write (harness, requests, raw results, write-up)
scripts/tokens.mjs      tokens.json -> tokens.css + tokens.resolved.json (type scale, measures)
scripts/check.mjs       headless render against the principles (exit 1 on failure)
scripts/guide.mjs       schema -> docs/agent.md (--check to verify)
scripts/test.mjs        unit tests for the content rules and Glass text
scripts/visual.mjs      screenshots compared with tests/snapshots (exit 1 on change; --update to approve)
scripts/lib/chrome.mjs  headless Chrome over the DevTools protocol, PNG decode: no dependencies
```

```sh
node scripts/tokens.mjs   # after editing tokens/tokens.json
node scripts/guide.mjs    # after editing schema/roles.json or the tokens
node scripts/test.mjs     # content rules, Glass text, state, links
node scripts/check.mjs    # renders the fixtures (and --live <link>) against the principles; --base <url of this folder>
node scripts/visual.mjs   # compares with the approved snapshots; --update after an intended change
```

The style guide is `index.html` (any static server: `python3 -m http.server`). Live: https://jonibach.github.io/glass/

## Screens, links and hosting

`screen.html` is static: it makes no requests beyond its own files. Everything on a screen travels in the link:

```
https://<host>/screen.html#g=1.<base64url(deflate-raw(JSON state))>
```

- **The fragment never reaches the host**, so a public host (GitHub Pages) serves identical files to every screen and
  never sees what is on any of them.
- **The `1.` prefix is the format version.** Links are bookmarked and shared, so newer pages must keep decoding old
  versions. A page that gets a newer version keeps its last good screen and shows a quiet status line.
- **Writers own the state; the page only displays it.** A writer runs `apply()` (`js/state.mjs`) on the current state
  and the new Glass text, then encodes the result (`js/link.mjs`). Setting only the fragment redraws the page without
  a reload. Layers carry their zone, priority and hours, so a page renders links written with a newer schema.
- **The page runs time itself:** the clock (in the state's time zone), expiry, `hours` windows and ticker rotation.
- **Data comes from providers, not the page:** weather and news are ordinary roles (`ambient` in the schema) that a
  provider script writes as Glass text.

Where state is stored and how a link reaches a screen belong to the app. The mirror keeps it in a file and delivers it
to its kiosk Chrome over DevTools. A hosted service would keep it in a database and push it, using the same `apply()`.

Deploying: publish this folder as a static site. `.github/workflows/pages.yml` does that on GitHub Pages after
running the tests.

New hardware: change `inputs` in `tokens/tokens.json` (pixel pitch, panel width, viewing distances) and rebuild.
Type sizes, line lengths and content limits follow.
