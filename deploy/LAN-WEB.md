# Launch Family Database from Anchor Hub — HTTPS home-LAN mode

The existing Family Database is already running on the Docker VM. This optional
Compose overlay adds a small **Caddy HTTPS reverse proxy** at:

**https://192.168.1.44:15443**

Anchor Hub's Ecosystem page has a **Launch Family Database** link to that address.
The deployment retains FamilyRoot's existing SQLite/photo Docker volumes and its
localhost-only `127.0.0.1:15050` backend. It does **not** publish unencrypted
Basic-auth HTTP to the LAN.

## On Docker VM (192.168.1.44)

First, from your existing source checkout, fetch and check out the reviewed LAN
branch (don't reclone or delete the Docker volumes):

    cd /home/docker/familyroot-source
    git fetch origin deploy/familyroot-lan-web-2026-11-16
    git switch --track origin/deploy/familyroot-lan-web-2026-11-16

If you already track the branch, use `git pull --ff-only` instead. Avoid typing
your GitHub account password for private repository authentication.

Check the final Compose stack; it must show both `familyroot` and
`familyroot-web` before proceeding:

    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml config --quiet
    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml config --services

Then start the proxy **and export the local CA certificate** without deleting any data volume:

    sudo bash deploy/start-lan-web.sh

The helper prints a SHA-256 certificate fingerprint and saves `deploy/familyroot-ca.crt` locally. It does not expose the CA private key or any family account passwords.
    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml ps

The new Caddy container listens on **192.168.1.44:15443** on the Docker VM
and forwards to FamilyRoot only over the private Compose bridge network.
A router port-forward must **not** point to 15443. If your host firewall
blocks 15443, allow it only from your trusted home LAN subnet.

## TLS trust on Windows

The first browser visit will report an **untrusted local certificate**. The
service has HTTPS encryption, but the local CA is not yet trusted by Windows.
For a clean browser launch without warnings, get the CA file from Caddy:

On Docker VM:

    sudo docker cp familyroot-lan-web:/data/caddy/pki/authorities/local/root.crt /home/docker/familyroot-source/deploy/familyroot-ca.crt
    sudo chmod 644 /home/docker/familyroot-source/deploy/familyroot-ca.crt
    openssl x509 -in /home/docker/familyroot-source/deploy/familyroot-ca.crt -noout -fingerprint -sha256

Record that SHA-256 fingerprint. On Windows PowerShell, copy the certificate:

    scp docker@192.168.1.44:/home/docker/familyroot-source/deploy/familyroot-ca.crt "$env:USERPROFILE\Downloads\familyroot-ca.crt"

Before trusting it, confirm the file fingerprint matches the Docker VM.
If you trust this host and its CA private keys, install for the current user:

    certutil -user -addstore Root "$env:USERPROFILE\Downloads\familyroot-ca.crt"

Trusting any new root CA is a significant security decision: it allows
certificates issued by that CA to be trusted on the Windows account. Only
install this certificate if you control the Docker VM and have verified
the fingerprint over your SSH session. The CA stays on the Docker VM's
persistent Docker volume; do not copy the **private key** anywhere.
Alternatively, use the existing SSH tunnel without importing a CA.

The secure website is then: **https://192.168.1.44:15443**.
Log in with **admin** and your existing FamilyRoot administrator password.

## Verification / rollback

From the Docker VM:

    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml ps
    curl -k --silent --show-error https://192.168.1.44:15443/api/health

The `curl -k` check is only a diagnostic and does **not** verify the
certificate; the normal browser should use the trusted CA as above.
Expect JSON with `status: ok` and `db: true`.

Stop only the HTTPS proxy if needed:

    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml stop familyroot-web

To resume:

    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml up -d familyroot-web

Do not use `down -v` or remove any Docker named volumes.

## Security notes

- HTTPS on the LAN is important because FamilyRoot uses HTTP Basic login.
- This is a *home-network* deployment, not public hosting; don't forward
  this port from your router or publish it to a cloud proxy.
- Private records remain in FamilyRoot's Docker volumes, not Anchor Hub.
- Browser availability depends on LAN routing/firewall and client CA trust.
- The app still needs full browser/authorization assessment before remote
  Internet access or non-admin user sharing.
