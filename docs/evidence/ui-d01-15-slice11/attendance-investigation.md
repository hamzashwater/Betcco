# Confirmed attendance synchronization cause

Independent diagnostics ran against the unchanged existing production owner and passed 4/4 (EN/AR). Exact backups confirm the original 16 files had not changed since the blocked handoff.

| Event, same record attendance-0 | Query cache status | Rendered item.status | Selected local draft | Original node |
| --- | --- | --- | --- | --- |
| Initial GET | Present | Present | Present | connected |
| User edits | Present | Present | Excused | connected |
| New GET refetch promise resolves | Late | Present | Excused | connected |
| React commits notified result | Late | Late | Late | disconnected, still carries Excused |
| Same committed status, unrelated timestamp refresh | Late | Late | Excused (new unsaved edit preserved) | current node stays connected |

Both locales produced this timeline. Another student's draft remained Absent. Selecting session-b reset the unrelated draft to that session's server status Present.

The original failing test never issued a PUT. It asserted synchronously after refetchQueries, before the observer notification reached React, and captured a DOM node which the status-bearing React key subsequently replaced. QueryClient.refetchQueries waits for fetch promises; this installed query-core 5.102.0 schedules batched notifications via systemSetTimeoutZero. useBaseQuery subscribes through notifyManager.batchCalls. These installed sources and timelines establish the cause independently of any assertion change.

The independent mutation-cycle test also records exact PUT body {studentUserId,status}, pending guards/no duplicate write, no optimistic status/success, exact selected-session invalidation, fresh GET and committed Late, then failed PUT preserving committed Late and local Excused without false success. All four diagnostic tests passed against unchanged production code.

Correction chosen: keep the original Late expectation, wait for the observable committed selector value while re-querying the current DOM node, then obtain the current selector for the next interaction. No effect, key, API, state behavior, delay, retry, timeout, or production file change is needed.

Evidence: diagnostic-first.log; timelines/refetch-render-en.json, refetch-render-ar.json, mutation-lifecycle-en.json and mutation-lifecycle-ar.json.
