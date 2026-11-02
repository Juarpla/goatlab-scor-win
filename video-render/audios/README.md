# audios/

One folder per match, named after the match id used by the media pack:

```
video-render/audios/<match-id>/<recording>.m4a
```

The CLI creates `video-render/audios/<match-id>/` when you render that match.
If the folder holds exactly one audio file, `--audio` can be omitted; if it
holds more than one, pass `--audio=<file>`.

Audio content is ignored by git; only this file is tracked.
