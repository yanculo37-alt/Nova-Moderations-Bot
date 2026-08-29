const embeds = require('../embeds');
const { logTo } = require('../utils/logger');
module.exports = {
  name: 'guildBanAdd',
  execute(ban, client) {
    logTo(client, ban.guild.id, 'moderation', embeds.mod('User Banned', `**User:** ${ban.user.tag} (\`${ban.user.id}\`)\n**Reason:** ${ban.reason || 'N/A'}`));
  },
};
