const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../embeds');
const { v2 } = require('../../utils/v2');
let Warning; try { Warning = require('../../models/Warning'); } catch {}

module.exports = {
  name: 'warnings',
  description: 'List warnings for a user.',
  category: 'moderation',
  data: new SlashCommandBuilder().setName('warnings').setDescription('List warnings.')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),
  async run({ message }) {
    const target = message.mentions.users?.first() || message.author;
    if (!Warning) return message.reply(v2([embeds.error('Database not connected')]));
    const list = await Warning.find({ guildId: message.guild.id, userId: target.id }).sort({ createdAt: -1 }).limit(10);
    const desc = list.length ? list.map((w, i) => `**${i+1}.** ${w.reason} — <t:${Math.floor(w.createdAt/1000)}:R>`).join('\n') : '*No warnings.*';
    message.reply(v2([embeds.info(`Warnings — ${target.tag}`, desc)]));
  },
  async execute({ interaction }) {
    const target = interaction.options.getUser('user');
    if (!Warning) return interaction.reply(v2([embeds.error('Database not connected')], { ephemeral: true }));
    const list = await Warning.find({ guildId: interaction.guild.id, userId: target.id }).sort({ createdAt: -1 }).limit(10);
    const desc = list.length ? list.map((w, i) => `**${i+1}.** ${w.reason} — <t:${Math.floor(w.createdAt/1000)}:R>`).join('\n') : '*No warnings.*';
    interaction.reply(v2([embeds.info(`Warnings — ${target.tag}`, desc)]));
  },
};
