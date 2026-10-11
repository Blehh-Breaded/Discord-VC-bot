const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

const GIFS_FILE = '/home/cornbread/Downloads/gifs.txt';
const LINKS_PER_MESSAGE = 6;
const DELAY_MS = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postgifs')
    .setDescription('Post all links from gifs.txt here, 6 per message'),
  async execute(interaction) {
    if (interaction.channel.name !== 'gifs') {
      return interaction.reply({ content: 'Use this in the #gifs channel.', ephemeral: true });
    }

    const links = fs.readFileSync(GIFS_FILE, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    await interaction.reply(`Posting ${links.length} links in ${Math.ceil(links.length / LINKS_PER_MESSAGE)} messages...`);

    for (let i = 0; i < links.length; i += LINKS_PER_MESSAGE) {
      await interaction.channel.send(links.slice(i, i + LINKS_PER_MESSAGE).join('\n'));
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  },
};