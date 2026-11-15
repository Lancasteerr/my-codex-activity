# Development and releases

[简体中文（默认）](./development.md) | **English** | [Home](../README.en.md)

## Project layout

```text
.
├── README.md / README.en.md       # Default Chinese and English entry points
├── docs/                         # Bilingual documents paired by topic
├── src/                          # CLI, collection, upload, and rendering
├── tests/                        # Built-in Node tests and synthetic fixtures
├── scripts/                      # Preview generation
├── templates/                    # Profile workflow template
├── examples/                     # Chinese and English SVG previews in dark and light themes
├── .github/workflows/             # CI check workflow
├── action.yml                    # Composite Action following main
├── .env.example                  # Bilingual configuration without credentials
├── package.json                  # Commands, Node requirement, package allowlist
└── LICENSE                       # Original MIT license
```

Local `.env`, `.idea/`, and `generated/` are ignored and are not release source files.

| Module | Responsibility |
| --- | --- |
| `src/cli.mjs` | Coordinates `setup`, `status`, and `sync` |
| `src/chart-options.mjs`, `src/config.mjs` | Themes, languages, defaults, configuration validation, path constants |
| `src/errors.mjs` | Safe errors |
| `src/collector.mjs` | Discovers Codex and reads statistics through App Server |
| `src/data.mjs`, `src/state.mjs` | Public-data normalization, history merging, pending cache, process lock |
| `src/github.mjs`, `src/git.mjs` | GitHub Contents API, conflict recovery, Git subprocess wrapper |
| `src/setup.mjs` | Public Action checks, Profile workflow and bilingual file generation |
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

npm uses the `files` allowlist in `package.json`, including runtime source, the Action entry, templates, previews, bilingual documentation, `.env.example`, and the license. Tests, IDE settings, local integration files, and the real `.env` are excluded.

## Release procedure

Maintain the tool repository address only in `repository` in `package.json`. `setup` derives `<tool-repository>@main` from it, and the Action runs its own code without a second source repository address.

1. Run the development checks, then commit implementation and matching documentation.
2. Push compatible updates to `main` in the public tool repository; `action.yml` and runtime source are published together.
3. Migrated Profiles use the update on the next Actions run, without a release pointer or metadata commit. After the first Action publication, existing integrations replace their workflow once using [Upgrading the scripts](./usage.en.md#upgrading-the-scripts).
4. Use `npm pack` for a source package. Update the package version as needed when publishing to npm; it does not select the Actions version.

Local changes use `master` by default; publication still targets remote `main`. For example, after reviewing the changes, run `git push origin master:main`. Use a normal fast-forward push, never a force push.

Following `main` applies compatible updates automatically, so preserve the existing tests and Action inputs before publishing. Historical commits referenced by old workflows remain available. Migration does not rewrite statistics history or change upload-time semantics.

## References

- [Codex App Server and account/usage/read](https://learn.chatgpt.com/docs/app-server)
- [GitHub Contents API and fine-grained token permissions](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
- [GitHub composite actions](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax#runs-for-composite-actions)
- [GITHUB_TOKEN and workflow triggers](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub schedule behavior and limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
