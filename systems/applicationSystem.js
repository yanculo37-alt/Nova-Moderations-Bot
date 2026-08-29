const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionsBitField, Client, Events,
  GatewayIntentBits, Partials, IntentsBitField,
} = require('discord.js');
const settings = require('../utils/settings');
const embeds = require('../embeds');
const config = require('../configs/config.json');
const { v2, Card, text, separator } = require('../utils/v2');
let Application; try { Application = require('../models/Application'); } catch {}

const NS = 'aset';
const APP = 'app';
const id = (...parts) => [NS, ...parts].join(':');

const STATE_KEY = Symbol.for('nova.applicationSystem.runtimeState.v9');
const runtimeState = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {
  memApps: new Map(),
  sessions: new Map(),
  seenDMMessageIds: new Map(),
  dmQueues: new Map(),
  listenerClients: new WeakSet(),
});

const memApps = runtimeState.memApps;

const sessions = runtimeState.sessions;
const ANSWER_TIMEOUT_MS = 10 * 60_000;

const seenDMMessageIds = runtimeState.seenDMMessageIds;
const SEEN_DM_TTL_MS = 2 * 60_000;

function queueDMWork(userId, work) {
  if (!userId) return work();
  const previous = runtimeState.dmQueues.get(userId) || Promise.resolve();
  const next = previous.catch(() => null).then(work).finally(() => {
    if (runtimeState.dmQueues.get(userId) === next) runtimeState.dmQueues.delete(userId);
  });
  runtimeState.dmQueues.set(userId, next);
  return next;
}

function markDMMessageSeen(messageId) {
  if (!messageId) return false;
  const now = Date.now();
  for (const [id, ts] of seenDMMessageIds) {
    if (now - ts > SEEN_DM_TTL_MS) seenDMMessageIds.delete(id);
  }
  if (seenDMMessageIds.has(messageId)) return true;
  seenDMMessageIds.set(messageId, now);
  return false;
}

function isDMChannel(message) {
  if (!message) return false;
  if (message.guild) return false;
  if (typeof message.inGuild === 'function' && message.inGuild()) return false;
  return true;
}

async function fetchIfPartial(message) {
  if (!message) return null;
  if (message.partial) {
    try { message = await message.fetch(); } catch { return null; }
  }
  if (message.channel?.partial) {
    try { await message.channel.fetch(); } catch {}
  }
  return message;
}

async function routeDMMessage(message, source = 'unknown') {
  try {
    message = await fetchIfPartial(message);
    if (!message || message.author?.bot) return false;
    if (!isDMChannel(message)) return false;

    const userId = message.author?.id;
    const hasSession = !!userId && sessions.has(userId);
    console.log(`[APP DM] messageCreate via ${source}: user=${userId || 'unknown'} session=${hasSession ? 'yes' : 'no'} contentLength=${String(message.content || '').length}`);

    if (!hasSession) return false;
    return await queueDMWork(userId, () => handleDM(message, source));
  } catch (err) {
    console.error(`[APP DM] route failed via ${source}`, err);
    return false;
  }
}

async function routeRawDM(client, packet, source = 'raw') {
  try {
    if (!packet || packet.t !== 'MESSAGE_CREATE' || !packet.d || packet.d.guild_id) return false;
    const data = packet.d;
    const author = data.author || {};
    if (!author.id || author.bot) return false;

    const hasSession = sessions.has(author.id);
    console.log(`[APP DM] raw MESSAGE_CREATE via ${source}: user=${author.id} session=${hasSession ? 'yes' : 'no'} contentLength=${String(data.content || '').length}`);

    if (!hasSession) return false;

    const sess = sessions.get(author.id);
    let channel = sess?.dmChannel;
    if (!channel && client?.channels?.fetch) {
      channel = await client.channels.fetch(data.channel_id).catch(() => null);
    }
    if (!channel) return false;

    return await queueDMWork(author.id, () => handleDM({
      id: data.id,
      content: data.content || '',
      author: {
        id: author.id,
        bot: false,
        tag: author.username && author.discriminator ? `${author.username}#${author.discriminator}` : author.username || author.id,
        username: author.username,
        displayAvatarURL: (...args) => client?.users?.cache?.get(author.id)?.displayAvatarURL?.(...args),
      },
      channel,
      guild: null,
      client,
    }, source));
  } catch (err) {
    console.error(`[APP DM] raw route failed via ${source}`, err);
    return false;
  }
}

const EMIT_PATCH_FLAG = Symbol.for('nova.applicationSystem.dmEmitPatch.v9');
const LOGIN_PATCH_FLAG = Symbol.for('nova.applicationSystem.dmLoginPatch.v9');

function ensureClientDMOptions(client, reason = 'runtime') {
  if (!client?.options) return { intentsAdded: [], partialsAdded: [] };
  const intentsAdded = [];
  const partialsAdded = [];

  try {
    const bits = new IntentsBitField(client.options.intents ?? []);
    if (!bits.has(GatewayIntentBits.DirectMessages)) {
      bits.add(GatewayIntentBits.DirectMessages);
      intentsAdded.push('DirectMessages');
    }
    if (!bits.has(GatewayIntentBits.MessageContent)) {
      bits.add(GatewayIntentBits.MessageContent);
      intentsAdded.push('MessageContent');
    }
    client.options.intents = bits;
  } catch (err) {
    console.error('[APP DM] Could not verify/add DM intents on Client options.', err);
  }

  try {
    const partials = Array.isArray(client.options.partials) ? client.options.partials.slice() : [];
    if (!partials.includes(Partials.Channel)) {
      partials.push(Partials.Channel);
      partialsAdded.push('Channel');
    }
    if (!partials.includes(Partials.Message)) {
      partials.push(Partials.Message);
      partialsAdded.push('Message');
    }
    client.options.partials = partials;
  } catch (err) {
    console.error('[APP DM] Could not verify/add DM partials on Client options.', err);
  }

  if (intentsAdded.length || partialsAdded.length) {
    console.log(`[APP DM] Added missing Client DM options during ${reason}: intents=${intentsAdded.join(', ') || 'none'} partials=${partialsAdded.join(', ') || 'none'}`);
  }
  return { intentsAdded, partialsAdded };
}

