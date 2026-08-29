const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  guildId: { type: String, index: true },
  userId:  { type: String, index: true },
  xp:    { type: Number, default: 0 },
  level: { type: Number, default: 0 },
});
module.exports = mongoose.models.Level || mongoose.model('Level', schema);
