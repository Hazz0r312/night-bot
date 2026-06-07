const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log('✅ MongoDB conectado');
  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
    console.error('   Asegúrate de que MONGODB_URI está bien en .env');
    process.exit(1);
  }
}

module.exports = { connectDB };
