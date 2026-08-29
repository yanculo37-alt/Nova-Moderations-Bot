const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');
const embeds = require('../../embeds');
const { logTo } = require('../../utils/logger');
const { v2 } = require('../../utils/v2');
const { assertActionable, assertInvokerPerm, assertInvokerAboveTarget } = require('../../utils/modGuard');
const { UserError } = require('../../utils/errors');
const { fail } = require('../../utils/reply');

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function checkDuration(raw, parsed) {
  if (!parsed || Number.isNaN(parsed)) {
    throw new UserError(
      'Invalid Duration',
      `I couldn't read \`${raw || '(nothing)'}\` as a duration.\nUse formats like \`10m\`, \`2h\`, \`1d\` or \`30s\`.`,
    );
  }
  if (parsed < 5000) throw new UserError('Duration Too Short', 'Timeouts must be at least 5 seconds.');
  if (parsed > MAX_TIMEOUT_MS) {
    throw new UserError('Duration Too Long', 'Discord caps timeouts at **28 days**. Use `/ban` for anything longer.');
  }
}

module.exports = {
  name: 'timeout',
  aliases: ['mute'],
  description: 'Timeout a member.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('e.g. 10m, 1h').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  async run({ message, args, client }) {
    assertInvokerPerm(message.member, PermissionsBitField.Flags.ModerateMembers, 'Timeout Members', 'time members out');
    const target = message.mentions.members?.first()
      || (args[0] ? await message.guild.members.fetch(args[0].replace(/\D/g, '')).catch(() => null) : null);
    if (!target) return fail(message, 'Usage', 'Tell me who to mute: `!mute @user 10m [reason]`');
    const durRaw = args[1] || '';
    const dur = ms(durRaw);
    checkDuration(durRaw, dur);
    const reason = args.slice(2).join(' ') || null;
    assertActionable(message.guild, target, 'timeout');
    assertInvokerAboveTarget(message.member, target, 'time out');
    await target.timeout(dur, reason || 'No reason');
    message.reply(v2([embeds.action({ target, text: 'has been muted.', duration: durRaw, reason, moderator: message.author })]));
    logTo(client, message.guild.id, 'moderation', embeds.modLog({ action: 'Member Timed Out', target, moderator: message.author, duration: ms(dur, { long: true }), reason: reason || 'No reason' }));
  },
  async execute({ interaction, client }) {
    const user = interaction.options.getUser('user');
    const durRaw = interaction.options.getString('duration');
    const dur = ms(durRaw);
    const reason = interaction.options.getString('reason') || null;
    checkDuration(durRaw, dur);
    const m = await interaction.guild.members.fetch(user.id).catch(() => null);
    assertActionable(interaction.guild, m, 'timeout');
    assertInvokerAboveTarget(interaction.member, m, 'time out');
    await m.timeout(dur, reason || 'No reason');
    await interaction.reply(v2([embeds.action({ target: m ?? user, text: 'has been muted.', duration: durRaw, reason, moderator: interaction.user })]));
    logTo(client, interaction.guild.id, 'moderation', embeds.modLog({ action: 'Member Timed Out', target: m ?? user, moderator: interaction.user, duration: ms(dur, { long: true }), reason: reason || 'No reason' }));
  },
};
