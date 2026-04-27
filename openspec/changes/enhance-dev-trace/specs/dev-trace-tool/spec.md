## ADDED Requirements

### Requirement: Tool scope and gating
The `/dev/trace` page MUST only be reachable in development. Its companion API route at `/api/dev/parts` MUST respond `404` when `process.env.NODE_ENV !== "development"`. The page itself SHALL still render in production (a static informational placeholder is acceptable), but no edit operations may succeed.

#### Scenario: Production gates disable the API
- **WHEN** the app is built with `NODE_ENV=production` and `/api/dev/parts` is requested via `GET` or `PUT`
- **THEN** the response status is `404` and no file-system access occurs

#### Scenario: Development unlocks the API
- **WHEN** `npm run dev` is running and `/api/dev/parts` is requested via `GET`
- **THEN** the response is `200` with the current `parts.json` body and an `mtime` field

### Requirement: Autosave to disk via dev API
The tool MUST debounce-autosave the in-memory manifest to `public/assets/base/main/parts.json` through the dev API on every editing mutation. The debounce window SHALL be 600 ms; consecutive mutations within the window collapse into a single PUT. The PUT body MUST be the full manifest (not a delta).

#### Scenario: Single edit triggers a single PUT after the debounce window
- **WHEN** the designer drags a vertex once and then leaves the canvas idle for 600 ms
- **THEN** exactly one PUT is sent and the response indicates success

#### Scenario: Rapid edits collapse into one PUT
- **WHEN** the designer makes 5 mutations within 600 ms
- **THEN** exactly one PUT is sent after the last mutation, carrying the final manifest state

#### Scenario: Successful save updates the on-screen "saved at" indicator
- **WHEN** a PUT succeeds
- **THEN** the side panel shows `保存済み HH:MM:SS` reflecting the server-reported timestamp

### Requirement: Atomic disk writes with one-deep backup
On a successful PUT, the server MUST write atomically by emitting `parts.json.tmp`, renaming the previous `parts.json` to `parts.json.bak` (overwriting any prior `.bak`), and then renaming `parts.json.tmp` to `parts.json`. The `.bak` file MUST be ignored by git via `.gitignore`.

#### Scenario: Rolling backup is kept, no accumulation
- **WHEN** three successful PUTs occur in sequence
- **THEN** at each step `parts.json.bak` contains the immediately-prior version of `parts.json` and no other `.bak.<n>` files exist

#### Scenario: Crash mid-write leaves a recoverable state
- **WHEN** the server process is killed during the rename sequence
- **THEN** `parts.json` either holds the previous version or the new version — never a partial / invalid file

### Requirement: Server-side schema validation on write
The PUT handler MUST validate the request body against the live `partsManifestSchema` (the same Zod schema used at runtime). On validation failure, the response MUST be `422` with a body containing `{ field, message }` from the first Zod issue, and the on-disk file MUST NOT be modified.

#### Scenario: Invalid manifest is rejected
- **WHEN** a PUT carries a manifest where one part's polygon has fewer than 3 vertices
- **THEN** the response is `422` with the failing field path and message
- **AND** `parts.json` on disk is unchanged

#### Scenario: Valid manifest passes
- **WHEN** a PUT carries a schema-valid manifest
- **THEN** the response is `200` with the new mtime and the disk file is updated

### Requirement: localStorage draft as failover
On every mutation, the tool MUST mirror the current manifest to a localStorage key `dev:trace:parts:<sceneId>` together with a `savedAt` timestamp, regardless of API state. This draft is the recovery surface when the API is unreachable.

#### Scenario: API failure preserves work in localStorage
- **WHEN** the dev server stops mid-session and the designer makes 2 more edits
- **THEN** localStorage holds the latest manifest and the toast informs the designer that local backup is in effect

#### Scenario: API recovery flushes the draft
- **WHEN** the dev server is restored and the next debounced PUT succeeds
- **THEN** the localStorage draft is cleared and the saved-at indicator reflects the server timestamp

### Requirement: Mount-time draft restoration
On mount, the tool MUST GET the current `parts.json` (with mtime) and read the localStorage draft. If the draft's `savedAt` is newer than `mtime + 2s`, the tool MUST display a non-blocking prompt naming both timestamps and offering "ドラフトを復元 / 破棄". Otherwise the tool loads the disk version and clears any draft silently.

#### Scenario: Newer draft offers restore
- **WHEN** the designer reloads the page after an unsaved edit on a stale disk file
- **THEN** the prompt names both the disk mtime and draft savedAt and offers restore vs. discard

#### Scenario: Disk is fresher (e.g., after `git pull`) — no prompt
- **WHEN** the disk mtime is newer than the localStorage draft's savedAt
- **THEN** no prompt is shown, the disk version loads, and the local draft is cleared

#### Scenario: No draft — no prompt
- **WHEN** localStorage has no draft for the active scene
- **THEN** no prompt is shown and the disk version loads

### Requirement: Edge-midpoint vertex insertion
Clicking on the canvas SHALL insert a new vertex at the perpendicular foot of the click point onto the nearest polygon edge **when** the click is within 12 px of an edge segment of the editing part's polygon. Clicks farther than 12 px from any edge MUST fall through to the existing append-to-end behavior so that empty or sparse polygons remain buildable.

#### Scenario: Click on edge inserts midpoint at correct position
- **WHEN** the designer clicks at a point within 12 px of the segment between vertices `[i]` and `[i+1]`
- **THEN** a new vertex is inserted between them at the perpendicular foot of the click on that segment
- **AND** all subsequent vertex indices shift by one

