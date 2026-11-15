# Usage

[简体中文（默认）](./usage.md) | **English** | [Home](../README.en.md)

Start with the [quick start](../README.en.md#quick-start). See [Privacy and credentials](./security.en.md) for credential and public-data boundaries.

## Configuration

| Setting | Required | Description |
| --- | --- | --- |
| `GITHUB_TOKEN` | Yes | Fine-grained token selecting only the target repository, with Contents read/write access |
| `GITHUB_REPOSITORY` | Yes | Existing `owner/repo`, using its default branch; URLs are not accepted |
| `CODEX_BIN` | No | Absolute path to `codex.exe`; empty means automatic discovery |
| `TIMEZONE` | No | IANA display timezone, such as `Asia/Singapore`; empty uses the computer's timezone |

By default, only `.env` in the current working directory is read. Parent directories are not searched, and other tokens in the process environment are not silently used. To select a file explicitly:

```powershell
npm run sync -- --env-file C:\private\codex-activity.env
```

## Commands and integration files

| Command | Behavior |
| --- | --- |
| `npm run setup` | Checks Codex statistics and repository access, verifies the public tool revision, and generates files in `generated/`; does not change the remote repository or `.env` |
| `npm run status` | Checks collection and GitHub read access, showing the last upload time; no remote writes |
| `npm run sync` | Reads statistics, merges observed history, compares content, and uploads only changes |
| `node src/cli.mjs --help` | Shows command help without configuration or network access |

Files produced by `setup`:

| File | Purpose |
| --- | --- |
| `codex-activity.yml` | Workflow entry to copy to `.github/workflows/` in the Profile repository |
| `README-snippet.md` / `README-snippet.en.md` | Default Chinese / English Profile README snippets; choose one |
| `SETUP.md` / `SETUP.en.md` | Default Chinese / English integration instructions for local reference |

Run the updated `setup` to add bilingual instructions to older generated files. Neither `setup` nor `status` tests actual writing; the first `sync` verifies write access. Successful uploads and unchanged data return exit code 0; failures return 1. Upload success means the JSON was committed; SVG rendering still depends on Actions.

Only manual synchronization from one computer and one account is supported. There is no local scheduler or multi-device/account merging. Start independent history when changing accounts.

## Data and history

The tool maintains `data/codex/usage.json` in the Profile repository; Actions writes only `assets/codex-activity.svg`. Do not edit the statistics JSON manually.

- Preserve all history actually returned by the interface; do not assume a fixed window.
- Replace a date with its newest value, without adding counts. A shorter source window does not delete saved dates.
- An explicit 0 means zero usage; a missing date means `unknown`. Null daily buckets or collection failures do not overwrite remote files.
- Summary values may be `null`, displayed as `Unavailable`. Lifetime tokens use the official summary, never a sum inferred from limited daily records.
- Public fields are limited to schema version, source marker, lifetime tokens, streak days, and daily tokens. Account details and raw RPC are excluded.

## Time, themes, and daily redraw

`Last updated` is the Git commit time of the most recent statistics JSON change, representing the last actual upload. Unchanged data causes no upload or time change. A manual JSON edit makes its commit the new update time.

The workflow redraws the latest 52 weeks and marks the current day at approximately **00:17** in the display timezone each day. The local computer can be off. The template uses an IANA timezone schedule; 00:17 in Singapore equals 16:17 UTC on the preceding day. GitHub scheduling may be delayed, and scheduled workflows in inactive public repositories may be disabled.

Daily redraw does not query Codex or change `Last updated`. New dates without uploads remain `unknown`, and summaries retain their last-sync values. Official date buckets are preserved; the display timezone does not repartition daily statistics.

The default theme is `github-dark`. For a light theme, set `theme` to `github-light` in the Profile workflow entry; editing that entry triggers a redraw. The workflow and renderer are pinned to a full commit SHA. To upgrade, run the new version's `setup` and replace the Profile workflow entry.

## Failures and recovery

| Situation | Action |
| --- | --- |
| Codex not found | Set `CODEX_BIN` in `.env` to the absolute path of a compatible `codex.exe` |
| Cannot read login state or statistics | Check login in the original app or update the runtime; do not copy tokens manually |
| Invalid or expired token | Update the local `.env` and retry |
| 403, rate limit, or branch rule rejection | Check the target repository, Contents read/write permission, and repository policy, or wait for the limit to reset |
| Empty or missing repository | Create the Profile repository and commit a README to establish its default branch |
| Temporary network failure | The tool retries a limited number of times; sanitized pending statistics stay in local cache and merge on the next `sync` |
| Upload SHA conflict | The tool rereads, merges, and retries without force pushing |
| JSON uploaded but chart failed | Run Codex Activity manually in Profile Actions, or wait for the next daily run |
| Public revision validation fails or checkout cannot find SHA | Ensure the correct commit is pushed to the public tool repository, then rerun `setup` to update the entry |
| Daily workflow delayed or disabled | Check and re-enable it in Actions, or run it manually |

On Windows, cache is stored at `%LOCALAPPDATA%\codex-activity\<repository hash>\`, containing sanitized statistics and a sync lock, without tokens. Before the first successful upload, losing both cache and source history makes unarchived data unrecoverable. Do not treat this cache as disposable clutter.
