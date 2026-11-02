# Audio fixtures

Three real narrations kept for pipeline tests. They live under `audios/` because
they are inputs, and `tests` is a reserved match id: no match recording belongs
here.

| File | Duration | Expected |
| --- | ---: | --- |
| `under-limit-a.m4a` | 38.2 s | accepted without speed-up |
| `under-limit-b.m4a` | 38.5 s | accepted without speed-up |
| `over-limit.m4a` | 76.8 s | rejected with `VOICE_TOO_LONG` |

`over-limit.m4a` is the concatenation of the other two. The voice budget is
53 s (`MAX_SECONDS` 55 − endcard 1 − two 0.5 s leads); with the 10 % cap on
speed-up, anything above 58.3 s must fail.
