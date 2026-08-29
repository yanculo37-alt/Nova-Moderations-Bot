const { SlashCommandBuilder } = require('discord.js');
const tickets = require('../../tickets/ticketSystem');
const { v2, container, file } = require('../../utils/v2');

module.exports = {
  name: 'transcript',
  description: 'Generate transcript of this channel.',
  category: 'tickets',
  data: new SlashCommandBuilder().setName('transcript').setDescription('Generate transcript.'),
  async run({ message }) {
    const transcript = await tickets.generateTranscript(message.channel);
    message.reply(v2(
      [container({ children: ['## 📄 Transcript', file(transcript.name)] })],
      { files: [transcript] },
    ));
  },
  async execute({ interaction }) {
    await interaction.deferReply({ ephemeral: true });
    const transcript = await tickets.generateTranscript(interaction.channel);
    interaction.editReply(v2(
      [container({ children: ['## 📄 Transcript', file(transcript.name)] })],
      { files: [transcript] },
    ));
  },
};
