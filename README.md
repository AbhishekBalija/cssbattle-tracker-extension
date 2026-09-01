# CSSBattle Tracker

A Chrome extension that captures [CSSBattle](https://cssbattle.dev/) solution drafts and publishes named approaches to your own GitHub repository when you choose.

No backend. No database. Submit while experimenting, review the latest draft, then publish only when it is ready.

> **See it in action:** [AbhishekBalija/My-CSS-Battle](https://github.com/AbhishekBalija/My-CSS-Battle) is the live archive and analytics website powered by this extension.

---

## What it does

- Detects every successful CSSBattle submission
- Keeps the latest submission as a local draft
- Publishes only when you click **Publish** and confirm the approach name
- Stores up to three named approaches for a target
- Keeps the best-scoring approach first on the website
- Updates your profile stats and history
- Works with the CSSBattle plugin system built-in (no Plus subscription required)

---

## Quick start

### 1. Create a data repo

Create a new empty repository on GitHub (e.g., `your-username/cssbattle-solutions`). This is where the extension will write all data.

### 2. Get a GitHub token

- Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
- Create a token that can access only your CSSBattle data repository.
- Under repository permissions, set **Contents** to **Read and write**.
- Give the token an expiry date and copy it. Fine-grained tokens start with `github_pat_`.

A classic token with the `repo` scope is still accepted for existing setups, but it grants broader access and is not recommended for new installations.

### 3. Install the extension

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked**.
5. Select the `extension/` folder from this repo.

### 4. Configure the extension

Click the CSSBattle Tracker icon in your toolbar and fill in the popup:

| Section | Field | Required | How to find it |
| ------- | ----- | -------- | -------------- |
| Repository Config | GitHub owner | Yes | Your GitHub username or organization |
| Repository Config | Repository name | Yes | The data repo you created, e.g. `cssbattle-solutions` |
| Repository Config | Branch | Yes | Usually `main` |
| CSSBattle Profile | CSSBattle user ID | Yes | From your profile URL: `cssbattle.dev/player/<user>?userId=YOUR_USER_ID` |
| CSSBattle Profile | CSSBattle username | Yes | Your CSSBattle username |
| CSSBattle Profile | Display name | No | Name shown in `content/profile.json` |
| CSSBattle Profile | Country | No | Country shown in `content/profile.json` |
| GitHub Token | Token | Yes | Fine-grained token with repository Contents read/write access |

Click **Save Settings**, then **Test Connection**. If it says "Connected", you're ready.

### 5. Use CSSBattle

Solve any target and submit. The result is saved locally as a draft, so you can keep experimenting without creating GitHub commits.

When you are happy with it:

1. Click **Publish** beside CSSBattle's **Submit** button.
2. Give the draft a clear approach name in the modal.
3. Click **Publish to GitHub**.

Using the same approach name updates that approach. A new name adds another approach, up to three per target. If an older solution has no approach data yet, the extension asks you to name that saved solution once before adding the new one.

---

## Files created in your data repo

```
├── data/
│   ├── battles.json                     # All battle solutions
│   └── daily/
│       └── {year}/
│           └── {month}-{monthname}.json # Daily target solutions
└── content/
│   ├── profile.json                     # Latest profile snapshot
│   └── profileHistory.json              # Historical snapshots
```

---

## Built-in plugins

The extension includes a few community plugins by [Joe Crawford (artlung)](https://github.com/artlung/artlung-cssbattle-plugins), accessible from a compact toolbox in the CSSBattle target panel. While the toolbox is open it uses the Target Sponsor space; hiding it restores the original sponsor:

| Plugin | Description |
| ------ | ----------- |
| Blank Template | Insert a basic starter template |
| Nested Template | Insert a nested-CSS starter template |
| Minify | Strip whitespace, comments, and normalize tokens |
| Unit Replacement | Replace `px` with the shortest `vw`/`vh`/`pc`/`0` equivalent |

Enable or disable plugins and show/hide the toolbar from the extension popup. Plugins only run when you click them. Submissions are stored as drafts, and GitHub is only updated after you use **Publish** beside CSSBattle's **Submit** button and confirm the modal.

---

## Troubleshooting

### "Missing config" error

Fill in all required fields in the popup: GitHub owner, repo, branch, CSSBattle user ID, CSSBattle username, and GitHub token.

### "Token is invalid or expired"

- Make sure the token has not expired or been revoked.
- Confirm that the token can access the configured repository.
- For a fine-grained token, set **Contents** to **Read and write**.
- If you revoked or regenerated the token, paste the new one.

### "Repo not found"

- Double-check the owner and repo name.
- Make sure the repo exists and the token can access it.
- If the repo is private, include that repository in the fine-grained token's repository access list.

### Submissions are not being captured

- Make sure you are on a `cssbattle.dev/play/*` page.
- Reload the extension from `chrome://extensions/`.
- Open the page console and look for `[CSSBattle Tracker]` logs.

---

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development and pull request workflow.

Report security problems privately by following [SECURITY.md](SECURITY.md). Never include a real GitHub token in an issue, screenshot, log, or pull request.

Release changes are recorded in [CHANGELOG.md](CHANGELOG.md).

---

## License

Apache-2.0 — see [LICENSE](LICENSE).

The built-in plugins are based on [artlung/artlung-cssbattle-plugins](https://github.com/artlung/artlung-cssbattle-plugins) and retain their original Apache-2.0 attribution.

Extension icons are rasterized from CSSBattle's [official logo glyph](https://cssbattle.dev/images/logo-new-glyph.svg) because Chrome extension manifests require packaged raster icons.
