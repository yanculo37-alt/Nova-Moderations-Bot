const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const setup = require('../../systems/setup');
const settings = require('../../utils/settings');
const embeds = require('../../embeds');
const { ok, fail, statusReply } = require('../../utils/reply');
const { v2 } = require('../../utils/v2');
const { UserError } = require('../../utils/errors');

const PREFIX_RULES =
  'A prefix must be 1–5 characters and can\'t contain spaces, backticks, `@` or `#`.';

function validatePrefix(value) {
  const v = String(value ?? '').trim();
  if (!v) throw new UserError('Invalid Prefix', `You didn't provide a prefix. ${PREFIX_RULES}`);
  if (v.length > 5) throw new UserError('Prefix Too Long', `\`${v}\` is ${v.length} characters. ${PREFIX_RULES}`);
  if (/[\s`@#]/.test(v)) throw new UserError('Invalid Prefix', `\`${v}\` contains a character I can't use. ${PREFIX_RULES}`);
  return v;
}

module.exports = {
  name: 'setup',
  description: 'Configure the bot interactively (admin only).',
  category: 'admin',
  aliases: ['config', 'cfg'],

  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot interactively (admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('open').setDescription('Open the interactive setup panel'))
    .addSubcommand(s => s.setName('auto').setDescription('Run auto setup — create channels/roles automatically'))
    .addSubcommand(s => s.setName('view').setDescription('Show current saved settings'))
    .addSubcommand(s => s.setName('reset').setDescription('Wipe all saved settings'))
    .addSubcommand(s => s
      .setName('prefix')
      .setDescription('Change the prefix used for ! commands')
      .addStringOption(o => o.setName('value').setDescription('New prefix (max 5 chars)').setRequired(true))),

  async execute({ interaction }) {
    if (!interaction.inGuild() || !interaction.guild) {
      return fail(interaction, 'Server Only', 'Setup can only be used inside a server.');
    }
    if (!setup.isAdmin(interaction.member)) {
      return fail(interaction, 'Insufficient Permissions', 'You need **Administrator** or **Manage Server** to use setup.');
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'open')  return setup.openMainPanel(interaction);
    if (sub === 'auto')  return setup.openAutoPanel(interaction);

    if (sub === 'view') {
      const s = await settings.get(interaction.guild.id);
      const json = '```json\n' + JSON.stringify(s, null, 2).slice(0, 3800) + '\n```';
      return statusReply(interaction, embeds.info('Current Settings', json), { ephemeral: true });
    }

    if (sub === 'reset') {
      await settings.reset(interaction.guild.id);
      return ok(
        interaction,
        'Settings Reset',
        'All saved settings for this server were cleared and defaults restored.\nRun `/setup open` to configure the bot again.' +
        (settings.isPersistent() ? '' : settings.NOT_PERSISTED_NOTE),
        { ephemeral: true },
      );
    }

    if (sub === 'prefix') {
      const value = validatePrefix(interaction.options.getString('value'));
      await settings.set(interaction.guild.id, { prefix: value });
      return ok(
        interaction,
        'Prefix Updated',
        `Prefix commands now use \`${value}\` — for example \`${value}help\`.` +
        (settings.isPersistent() ? '' : settings.NOT_PERSISTED_NOTE),
        { ephemeral: true },
      );
    }

    return fail(interaction, 'Unknown Sub-command', `\`/setup ${sub}\` isn't something I know how to run.`);
  },

  async run({ message, args }) {
    if (!setup.isAdmin(message.member)) {
      return fail(message, 'Insufficient Permissions', 'You need **Administrator** or **Manage Server** to use setup.');
    }
    const sub = (args[0] || 'open').toLowerCase();
    if (sub === 'open')   return setup.openMainPanel(message);
    if (sub === 'view') {
      const s = await settings.get(message.guild.id);
      const json = '```json\n' + JSON.stringify(s, null, 2).slice(0, 3800) + '\n```';
      return message.reply(v2([embeds.info('Current Settings', json)], { allowedMentions: { parse: [] } })).catch(() => null);
    }
    if (sub === 'reset') {
      await settings.reset(message.guild.id);
      return ok(message, 'Settings Reset',
        'All saved settings for this server were cleared and defaults restored.' +
        (settings.isPersistent() ? '' : settings.NOT_PERSISTED_NOTE));
    }
    if (sub === 'prefix') {
      const value = validatePrefix(args[1]);
      await settings.set(message.guild.id, { prefix: value });
      return ok(message, 'Prefix Updated',
        `Prefix commands now use \`${value}\` — for example \`${value}help\`.` +
        (settings.isPersistent() ? '' : settings.NOT_PERSISTED_NOTE));
    }
    if (sub === 'auto') {
      return setup.openAutoPanel(message);
    }
    return fail(message, 'Unknown sub-command', 'Use `!setup open | auto | view | reset | prefix <value>`.');
  },
};
