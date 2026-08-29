const {
  SlashCommandBuilder,
  PermissionsBitField,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../../embeds');
const { v2, sectionWithButton } = require('../../utils/v2');
const GuildSettings = require('../../models/GuildSettings');
const RealmAPI = require('../../realms/RealmAPI');
const realmWatchlist = require('../../realms/watchlist');
const { deviceOf, getRoleDetails } = require('../../realms/playerlist');

function isIncorrectCode(status) {
  return status === 400 || status === 404 || status === 1500;
}

function realmStatusMessage(obj, code) {
  const body = obj?.body?.errorMsg;
  const line = (msg, s) => `The realm \`${code}\` could not be read.\n${msg}${s ? ` (code \`${s}\`)` : ''}`;
  switch (obj.status) {
    case 401: return line("The bot's Xbox session expired, try again in a moment.", 401);
    case 403: return line("The bot's Xbox account is not a member of this realm and could not join it with the code.", 403);
    case 429: return line(body || 'The bot is being rate limited, try again in a few seconds.', 429);
    case 500: return line(body || 'Minecraft Realms is having issues, try again later.', 500);
    case 502:
    case 504: return line('Minecraft Realms is down, try again later.', obj.status);
    case 503: return line('Minecraft Realms is unavailable, try again later.', 503);
    case 1404: return line("The bot's Xbox account isn't linked yet — the linking code is in the bot console.", 1404);
    case 1429: return line(body || 'Minecraft Realms did not respond, try again later.', 1429);
    case 1503: return line(body || 'The database is unavailable, try again in a moment.', 1503);
    default: return line(body || 'Something went wrong, try again later.', obj.status);
  }
}

const INCORRECT_CODE_TEXT = (code) =>
  `The realm code \`${code}\` is incorrect — no realm exists with that code. Double-check the code and try again.`;

async function loadRealmCode(interaction) {
  let settings;
  try {
    settings = await GuildSettings.findOne({ guildId: interaction.guild.id }).lean();
  } catch (err) {
    console.error('[REALM /realm code] settings load failed', err);
    throw new Error('DB');
  }
  const code = settings?.realm?.code;
  if (!code) throw new Error('NO_CODE');
  return code;
}

async function handleSet(interaction, code) {
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply(v2([embeds.error(
      'Missing permission',
      'You need the **Manage Server** permission to set the realm code.',
    )], { ephemeral: true })).catch(() => null);
  }

  await interaction.deferReply().catch(() => null);

  const normalized = String(code).trim().toUpperCase();
  const realmApi = new RealmAPI();

  let realm;
  try {
    realm = await realmApi.getRealmInfo(normalized);
  } catch (err) {
    console.error('[REALM /realm set] lookup failed', err);
    return interaction.editReply(v2([embeds.error(
      'Lookup failed',
      'That realm code could not be checked right now. Try again in a moment.',
    )])).catch(() => null);
  }

  if (realm?.status) {
    const text = isIncorrectCode(realm.status)
      ? INCORRECT_CODE_TEXT(normalized)
      : realmStatusMessage(realm, normalized);
    return interaction.editReply(v2([embeds.error(
      isIncorrectCode(realm.status) ? 'Incorrect realm code' : 'Realm unavailable',
      text,
    )])).catch(() => null);
  }

  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { $set: { guildId: interaction.guild.id, 'realm.code': normalized } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[REALM /realm set] save failed', err);
    return interaction.editReply(v2([embeds.error(
      'Could not save',
      'The realm code is valid, but saving it failed. Try again in a moment.',
    )])).catch(() => null);
  }

  return interaction.editReply(v2([embeds.success(
    'Realm code set',
    `\`/realm players\` in this server now uses the realm code \`${normalized}\`.`,
  ).addFields(
    { name: 'Realm', value: `\`${realm.name || 'Unnamed realm'}\`` },
    { name: 'Realm code', value: `\`${normalized}\``, inline: true },
  ).setFooter({ text: 'Nova Moderation' }).setTimestamp()])).catch(() => null);
}

async function handlePlayers(interaction) {
  await interaction.deferReply().catch(() => null);

  let settings;
  try {
    settings = await GuildSettings.findOne({ guildId: interaction.guild.id }).lean();
  } catch (err) {
    console.error('[REALM /realm players] settings load failed', err);
    return interaction.editReply(v2([embeds.error(
      'Database unavailable',
      'The realm settings could not be loaded. Try again in a moment.',
    )])).catch(() => null);
  }

  const code = settings?.realm?.code;
  if (!code) {
    return interaction.editReply(v2([embeds.warn(
      'No realm code set',
      'No realm code is set for this server yet. Set one with `/realm set`.',
    )])).catch(() => null);
  }

  const realmApi = new RealmAPI();

  let realm;
  try {
    realm = await realmApi.getRealmInfo(code);
  } catch (err) {
    console.error('[REALM /realm players] lookup failed', err);
    return interaction.editReply(v2([embeds.error(
      'Lookup failed',
      `The realm \`${code}\` could not be read right now. Try again in a moment.`,
    )])).catch(() => null);
  }

  if (realm?.status) {
    if (isIncorrectCode(realm.status)) {
      return interaction.editReply(v2([embeds.error(
        'Incorrect realm code',
        `${INCORRECT_CODE_TEXT(code)}\nSet a new one with \`/realm set\`.`,
      )])).catch(() => null);
    }
    return interaction.editReply(v2([embeds.error('Realm unavailable', realmStatusMessage(realm, code))])).catch(() => null);
  }

  const active = await realmApi.getActivePlayers(realm.id).catch(() => null);
  if (active?.status) {
    return interaction.editReply(v2([embeds.error('Realm unavailable', realmStatusMessage(active, code))])).catch(() => null);
  }

  const xuids = (active?.players ?? []).map((p) => p.uuid).filter(Boolean);

  if (xuids.length === 0) {
    return interaction.editReply(v2([embeds.info(
      `${realm.name || 'Realm'} playerlist`,
      'Nobody is playing on this realm right now.',
    ).addFields(
      { name: 'Online', value: `\`0/${realm.maxPlayers ?? '?'}\``, inline: true },
      { name: 'Realm code', value: `\`${code}\``, inline: true },
    ).setFooter({ text: 'Nova Moderation' }).setTimestamp()])).catch(() => null);
  }

  let users;
  try {
    users = await realmApi.getXboxUserBulk(xuids);
  } catch (err) {
    console.error('[REALM /realm players] bulk profile lookup failed', err);
    users = null;
  }

  if (!Array.isArray(users)) {
    return interaction.editReply(v2([embeds.error(
      'Profiles unavailable',
      users?.body?.errorMsg || 'The player profiles could not be loaded right now. Try again in a moment.',
    )])).catch(() => null);
  }

  const lines = users.map((u) => {
    const player = realm.players?.find((p) => p.uuid === u.xuid);
    const role = getRoleDetails(player, realm.ownerUUID);
    const device = deviceOf(u);
    const gamertag = u.gamertag || 'Unknown';
    const xuid = u.xuid || 'Unknown';

    return `\`${gamertag}\` \`${xuid}\`
${role.icon} ${role.name} ${device.icon} ${device.name}`;
  });

  return interaction.editReply(v2([embeds.info(
    `${realm.name || 'Realm'} playerlist`,
    lines.join('\n\n').slice(0, 3800),
  ).addFields(
    { name: 'Online', value: `\`${xuids.length}/${realm.maxPlayers ?? '?'}\``, inline: true },
    { name: 'Realm code', value: `\`${code}\``, inline: true },
  ).setFooter({ text: 'Nova Moderation' }).setTimestamp()])).catch(() => null);
}

async function handleWatchlist(interaction) {
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply(v2([embeds.error(
      'Missing permission',
      'You need the **Manage Server** permission to configure the realm watchlist.',
    )], { ephemeral: true })).catch(() => null);
  }

  await interaction.deferReply().catch(() => null);

  const toggle = interaction.options.getBoolean('toggle', true);
  const channel = interaction.options.getChannel('channel');
  const delay = interaction.options.getInteger('delay');

  let settings;
  try {
    settings = await GuildSettings.findOne({ guildId: interaction.guild.id }).lean();
  } catch (err) {
    console.error('[REALM /realm watchlist] settings load failed', err);
    return interaction.editReply(v2([embeds.error(
      'Database unavailable',
      'The realm settings could not be loaded. Try again in a moment.',
    )])).catch(() => null);
  }

  const channelId = channel?.id || settings?.realm?.watchlist?.channelId || '';
  const minutes = delay ?? settings?.realm?.watchlist?.delay ?? 5;

  if (toggle && !settings?.realm?.code) {
    return interaction.editReply(v2([embeds.warn(
      'No realm code set',
      'Set a realm code first with `/realm set` before enabling the watchlist.',
    )])).catch(() => null);
  }

  if (toggle && !channelId) {
    return interaction.editReply(v2([embeds.warn(
      'No channel set',
      'Pick a channel with the `channel` option so the live playerlist has somewhere to go.',
    )])).catch(() => null);
  }

  const update = {
    guildId: interaction.guild.id,
    'realm.watchlist.enabled': toggle,
    'realm.watchlist.channelId': channelId,
    'realm.watchlist.delay': minutes,
  };
  try {
    await GuildSettings.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error('[REALM /realm watchlist] save failed', err);
    return interaction.editReply(v2([embeds.error(
      'Could not save',
      'The watchlist settings could not be saved. Try again in a moment.',
    )])).catch(() => null);
  }

  const client = interaction.client;
  if (client) {
    if (toggle) realmWatchlist.schedule(client, interaction.guild.id).catch(() => null);
    else realmWatchlist.stop(interaction.guild.id);
  }

  if (!toggle) {
    return interaction.editReply(v2([embeds.success(
      'Watchlist disabled',
      'The live realm playerlist is no longer posted.',
    )])).catch(() => null);
  }

  return interaction.editReply(v2([embeds.success(
    'Watchlist enabled',
    `The live playerlist is posted in <#${channelId}> every **${minutes}** minute(s).`,
  )])).catch(() => null);
}

