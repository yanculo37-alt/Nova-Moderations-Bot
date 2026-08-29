const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'avatar',
  aliases: ['av'],
  description: 'Show user avatar.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('avatar').setDescription('Show avatar.')
    .addUserOption(o => o.setName('user').setDescription('User')),
  run({ message }) {
    const u = message.mentions.users?.first() || message.author;
    message.reply(v2([embeds.info(`${u.tag}'s Avatar`).setImage(u.displayAvatarURL({ size: 1024 }))]));
  },
  execute({ interaction }) {
    const u = interaction.options.getUser('user') || interaction.user;
    interaction.reply(v2([embeds.info(`${u.tag}'s Avatar`).setImage(u.displayAvatarURL({ size: 1024 }))]));
  },
};
