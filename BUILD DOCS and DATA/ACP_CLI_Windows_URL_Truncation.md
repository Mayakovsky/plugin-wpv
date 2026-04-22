# ACP CLI `add-signer` silently fails on Windows — URL truncation in `openBrowser`

## Summary

On Windows, `acp-cli`'s `agent add-signer` command repeatedly times out at the browser-approval step even though the backend correctly registers the signer request. The command's auto-launched browser window receives a truncated URL with the `publicKey` query parameter stripped, so the Virtuals SPA cannot render the approval modal. Console shows no errors because the page loads normally — it simply has no material to approve against.

The fix is a one-line change in `src/lib/browser.ts`.

## Symptoms

Running on Windows:

```
npm run acp -- agent add-signer
```

Observable behavior:

1. CLI generates a P256 keypair and a request ID, prints the full approval URL to the terminal, and states "Opening browser to verify the public key and approve the signer..."
2. Default browser opens to the agent page
3. **No approval modal appears**
4. Browser DevTools shows no errors in Console or Network
5. After 5 minutes, the CLI prints `Error: Signer registration timed out. Please try again.`

This repeats indefinitely regardless of browser choice, extension state, cookie policy, incognito/normal mode, wallet login state, or whether the user is on the correct agent page.

## Root cause

`src/lib/browser.ts` opens URLs on Windows via:

```ts
execFile("cmd", ["/c", "start", "", url]);
```

`cmd.exe` re-parses its command line after receiving it, and `&` is a command separator in cmd. Any URL containing `&` is truncated at the first `&`. The approval URL constructed in `runAddSignerFlow` is of the form:

```
https://app.virtuals.io/acp/agents/{agentId}?action=add-signer&requestId={requestId}&publicKey={publicKey}
```

The browser actually receives only:

```
https://app.virtuals.io/acp/agents/{agentId}?action=add-signer
```

`requestId` and `publicKey` are silently dropped. The Virtuals SPA loads the agent page normally, but has no `publicKey` to surface in a modal, so the approval UI never appears.

## Why this was hard to diagnose

- The CLI prints the **complete** URL to the terminal before calling `openBrowser`, so a manual paste out of the terminal into a fresh browser tab works correctly. Users who didn't realize the auto-opened window was a different URL than the one printed kept retrying the same broken auto-open path.
- The backend correctly registers the pending request (the CLI → backend hop is unaffected), so direct API probes of `GET /agents/{id}/signer?requestId={requestId}` return `status: "pending"` — which superficially looks fine.
- The SPA shows no errors because, from its perspective, it received a valid URL for a valid agent and rendered the page accordingly.
- The bug is 100% Windows-specific. macOS uses `open [url]` and Linux uses `xdg-open [url]`, both of which pass arguments directly to the underlying process without a shell re-parse.

## Workaround

Do not rely on the CLI's auto-opened browser window. Instead:

1. Run `npm run acp -- agent add-signer` (or with `--agent-id <id>`)
2. **Close the auto-opened browser tab immediately**
3. Copy the full URL printed by the CLI under the `Opening browser...` line
4. Paste it into a fresh browser tab where you are logged in with the owner wallet
5. Approve in the modal as normal

This confirms the signer request end-to-end without modifying CLI code.

## Fix

**File:** `src/lib/browser.ts`

Replace the Windows branch to bypass `cmd.exe` entirely:

```diff
 export function openBrowser(url: string): void {
   if (process.platform === "win32") {
-    execFile("cmd", ["/c", "start", "", url]);
+    execFile("rundll32", ["url.dll,FileProtocolHandler", url]);
   } else if (process.platform === "darwin") {
     execFile("open", [url]);
   } else {
     execFile("xdg-open", [url]);
   }
 }
```

`rundll32 url.dll,FileProtocolHandler <url>` is the canonical Win32 "open URL in default browser" call. It does not route through a shell, so no metacharacter re-parsing occurs and the URL reaches the browser intact. Stable since Windows NT; used by many CLIs for the same reason (e.g., `open` crate in Rust, `webbrowser` module in Python on some versions).

## Alternative fixes considered

| Option | Change | Verdict |
|---|---|---|
| A — Quote the URL in the cmd argument: `execFile("cmd", ["/c", "start", "", \`"${url}"\`])` | Preserves existing invocation shape | Fixes `&` truncation only; leaves URLs routed through `cmd.exe`, which interprets other metacharacters (`^`, `\|`, `<`, `>`, `%`). Base64 publicKeys rarely contain these, but defensive fix avoids a future surprise. |
| **B — `rundll32 url.dll,FileProtocolHandler` (chosen)** | Removes `cmd.exe` from the chain entirely | Root-cause fix. Not dependent on shell quoting rules. Same diff size as A. |
| C — PowerShell `Start-Process` | Avoids `cmd.exe` | Works, but PowerShell startup is heavier and has its own metacharacter quirks. |

Option B was selected because it has the same code footprint as A while eliminating an entire class of shell-related bugs.

## Verifying the fix

After applying, run `add-signer` again. The auto-opened browser window should now load directly onto the correct URL with all three query parameters (`action`, `requestId`, `publicKey`), and the approval modal should appear without requiring a manual URL paste.

## Recommendation to the Virtuals team

This is a one-line, low-risk change that unblocks every Windows user of the CLI. Willing to open a PR against `github.com/Virtual-Protocol/acp-cli` with the fix above if that's the preferred channel. Happy to also add a brief note to the `add-signer` command's `--help` output pointing users to copy the printed URL manually as a fallback, in case any downstream environment strips `execFile` arguments.
