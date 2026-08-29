const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { logTo } = require('../../utils/logger');
const { v2 } = require('../../utils/v2');
const { assertActionable, assertInvokerPerm, assertInvokerAboveTarget } = require('../../utils/modGuard');
const { UserError } = require('../../utils/errors');
const { ok, fail } = require('../../utils/reply');

module.exports = {
  name: 'kick',
  description: 'Kick a member.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('kick').setDescription('Kick a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
  async run({ message, args, client }) {
    assertInvokerPerm(message.member, PermissionsBitField.Flags.KickMembers, 'Kick Members', 'kick members');
    const target = message.mentions.members?.first()
      || (args[0] ? await message.guild.members.fetch(args[0].replace(/\D/g, '')).catch(() => null) : null);
    if (!target) return fail(message, 'Usage', 'Tell me who to kick: `!kick @user [reason]`');
    const reason = args.slice(1).join(' ') || null;
    assertActionable(message.guild, target, 'kick');
    assertInvokerAboveTarget(message.member, target, 'kick');
    await target.kick(reason || 'No reason provided');
    message.reply(v2([embeds.action({ target, text: 'has been kicked.', reason, moderator: message.author })]));
    logTo(client, message.guild.id, 'moderation', embeds.modLog({ action: 'Member Kicked', target, moderator: message.author, reason: reason || 'No reason' }));
  },
  async execute({ interaction, client }) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || null;
    const m = await interaction.guild.members.fetch(user.id).catch(() => null);
    assertActionable(interaction.guild, m, 'kick');
    assertInvokerAboveTarget(interaction.member, m, 'kick');
    await m.kick(reason || 'No reason provided');
    await interaction.reply(v2([embeds.action({ target: m ?? user, text: 'has been kicked.', reason, moderator: interaction.user })]));
    logTo(client, interaction.guild.id, 'moderation', embeds.modLog({ action: 'Member Kicked', target: m ?? user, moderator: interaction.user, reason: reason || 'No reason' }));
  },
};
