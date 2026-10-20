# Brik Sales Hub (staff only)

A passcode-locked copy of the Brik Studios Sales Hub. Everything in this repo that matters is encrypted:
the page, its pictures and its numbers are in `m/` as sealed files, and they only open in a browser
after the staff passcode is typed in. Without the passcode the files are noise.

**Site:** https://charliebrikstudios.github.io/brik-sales-hub/

## How it works

- `index.html` asks for the passcode. The passcode unlocks a private key (in `vault.json`, itself
  encrypted with the passcode, PBKDF2-SHA256 at 600,000 rounds) and the browser keeps that key on the
  device, so people only type it once. `?lock` on the address forgets it.
- `sw.js` opens each sealed file in `m/` as the page asks for it (RSA-OAEP key wrap + AES-256-GCM).
- The copy is **view only**. Logging sales, buying manors, editing the agenda and changing your look
  happen in the Hub on Claude; they show up here at the next refresh.

## Keeping it up to date

- **Numbers:** a scheduled task exports the Hub's database a few times each weekday, seals it with
  `node tools/seal.mjs data <export folder>` and commits `m/`. It needs no secret: sealing uses the
  public key in `vault.json`.
- **The page itself:** when the Hub changes, put its `index.html` and pictures in a folder outside
  the repo (or in `app/`, which is ignored), run `node tools/seal.mjs hub <folder>`, and commit `m/`.
- **Changing the passcode:** `node tools/vault.mjs rewrap <old> <new>`, commit `vault.json`.
  Everyone types the new one next time. To shut out someone who knew the old one for good, make a
  new key pair (`node tools/vault.mjs new <passcode> --force`) and reseal the page and the data.

## Never commit

Readable copies of anything: the Hub page, exports of its database, Salesforce data, clients' names.
Only `m/*.bin` carries content. `.gitignore` keeps `app/` and `db/` out.
