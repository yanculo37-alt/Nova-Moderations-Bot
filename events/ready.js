const { ActivityType } = require('discord.js');
const config = require('../configs/config.json');
const tickets = require('../tickets/ticketSystem');
const discordAutomod = require('../utils/discordAutomod');
const realmWatchlist = require('../realms/watchlist');

const map = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`[BOT] Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} guild(s).`);
    let i = 0;
    const rotate = () => {
      const s = config.statusRotation[i++ % config.statusRotation.length];
      client.user.setActivity(s.text, { type: map[s.type] ?? ActivityType.Playing });
    };
    rotate();
    setInterval(rotate, 30_000);

    setTimeout(() => {
      discordAutomod.syncAll(client)
        .then(res => {
          const okCount = res.filter(r => r.ok).length;
          console.log(`[AUTOMOD] Discord AutoMod synced for ${okCount}/${res.length} guild(s).`);
          for (const r of res.filter(r => !r.ok)) console.warn(`[AUTOMOD] ${r.guildId}: ${r.reason}`);
        })
        .catch(e => console.warn('[AUTOMOD] sync error:', e.message));
    }, 5_000);

    const sweep = () => tickets.runAutoCloseSweep(client).catch(err => console.warn('[TICKET] autoclose sweep error:', err.message));
    setTimeout(sweep, 60_000);
    setInterval(sweep, 30 * 60_000);

    setTimeout(() => {
      realmWatchlist.startAll(client).catch(e => console.warn('[REALM WATCHLIST] start error:', e.message));
    }, 10_000);
  },
};