function installEmitPatch() {
  try {
    if (!Client?.prototype) return;
    if (!Client.prototype[LOGIN_PATCH_FLAG]) {
      const originalLogin = Client.prototype.login;
      Object.defineProperty(Client.prototype, LOGIN_PATCH_FLAG, { value: true });
      Client.prototype.login = function patchedApplicationLogin(...args) {
        try {
          ensureClientDMOptions(this, 'before client.login()');
          ensureDMListener(this);
        } catch (err) {
          console.error('[APP DM] login patch failed before login', err);
        }
        return originalLogin.apply(this, args);
      };
      console.log('[APP DM] Installed login safety patch for DM intents/partials.');
    }
    if (Client.prototype[EMIT_PATCH_FLAG]) return;
    const originalEmit = Client.prototype.emit;
    Object.defineProperty(Client.prototype, EMIT_PATCH_FLAG, { value: true });
    Client.prototype.emit = function patchedApplicationEmit(eventName, ...args) {
      const result = originalEmit.call(this, eventName, ...args);
      try {
        if (eventName === 'messageCreate' || eventName === Events?.MessageCreate) {
          void routeDMMessage(args[0], 'client.emit');
        } else if (eventName === 'raw' || eventName === Events?.Raw) {
          void routeRawDM(this, args[0], 'client.emit(raw)');
        }
      } catch (err) {
        console.error('[APP DM] emit patch failed', err);
      }
      return result;
    };
    console.log('[APP DM] Installed messageCreate/raw safety patch.');
  } catch (err) {
    console.error('[APP DM] Failed to install emit patch', err);
  }
}
installEmitPatch();

const _listenerClients = runtimeState.listenerClients;
function ensureDMListener(client) {
  if (!client || _listenerClients.has(client)) return;
  _listenerClients.add(client);
  ensureClientDMOptions(client, 'listener attach');
  console.log('[APP DM] Attached application DM listeners to client.');
  client.on('messageCreate', async (message) => {
    await routeDMMessage(message, 'self-listener');
  });
  client.on('raw', async (packet) => {
    await routeRawDM(client, packet, 'self-listener(raw)');
  });

  try {
    let bits = null;
    try { bits = new IntentsBitField(client.options?.intents ?? []); } catch { bits = null; }
    const enabledIntents = [];
    if (bits && typeof bits.toArray === 'function') {
      try { enabledIntents.push(...bits.toArray()); } catch {}
    }
    const parts = client.options?.partials || [];
    const partialNames = parts.map(p => {
      if (typeof p === 'string') return p;
      if (typeof p === 'number') {
        const entry = Object.entries(Partials || {}).find(([, v]) => v === p);
        return entry ? entry[0] : String(p);
      }
      return String(p);
    });
    console.log('[APP DM] Client intents: ' + (enabledIntents.length ? enabledIntents.join(', ') : '(none detected)'));
    console.log('[APP DM] Client partials: ' + (partialNames.length ? partialNames.join(', ') : '(none)'));
    const hasDM = enabledIntents.includes('DirectMessages');
    const hasMC = enabledIntents.includes('MessageContent');
    const hasChannelPartial = partialNames.includes('Channel');
    if (hasDM && hasMC && hasChannelPartial) {
      console.log('[APP DM] ✅ DM flow prerequisites look good.');
    } else if (bits) {
      const missing = [];
      if (!hasDM) missing.push('DirectMessages intent');
      if (!hasMC) missing.push('MessageContent intent');
      if (!hasChannelPartial) missing.push('Partials.Channel');
      console.log('[APP DM] ℹ️ Not detected on Client constructor: ' + missing.join(', ') +
        '. If your Client actually passes these, ignore this note (the diagnostic above is the source of truth).');
    }
  } catch {}
}

function clearSessionTimer(sess) {
  if (sess?.timer) { clearTimeout(sess.timer); sess.timer = null; }
}

function describeDiscordError(err) {
  if (!err) return 'unknown error';
  const parts = [];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.status) parts.push(`status=${err.status}`);
  if (err.message) parts.push(`message=${String(err.message).slice(0, 200)}`);
  return parts.join(' ') || String(err).slice(0, 200);
}

function answerPreview(answer) {
  return String(answer || '').replace(/\s+/g, ' ').slice(0, 250);
}

async function sendApplicantMessage(sess, payload, fallbackMessage = null, label = 'message') {
  const attempts = [];
  const seen = new Set();
  const addChannel = (channel, name) => {
    if (!channel || typeof channel.send !== 'function') return;
    const key = `channel:${channel.id || name}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({
      name,
      send: async () => {
        const sent = await channel.send(payload);
        if (sent?.channel) sess.dmChannel = sent.channel;
        else sess.dmChannel = channel;
        return sent;
      },
    });
  };
  const addUser = (user, name) => {
    if (!user || typeof user.send !== 'function') return;
    const key = `user:${user.id || name}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({
      name,
      send: async () => {
        const sent = await user.send(payload);
        if (sent?.channel) sess.dmChannel = sent.channel;
        return sent;
      },
    });
  };

  addChannel(fallbackMessage?.channel, 'incoming-DM-channel');
  addChannel(sess.dmChannel, 'session-DM-channel');
  addUser(sess.client?.users?.cache?.get(sess.userId), 'cached-user-DM');
  if (sess.client?.users?.fetch) {
    attempts.push({
      name: 'fetched-user-DM',
      send: async () => {
        const user = await sess.client.users.fetch(sess.userId);
        const sent = await user.send(payload);
        if (sent?.channel) sess.dmChannel = sent.channel;
        return sent;
      },
    });
  }

  const failures = [];
  for (const attempt of attempts) {
    try {
      const sent = await attempt.send();
      console.log(`[APP DM] Sent ${label} to user=${sess.userId} via ${attempt.name}`);
      return sent;
    } catch (err) {
      failures.push(`${attempt.name}(${describeDiscordError(err)})`);
    }
  }

  const err = new Error(`Unable to send ${label} to applicant; attempts=${failures.join(' | ') || 'none'}`);
  console.error(`[APP DM] ${err.message}`);
  throw err;
}

