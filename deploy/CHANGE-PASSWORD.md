# FamilyRoot: Change Password in Settings

After the reviewed change is merged into the approved deployment branch and the
FamilyRoot Docker image is rebuilt, go to:

**https://192.168.1.44:15443 → Settings → Administrator password**

Enter the existing admin password, a new unique password of at least 16
characters and its confirmation. Use the HTTPS address, not localhost HTTP.
The server checks the current password and stores only a slow PBKDF2 hash in
the existing **familyroot-private-data** volume at
`/app/data/admin_password_hash.json`, with file mode 0600.

The old bootstrap Docker secret stops authenticating as soon as the new
password hash has been saved. New builds/restarts keep the current password.
The separate Flask signing secret is unchanged. The app's HTTP Basic
authentication uses browser-level credential caching; closing and reopening
the browser tab or browser may be necessary to enter the new password.

An invalid, unreadable or corrupted stored password hash **does not** fall
back to the previous bootstrap password. Recovery requires an administrator
with console access and a verified backup, not a browser password reset.

To apply after merge, run on Docker VM:

    cd /home/docker/familyroot-source
    git pull --ff-only origin deploy/familyroot-private-docker-2026-11-15
    sudo docker compose -f deploy/compose.private.yml -f deploy/compose.lan.yml up -d --build --no-deps familyroot

Do not remove any Docker volume. Never send your password or hash to chat
or GitHub.

For ongoing updates and guarded code rollback, the separate Anchor Hub
host deployment agent will take a FamilyRoot backup first. It never
automatically restores SQLite or media content when reverting code.

**Important:** existing users on the same LAN should not log into FamilyRoot
using the earlier unencrypted HTTP port. This implementation remains
administrator-only; it does not introduce family guest accounts or publish
records outside the home LAN.
