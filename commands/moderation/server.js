const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { logTo } = require('../../utils/logger');
const { v2 } = require('../../utils/v2');

const ACTIONS = {
  mute:      { key: 'serverDeaf', field: 'mute',   value: true,  label: 'Server Muted',     verb: 'has been server muted.' },
  unmute:    { key: 'serverDeaf', field: 'mute',   value: false, label: 'Server Unmuted',   verb: 'has been server unmuted.' },
  deafen:    { key: 'serverDeaf', field: 'deaf',   value: true,  label: 'Server Deafened',  verb: 'has been server deafened.' },
  undeafen:  { key: 'serverDeaf', field: 'deaf',   value: false, label: 'Server Undeafened', verb: 'has been server undeafened.' },
};

async function apply(member, sub, reason) {
  const cfg = ACTIONS[sub];
  if (cfg.field === 'mute') return member.voice.setMute(cfg.value, reason || 'No reason');
  return member.voice.setDeaf(cfg.value, reason || 'No reason');
}

function checkPerms(memberLike) {
  return memberLike.permissions.has(PermissionsBitField.Flags.MuteMembers) &&
         memberLike.permissions.has(PermissionsBitField.Flags.DeafenMembers);
}

module.exports = {
  name: 'server',
  aliases: [],
  description: 'Server voice actions: mute/unmute/deafen/undeafen a member.',
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('server')
    .setDescription('Server voice moderation actions.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers | PermissionsBitField.Flags.DeafenMembers)
    .addSubcommand(s => s.setName('mute').setDescription('Server mute a member in voice.')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('unmute').setDescription('Remove server mute from a member.')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('deafen').setDescription('Server deafen a member in voice.')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('undeafen').setDescription('Remove server deafen from a member.')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Reason'))),

  async run({ message, args, client }) {
    if (!checkPerms(message.member))
      return message.reply(v2([embeds.error('Missing Permission', 'You need **Mute Members** and **Deafen Members**.')]));

    const sub = (args[0] || '').toLowerCase();
    if (!ACTIONS[sub])
      return message.reply(v2([embeds.error('Usage', '`!server <mute|unmute|deafen|undeafen> @user [reason]`')]));

    const target = message.mentions.members?.first();
    if (!target)
      return message.reply(v2([embeds.error('Usage', '`!server ' + sub + ' @user [reason]`')]));

    if (!target.voice?.channel)
      return message.reply(v2([embeds.error('Not in voice', 'That member is not connected to a voice channel.')]));

    const reason = args.slice(2).join(' ') || null;
    try {
      await apply(target, sub, reason);
    } catch (err) {
      return message.reply(v2([embeds.error('Failed', err.message || 'Could not perform action.')]));
    }

    const cfg = ACTIONS[sub];
    message.reply(v2([embeds.action({ target, text: cfg.verb, reason, moderator: message.author })]));
    logTo(client, message.guild.id, 'moderation', embeds.modLog({ action: cfg.label, target, moderator: message.author, reason: reason || 'No reason' }));
  },

  async execute({ interaction, client }) {
    const sub = interaction.options.getSubcommand();
    const cfg = ACTIONS[sub];
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || null;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member)
      return interaction.reply(v2([embeds.error('Not found', 'Member not found in this guild.')], { ephemeral: true }));
    if (!member.voice?.channel)
      return interaction.reply(v2([embeds.error('Not in voice', 'That member is not connected to a voice channel.')], { ephemeral: true }));

    try {
      await apply(member, sub, reason);
    } catch (err) {
      return interaction.reply(v2([embeds.error('Failed', err.message || 'Could not perform action.')], { ephemeral: true }));
    }

    interaction.reply(v2([embeds.action({ target: member, text: cfg.verb, reason, moderator: interaction.user })]));
    logTo(client, interaction.guild.id, 'moderation', embeds.modLog({ action: cfg.label, target: member, moderator: interaction.user, reason: reason || 'No reason' }));
  },
};
