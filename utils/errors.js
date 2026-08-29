const { MessageFlags, PermissionsBitField, DiscordAPIError, HTTPError } = require('discord.js');
const { v2, container } = require('./v2');

const RED = 0xED4245;
const YELLOW = 0xFEE75C;

const prettyPerm = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2');

function permList(bits) {
  try {
    const names = new PermissionsBitField(bits).toArray();
    if (!names.length) return null;
    return names.map(n => `\`${prettyPerm(n)}\``).join(', ');
  } catch {
    return null;
  }
}

const API_ERRORS = {
  10003: ['Unknown Channel', 'That channel no longer exists, or I can\'t see it. Re-select it in `/setup`.'],
  10004: ['Unknown Server', 'I could not find that server.'],
  10007: ['Unknown Member', 'That user is not a member of this server.'],
  10008: ['Unknown Message', 'That message no longer exists (it may have been deleted).'],
  10011: ['Unknown Role', 'That role no longer exists. Re-select it in `/setup`.'],
  10013: ['Unknown User', 'I could not find that user.'],
  10026: ['Unknown Ban', 'That user is not banned.'],
  10062: ['Interaction Expired', 'Discord\'s 3-second window elapsed before I could answer. Please run the command again.'],
  20001: ['Bots Not Allowed', 'This action can only be performed by a user account, not a bot.'],
  20012: ['Not Authorised', 'I am not authorised to perform this action on this application.'],
  20022: ['Announcement Rate Limit', 'This announcement channel has hit its edit rate limit. Try again shortly.'],
  20028: ['Slowmode Rate Limit', 'This channel\'s slowmode is blocking me from sending more messages right now.'],
  30003: ['Too Many Pins', 'This channel already has the maximum of 50 pinned messages.'],
  30005: ['Too Many Roles', 'This server has hit the 250-role limit, so I can\'t create another role.'],
  30013: ['Too Many Channels', 'This server has hit the 500-channel limit, so I can\'t create another channel.'],
  30030: ['Too Many Channels In Category', 'This category already holds the maximum of 50 channels. Pick another parent category in `/setup`.'],
  40005: ['Upload Too Large', 'The file is larger than this server\'s upload limit.'],
  40007: ['User Banned', 'That user is already banned from this server.'],
  40032: ['Not In Voice', 'That user is not connected to a voice channel.'],
  40033: ['Already Crossposted', 'That message has already been published.'],
  40060: ['Already Acknowledged', 'That interaction was already answered. Please run the command again.'],
  50001: ['Missing Access', 'I don\'t have access to that channel, category or resource. Check my channel permission overwrites.'],
  50005: ['Cannot Edit Others', 'I can only edit messages that I sent myself.'],
  50006: ['Empty Message', 'I tried to send an empty message. This is a bug — please report it.'],
  50007: ['Cannot DM User', 'I couldn\'t DM that user — they have DMs from server members disabled.'],
  50013: ['Missing Permissions', 'I don\'t have the permissions needed for this action.'],
  50019: ['Cannot Move Message', 'That message can\'t be moved to the target channel.'],
  50021: ['System Message', 'System messages can\'t be modified.'],
  50024: ['Wrong Channel Type', 'That action can\'t be performed on this type of channel.'],
  50033: ['Invalid Recipients', 'The recipients for this action are invalid.'],
  50034: ['Message Too Old', 'Bulk delete only works on messages younger than 14 days. Older messages were skipped.'],
  50035: ['Invalid Input', 'Discord rejected one of the values I sent. Double-check the text, colour or length you entered.'],
  50045: ['File Too Large', 'The attachment exceeds Discord\'s size limit.'],
  50055: ['Invalid Guild', 'This server is in an invalid state for that action.'],
  50074: ['Required Channel', 'That channel is required by the community settings and can\'t be deleted.'],
  50083: ['Archived Thread', 'That thread is archived — unarchive it first.'],
  50085: ['Invalid Message Range', 'Bulk delete needs between 2 and 100 messages.'],
  60003: ['2FA Required', 'This server requires two-factor authentication for moderation actions, and my owner\'s account doesn\'t have it enabled.'],
  160002: ['Thread Already Exists', 'A thread already exists for that message.'],
  160004: ['Thread Locked', 'That thread is locked.'],
};

