# Discord Bot

A discord.js bot with slash commands, hosted on this machine via systemd.

## First-time setup (you do this part once)

1. Go to https://discord.com/developers/applications → **New Application** → give it a name.
2. **Bot** tab → **Reset Token** → copy the token.
3. Copy `.env.example` to `.env` and paste the token:
   ```
   cp .env.example .env
   # then edit .env
   ```
4. **OAuth2** tab → under OAuth2 URL Generator check `bot` + `applications.commands`, pick the permissions you want (Start with "Send Messages"). Copy the generated URL, open it in a browser, and invite the bot to your server.

## Run it

```bash
node index.js                 # quick test — you should see "Logged in as ..."
# Ctrl+C to stop, then run it for real in the background:
systemctl --user enable --now discord-bot
```

Useful service commands:
- `systemctl --user status discord-bot` — is it running?
- `journalctl --user -u discord-bot -f` — live logs
- `systemctl --user restart discord-bot` — restart after changing code
- Note: if you reboot, the user service needs your session; `sudo loginctl enable-linger cornbread` makes it survive reboots/headless.

## Adding a command

Drop a new file in `commands/`, e.g. `commands/roll.js`:

```js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('roll').setDescription('Roll a d6'),
  async execute(interaction) {
    await interaction.reply(String(1 + Math.floor(Math.random() * 6)));
  },
};
```

Then restart: `systemctl --user restart discord-bot`. New commands can take up to an hour to appear globally (instant if you re-invite with the same URL, or remove the bot and re-add).

## Files

- `index.js` — client, command loader, interaction dispatcher
- `commands/` — one file per slash command
- `features/tempvoice.js` — temp VC system (see below)
- `.env` — your bot token (never commit or share this)

## Temp voice channels (features/tempvoice.js)

Join **General VC** and the bot creates `YourName's VC` and moves you in. It's deleted automatically when it empties. Requires the `GuildVoiceStates` intent — without it, none of this fires.

When your VC is created you get a **panel** (embed + buttons, owner/admin only):

- **Rename** — change the channel name
- **User limit** — cap occupants (0 = unlimited)
- **Lock** — toggle who can connect
- **Status** — text under the channel name (called via the raw REST endpoint; `VoiceChannel.setStatus` doesn't exist in discord.js 14.27)
- **Kick user** — move someone out to the hub (they'll get their own VC, since joining the hub does that)
- **Delete VC** — remove the room

Restart quirks, all by design:

- Empty leftover temp VCs are deleted at startup
- Occupied ones are re-tracked, old panel messages removed, and a **Claim VC** button is posted — first press adopts the channel
- The owner is only known after a claim, so the panel works again from that point
## Credits

Vibecoded by [Blehh-Breaded](https://github.com/Blehh-Breaded), built with the help of the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) (GLM model) fixing bugs, adding the temp voice system and control panel.