function armSessionTimer(sess) {
  clearSessionTimer(sess);
  sess.timer = setTimeout(async () => {
    if (!sessions.has(sess.userId)) return;
    sessions.delete(sess.userId);
    console.log(`[APP] Timed out DM application session user=${sess.userId} guild=${sess.guildId} type=${sess.type?.value || 'unknown'} answered=${sess.answers?.length || 0}/${sess.questions?.length || 0}`);
    try { await sendApplicantMessage(sess, v2([embeds.error('Timed out', 'You took too long to answer. Application cancelled.')]), null, 'timeout notice'); } catch {}
  }, ANSWER_TIMEOUT_MS);
}

async function sendNextQuestion(sess, fallbackMessage = null) {
  const q = sess.questions[sess.index];
  if (!q) throw new Error(`No question at index ${sess.index}`);
  const qEmbed = new Card().setColor(sess.color)
    .setTitle(`Question ${sess.index + 1} / ${sess.questions.length}`)
    .setDescription(q)
    .setFooter({ text: 'Reply with your answer. Type "cancel" to abort.' });
  try {
    await sendApplicantMessage(sess, v2([qEmbed]), fallbackMessage, `question ${sess.index + 1}/${sess.questions.length}`);
  } catch (err) {
    console.error(`[APP DM] Embed question send failed for user=${sess.userId}; trying plain text fallback.`, err);
    await sendApplicantMessage(sess, { content: `**Question ${sess.index + 1} / ${sess.questions.length}:**\n${q}\n\nReply with your answer. Type \`cancel\` to abort.` }, fallbackMessage, `plain question ${sess.index + 1}/${sess.questions.length}`);
  }
  console.log(`[APP] Asked question user=${sess.userId} guild=${sess.guildId} type=${sess.type?.value || 'unknown'} question=${sess.index + 1}/${sess.questions.length}`);
  armSessionTimer(sess);
}

async function safeReply(interaction, payload) {
  if (!interaction) return null;
  const data = { ...payload, ephemeral: payload?.ephemeral ?? true };
  const isInteraction = typeof interaction.isRepliable === 'function' && interaction.isRepliable();
  if (isInteraction && (interaction.deferred || interaction.replied)) {
    return interaction.editReply(data).catch(() => interaction.followUp(data).catch(() => null));
  }
  if (!isInteraction && typeof interaction.reply === 'function') {
    const messagePayload = { ...data };
    delete messagePayload.ephemeral;
    return interaction.reply(messagePayload).catch(() => null);
  }
  if (!isInteraction) return null;
  return interaction.reply(data).catch(() => null);
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => null);
  if (interaction.isMessageComponent?.()) return interaction.update(payload).catch(() => safeReply(interaction, payload));
  return safeReply(interaction, payload);
}

function isAppAdmin(member) {
  if (!member) return false;
  if (config.owners?.includes(member.id)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator)
      || member.permissions?.has(PermissionsBitField.Flags.ManageGuild);
}

