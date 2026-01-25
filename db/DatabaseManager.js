/**
 * Database Manager:
 * high-level interface for data operations (fetching, caching, querying)
 * 
 * 
 */
// Imports of dependencies
const geohash = require('ngeohash');
const { Place, Grid } = require('./models');
const config = require('../config/config');

/**
 * Cache Manager
 * Handles all caching operations (storage, retrieval, expiration)
 */
class CacheManager {
    constructor(cacheTTL) {
        this.cacheTTL = cacheTTL;
    }
    /**
     * Check if grid cells around center are cached (center + 8 neighbors)
     * @param {string} centerGridId - Center geohash grid ID
     * @returns {Promise<Array>} Array of cached grid IDs
     */
    async isCachedInRadius(centerGridId) {
        try {
            // Get all 8 neighboring grids
            const neighbors = geohash.neighbors(centerGridId);
            const allGridIds = [centerGridId, ...Object.values(neighbors)];

            // Query only those specific grids using index-friendly $in operator
            const cachedGrids = await Grid.find({
                geohash: { $in: allGridIds },
                fetchStatus: 'cached',
                expiresAt: { $gt: new Date() }
            });

            return cachedGrids.map(g => g.geohash);
        } catch (error) {
            return [];
        }
    }

    /**
     * Get cached places for a grid cell
     * @param {string} gridId - Geohash grid ID
     * @param {string} commodityType - Optional: filter by commodity type
     * @returns {Promise<Array>} Array of cached places
     */
    async getPlaces(gridId, commodityType = null) {
        try {
            const query = { geohash: gridId };
            if (commodityType) query.commodityTypes = commodityType;

            return await Place.find(query);
        } catch (error) {
            return [];
        }
    }

    /**
     * Get places from database (cache hit)
     * @param {string} gridId - Geohash grid ID
     * @returns {Promise<Array>} Cached places
     */
    async getFromDB(gridId) {
        return this.getPlaces(gridId);
    }

    /**
     * Get places from API (cache miss)
     * @param {Function} googleFetchFn - Async function to fetch from Google API
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} radiusMeters - Search radius
     * @param {string} commodityType - Commodity type
     * @returns {Promise<Array>} Places from API
     */
    async getFromAPI(googleFetchFn, lat, lng, radiusMeters, commodityType) {
        return await googleFetchFn(lat, lng, radiusMeters, commodityType);
    }