async function handleCodeShow(interaction) {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  let code;
  try {
    code = await loadRealmCode(interaction);
  } catch (err) {
    if (err.message === 'NO_CODE') {
      return interaction.editReply(v2([embeds.warn(
        'No realm code set',
        'No realm code is set for this server yet. Set one with `/realm set`.',
      )])).catch(() => null);
    }
    return interaction.editReply(v2([embeds.error(
      'Database unavailable',
      'The realm settings could not be loaded. Try again in a moment.',
    )])).catch(() => null);
  }

  return interaction.editReply(v2([embeds.info(
    'Realm Code',
    `Use the code below to join the Minecraft Bedrock Realm.\n\n## Realm Code\n\`\`\`\n${code}\n\`\`\``,
  )])).catch(() => null);
}

async function handleCodeEmbed(interaction, quietSuccess = false) {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  let code;
  try {
    code = await loadRealmCode(interaction);
  } catch (err) {
    if (err.message === 'NO_CODE') {
      return interaction.editReply(v2([embeds.warn(
        'No realm code set',
        'No realm code is set for this server yet. Set one with `/realm set`.',
      )])).catch(() => null);
    }
    return interaction.editReply(v2([embeds.error(
      'Database unavailable',
      'The realm settings could not be loaded. Try again in a moment.',
    )])).catch(() => null);
  }

  const howToButton = new ButtonBuilder()
    .setCustomId(`realm-howtojoin-${interaction.guild.id}`)
    .setLabel('How to join')
    .setStyle(ButtonStyle.Secondary);

  const card = embeds.info(
    'Realm',
    `Use the code below to join the Minecraft Bedrock Realm.`,
  ).addComponents(
    sectionWithButton(
      [`## Realm Code\n\`\`\`\n${code}\n\`\`\``],
      howToButton,
    ),
  );

  // Post the card as a normal channel message (like /announce) so it does not
  // look like a command reply, then confirm privately to the invoker.
  const payload = v2([card]);
  const channelPayload = payload && typeof payload === 'object' && payload.flags != null
    ? { ...payload, flags: payload.flags & ~64 }
    : payload;

  const channel = interaction.channel;
  if (!channel?.send) {
    return interaction.editReply(v2([embeds.error(
      'Cannot post here',
      'The realm embed could not be posted in this channel.',
    )])).catch(() => null);
  }

  try {
    await channel.send(channelPayload);
  } catch (err) {
    console.error('[REALM /realm code embed] send failed', err);
    return interaction.editReply(v2([embeds.error(
      'Could not post embed',
      'I could not send the realm embed in this channel. Check my permissions and try again.',
    )])).catch(() => null);
  }

  if (quietSuccess) return null;

  return interaction.editReply(v2([embeds.success(
    'Sent',
    'The realm code embed has been posted in this channel.',
  )])).catch(() => null);
}