function fmt(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function cleanQuestions(type) {
  return Array.isArray(type?.questions) ? type.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
}

function pickType(applications, typeValue = '') {
  const types = Array.isArray(applications?.types) ? applications.types : [];
  if (typeValue) return types.find(t => t.value === typeValue) || null;
  return types.length === 1 ? types[0] : null;
}

function applyPanelEmbed(a, guild) {
  const types = (a.types || []).map(t => `${t.emoji || '📝'} **${t.label}**${t.description ? ` — ${t.description}` : ''}`).join('\n') || '*No application types configured.*';
  const e = new Card()
    .setColor(a.panel?.color || config.branding.color)
    .setDescription(`${a.panel?.description || ''}\n\n**Available:**\n${types}`)
    .setFooter({ text: config.branding.footer, iconURL: config.branding.iconURL });
  if (a.panel?.title) e.setTitle(a.panel.title);
  if (guild) {
    const icon = guild.iconURL?.({ size: 256, extension: 'png' });
    if (icon) e.setThumbnail(icon);
  }
  return e;
}

function applyPanelComponents(a) {
  const types = (a.types || []).slice(0, 25);
  if (!types.length) return [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${APP}:start`)
    .setPlaceholder(a.panel?.placeholder || 'Select an application type…')
    .addOptions(types.map(t => ({
      label: String(t.label).slice(0, 100),
      value: String(t.value).slice(0, 100),
      emoji: t.emoji || undefined,
      description: t.description ? String(t.description).slice(0, 100) : undefined,
    })));
  return [new ActionRowBuilder().addComponents(menu)];
}

function applyChooserEmbed(a, guild) {
  return applyPanelEmbed(a, guild)
    .setTitle('📝 Start Application')
    .setDescription('Choose which application you want to start. I will DM you the questions right after you choose.');
}

async function openApplyChooser(target, existingSettings = null) {
  const s = existingSettings || await settings.get(target.guild.id);
  const a = s.applications;
  const components = applyPanelComponents(a);
  if (!components.length) {
    return safeReply(target, v2([embeds.error('No Applications', 'No application types are configured yet.')]));
  }
  return safeReply(target, v2([applyChooserEmbed(a, target.guild), ...components]));
}

async function sendApplyPanel(channel) {
  const s = await settings.get(channel.guild.id);
  return channel.send(v2([applyPanelEmbed(s.applications, channel.guild), ...applyPanelComponents(s.applications)]));
}

function mainEmbed(s) {
  const a = s.applications;
  const types = (a.types || []).map((t, i) => `**${i + 1}.** ${t.emoji || '📝'} ${t.label} \`${t.value}\` — ${t.questions?.length || 0} question(s)`).join('\n') || '*No types configured.*';
  return new Card()
    .setColor(a.panel?.color || config.branding.color)
    .setTitle('📝 Application Settings')
    .setDescription('Configure application types, questions, panel and log channel. Changes save automatically.')
    .addFields(
      { name: 'Apply Panel Channel', value: a.panelChannelId ? `<#${a.panelChannelId}>` : '— (set with the button below)', inline: true },
      { name: 'Log Channel',         value: a.logChannelId ? `<#${a.logChannelId}>` : '— (required for submissions)', inline: true },
      { name: 'Panel Color',         value: a.panel?.color || '—', inline: true },
      { name: 'Types', value: types, inline: false },
    )
    .setFooter({ text: config.branding.footer, iconURL: config.branding.iconURL });
}

function mainComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('panel')).setLabel('Edit Panel').setEmoji('🖼️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('types')).setLabel('Types & Questions').setEmoji('📂').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('logch')).setLabel('Log Channel').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('panelch')).setLabel('Panel Channel').setEmoji('📨').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('preview')).setLabel('Preview Panel').setEmoji('👁️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('send')).setLabel('Send Panel Here').setEmoji('📤').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('reset')).setLabel('Reset Defaults').setEmoji('♻️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id('close')).setLabel('Close').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

async function openMainPanel(target) {
  const s = await settings.get(target.guild.id);
  const payload = v2([mainEmbed(s), ...mainComponents()]);
  const isInteraction = typeof target.isRepliable === 'function' && target.isRepliable();

  if (isInteraction && (target.replied || target.deferred)) return target.editReply(payload).catch(() => null);

  if (target.isButton?.() || target.isAnySelectMenu?.() || target.isModalSubmit?.()) {
    return target.update({ ...payload }).catch(() => target.reply({ ...payload, ephemeral: true }).catch(() => null));
  }

  if (!isInteraction && typeof target.reply === 'function') {
    return target.reply(payload).catch(() => null);
  }

  if (typeof target.reply === 'function') {
    return target.reply({ ...payload, ephemeral: true }).catch(() => target.reply(payload).catch(() => null));
  }
  return null;
}

function typesEmbed(a) {
  const list = (a.types || []).map((t, i) =>
    `**${i + 1}.** ${t.emoji || '📝'} **${t.label}** \`${t.value}\` — ${t.questions?.length || 0} Q`
  ).join('\n') || '*No types yet.*';
  return new Card().setColor(config.branding.color).setTitle('📂 Application Types')
    .setDescription(list + '\n\nPick a type to edit it, or add a new one.');
}

function typesComponents(a) {
  const rows = [];
  const list = (a.types || []).slice(0, 25);
  if (list.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(id('type-pick'))
        .setPlaceholder('Select a type to edit/remove…')
        .addOptions(list.map((t, i) => ({
          label: `${i + 1}. ${t.label}`.slice(0, 100),
          value: String(t.value),
          emoji: t.emoji || undefined,
          description: (t.description || `value: ${t.value}`).slice(0, 100),
        })))
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('type-add')).setLabel('Add Type').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

function typeDetailEmbed(t) {
  return new Card().setColor(config.branding.color)
    .setTitle(`${t.emoji || '📝'} ${t.label}`)
    .setDescription([
      `Value: \`${t.value}\``,
      `Description: ${t.description || '—'}`,
      '',
      `**Questions (${t.questions?.length || 0}):**`,
      (t.questions || []).map((q, i) => `**${i + 1}.** ${q}`).join('\n') || '*No questions.*',
      '',
      `**Accept message:** ${t.acceptMessage || '—'}`,
      `**Decline message:** ${t.declineMessage || '—'}`,
    ].join('\n').slice(0, 4000));
}

function typeDetailComponents(value) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('type-edit', value)).setLabel('Edit Basics').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('type-qs', value)).setLabel('Edit Questions').setEmoji('❓').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('type-msgs', value)).setLabel('Edit Messages').setEmoji('✉️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(id('type-remove', value)).setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(id('types')).setLabel('← Types').setStyle(ButtonStyle.Secondary),
  )];
}

function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  for (const f of fields) {
    const t = new TextInputBuilder()
      .setCustomId(f.id).setLabel(f.label.slice(0, 45))
      .setStyle(f.style || TextInputStyle.Short)
      .setRequired(!!f.required);
    if (f.value !== undefined && f.value !== null) t.setValue(String(f.value).slice(0, f.max || 1000));
    if (f.placeholder) t.setPlaceholder(f.placeholder.slice(0, 100));
    if (f.max) t.setMaxLength(f.max);
    m.addComponents(new ActionRowBuilder().addComponents(t));
  }
  return m;
}

async function showPanelModal(interaction, a) {
  return interaction.showModal(modal(id('panel-save'), 'Edit Apply Panel', [
    { id: 'title', label: 'Title (optional)', value: a.panel.title, max: 200, required: false },
    { id: 'description', label: 'Description', value: a.panel.description, style: TextInputStyle.Paragraph, max: 2000, required: true },
    { id: 'color', label: 'Color (hex #5865F2)', value: a.panel.color, max: 9 },
    { id: 'placeholder', label: 'Dropdown placeholder', value: a.panel.placeholder, max: 100 },
  ]));
}

async function showTypeBasicsModal(interaction, existing) {
  const e = existing || { label: '', value: '', emoji: '📝', description: '' };
  return interaction.showModal(modal(id('type-save', existing ? existing.value : '__new__'), existing ? `Edit ${existing.label}` : 'Add Type', [
    { id: 'label', label: 'Label (shown in dropdown)', value: e.label, max: 80, required: true },
    { id: 'value', label: 'Value (unique id, no spaces)', value: e.value, max: 60, required: true, placeholder: 'staff' },
    { id: 'emoji', label: 'Emoji', value: e.emoji, max: 10 },
    { id: 'description', label: 'Description (optional)', value: e.description, max: 100 },
  ]));
}

