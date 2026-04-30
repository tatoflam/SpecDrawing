## ADDED Requirements

### Requirement: Active variant key in canvas state
The canvas state MUST include an `activeVariantKey: string | null` field. On app start, `activeVariantKey` MUST be set to the active sheet's default variant key when that sheet has `variantsEnabled === true`, and MUST be `null` otherwise. Switching the active sheet MUST recompute `activeVariantKey` against the new sheet's variant config.

#### Scenario: Default variant on first paint of a variant-enabled sheet
- **WHEN** the app starts with `activeOptionSheet = "アーバンシー"` and that sheet declares variants `[natural, flat, sharp]` with default `natural`
- **THEN** `activeVariantKey` is `"natural"`

#### Scenario: Variant key cleared when switching to a sheet without variants
- **WHEN** `activeVariantKey = "sharp"` and the user switches `activeOptionSheet` to a sheet whose `variantsEnabled === false`
- **THEN** `activeVariantKey` becomes `null` and any variant-switcher control is hidden

### Requirement: Variant switcher control
The UI MUST expose a variant-switcher control (a horizontal segmented control or button group) that is rendered ONLY when the active sheet has `variantsEnabled === true`. The control MUST list every variant declared by the active scene's `scene.json` `variants` array, MUST highlight the entry matching `activeVariantKey`, and MUST be reachable by both pointer and keyboard.

Selecting a variant entry MUST update `activeVariantKey` and trigger a single canvas re-render in which:
- the base layer swaps to the chosen variant's `baseImageUrl`,
- every texture-mode part that has a current selection re-renders using the option's `textureUrlByVariant[activeVariantKey]`,
- color-mode parts (accent cloth) are unaffected.

#### Scenario: Variant switcher visible only on variant-enabled sheet
- **WHEN** the active sheet has `variantsEnabled === true`
- **THEN** the variant switcher is rendered with one entry per variant
- **AND** when the user switches to a sheet with `variantsEnabled === false`, the variant switcher is removed from the DOM

#### Scenario: Switching variant updates the canvas atomically
- **WHEN** the user clicks the `sharp` entry while `activeVariantKey = "natural"` and three texture-mode parts have selections
- **THEN** the canvas re-renders with the `sharp` base image AND each of the three parts uses its option's `textureUrlByVariant["sharp"]` crop
- **AND** color-mode parts (accent cloth) keep the color the user picked, unchanged

#### Scenario: Switcher selection survives a sheet round-trip
- **WHEN** the user picks `flat`, switches to a sheet with `variantsEnabled === false`, then switches back to the variant-enabled sheet
- **THEN** `activeVariantKey` is restored to `"flat"` and the switcher highlights `flat`

### Requirement: Texture-mode parts source by active variant
For every texture-mode part with an active finish selection on a variant-enabled sheet, the canvas MUST resolve the part's `textureUrl` as `option.textureUrlByVariant[activeVariantKey]`. Color-mode parts MUST continue to use their current `colorHex`-based composition path and MUST be unaffected by `activeVariantKey`.

#### Scenario: Texture-mode part repaints on variant change
- **WHEN** `activeVariantKey` changes from `"natural"` to `"flat"` and part `10` has a texture-mode option selected
- **THEN** part `10`'s rendered finish layer fetches and displays `option.textureUrlByVariant["flat"]`

#### Scenario: Color-mode part unaffected
- **WHEN** `activeVariantKey` changes and the kitchen accent cloth part has a `colorHex` selection
- **THEN** the accent cloth's color overlay is re-rendered with the same `colorHex` value over the new base image
- **AND** no `textureUrlByVariant` lookup is attempted for that part
