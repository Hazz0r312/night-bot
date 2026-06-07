const Redis = require('ioredis');

let redis;

async function connectRedis() {
  try {
    redis = new Redis(process.env.REDIS_URL);
    redis.on('ready', () => console.log('✅ Redis conectado'));
    redis.on('error', err => console.error('❌ Redis error:', err.message));
  } catch (err) {
    console.error('❌ Error Redis:', err.message);
  }
}

function getRedis() {
  return redis;
}

module.exports = { connectRedis, getRedis };
