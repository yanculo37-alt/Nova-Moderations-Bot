const { MessageFlags } = require('discord.js');
const embeds = require('../embeds');
const { v2 } = require('../utils/v2');
const { withEphemeral, stripEphemeral } = require('../utils/errors');

async function statusReply(target, embed, { ephemeral = false } = {}) {
  const payload = v2([embed], { allowedMentions: { parse: [] } });

  const log = (e) => console.error('[statusReply]', e?.code ?? '', e?.message ?? e);

  try {
    if (target && typeof target.isRepliable === 'function') {

      if (ephemeral) payload.flags = withEphemeral(payload.flags);

      if (target.deferred && !target.replied) {

        return await target.editReply({ ...payload, flags: stripEphemeral(payload.flags) }).catch(log);
      }
      if (target.replied) {
        return await target.followUp(payload).catch(log);
      }
      return await target.reply(payload).catch(async (e) => {
        log(e);

        return target.followUp(payload).catch(log);
      });
    }
    if (target?.reply) {

      return await target.reply(payload).catch(log);
    }
  } catch (e) {
    log(e);
  }
  return null;
}

const ok    = (target, title, desc, opts)        => statusReply(target, embeds.success(title, desc), opts);
const fail  = (target, title, desc, opts = {})   => statusReply(target, embeds.error(title, desc), { ephemeral: true, ...opts });
const warn  = (target, title, desc, opts = {})   => statusReply(target, embeds.warn(title, desc), { ephemeral: true, ...opts });
const info  = (target, title, desc, opts)        => statusReply(target, embeds.info(title, desc), opts);

module.exports = { statusReply, ok, fail, warn, info };
