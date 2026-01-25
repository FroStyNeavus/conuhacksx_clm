/**
 * Basic MongoDB Connection
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/commodity_map';

async function connect() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function disconnect() {
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

module.exports = { connect, disconnect };
