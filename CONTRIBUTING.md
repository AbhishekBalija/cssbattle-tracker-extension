# Contributing to CSSBattle Tracker

Thanks for helping improve the extension.

## Local setup

1. Fork and clone the repository.
2. Create a branch from `main`, such as `feature/approach-selector` or `fix/draft-state`.
3. Open `chrome://extensions`, enable Developer mode, and load the `extension/` directory as an unpacked extension.
4. Reload the extension after changing its files.

Use a test repository and a fine-grained GitHub token limited to that repository. Give the token only **Contents: Read and write** permission. Never commit a real token, exported browser storage, or personal solution data.

## Before opening a pull request

Run the same checks as CI:

```bash
node --check extension/background.js
node --check extension/content.js
node --check extension/content-main.js
node --check extension/plugin-manager.js
node --check extension/popup.js
node --test tests/background.test.js
```

Also test the changed flow in Chrome on a CSSBattle target. For UI changes, include a screenshot in the pull request.

## Commit and pull request style

- Use focused Conventional Commits, such as `feat: add manual solution publishing`.
- Explain what changed, why it changed, and how reviewers can test it.
- Keep unrelated refactors out of the pull request.
- Do not push directly to `main`.

By contributing, you agree that your contributions are licensed under the repository's Apache-2.0 license.
