# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