    /**
     * Store fetched places in cache
     * @param {string} gridId - Geohash grid ID
     * @param {Array} places - Places from Google Places API
     * @param {string} commodityType - Commodity type
     * @param {number} centerLat - Grid center latitude
     * @param {number} centerLng - Grid center longitude
     * @returns {Promise<void>}
     */
    async storePlaces(gridId, places, commodityType, centerLat, centerLng) {
        try {
            const placesWithGeohash = places.map(place => ({
                place_id: place.place_id,
                location: place.location,
                commodityTypes: [commodityType],
                geohash: gridId,
                fetchedAt: new Date()
            }));

            await Place.insertMany(placesWithGeohash, { ordered: false }).catch(err => {
                if (err.code !== 11000) throw err;
            });

            const expiresAt = new Date(Date.now() + this.cacheTTL);
            await Grid.updateOne(
                { geohash: gridId },
                {
                    $set: {
                        centerLat,
                        centerLng,
                        fetchStatus: 'cached',
                        fetchedAt: new Date(),
                        expiresAt,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (error) {
            throw error;
        }
    }
}

/**
 * Geohash Manager
 * Handles geohash encoding, decoding, and spatial queries
 */
class GeohashManager {
    constructor(gridPrecision) {
        this.gridPrecision = gridPrecision;
    }

    /**
     * Get geohash from coordinates
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {string} Geohash grid ID
     */
    getHash(lat, lng) {
        return geohash.encode(lat, lng, this.gridPrecision);
    }

    /**
     * Get coordinates of the center of the grid from geohash
     * @param {string} hash - Geohash string
     * @returns {Object} {lat, lng} center coordinates
     */
    getCoordinates(hash) {
        const decoded = geohash.decode(hash);
        return {
            lat: decoded.latitude,
            lng: decoded.longitude
        };
    }

    /**
     * Get region geohash at lower precision
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {string} Lower precision geohash
     */
    getRegionHash(lat, lng) {
        const lowerPrecision = Math.max(5, this.gridPrecision - 2);
        return geohash.encode(lat, lng, lowerPrecision);
    }

    /**
     * Get all grid IDs within a radius from center coordinates
     * @param {number} lat - Center latitude
     * @param {number} lng - Center longitude
     * @param {number} radiusMeters - Search radius in meters
     * @returns {Array<string>} Array of grid IDs within radius
     */
    getGridsInRadius(lat, lng, radiusMeters) {
        const grids = [];
        const centerGridId = this.getHash(lat, lng);

        // Add center grid
        grids.push(centerGridId);

        // Add all neighbors (8 surrounding grids)
        const neighbors = geohash.neighbors(centerGridId);
        grids.push(...Object.values(neighbors));

        // For larger radius, add neighbors of neighbors
        if (radiusMeters > 10000) {
            for (const neighborId of Object.values(neighbors)) {
                const secondaryNeighbors = geohash.neighbors(neighborId);
                grids.push(...Object.values(secondaryNeighbors));
            }
        }
        // Remove duplicates
        return [...new Set(grids)];
    }
}
class DataManager {
    constructor() {
        this.gridPrecision = config.gridPrecision;
        this.cacheTTL = config.cacheTTL;
        this.cacheManager = new CacheManager(this.cacheTTL);
        this.geohashManager = new GeohashManager(this.gridPrecision);
    }

    /**
     * Main fetch function: Get places from all grids in radius
     * For each grid: if cached use cache, if not cached fetch from API and cache it
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} radiusMeters - Search radius
     * @param {string} commodityType - Type of place to fetch
     * @param {Function} googleFetchFn - Async function to fetch from Google API
     * @returns {Promise<Object>} { places, cachedGrids, newGrids, gridId }
     */
    async fetchData(lat, lng, radiusMeters, commodityType, googleFetchFn) {
        try {
            // Get all grids within the radius
            const gridsInRadius = this.geohashManager.getGridsInRadius(lat, lng, radiusMeters);
            const centerGridId = this.geohashManager.getHash(lat, lng);

            const allPlaces = [];
            const cachedGridIds = [];
            const newGridIds = [];

            // Process each grid in the radius
            for (const gridId of gridsInRadius) {
                // Check if grid is cached
                if (await this.cacheManager.isCached(gridId)) {
                    cachedGridIds.push(gridId);
                    const places = await this.cacheManager.getFromDB(gridId);
                    allPlaces.push(...places);
                } else {
                    // Grid not cached - fetch from API and cache it
                    const places = await this.cacheManager.getFromAPI(googleFetchFn, lat, lng, radiusMeters, commodityType);

                    if (places && places.length > 0) {
                        await this.cacheManager.storePlaces(gridId, places, commodityType, lat, lng);
                        newGridIds.push(gridId);
                        allPlaces.push(...places);
                    }
                }
            }

            return {
                places: allPlaces,
                gridId: centerGridId,
                gridsInRadius: gridsInRadius.length,
                cachedGrids: cachedGridIds,
                newGrids: newGridIds,
                count: allPlaces.length
            };
        } catch (error) {
            return {
                places: [],
                gridId: null,
                error: error.message
            };
        }
    }

    /**
     * Get summary statistics for cached data
     * @returns {Promise<Object>} Cache statistics
     */
    async getCacheStats() {
        return await this.cacheManager.getCacheStats();
    }

    /**
     * Clear expired cache entries
     * @returns {Promise<Object>} Deletion results
     */
    async clearExpiredCache() {
        return await this.cacheManager.clearExpiredCache();
    }
}

module.exports = DataManager;
