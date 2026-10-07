# Writing for Glass

For agents and people putting content on the glass. Agents write Glass text (`docs/agent.md`, generated from the
schema; principles §9):

```
task: Booking dentist
x Found slots
> Choosing a time
progress: 50
```

The server enforces these limits (`js/content.mjs`): content
over a limit is trimmed at a word boundary with "…" and the response lists what changed in `warnings`. With
`glass.strict` set in config, the request is rejected instead. Write within the limits and nothing is trimmed.

## Pick the role, not the place

| role | for | fields |
|---|---|---|
| `agenda` | today's plan, mornings only | title, body, items |
| `focus` | a standing note the person asked to keep up | title, body, items |
| `task` | what you're doing now: steps and progress | title, body, items, progress |
| `info` | an answer or summary the person asked to see | title, body, items |
| `notify` | one short line: something finished | title |
| `alert` | needs attention now; covers everything | title, body |

## Limits (reference panel)

Line lengths come from the type size and width (`tokens.resolved.json` → `measure`), so other panels get other numbers.

| field | limit |
|---|---|
| card title | 6 words, one line (36 characters) |
| card body | 3 lines (132 characters) |
| items | up to 6, one line each (41 characters) |
| notify | 8 words, one line (37 characters) |
| alert title | 4 words, 2 lines (30 characters) |
| alert body | 2 lines (74 characters) |

## How to write it

- **The title is the message.** Most glances read only the title. "Train at 07:42", not "Train times".
- **Figures first.** "07:42 Platform 3", "£4,500 fine", "3 slots left".
- **One fact per item.** No full sentences, no trailing full stops.
- **Plain text.** Markdown, bullets and emoji are stripped or look wrong through glass.
- **Task steps:** prefix `x ` for done and `> ` for the current step; update `progress` (0–100) as you go, and clear
  the task when finished, followed by a `notify`.
- **Alerts are rare.** Use one only when the person must act now, and clear it once they have.
