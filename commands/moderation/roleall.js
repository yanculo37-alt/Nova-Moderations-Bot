const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

const TARGETS = { all: 'all', humans: 'humans', bots: 'bots' };

async function giveRoleToAll({ guild, role, target = 'humans', moderator, reply }) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles))
    return reply(v2([embeds.error('Missing Permission', 'I need **Manage Roles**.')]));
  if (role.position >= me.roles.highest.position)
    return reply(v2([embeds.error('Role too high', 'That role is higher than or equal to my highest role.')]));
  if (role.managed)
    return reply(v2([embeds.error('Managed role', 'That role is managed by an integration and cannot be assigned.')]));

  await reply(v2([embeds.info('Working...', `Assigning ${role} to **${target}** members. This may take a while.`)]));

  await guild.members.fetch();
  let added = 0, skipped = 0, failed = 0;
  const members = guild.members.cache.filter(m => {
    if (target === 'humans' && m.user.bot) return false;
    if (target === 'bots' && !m.user.bot) return false;
    return !m.roles.cache.has(role.id);
  });

  for (const m of members.values()) {
    try {
      await m.roles.add(role, `roleall by ${moderator.tag}`);
      added++;
    } catch {
      failed++;
    }
  }
  skipped = guild.members.cache.size - added - failed;

  return guild.systemChannel?.send?.(v2([embeds.action({
    target: moderator,
    text: `ran roleall.`,
    moderator,
    extra: [
      { name: 'Role', value: `${role}` },
      { name: 'Target', value: target },
      { name: 'Added', value: String(added) },
      { name: 'Failed', value: String(failed) },
      { name: 'Skipped', value: String(skipped) },
    ],
  })])).catch(() => null);
}

module.exports = {
  name: 'roleall',
  description: 'Give a role to everyone in the server.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('roleall').setDescription('Give a role to everyone in the server.')
    .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    .addStringOption(o => o.setName('target').setDescription('Who to give the role to').setRequired(false)
      .addChoices(
        { name: 'Humans only', value: 'humans' },
        { name: 'Bots only', value: 'bots' },
        { name: 'Everyone (humans + bots)', value: 'all' },
      ))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),
  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const role = message.mentions.roles?.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply(v2([embeds.error('Usage', '`!roleall @role [humans|bots|all]`')]));
    const target = TARGETS[(args[1] || 'humans').toLowerCase()] || 'humans';
    await giveRoleToAll({
      guild: message.guild,
      role,
      target,
      moderator: message.author,
      reply: (payload) => message.reply(payload),
    });
  },
  async execute({ interaction }) {
    const role = interaction.options.getRole('role');
    const target = interaction.options.getString('target') || 'humans';
    let replied = false;
    await giveRoleToAll({
      guild: interaction.guild,
      role,
      target,
      moderator: interaction.user,
      reply: async (payload) => {
        if (!replied) { replied = true; return interaction.reply(payload); }
        return interaction.followUp(payload);
      },
    });
  },
};
