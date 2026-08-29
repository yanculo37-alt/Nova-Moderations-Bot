const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { logTo } = require('../../utils/logger');
const { v2 } = require('../../utils/v2');
let Warning; try { Warning = require('../../models/Warning'); } catch {}

module.exports = {
  name: 'warn',
  description: 'Warn a member.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('warn').setDescription('Warn a member.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  async run({ message, args, client }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return message.reply(v2([embeds.error('Missing Permission')]));
    const target = message.mentions.members?.first();
    const reason = args.slice(1).join(' ');
    if (!target || !reason) return message.reply(v2([embeds.error('Usage', '`!warn @user <reason>`')]));
    if (Warning) await Warning.create({ guildId: message.guild.id, userId: target.id, modId: message.author.id, reason }).catch(() => null);
    target.send(v2([embeds.warn(`Warned in ${message.guild.name}`, reason)])).catch(() => null);
    message.reply(v2([embeds.action({ target, text: 'has been warned.', reason, moderator: message.author })]));
    logTo(client, message.guild.id, 'moderation', embeds.modLog({ action: 'Member Warned', target, moderator: message.author, reason }));
  },
  async execute({ interaction, client }) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    if (Warning) await Warning.create({ guildId: interaction.guild.id, userId: user.id, modId: interaction.user.id, reason }).catch(() => null);
    user.send(v2([embeds.warn(`Warned in ${interaction.guild.name}`, reason)])).catch(() => null);
    interaction.reply(v2([embeds.action({ target: user, text: 'has been warned.', reason, moderator: interaction.user })]));
    logTo(client, interaction.guild.id, 'moderation', embeds.modLog({ action: 'Member Warned', target: user, moderator: interaction.user, reason }));
  },
};
