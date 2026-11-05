# Cheer & Chores

A chore and allowance tracker for kids that runs as a home-screen web app on iPad. No accounts, no server, no tracking.

**Live app:** https://adameliaslaw.github.io/cheer-and-chores/

## Put it on an iPad

1. Open the link above in **Safari** on the iPad.
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open the app from the new home-screen icon (not from Safari) and do the first-run setup: kids' names, weekly allowance, and a 4-digit parent PIN.

Set it up from the icon, because the home-screen app keeps its own storage, separate from Safari.

## How it works

- **Kids:** tap their card, check off chores, spend money in the reward shop, move money to savings, and track goals and badges.
- **Parents:** tap the lock and enter the PIN to pay allowance (once a week), apply the 7:30 PM missed-chore penalty (once a day), add bonuses or deductions, undo the last entry, and edit chores, prices and settings. Parent mode locks again when you go Home or leave the app.
- **Offline:** after the first open it works without internet.

## Data and backup

Everything is stored on that iPad only (`localStorage`); there is no sync between devices. Each iPad is set up on its own.
Use **Parent > Settings > Export backup** to save a copy, and **Import backup** to restore it or move it to another device.

The parent PIN is stored as a SHA-256 hash, not in plain text. Nothing personal is in this code; names are typed on each device.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app (HTML, CSS, JS, no dependencies) |
| `manifest.webmanifest` | Home-screen name, colors, icons |
| `sw.js` | Service worker for offline use |
| `icon-*.png` | App icons |
| `tests/app.test.mjs` | 21 automated checks (jsdom) |

## Updating

Edit the files and push to `main`; GitHub Pages republishes. **Bump `VERSION` in `sw.js`** on every change so iPads pick up the new version (they get it the next time the app opens online).

## Tests

```
npm install
npm test
```
