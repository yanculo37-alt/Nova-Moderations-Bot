const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

function build(member) {
  return embeds.info(`${member.user.tag}`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'ID', value: `\`${member.id}\``, inline: true },
      { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp/1000)}:R>`, inline: true },
      { name: 'Roles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `${r}`).join(' ') || '*None*' },
    );
}

module.exports = {
  name: 'userinfo',
  aliases: ['whois'],
  description: 'Show information about a user.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('userinfo').setDescription('User info.')
    .addUserOption(o => o.setName('user').setDescription('User')),
  async run({ message }) {
    const m = message.mentions.members?.first() || message.member;
    message.reply(v2([build(m)]));
  },
  async execute({ interaction }) {
    const u = interaction.options.getUser('user') || interaction.user;
    const m = await interaction.guild.members.fetch(u.id);
    interaction.reply(v2([build(m)]));
  },
};