async function showQuestionsModal(interaction, t) {
  return interaction.showModal(modal(id('qs-save', t.value), `Questions — ${t.label}`, [
    {
      id: 'questions',
      label: 'One question per line (max 20)',
      value: (t.questions || []).join('\n'),
      style: TextInputStyle.Paragraph,
      max: 4000,
      required: true,
      placeholder: 'What is your name?\nWhy do you want to join?',
    },
  ]));
}

async function showMessagesModal(interaction, t) {
  return interaction.showModal(modal(id('msgs-save', t.value), `Messages — ${t.label}`, [
    { id: 'accept', label: 'Accept DM ({user} {type})', value: t.acceptMessage || '', style: TextInputStyle.Paragraph, max: 1500, required: true },
    { id: 'decline', label: 'Decline DM ({user} {type} {reason})', value: t.declineMessage || '', style: TextInputStyle.Paragraph, max: 1500, required: true },
  ]));
}

async function handleSettingsInteraction(interaction) {
  const cid = interaction.customId || '';
  if (!cid.startsWith(NS + ':')) return false;
  if (!isAppAdmin(interaction.member)) {
    if (interaction.isModalSubmit() || interaction.isAnySelectMenu() || interaction.isButton()) {
      await safeReply(interaction, v2([embeds.error('Insufficient Permissions', 'You need Manage Server to edit application settings.')]));
    }
    return true;
  }
  const parts = cid.split(':');
  const action = parts[1];
  const arg = parts[2];

  const instantModalOpeners = new Set(['panel', 'type-add', 'type-edit', 'type-qs', 'type-msgs']);
  const isModalOpener = interaction.isButton() && instantModalOpeners.has(action);
  const isComponent = interaction.isButton() || interaction.isAnySelectMenu();
  if (isComponent && !isModalOpener && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  if (interaction.isModalSubmit() && !interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
  }

  try {
    const s = await settings.get(interaction.guild.id);
    const a = s.applications;

    if (interaction.isButton()) {
      switch (action) {
        case 'panel':    return void await showPanelModal(interaction, a);
        case 'types':    return void await safeUpdate(interaction, v2([typesEmbed(a), ...typesComponents(a)]));
        case 'type-add': return void await showTypeBasicsModal(interaction, null);
        case 'type-edit': {
          const t = (a.types || []).find(x => x.value === arg);
          return void await showTypeBasicsModal(interaction, t);
        }
        case 'type-qs': {
          const t = (a.types || []).find(x => x.value === arg);
          return void await showQuestionsModal(interaction, t);
        }
        case 'type-msgs': {
          const t = (a.types || []).find(x => x.value === arg);
          return void await showMessagesModal(interaction, t);
        }
        case 'type-remove': {
          const next = (a.types || []).filter(x => x.value !== arg);
          await settings.set(interaction.guild.id, { applications: { types: next } });
          const ns = await settings.get(interaction.guild.id);
          return void await safeUpdate(interaction, v2([typesEmbed(ns.applications), ...typesComponents(ns.applications)]));
        }
        case 'back': return void await openMainPanel(interaction);
        case 'logch':
          return void await safeUpdate(interaction, v2([new Card().setColor(config.branding.color).setTitle('📜 Log Channel').setDescription('Channel where submitted applications are posted with accept/decline buttons.'), new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(id('logch-pick')).addChannelTypes(ChannelType.GuildText).setPlaceholder('Pick a log channel')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary))]));
        case 'panelch':
          return void await safeUpdate(interaction, v2([new Card().setColor(config.branding.color).setTitle('📨 Apply Panel Channel').setDescription('Channel where /application panel will be posted (informational only).'), new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(id('panelch-pick')).addChannelTypes(ChannelType.GuildText).setPlaceholder('Pick a channel')), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id('back')).setLabel('← Back').setStyle(ButtonStyle.Secondary))]));
        case 'preview':
          return void await interaction.followUp(v2([applyPanelEmbed(a, interaction.guild), ...applyPanelComponents(a)], { ephemeral: true })).catch(() => null);
        case 'send':
          await sendApplyPanel(interaction.channel);
          return void await interaction.followUp(v2([embeds.success('Panel Sent', `Sent in ${interaction.channel}.`)], { ephemeral: true })).catch(() => null);
        case 'reset':
          await settings.set(interaction.guild.id, { applications: settings.applicationDefaults() });
          return void await openMainPanel(interaction);
        case 'close':
          return void await safeUpdate(interaction, v2([embeds.success('Closed', 'Settings panel closed.')]));
      }
    }

    if (interaction.isAnySelectMenu()) {
      if (action === 'logch-pick') {
        await settings.set(interaction.guild.id, { applications: { logChannelId: interaction.values[0] || '' } });
        return void await openMainPanel(interaction);
      }
      if (action === 'panelch-pick') {
        await settings.set(interaction.guild.id, { applications: { panelChannelId: interaction.values[0] || '' } });
        return void await openMainPanel(interaction);
      }
      if (action === 'type-pick') {
        const t = (a.types || []).find(x => x.value === interaction.values[0]);
        if (!t) return void await safeUpdate(interaction, v2([typesEmbed(a), ...typesComponents(a)]));
        return void await safeUpdate(interaction, v2([typeDetailEmbed(t), ...typeDetailComponents(t.value)]));
      }
    }

    if (interaction.isModalSubmit()) {
      const get = (k) => interaction.fields.getTextInputValue(k);
      if (action === 'panel-save') {
        await settings.set(interaction.guild.id, { applications: { panel: {
          title: get('title'), description: get('description'),
          color: get('color') || a.panel.color,
          placeholder: get('placeholder') || a.panel.placeholder,
        } } });
        return void await safeReply(interaction, v2([embeds.success('Panel Saved', 'Your application panel settings were saved.')]));
      }
      if (action === 'type-save') {
        const nt = {
          label: get('label').trim(),
          value: get('value').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60),
          emoji: (get('emoji') || '📝').trim(),
          description: (get('description') || '').trim(),
        };
        if (!nt.label || !nt.value) {
          return void await safeReply(interaction, v2([embeds.error('Invalid', 'Label and value are required.')]));
        }
        const list = Array.isArray(a.types) ? a.types.slice() : [];
        if (arg === '__new__') {
          if (list.some(x => x.value === nt.value)) {
            return void await safeReply(interaction, v2([embeds.error('Duplicate', `A type with value \`${nt.value}\` already exists.`)]));
          }
          list.push({ ...nt, questions: ['Why are you applying?'], acceptMessage: '🎉 Your **{type}** application has been **accepted**!', declineMessage: 'Your **{type}** application was declined.' });
        } else {
          const idx = list.findIndex(x => x.value === arg);
          if (idx === -1) list.push({ ...nt, questions: [], acceptMessage: '', declineMessage: '' });
          else list[idx] = { ...list[idx], ...nt };
        }
        await settings.set(interaction.guild.id, { applications: { types: list } });
        await safeReply(interaction, v2([embeds.success('Type Saved', 'Open `/application settings` again if you want to continue editing.')]));
        return true;
      }
      if (action === 'qs-save') {
        const raw = get('questions') || '';
        const qs = raw.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 20);
        if (!qs.length) return void await safeReply(interaction, v2([embeds.error('Invalid', 'At least one question required.')]));
        const list = (a.types || []).map(t => t.value === arg ? { ...t, questions: qs } : t);
        await settings.set(interaction.guild.id, { applications: { types: list } });
        await safeReply(interaction, v2([embeds.success('Questions saved', `${qs.length} question(s) saved.`)]));
        return true;
      }
      if (action === 'msgs-save') {
        const accept = get('accept'); const decline = get('decline');
        const list = (a.types || []).map(t => t.value === arg ? { ...t, acceptMessage: accept, declineMessage: decline } : t);
        await settings.set(interaction.guild.id, { applications: { types: list } });
        await safeReply(interaction, v2([embeds.success('Messages saved')]));
        return true;
      }
    }
  } catch (err) {
    console.error('[APP-SETTINGS]', err);
    const msg = err?.message?.slice(0, 1500) || 'Unknown error';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(v2([embeds.error('Error', msg)], { ephemeral: true })).catch(() => null);
    } else if (interaction.isRepliable()) {
      await interaction.reply(v2([embeds.error('Error', msg)], { ephemeral: true })).catch(() => null);
    }
  }
  return true;
}

