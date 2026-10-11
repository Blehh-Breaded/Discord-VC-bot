const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(o => o.setName('message').setDescription('What to say').setRequired(true)),
  async execute(interaction) {
    await interaction.reply(interaction.options.getString('message'));
  },
};