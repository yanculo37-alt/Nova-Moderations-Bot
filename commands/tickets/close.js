const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const tickets = require('../../tickets/ticketSystem');
const { v2 } = require('../../utils/v2');

module.exports = {
  name: 'close',
  description: 'Close the current ticket.',
  category: 'tickets',
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close ticket.')
    .addStringOption(o => o.setName('reason').setDescription('Reason for closing the ticket').setRequired(false)),
  async run({ message, client, args }) {
    if (!message.channel.name?.startsWith('ticket-')) return message.reply(v2([embeds.error('Not a ticket channel.')]));
    const reason = Array.isArray(args) ? args.join(' ').trim() : '';
    await tickets.closeTicket(message.channel, message.author, client, reason || 'No reason provided');
  },
  async execute({ interaction, client }) {
    if (!interaction.channel.name?.startsWith('ticket-')) return interaction.reply(v2([embeds.error('Not a ticket channel.')], { ephemeral: true }));
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.reply(v2([embeds.warn('Closing…', 'Generating transcript.')]));
    await tickets.closeTicket(interaction.channel, interaction.user, client, reason);
  },
};
