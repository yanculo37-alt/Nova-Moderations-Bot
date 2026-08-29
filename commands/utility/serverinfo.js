const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

function build(guild) {
  return embeds.info(`${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: 'Members', value: `${guild.memberCount}`, inline: true },
      { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
      { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp/1000)}:R>`, inline: true },
      { name: 'Boosts', value: `${guild.premiumSubscriptionCount}`, inline: true },
    );
}

module.exports = {
  name: 'serverinfo',
  aliases: ['guildinfo'],
  description: 'Server info.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Server info.'),
  run: ({ message }) => message.reply(v2([build(message.guild)])),
  execute: ({ interaction }) => interaction.reply(v2([build(interaction.guild)])),
};
