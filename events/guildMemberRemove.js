const settings = require('../utils/settings');
const { buildMemberCard } = require('../utils/memberCard');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    const s = await settings.get(member.guild.id);
    if (!s.goodbye.enabled || !s.goodbye.channelId) return;
    const ch = await member.guild.channels.fetch(s.goodbye.channelId).catch(() => null);
    if (!ch) return;

    const content = `**${member.user.tag}** has left ${member.guild.name}, we now have ${member.guild.memberCount} members`;

    const files = [];
    try {
      const card = await buildMemberCard({
        type: 'goodbye',
        username: member.user.username,
        guildName: member.guild.name,
        avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
      });
      files.push(card);
    } catch (e) {
      console.error('goodbye card error:', e);
    }

    ch.send({
      content,
      files,
      allowedMentions: { parse: [] },
    }).catch(() => null);
  },
};
