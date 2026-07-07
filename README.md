# Gacha Version Countdown — Amsterdam Time

This is a small local web app with five countdown cards:

- Wuthering Waves
- Neverness to Everness
- Honkai: Star Rail
- Arknights: Endfield
- Mongil: Star Dive

It includes a **Check new version** button. The button calls the local Node.js backend, which searches trusted sources plus a web-search fallback, extracts a likely version/date/time, and asks you to confirm before updating the countdown.

## Requirements

- Node.js 18 or newer

## How to run

1. Unzip this folder.
2. Open a terminal in the folder.
3. Run:

```bash
npm start
```

4. Open:

```text
http://localhost:3000
```

## Important note about automatic checking

Automatic game-version checking is best-effort. Publishers often announce dates in images, social posts, region-specific posts, or pages that block automated reading. The app therefore does **not** overwrite countdowns automatically. It shows a proposal first, then you click **Confirm update**.

## Files

- `server.js` — local backend and source-checking logic
- `public/index.html` — countdown UI
- `package.json` — start command
