# Cheer & Chores

A chore and allowance tracker for kids that runs as a home-screen web app on iPad and iPhone. No accounts and no tracking. Optional family sync keeps every device showing the same scores.

**Live app:** https://adameliaslaw.github.io/cheer-and-chores/

## Put it on an iPad or iPhone

1. Open the link above in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open the app from the new home-screen icon (not from Safari). Set it up from the icon, because the home-screen app keeps its own storage, separate from Safari.

The first device does the first-run setup (kids' names, weekly allowance, a 4-digit parent PIN). With family sync on, every other device just joins (see below).

## How it works

- **Kids:** tap their card, check off chores, spend money in the reward shop, move money to savings, and track goals and badges. With two or more kids, whoever has the most stars this week wears the 👑 *Leading this week* crown.
- **Parents:** tap the lock and enter the PIN to pay allowance (once a week), apply the 7:30 PM missed-chore penalty (once a day), add bonuses or deductions, undo the last entry, and edit chores, prices and settings. Parent mode locks again when you go Home or leave the app.
- **Offline:** after the first open it works without internet. With sync on, changes made offline are kept and sent when the device is back online.

## Family sync

Family sync puts the family's data in a small free database (Google Firebase Cloud Firestore) that you own, so all the iPads and phones show the same chores, money, stars and history, live.

### One-time setup (about 10 minutes, on a computer is easiest)

1. Go to <https://console.firebase.google.com>, sign in with a Google account, click **Add project** (or **Create a project**), name it `cheer-and-chores`, and turn Google Analytics off. Stay on the free **Spark** plan; no card is needed.
2. In the left menu open **Firestore** (under *Databases & Storage*, or *Build*), click **Create database**, pick **Standard edition** if asked, choose a US location, and start in **Production mode**.
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
4. Click the gear icon > **Project settings**. Under **Your apps** click the web icon **`</>`**, name the app `Chores` (leave Firebase Hosting unticked), and click **Register app**. Copy the `firebaseConfig = { ... }` block it shows.
5. On the device that already has your kids set up: **Parent > Settings > Family sync**, paste that block into the box, and tap **Turn on family sync**. Your current data is uploaded and the app shows your **family code**.

### Adding the other devices

**By QR code (easiest).** On a synced phone, go to Parent > Settings > Family sync > **📱 Show join QR code**. Then on each iPad:

1. Add the app to the Home Screen (Safari > Share > Add to Home Screen) if it isn't there yet.
2. Open it from the Home Screen icon.
3. Tap **🔗 Join my family**, then **📷 Scan QR code**, allow the camera, and hold the phone's screen in front of it.

The iPad joins in one step: kids, money, scores and the parent PIN all come across, and the camera turns off.

Why scan inside the app rather than with the iPad's Camera app? On iPadOS and iOS, the Home Screen app keeps its own storage, separate from Safari's. A QR scanned with the Camera app opens Safari, and joining there wouldn't reach the Home Screen app. If someone does scan with the Camera app, the page says so and explains the three steps above; it also saves the join so that if iOS copies Safari's data when the app is added to the Home Screen, the app offers the join itself on first open.

The QR code holds the app's address with the family code after `#` (`…/cheer-and-chores/#join=CC1.…`). The part after `#` is never sent to any web server, and the app clears it from the address bar as soon as it reads it.

**By family code.** **🔗 Share family code** (same place) shows the code to copy, AirDrop or message to yourself. On the other device: Join my family, paste it, Join.

A device that already had its own kids set up can join too: Parent > Settings > Family sync, then **📷 Scan a family QR code** or paste the family code, and confirm. Its old local data is replaced by the family's.

### What syncs and how

- Everything: kids, chores and check-offs, balances, savings, goals, rewards, penalties, history, settings and the parent PIN.
- Changes merge field by field, so two devices checking off different chores at the same moment both count, and money changes add up instead of overwriting each other.
- The small dot next to the title shows the state: synced, sending, offline (changes saved, will send later) or a problem.
- **Disconnect this device** keeps a local copy on that device and stops syncing it. The family's data stays in Firebase for the other devices.

### Privacy

- The family code holds your Firebase project's web settings plus a 32-character random family id. Treat it like a house key: anyone with it can see and change your family's chore data, so only put it on your own family's devices.
- The rules in `firestore.rules` refuse listing or browsing, so nobody can find a family without its id, and everything outside `families/` is closed.
- Nothing about your family is in this public code. Your Firebase settings live only in each device's app storage, and the kids' names are only in your database.
- Firebase's web API key is not a password; Google's own docs treat it as safe to ship in an app. The security rules and the random family id are what protect the data.
- The free tier allows 1 GiB of data and 50,000 reads and 20,000 writes per day. One family uses a tiny fraction of that.

## Data and backup

Without sync, each device keeps its own data (`localStorage`). Use **Parent > Settings > Export backup** to save a copy and **Import backup** to restore it. With sync on, an import replaces the whole family's data on every device.

The parent PIN is stored as a SHA-256 hash, not in plain text.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app (HTML, CSS, JS) |
| `sync.js` | Built Firebase sync bundle; loaded only when family sync is on |
| `src/sync.js` | Source of `sync.js` (thin Firestore wrapper) |
| `qr.js` | Built QR bundle (draws the join QR, reads it from the camera); loaded only when a QR is shown or scanned |
| `src/qr.js` | Source of `qr.js` ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4, MIT; [jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache-2.0) |
| `firestore.rules` | Security rules to paste into the Firebase console |
| `manifest.webmanifest` | Home-screen name, colors, icons |
| `sw.js` | Service worker for offline use |
| `icon-*.png` | App icons |
| `tests/app.test.mjs` | 21 app checks (jsdom) |
| `tests/qr.test.mjs` | 4 QR checks: draw the join link, read it back from noisy camera-sized frames |
| `tests/sync.test.mjs` | 32 multi-device checks against the Firestore emulator, including QR join, the in-app scanner, the Safari case, and camera blocked or missing |
| `firebase.json` | Emulator settings for the sync tests |

## Updating

Edit the files and push to `main`; GitHub Pages republishes. **Bump `VERSION` in `sw.js`** on every change so devices pick up the new version (they get it the next time the app opens online). After editing `src/sync.js` or `src/qr.js`, run `npm run build` and commit the new `sync.js` and `qr.js`.

## Tests

```
npm install
npm run build            # builds sync.js and qr.js
npm test                 # app and QR checks
npm run emulator         # in a second terminal; needs Java 11+
npm run test:sync        # sync checks across three simulated devices
```
