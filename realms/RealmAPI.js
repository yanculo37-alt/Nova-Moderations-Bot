const { Authflow } = require('./authentication/index.js');
const verData = require('./ext/data.json');
const {
  DEVICE,
  deviceMapping,
  getBotAccount,
  getCacheFactory,
  ensureBotAccount,
  markSessionDead,
} = require('./account.js');

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RealmAPI {
  constructor() {
    this.maxRetries = 6;
    this.retryCount = 0;
  }

  _realmError(status, raw) {
    let detail = '';
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.detail || parsed?.message || parsed?.description || '';
      } catch {
        detail = raw.slice(0, 140);
      }
    } else if (raw && typeof raw === 'object') {
      detail = raw?.detail || raw?.message || raw?.description || '';
    }

    switch (status) {
      case 400:
        return { status: 400, body: { errorMsg: "That realm code is incorrect, try again with a valid realm code", errorCode: 400 } };
      case 401:
        return { status: 401, body: { errorMsg: "The bot's Xbox session expired, try again in a moment", errorCode: 401 } };
      case 403:
        return { status: 403, body: { errorMsg: "The bot's Xbox account is not a member of this realm and could not join it with the code", errorCode: 403 } };
      case 404:
        return { status: 404, body: { errorMsg: "That realm code is incorrect, no realm exists with that code", errorCode: 404 } };
      case 429:
        return { status: 429, body: { errorMsg: 'Minecraft Realms is rate limiting the bot, try again in a few seconds', errorCode: 429 } };
      case 500:
        return { status: 500, body: { errorMsg: 'Minecraft Realms is having issues, try again later', errorCode: 500 } };
      case 502:
      case 504:
        return { status, body: { errorMsg: 'Minecraft Realms is down, try again later', errorCode: status } };
      case 503:
        return { status: 503, body: { errorMsg: 'Minecraft Realms is unavailable, try again later', errorCode: 503 } };
      default:
        return { status: status || 0, body: { errorMsg: `Minecraft Realms returned an unexpected response (status ${status}).${detail ? ` (${detail})` : ''}`, errorCode: status || 0 } };
    }
  }

  _xboxError(status, raw) {
    let detail = '';
    if (typeof raw === 'string') {
      try { const j = JSON.parse(raw); detail = j?.message || j?.description || ''; } catch { detail = raw.slice(0, 140); }
    }
    switch (status) {
      case 401:
        return { status: 401, body: { errorMsg: "The bot's Xbox session expired, try again in a moment", errorCode: 401 } };
      case 404:
        return { status: 404, body: { errorMsg: 'Those players could not be found on Xbox Live', errorCode: 404 } };
      case 429:
        return { status: 429, body: { errorMsg: 'Xbox Live is rate limiting the bot, try again in a few seconds', errorCode: 429 } };
      default:
        return { status: status || 0, body: { errorMsg: `Xbox Live returned an unexpected response (status ${status}).${detail ? ` (${detail})` : ''}`, errorCode: status || 0 } };
    }
  }

  async getXboxAuthToken(relyingParty) {
    let acc;
    try {
      acc = await getBotAccount();
    } catch {
      return { status: 1503, body: { errorMsg: 'The database is unavailable, try again in a moment', errorCode: 1503 } };
    }

    if (!acc.didLink || !acc.linkData || Object.keys(acc.linkData).length === 0) {

      ensureBotAccount().catch((e) => console.error('[REALM] linking failed:', e?.message || e));
      return { status: 1404, body: { errorMsg: "The bot's Xbox account isn't linked yet — check the bot console for the linking code", errorCode: 1404 } };
    }

    const userFlow = deviceMapping[acc.linkDevice] || deviceMapping[DEVICE];
    this.flow = new Authflow(undefined, getCacheFactory(acc), {
      flow: userFlow.flow,
      authTitle: userFlow.authTitle,
      deviceType: userFlow.deviceType,
      deviceVersion: userFlow.deviceVersion,
      titleId: userFlow.titleId,
    }, (data) => {

      console.error('[REALM] The saved Xbox session is no longer valid — starting a fresh console linking process…');
      markSessionDead()
        .then(() => ensureBotAccount())
        .catch((e) => console.error('[REALM] relinking failed:', e?.message || e));
      try { this.flow.msa.polling = false; } catch {}
      return data;
    });

    let xboxToken;
    try {
      xboxToken = await this.flow.getXboxToken(relyingParty, true);
    } catch (err) {
      console.error('[REALM] getXboxToken failed:', err?.message || err);
      return { status: 401, body: { errorMsg: "The bot's Xbox session could not be refreshed — check the bot console", errorCode: 401 } };
    }

    if (!xboxToken || typeof xboxToken.XSTSToken !== 'string') {
      return { status: 401, body: { errorMsg: "The bot's Xbox session expired, try again in a moment", errorCode: 401 } };
    }

    this.xuid = xboxToken.userXUID;
    return `XBL3.0 x=${xboxToken.userHash};${xboxToken.XSTSToken}`;
  }

  _authFailed(token) {
    return token && typeof token === 'object' && !!token.status;
  }

  async init() {
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      if (this.alreadyInit) return;

      this.authToken = await this.getXboxAuthToken('https://pocket.realms.minecraft.net/');
      if (this._authFailed(this.authToken)) {
        this.authError = this.authToken;
        this.alreadyInit = true;
        return;
      }

      const userFlow = deviceMapping[DEVICE];
      this.headers = {
        'Accept': '*/*',
        'charset': 'utf-8',
        'client-ref': verData.hash,
        'client-version': verData.version,
        'x-clientplatform': userFlow.deviceType,
        'x-networkprotocolversion': verData.protocol,
        'authorization': this.authToken,
        'content-type': 'application/json',
        'user-agent': userFlow.userAgent,
        'Accept-Language': 'en-US',
        'Accept-Encoding': 'gzip, deflate, br',
        'Host': 'bedrock.frontendlegacy.realms.minecraft-services.net',
        'Connection': 'Keep-Alive',
      };

      this.alreadyInit = true;
    })();

    return this.initializing;
  }

  async getRealmInfo(realmCode, quick = false) {
    await this.init();
    if (this.authError) return this.authError;

    this.retryCount = 0;

    while (true) {
      try {
        if (this.retryCount > this.maxRetries) {
          return { status: 1429, body: { errorMsg: "Minecraft Realms didn't respond, try again later", errorCode: 1429 } };
        }

        const response = await fetch(`https://bedrock.frontendlegacy.realms.minecraft-services.net/worlds/v1/link/${encodeURIComponent(realmCode)}`, {
          method: 'GET',
          headers: this.headers,
          signal: AbortSignal.timeout(15000),
        });

        switch (response.status) {
          case 200: {
            let realm = await response.text();
            try {
              realm = JSON.parse(realm);
            } catch {
              return { status: response.status, body: realm };
            }

            if (!realm.member) await this.joinRealm(realmCode);

            if (!quick) realm = await this.getRealmInfoByID(realm.id);

            return realm;
          }
          case 403:
            return this._realmError(403, await response.text());
          case 404:
            return this._realmError(404, await response.text());
          case 429:
            return this._realmError(429);
          case 502: {
            await delay(2000);
            this.retryCount++;
            break;
          }
          default: {
            const body = await response.text();
            console.log(`[REALM] getRealmInfo: ${response.status} ${response.statusText}`);
            return this._realmError(response.status, body);
          }
        }
      } catch (error) {
        console.log('[REALM] getRealmInfo error:', error?.message || error);
        await delay(2000);
        this.retryCount++;
      }
    }
  }

  async getRealmInfoByID(realmID) {
    await this.init();
    if (this.authError) return this.authError;

    this.retryCount = 0;

    while (true) {
      try {
        if (this.retryCount > this.maxRetries) {
          return { status: 1429, body: { errorMsg: "Minecraft Realms didn't respond, try again later", errorCode: 1429 } };
        }

        const response = await fetch(`https://bedrock.frontendlegacy.realms.minecraft-services.net/worlds/${realmID}`, {
          method: 'GET',
          headers: this.headers,
          signal: AbortSignal.timeout(15000),
        });

        switch (response.status) {
          case 200: {
            let realm = await response.text();
            try {
              realm = JSON.parse(realm);
            } catch {
              return { status: response.status, body: realm };
            }
            return realm;
          }
          case 403:
            return this._realmError(403, await response.text());
          case 404:
            return this._realmError(404, await response.text());
          case 429:
            return this._realmError(429);
          case 502: {
            await delay(2000);
            this.retryCount++;
            break;
          }
          default: {
            const body = await response.text();
            console.log(`[REALM] getRealmInfoByID: ${response.status} ${response.statusText}`);
            return this._realmError(response.status, body);
          }
        }
      } catch (error) {
        console.log('[REALM] getRealmInfoByID error:', error?.message || error);
        await delay(2000);
        this.retryCount++;
      }
    }
  }

  async getActivePlayers(realmID) {
    await this.init();
    if (this.authError) return this.authError;

    this.retryCount = 0;

    while (true) {
      try {
        if (this.retryCount > this.maxRetries) {
          return { status: 1429, body: { errorMsg: "Minecraft Realms didn't respond, try again later", errorCode: 1429 } };
        }

        const response = await fetch('https://bedrock.frontendlegacy.realms.minecraft-services.net/activities/live/players', {
          method: 'GET',
          headers: this.headers,
          signal: AbortSignal.timeout(15000),
        });

        switch (response.status) {
          case 200: {
            let data = await response.text();
            try {
              data = JSON.parse(data);
            } catch {
              return { status: response.status, body: data };
            }

            let server = null;
            for (const realm of data.servers || []) {
              if (realm.id === Number(realmID)) server = realm;
            }
            return server || { servers: [], players: [] };
          }
          case 401:
            return this._realmError(401);
          case 403:
            return this._realmError(403);
          case 404:
            return this._realmError(404);
          case 429:
            return this._realmError(429);
          case 500:
            return this._realmError(500);
          case 502: {
            await delay(2000);
            this.retryCount++;
            break;
          }
          case 503:
            return this._realmError(503);
          default: {
            const body = await response.text();
            console.log(`[REALM] getActivePlayers: ${response.status} ${response.statusText}`);
            return this._realmError(response.status, body);
          }
        }
      } catch (error) {
        console.log('[REALM] getActivePlayers error:', error?.message || error);
        await delay(2000);
        this.retryCount++;
      }
    }
  }

  async joinRealm(code) {
    await this.init();
    if (this.authError) return this.authError;

    this.retryCount = 0;

    while (true) {
      try {
        if (this.retryCount > this.maxRetries) {
          return { status: 1429, body: { errorMsg: "Minecraft Realms didn't respond, try again later", errorCode: 1429 } };
        }

        const response = await fetch(`https://bedrock.frontendlegacy.realms.minecraft-services.net/invites/v1/link/accept/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: this.headers,
          signal: AbortSignal.timeout(15000),
        });

        switch (response.status) {
          case 200: {
            let data = await response.text();
            try {
              data = JSON.parse(data);
            } catch {  }
            return data;
          }
          case 403:
            return { status: 403, body: { errorMsg: "The bot's Xbox account could not join this realm with the code", errorCode: 403 } };
          case 404:
            return { status: 404, body: { errorMsg: 'That realm code is incorrect, no realm exists with that code', errorCode: 404 } };
          case 429:
            return { status: 429, body: { errorMsg: 'Minecraft Realms is rate limiting the bot, try again in a few seconds', errorCode: 429 } };
          default: {
            console.log(`[REALM] joinRealm: ${response.status} ${response.statusText}`);
            return { status: response.status, body: { errorMsg: `Couldn't join the realm (status ${response.status})`, errorCode: response.status } };
          }
        }
      } catch (error) {
        console.log('[REALM] joinRealm error:', error?.message || error);
        await delay(2000);
        this.retryCount++;
      }
    }
  }

  async getXboxUser(xuid) {
    const authToken = await this.getXboxAuthToken();
    if (this._authFailed(authToken)) return authToken;
    if (!xuid) xuid = this.xuid;

    const response = await fetch(`https://peoplehub.xboxlive.com/users/me/people/xuids(${xuid})/decoration/detail,preferredColor,presenceDetail`, {
      method: 'GET',
      headers: {
        'x-xbl-contract-version': 4,
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'application/json',
        'User-Agent': 'WindowsGameBar/5.823.1271.0',
        'Accept-Language': 'en-US',
        'Authorization': authToken,
        'Host': 'peoplehub.xboxlive.com',
        'Connection': 'Keep-Alive',
      },
    });

    switch (response.status) {
      case 200:
        return (await response.json()).people?.[0] ?? null;
      case 400:
      case 401:
      case 404:
        return null;
      default:
        return this._xboxError(response.status, await response.text());
    }
  }

  async getXboxUserBulk(xuids = []) {
    if (xuids.length === 0) return [];

    const authToken = await this.getXboxAuthToken();
    if (this._authFailed(authToken)) return authToken;

    const response = await fetch('https://peoplehub.xboxlive.com/users/me/people/batch/decoration/detail,presenceDetail', {
      method: 'POST',
      headers: {
        'x-xbl-contract-version': 4,
        'Accept-Encoding': 'gzip, deflate',
        'Accept': 'application/json',
        'User-Agent': 'WindowsGameBar/5.823.1271.0',
        'Accept-Language': 'en-US',
        'Authorization': authToken,
        'Host': 'peoplehub.xboxlive.com',
        'Connection': 'Keep-Alive',
      },
      body: JSON.stringify({ xuids }),
    });

    switch (response.status) {
      case 200:
        return (await response.json()).people;
      default:
        return this._xboxError(response.status, await response.text());
    }
  }
}

module.exports = RealmAPI;
