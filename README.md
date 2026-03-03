# Zero's Claude Code Giveaway — Provably Fair Lottery

3 free weeks of Claude Code, randomly drawn from Twitter/X commenters.

**[View Results →](https://claude-code-lotto.vercel.app)**

---

## Results

| Place | Winner |
|-------|--------|
| 1st | TBD |
| 2nd | TBD |
| 3rd | TBD |

*Draw date: TBD*

---

## How It Works

This lottery uses a **provably fair** system — the same cryptographic method used by transparent gambling platforms. No one can manipulate the results, and anyone can independently verify them.

1. **Before the draw:** A secret seed is generated and its SHA-256 hash is published. The hash commits to the seed without revealing it.
2. **During the draw:** The seed + entrant count derive a shuffle key. A deterministic Fisher-Yates shuffle (using a SHA-256 counter-mode PRNG) selects the winners.
3. **After the draw:** The secret seed is revealed. Anyone can verify that `SHA256(seed)` matches the committed hash, and that re-running the shuffle produces the same winners.

---

## Verify Yourself

### Web

Visit the [verification page](https://claude-code-lotto.vercel.app/verify) — it auto-runs all checks in your browser.

### CLI

```bash
git clone https://github.com/zer0kn0wledge/claude-code-lotto
cd claude-code-lotto
node scripts/verify.mjs
```

Zero dependencies. Uses only Node.js built-ins.

### Manual (any SHA-256 tool)

```
1. Compute SHA256(server_seed) → must match seed_hash_sha256 in results.json
2. Compute SHA256(server_seed + ":" + entrant_count) → this is the shuffle_key
3. Run Fisher-Yates shuffle on entrants array using the PRNG below
4. First 3 entries of shuffled array = winners
```

---

## Algorithm Specification

Anyone can reimplement this in any language to verify the draw.

### SHA-256 PRNG — Counter Mode

```
createPRNG(seedHex):
  counter = 0
  next():
    hash = SHA256(seedHex + ":" + counter)
    counter++
    return parseInt(hash[0..7], 16) / 2^32    // first 8 hex chars → uint32 → float [0,1)
```

### Fisher-Yates Shuffle

```
seededShuffle(array, seedHex):
  rng = createPRNG(seedHex)
  a = copy(array)
  for i from (a.length - 1) down to 1:
    j = floor(rng.next() * (i + 1))
    swap(a[i], a[j])
  return a
```

### Full Draw Procedure

```
1. serverSeed   = random UUID + timestamp + random UUID
2. seedHash     = SHA256(serverSeed)              ← published BEFORE draw
3. shuffleKey   = SHA256(serverSeed + ":" + entrantCount)
4. shuffled     = seededShuffle(entrants, shuffleKey)
5. winners      = [shuffled[0], shuffled[1], shuffled[2]]
6. serverSeed revealed AFTER draw                 ← anyone can now verify
```

---

## Setup

### Vercel Deployment

1. Import the GitHub repo into Vercel
2. Add environment variable: `TWITTER_BEARER_TOKEN` = your Twitter/X API v2 Bearer Token
3. Deploy — that's it

The Bearer Token enables the **auto-fetch** feature: paste a tweet URL and the API automatically fetches all commenters. Requires Twitter API Basic tier ($100/mo) for the search/recent endpoint.

Without the token, manual entry (paste usernames or load JSON) still works.

## Tech Stack

- Pure HTML/CSS/JS — zero external dependencies
- Vercel serverless function for Twitter API integration (`api/fetch-replies.js`)
- Web Crypto API for SHA-256 (browser), Node `crypto` module (CLI)
- Hosted on Vercel
- No frameworks, no tracking, no third-party scripts

---

## Timeline / Git History

The git commit history is part of the proof chain:

1. **Repo created** — code committed and published
2. **Entrants committed** — participant list locked before the draw
3. **Results committed** — winners and revealed seed published after the draw

Each step is a separate, timestamped git commit that anyone can inspect.

---

## License

MIT
