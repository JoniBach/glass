# Interface study: opus

| format | calls | pass | valid | right ops | facts | untrimmed | slips | same ops | title sim | tokens in | tokens out | chars out | s/call | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cli | 5 | 80% | 100% | 80% | 100% | 100% | 60% | 0% | 0.00 | 1102 | 254 | 179 | 5.4 | 0.069 |
| json | 5 | 80% | 100% | 80% | 100% | 100% | 0% | 0% | 0.00 | 1071 | 195 | 157 | 4.2 | 0.062 |
| text | 5 | 80% | 100% | 80% | 100% | 100% | 0% | 0% | 0.00 | 1050 | 235 | 104 | 4.4 | 0.065 |
| xml | 5 | 80% | 100% | 80% | 100% | 100% | 0% | 0% | 0.00 | 1090 | 230 | 166 | 5.2 | 0.055 |

## Failures

- cli notify-sent-1: ops: clear:task show:notify
- json notify-sent-1: ops: clear:task show:notify
- text notify-sent-1: ops: clear:task show:notify
- xml notify-sent-1: ops: clear:task show:notify
