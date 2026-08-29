const { Events } = require('discord.js');
const embeds = require('../embeds');
const { logTo } = require('../utils/logger');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.partial || newMessage.partial) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = embeds.messageLog({
      type: 'edit',
      author: newMessage.author,
      executor: newMessage.author,
      channel: newMessage.channel,
      oldContent: oldMessage.content || '*empty*',
      newContent: newMessage.content || '*empty*',
    });

    logTo(newMessage.client, newMessage.guild.id, 'messages', embed);
  },
};
