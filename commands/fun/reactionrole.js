const {
  SlashCommandBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'reactionrole',
  aliases: ['rr'],
  description: 'Create a button to toggle a role.',
  category: 'fun',
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create role button.')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(o => o.setName('label').setDescription('Button label').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),

  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return message.reply(v2([embeds.error('Insufficient Permissions', 'You need **Manage Roles**.')]));
    }
    const role = message.mentions.roles?.first() || message.guild.roles.cache.get(args[0]);
    const label = args.slice(1).join(' ');
    if (!role || !label) {
      return message.reply(v2([embeds.error('Usage', '`!reactionrole @role <label>`')]));
    }
    await sendButton(message.channel, role, label);
    message.delete().catch(() => null);
  },

  async execute({ interaction }) {
    const role = interaction.options.getRole('role');
    const label = interaction.options.getString('label');
    await sendButton(interaction.channel, role, label);
    interaction.reply(v2([embeds.success('Panel Sent', `Reaction role panel for **${role.name}** posted.`)], { ephemeral: true }));
  },

  async handleInteraction(interaction) {
    if (!interaction.isButton?.()) return false;
    if (!interaction.customId?.startsWith('rr:')) return false;

    const roleId = interaction.customId.slice(3);

    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      console.error('[reactionrole] defer failed:', e);
      return true;
    }

    try {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply(v2([embeds.error('Server Only', 'This button only works inside a server.')]));
        return true;
      }

      const role =
        guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
      if (!role) {
        await interaction.editReply(v2([embeds.error('Role Missing', 'That role no longer exists.')]));
        return true;
      }

      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        await interaction.editReply(v2([embeds.error('Missing Permission', 'I need the **Manage Roles** permission.')]));
        return true;
      }
      if (role.position >= me.roles.highest.position) {
        await interaction.editReply(v2([embeds.error(
            'Role Hierarchy',
            `I can't assign **${role.name}** — my highest role is below it.`
          )]));
        return true;
      }
      if (role.managed) {
        await interaction.editReply(v2([embeds.error(
            'Managed Role',
            `**${role.name}** is managed by an integration and can't be assigned.`
          )]));
        return true;
      }

      const member = interaction.member?.roles?.cache
        ? interaction.member
        : await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        await interaction.editReply(v2([embeds.error('Error', 'Could not load your member data.')]));
        return true;
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Reaction role toggle');
        await interaction.editReply(v2([embeds.success('Role Removed', `Removed **${role.name}**.`)]));
      } else {
        await member.roles.add(role, 'Reaction role toggle');
        await interaction.editReply(v2([embeds.success('Role Added', `Added **${role.name}**.`)]));
      }
    } catch (err) {
      console.error('[reactionrole] toggle failed:', err);
      try {
        await interaction.editReply(v2([embeds.error('Error', 'Something went wrong toggling that role.')]));
      } catch {}
    }
    return true;
  },
};

async function sendButton(channel, role, label) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rr:${role.id}`).setLabel(label).setStyle(ButtonStyle.Primary)
  );
  channel.send(v2([embeds.info('Reaction Role', `Click below to toggle **${role.name}**.`), row]));
}
