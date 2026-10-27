# Brik Sales Hub (staff only)

A passcode-locked copy of the Brik Studios Sales Hub. Everything in this repo that matters is encrypted:
the page, its pictures and its numbers are in `m/` as sealed files, and they only open in a browser
after a staff passcode is typed in. Without a passcode the files are noise.

**Site:** https://charliebrikstudios.github.io/brik-sales-hub/

## Logins

Each person has their own passcode: Charlie, Andy, James and Jawaad (see `node tools/vault.mjs list`).
The sign-in page asks who you are, then your passcode. A personal link picks the name for you:

- https://charliebrikstudios.github.io/brik-sales-hub/?u=charlie
- https://charliebrikstudios.github.io/brik-sales-hub/?u=andy
- https://charliebrikstudios.github.io/brik-sales-hub/?u=james
- https://charliebrikstudios.github.io/brik-sales-hub/?u=jawaad

Passcodes ignore capitals, spaces and punctuation. Each browser only asks once; `?lock` on the
address forgets it on that device. Once in, the Hub shows the person as themselves.
Everyone sees the same Hub. It never shows commission.

## How it works

- `vault.json` holds one private key, wrapped once per person with that person's passcode
  (PBKDF2-SHA256, 600,000 rounds). `index.html` unwraps it in the browser and keeps it on the device.
- `sw.js` opens each sealed file in `m/` as the page asks for it (RSA-OAEP key wrap + AES-256-GCM).
- The copy is **view only**. Logging sales, buying manors, editing the agenda and changing your look
  happen in the Hub on Claude; they show up here at the next refresh.

## Managing logins

- **Add someone:** `node tools/vault.mjs add asha "<her passcode>" --with "<anyone's current passcode>"`,
  commit `vault.json`. Nothing needs sealing again.
- **Change someone's passcode:** `node tools/vault.mjs rewrap andy "<old>" "<new>"`, commit `vault.json`.
- **Stop a passcode working:** `node tools/vault.mjs remove andy`, commit `vault.json`. Devices that
  person already opened keep working, because they hold the key. To shut someone out for good, make a
  new key pair for everyone else (`node tools/vault.mjs new --force charlie="..." james="..." ...`),
  then seal the page and the data again (below), delete `m/data.stamp` first so the data is resealed,
  and commit `vault.json` and `m/`. Everyone else types their passcode again once.

## Keeping it up to date

- **Numbers:** a scheduled task exports the Hub's database a few times each weekday, seals it with
  `node tools/seal.mjs data <export folder>` and commits `m/`. It needs no secret: sealing uses the
  public key in `vault.json`.
- **The page itself:** when the Hub changes, put its `index.html` and pictures in a folder outside
  the repo (or in `app/`, which is ignored), run `node tools/seal.mjs hub <folder>`, and commit `m/`.
  Leave out the Hub's `source/` and `tools/` folders.

## Never commit

Readable copies of anything: the Hub page, exports of its database, Salesforce data, clients' names,
or anyone's passcode. Only `m/*.bin` carries content. `.gitignore` keeps `app/` and `db/` out.