async function startApplication(interaction, forcedTypeValue = '') {
  const guild = interaction.guild;
  ensureDMListener(interaction.client);
  const s = await settings.get(guild.id);
  const a = s.applications;
  const typeValue = forcedTypeValue || interaction.values?.[0] || '';
  const type = pickType(a, typeValue);
  if (!type) {
    if ((a.types || []).length > 1 && !typeValue) return openApplyChooser(interaction, s);
    return safeReply(interaction, v2([embeds.error('Unknown type', 'That application type no longer exists or no application types are configured.')]));
  }
  const questions = cleanQuestions(type);
  if (!questions.length) {
    return safeReply(interaction, v2([embeds.error('No Questions', 'This application has no questions configured yet.')]));
  }
  if (!a.logChannelId) {
    return safeReply(interaction, v2([embeds.error('Not configured', 'An admin must set a log channel with `/application settings` first.')]));
  }
  if (sessions.has(interaction.user.id)) {
    return safeReply(interaction, v2([embeds.warn('Already applying', 'You already have an application in progress — finish or type `cancel` in DMs.')]));
  }

  let dm;
  try { dm = await interaction.user.createDM(); }
  catch {
    return safeReply(interaction, v2([embeds.error('DMs Closed', 'I cannot DM you. Enable DMs from this server and try again.')]));
  }

  const color = a.panel?.color || config.branding.color;
  try {
    const intro = new Card().setColor(color)
      .setTitle(`${type.emoji || '📝'} ${type.label}`)
      .setDescription(`Applying in **${guild.name}**.\nYou have **10 minutes per answer**. Reply \`cancel\` at any time to abort.\n\nQuestions: **${questions.length}**`);
    if (guild.iconURL?.()) intro.setThumbnail(guild.iconURL({ size: 256, extension: 'png' }));
    await dm.send(v2([intro]));
  } catch (err) {
    return safeReply(interaction, v2([embeds.error('DMs Closed', 'I cannot DM you. Enable DMs from this server and try again.')]));
  }

  const sess = {
    guildId: guild.id,
    userId: interaction.user.id,
    client: interaction.client,
    dmChannel: dm,
    type,
    questions,
    answers: [],
    index: 0,
    logChannelId: a.logChannelId,
    color,
    timer: null,
  };
  sessions.set(interaction.user.id, sess);
  console.log(`[APP] Started DM application session user=${interaction.user.id} guild=${guild.id} type=${type.value} questions=${questions.length}`);

  await safeReply(interaction, v2([embeds.success('Check your DMs', `I sent you the **${type.label}** questions. Answer them one at a time.`)]));

  try {
    await sendNextQuestion(sess);
  } catch (err) {
    console.error('[APP] send first question failed', err);
    sessions.delete(interaction.user.id);
    await safeReply(interaction, v2([embeds.error('DM failed', 'I opened your DM but could not send the first question. Check bot DM permissions and try again.')]));
  }
}

