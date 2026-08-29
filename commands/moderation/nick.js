const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');
const { assertActionable, assertInvokerPerm, assertInvokerAboveTarget } = require('../../utils/modGuard');
const { UserError } = require('../../utils/errors');
const { fail } = require('../../utils/reply');

function checkNick(n) {
  if (n && n.length > 32) {
    throw new UserError('Nickname Too Long', `Discord nicknames max out at 32 characters — yours was ${n.length}.`);
  }
  return n;
}

module.exports = {
  name: 'nick',
  description: 'Change a member nickname.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('nick').setDescription('Change nickname.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('nickname').setDescription('New nickname (empty to reset)'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageNicknames),
  async run({ message, args }) {
    assertInvokerPerm(message.member, PermissionsBitField.Flags.ManageNicknames, 'Manage Nicknames', 'change nicknames');
    const target = message.mentions.members?.first()
      || (args[0] ? await message.guild.members.fetch(args[0].replace(/\D/g, '')).catch(() => null) : null);
    if (!target) return fail(message, 'Usage', 'Tell me who to rename: `!nick @user [nickname]`');
    const nick = checkNick(args.slice(1).join(' ') || null);
    assertActionable(message.guild, target, 'nickname');
    await target.setNickname(nick);
    message.reply(v2([embeds.action({ target, text: 'had their nickname updated.', moderator: message.author, extra: [{ name: 'Nickname', value: `\`${nick || target.user.username}\`` }] })]));
  },
  async execute({ interaction }) {
    const u = interaction.options.getUser('user');
    const n = interaction.options.getString('nickname') || null;
    const m = await interaction.guild.members.fetch(u.id).catch(() => null);
    checkNick(n);
    assertActionable(interaction.guild, m, 'nickname');
    await m.setNickname(n);
    await interaction.reply(v2([embeds.action({ target: m ?? u, text: 'had their nickname updated.', moderator: interaction.user, extra: [{ name: 'Nickname', value: `\`${n || u.username}\`` }] })]));
  },
};
