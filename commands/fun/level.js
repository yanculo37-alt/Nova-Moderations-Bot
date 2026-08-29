const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');
let Level; try { Level = require('../../models/Level'); } catch {}

module.exports = {
  name: 'level',
  aliases: ['rank'],
  description: 'Show your level.',
  category: 'fun',
  data: new SlashCommandBuilder().setName('level').setDescription('Show level.')
    .addUserOption(o => o.setName('user').setDescription('User')),
  async run({ message }) {
    const u = message.mentions.users?.first() || message.author;
    if (!Level) return message.reply(v2([embeds.error('DB not connected')]));
    const d = await Level.findOne({ guildId: message.guild.id, userId: u.id });
    message.reply(v2([embeds.info(`${u.tag}`, `**Level:** ${d?.level ?? 0}\n**XP:** ${d?.xp ?? 0}`)]));
  },
  async execute({ interaction }) {
    const u = interaction.options.getUser('user') || interaction.user;
    if (!Level) return interaction.reply(v2([embeds.error('DB not connected')], { ephemeral: true }));
    const d = await Level.findOne({ guildId: interaction.guild.id, userId: u.id });
    interaction.reply(v2([embeds.info(`${u.tag}`, `**Level:** ${d?.level ?? 0}\n**XP:** ${d?.xp ?? 0}`)]));
  },
};
