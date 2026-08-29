const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');
const { assertActionable, assertInvokerPerm, assertInvokerAboveTarget } = require('../../utils/modGuard');
const { UserError } = require('../../utils/errors');
const { fail } = require('../../utils/reply');

function checkRole(guild, invoker, role) {
  const me = guild.members.me;
  if (role.managed) {
    throw new UserError(
      'Managed Role',
      `${role} is managed by an integration or bot, so it can't be assigned manually.`,
    );
  }
  if (role.id === guild.id) {
    throw new UserError('Everyone Role', 'The `@everyone` role can\'t be added or removed.');
  }
  if (me && me.roles.highest.comparePositionTo(role) <= 0) {
    throw new UserError(
      'Role Is Above Mine',
      `${role} sits above my highest role, so Discord won't let me assign it.\nMove my role above it in **Server Settings → Roles**.`,
    );
  }
  if (invoker && invoker.id !== guild.ownerId && invoker.roles.highest.comparePositionTo(role) <= 0) {
    throw new UserError('Role Is Above Yours', `You can't assign ${role} because it's equal to or above your highest role.`);
  }
}

module.exports = {
  name: 'role',
  description: 'Add or remove a role from a member.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('role').setDescription('Toggle role on a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),
  async run({ message, args }) {
    assertInvokerPerm(message.member, PermissionsBitField.Flags.ManageRoles, 'Manage Roles', 'manage roles');
    const target = message.mentions.members?.first()
      || (args[0] ? await message.guild.members.fetch(args[0].replace(/\D/g, '')).catch(() => null) : null);
    const role = message.mentions.roles?.first() || message.guild.roles.cache.get((args[1] || '').replace(/\D/g, ''));
    if (!target || !role) return fail(message, 'Usage', 'Tell me who and which role: `!role @user @role`');
    assertActionable(message.guild, target, 'roles');
    checkRole(message.guild, message.member, role);
    if (target.roles.cache.has(role.id)) {
      await target.roles.remove(role);
      return message.reply(v2([embeds.action({ target, text: 'had a role removed.', moderator: message.author, extra: [{ name: 'Role', value: `${role}` }] })]));
    }
    await target.roles.add(role);
    message.reply(v2([embeds.action({ target, text: 'was given a role.', moderator: message.author, extra: [{ name: 'Role', value: `${role}` }] })]));
  },
  async execute({ interaction }) {
    const u = interaction.options.getUser('user');
    const r = interaction.options.getRole('role');
    const m = await interaction.guild.members.fetch(u.id).catch(() => null);
    assertActionable(interaction.guild, m, 'roles');
    checkRole(interaction.guild, interaction.member, r);
    if (m.roles.cache.has(r.id)) {
      await m.roles.remove(r);
      return interaction.reply(v2([embeds.action({ target: m ?? u, text: 'had a role removed.', moderator: interaction.user, extra: [{ name: 'Role', value: `${r}` }] })]));
    }
    await m.roles.add(r);
    interaction.reply(v2([embeds.action({ target: m ?? u, text: 'was given a role.', moderator: interaction.user, extra: [{ name: 'Role', value: `${r}` }] })]));
  },
};
