const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check if the bot is alive'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    await interaction.editReply(`Pong! Round-trip: ${sent.createdTimestamp - interaction.createdTimestamp}ms`);
  },
};