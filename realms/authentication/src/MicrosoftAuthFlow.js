const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const Titles = require('./common/Titles')
const { createHash } = require('./common/Util')
const { Endpoints } = require('./common/Constants')
const FileCache = require('./common/cache/FileCache')

const LiveTokenManager = require('./TokenManagers/LiveTokenManager')
const XboxTokenManager = require('./TokenManagers/XboxTokenManager')
const BedrockTokenManager = require('./TokenManagers/MinecraftBedrockTokenManager')
const PlayfabTokenManager = require('./TokenManagers/PlayfabTokenManager')
const MinecraftServicesTokenManager = require('./TokenManagers/MinecraftBedrockServicesManager')

async function retry(methodFn, beforeRetry, times) {
  while (times--) {
    if (times !== 0) {
      try { return await methodFn() } catch (e) { if (e instanceof URIError) { throw e } else { console.debug(e) } }
      await new Promise(resolve => setTimeout(resolve, 2000))
      await beforeRetry()
    } else {
      return await methodFn()
    }
  }
}

const CACHE_IDS = ['msal', 'live', 'sisu', 'xbl', 'bed', 'mca', 'mcs', 'pfb']

class MicrosoftAuthFlow {
  constructor(username = '', cache = __dirname, options, codeCallback) {
    this.username = username

    if (options && !options.flow) throw new Error("Missing 'flow' argument in options. See docs for more information.")

    this.options = options || { flow: 'live', authTitle: Titles.MinecraftNintendoSwitch }

    this.initTokenManagers(username, cache, options?.forceRefresh)

    this.codeCallback = codeCallback
  }

  initTokenManagers(username, cache, forceRefresh) {
    if (typeof cache !== 'function') {
      let cachePath = cache

      try {
        if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath, { recursive: true })
      } catch (e) {
        console.log('Failed to open cache dir', e, ' ... will use current dir')
        cachePath = __dirname
      }

      cache = ({ cacheName, username }) => {
        if (!CACHE_IDS.includes(cacheName)) throw new Error(`Cannot instantiate cache for unknown ID: '${cacheName}'`)

        const hash = createHash(username)
        const result = new FileCache(path.join(cachePath, `./${hash}_${cacheName}-cache.json`))

        if (forceRefresh) result.reset()

        return result
      }
    }

    if (this.options.flow === 'live' || this.options.flow === 'sisu') {
      if (!this.options.authTitle) throw new Error(`Please specify an "authTitle" in Authflow constructor when using ${this.options.flow} flow`)

      this.msa = new LiveTokenManager(this.options.authTitle, ['service::user.auth.xboxlive.com::MBI_SSL'], cache({ cacheName: this.options.flow, username }))

      this.doTitleAuth = true
    } else {
      throw new Error(`Unknown flow: ${this.options.flow} (expected "live", or "sisu")`)
    }

    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.xbl = new XboxTokenManager(keyPair, cache({ cacheName: 'xbl', username }))
    this.mba = new BedrockTokenManager(cache({ cacheName: 'bed', username }))
    this.mcs = new MinecraftServicesTokenManager(cache({ cacheName: 'mcs', username }))
    this.pfb = new PlayfabTokenManager(cache({ cacheName: 'pfb', username }))
  }

  async getMsaToken() {
    if (await this.msa.verifyTokens()) {
      const { token } = await this.msa.getAccessToken()

      return token
    } else {
      const ret = await this.msa.authDeviceCode((response) => {
        if (this.codeCallback) return this.codeCallback(response)

        console.info('[msa] First time signing in. Please authenticate now:')

        console.info(response.message)
      })

      console.info('[msa] Signed in with Microsoft')

      return ret.accessToken
    }
  }

  async getPlayfabLogin() {
    const cache = this.pfb.getCachedAccessToken()

    if (cache.valid) return cache.data

    const xsts = await this.getXboxToken(Endpoints.PlayfabRelyingParty)

    const playfab = await this.pfb.getAccessToken(xsts)

    return playfab
  }

  async getMinecraftBedrockServicesToken({ version }) {
    const cache = await this.mcs.getCachedAccessToken()

    if (cache.valid) return cache.data

    const playfab = await this.getPlayfabLogin()

    if (!playfab?.SessionTicket) return playfab

    const mcs = await this.mcs.getAccessToken(playfab.SessionTicket, { version })

    return mcs
  }

  async getXboxToken(relyingParty = this.options.relyingParty || Endpoints.XboxRelyingParty, forceRefresh = false) {
    const options = { ...this.options, relyingParty }

    const { xstsToken, userToken, deviceToken, titleToken } = await this.xbl.getCachedTokens(relyingParty)

    if (xstsToken.valid && !forceRefresh) return xstsToken.data

    if (options.flow === "sisu" && !(await this.msa.verifyTokens())) {
      const dt = await this.xbl.getDeviceToken(options)

      await this.xbl.SisuAuthenticate(options, dt)
    }

    return await retry(async () => {
      const msaToken = await this.getMsaToken()

      if (options.flow === 'sisu' && (!userToken.valid || !deviceToken.valid || !titleToken.valid)) {
        const dt = await this.xbl.getDeviceToken(options)

        const sisu = await this.xbl.SisuAuthorize(msaToken, dt, options)

        return sisu
      }

      const ut = userToken.token ?? await this.xbl.getUserToken(msaToken)
      const dt = deviceToken.token ?? await this.xbl.getDeviceToken(options)
      const tt = titleToken.token ?? (this.doTitleAuth ? await this.xbl.getTitleToken(msaToken, dt) : undefined)

      const xsts = await this.xbl.getXSTSToken({ userToken: ut, deviceToken: dt, titleToken: tt }, options)

      return xsts
    }, () => { this.msa.forceRefresh = true }, 2)
  }

  async getMinecraftBedrockToken(publicKey) {
    if (!publicKey) throw new Error('Need to specifiy a ECDH x509 URL encoded public key')

    return await retry(async () => {
      const xsts = await this.getXboxToken(Endpoints.BedrockXSTSRelyingParty)

      const token = await this.mba.getAccessToken(publicKey, xsts)

      const body = JSON.parse(Buffer.from(token.chain[1].split('.')[1], 'base64').toString())

      if (!body.extraData.titleId && this.doTitleAuth) throw Error('missing titleId in response')

      return token.chain
    }, () => { this.xbl.forceRefresh = true }, 2)
  }
}

module.exports = MicrosoftAuthFlow