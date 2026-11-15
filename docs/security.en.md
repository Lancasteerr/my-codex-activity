# Privacy and credentials

[简体中文（默认）](./security.md) | **English** | [Home](../README.en.md)

## Local credentials

`.env` is a plaintext local configuration file and should stay on your own computer. Git ignores it, and npm packages and generated integration files exclude it. The tool does not create an `.env` containing a real token or copy the token into cache, the global process environment, or Codex child processes.

Create an expiring fine-grained token for only the target Profile repository with **Contents: Read and write**. This permission covers the selected repository, rather than only the statistics file. Workflows permission is unnecessary.

Do not add `.env` to the Profile repository, bypass ignore rules with `git add -f`, or send tokens in chats or issues. To rotate or replace credentials, update only the local configuration.

## Collection and upload boundaries

GitHub uploads use native `fetch` against the official API and reject HTTP redirects. Codex collection uses the runtime's own login state. The tool does not read, copy, or upload `auth.json`, create conversations, or run models. Public tool revision verification does not send the Profile token.

Public data is reconstructed from an explicit field allowlist: schema version, source marker, lifetime tokens, streak days, and daily tokens. Raw accounts, email addresses, cookies, API keys, and token fields are not copied. Logs do not expose raw responses, request headers, configuration objects, or upstream exceptions.

Statistics commits use the target repository owner's GitHub noreply email to keep private primary email addresses out of public commit metadata. This identity does not replace token authentication.

## Actions and local cache

Actions uses only GitHub's temporary `GITHUB_TOKEN`. It needs no local token, Codex login state, or additional repository Secrets. Its role is to redraw and commit the SVG.

Local cache contains only sanitized statistics and a process lock, without tokens. See [Usage](./usage.en.md#failures-and-recovery) for cache locations and recovery behavior. Integration files in `generated/` contain no token, but do include the target repository and display timezone, so they remain local and Git-ignored.
