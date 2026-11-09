# Agnes shared state

The admission authority lives in `app-states/goatlab/agnes-state.json`, through the direct R2 S3 API. The bucket must be private, Standard, with `r2.dev` disabled and no public domain. GoatLab reuses the media S3 credentials for this private bucket. The client only operates on that object. Actions queries R2 directly; this persistence does not need Fly to be running.

Every POST requires a new reservation confirmed by a conditional write of the
JSON. A PUT timeout never grants permission. The same attempt or slot already
consumed keeps its lock after deleting SQLite, restarting or changing the
prompts. A demonstrated 429 without an identifier returns the reservation once;
a timeout, 5xx or result with an identifier keeps it. The reservation uses its
original UTC day, even if the download finishes the next day.

The Python adapter calls the Node client through JSON over stdin/stdout.
SQLite is temporary and rebuilt on each run from R2. The authority stores hashes,
recovery identifiers, reservations and claims; public reports are sanitized
projections. `public/data/agnes-quota.json` keeps maxima for observation and
never authorizes requests or reconstructs a lost record.

## Configuration

Configure the same existing keys in both consumers: `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` and `R2_ACCOUNT_ID` (or `CLOUDFLARE_ACCOUNT_ID`), with
access to the public media bucket and the private `app-states` bucket. The state
bucket and its object remain fixed regardless of `R2_BUCKET`.

The following values allow an optional separate credential:

```text
R2_STATE_ACCOUNT_ID
R2_STATE_BUCKET=app-states
R2_STATE_KEY=goatlab/agnes-state.json
R2_STATE_ACCESS_KEY_ID
R2_STATE_SECRET_ACCESS_KEY
```

Store the account ID and credentials in Actions and Fly secrets. By project
decision, the keys are shared between media and state. If an
`R2_STATE_ACCESS_KEY_ID`/`R2_STATE_SECRET_ACCESS_KEY` pair is configured, both
values are mandatory: the client never mixes a key from that pair with a media
key. R2 permissions are scoped by bucket; a folder does not restrict the token.
Other keys will be issued for another project.

## Coordinated cutover

1. Suspend old Actions and Fly producers and finish active work.
2. Create or verify the private bucket and access with the existing secrets.
3. Obtain a copy of the Fly SQLite and keep it outside Git. Also inventory
   existing artifacts and resources in R2 before enabling generation.
4. Prepare the seed without writing to R2:

   ```sh
   node scripts/bootstrap-agnes-state.mjs --sqlite=/path/agnes.sqlite --out=.cache/agnes-seed.json
   ```

   `--sqlite` and `--snapshot` can be repeated to include additional evidence.
   Normal output contains only quantities. The private seed keeps known tasks and
   locks the remaining slots of the legacy set. The cutover day totals are kept as
   a historical estimate; they do not block requests.

5. With the secrets loaded in the environment, explicitly create the record:

   ```sh
   node scripts/agnes-state.mjs bootstrap < .cache/agnes-seed.json
   ```

   Use `If-None-Match: *`. If it exists or the response is uncertain, stop the
   cutover and read/verify the existing object. The runtime never creates an empty
   JSON.

6. Run the real concurrency test on a disposable object:

   ```sh
   node scripts/check-agnes-r2-cas.mjs --run
   ```

   It must confirm one winner and an HTTP 412 with the same ETag, and delete the
   test object. Also run the admission tests with both clients.
7. Enable the new producers only after verifying the record and coordination.
   Keep the migration copies private.

Duplicate protection starts at this cutover. A list of successful results does
not prove that a slot without a result is available: an accepted request whose
identifier was lost remains locked and may leave the bank partial.

## Recovery

Missing, incompatible, corrupt or inaccessible state closes new generations.
Known tasks are recovered through GET with the same identifier, with 60-second
query permissions and persisted `Retry-After`. Producers renew activity every 30
seconds, with a 120-second expiry.

