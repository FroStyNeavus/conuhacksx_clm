/**
 * MongoDB Schemas for Commodity Caching System
 */

const mongoose = require('mongoose');

// ============================================================================
// PLACE SCHEMA - Individual place fetched from Google Places API
// ============================================================================
const placeSchema = new mongoose.Schema({
  place_id: { type: String, required: true, unique: true },
  location: {
    lat: Number,
    lng: Number
  },
  commodityTypes: [String], // Array of commodity types this place belongs to
  
  // Cache metadata
  geohash: { type: String, required: true, index: true }, // Grid cell identifier
  fetchedAt: { type: Date, default: Date.now }
});

// Index for spatial queries
placeSchema.index({ geohash: 1, commodityTypes: 1 });
placeSchema.index({ 'location.lat': 1, 'location.lng': 1 });

const Place = mongoose.model('Place', placeSchema);

// ============================================================================
// GRID SCHEMA - Metadata for each cached grid cell
// ============================================================================
const gridSchema = new mongoose.Schema({
  geohash: { type: String, required: true, unique: true, index: true },
  centerLat: Number,
  centerLng: Number,
  
  // Cache metadata
  fetchStatus: { type: String, enum: ['pending', 'cached', 'expired'], default: 'pending' },
  fetchedAt: Date,
  expiresAt: Date,
  lastUpdated: { type: Date, default: Date.now }
});

// Index for finding nearby grids
gridSchema.index({ centerLat: 1, centerLng: 1 });

const Grid = mongoose.model('Grid', gridSchema);

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = { Place, Grid };

