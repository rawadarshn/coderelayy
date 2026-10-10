# CodeRelay — real-time team editor, no database

CodeRelay is a small web app where a team shares a QR code/link and edits the same code live.

## Features
- Real-time collaborative editor powered by Socket.IO
- QR code and copyable room URL
- Owner-only editing lock: visitors can still view and copy code when locked
- Owner control token is stored in the owner browser; keep that browser profile private
- Any programming language or plain text (language picker is only a label)
- No login, database, Supabase, file persistence, or edit history
- Active rooms and code live only in server memory
- Simple Terms & Conditions dialog
- Splash screen: "Built by Adarsh"

## Run on Windows
1. Install Node.js (18 or newer).
2. Extract this ZIP.
3. Open PowerShell in the extracted `coderelay` folder.
4. Run `npm install`.
5. Run `node .\server.js` (this direct command avoids some broken npm `script-shell` settings).
6. Open http://localhost:3000.

If `npm install` fails with an ENOENT path pointing to Apache Maven, run:
```powershell
npm config delete script-shell
Remove-Item Env:npm_config_script_shell -ErrorAction SilentlyContinue
npm install
```
Then start with `node .\server.js`.

## Share with people over the internet
`localhost` works only on your own computer. To invite people anywhere, deploy this Node.js app to a host that supports WebSockets. The QR code will then contain the deployed public URL. Do not use a static-only hosting service.

## Important no-database behavior
- Workspace contents are held only in server memory.
- Server restart/redeploy/sleep can remove every active room.
- No code snapshots or edit history are saved.
- Anyone who has a workspace link can edit while the room is unlocked. The owner can lock editing; the server rejects edit events from non-owners while locked. Viewers can still read and copy code.
- The owner lock is an editing permission feature, not content encryption. The code remains readable to everyone in the room. The owner token is stored in local browser storage, so clearing site data or switching browsers may remove owner controls; keep the owner browser private.
- This prototype sends the full current editor text to other clients. Simultaneous typing is last-update-wins, not Google Docs-style character-level conflict resolution. For a small team, coordinate if two people type at exactly the same time.
- Do not paste passwords, API keys, private keys, or confidential code into shared rooms.
