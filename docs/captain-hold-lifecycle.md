# Captain-hold lifecycle mechanism

The normative policy is owned by `.agents/skills/captain-hold-lifecycle/SKILL.md` and is not restated here.
This document records the deterministic mechanism, structured surfaces, compatibility contract, and privacy-safe regression evidence.

## Mechanism

A decision is not a separate thing in this system: it is an ordinary backlog task held for the captain, and the task id is the identity every surface and channel uses.
`bin/fm-captain-hold.sh` is the only lifecycle command layered on that primitive.
The command addresses the active home's configured data directory the same way `bin/fm-backlog-transition-lib.sh` addresses every backlog transition, so the existing backlog remains the only durable work database and a secondmate-owned captain call stays in the secondmate home.
It never reads report bodies, review artifacts, terminal output, or chat.

The `hold` subcommand places an existing task under an active captain hold, or creates the task when nothing exists to hold, then verifies the hold through `tasks-axi hold <id> --reason <reason> --kind captain`.
Repeats are idempotent, a closed task is refused rather than reopened, and `--until` stores the captain's own deferral date through tasks-axi's date gate.
Only a hold that opens a new gate mints a new occurrence: it stamps the occurrence it publishes to the parent channel as a private record under `state/captain-hold-occurrence/`, and the answer that closes that gate writes back which occurrence settled, which is what later tells an interrupted close apart from a new gate on the same row.
A hold placed over a row that is still captain-held has landed no close since that stamp - a repeat hold, or a deferral over an interrupted close whose record is written but whose close never ran - so it keeps and republishes the occurrence already open instead of counting that unlanded record as a finished gate.
Once that occurrence has settled, a captain hold standing over it again is a new gate however it was placed - including with `tasks-axi hold <id> --kind captain` directly - so the occurrence advances and the previous gate's answer is refused as the stale echo it is.
A gate placed with `tasks-axi hold <id> --kind captain` directly carries no stamp, so `answer` reconciles one when it records that gate's first resolution; every record written on a stamped row therefore names the gate it answers, and a later repeat hold finds that stamp instead of minting a successor.
A row that already carried records before this record existed proves nothing about which of its gates is open, so neither command guesses one: it stays unstamped on the permissive path, where its interrupted close remains answerable, until a landed close lets the next hold mint an occurrence honestly.
While it is unstamped both commands read the open gate off the newest record's own `Hold occurrence:` line rather than off a count, so a gate that accumulated several records is still named once, and only a body whose records all predate that line falls back to the count.
That fallback is a read of history, never something a new record inherits: every record `answer` writes names the gate it published, on the permissive path too, so the occurrence a close announces is the one its own replay derives instead of a position that shifts as records accumulate.
An occurrence names exactly one gate, because the parent channel appends each line once: a key re-used across two gates makes the second gate's resolution a duplicate that is dropped, leaving an answered call reading as open forever.
An unstamped hold that would republish an occurrence the parent channel has already resolved therefore mints its successor and stamps that, since a published resolution is proof the gate's close landed - which an interrupted close never leaves behind.
The stale-echo refusal is therefore a guarantee about stamped rows: an unstamped row keeps the older behaviour, in which an echo of a settled gate's answer is recorded and closes rather than being refused.

The `answer` subcommand records the captain's exact words and closes the call in the same act.
It requires a non-empty captain decision file of at most 8192 bytes, writes a resolution block carrying the decision digest, a `Resolution mode:`, and the `Hold occurrence:` it answers at the top of the task body (the previous body is preserved below the block and archived through tasks-axi `--archive-body`), then runs `tasks-axi done` - or `tasks-axi unhold` under `--release`, so a captain-gated work item resumes instead of closing.
An exact retry is idempotent only when the requested close mode matches the mode that answer's own record carries; a drifted answer or mode mismatch is rejected, while a re-held task accepts a new answer as a new record on top.
A re-held task and an interrupted close both leave a captain hold standing above a matching record, so the exact retry is scoped to the stamped hold occurrence: it finishes the interrupted close only while that same occurrence is the one open, and a reply that repeats an earlier occurrence's answer is refused so the new gate keeps its hold and its own answer.
One gate can carry more than one record - an interrupted close, then the same words redelivered through a channel whose provenance digests differently - and each of them names that gate, so any of them retries it under its own recorded close mode while a record naming a settled gate is refused.
A row whose gate has already settled - closed by that answer, or released by it and so neither held nor closed - replays by the same rule rather than by its newest record alone: any record naming the gate that row last settled is that gate's own answer replayed, checked against the mode that record carries, and a record naming an earlier gate is drift.
Only the re-held task's hold advanced the stamp, which is what lets the interrupted close still recognise the occurrence its own retry names even after a repeat hold.
On a task closed outside the script, `answer` records the missing block only when the captain-hold annotations tasks-axi preserves through a close prove the captain owned it, and it verifies the task stays closed.
A hold whose `--until` date has passed keeps those annotations while tasks-axi reports it no longer held, so an expired deferral remains answerable.

