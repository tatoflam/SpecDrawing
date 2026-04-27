# material-catalog Specification

## Purpose
TBD - created by archiving change add-material-presenter-mvp. Update Purpose after archive.
## Requirements
### Requirement: Per-part option lookup facade
The capability MUST expose a thin lookup function that, given the active scene, the active sheet, and a `partId`, returns the ordered list of finish-option entries for that part. The implementation MUST delegate to `finish-spec-catalog` and MUST NOT hold its own copy of the option data.

#### Scenario: Lookup returns options for a known part
- **WHEN** a caller requests options for `partId = "07"` on the active scene with sheet `"アーバンシー"`
- **THEN** the function returns every option whose `partId === "07"` and `sheet === "アーバンシー"`, in workbook order

#### Scenario: Lookup for unknown part returns empty
- **WHEN** a caller requests options for a `partId` not declared in the active scene's parts manifest
- **THEN** the function returns an empty array and does not throw

### Requirement: No standalone catalog UI
The capability MUST NOT render any standalone catalog browser, axis-filter sidebar, or thumbnail grid. All option rendering MUST happen through the per-part panel surfaces owned by `presentation-canvas`.

#### Scenario: No legacy catalog panel mounts
- **WHEN** the app is rendered
- **THEN** no component named `CatalogPanel` (or equivalent) is mounted in the DOM

