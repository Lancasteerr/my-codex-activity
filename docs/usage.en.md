# Usage

[简体中文（默认）](./usage.md) | **English** | [Home](../README.en.md)

Start with the [quick start](../README.en.md#quick-start). See [Privacy and credentials](./security.en.md) for credential and public-data boundaries.

## Configuration

| Setting | Required | Description |
| --- | --- | --- |
| `GITHUB_TOKEN` | Yes | Fine-grained token selecting only the target repository, with Contents read/write access |
| `GITHUB_REPOSITORY` | Yes | Existing `owner/repo`, using its default branch; URLs are not accepted |
| `TOOL_REPOSITORY` | No | Public upstream in `owner/repo` format, always following `main`; empty uses `Lancasteerr/my-codex-activity` from package metadata |
| `CODEX_BIN` | No | Absolute path to `codex.exe`; empty means automatic discovery |
| `TIMEZONE` | No | IANA display timezone, such as `Asia/Singapore`; empty uses the computer's timezone |
| `ACTIVITY_THEME` | No | `github-dark` (default) or `github-light`; applied by the next `sync` |
| `ACTIVITY_LANGUAGE` | No | `en` (default) or `zh-CN`; applied by the next `sync` |

Empty theme and language settings use their defaults. Unsupported values fail before network access. These settings affect chart appearance and language only; documentation and CLI language are unchanged.

`TOOL_REPOSITORY` accepts only a repository address, without a URL, `@branch`, tag, or commit SHA; invalid formats fail before network access. A custom repository must be public and provide a compatible composite Action on `main`. After changing it, run `npm run setup`, replace the Profile workflow, then commit and push it; `npm run sync` does not update the workflow. Leave it empty to restore the default upstream, then regenerate and replace the workflow in the same way.

By default, only `.env` in the current working directory is read. Parent directories are not searched, and other tokens in the process environment are not silently used. To select a file explicitly:

```powershell
npm run sync -- --env-file C:\private\codex-activity.env
```

## Commands and integration files

| Command | Behavior |
| --- | --- |
| `npm run setup` | Checks Codex statistics and repository access, checks the public Action, and generates files in `generated/`; does not change the remote repository or `.env` |
| `npm run status` | Checks collection and GitHub read access, showing the last upload time; no remote writes |
| `npm run sync` | Syncs statistics history, then theme and language; uploads each file only when changed |
| `node src/cli.mjs --help` | Shows command help without configuration or network access |

Files produced by `setup`:

| File | Purpose |
| --- | --- |
| `codex-activity.yml` | Workflow entry to copy to `.github/workflows/` in the Profile repository |
| `README-snippet.md` / `README-snippet.en.md` | Default Chinese / English Profile README snippets; choose one |
| `SETUP.md` / `SETUP.en.md` | Default Chinese / English integration instructions for local reference |

Run the updated `setup` to add bilingual instructions to older generated files. Neither `setup` nor `status` tests actual writing; the first `sync` verifies write access. Successful uploads and unchanged data return exit code 0; failures return 1. Upload success means the JSON was committed; SVG rendering still depends on Actions.

Only manual synchronization from one computer and one account is supported. There is no local scheduler or multi-device/account merging. Start independent history when changing accounts.

## Upgrading the scripts

Existing integrations need a one-time migration:

1. Obtain the updated local tool. For a Git installation, run `git pull --ff-only`; for a source package, replace it with the new package while keeping your own `.env`.
2. Run `npm run setup`. Fully replace `.github/workflows/codex-activity.yml` in the **Profile repository** with `generated/codex-activity.yml`, then commit and push to the default branch. The new entry references a single `<tool-repository>@main` Action.
3. Run `npm run sync` in the tool directory and check **Actions → Codex Activity** in the Profile repository. A changed workflow entry also triggers a redraw itself.

After migration:

- **Renderer updates**: maintainers push compatible code to the tool repository's `main`; the next Actions run adopts it without `setup`. A tool repository push does not immediately trigger Profile rendering.
- **Local script updates**: run `git pull --ff-only` for a Git installation, or replace the source package while keeping `.env`.
- **Theme or language changes**: edit `.env` and run `npm run sync`.
- **Timezone changes**: rerun `setup`, then replace and commit the Profile workflow so the daily schedule and display timezone change together.
- **Upstream repository changes**: edit `TOOL_REPOSITORY` in `.env`, rerun `setup`, then replace and commit the Profile workflow; each run uses the selected repository's latest `main` commit.
- **Immediate redraw**: choose `Run workflow` in Profile Actions. When statistics and settings are unchanged, `sync` makes no commit and triggers no new run.

Upload success means the JSON was committed; Actions still needs to generate the image. If the remote SVG changed but the Profile shows the old image, refresh and allow time for the image cache to update. `Last updated` means statistics upload time, not redraw time.

## Data and history

The tool maintains `data/codex/usage.json` and `data/codex/config.json` in the Profile repository. The latter contains only public `theme` and `language` settings. Actions writes only `assets/codex-activity.svg`. Do not edit the statistics JSON manually.

- Preserve all history actually returned by the interface; do not assume a fixed window.
- Replace a date with its newest value, without adding counts. A shorter source window does not delete saved dates.
- An explicit 0 means zero usage; a missing date means `unknown`. Null daily buckets or collection failures do not overwrite remote files.
- Summary values may be `null`, displayed as `Unavailable` / `暂无数据`. Lifetime tokens use the official summary, never a sum inferred from limited daily records.
- Public fields are limited to schema version, source marker, lifetime tokens, streak days, daily tokens, theme, and language. Account details and raw RPC are excluded.

## Time, themes, language, and daily redraw

`Last updated` / `最后更新` is the Git commit time of the most recent statistics JSON change, representing the last actual upload. Unchanged statistics cause no data upload or time change. Changing only theme or language does not change this time. A manual statistics JSON edit makes its commit the new update time.

The workflow redraws the latest 52 weeks and marks the current day at approximately **00:17** in the display timezone each day. The local computer can be off. The template uses an IANA timezone schedule; 00:17 in Singapore equals 16:17 UTC on the preceding day. GitHub scheduling may be delayed, and scheduled workflows in inactive public repositories may be disabled.

Daily redraw does not query Codex or change `Last updated`. New dates without uploads remain `unknown`, and summaries retain their last-sync values. Official date buckets are preserved; the display timezone does not repartition daily statistics.

The default theme is `github-dark` and the default language is `en`. Set these values in your local `.env`, then run `npm run sync`:

```dotenv
ACTIVITY_THEME=github-light
ACTIVITY_LANGUAGE=zh-CN
```

Even with unchanged statistics, `sync` separately compares and uploads changed display settings, triggering an Actions redraw. If neither file changes, nothing is committed. Actions uses `data/codex/config.json`; if absent, it uses the default dark theme and English. Invalid configuration stops publication. The update time still comes from the statistics file's commit.

After the one-time migration in [Upgrading the scripts](#upgrading-the-scripts), rendering follows the tool repository's `main`. Theme and language changes do not require `setup`. Timezone changes still require regenerating and replacing the workflow entry.

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
| Statistics sync completed but display configuration sync failed | Fix network or permission issues and rerun `sync`; completed statistics uploads are not rolled back |
| Invalid display configuration file | Correct `data/codex/config.json` to a valid `theme` and `language` object, or delete it and rerun `sync` to recreate it |
| Public Action check fails | Ensure the tool repository is public and `action.yml` is published on `main`, then rerun `setup` |
| Daily workflow delayed or disabled | Check and re-enable it in Actions, or run it manually |

On Windows, cache is stored at `%LOCALAPPDATA%\codex-activity\<repository hash>\`, containing sanitized statistics and a sync lock, without tokens. Before the first successful upload, losing both cache and source history makes unarchived data unrecoverable. Do not treat this cache as disposable clutter.
