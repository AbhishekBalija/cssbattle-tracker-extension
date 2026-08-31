# Security Policy

## Supported versions

Security fixes are applied to the latest version on the `main` branch. Older unpacked versions may not receive fixes, so reload or reinstall the latest release before reporting an issue.

## Reporting a vulnerability

Do not open a public issue containing exploit details, GitHub tokens, repository contents, or personal CSSBattle data.

Use GitHub's **Report a vulnerability** option on this repository. If private vulnerability reporting is unavailable, contact the maintainer through the contact method on the maintainer's GitHub profile without including sensitive details in the first message.

Include:

- The affected extension version
- The browser and browser version
- Steps to reproduce using placeholder credentials
- The possible impact
- A suggested fix, if available

## Token safety

Use a fine-grained GitHub token restricted to the CSSBattle data repository, with only **Contents: Read and write** permission. Set an expiry date and revoke the token immediately if it may have been exposed.

Never include a real token in an issue, pull request, screenshot, log, test fixture, or exported extension storage.
