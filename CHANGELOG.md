# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - Unreleased

### Added

- Added an optional insight field to the Publish modal: one short line (up to 200 characters) on the key trick, stored on the approach and shown under the code on the archive
- Updating an approach prefills its saved insight, so publishing a better score keeps the note unless you change it

### Changed

- Approach rules (ranking, names, insight, record checks) now come from a shared contract file that the archive site also uses; CI fails if the two copies drift
- Every published record is checked against those rules before anything is written to GitHub
- Moved the Publish modal's decision logic into publish-decision.js with its own tests
- Removed unused RUN_PLUGIN/UNDO_PLUGIN message handlers; plugins run from their own panel

## [1.4.1] - 2026-10-20

### Fixed

- Fixed publishing failing with "Maximum call stack size exceeded" once a data file grew past about 64 KB

## [1.4.0] - 2026-09-11

### Added

- Added explicit create and update choices with existing approach details in the Publish draft modal
- Added safe rename-on-update behavior that preserves stable approach IDs
- Added warnings and explicit confirmation for worse updates

### Changed

- Reworked legacy solution publishing so users choose whether to replace or preserve the unnamed solution
- Compacted popup activity and settings while keeping connection actions visible
- Made publish context reads validate current GitHub data before any write
- Gave draft and publish notifications success and error styles
- Restyled plugin buttons with the site typeface and button colors with a taller panel layout

### Fixed

- Prevented duplicate labels, stale approach updates, malformed JSON overwrites, target mismatches, and silent three-approach overflow
- Kept partial publish success visible when only the profile refresh fails
- Show the Publish button on battle pages that have no Top Solutions action
- Keep the Publish button anchored in the action row so it no longer lags while scrolling

## [1.3.2] - 2026-09-01

### Fixed

- Kept CSSBattle's React-managed Submit button in place while positioning Publish beside it
- Recognized CSSBattle's Submit button when its keyboard shortcut has no separating whitespace
- Matched the second-row action widths and kept Publish clickable with guidance before a draft exists
- Used CSSBattle's official logo URL in the popup header and added breathing room around packaged extension icons

## [1.3.1] - 2026-09-01

### Fixed

- Moved publishing out of the plugin toolbox and into a confirmation modal beside CSSBattle's Submit button
- Filed daily targets by the target's date instead of the date the solution was submitted
- Replaced the extension artwork with packaged sizes of CSSBattle's official logo glyph

## [1.3.0] - 2026-09-01

### Added

- Local solution drafts that do not write to GitHub automatically
- Explicit **Push to GitHub** control in the CSSBattle plugin panel
- Named approaches with a maximum of three approaches per target
- Best-approach selection based on score and character count
- Support for converting legacy single-solution records when they are revisited
- Automated extension syntax and behavior checks
- Fine-grained GitHub token support with repository write-permission validation

### Changed

- Submission capture now updates local extension storage only
- The popup distinguishes locally saved drafts from published solutions
- GitHub token guidance now recommends repository-scoped fine-grained tokens

### Removed

- Automatic GitHub publishing after every improved submission
- Screenshot capture and upload permissions

Earlier changes are available in the Git history.
