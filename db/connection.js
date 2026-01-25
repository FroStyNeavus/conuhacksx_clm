/**
 * Basic MongoDB Connection
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:27017/appdb';

async function connect() {
  try {
    console.log('Connecting to MongoDB at:', MONGODB_URI);
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
