# Interface study: what should agents write to drive the glass?

Pilot run 7 Oct 2026. The question: which format should an agent write to put content on the glass, judged on
accuracy, consistency, speed, variety and token cost?

## Method

- **Formats** (`formats/`): A. shell commands (`mirror show …`, the current interface), B. a JSON array of operations,
  C. plain-text blocks (`info: Title` / `- item` / `progress: 50`), D. XML elements. Raw HTML and an MCP tool were
  left out of the pilot: HTML breaks principle 8 (semantic input only), and an MCP tool needs a different harness.
- **Same instructions for every format.** `core.md` (roles, limits, writing rules, ~260 tokens) plus a format section of
  156–258 characters. That section is the only difference between the system prompts.
- **15 requests** (`requests.json`) covering every role, multi-step operations (clear task, then notify), compression
  (8 findings into 6 items), an over-long list, and text that is awkward to quote (`$4,500`, `O'Neil`, `"<glass>"`, `&`).
- **Bare calls:** `claude -p` with the format doc as the whole system prompt, no tools, no MCP, and only project
  settings, run from a temp dir. This keeps the user's `CLAUDE.md` out, which would otherwise teach format A.
- **Graded by the real rules:** each output is parsed, then passed through `validate()` from `js/content.mjs`.
  - **pass:** parses cleanly, has the right operations, every fact present, nothing trimmed, and task markers and
    progress where needed.
  - **valid:** parses cleanly. For shell commands, anything bash would expand (`$3`, backticks) counts as invalid,
    because the real command would show different text.
  - **slips:** tolerated mistakes, such as a code fence or a stray line.
  - **same ops / title similarity:** agreement between the three runs of each request.
- **Runs:** Haiku, 15 requests × 4 formats × 3 runs = 180 calls. Opus, 5 of the harder requests × 4 formats × 1 run = 20 calls.
  API-equivalent cost: $1.38 for Haiku, $0.25 for Opus.

```sh
node run.mjs docs                                     # instruction size per format, no model calls
node run.mjs run --model haiku --runs 3 --jobs 6      # cached in results/<model>/; reruns skip finished calls
node run.mjs score --model haiku                      # writes results/<model>/summary.md
```

## Results

Haiku, 45 calls per format (`results/haiku/summary.md`):

| format | pass | valid | right ops | facts | slips | same ops | title sim | tokens in | chars out | s/call |
|---|---|---|---|---|---|---|---|---|---|---|
| shell | 82% | 91% | 100% | 97% | 47% | 100% | 0.78 | 931 | 145 | 11.2 |
| JSON | 91% | 100% | 98% | 98% | 69% | 98% | 0.79 | 905 | 163 | 12.5 |
| **plain text** | **96%** | **100%** | 98% | 99% | **0%** | 98% | 0.69 | **888** | **99** | 13.4 |
| XML | 84% | 100% | 91% | 98% | 0% | 98% | 0.73 | 920 | 179 | 17.3 |

Opus, 5 calls per format (`results/opus/summary.md`): every format parsed cleanly every time. Each one got the same
single request wrong (see below), and output lengths kept the same order: plain text 104 characters, JSON 157,
XML 166, shell 179.

## Findings

1. **Plain text was the most accurate on Haiku and the shortest on both models.**
   - It passed 96% of calls with no parse errors and no slips. Haiku wrapped JSON in a code fence 69% of the time,
     and shell commands 47%.
   - It wrote 30–45% fewer characters per update than the other formats. Every update pays that output cost.
2. **Shell commands fail on ordinary content.** In every run of the quotes request, Haiku wrote `"$3,900"` inside double
   quotes, so bash would put `,900` on the glass with no error. That's quiet corruption, the worst kind. Opus quoted
   correctly, so the risk grows as the model gets smaller, and smaller models are the ones you would use for frequent
   background updates.
3. **XML was the slowest and the least accurate at choosing a role.** It took 17 s per call on Haiku and used the most
   thinking tokens. In all 3 runs it put the train times in `agenda` rather than `info`.
4. **The format barely changes the context cost.** The format sections differ by about 25 tokens, and measured input
   ranged only 888–931 tokens. What costs context is the shared rules, and above all the 4.6 KB mirror `CLAUDE.md` that
   loads in every session (~1,100 tokens). The study's 260-token `core.md` covers the same rules.
5. **The format doesn't limit variety.** The recipe, comparison, forecast and countdown fitted every format equally.
   Failures came from content: 8 shopping items against a 6-item limit, or "19 Oct" rewritten as "October 19". A wider
   vocabulary needs new roles or components, not a different syntax.
6. **Consistency was similar everywhere.** The runs agreed on operations 98–100% of the time. Plain text had slightly
   less similar titles (0.69 against 0.78), which suggests looser wording rather than broken structure.

## Caveats

- This is a pilot: 45 calls per format on Haiku and only 5 on Opus. The 5–14 point gaps in pass rate between formats
  are suggestive, not proven.
- The "report sent" request is ambiguous. Every Opus run, and some Haiku runs, read it as a finished task (clear task,
  then notify), which `core.md` explicitly tells the model to do. That's a flaw in the test, not in any format.
- Facts are matched as exact strings, so correct rewordings ("October 19") count as misses. That affects every format
  equally.
- Haiku's thinking makes up most of its output tokens (1,100–1,700 against 100–180 characters of answer). Output cost on
  Haiku mostly reflects how hard the model found the format, not how long the answer is.

## Recommendation

Make plain text what agents write, and keep JSON as the internal contract (`validate()` input, server API, future
adapters). The plain-text parser (`parse.mjs` → `parseText`) is about 20 lines. Shell commands would then become a
thin wrapper (`mirror put` reading plain text on stdin, so no shell quoting), and the mirror `CLAUDE.md` could shrink
to something like `core.md` + `text.md`.
