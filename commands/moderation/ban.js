const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { logTo } = require('../../utils/logger');
const { v2 } = require('../../utils/v2');
const { assertActionable, assertInvokerPerm, assertInvokerAboveTarget } = require('../../utils/modGuard');
const { UserError } = require('../../utils/errors');
const { ok, fail } = require('../../utils/reply');

module.exports = {
  name: 'ban',
  description: 'Ban a member from the server.',
  category: 'moderation',
  cooldown: 3,
  data: new SlashCommandBuilder().setName('ban').setDescription('Ban a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  async run({ message, args, client }) {
    assertInvokerPerm(message.member, PermissionsBitField.Flags.BanMembers, 'Ban Members', 'ban members');
    const target = message.mentions.members?.first()
      || (args[0] ? await message.guild.members.fetch(args[0].replace(/\D/g, '')).catch(() => null) : null);
    if (!target) return fail(message, 'Usage', 'Tell me who to ban: `!ban @user [reason]`');
    const reason = args.slice(1).join(' ') || null;
    assertActionable(message.guild, target, 'ban');
    assertInvokerAboveTarget(message.member, target, 'ban');
    await target.ban({ reason: reason || 'No reason provided' });
    await message.reply(v2([embeds.action({ target, text: 'has been banned.', reason, moderator: message.author })]));
    logTo(client, message.guild.id, 'moderation', embeds.modLog({ action: 'Member Banned', target, moderator: message.author, reason: reason || 'No reason' }));
  },
  async execute({ interaction, client }) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    assertActionable(interaction.guild, member, 'ban');
    assertInvokerAboveTarget(interaction.member, member, 'ban');
    await member.ban({ reason: reason || 'No reason provided' });
    await interaction.reply(v2([embeds.action({ target: member ?? user, text: 'has been banned.', reason, moderator: interaction.user })]));
    logTo(client, interaction.guild.id, 'moderation', embeds.modLog({ action: 'Member Banned', target: member ?? user, moderator: interaction.user, reason: reason || 'No reason' }));
  },
};
