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
| `ACTIVITY_THEME` | No | `github-dark` (default) or `github-light`; applied by the next `sync` |
| `ACTIVITY_LANGUAGE` | No | `en` (default) or `zh-CN`; applied by the next `sync` |

Empty theme and language settings use their defaults. Unsupported values fail before network access. These settings affect chart appearance and language only; documentation and CLI language are unchanged.

By default, only `.env` in the current working directory is read. Parent directories are not searched, and other tokens in the process environment are not silently used. To select a file explicitly:

```powershell
npm run sync -- --env-file C:\private\codex-activity.env
```

## Commands and integration files

| Command | Behavior |
| --- | --- |
| `npm run setup` | Checks Codex statistics and repository access, verifies the public tool revision, and generates files in `generated/`; does not change the remote repository or `.env` |
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

Upgrade the local scripts, release pointer, and Profile workflow together. `setup` prefers `ref` in `templates/release.json`; it neither chooses the newest commit automatically nor uploads files from `generated/` to the Profile.

1. Obtain the maintainer's updated release in the local tool directory. For a Git installation, run the following; for a source package, replace it with the updated package while keeping your own `.env`:

   ```powershell
   git pull --ff-only
   Get-Content templates/release.json
   ```

   Tool maintainers must first complete the [release procedure](./development.en.md#release-procedure): commit the implementation, run `node scripts/release.mjs`, commit the metadata, and push to the public tool repository. `git commit` saves locally only; `ahead` in `git status -sb` means commits remain unpushed. Regular users should obtain a maintainer-prepared release and do not need to run the release script themselves.

2. Set the desired theme and language in `.env`, for example `ACTIVITY_THEME=github-dark` and `ACTIVITY_LANGUAGE=zh-CN`. Regenerate and inspect the integration files:

   ```powershell
   npm run setup
   Select-String -Path generated/codex-activity.yml -Pattern 'uses:|tool_ref:|data/codex/config.json'
   ```

   The full SHA after `@` in `uses` and the `tool_ref` value must both match `ref` in `templates/release.json`. That revision must contain the desired feature and be publicly readable on GitHub. Display configuration support also requires the `data/codex/config.json` trigger path. If the SHA is still old, the maintainer must update release metadata; repeatedly copying the same old entry will not upgrade the renderer.

3. Fully replace `.github/workflows/codex-activity.yml` in the **Profile repository** with the newly generated `generated/codex-activity.yml`, then commit and push to the Profile's default branch. Alternatively, edit and commit the file on GitHub. The tool and Profile repositories are separate; updating the former does not update the latter. Inspect the final file on GitHub to verify the SHA and trigger path, rather than checking only the local generated file.

4. Return to the local tool directory and run:

   ```powershell
   npm run sync
   ```

   A changed workflow entry triggers a redraw. `sync` also triggers a redraw when statistics or display settings change. If the replacement entry, statistics, and settings are all unchanged, there is no new commit or run.

5. In the Profile repository, open **Actions → Codex Activity** and inspect the new run associated with the upgrade commit. For an immediate redraw, choose **Run workflow** on the default branch. If no run appears, check that the remote workflow actually changed and was committed to the default branch. If a successful run still produces the old chart, inspect its actual tool SHA, then the remote `data/codex/config.json` and `assets/codex-activity.svg`. If the remote SVG changed but the README still shows the old image, refresh and allow time for the image cache to update.

After upgrading, everyday theme and language changes require only editing `.env` and running `npm run sync`. Renderer upgrades and timezone changes still require regenerating and replacing the workflow entry.

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

Even with unchanged statistics, `sync` separately compares and uploads changed display settings, triggering an Actions redraw. If neither file changes, nothing is committed. Actions prefers `data/codex/config.json`; if absent, it uses the workflow's `theme` and English. Invalid configuration stops publication. The update time still comes from the statistics file's commit.

For an existing Profile, follow [Upgrading the scripts](#upgrading-the-scripts) to verify the release, replace the entry, and check the remote result. The workflow and renderer are pinned to a full commit SHA; updating local code alone does not upgrade the remote renderer. Later theme and language changes do not require `setup`. Timezone changes still require regenerating and replacing the workflow entry.

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
| Public revision validation fails or checkout cannot find SHA | Ensure the correct commit is pushed to the public tool repository, then rerun `setup` to update the entry |
| Daily workflow delayed or disabled | Check and re-enable it in Actions, or run it manually |

On Windows, cache is stored at `%LOCALAPPDATA%\codex-activity\<repository hash>\`, containing sanitized statistics and a sync lock, without tokens. Before the first successful upload, losing both cache and source history makes unarchived data unrecoverable. Do not treat this cache as disposable clutter.