function describeError(err, ctx = {}) {
  const where = ctx.action ? ` while ${ctx.action}` : '';

  if (err instanceof DiscordAPIError || typeof err?.code === 'number') {
    const mapped = API_ERRORS[err.code];
    if (mapped) {
      let [title, description] = mapped;

      if (err.code === 50013) {
        const need = ctx.requiredPerms ? permList(ctx.requiredPerms) : null;
        description = need
          ? `I'm missing ${need}${where}. Give me those permissions (and make sure my role is **above** the target's highest role), then try again.`
          : `I don't have permission to do that${where}. Check my role permissions and channel overwrites — and make sure my role is **above** the roles I need to manage.`;
      } else if (err.code === 50001) {
        description = `I can't access that channel or resource${where}. Grant me **View Channel** (and **Send Messages** where relevant) there.`;
      }

      return { title, description, level: 'warn' };
    }
    return {
      title: 'Discord Rejected That Request',
      description: `Discord returned error \`${err.code}\`${where}: ${err.message || 'no details provided'}.`,
      level: 'warn',
    };
  }

  if (err instanceof HTTPError || err?.name === 'AbortError' || /fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND/i.test(err?.message || '')) {
    return {
      title: 'Discord Is Unreachable',
      description: 'I couldn\'t reach Discord\'s API. This is usually temporary — please try again in a moment.',
      level: 'warn',
    };
  }

  if (err?.name === 'MongooseError' || err?.name === 'MongoServerError' ||
      err?.name === 'MongoNetworkError' || /buffering timed out|failed to connect to server/i.test(err?.message || '')) {
    return {
      title: 'Database Unavailable',
      description: 'I couldn\'t reach the settings database, so nothing was saved. Please try again shortly — if this keeps happening, the bot host needs to check the database connection.',
      level: 'warn',
    };
  }

  if (err?.name === 'ValidationError') {
    return {
      title: 'Invalid Settings',
      description: `Those values couldn't be saved: ${err.message}`,
      level: 'warn',
    };
  }

  if (err instanceof UserError) {
    return { title: err.title, description: err.message, level: 'warn' };
  }

  return {
    title: 'Unexpected Error',
    description: `Something broke${where}.\n\`\`\`\n${String(err?.message || err).slice(0, 300)}\n\`\`\`\nIf this keeps happening, please report it.`,
    level: 'error',
  };
}

class UserError extends Error {
  constructor(title, message) {
    super(message);
    this.name = 'UserError';
    this.title = title || 'Cannot Do That';
  }
}

function errorPayload(err, ctx) {
  const { title, description, level } = describeError(err, ctx);
  return v2([container({
    color: level === 'error' ? RED : YELLOW,
    children: [`### ${level === 'error' ? '❌' : '⚠️'} ${title}`, description],
  })], { ephemeral: true });
}

async function safeRespond(interaction, payload) {
  const attempt = async (fn, p) => {
    try { await fn(p); return true; } catch (e) {
      console.error('[safeRespond]', e?.code ?? '', e?.message ?? e);
      return false;
    }
  };

  const forEdit = { ...payload, flags: stripEphemeral(payload.flags) };

  if (interaction.deferred && !interaction.replied) {
    return attempt(p => interaction.editReply(p), forEdit);
  }
  if (interaction.replied) {
    return attempt(p => interaction.followUp(p), payload);
  }
  if (await attempt(p => interaction.reply(p), payload)) return true;

  return attempt(p => interaction.followUp(p), payload);
}

function stripEphemeral(flags) {
  const n = Number(flags || 0);
  return n & ~Number(MessageFlags.Ephemeral);
}

function withEphemeral(flags) {
  return Number(flags || 0) | Number(MessageFlags.Ephemeral);
}

async function reportError(interaction, err, ctx = {}) {
  const tag = ctx.action || interaction?.commandName || interaction?.customId || 'interaction';
  console.error(`[error:${tag}]`, err);
  if (!interaction || typeof interaction.isRepliable !== 'function' || !interaction.isRepliable()) return false;
  return safeRespond(interaction, errorPayload(err, ctx));
}

function assertBotPerms(guildOrChannel, perms, action) {
  const required = new PermissionsBitField(perms);
  const me = guildOrChannel?.guild?.members?.me ?? guildOrChannel?.members?.me;
  if (!me) return;

  const effective = typeof guildOrChannel.permissionsFor === 'function'
    ? guildOrChannel.permissionsFor(me)
    : me.permissions;

  if (!effective || effective.has(required)) return;

  const missing = required.missing(effective);
  const err = new Error(`Missing permissions: ${missing.join(', ')}`);
  err.code = 50013;
  err.requiredPerms = new PermissionsBitField(missing).bitfield;
  err.action = action;
  throw Object.assign(err, { __novaMissing: missing });
}

function assertHierarchy(guild, target, what = 'that member') {
  const me = guild?.members?.me;
  if (!me || !target) return;
  const targetPos = target.roles?.highest?.position ?? target.position;
  if (targetPos == null) return;
  if (me.roles.highest.position <= targetPos) {
    throw new UserError(
      'Role Hierarchy Blocks Me',
      `My highest role is not above ${what}'s highest role, so Discord won't let me act on them. ` +
      'Move my role higher in **Server Settings → Roles**.',
    );
  }
  if (guild.ownerId && target.id === guild.ownerId) {
    throw new UserError('Server Owner', 'Nobody — not even a bot — can moderate the server owner.');
  }
}

module.exports = {
  UserError,
  describeError,
  errorPayload,
  reportError,
  safeRespond,
  stripEphemeral,
  withEphemeral,
  assertBotPerms,
  assertHierarchy,
  permList,
};
