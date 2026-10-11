const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env — see README.md');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
client.commands = new Collection();

// Load every file in commands/ as a slash command
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

// Register the commands with Discord (global — usable in every server)
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    const reply = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Register per-guild so new commands appear instantly (global can take ~1h)
  const body = [...client.commands.values()].map(c => c.data.toJSON());
  // Clear the global set so it doesn't duplicate the guild copies
  await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
  let total = 0;
  for (const guild of client.guilds.cache.values()) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body });
    total += body.length;
  }
  console.log(`Registered ${total} guild slash command(s).`);
});
require('./features/tempvoice')(client);

client.login(process.env.DISCORD_TOKEN);