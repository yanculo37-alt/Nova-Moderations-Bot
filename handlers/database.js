const mongoose = require('mongoose');

async function connectDB() {
  if (!process.env.MONGO_URI) {
    console.warn('[DB] MONGO_URI not set — running without persistence.');
    return;
  }
  mongoose.set('strictQuery', true);

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });
  console.log('[DB] MongoDB connected.');

  mongoose.connection.on('disconnected', () => console.warn('[DB] disconnected'));
  mongoose.connection.on('reconnected',  () => console.log('[DB] reconnected'));
  mongoose.connection.on('error', err => console.error('[DB] error', err.message));
}

module.exports = { connectDB };
