# Mac mini Docker / OrbStack deployment

The application runs as an always-on **label design, export and print server**.
The Linux container cannot directly access macOS Bluetooth; an optional
authenticated macOS host bridge prints to a nearby Phomemo T02 over RFCOMM.
Windows COM-port printing still requires the native Windows app.

On a Mac mini with Docker / OrbStack and an address on the trusted 10.0.0.0/24 LAN:

```sh
cd ~/Projects/t02-studio
printf 'T02_LAN_IP=10.0.0.9\n' > .env  # replace with your own Mac's LAN IP
docker compose up -d --build
docker compose ps
curl --fail http://10.0.0.9:8062/api/printer-profiles
```

Open **http://10.0.0.9:8062/** from this Mac mini's home LAN. For other installations, use their own LAN IP. By default the public Compose file binds to localhost only; the local, gitignored `.env` opts this Mac mini into the 10.0.0.9 LAN address.

The service has **no login** by design. Never expose port 8062 through a
router, internet tunnel or public reverse proxy. The Compose port mapping
binds explicitly to the selected Mac mini LAN IP. The app retains the existing
trusted-network and same-origin checks. It sends print jobs only when a supported Windows COM port or the optional
macOS Bluetooth bridge has been configured.

`restart: unless-stopped` brings the container back after the container engine
starts. OrbStack itself must start automatically after macOS boots/user login.

Updates:

```sh
cd ~/Projects/t02-studio
git pull --ff-only
docker compose up -d --build
```

Logs and recovery:

```sh
docker compose ps
docker compose logs --tail 100
docker compose restart
docker compose down  # stops; does not remove browser projects
```

Projects/autosave live in each **browser's local storage**, keyed by its URL.
Switching from `http://10.0.0.10:8062` to `http://10.0.0.9:8062`
does not migrate drafts automatically. Export a JSON project from the previous
address and import it on the Mac mini site; save another JSON copy regularly.

## macOS Bluetooth printing (Phomemo T02)

On the Mac mini, compile the bundled native Bluetooth transport:

```sh
mkdir -p build/mac
swiftc scripts/mac/t02-rfcomm.swift -o build/mac/t02-rfcomm
```

Add the following to a local, untracked `.env` file (mode `0600`),
alongside the existing `T02_LAN_IP`. Generate your own random bridge token,
for example with `python3 -c 'import secrets; print(secrets.token_urlsafe(40))'`:

```sh
T02_BRIDGE_TOKEN=YOUR_RANDOM_32_PLUS_CHARACTER_TOKEN
T02_BT_ADDRESS=YOUR_T02_BLUETOOTH_ADDRESS
```

Start `/usr/bin/python3 -u scripts/mac/bridge_server.py` from a
Bluetooth-authorized **interactive macOS user session**. On macOS 26.2,
a headless LaunchAgent may start the HTTP server but its Swift Bluetooth
subprocess can stall during CoreBluetooth authorization. Do not assume a
LaunchAgent is hardware-verified simply because `/health` responds.
The Mac mini installation has been verified from an interactive session;
automatic printing after a reboot remains subject to macOS Bluetooth
privacy authorization. Keep the bridge bound to `127.0.0.1:8063`.
The OrbStack `host.docker.internal` alias forwards requests to this
loopback-only listener. Do not bind the bridge to `0.0.0.0` or expose
port 8063 to the Internet.

Then run `docker compose up -d --build`. The Compose file forwards the
bridge token to the container in its environment (not to the browser).
The printer picker lists `MAC_T02` only while the authenticated bridge
health endpoint responds. No physical print is sent by discovery;
the UI's Print button sends a single selected print job. As with the
Windows transport, a successful write does not prove that paper emerged,
so verify the actual slip before reprinting.

If the bridge is unavailable, exports continue working normally.
For diagnostics: `curl http://10.0.0.9:8062/api/printers`,
`launchctl print gui/$(id -u)/dev.flyz.t02-bridge`, and
`tail -n 50 ~/Library/Logs/t02-bridge.log`.
