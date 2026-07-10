# CSSBattle Tracker

A Chrome extension that automatically archives your [CSSBattle](https://cssbattle.dev/) solutions, screenshots, and profile stats to your own GitHub repository.

No backend. No database. Just solve targets and let the extension push everything to a repo you control.

> **See it in action:** [AbhishekBalija/My-CSS-Battle](https://github.com/AbhishekBalija/My-CSS-Battle) is the live archive and analytics website powered by this extension.

---

## What it does

- Detects every successful CSSBattle submission
- Saves battle and daily target solutions as JSON
- Captures a screenshot of the result
- Updates your profile stats and history
- Works with the CSSBattle plugin system built-in (no Plus subscription required)

---

## Quick start

### 1. Create a data repo

Create a new empty repository on GitHub (e.g., `your-username/cssbattle-solutions`). This is where the extension will write all data.

### 2. Get a GitHub token

- Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
- Click **Generate new token (classic)**
- Select the **`repo`** scope
- Copy the token (it starts with `ghp_`)

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
| GitHub Token | Token | Yes | The classic PAT with `repo` scope |

Click **Save Settings**, then **Test Connection**. If it says "Connected", you're ready.

### 5. Use CSSBattle

Solve any target and submit. The extension will push the solution, screenshot, and profile update to your repo within seconds.

---

## Files created in your data repo

```
├── data/
│   ├── battles.json                     # All battle solutions
│   └── daily/
│       └── {year}/
│           └── {month}-{monthname}.json # Daily target solutions
├── content/
│   ├── profile.json                     # Latest profile snapshot
│   └── profileHistory.json              # Historical snapshots
└── public/
    └── screenshots/
        └── {levelId}.png                # Screenshot for each solution
```

---

## Built-in plugins

The extension includes a few community plugins by [Joe Crawford (artlung)](https://github.com/artlung/artlung-cssbattle-plugins), accessible from a toolbar inside the CSSBattle editor:

| Plugin | Description |
| ------ | ----------- |
| Blank Template | Insert a basic starter template |
| Nested Template | Insert a nested-CSS starter template |
| Minify | Strip whitespace, comments, and normalize tokens |
| Unit Replacement | Replace `px` with the shortest `vw`/`vh`/`pc`/`0` equivalent |

Enable or disable plugins and show/hide the toolbar from the extension popup. Plugins only run when you click them — nothing is auto-applied.

---

## Troubleshooting

### "Missing config" error

Fill in all required fields in the popup: GitHub owner, repo, branch, CSSBattle user ID, CSSBattle username, and GitHub token.

### "Token is invalid or expired"

- Make sure you generated a **classic** token, not a fine-grained token.
- The classic token must have the **`repo`** scope.
- If you revoked or regenerated the token, paste the new one.

### "Repo not found"

- Double-check the owner and repo name.
- Make sure the repo exists and the token can access it.
- If the repo is private, the token needs the `repo` scope (not just `public_repo`).

### Submissions are not being captured

- Make sure you are on a `cssbattle.dev/play/*` page.
- Reload the extension from `chrome://extensions/`.
- Open the page console and look for `[CSSBattle Tracker]` logs.

---

## License

Apache-2.0 — see [LICENSE](LICENSE).

The built-in plugins are based on [artlung/artlung-cssbattle-plugins](https://github.com/artlung/artlung-cssbattle-plugins) and retain their original Apache-2.0 attribution.
