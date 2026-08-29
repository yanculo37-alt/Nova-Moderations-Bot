const { Events, AuditLogEvent } = require('discord.js');
const embeds = require('../embeds');
const { logTo } = require('../utils/logger');

async function resolveExecutor(message) {
  try {
    if (!message.guild) return message.author;
    const me = message.guild.members.me;
    if (!me?.permissions?.has?.('ViewAuditLog')) return message.author;

    const logs = await message.guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 5,
    });

    const now = Date.now();
    const entry = logs.entries.find(e =>
      e.target?.id === message.author?.id &&
      e.extra?.channel?.id === message.channelId &&
      (now - e.createdTimestamp) < 10_000
    );

    return entry?.executor ?? message.author;
  } catch {
    return message.author;
  }
}

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.partial || message.author?.bot) return;

    const executor = await resolveExecutor(message);
    const embed = embeds.messageLog({
      type: 'delete',
      author: message.author,
      executor,
      channel: message.channel,
      content: message.content || '*No text content*',
    });

    logTo(message.client, message.guild.id, 'messages', embed);
  },
};