The `complete` subcommand unions the reviewed captain-held task ids into `decision_keys=` and appends `decisions_reviewed=1` while originating task metadata is live.
A post-teardown visual review can complete against the surviving report and durable tasks without recreating volatile task metadata.
It accepts `--none` as an explicit semantic inventory result, refused while the origin still has a lifecycle-open keyed status decision, and verifies every listed task against tasks-axi before recording completion.
With a non-empty inventory it appends a `captain-held [key=<key>]: tracked by <inventory>` transfer event for every still-open keyed status decision, which `bin/fm-classify-lib.sh` recognizes as closing the live status copy without claiming that the captain has answered it.

Scout teardown calls the read-only `verify` subcommand after checking for the report and before removing any source state.
`verify` requires the recorded attestation, requires every recorded inventory entry to still be durable (actively captain-held, or carrying a recorded answer), and fails on any keyed status decision that opened after the last `complete`, which makes re-running `complete` the repair.
The `--force` path remains the explicit captain-approved discard escape hatch.

## Cleanup never closes a captain call

The policy prefers holding the very work item a question gates, so the backlog row a finished task's cleanup is about to close is routinely the captain's own call.
`bin/fm-teardown.sh` therefore asks the read-only `open` subcommand before its automatic close: exit 0 means the row is still an open captain call (not Done, `hold_kind: captain`), 1 means it is not, and 2 means the answer could not be established, which teardown treats as a refusal before any destructive step rather than as permission to close.
On 0 only the close changes: after cleanup and still under the task's own lock, teardown records one `Deliverable of the finished work: ...` line at the end of the task body and runs `tasks-axi reopen`, so the row returns to Queued with its hold intact and lands in Captain's Call instead of reading as work still under way.
The pending-close record teardown already stages before destructive cleanup carries that intent as a `mode=retain` line, so an interrupted cleanup replays the retention at the next session start through the same record, validator, and lock as an ordinary close and never closes the row; an answer that closed the row first simply retires the record.
`--force` does not lift the deferral, because it authorizes discarding unlanded work, never the captain's question, and `answer` remains the only act that closes the call.
`bin/fm-backlog-transition-lib.sh` owns the transition and its record, and `bin/fm-captain-hold.sh --help` owns the predicate's contract.

## Answer-time closure

"A keyed answer resolves its matching captain-held task" is one capability with one owner.
`answers` is its channel-agnostic entry point: it reads `<task-id>\t<answer>\t<label>[\t<mode>]` lines and resolves each named task through the same `answer` path, so every guard applies identically no matter which channel the answer arrived on.
The optional mode column carries a card-declared close: `done` completes the task and `release` lifts the hold so held work resumes; without a mode, the intake retries whatever close an existing record of the same answer began, and otherwise - including when that record predates the mode line and so states no close - releases a task still In flight while completing a decision-only card; any other value is skipped.
A staged `state/<id>.backlog-close` record is the durable evidence that a row's own work already finished and only its cleanup was interrupted, so that row completes on the captain's answer rather than releasing even while it still reads In flight.
That evidence holds only while the record still names the dispatch now under way: the intake applies the same spawn-generation staleness test `fm_backlog_close_marker_replay` applies at session start, so a record an earlier dispatch left standing over live work proves nothing and the row is released.
A key that names no task, names a task that is not captain-held, names a task already closed, or names one whose own occurrence record cannot be read is reported as `skipped:` and feeds nothing, leaving the rest of the batch to be answered on its own terms; a replay whose answer and requested close mode match a record naming the gate the row has open or last settled is an idempotent `closed:` unless the row has since been re-held for a later gate, in which case that stale duplicate is skipped rather than spent on the new gate; a mode mismatch is skipped; and the command exits nonzero when any key was skipped.
A refused duplicate leaves the new gate holding, and that gate needs decision text of its own: reword the reply, or record it directly with `bin/fm-captain-hold.sh answer <id> --decision-file <path>`, since the refusal is keyed to the digest of the recorded decision text, which covers the channel, task, and label the answer arrived with rather than the captain's words alone.
`--source` is provenance text recorded in the durable decision, never a behavior switch, and the command carries no per-channel branch.

