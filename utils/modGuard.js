const { PermissionsBitField } = require('discord.js');
const { UserError } = require('./errors');

const KINDS = {
  ban:      { verb: 'ban',           perm: PermissionsBitField.Flags.BanMembers,      permName: 'Ban Members',      flag: 'bannable' },
  kick:     { verb: 'kick',          perm: PermissionsBitField.Flags.KickMembers,     permName: 'Kick Members',     flag: 'kickable' },
  timeout:  { verb: 'time out',      perm: PermissionsBitField.Flags.ModerateMembers, permName: 'Timeout Members',  flag: 'moderatable' },
  nickname: { verb: 'rename',        perm: PermissionsBitField.Flags.ManageNicknames, permName: 'Manage Nicknames', flag: 'manageable' },
  roles:    { verb: 'manage roles for', perm: PermissionsBitField.Flags.ManageRoles,  permName: 'Manage Roles',     flag: 'manageable' },
};

function assertActionable(guild, member, kind) {
  const spec = KINDS[kind];
  if (!spec) throw new UserError('Internal Error', `Unknown moderation action "${kind}".`);
  if (!guild) throw new UserError('Server Only', 'That command only works inside a server.');

  if (!member) {
    throw new UserError('Member Not Found', 'That user isn\'t in this server (or I can\'t see them).');
  }

  const me = guild.members.me;
  if (!me) throw new UserError('Not Ready', 'I couldn\'t resolve my own member data yet. Try again in a second.');

  if (member.id === me.id) {
    throw new UserError('That\'s Me', `I'm not going to ${spec.verb} myself.`);
  }
  if (member.id === guild.ownerId) {
    throw new UserError('Server Owner', `Discord doesn't allow anyone to ${spec.verb} the server owner.`);
  }
  if (!me.permissions.has(spec.perm)) {
    throw new UserError(
      'Missing Permission',
      `I don't have the **${spec.permName}** permission in this server. ` +
      'Grant it in **Server Settings → Roles**, then try again.',
    );
  }
  if (me.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    throw new UserError(
      'Role Hierarchy Blocks Me',
      `**${member.user?.tag ?? member.id}**'s highest role (<@&${member.roles.highest.id}>) is above or equal to mine, ` +
      `so Discord won't let me ${spec.verb} them.\nMove my role higher in **Server Settings → Roles**.`,
    );
  }
  if (spec.flag && member[spec.flag] === false) {
    throw new UserError(
      'Action Not Possible',
      `Discord says I can't ${spec.verb} **${member.user?.tag ?? member.id}**. ` +
      'This usually means their role is protected or they hold a permission I can\'t override.',
    );
  }
}

function assertInvokerPerm(member, perm, permName, verb) {
  if (member?.permissions?.has(perm)) return;
  throw new UserError(
    'Insufficient Permissions',
    `You need the **${permName}** permission to ${verb}.`,
  );
}

function assertInvokerAboveTarget(invoker, target, verb = 'moderate') {
  if (!invoker || !target) return;
  if (invoker.id === invoker.guild?.ownerId) return;
  if (invoker.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    throw new UserError(
      'You Can\'t Target Them',
      `**${target.user?.tag ?? target.id}** has a role equal to or higher than yours, so you can't ${verb} them.`,
    );
  }
}

module.exports = { assertActionable, assertInvokerPerm, assertInvokerAboveTarget, KINDS };
