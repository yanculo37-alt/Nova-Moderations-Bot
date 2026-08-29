const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require('discord.js');
const embeds = require('../../embeds');
const ticketSettings = require('../../systems/ticketSettings');
const tickets = require('../../tickets/ticketSystem');
const { v2 } = require('../../utils/v2');
const { ok, fail } = require('../../utils/reply');
const { assertBotPerms, UserError } = require('../../utils/errors');

const PANEL_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
];

module.exports = {
  name: 'ticket',
  aliases: ['tickets'],
  description: 'Manage the ticket system.',
  category: 'tickets',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket system.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand(sc => sc.setName('settings').setDescription('Open the interactive ticket settings panel.'))
    .addSubcommand(sc => sc.setName('panel').setDescription('Send the ticket panel in this channel.')),

  async run({ message, args }) {
    if (!ticketSettings.isTicketAdmin(message.member))
      return fail(message, 'Insufficient Permissions', 'You need **Manage Server** or **Administrator** to manage tickets.');

    const sub = (args[0] || 'settings').toLowerCase();
    if (sub === 'panel') {
      assertBotPerms(message.channel, PANEL_PERMS, `sending the ticket panel in ${message.channel}`);
      await tickets.sendPanel(message.channel);
      return message.delete().catch(() => null);
    }
    if (sub === 'settings' || sub === 'config' || sub === 'setup') {
      return ticketSettings.openMainPanel(message);
    }
    return message.reply(v2([embeds.warn('Usage', '`!ticket settings` or `!ticket panel`')]));
  },

  async execute({ interaction }) {
    if (!interaction.inGuild() || !interaction.guild) {
      return fail(interaction, 'Server Only', 'Ticket commands only work inside a server.');
    }
    if (!ticketSettings.isTicketAdmin(interaction.member)) {
      return fail(interaction, 'Insufficient Permissions', 'You need **Manage Server** or **Administrator** to manage tickets.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      if (!interaction.channel?.isTextBased?.()) {
        throw new UserError('Wrong Channel Type', 'The ticket panel can only be sent in a text channel.');
      }
      assertBotPerms(interaction.channel, PANEL_PERMS, `sending the ticket panel in ${interaction.channel}`);
      await tickets.sendPanel(interaction.channel);
      return ok(interaction, 'Panel Sent', `The ticket panel is now live in ${interaction.channel}.`, { ephemeral: true });
    }

    return ticketSettings.openMainPanel(interaction);
  },
};
