# Glass: principles

Glass is a design system for **content on a display behind a two-way mirror**, written for the agents (and people) who
put it there. Each principle below comes from physics, perception research or prior art, and each ends in something
enforceable: a **token**, a **check** (run against a render) or a **schema** rule (applied to content before it reaches the
glass). If a principle can't be enforced, it's advice, and it's marked as such.

Reference hardware for the numbers: a 15.6" IPS panel, 1080 × 1920 portrait, pixel pitch 0.179 mm, behind standard
two-way glass. Everything that depends on hardware is a token, so other builds change the inputs, not the rules.

---

## 1. Black is the mirror

A two-way mirror reflects most of the light from the room side and lets a fraction of the light from behind through.
Typical "vanity" two-way glass reflects about 70% and transmits about 25%; dielectric glass for bright rooms transmits
about 60% ([Two-way mirror catalogue](https://www.twowaymirrors.com/catalog/two-way-mirrors-catalog-2023.pdf)).
Where the panel shows black, the viewer sees a mirror. Where it lights up, content shows through the reflection.

- Light is the only material. There are no backgrounds, panels, boxes or fills; structure comes from type, spacing and
  hairlines.
- Through 25% glass, a 300-nit panel shows at about 75 nits, competing with the reflection of a lit room. Content needs
  near-full brightness to read; dim greys disappear.

| Enforced by | |
|---|---|
| token | `--gl-ground: #000` is the only background colour. There is no surface or elevation scale. |
| check | Any element with a non-black background larger than a hairline fails. |

## 2. Light leaks, so spend it sparingly

LCDs keep the backlight on to show black, leaking about 5–10 nits, so large lit areas and the panel's edge glow
show through as a grey slab. OLED reaches true black but suffers burn-in with static content
([OLED vs IPS](https://evezone.evetech.co.za/build-lab/oled-ips-contrast-numbers-are-worlds-apart);
[MagicMirror forum on backlight glow](https://forum.magicmirror.builders/post/84990)).

- Keep the **lit area** small: text and thin strokes, never filled shapes. A full white page is the worst case, which is
  why web pages are summarised rather than shown (`mirror read`).
- Static content burns into OLED and ages LCDs unevenly: anything permanent (the clock) should drift by a few pixels
  over the day.

| Enforced by | |
|---|---|
| check | **Lit-area budget:** pixels brighter than 10% luminance cover ≤ 8% of the screen at rest and ≤ 15% with every zone in use. |
| check | No filled rectangle larger than 2% of the screen. |
| token | `--gl-drift: 4px`, a slow position shift for long-lived elements (advice until implemented). |

## 3. Brightness tiers, not colours

Colour mostly survives the glass but loses saturation, and hue alone isn't readable at a glance. Glass uses
**luminance tiers** for hierarchy and keeps colour for meaning (one accent for "needs you").

- Three tiers: **primary** (white, what matters), **secondary** (light grey, context), **trace** (dark grey,
  decoration only: labels, rules, separators). The trace tier is nearly invisible through glass in a lit room, so
  nothing the reader needs may use it.
- One accent colour, used only by `alert` and urgent states.

| Enforced by | |
|---|---|
| token | `--gl-ink-1: #fff`, `--gl-ink-2: #b4b4b4`, `--gl-ink-3: #5c5c5c`, `--gl-accent`. |
| check | Readable text (titles, body, items) uses ink-1 or ink-2. Ink-3 is allowed only on labels and decoration. |

## 4. Type size comes from viewing distance

Legibility depends on the angle a character subtends at the eye: a capital height of **20 arcminutes** is reliably
legible and 16–18′ is the floor in good contrast ([sign legibility review](https://journals.shareok.org/ijsw/article/view/9);
[JP+ on sign legibility](https://www.jpplus.com/blog/i-can-see-clearly-now-sign-legibility)). TV "10-foot" guidance
reaches the same place from experience: 28 px minimum at 1080p, body text 28–36 px, never thin weights
([Fire TV guidelines](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)).

For the reference panel (cap height ≈ 0.70 em):

| distance | floor (16′) | comfortable (20′) |
|---|---|---|
| 0.75 m | 28 px | 35 px |
| 1 m | 37 px | 46 px |
| 1.5 m | 56 px | 69 px |
| 2 m | 74 px | 93 px |
| 3 m | 111 px | 139 px |

**Two reading distances.** A small mirror can't make everything readable from across the room. Content is either:

- **Room tier**, read at a glance from up to about 3 m: the clock, the temperature, an alert title, the one thing
  that matters right now. At least 139 px on the reference panel.
- **Near tier**, read standing at the mirror (≤ 1 m): cards, lists, headlines. At least 46 px for titles and 37 px for
  body text.

What this means for the current mirror: the clock (readable to 3.5 m) and the temperature (2.1 m) are fine. Card titles
work to 1 m, body text and headlines to 0.8 m, and labels only to 0.55 m. Body text should rise from 37 px towards
46 px, and labels may stay small only because they are decoration (see 3).

| Enforced by | |
|---|---|
| token | `--gl-distance-room: 3m`, `--gl-distance-near: 1m`, `--gl-pixel-pitch: 0.179mm`; the type scale is calculated from these, not set by hand. |
| check | Every readable text element meets the 16′ floor for its tier; titles meet 20′. |
| token | Weight floor 300 for room-tier figures, 400 for text. Thin weights alias through the glass. |

## 5. A glance is under two seconds

Driver distraction guidance limits a single glance away from the road to **2 seconds**, and a whole task to 12
([NHTSA visual-manual guidelines](https://www.nhtsa.gov/sites/nhtsa.gov/files/811781.pdf)). Research on smartwatch
reading puts a glance under one second, enough for a couple of words or numbers
([Gizmodo on glance reading](https://gizmodo.com/the-split-second-science-of-how-your-brain-reads-screen-1696186734)).
A mirror is read the same way: while brushing teeth or walking past.

- Every piece of content must work if only its title is read.
- Lists are short, lines are short, and figures come before words ("07:42 Platform 3", not "The next train is at…").

| Enforced by | |
|---|---|
| schema | `title` ≤ 6 words and ≤ 40 characters. |
| schema | `items` ≤ 6, each ≤ 60 characters. `body` ≤ 120 characters. |
| schema | Over the limit → the server trims and logs a warning (strict mode rejects instead). |

## 6. Stay in the periphery

Calm technology "informs but doesn't demand our focus", and moves between the periphery and the centre of attention
only when it must ([Weiser & Brown, via Wikipedia](https://en.wikipedia.org/wiki/Calm_technology)). Amber Case adds
that it "should require the smallest possible amount of attention" and "should work even when it fails".

- Motion is slow and quiet: cross-fades of 0.6–1 s, no bouncing, no blinking, no scrolling tickers.
- Only `alert` may grab attention, and it covers the screen because it is rare.
- **Failing calmly:** when a source fails, keep the last good value and mark its age. Never show an error page on the
  glass.

| Enforced by | |
|---|---|
| token | `--gl-fade: 800ms`, `--gl-rotate-min: 8s`; no animation shorter than 400 ms except alert onset. |
| check | No element moves continuously (marquee, spinner) for longer than 2 s at rest. |
| schema | Only role `alert` may use the full zone or the accent colour. |

## 7. The middle is the mirror

People use a mirror to see themselves, and the face lands in the upper-middle of the glass. MagicMirror², the
largest prior-art project, puts its regions around the edges (top bar, corners, upper and lower thirds, bottom bar)
and keeps `middle_center` mostly empty by convention
([MagicMirror² regions](https://forum.magicmirror.builders/post/49006)).

- Content lives in bands at the top and bottom. The centre stays clear unless an alert takes over.
- Each zone belongs to a **role** (agenda, focus, task, info, notify, alert), not a module. Agents choose a role, and
  the system decides where it goes and what wins.

- **Nothing is ever cut off.** When the glass is full, ambient content (the news line) gives way first; content someone
  asked for never clips.

| Enforced by | |
|---|---|
| check | **Fit:** no text extends past the edge of the screen, in any scenario. |
| token | Zones `top-left`, `top-right`, `upper`, `center` (reserved), `lower`, `ticker`, `bottom`, `full`. |
| check | At rest, nothing lit inside the centre 40% of the height. |
| schema | Content arrives with a `role`; positions are never set by the caller. |

## 8. Written for agents

Most content on this glass is written by an LLM, at any time, without a designer checking. Glass treats that as its
main use case, not an afterthought.

- **Content rules are machine rules.** Each role has a JSON schema; the server validates, trims and logs. An agent
  cannot break the layout by writing too much.
- **Semantic, not visual, input.** Agents write roles and fields (§9), never HTML or CSS.
- **A render check after every change.** Changes to the page are verified by a headless render against the checks
  above, because the real glass often can't be captured (locked session).
- **Untrusted text stays text.** Content from the web is escaped and summarised by a tool-less model; it never becomes
  markup or instructions.

| Enforced by | |
|---|---|
| schema | One schema per role in `glass/schema/`, shared by the server and the docs. |
| check | `glass check` renders the fixtures and the live link and runs checks 1–7. |

## 9. Agents write plain text

The format agents write is part of the design system: it decides how often updates arrive wrong, and what every
update costs. Glass measured it rather than assuming (`research/interface/`). Across 180 Haiku calls, plain-text
blocks passed 96%, against 91% for JSON, 84% for XML and 82% for shell commands. They were also 30–45% shorter than
the others on Haiku and Opus. Shell commands quietly corrupted text: Haiku wrote `"$3,900"` in double quotes, which
bash turns into `,900`.

- **One plain format for writing, JSON underneath.** Agents write Glass text (`role: title`, `- item`, `field: value`).
  It compiles to the JSON operations the validator checks, which stay the contract for servers and future surfaces.
- **No escaping.** Nothing in Glass text is special apart from the start of a line, so `$`, quotes, `&` and `<` are
  just text. Agents pipe it to the app through a quoted heredoc or an API body, never through shell arguments.
- **The schema is the grammar.** Field names come from each role's schema, so a new field or role can be written as
  soon as it is in `schema/roles.json`, with no parser change. Lines the schema doesn't recognise are text, not
  errors, so older content keeps working.
- **The rules cost context, not the syntax.** The format sections differed by about 25 tokens. The agent reference
  (`docs/agent.md`) is generated from the schema, short enough to load into every session, and can't drift.
- **All or nothing.** A multi-block update is parsed and validated in full before anything changes on the glass.

| Enforced by | |
|---|---|
| schema | `js/text.mjs` reads field names from `schema/roles.json`; the server applies updates all or nothing. |
| check | `scripts/test.mjs`: parser cases, a schema-extension case, a round trip, and `docs/agent.md` matching the schema. |

---

## What's still advice

- Pixel drift (2) until it's implemented.
- Choice of panel: VA or OLED gives deeper black than IPS; OLED needs drift and dimming against burn-in.
- Room lighting: a brighter room needs brighter content or higher-transmission glass. Glass can't measure this.

## Sources

- [Two-way mirror catalogue: transmission and reflection figures](https://www.twowaymirrors.com/catalog/two-way-mirrors-catalog-2023.pdf)
- [OLED vs IPS contrast and black level](https://evezone.evetech.co.za/build-lab/oled-ips-contrast-numbers-are-worlds-apart)
- [MagicMirror forum: backlight glow through the mirror](https://forum.magicmirror.builders/post/84990)
- [Factors affecting sign legibility: review](https://journals.shareok.org/ijsw/article/view/9)
- [JP+: sign legibility](https://www.jpplus.com/blog/i-can-see-clearly-now-sign-legibility)
- [Amazon Fire TV design guidelines](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)
- [NHTSA visual-manual driver distraction guidelines](https://www.nhtsa.gov/sites/nhtsa.gov/files/811781.pdf)
- [Glanceable reading research](https://gizmodo.com/the-split-second-science-of-how-your-brain-reads-screen-1696186734)
- [Calm technology](https://en.wikipedia.org/wiki/Calm_technology)
- [MagicMirror² regions](https://forum.magicmirror.builders/post/49006)