`bind`, `unbind`, and `binding` record that a captured-answer source feeds this intake, as a private record under `state/decision-bindings/`; an unbound source feeds nothing, so the path is opt-in per source, and `bind` deliberately does not require the source to exist yet.

Two channels feed that one intake today, and both are ordinary callers rather than special cases.
`bin/fm-send.sh --resolve-key` is the chat channel: its status-log close for a key the status log still owns is owned by that script's header, and a key the status log no longer owns is resolved to a still-open captain-held task - the key as a task id, then the legacy derived identity - and fed as one keyed line.
`bin/fm-procevent.sh` is the captured-result channel: after capture, a bound built-in source has its result passed to `bin/fm-procevent-<adapter>.sh answers <result-file>` and whatever that prints is piped into the intake, so any built-in adapter with an `answers` command works and the runner names no adapter, parses no result, and carries no decision rule.
Trusted external process-event adapters intentionally expose no answer operation and cannot feed this authority-bearing intake; [`extension-bindings.md`](extension-bindings.md#trust-boundary) owns that boundary.
`bin/fm-procevent-lavish.sh answers` is one such adapter command; it reads only rows tagged `choice`, relays a card's declared close mode, and can never let freeform captain prose forge a task id or a mode.

## Structured read surfaces

`bin/fm-fleet-snapshot.sh` parses canonical tasks-axi `(hold: ...)`, `(hold-kind: ...)`, and `(hold-until: ...)` metadata alongside existing backlog fields.
It resolves every repeated `blocked-by:` edge against structured Done records, keeps missing blockers unresolved, and classifies a captain hold as `captain_actionable` - waiting on the captain now - only when it is queued, unblocked, and due, whatever kind its row carries.
It also emits a presentation-only `deferred_marker` when a hold's reason or body carries an explicit SUPERSEDED / NOT REQUIRED / DEFERRED marker.
Its secondmate-home summary classifies an actionable captain hold as `captain_decision` and preserves blocked or deferred captain holds as queued work in the owning home.

`bin/fm-bearings-snapshot.sh` projects actionable captain holds into `decisions_open` and leaves blocked captain holds in ordinary queued gates.
A date-deferred captain hold renders as a gate with its `until <date>:` reason; a prose-deferred one leaves the default views with an `omitted[]` disclosure, revealed by `--all-decisions` / `--all-queued`.
Recently Landed excludes a record that closed while still held for the captain (surviving `hold-kind: captain` on a Done row), so answered questions do not masquerade as shipped work; a work item released before completion keeps no hold annotations and lands normally.
The projection remains read-only and does not inspect historical prose beyond the canonical snapshot's marker.

## Record divergence

A captain call can have two records, and closing one does not close the other.
A `resolved [key=...]` line closes the status-log fold; the structured captain-held task closes only through `answer`.
Until this guard existed, closing on the status side alone left no trace of the disagreement: the fold went quiet, the durable record kept saying the captain owed an answer, and nothing warned.

`bin/fm-captain-hold.sh diverged` is the read-only report of that state, and `bin/fm-wake-drain.sh` prints it as a bounded `RECORD DIVERGENCE` section beside OPEN DECISIONS on every drain.
It flags exactly one condition: a task still open and still carrying the captain-hold annotations, whose key was closed on the status side by the resolve verb, resolved through the collapsed identity (the key is the task id) or the legacy derived one.
It closes nothing, ever - a captain call closed wrongly leaves review entirely, so both reconciliation directions stay human-owned and the printed hint names both.

Three states are deliberately not divergence.
A `captain-held [key=...]` close is the verified transfer `complete` writes, so the structured row staying open behind it is correct; `bin/fm-classify-lib.sh`'s `status_key_closing_verb` is what keeps the two closing verbs distinguishable.
A still-open keyed status decision belongs to the OPEN DECISIONS fold.
And the absence of a routed work item is legitimate rather than incomplete - when the decision is the deliverable there is nothing to route - so routed work is no part of the test.

Cost stays flat: one `tasks-axi list`, one key scan per status log, and the precise per-key fold only for a key that already names a still-open task.
The comparison is refused unless the status directory is the active home's own, since tasks-axi reads that home's backlog and a mismatch would report one home's logs against another's tasks.
If tasks-axi is unavailable or its listing cannot be parsed, the guard cannot read the structured record and prints nothing.

## Compatibility with pre-collapse installs

Older installs created derived `<origin>-decision-<key>` identities through the retired `bin/fm-decision-hold.sh`.
Those rows are already plain task ids, so they render, answer, verify, and close through the collapsed surfaces with no data migration.
Three legacy inputs are resolved in place: a `decision_keys=` metadata entry that names no task resolves through `<origin>-decision-<entry>`; a channel key that names no task resolves the same way when the source's binding carries a concrete legacy origin; and resolution records written by the old script are recognized wherever a record is read.
The shim recognizes an exact replay of a pre-collapse routed resolution by its historical answer digest and routed ids, then finishes any still-recorded dependency-edge cleanup without rewriting the old decision text.
`bin/fm-decision-hold.sh` itself remains for one release as a thin command-mapping shim over `bin/fm-captain-hold.sh`, so in-flight work briefed before the collapse keeps working; its header owns the exact mapping.

## Verification record

Verification date: 2026-09-04.

The focused end-to-end regression suite is `tests/fm-captain-hold-lifecycle.test.sh`, using only synthetic `sample` identities and decision text.
It proves: cleanup of a finished task whose own row is the captain call leaves that call open, queued, held, carrying its deliverable, and visible in Bearings' Captain's Call, leaves no pending record behind, survives a `--force` cleanup, and closes only when `answer` records the captain's words, while an ordinary finished task in the same home still closes with its report link; an interrupted cleanup leaves the row In flight and untouched with its pending record, and the next session start retains it as queued and held with the deliverable recorded; a relocated data directory keeps the retention in its one configured backlog; a ship row whose captain hold cannot be read refuses cleanup before any destructive step and surfaces the read failure; the reconstructed silent-divergence case is signalled - a status resolution over a still-open captain-held task reaches both `diverged` and the drain's `RECORD DIVERGENCE` section, under the collapsed and the legacy identity alike, while the backlog task, its hold, and the status log all survive the report unchanged and the printed hint names both reconciliation directions; the false-signal boundary holds - a captain call with no routed work item, a verified `captain-held` transfer, a still-open status decision, an already answered call, and an ordinary task whose keyed question was answered all stay silent; a report-only unresolved captain call refuses `--none` completion before teardown can erase the source; non-forced scout teardown always requires the durable inventory verification; the recorded-answer guard (a bare `tasks-axi done` close fails `verify` until `answer` records the captain's word, and an ordinary finished task cannot be dressed up as an answered call); answer-time resolution through a bound channel with task-id keys, including the `release` close mode, default release of In flight work, completion of a decision-only card, completion rather than release of a captain call row an interrupted cleanup left In flight with its pending close record staged, release rather than completion once a later dispatch of that same row has superseded the record, a three-field retry finishing an interrupted close rather than releasing it, a repeat hold over that interrupted close keeping the occurrence its retry names, a gate carrying two records staying retryable through either under its own close mode, a settled occurrence making a direct re-gate refuse the previous gate's echo, a record stating no close mode falling through to the state-derived default rather than completing gated work, an unstamped legacy row pairing its hold and answer on one parent-channel occurrence and minting a successor rather than re-using an occurrence the channel had already resolved, a settled multi-record gate replaying idempotently through any of its records and resolving the occurrence its hold opened, through the direct `answer` command as well as the intake and on a gate its answer released as well as one it closed, the same holding for a gate placed through tasks-axi directly rather than through this script, and a row left unstamped from before the record existed staying answerable rather than being stamped with a guess while the record its answer writes still names the gate that answer published, so its own replay resolves that same occurrence, a stale reply after a re-hold being skipped with the new gate and its record count intact while that gate still takes its own answer, whether that reply repeats the newest record or one an intervening gate has since buried, and whether or not the close mode it now derives still matches the one that record was written under, mode-matched replay idempotence, one key whose private occurrence record is malformed being skipped while the rest of its batch is answered and the summary line still printed, and the refusal of drifted, mode-mismatched, absent, unheld, and already-closed keys; the chat channel reaching the same intake; deferral through `--until` leaving `captain_actionable` false until due; and every legacy path (composed identities through the shim, pre-collapse `decision_keys=` metadata, routed-resolution replay, and a concrete-origin binding).

`tests/fm-classify-decision-key.test.sh` pins `status_key_closing_verb` itself: it separates a resolution from the durable-transfer close and from a still-open key, reports the last real transition across re-openings and both key positions, and treats a prose mention as no transition.

Projection regressions live in `tests/fm-fleet-snapshot-view.test.sh` (hold-until parsing, the due gate, kind-independent captain actionability, deferred_marker, title stripping) and `tests/fm-bearings-snapshot.test.sh` (Captain's Call membership, the dated-gate rendering, prose-deferral suppression with disclosure, and the landed exclusion by surviving captain-hold annotations).
The exact commands and their summarized outputs are recorded in the shipping PR's evidence; run the four suites above plus `tests/fm-send-resolve-key.test.sh`, `tests/fm-bearings-board.test.sh`, and `bin/fm-lint.sh` to refresh this record.
