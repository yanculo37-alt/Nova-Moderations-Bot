const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'announce',
  description: 'Send an announcement embed.',
  category: 'utility',
  data: new SlashCommandBuilder().setName('announce').setDescription('Announcement.')
    .addStringOption(o => o.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Body').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  async run({ message, args }) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const text = args.join(' ');
    if (!text) return message.reply(v2([embeds.error('Usage', '`!announce <text>`')]));
    await message.delete().catch(() => null);
    message.channel.send(v2([embeds.info('Announcement', text)]));
  },
  async execute({ interaction }) {
    const t = interaction.options.getString('title');
    const b = interaction.options.getString('message');
    interaction.channel.send(v2([embeds.info(`${t}`, b)]));
    interaction.reply(v2([embeds.success('Sent', 'Announcement sent.')], { ephemeral: true }));
  },
};
