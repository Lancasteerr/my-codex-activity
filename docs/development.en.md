# Development and releases

[简体中文（默认）](./development.md) | **English** | [Home](../README.en.md)

## Project layout

```text
.
├── README.md / README.en.md       # Default Chinese and English entry points
├── docs/                         # Bilingual documents paired by topic
├── src/                          # CLI, collection, upload, and rendering
├── tests/                        # Built-in Node tests and synthetic fixtures
├── scripts/                      # Preview generation and release preparation
├── templates/                    # Profile workflow template and pinned release
├── examples/                     # Chinese and English SVG previews in dark and light themes
├── .github/workflows/             # CI checks and reusable rendering workflow
├── .env.example                  # Bilingual configuration without credentials
├── package.json                  # Commands, Node requirement, package allowlist
└── LICENSE                       # Original MIT license
```

Local `.env`, `.idea/`, and `generated/` are ignored and are not release source files.

| Module | Responsibility |
| --- | --- |
| `src/cli.mjs` | Coordinates `setup`, `status`, and `sync` |
| `src/config.mjs`, `src/errors.mjs` | Configuration allowlist, path constants, safe errors |
| `src/collector.mjs` | Discovers Codex and reads statistics through App Server |
| `src/data.mjs`, `src/state.mjs` | Public-data normalization, history merging, pending cache, process lock |
| `src/github.mjs`, `src/git.mjs` | GitHub Contents API, conflict recovery, Git subprocess wrapper |
| `src/setup.mjs` | Pinned revision checks, Profile workflow and bilingual file generation |
| `src/render.mjs`, `src/ci.mjs` | SVG rendering, upload time lookup, publishing inside Actions |

Data flow: local Codex → allowlisted statistics → merge local cache and remote history → Profile JSON → Actions → Profile SVG. Scheduled Actions does not connect to the local computer or Codex.

## Development checks

Use Node.js **24.10+** and Git. No dependency installation is required.

```powershell
npm test
npm run render:example
npm pack --dry-run
```

Four test groups cover secret protection and integration files, history and deduplication, statistics and display configuration upload recovery, and bilingual charts with upload timing. Tests use synthetic data and mocked networking, without `.env` or real credentials. `render:example` rebuilds four Chinese/English, dark/light documentation previews using a fixed date and synthetic data.

Update both language versions when changing documentation, and check language switches, relative links, and commands. `README.md` and files without `.en` remain the default Chinese entry points. Preserve the original MIT license.

## Retention and cleanup

| File type | Policy |
| --- | --- |
| `src/`, `tests/`, `scripts/`, `templates/`, workflows | Keep: all support implementation, validation, or releases; lack of a direct README link does not make them unused |
| `examples/*.svg` | Keep and commit for documentation previews; rebuild with `npm run render:example` |
| `.env` | Keep local credentials and ignore them; never remove as part of general cleanup |
| `.idea/` | Keep local IDE settings and ignore the whole directory |
| `generated/` | Keep and ignore local integration files; regenerate with `npm run setup` |
| `*.tgz` | Ignore local package artifacts; delete obsolete packages when no longer needed and recreate with `npm pack` |
| `node_modules/`, `.cache/`, `coverage/`, `dist/`, logs | Ignore generated and temporary files; remove after confirming they contain nothing needed |
| Pending cache in the user data directory | Keep: it may contain history not yet uploaded and is not disposable cache |

npm uses the `files` allowlist in `package.json`, including runtime source, the release preparation script, templates, previews, bilingual documentation, `.env.example`, and the license. Tests, IDE settings, local integration files, and the real `.env` are excluded.

## Release procedure

The current tool repository is `Lancasteerr/my-codex-activity`. When changing it, update both the repository in `package.json` and the renderer checkout repository in `.github/workflows/render.yml` before preparing a release.

1. Complete checks and commit implementation and documentation, leaving a clean working tree.
2. With a clean working tree, run the release script to pin `ref` in `templates/release.json` to the implementation commit, then commit the metadata:

   ```powershell
   node scripts/release.mjs
   git add templates/release.json
   git commit -m "chore: pin release source revision"
   npm pack --dry-run
   ```

   `node scripts/release.mjs` updates local metadata only. It does not commit, push, or update the Profile. The metadata commit SHA normally differs from the implementation SHA recorded inside it; ensure the referenced implementation contains the desired feature.

3. Review the package manifest; run `npm pack` if a local package is needed. Push both the implementation and metadata commits to the public tool repository. Its current default branch is `main`:

   ```powershell
   git push origin main
   git ls-remote origin refs/heads/main
   ```

   Compare with `git log -1 --format=%H` to confirm the remote branch received the latest commit. `ahead` in `git status -sb` means commits remain unpushed. If distributing an npm or source package, rebuild and publish it too so users receive the updated metadata. The release script does not perform these operations automatically.
4. Before running `setup`, push the referenced implementation commit to the public tool repository. `setup` anonymously verifies public visibility, the pinned commit's `workflow_call` entry, and the matching internal checkout repository. Failure prevents new integration files from being generated.
5. Follow [Upgrading the scripts](./usage.en.md#upgrading-the-scripts): run `setup`, confirm both generated `uses` and `tool_ref` match the metadata's `ref`, then replace, commit, and push the Profile workflow to its default branch. Verify that the upgrade commit triggers a new run in Profile Actions; local generation alone does not complete the upgrade.

`templates/release.json` points to a full implementation commit SHA for package installations without `.git`. With valid metadata, `setup` prefers that pinned revision rather than automatically using the newest working-tree changes. Only unavailable metadata triggers a fallback to the current Git commit. Mutable branches and tags are never used as revision references.

For example, code may support Chinese rendering while `ref` still points to an older commit that cannot read language settings. In that case, `setup` can succeed while generating an old renderer reference. Update and publish the metadata before rerunning `setup`; pushing implementation code or changing documentation alone does not update that pointer.

## References

- [Codex App Server and account/usage/read](https://learn.chatgpt.com/docs/app-server)
- [GitHub Contents API and fine-grained token permissions](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [GitHub reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [GITHUB_TOKEN and workflow triggers](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub schedule behavior and limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
