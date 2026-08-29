const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const embeds = require('../../embeds');
const appSystem = require('../../systems/applicationSystem');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'application',
  aliases: ['apply', 'applications'],
  description: 'Start an application or manage the application system.',
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('application')
    .setDescription('Application system.')
    .setDMPermission(false)
    .addSubcommand(sc =>
      sc.setName('start').setDescription('Start an application in DMs.')
    )
    .addSubcommand(sc =>
      sc.setName('settings').setDescription('Open the interactive application settings panel.')
    )
    .addSubcommand(sc =>
      sc.setName('panel').setDescription('Send the public application panel in this channel.')
    ),

  async run({ message, args }) {
    const sub = (args[0] || 'start').toLowerCase();
    try {
      if (sub === 'start' || sub === 'apply' || sub === 'begin') {
        return appSystem.startApplication({
          guild: message.guild,
          member: message.member,
          user: message.author,
          client: message.client,
          reply: (payload) => message.reply(payload),
          isRepliable: () => false,
        });
      }
      if (!appSystem.isAppAdmin(message.member)) {
        return message.reply(v2([embeds.error('Insufficient Permissions', 'You need Manage Server.')]));
      }
      if (sub === 'panel') {
        await appSystem.sendApplyPanel(message.channel);
        return message.delete().catch(() => null);
      }
      if (sub === 'settings' || sub === 'config' || sub === 'setup') {
        return appSystem.openMainPanel(message);
      }
      return message.reply(v2([embeds.warn('Usage', '`!application start`, `!application settings`, or `!application panel`')]));
    } catch (err) {
      console.error('[APPLICATION CMD]', err);
      return message.reply(v2([embeds.error('Error', err.message?.slice(0, 1500) || 'Unknown error')])).catch(() => null);
    }
  },

  async execute({ interaction }) {
    const sub = interaction.options.getSubcommand();

    if ((sub === 'settings' || sub === 'panel') && !appSystem.isAppAdmin(interaction.member)) {
      return interaction.reply(v2([embeds.error('Insufficient Permissions', 'You need Manage Server.')], { ephemeral: true }));
    }

    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      console.error('[APPLICATION CMD] defer failed', e);
    }

    try {
      if (sub === 'panel') {
        await appSystem.sendApplyPanel(interaction.channel);
        return interaction.editReply(v2([embeds.success('Panel Sent')]));
      }
      if (sub === 'settings') {
        return await appSystem.openMainPanel(interaction);
      }

      return await appSystem.startApplication(interaction);
    } catch (err) {
      console.error('[APPLICATION CMD]', err);
      return interaction.editReply(v2([embeds.error('Error', err.message?.slice(0, 1500) || 'Unknown error')])).catch(() => null);
    }
  },
};
