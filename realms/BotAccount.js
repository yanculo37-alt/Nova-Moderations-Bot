const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  key:        { type: String, unique: true, default: 'bot' },
  didLink:    { type: Boolean, default: false },
  gamertag:   { type: String, default: '' },
  xuid:       { type: String, default: '' },
  linkDevice: { type: String, default: '' },
  linkData:   { type: mongoose.Schema.Types.Mixed, default: {} },
}, { minimize: false });

const BotAccount = mongoose.models.BotAccount || mongoose.model('BotAccount', schema);

const __saveQueues = new Map();
const __originalSave = BotAccount.prototype.save;
BotAccount.prototype.save = function patchedSave(...args) {
  const key = String(this._id || this.key || Math.random());
  const prev = __saveQueues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => __originalSave.apply(this, args));
  __saveQueues.set(key, next.finally(() => {
    if (__saveQueues.get(key) === next) __saveQueues.delete(key);
  }));
  return next;
};

module.exports = BotAccount;
