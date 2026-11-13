# Mac mini Docker / OrbStack deployment

The application runs as an always-on **label design and export server**. This
Linux container does **not** access Windows Bluetooth COM ports and cannot
print to a T02 paired with Mainframe; continue using Mainframe's Windows app
when printing or implement a separate authenticated local print bridge.

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
trusted-network and same-origin checks. It does not transmit print jobs
unless a host with supported Windows COM ports runs the print backend.

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
