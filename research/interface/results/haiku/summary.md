# Interface study: haiku

| format | calls | pass | valid | right ops | facts | untrimmed | slips | same ops | title sim | tokens in | tokens out | chars out | s/call | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cli | 45 | 82% | 91% | 100% | 97% | 96% | 47% | 100% | 0.78 | 931 | 1121 | 145 | 11.2 | 0.294 |
| json | 45 | 91% | 100% | 98% | 98% | 96% | 69% | 98% | 0.79 | 905 | 1219 | 163 | 12.5 | 0.315 |
| text | 45 | 96% | 100% | 98% | 99% | 96% | 0% | 98% | 0.69 | 888 | 1312 | 99 | 13.4 | 0.335 |
| xml | 45 | 84% | 100% | 91% | 98% | 98% | 0% | 98% | 0.73 | 920 | 1737 | 179 | 17.3 | 0.432 |

## Failures

- cli quotes-1: bash would expand "$3,900"; bash would expand "$4,500"; bash would expand "$5,200" (wrapped in a code fence)
- cli quotes-2: bash would expand "$3,900"; bash would expand "$4,500"; bash would expand "$5,200" (wrapped in a code fence)
- cli quotes-3: bash would expand "$3,900"; bash would expand "$4,500"; bash would expand "$5,200"
- cli countdown-2: facts 50%
- cli compress-3: facts 75%
- cli build-fail-2: unquoted "$" is special to bash
- cli shopping-1: 8 items, showing the first 6; facts 75%
- cli shopping-3: 8 items, showing the first 6; facts 75% (wrapped in a code fence)
- json notify-sent-3: ops: clear:task show:notify (wrapped in a code fence)
- json countdown-3: facts 50%
- json shopping-2: 8 items, showing the first 6; facts 75%
- json shopping-3: 8 items, showing the first 6; facts 75% (wrapped in a code fence)
- text notify-sent-2: title trimmed to 8 words / 37 characters: "Report finished sending to Sarah's…"; ops: clear:task show:notify
- text shopping-1: 8 items, showing the first 6; facts 75%
- xml trains-1: ops: show:agenda
- xml trains-2: ops: show:agenda
- xml trains-3: ops: show:agenda
- xml notify-sent-1: ops: clear:task show:notify
- xml compress-1: facts 75%
- xml shopping-2: facts 75%
- xml shopping-3: 8 items, showing the first 6; facts 75%