async function handleHowToJoin(interaction) {
  const steps = [
    '1. Open Minecraft Bedrock Edition.',
    '2. Tap **Play**, then select the **Realms** tab.',
    '3. Tap **Create on Realms** (or the **+** icon) and choose **Join Realm**.',
    '4. Enter the realm code and tap **Join**.',
    '5. Wait a moment — you will be connected to the realm.',
  ].join('\n');

  return interaction.reply(v2([embeds.info(
    'How to join a Realm',
    steps,
  )], { ephemeral: true })).catch(() => null);
}

module.exports = {
  name: 'realm',
  aliases: ['realms'],
  description: 'Minecraft Realm tools.',
  category: 'utility',
  data: new SlashCommandBuilder()
    .setName('realm')
    .setDescription('Minecraft Realm tools.')
    .addSubcommand((s) => s
      .setName('set')
      .setDescription('Set the realm code used by /realm players in this server.')
      .addStringOption((o) => o
        .setName('code')
        .setDescription('The realm code')
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(15)))
    .addSubcommand((s) => s
      .setName('players')
      .setDescription('Show who is online on the set realm and what device they play on.'))
    .addSubcommand((s) => s
      .setName('watchlist')
      .setDescription('Post a live playerlist of the set realm into a channel on a timer.')
      .addBooleanOption((o) => o
        .setName('toggle')
        .setDescription('Turn the live playerlist on or off')
        .setRequired(true))
      .addChannelOption((o) => o
        .setName('channel')
        .setDescription('Channel where the live playerlist is posted')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addIntegerOption((o) => o
        .setName('delay')
        .setDescription('How often to refresh, in minutes (1-15)')
        .setMinValue(1)
        .setMaxValue(15)))
    .addSubcommandGroup((g) => g
      .setName('code')
      .setDescription('Show or post the realm join code.')
      .addSubcommand((s) => s
        .setName('show')
        .setDescription('Reply with the realm code.'))
      .addSubcommand((s) => s
        .setName('embed')
        .setDescription('Post a public embed with the realm code and a how-to-join button.'))),

  async execute({ interaction }) {
    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);

    if (group === 'code') {
      if (sub === 'show') return handleCodeShow(interaction);
      if (sub === 'embed') return handleCodeEmbed(interaction);
      return interaction.reply(v2([embeds.error('Unknown subcommand', 'Use `/realm code show` or `/realm code embed`.')], { ephemeral: true })).catch(() => null);
    }

    if (sub === 'set') return handleSet(interaction, interaction.options.getString('code', true));
    if (sub === 'players') return handlePlayers(interaction);
    if (sub === 'watchlist') return handleWatchlist(interaction);
    return interaction.reply(v2([embeds.error('Unknown subcommand', 'Use `/realm set`, `/realm players`, `/realm watchlist`, `/realm code show` or `/realm code embed`.')], { ephemeral: true })).catch(() => null);
  },

  async handleInteraction(interaction) {
    if (interaction.isButton?.() && interaction.customId?.startsWith('realm-howtojoin-')) {
      return handleHowToJoin(interaction);
    }
    return false;
  },

  async run({ message, args }) {
    const sub = (args[0] || '').toLowerCase();

    const send = (p) => message.reply(
      p && typeof p === 'object' && p.flags != null ? { ...p, flags: p.flags & ~64 } : p,
    );
    const fakeBase = {
      guild: message.guild,
      channel: message.channel,
      memberPermissions: message.member?.permissions,
      reply: send,
      deferReply: async () => {},
      editReply: send,
    };

    if (sub === 'set') {
      const code = args[1];
      if (!code) return send(v2([embeds.warn('Missing code', 'Usage: `!realm set <code>`')])).catch(() => null);
      return handleSet(fakeBase, code);
    }
    if (sub === 'players') {
      return handlePlayers(fakeBase);
    }
    if (sub === 'code') {
      return handleCodeShow(fakeBase);
    }
    if (sub === 'codeembed' || sub === 'code-embed') {
      await message.delete().catch(() => null);
      return handleCodeEmbed(fakeBase, true);
    }
    return send(v2([embeds.info('Realm', 'Use `/realm set`, `/realm players`, `/realm code show` or `/realm code embed` (or `!realm set <code>` / `!realm players` / `!realm code` / `!realm codeembed`).')])).catch(() => null);
  },
};
