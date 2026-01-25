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
     * Check which grid cells around center are cached (center + 8 neighbors)
     * @param {string} centerGridId - Center geohash grid ID
     * @returns {Promise<Array<string>>} Array of geohash strings for cached grids (empty array if none cached)
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


            // Case: when no cached grids found, return empty array
            if (!Array.isArray(cachedGrids)) {
                return [];
            } else {
                // Return just the geohash strings, not full documents
                return cachedGrids.map(g => g.geohash);
            }
        } catch (error) {
            console.error(`Error checking cached grids: ${error.message}`);
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
     * Fetch places from Google Places API
     * @param {number} lat - Center latitude
     * @param {number} lng - Center longitude
     * @param {number} radiusMeters - Search radius in meters
     * @param {string} commodityType - Commodity type to search
     * @returns {Promise<Array>} Places from Google Places API
     */
    async fetchFromGooglePlaces(lat, lng, radiusMeters, commodityType) {
        try {
            const GOOGLE_API_KEY = 'AIzaSyAjFKhI4aA7ITiIOo2_Q_yqvU_obcNuR14';


            const url = `https://places.googleapis.com/v1/places:searchNearby`;

            const requestBody = {
                locationRestriction: {
                    circle: {
                        center: {
                            latitude: lat,
                            longitude: lng
                        },
                        radius: radiusMeters
                    }
                },
                includedTypes: [commodityType],
                maxResultCount: 20,
                languageCode: 'en'
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': GOOGLE_API_KEY,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.id,places.types'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                console.error(`Google Places API error: ${response.status} ${response.statusText}`);
                const errorBody = await response.text();
                console.error(`Error response: ${errorBody}`);
                return [];
            }

            const data = await response.json();
            const places = data.places || [];

            // Convert Google Places format to database format
            return places.map(place => ({
                _id: place.id,
                place_id: place.id,
                displayName: place.displayName?.text || place.name || 'Unknown',
                location: {
                    type: 'Point',
                    coordinates: [place.location.longitude, place.location.latitude]
                },
                commodityTypes: [commodityType],
                formattedAddress: place.formattedAddress || '',
                fetchedAt: new Date()
            }));
        } catch (error) {
            console.error(`Error fetching from Google Places API: ${error.message}`);
            return [];
        }
    }

    /**
     * Get all places within a radius (from all grids)
     * @param {number} lat - Center latitude
     * @param {number} lng - Center longitude
     * @param {number} radiusMeters - Search radius
     * @param {string} commodityType - Optional: filter by commodity type
     * @returns {Promise<Array>} All places within radius
     */
    async getPlacesInRadius(lat, lng, radiusMeters, commodityType = null) {
        try {
            const gridsInRadius = this.geohashManager.getGridsInRadius(lat, lng, radiusMeters);
            const query = { geohash: { $in: gridsInRadius } };
            if (commodityType) query.commodityTypes = commodityType;

            return await Place.find(query);
        } catch (error) {
            return [];
        }
    }

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
     * Uses 2-level strategy: check cached grids first, fetch from API for uncached grids
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} radiusMeters - Search radius
     * @param {string} commodityType - Type of place to fetch
     * @returns {Promise<Object>} { places, cachedGrids, newGrids, gridId }
     */
    async fetchData(lat, lng, radiusMeters, commodityType) {
        try {
            const centerGridId = this.geohashManager.getHash(lat, lng);
            const gridsInRadius = this.geohashManager.getGridsInRadius(lat, lng, radiusMeters);

            // Get all cached grids in this radius
            const cachedGridIds = await this.cacheManager.isCachedInRadius(centerGridId);
            const allPlaces = [];

            // Get all places from cached grids
            if (cachedGridIds.length > 0) {
                console.log(`✓ Cache hit: Found ${cachedGridIds.length} cached grids for ${commodityType}`);
                const cachedPlaces = await Place.find({
                    geohash: { $in: cachedGridIds },
                    commodityTypes: commodityType
                });
                allPlaces.push(...cachedPlaces);
            }

            // Identify uncached grids
            const uncachedGridIds = gridsInRadius.filter(g => !cachedGridIds.includes(g));
            const newGridIds = [];

            // Fetch from API for any uncached grids
            if (uncachedGridIds.length > 0) {
                console.log(`⚡ API call: Fetching ${uncachedGridIds.length} uncached grids for ${commodityType} from Google Places API`);
                const apiPlaces = await this.cacheManager.fetchFromGooglePlaces(lat, lng, radiusMeters, commodityType);

                if (apiPlaces && apiPlaces.length > 0) {
                    // Cache the new places for each uncached grid
                    for (const gridId of uncachedGridIds) {
                        await this.cacheManager.storePlaces(gridId, apiPlaces, commodityType, lat, lng);
                        newGridIds.push(gridId);
                    }
                    allPlaces.push(...apiPlaces);
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
module.exports.default = DataManager;
