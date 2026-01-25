/**
 * Application Configuration
 * Core settings for grid-based caching system
 */

module.exports = {
  // Grid cell size in meters (approximately)
  // Precision 6 geohash = ~1.2km, precision 7 = ~150m, precision 8 = ~37m
  gridPrecision: 7,

  // Cache TTL (Time To Live)
  cacheTTL: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
};