async function handleDM(message, source = 'direct-call') {
  message = await fetchIfPartial(message);
  if (!message || message.author?.bot) return false;
  if (!isDMChannel(message)) return false;
  const sess = sessions.get(message.author.id);
  if (!sess) return false;
  if (markDMMessageSeen(message.id)) {
    console.log(`[APP DM] Ignored duplicate DM message user=${message.author.id} message=${message.id || 'unknown'} source=${source}`);
    return true;
  }

  const ans = (message.content || '').trim();
  console.log(`[APP] Handling DM answer via ${source}: user=${message.author.id} question=${sess.index + 1}/${sess.questions.length} contentLength=${ans.length}`);
  if (!ans) {
    await sendApplicantMessage(sess, v2([embeds.warn('Empty answer', 'Please send a text answer (no attachments-only). If you did type text, restart the bot with GatewayIntentBits.MessageContent enabled.')]), message, 'empty-answer warning').catch(() => null);
    return true;
  }
  if (/^cancel$/i.test(ans)) {
    clearSessionTimer(sess);
    sessions.delete(sess.userId);
    console.log(`[APP] Cancelled DM application session user=${sess.userId} guild=${sess.guildId} type=${sess.type?.value || 'unknown'} answered=${sess.answers.length}/${sess.questions.length}`);
    await sendApplicantMessage(sess, v2([embeds.warn('Cancelled', 'Application cancelled.')]), message, 'cancel notice').catch(() => null);
    return true;
  }

  clearSessionTimer(sess);
  sess.answers.push(ans.slice(0, 1000));
  console.log(`[APP] Saved answer user=${sess.userId} guild=${sess.guildId} type=${sess.type?.value || 'unknown'} question=${sess.index + 1}/${sess.questions.length} answer="${answerPreview(ans)}"`);
  sess.index += 1;

  if (sess.index < sess.questions.length) {
    try { await sendNextQuestion(sess, message); }
    catch (err) {
      console.error(`[APP] Failed to send next question user=${sess.userId} question=${sess.index + 1}/${sess.questions.length}`, err);
      sessions.delete(sess.userId);
      await sendApplicantMessage(sess, v2([embeds.error('Application stopped', 'I saved your answer, but I could not send the next question. Please contact staff.')]), message, 'next-question failure notice').catch(() => null);
    }
    return true;
  }

  sessions.delete(sess.userId);
  console.log(`[APP] Finished DM answers user=${sess.userId} guild=${sess.guildId} type=${sess.type?.value || 'unknown'} answers=${sess.answers.length}/${sess.questions.length}; submitting application.`);
  try { await finishApplication(sess, message); }
  catch (err) {
    console.error('[APP] finish', err);
    await sendApplicantMessage(sess, v2([embeds.error('Error', 'Something went wrong submitting your application.')]), message, 'submit error notice').catch(() => null);
  }
  return true;
}

async function finishApplication(sess, message) {
  const { client, guildId, userId, type, questions, answers, logChannelId, color } = sess;
  const user = message?.author || await client.users.fetch(userId).catch(() => null);

  let appDoc;
  if (Application) {
    try {
      appDoc = await Application.create({
        guildId, userId,
        typeValue: type.value, typeLabel: type.label,
        questions, answers,
        logChannelId,
      });
    } catch (e) { console.error('[APP] save', e); }
  }
  const appId = appDoc?._id?.toString() || `mem_${Date.now()}_${userId}`;
  if (!appDoc) memApps.set(appId, { guildId, userId, typeValue: type.value, typeLabel: type.label, questions, answers, status: 'pending' });

  const ch = await client.channels.fetch(logChannelId).catch(() => null);
  if (!ch) {
    console.error(`[APP] Submission failed: log channel unreachable guild=${guildId} channel=${logChannelId} user=${userId}`);
    await sendApplicantMessage(sess, v2([embeds.error('Submission failed', 'The configured log channel is unreachable. Please contact staff.')]), message, 'log-channel failure notice').catch(() => null);
    return;
  }
  const guild = client.guilds.cache.get(guildId);
  const logEmbed = new Card().setColor(color)
    .setTitle(`📥 New Application — ${type.label}`)
    .setAuthor({ name: `${user?.tag || userId} (${userId})`, iconURL: user?.displayAvatarURL?.() })
    .setDescription(`**Applicant:** <@${userId}>\n**Type:** ${type.label} \`${type.value}\``)
    .setTimestamp();
  questions.forEach((q, i) => {
    logEmbed.addFields({ name: `Q${i + 1}: ${q.slice(0, 240)}`, value: (answers[i] || '—').slice(0, 1024) });
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${APP}:accept:${appId}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${APP}:decline:${appId}`).setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
  const sent = await ch.send(v2([logEmbed, row])).catch((e) => { console.error('[APP] log send', e); return null; });
  if (sent && appDoc) {
    try { appDoc.logMessageId = sent.id; await appDoc.save(); } catch {}
  } else if (sent) {
    const cur = memApps.get(appId); if (cur) cur.logMessageId = sent.id;
  }
  if (sent) {
    console.log(`[APP] Logged application appId=${appId} user=${userId} guild=${guildId} channel=${logChannelId} message=${sent.id} answers=${answers.length}/${questions.length}`);
  } else {
    console.error(`[APP] Failed to send application log appId=${appId} user=${userId} guild=${guildId} channel=${logChannelId}`);
  }

  await sendApplicantMessage(sess, v2([embeds.success('Submitted', 'Your application has been sent to the staff team. You will receive a DM when a decision is made.')]), message, 'submitted notice').catch(() => null);
}

async function loadApp(appId) {
  if (Application && /^[a-f0-9]{24}$/i.test(appId)) {
    try { return await Application.findById(appId); } catch {}
  }
  const m = memApps.get(appId);
  if (!m) return null;

  return {
    ...m,
    save: async () => { memApps.set(appId, { ...m }); },
    _isMem: true,
    _appId: appId,
  };
}

async function decideApplication(interaction, decision, reason = '', forcedAppId = '', extras = '') {

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
  }

  const parts = interaction.customId.split(':');
  const appId = forcedAppId || parts.slice(2).join(':');
  const app = await loadApp(appId);
  if (!app) {
    return interaction.editReply(v2([embeds.error('Not found', 'This application no longer exists.')])).catch(() => null);
  }
  if (app.status && app.status !== 'pending') {
    return interaction.editReply(v2([embeds.warn('Already decided', `This application is already **${app.status}**.`)])).catch(() => null);
  }

  const s = await settings.get(interaction.guild.id);
  const type = (s.applications.types || []).find(t => t.value === app.typeValue) || { label: app.typeLabel, acceptMessage: 'Your application has been accepted!', declineMessage: 'Your application has been declined.' };

  app.status = decision;
  app.decidedBy = interaction.user.id;
  app.reason = reason || '';
  if (extras) app.extras = extras;
  try { await app.save(); } catch {}
  if (app._isMem) memApps.set(app._appId, { ...app });

  const moderator = interaction.user;
  const applicant = await interaction.client.users.fetch(app.userId).catch(() => null);
  if (applicant) {
    const vars = { user: `${applicant}`, type: type.label, reason: reason || '—', moderator: `${moderator}` };
    const baseMsg = decision === 'accepted'
      ? fmt(type.acceptMessage || 'Your application has been accepted.', vars)
      : fmt(type.declineMessage || 'Your application has been declined.', vars);

    const dmEmbed = new Card()
      .setColor(decision === 'accepted' ? 0x57F287 : 0xED4245)
      .setTitle(decision === 'accepted' ? '✅ Application Accepted' : '❌ Application Declined')
      .setDescription(baseMsg)
      .addFields({
        name: decision === 'accepted' ? 'Reviewed by' : 'Declined by',
        value: `${moderator} (\`${moderator.tag}\`)`,
      })
      .setFooter({ text: interaction.guild.name, iconURL: interaction.guild.iconURL() || undefined })
      .setTimestamp();

    if (decision === 'accepted' && extras) {
      dmEmbed.addFields({ name: '💬 Additional comments', value: extras.slice(0, 1024) });
    }
    if (decision === 'declined' && reason) {
      dmEmbed.addFields({ name: 'Reason', value: reason.slice(0, 1024) });
    }

    await applicant.send(v2([dmEmbed])).catch(() => null);
  }

  try {
    const orig = interaction.message;
    const origContainer = orig?.components?.find((c) => c.type === 17);
    if (origContainer) {
      const fieldValueParts = [`${moderator}`];
      if (decision === 'accepted' && extras) fieldValueParts.push(`**Comments:** ${extras}`);
      if (decision === 'declined' && reason) fieldValueParts.push(`**Reason:** ${reason}`);

      const updated = Card.fromContainer(origContainer.toJSON())
        .setAccentColor(decision === 'accepted' ? 0x57F287 : 0xED4245)
        .addSeparatorComponents(separator(true))
        .addTextDisplayComponents(
          text(`**${decision === 'accepted' ? '✅ Accepted by' : '❌ Declined by'}**\n${fieldValueParts.join('\n')}`),
        );
      await orig.edit(v2([updated]));
    }
  } catch {}

  await interaction.editReply(v2([embeds.success('Done', `Application **${decision}**${reason ? ` with reason: ${reason}` : ''}${extras ? `\nComments: ${extras}` : ''}.`)])).catch(() => null);
}

