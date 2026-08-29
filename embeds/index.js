const config = require('../configs/config.json');
const { Card, container, separator, sectionWithThumb, text, image } = require('../utils/v2');

const COLORS = {
  success: config.branding.successColor ?? 0x5865F2,
  error:   config.branding.errorColor   ?? 0xED4245,
  warn:    config.branding.warnColor    ?? 0xFEE75C,
  info:    config.branding.color        ?? 0x5865F2,
  mod:     0x5865F2,
  neutral: 0x2B2D31,
};

const FOOTER_TEXT = config.branding.footer || 'Moderation';

const footerLine = (extra) =>
  `-# ${extra ? `${FOOTER_TEXT} • ${extra}` : FOOTER_TEXT} • <t:${Math.floor(Date.now() / 1000)}:R>`;

const line = (label, value) => `\`${label.padEnd(9, ' ')}\` ${value}`;

const resolveUser = (u) => (u && u.user) ? u.user : u;
const avatarOf = (u) => {
  const usr = resolveUser(u);
  if (usr && typeof usr.displayAvatarURL === 'function') {
    return usr.displayAvatarURL({ size: 256, extension: 'png' });
  }
  return null;
};
const nameOf = (u) => {
  const usr = resolveUser(u);
  if (!usr) return 'Unknown';
  return usr.username || usr.tag || String(usr.id || 'Unknown');
};
const tagOf = (u) => {
  const usr = resolveUser(u);
  if (!usr) return 'Unknown';
  return usr.username ? `@${usr.username}` : (usr.tag || String(usr.id || 'Unknown'));
};
const idOf = (u) => resolveUser(u)?.id ?? 'unknown';
const mentionOf = (u) => {
  const usr = resolveUser(u);
  return usr?.id ? `<@${usr.id}>` : tagOf(u);
};

const base = (color = COLORS.info, children = []) =>
  new Card().setColor(color).addComponents(...[].concat(children).filter(Boolean)).setFooter({ text: FOOTER_TEXT }).setTimestamp();

const build = (color, title, desc) => {
  const card = new Card().setColor(color);
  if (desc != null && desc !== '') {
    if (title) card.setTitle(String(title));
    card.setDescription(String(desc));
  } else if (title != null) {
    card.setDescription(String(title));
  }
  return card;
};

const success = (title, desc) => build(COLORS.success, title, desc);
const error   = (title, desc) => build(COLORS.error,   title, desc);
const warn    = (title, desc) => build(COLORS.warn,    title, desc);
const info    = (title, desc) => build(COLORS.info,    title, desc);
const mod     = (title, desc) => build(COLORS.mod,     title, desc);

const panel = ({ title, description, color, children = [], footer } = {}) => {
  const card = new Card().setColor(color ?? COLORS.info);
  if (title) card.setTitle(title);
  if (description) card.setDescription(String(description));
  if (children.length) card.addComponents(...[].concat(children).filter(Boolean));
  if (footer) card.setFooter({ text: footer });
  return card;
};

const action = ({ target, text: label, duration, reason, moderator, extra = [], color } = {}) => {
  const subject = target ? nameOf(target) : '';
  const headline = subject ? `${subject} ${label || ''}`.trim() : String(label || '');

  const lines = [];
  if (moderator) lines.push(`**Moderator:** ${mentionOf(moderator)}`);
  if (duration)  lines.push(`**Duration:** ${duration}`);
  if (reason)    lines.push(`**Reason:** ${String(reason).slice(0, 900)}`);
  for (const x of extra) {
    if (x && x.name && x.value) lines.push(`**${x.name}:** ${x.value}`);
  }

  const card = new Card().setColor(color ?? COLORS.info).setTitle(headline || 'Action');
  if (lines.length) card.setDescription(lines.join('\n'));
  const avatar = avatarOf(target);
  if (avatar) card.setThumbnail(avatar);
  return card;
};

const modLog = ({ action: act, target, moderator, reason, duration, channel, caseId, extra = [] } = {}) => {
  const header = moderator
    ? `**${tagOf(moderator)} — ${act || 'Moderation Action'}**`
    : `**${act || 'Moderation Action'}**`;

  const lines = [];
  if (target)    lines.push(line('User',      `${mentionOf(target)} \`${idOf(target)}\``));
  if (moderator) lines.push(line('Moderator', `${mentionOf(moderator)} \`${idOf(moderator)}\``));
  if (duration)  lines.push(line('Duration',  String(duration)));
  if (channel)   lines.push(line('Channel',   typeof channel === 'string' ? channel : `<#${channel.id}>`));
  if (reason)    lines.push(line('Reason',    String(reason).slice(0, 900)));

  const card = new Card().setColor(COLORS.mod).setTitle(header.replace(/\*\*/g, ''));
  if (lines.length) card.setDescription(lines.join('\n'));
  const avatar = avatarOf(target);
  if (avatar) card.setThumbnail(avatar);
  if (Array.isArray(extra) && extra.length) card.addFields(extra.filter((f) => f && f.name));
  card.setFooter({ text: caseId ? `${FOOTER_TEXT} • Case #${caseId}` : FOOTER_TEXT }).setTimestamp();
  return card;
};

const messageLog = ({ type = 'delete', author, executor, channel, content, oldContent, newContent } = {}) => {
  const actor = executor || author;
  const header = `**${tagOf(actor)} — ${type === 'edit' ? 'Message Edited' : 'Message Deleted'}**`;

  const lines = [];
  if (author)   lines.push(line('Author',  `${mentionOf(author)} \`${idOf(author)}\``));
  if (executor && idOf(executor) !== idOf(author)) {
    lines.push(line('Deleted', `${mentionOf(executor)} \`${idOf(executor)}\``));
  }
  if (channel)  lines.push(line('Channel', typeof channel === 'string' ? channel : `<#${channel.id}>`));

  const card = new Card().setColor(type === 'edit' ? COLORS.warn : COLORS.error).setTitle(header.replace(/\*\*/g, ''));
  if (lines.length) card.setDescription(lines.join('\n'));
  const avatar = avatarOf(author);
  if (avatar) card.setThumbnail(avatar);

  if (type === 'edit') {
    if (oldContent) card.addFields({ name: 'Before', value: String(oldContent).slice(0, 1024) });
    if (newContent) card.addFields({ name: 'After', value: String(newContent).slice(0, 1024) });
  } else if (content) {
    card.addFields({ name: 'Content', value: String(content).slice(0, 1024) });
  }

  card.setFooter({ text: FOOTER_TEXT }).setTimestamp();
  return card;
};

module.exports = {
  base, panel, success, error, warn, info, mod, action, modLog, messageLog,
  avatarOf, tagOf, nameOf, idOf, COLORS, footerLine, line,
  Card, container, separator, sectionWithThumb, text, image,
};
