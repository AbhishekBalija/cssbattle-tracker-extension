# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
