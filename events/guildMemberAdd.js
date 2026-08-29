const settings = require('../utils/settings');
const { buildMemberCard } = require('../utils/memberCard');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const s = await settings.get(member.guild.id);
    if (s.welcome.enabled && s.welcome.channelId) {
      const ch = await member.guild.channels.fetch(s.welcome.channelId).catch(() => null);
      if (ch) {
        const content = `${member} has joined ${member.guild.name}, we now have ${member.guild.memberCount} members`;

        const files = [];
        try {
          const card = await buildMemberCard({
            type: 'welcome',
            username: member.user.username,
            guildName: member.guild.name,
            avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
          });
          files.push(card);
        } catch (e) {
          console.error('welcome card error:', e);
        }

        ch.send({
          content,
          files,
          allowedMentions: { users: [member.id] },
        }).catch(() => null);
      }
    }
    if (s.autoRole.enabled && s.autoRole.roleId) {
      member.roles.add(s.autoRole.roleId).catch(() => null);
    }
  },
};
