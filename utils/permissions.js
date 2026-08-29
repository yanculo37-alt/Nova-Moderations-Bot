const { PermissionsBitField } = require('discord.js');
const config = require('../configs/config.json');
const settings = require('./settings');

function hasPerm(member, flag) {
  return member?.permissions?.has(PermissionsBitField.Flags[flag]);
}
async function isStaff(member) {
  if (!member) return false;
  if (config.owners?.includes(member.id)) return true;
  const s = await settings.get(member.guild?.id);
  if (s.staffRoles.some(r => member.roles.cache.has(r))) return true;
  return hasPerm(member, 'ManageGuild');
}
async function isMod(member) {
  if (!member) return false;
  if (await isStaff(member)) return true;
  const s = await settings.get(member.guild?.id);
  if (s.modRoles.some(r => member.roles.cache.has(r))) return true;
  return hasPerm(member, 'ModerateMembers') || hasPerm(member, 'KickMembers') || hasPerm(member, 'BanMembers');
}
module.exports = { hasPerm, isStaff, isMod };
