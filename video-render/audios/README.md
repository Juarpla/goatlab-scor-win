# audios/

One folder per match, named after the match id used by the media pack:

```
video-render/audios/<match-id>/<recording>.m4a
video-render/audios/tests/<fixture>.m4a
```

The CLI creates `video-render/audios/<match-id>/` when you render that match.
If the folder holds exactly one audio file, `--audio` can be omitted; if it
holds more than one, pass `--audio=<file>`.

`tests` is a reserved match id. `audios/tests/` holds the three versioned
fixtures used by `tests/audio-fixtures.test.js` and accepts no match recordings.

`contract/layout.js` defines these paths, and `pnpm video:layout` verifies the
tree. Match recordings are ignored by git; this file and `tests/` are tracked.