async function handleRuntimeInteraction(interaction) {
  const cid = interaction.customId || '';
  if (!cid.startsWith(APP + ':')) return false;
  const parts = cid.split(':');
  const action = parts[1];

  try {
    if (interaction.isStringSelectMenu() && action === 'start') {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);
      }
      await startApplication(interaction);
      return true;
    }
    if (interaction.isButton() && action === 'accept') {
      if (!isAppAdmin(interaction.member)) {
        await safeReply(interaction, v2([embeds.error('No permission', 'You need Manage Server.')]));
        return true;
      }

      const appId = parts.slice(2).join(':');
      const m = new ModalBuilder().setCustomId(`${APP}:accept-modal:${appId}`).setTitle('Accept Application');
      const t = new TextInputBuilder().setCustomId('extras').setLabel('Extra comments (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setPlaceholder('e.g. Welcome aboard! Reach out to a lead for next steps.');
      m.addComponents(new ActionRowBuilder().addComponents(t));
      await interaction.showModal(m);
      return true;
    }
    if (interaction.isModalSubmit() && action === 'accept-modal') {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);
      }
      const appId = parts.slice(2).join(':');
      const extras = interaction.fields.getTextInputValue('extras') || '';
      await decideApplication(interaction, 'accepted', '', appId, extras);
      return true;
    }
    if (interaction.isButton() && action === 'decline') {
      if (!isAppAdmin(interaction.member)) {
        await safeReply(interaction, v2([embeds.error('No permission', 'You need Manage Server.')]));
        return true;
      }
      const appId = parts.slice(2).join(':');
      const m = new ModalBuilder().setCustomId(`${APP}:decline-modal:${appId}`).setTitle('Decline Application');
      const t = new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
      m.addComponents(new ActionRowBuilder().addComponents(t));
      await interaction.showModal(m);
      return true;
    }
    if (interaction.isModalSubmit() && action === 'decline-modal') {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => null);
      }
      const appId = parts.slice(2).join(':');
      const reason = interaction.fields.getTextInputValue('reason') || '';
      await decideApplication(interaction, 'declined', reason, appId);
      return true;
    }
  } catch (err) {
    console.error('[APP-RT]', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(v2([embeds.error('Error', err.message?.slice(0, 1500) || 'Unknown error')], { ephemeral: true })).catch(() => null);
    }
  }
  return false;
}

async function handleInteraction(interaction) {
  const cid = interaction.customId || '';
  if (cid.startsWith(NS + ':')) return handleSettingsInteraction(interaction);
  if (cid.startsWith(APP + ':')) return handleRuntimeInteraction(interaction);
  return false;
}

module.exports = {
  openMainPanel, openApplyChooser, sendApplyPanel, startApplication,
  handleInteraction, handleSettingsInteraction, handleRuntimeInteraction,
  handleDM, routeDMMessage, routeRawDM, sendNextQuestion,
  isAppAdmin,
};

