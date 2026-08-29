const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'purge',
  aliases: ['clear', 'cleanup'],
  description: 'Bulk delete messages.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages.')
    .addIntegerOption(o => o.setName('count').setDescription('1-100').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const n = Math.min(100, Math.max(1, parseInt(args[0]) || 0));
    if (!n) return message.reply(v2([embeds.error('Usage', '`!purge <1-100>`')]));
    await message.delete().catch(() => null);
    const del = await message.channel.bulkDelete(n, true).catch(() => null);
    const m = await message.channel.send(v2([embeds.success('Purged', `Deleted **${del?.size ?? 0}** messages.`)]));
    setTimeout(() => m.delete().catch(() => null), 4000);
  },
  async execute({ interaction }) {
    const n = Math.min(100, Math.max(1, interaction.options.getInteger('count')));
    const del = await interaction.channel.bulkDelete(n, true).catch(() => null);
    interaction.reply(v2([embeds.success('Purged', `Deleted **${del?.size ?? 0}** messages.`)], { ephemeral: true }));
  },
};
