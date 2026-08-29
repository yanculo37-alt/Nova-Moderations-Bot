const settings = require('./settings');
const { v2 } = require('../utils/v2');

async function logTo(client, guildId, key, embed) {
  try {
    const s = await settings.get(guildId);
    const id = s.logChannels?.[key];
    if (!id) return;
    const ch = await client.channels.fetch(id).catch(() => null);
    if (ch) await ch.send(v2([embed])).catch(() => null);
  } catch {}
}
module.exports = { logTo };
