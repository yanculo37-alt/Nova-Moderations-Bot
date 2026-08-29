const mongoose = require('mongoose');
const { Authflow, Titles } = require('./authentication/index.js');
const BotAccount = require('./BotAccount.js');

const DEVICE = 'iOS';

const deviceMapping = {
  Android: {
    flow: 'sisu',
    authTitle: Titles.MinecraftAndroid,
    deviceType: 'Android',
    deviceVersion: '0.0.0',
    titleId: '1739947436',
    userAgent: 'MCPE/Android',
  },
  iOS: {
    flow: 'sisu',
    authTitle: Titles.MinecraftIOS,
    deviceType: 'iOS',
    deviceVersion: '0.0.0',
    titleId: '1810924247',
    userAgent: 'MCPE/iOS',
  },
};

async function waitForDatabase(timeoutMs = 60_000) {
  const start = Date.now();
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('MongoDB is not connected cannot load the realm Xbox account.');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function getBotAccount() {
  let acc = await BotAccount.findOne({ key: 'bot' });
  if (!acc) {
    acc = new BotAccount({ key: 'bot' });
    await acc.save();
  }
  return acc;
}

function getCacheFactory(acc) {
  if (!acc.linkData) acc.linkData = {};

  class CacheFactory {
    async getCached() {
      return acc.linkData;
    }
    async setCached(value) {
      acc.linkData = value || {};
      try {
        await acc.save();
      } catch {
        const fresh = await BotAccount.findOne({ key: 'bot' });
        fresh.linkData = value || {};
        await fresh.save();
      }
    }
    async setCachedPartial(value) {
      acc.linkData = { ...acc.linkData, ...value };
      try {
        await acc.save();
      } catch {
        const fresh = await BotAccount.findOne({ key: 'bot' });
        fresh.linkData = { ...fresh.linkData, ...value };
        await fresh.save();
      }
    }
  }
  return function () { return new CacheFactory(); };
}

function authOptions(acc) {
  const flow = deviceMapping[acc.linkDevice] || deviceMapping[DEVICE];
  return {
    flow: flow.flow,
    authTitle: flow.authTitle,
    deviceType: flow.deviceType,
    deviceVersion: flow.deviceVersion,
    titleId: flow.titleId,
  };
}

async function markSessionDead() {
  try {
    const acc = await getBotAccount();
    acc.didLink = false;
    acc.linkData = {};
    await acc.save();
  } catch (e) {
    console.error('[REALM] failed to reset the saved session:', e?.message || e);
  }

  linkingPromise = null;
}

async function fetchGamertag(userHash, xstsToken, xuid) {
  try {
    const response = await fetch('https://peoplehub.xboxlive.com/users/me/people/me/decoration/detail', {
      method: 'GET',
      headers: {
        'x-xbl-contract-version': 4,
        'Accept': 'application/json',
        'Authorization': `XBL3.0 x=${userHash};${xstsToken}`,
        'Accept-Language': 'en-US',
        'Host': 'peoplehub.xboxlive.com',
        'Connection': 'Keep-Alive',
      },
    });
    if (response.status !== 200) return '';
    const data = await response.json();
    return data?.people?.[0]?.gamertag || '';
  } catch {
    return '';
  }
}

let linkingPromise = null;

async function ensureBotAccount() {
  if (linkingPromise) return linkingPromise;

  linkingPromise = (async () => {
    await waitForDatabase();
    const acc = await getBotAccount();

    if (acc.didLink && acc.linkData && Object.keys(acc.linkData).length > 0) {
      console.log(`[REALM] Using saved Xbox account${acc.gamertag ? ` "${acc.gamertag}"` : ''} — restored from Mongo, no relink needed.`);
      return acc;
    }

    console.log('[REALM] No Xbox account is linked yet. Starting the linking process…');

    let printed = false;
    const flow = new Authflow(undefined, getCacheFactory(acc), authOptions(acc), (code) => {
      console.log('[REALM] ═══════════════ XBOX ACCOUNT LINKING ═══════════════');
      if (printed) console.log('[REALM] The previous code expired — use this new one:');
      console.log(`[REALM] 1. Open: ${code.verification_uri || 'https://www.microsoft.com/link'}`);
      console.log(`[REALM] 2. Enter code: ${code.user_code}`);
      console.log('[REALM] 3. Sign in with the Microsoft/Xbox account the bot should use.');
      console.log('[REALM] This ONE account will be used for ALL /realm lookups by');
      console.log('[REALM] EVERYONE in EVERY server, and it is saved to Mongo forever.');
      console.log('[REALM] ══════════════════════════════════════════════════════');
      printed = true;
    });

    const data = await flow.getXboxToken();
    if (!data || typeof data.userXUID !== 'string' && typeof data.userXUID !== 'number'
      || typeof data.userHash !== 'string' || typeof data.XSTSToken !== 'string') {
      linkingPromise = null;
      throw new Error('Microsoft returned incomplete account data — restart the bot to try linking again.');
    }

    acc.didLink = true;
    acc.linkDevice = DEVICE;
    acc.xuid = String(data.userXUID);
    acc.gamertag = await fetchGamertag(data.userHash, data.XSTSToken, acc.xuid);
    await acc.save();

    console.log(`[REALM] ✅ Linked Xbox account${acc.gamertag ? ` "${acc.gamertag}"` : ''} (xuid ${acc.xuid}). Saved to Mongo — this account is now used for everything, no relink needed.`);
    return acc;
  })();

  linkingPromise.catch(() => { linkingPromise = null; });
  return linkingPromise;
}

module.exports = {
  DEVICE,
  deviceMapping,
  getBotAccount,
  getCacheFactory,
  ensureBotAccount,
  markSessionDead,
};