#### Scenario: Click far from any edge appends
- **WHEN** the designer clicks at a point >12 px from every edge of the editing polygon
- **THEN** a new vertex is appended at the end of the polygon

### Requirement: Undo / Redo
The tool SHALL maintain a per-tool history stack of depth ≥ 30. The following actions MUST push a new history entry: vertex add, vertex delete, vertex drag-end, marker drag-end, polygon clear, extractor import. Switching the editing part SHALL also push a checkpoint. `Cmd/Ctrl+Z` MUST undo and `Cmd/Ctrl+Shift+Z` MUST redo. The side panel MUST also expose Undo / Redo buttons that reflect the current stack state (disabled when no further entries exist).

#### Scenario: Drag end is one undo step
- **WHEN** the designer drags a vertex from `(x1,y1)` to `(x2,y2)` and releases
- **THEN** one undo entry is pushed
- **AND** Cmd+Z restores the vertex to `(x1,y1)`

#### Scenario: Switching part is a checkpoint
- **WHEN** the designer edits part 7, switches to part 8, edits part 8, then presses Cmd+Z three times
- **THEN** the first Cmd+Z undoes the last part-8 edit, the second undoes the part-switch (returning the editing focus to part 7), and the third undoes the last part-7 edit

#### Scenario: Drag-move does NOT spam history
- **WHEN** a drag emits 100 mousemove events between mousedown and mouseup
- **THEN** at most one undo entry is pushed for that drag

### Requirement: Extractor import (per-part, with confirm)
The tool MUST provide an "Import from extractor" action that GETs `/tmp/parts-extracted.json` via `/api/dev/parts?source=extracted`. On success, a per-part comparison panel SHALL list each part with current vs. extracted polygon vertex counts and bbox sizes, and per-part toggles for "import polygon" and "import marker". Applying the selected imports MUST mutate the in-memory manifest and push one undo entry per imported part. If `/tmp/parts-extracted.json` does not exist, the response is `404` and the tool surfaces a clear message ("先に `node scripts/extract-pdf-polygons.mjs` を実行してください").

#### Scenario: Per-part import overwrites only selected fields
- **WHEN** the designer imports the polygon for part 7 and the marker for part 10 from the extractor
- **THEN** part 7's polygon and part 10's marker are replaced from the extractor
- **AND** all other parts and other fields remain untouched
- **AND** two undo entries are pushed (one per affected part)

#### Scenario: Missing extractor output surfaces a friendly error
- **WHEN** the designer clicks "Import from extractor" but `/tmp/parts-extracted.json` does not exist
- **THEN** the tool shows a message naming the missing file and the script that produces it

### Requirement: Other-part visibility toggle
A 3-state toggle in the side panel SHALL control how non-editing parts render on the canvas: `all` (faint dashed outlines, current behavior, default), `current` (only the editing part is rendered with its outline + handles + marker), `hidden` (only the editing part's polygon outline; no markers, no other parts). The selection MUST persist across sessions in localStorage.

#### Scenario: "current" hides other-part outlines
- **WHEN** the toggle is set to `current`
- **THEN** no faint dashed outlines are rendered for parts other than the editing one
- **AND** the editing part's marker remains visible

#### Scenario: Preference persists across reloads
- **WHEN** the toggle is set to `hidden` and the page is reloaded
- **THEN** the toggle is `hidden` on next mount

### Requirement: Auto-regenerate mask + shading after save
After every successful autosave PUT, the tool MUST schedule a debounced (~1.5 s) regeneration of mask and shading PNGs by POSTing to `/api/dev/parts/regen`. The regen endpoint MUST diff the just-saved `parts.json` against `parts.json.bak` and only regenerate the parts whose polygon, mask filename, or shading filename changed (regen all if no `.bak` exists). The regen status MUST surface in the header (`マスク再生成 待機中…` → `マスク再生成 中…` → `マスク更新済み <N>件 HH:MM:SS — メイン画面はリロードで反映`). On regen failure, the side panel SHALL surface a non-blocking error.

This requirement closes the gap that triggered the bug "ポリゴンを更新したのに、メインアプリで部材を選ぶと旧ポリゴンの形で塗られる" — `parts.json` was being persisted by autosave but the mask PNGs that the runtime composes against weren't being refreshed.

#### Scenario: Successful PUT triggers a regen for changed parts
- **WHEN** the designer makes one polygon edit on part 7 and the autosave PUT succeeds
- **THEN** within ~2 s a POST to `/api/dev/parts/regen` is issued
- **AND** the response indicates `regenerated: ["07"]`
- **AND** `mask_07.png` (and `shading_07.png` if part 7 is color-mode) on disk has a newer mtime than before the edit

#### Scenario: Burst of edits collapses into a single regen
- **WHEN** the designer makes 5 edits across 3 parts within 1.5 s of each other
- **THEN** at most one POST to `/api/dev/parts/regen` is issued after the burst settles
- **AND** the response lists every changed part exactly once

#### Scenario: No-op when nothing actually changed
- **WHEN** a PUT writes a manifest semantically identical to `parts.json.bak`
- **THEN** the regen endpoint returns `regenerated: []` and writes no PNGs

#### Scenario: Production gates disable the regen endpoint
- **WHEN** `NODE_ENV !== "development"` and `/api/dev/parts/regen` is POSTed
- **THEN** the response is `404` and no file-system access occurs

### Requirement: Manual download remains available
The existing "parts.json をダウンロード" action MUST remain functional as an emergency fallback if the dev API is unreachable for any reason. It downloads the current in-memory manifest as a file named `parts.json`.

#### Scenario: Download still works alongside autosave
- **WHEN** the designer clicks the download button after several autosaved edits
- **THEN** the downloaded file matches the current in-memory manifest exactly
