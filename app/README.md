# Fuel Tracker

A standalone, installable PWA for logging fuel fill-ups and tracking consumption per vehicle. Data is stored locally (IndexedDB) on each device, with optional one-way-then-back sync to a Google Sheet.

Live app: https://stefansovilj.github.io/fuel-tracker/

## Local development

```
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

## Deployment

Pushing to `master` (paths under `app/**`) triggers `.github/workflows/deploy.yml`, which builds and publishes `app/dist` to GitHub Pages automatically. No manual deploy step.

## Google Sheets sync setup

This is a one-time setup per Google account, done in [Google Cloud Console](https://console.cloud.google.com). Once done, every device just needs the Client ID pasted into Settings and a click on "Connect" — no spreadsheet ID to find or copy between devices, since the app locates the sync spreadsheet by name ("Fuel Tracker Sync") automatically via a Drive search.

### 1. Create/select a project

1. Go to **console.cloud.google.com**
2. Top-left project dropdown → **New Project** → name it (e.g. `Fuel Tracker`) → Create
3. Make sure it's selected in the dropdown before continuing

### 2. Enable the required APIs

1. Left menu → **APIs & Services → Library**
2. Search **"Google Sheets API"** → **Enable**
3. Search **"Google Drive API"** → **Enable** (needed so the app can find the spreadsheet by name instead of requiring a copy-pasted ID)

### 3. Configure the OAuth consent screen

1. Left menu → **APIs & Services → OAuth consent screen** (Google sometimes shows this as "Google Auth Platform" with Overview/Branding/Audience/Clients tabs)
2. **User type**: **External** → Create (fine for personal use, no verification needed while in Testing)
3. **App information**: App name = `Fuel Tracker`, support/developer email = your Gmail → Save and Continue
4. **Scopes**: **Add or Remove Scopes** → search and check both:
   - `.../auth/spreadsheets` ("See, edit, create, and delete all your Google Sheets spreadsheets")
   - `.../auth/drive.metadata.readonly` ("See information about your Google Drive files")
   → Update → Save and Continue
5. **Test users**: **Add Users** → add the Gmail account you'll actually use the app with → Save and Continue
6. Leave publishing status as **Testing**

### 4. Create the OAuth Client ID

1. Left menu → **APIs & Services → Credentials**
2. **+ Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Fuel Tracker Web`
5. **Authorized JavaScript origins** → add:
   - `https://stefansovilj.github.io`
   - `http://localhost:5173` (optional, for local dev)
6. Leave redirect URIs empty (not used by this flow)
7. Create → copy the **Client ID** (looks like `123456789012-abc...xyz.apps.googleusercontent.com`). The Client Secret is never used — this app only runs in the browser.

### 5. Connect the app

1. Open the app → **Settings**
2. Paste the Client ID into "Google OAuth Client ID"
3. Click **Connect Google Account**, approve the consent screen

That's it — the first sync creates a spreadsheet named "Fuel Tracker Sync" in your Drive; every other device just needs steps above repeated with the same Client ID, and it'll find that same spreadsheet automatically.

## How sync works

- **Push is append-only.** The app never rewrites or deletes an existing row in the Sheet — it only adds rows the Sheet doesn't already have yet (matched by vehicle ID, and by Date+Odometer for fill-ups).
- **Pull recomputes, never trusts, derived columns.** After appending, the app reads back the raw Date/Odometer/Liters/TotalPrice/Notes and recalculates Distance/Consumption/PricePerLiter/Month locally — so hand-editing a raw value directly in Sheets (e.g. fixing a typo'd Liters) is picked up correctly on the next sync.
- **Sync runs automatically**: after adding a fill-up, on connecting, and once when the app loads (reusing the persisted token while it's still valid, generally up to ~1 hour). The manual "Sync now" / "Sync to Google Sheets" buttons (Settings / History) force it on demand — useful right after editing the Sheet by hand.
- **No in-app editing yet.** Corrections happen directly in the Sheet; an edit button in the app is a possible future addition.
- The old `google-sheets-script/` Apps Script project (a separate, earlier approach) is unrelated to this sync and kept only for reference.

## Troubleshooting

- **`invalid_client` / "OAuth client was not found"**: almost always the Client ID string itself — re-copy it directly from Credentials (don't hand-select from a downloaded JSON, which can grab quotes/commas along with it), and confirm the OAuth client's type is "Web application" and its Authorized JavaScript origins include the exact origin you're using.
- **Signs into the wrong Google account**: make sure the account you want is actually signed into the browser you're using, and that it's listed under **Test users** in the OAuth consent screen.
- **Works on desktop but not on some mobile browsers (e.g. Firefox for Android)**: browsers with aggressive tracking protection (Enhanced Tracking Protection / Total Cookie Protection) can block Google's sign-in popup. Turn off tracking protection for this site specifically, or use Chrome.
- **"Access blocked: this app hasn't been verified"**: expected in Testing mode — click **Advanced → Go to Fuel Tracker (unsafe)** to continue. Safe since it's your own Cloud project.
- **Reconnecting after a scope change**: if this app's required scopes ever change (e.g. Drive access was added after Sheets-only), an old connection stops working automatically — just hit Connect again to re-consent.