For rollback, stop new generations and keep the private JSON. Published resources
can continue to be reused. Repair and verify the authority before reactivating;
never delete the record or replace it with an empty quota. Pruning claims and
incomplete uploads require confirmation, keeping the resource pending until its
publication in R2 is verified.

References: [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/),
[consistency](https://developers.cloudflare.com/r2/reference/consistency/) and
[public access](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Media operation

The full update runs at 01:05 Lima; the three media retries at 02:15, 04:15 and
06:15. The scoreline refresh keeps `17 */6` UTC. Each run has 4,200,000 ms by
default (`MEDIA_RUN_BUDGET_MS`) and each match is additionally limited to kickoff
+ 24 h. The remaining run time is split evenly across the matches that still
lack a complete bank, so one bank cannot consume every match's turn; unused
slices roll forward.
The workflow job timeout is 90 min, leaving margin for setup and publication.
`TOP_MAX_AGE_HOURS` is seven by default and accepts zero. `--match` only skips the
age lock.

`node actions/3-media-creation/check-media-complete.mjs` checks public evidence
without Agnes, downloads or HEAD. A complete v2 bank requires four photos and the
clips of the active mode to be distinct, plus identity, fingerprint and verified
storage. Manual modes can check their subset without declaring a bank complete
when it lacks the resources required by the mode. Maintenance keeps running even
when no eligible matches remain.

Actions continues from the objects in `partidos/<id>/` and the private JSON. A
resource is ready only after verifying name, size, checksum and identity in R2.
`completed` means Agnes finished; `uploadClaim.confirmed` records publication,
with `objectKey` and `sizeBytes`. Previous records are completed when their
objects are verified. After a PUT, a HEAD is done before confirming state and
deleting the resource's temporary files. Manifests and clip references include
only verified resources.

New attempts store `diagnostics` in private state: up to eight compact events per
attempt and a query counter. Creation, last query, interruption and publication
are kept; messages up to 256 characters without prompts, binaries, credentials or
signed URLs. Every real request appears in logs with method, stage and HTTP;
repeated queries update their last persisted record. A diagnostics failure does
not grant permissions, return quota or repeat a POST. The summary separates the
active-mode resources from the request history, including successes, R2 reuse
without Agnes calls and previous history with its originating run. Previous
attempts without diagnostics show «original detail not kept»; they are not
reconstructed from historical logs.

Active tasks with `video_id` are queried before creating others, even if they are
outside the top; this phase only recovers and publishes, with up to 60 seconds per
match inside the global budget. GitHub keeps logs and JSON reports, without media
caches or artifacts between runs. If a consumed generation lost its result before
reaching R2 and has no recoverable identifier, the lock is reported and its
consumption is kept. A failed local cleanup does not repeat the generation.

Terminal evidence in `finished-at.json` governs content pruning. Scorelines,
kickoff and first detection must be valid; the exact one-hour boundary keeps the
match. A correction to NS/LIVE/PST invalidates the anchor. Media first claims the
shared close and deletes the exact R2 prefix, with a trailing `/`; only a confirmed
remote success authorizes local deletion and publication. Results and historical
evaluation are outside this maintenance.

## Identity and publication names

Provider IDs (`fd-*`, `af-*`, `bz-*`) still identify fixtures, but they are not
admitted locations for new generations or publications. The catalog resolves
provider team IDs inside the competition first; aliases must have a single owner.
An ambiguous identity stops publication until the catalog is fixed.

`ordinal` keeps the identity of the internal position and of previous requests;
it does not limit the cumulative number of POSTs. The optional private field
`publicationIndex` assigns a publication position through CAS: `clip-1.mp4`,
`clip-2.mp4` and, in the test, `clip-3.mp4`. The R2 metadata `attemptordinal`,
`attemptid` and `publicationindex` let both concepts be verified without changing
the public bank. The assignment survives PUT, HEAD or restart failures and does
not consume quota.

## Per-resource and per-run retries

Private state supports versions 1 and 2. Version 2 keeps a single operational
state in `resources`: `pendiente`, `generando`, `publicando` or `listo`. Only R2
verification allows `listo`. Provider states remain as evidence inside the
attempts, together with their compact diagnostics.

Each run grants up to three POSTs per pending image and per pending clip. The
counter exists only in the producer's memory; no cumulative counter is stored in
R2. History and previous totals are not deleted or reset. Daily totals are
informational: there is no local preventive daily limit. Agnes decides quota
availability; its responses are shown with the real HTTP, code and message,
without inferring daily exhaustion from a 402. `renew-resource` archives the
original identity before renewing a position verified as absent, through CAS; an
active task with an ID must be recovered. A 503 stops that resource for the run
and allows the others to continue. Another run again has three attempts. GET, PUT
and HEAD do not spend a POST.

`pending`, `queued` and `in_progress` keep the ID and are queried with pauses of
15, 40 and 75 seconds, and then 90 seconds between queries; 429 respects
Retry-After if it requires a longer wait. Video generation admits a bounded
window of in-flight tasks (`AGNES_VIDEO_CONCURRENCY`, default 1, maximum 4)
counted across all matches in the private state. The producer starts the window
before polling and retrieves the tasks in publication order; an existing pending
task counts toward the window. The window does not change the 12.1-second
creation pace or the per-resource POST limit. Repeated responses appear in logs
and are compacted into state. Diagnostic events older than 48 hours are shed
during compaction, the same window as failureEvents and summaries; attempt and
slot identities still follow the seven-day window. All of it remains subject to
the 2 MB limit. Temporary files are
deleted after confirmed publication and at job completion.

The run report distinguishes `complete`, `deferred` and `error`. A 503/429 from
the current run, an accepted task still active or a clip blocked by it leave
resources pending with exit code 0. Resources still require R2 verification to
count as ready. R2, identity, private state, HTTP 402/401 and unidentified causes
keep code 2; they take priority even if other resources were deferred. A
historical rejection does not justify the current run result. Selective
publication includes complete banks and finished partial banks with at least one
usable resource; a partial bank is never certified as complete and remains
pending for generation.

The effective TokenPlan key pace is 80 creations/minute for 2K images and one
video creation every 12.1 seconds (maximum five/minute). The old values 12 and
30.1 seconds are migrated through CAS without resetting tasks, registered quota or
Retry-After dates. A deferred admission identifies the local control, the next
allowed date and the wait; it does not represent an HTTP response. Pace
omissions and active tasks are reported as pending, with code 0; a real R2 or
state failure still produces code 2.

## Animation with a fixed instruction

New videos use `video-animation.json`: one image as `first_frame`, `keyframe` mode
and the phrase «Animate this image with fast, precise, hyperrealistic
movements.». No Video Prompts documents are produced or consumed. The copy of the
configuration in the skill is verified with `sync-goatlab-skill.mjs --check`.
The bank offers four images and four six-second clips. The `clips` target in
`src/lib/montage-experiment.json` is independent of editorial direction: freedom
allows any combination of media and graphics. The schema supports the four
publication positions; changing the mode preserves banks, reservations and the
private R2 history. Banks with two or three clips remain usable as partials, and
Actions generates only the missing clips.

The v3 fingerprint depends on the images, the match identity and the fixed
configuration. Previous banks are revalidated from R2 before publishing that
fingerprint. Existing clips and accepted tasks keep the promptHash and
referenceHash of their original reservation; changing the instruction does not
grant another reservation or invalidate a confirmed clip. The reader validates
the checksum, the model, the reference to a retained photo and the publication
metadata without requiring the retired text.

Agnes can return 720×1260 even with `aspect_ratio=9:16`. The adapter preserves
the proportions and adds margins to deliver the bank's 720×1280 canvas; it does
not stretch the image. Normalization and download use the same time budget.
