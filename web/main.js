// CONSTANTS AND CONFIGURATIONS =====
const ERROR_MESSAGE = {
  GOOGLE_API_TIME_OUT:
    "Map API failed to load. Check your API key and console.",
  GEOLOCATION_UNSUPPORTED: "Your browser does not support geolocation.",
};

const LOG_MESSAGE = {
  GEOLOCATION_SUCCESS: "Geolocation successful.",
  GOOGLE_API_LOADED: "Google Maps API loaded successfully.",
  GOOGLE_COMMODITIES_LOADED: "Commodity data loaded successfully.",
  DECK_GL_LOADED: "Deck.GL overlay initialized successfully.",
  DECK_GL_LAYERS_UPDATED: "Deck.GL layers added successfully.",
};

const MAP_CONFIG = {
  zoom: 15,
  center: { lat: 45.508, lng: -73.561 },
  mapId: "DEMO_MAP_ID",
};

class Commodity {
  /**
   * @param {Object} placeData - Raw place data from Google Places API
   * @param {string} placeType - Type of place (restaurant, gas_station, etc.)
   */
  constructor(placeData, placeType) {
    this.primaryType = placeData.primaryType || placeType || "unknown";
    this.displayName = placeData.displayName || "Unknown Place";
    this.location = {
      lat: placeData.location ? placeData.location.lat() : 0,
      lng: placeData.location ? placeData.location.lng() : 0,
    };
    this.formattedAddress =
      placeData.formattedAddress || "No address available";
    this.placeType = placeType;
    this.id = placeData.id || null;
  }

  /**
   * Convert to GeoJSON Feature format
   * @returns {Object} GeoJSON Feature
   */
  toGeoJSON() {
    return {
      type: "Feature",
      properties: {
        name: this.displayName,
        address: this.formattedAddress,
        primaryType: this.primaryType,
        placeType: this.placeType,
        value: this.commodityScore,
      },
      geometry: {
        type: "Point",
        coordinates: [this.location.lng, this.location.lat],
      },
    };
  }

  /**
   * Get a simple object representation
   * @returns {Object} Plain object with all fields
   */
  toObject() {
    return {
      id: this.id,
      primaryType: this.primaryType,
      displayName: this.displayName,
      location: this.location,
      formattedAddress: this.formattedAddress,
      placeType: this.placeType,
      commodityScore: this.commodityScore,
    };
  }

  /**
   * Static method to create Commodity from Place API response
   * @param {Object} place - Google Place object
   * @param {string} type - Place type
   * @returns {Commodity}
   */
  static fromPlace(place, type) {
    return new Commodity(place, type);
  }
}

/**
 * Commodities Data Manager
 * TODO: Adjust for flexible commodity values
 */
class CommoditiesManager {
  // Get color based on commodity value
  static getColor(value) {
    const colors = {
      high: [255, 0, 0, 200],
      medium: [255, 165, 0, 200],
      low: [0, 255, 0, 200],
      default: [100, 100, 255, 200],
    };

    if (value > 75) return colors.high;
    if (value > 50) return colors.medium;
    if (value > 25) return colors.low;
    return colors.default;
  }

  /**
   * Converts Google Places data to GeoJSON FeatureCollection
   * @param {Array} places - Array of places from Google Places API
   * @returns {Object|null} GeoJSON FeatureCollection or null if no data
   */
  static formatData(places) {
    if (!places || places.length === 0) return null;

    const features = places.map((place) => ({
      type: "Feature",
      properties: {
        name: place.displayName,
        address: place.formattedAddress,
        value: Math.floor(Math.random() * 100), // Mock commodity value (0-100)
      },
      geometry: {
        type: "Point",
        coordinates: [place.location.lng(), place.location.lat()],
      },
    }));

    return {
      type: "FeatureCollection",
      features: features,
    };
  }
}

/**
 * Map Manager
 *
 */
class MapManagerSingleton {
  constructor() {
    this.map = null;
    this.commoditiesData = [];
    this.deckGLInstance = null;
    this.idleTimeout = null; // For debouncing map idle event
  }

  /**
   * Build and initialize the map instance
   */
  async build() {
    try {
      // Load Google Maps API
      const { Map } = await google.maps.importLibrary("maps");
      // Create and store map instance
      this.map = new Map(document.getElementById("map"), MAP_CONFIG);
      console.log("Google Maps instance created");

      try {
        await this.initializeOverlay();
        console.log("Overlay initialized, fetching initial data...");

        // Fetch initial data after overlay is ready
        // const { grid, data } = await this.getCommodities();
        // this.commoditiesData = data;
        // console.log(
        //   "Initial commodities data fetched:",
        //   this.commoditiesData?.length || 0,
        //   "places",
        // );

        // this.updateVisualization(this.commoditiesData);
        // console.log("Initial visualization updated");
      } catch (overlayError) {
        console.error("Error initializing overlay:", overlayError);
      }
      // !IMPORTANT: State change listener for any data updates, fetching, etc.
      // Debounced idle event - waits 2 seconds after map stops moving
      // google.maps.event.addListener(this.map, "idle", () => {
      //   // Clear any existing timeout
      //   if (this.idleTimeout) {
      //     clearTimeout(this.idleTimeout);
      //   }

      //   // Set a new timeout for 2 seconds
      //   this.idleTimeout = setTimeout(() => {
      //     console.log("Map idle for 2 seconds, triggering scan...");
      //     this.scanCurrentView();
      //   }, 2000); // 2 second delay
      // });

      console.log(LOG_MESSAGE.GOOGLE_API_LOADED); //TODO: Remove log
    } catch (error) {
      console.error(ERROR_MESSAGE.GOOGLE_API_TIME_OUT);
    }
  }

  /**
   * Setter: Set center on the map (Current user location)
   * @param {{lat: number, lng: number}} location
   */
  setUserLocation(location) {
    const userLocation = {
      lat: location.lat,
      lng: location.lng,
    };
    this.map?.setCenter(userLocation);
    this.map?.setZoom(13);
    console.log(LOG_MESSAGE.GEOLOCATION_SUCCESS);
  }

  /** Getter:
   * Get current center position of the map
   * @return {google.maps.LatLng|null} Current map center or null if map not initialized
   */
  getCurrentPosition() {
    return this.map ? this.map.getCenter() : null;
  }

  /**
   * Based on the current map center and bounds, fetch nearby commodities
   * Utilize Golgle Places API
   * @returns {Promise<Array>} List of nearby commodities
   */

  toGrid(gridSize) {
    const bounds = this.map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const latDiff = ne.lat() - sw.lat();
    const lngDiff = ne.lng() - sw.lng();

    const latStep = latDiff / gridSize;
    const lngStep = lngDiff / gridSize;

    const cells = [];

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        cells.push({
          ne: {
            lat: ne.lat() - row * latStep,
            lng: sw.lng() + (col + 1) * lngStep,
          },
          sw: {
            lat: ne.lat() - (row + 1) * latStep,
            lng: sw.lng() + col * lngStep,
          },
        });
      }
    }

    return cells;
  }

  async getCommodities(grid) {
    try {
      if (!this.map) {
        console.error("Map not initialized");
        return [];
      }
      // Import required libraries
      const { spherical } = await google.maps.importLibrary("geometry");
      const { Place } = await google.maps.importLibrary("places");

      // Divide map into smaller grid cells for more thorough search
      const gridCells = grid || this.toGrid(4); // 2x2 = 4 cells
      const types = [
        "restaurant",
        "gas_station",
        "supermarket",
        "pharmacy",
        "school",
      ];
      const allPlaces = [];
      const seenPlaceIds = new Set(); // Avoid duplicates

      // IMPORTANT: Customize the data fields here as per your requirements
      for (const cell of gridCells) {
        const cellCenter = {
          lat: (cell.ne.lat + cell.sw.lat) / 2,
          lng: (cell.ne.lng + cell.sw.lng) / 2,
        };

        const cellNE = new google.maps.LatLng(cell.ne.lat, cell.ne.lng);
        const cellSW = new google.maps.LatLng(cell.sw.lat, cell.sw.lng);
        const cellDiameter = spherical.computeDistanceBetween(cellNE, cellSW);
        const cellRadius = Math.min(cellDiameter / 2, 50000);

        for (const type of types) {
          const request = {
            fields: [
              "primaryType",
              "displayName",
              "location",
              "formattedAddress",
            ],
            locationRestriction: { center: cellCenter, radius: cellRadius },
            includedPrimaryTypes: [type], // Only search for the current type
            maxResultCount: 20,
          };
          try {
            const { places } = await Place.searchNearby(request);

            // Filter out duplicates and add to results
            places.forEach((place) => {
              if (!seenPlaceIds.has(place.id)) {
                // place.placeType = type;
                let commodity = Commodity.fromPlace(place, type);
                allPlaces.push(commodity);
                seenPlaceIds.add(place.id);
              }
            });
          } catch (typeError) {
            console.error(`Error fetching ${type} in cell:`, typeError);
          }
        }
      }
      return allPlaces;
    } catch (error) {
      console.error("Error fetching commodities:", error);
      return [];
    }
  }

  /**
   * Generate mock rated cells data for testing
   * Each cell gets a random score between 0-100
   * @param {number} gridSize - Number of cells to generate (default 4 = 2x2 grid)
   * @returns {Array} Array of rated cells: [{cellIndex: 0, rating: 85}, ...]
   */
  generateMockRatedCells(gridSize = 4) {
    const ratedCells = [];
    const totalCells = gridSize * gridSize;

    for (let i = 0; i < totalCells; i++) {
      ratedCells.push({
        cellIndex: i,
        rating: (i / totalCells) * 100, // Linear gradient 0→100
      });
    }

    console.log("Generated mock rated cells:", ratedCells);
    return ratedCells;
  }

  /**
   * Display heatmap from backend cell ratings
   * Call this method once your backend sends back the scored cells
   * @param {Array} ratedCells - From backend: [{cellIndex: 0, rating: 85}, ...]
   * @param {number} gridSize - Grid dimension (default 4)
   */
  displayHeatmap(ratedCells, gridSize = 4) {
    console.log("Displaying heatmap with", ratedCells.length, "cells");
    this.createHeatmapFromCells(ratedCells, gridSize);
  }

  // /**
  //  * Create heatmap layer from backend cell ratings
  //  * @param {Array} ratedCells - From backend: [{cellIndex: 0, rating: 85}, ...]
  //  * @param {number} gridSize - Grid dimension (default 4)
  //  */
  // createHeatmapFromCells(ratedCells, gridSize) {
  //   // get all cell boundaries
  //   const cells = this.toGrid(gridSize);

  //   // Find min and max scores for normalization
  //   const scores = ratedCells.filter(
  //     (score) => score !== null && score !== undefined,
  //   );
  //   const minScore = Math.min(...scores);
  //   const maxScore = Math.max(...scores);
  //   const scoreRange = maxScore - minScore;

  //   console.log(
  //     `Score range: ${minScore} to ${maxScore} (range: ${scoreRange})`,
  //   );

  //   // convert go geojson polygons
  //   const features = ratedCells.map((score, index) => {
  //     const cell = cells[index];

  //     // Normalize score to 0-100 range based on actual min/max
  //     let normalizedScore = 0; // default to 0 for red color
  //     if (score !== null && score !== undefined) {
  //       if (scoreRange > 0) {
  //         // If there's variation in scores, normalize
  //         normalizedScore = ((score - minScore) / scoreRange) * 100;
  //       } else if (score > 0) {
  //         // If all scores are the same and non-zero, show as medium (50)
  //         normalizedScore = 50;
  //       }
  //       // else: score is 0 or all scores are 0, keep normalizedScore = 0 (red)
  //     }

  //     return {
  //       type: "Feature",
  //       properties: {
  //         rating: normalizedScore, // Use normalized score for coloring
  //         originalRating: score, // Keep original for reference
  //         cellIndex: index,
  //       },
  //       geometry: {
  //         type: "Polygon",
  //         coordinates: [
  //           [
  //             [cell.sw.lng, cell.sw.lat], //sw corner
  //             [cell.ne.lng, cell.sw.lat],
  //             [cell.ne.lng, cell.ne.lat],
  //             [cell.sw.lng, cell.ne.lat],
  //             [cell.sw.lng, cell.sw.lat],
  //           ],
  //         ],
  //       },
  //     };
  //   });

  //   const heatmapLayer = new deck.GeoJsonLayer({
  //     id: "heatmap",
  //     data: { type: "FeatureCollection", features },
  //     filled: true,
  //     stroked: true,
  //     getLineColor: [0, 0, 0, 255],
  //     getLineWidth: 0,
  //     getFillColor: (f) => {
  //       const rating = f.properties.rating;
  //       // Smooth gradient: red (0) -> orange -> yellow -> green (100)
  //       const normalized = Math.max(0, Math.min(100, rating)) / 100;

  //       let r, g, b;
  //       if (normalized < 0.5) {
  //         // Red to Orange (0.0 to 0.5)
  //         const t = normalized * 2; // 0 to 1
  //         r = 255;
  //         g = Math.round(165 * t); // 0 -> 165 (red to orange)
  //         b = 0;
  //       } else {
  //         // Orange to Green (0.5 to 1.0)
  //         const t = (normalized - 0.5) * 2; // 0 to 1
  //         r = Math.round(255 * (1 - t)); // 255 -> 0
  //         g = Math.round(165 + (255 - 165) * t); // 165 -> 255 (orange to green)
  //         b = 0;
  //       }

  //       return [r, g, b, 180];
  //     },
  //     // Add tooltip to show original scores
  //     pickable: true,
  //     onHover: (info) => {
  //       if (info.object) {
  //         console.log(
  //           `Cell ${info.object.properties.cellIndex}: Original score = ${info.object.properties.originalRating?.toFixed(2)}, Normalized = ${info.object.properties.rating?.toFixed(2)}`,
  //         );
  //       }
  //     },
  //   });

  //   if (this.deckGLInstance) {
  //     this.deckGLInstance.setProps({ layers: [heatmapLayer] });
  //     console.log(
  //       `Heatmap displayed with normalized scores (${minScore.toFixed(2)} - ${maxScore.toFixed(2)})`,
  //     );
  //   }
  // }

  // /**
  //  * Create heatmap layer from backend cell ratings
  //  * @param {Array} ratedCells - From backend: [{cellIndex: 0, rating: 85}, ...]
  //  * @param {number} gridSize - Grid dimension (default 4)
  //  */
  createHeatmapFromCells(ratedCells, gridSize) {
    // get all cell boundaries
    const cells = this.toGrid(gridSize);

    // convert go geojson polygons
    const features = ratedCells.map((score, index) => {
      const cell = cells[index];

      return {
        type: "Feature",
        properties: {
          rating: score,
          cellIndex: index,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [cell.sw.lng, cell.sw.lat], //sw corner
              [cell.ne.lng, cell.sw.lat],
              [cell.ne.lng, cell.ne.lat],
              [cell.sw.lng, cell.ne.lat],
              [cell.sw.lng, cell.sw.lat],
            ],
          ],
        },
      };
    });

    const heatmapLayer = new deck.GeoJsonLayer({
      id: "heatmap",
      data: { type: "FeatureCollection", features },
      filled: true,
      stroked: true,
      getLineColor: [0, 0, 0, 255],
      getLineWidth: 2,
      getFillColor: (f) => {
        const rating = f.properties.rating;
        // Smooth gradient: red (0) -> orange -> yellow -> green (100)
        const normalized = Math.max(0, Math.min(100, rating)) / 100;

        let r, g, b;
        if (normalized < 0.5) {
          // Red to Yellow (0.0 to 0.5)
          const t = normalized * 2; // 0 to 1
          r = 255;
          g = Math.round(165 * t + 255 * (1 - t)); // 255 -> 165
          b = 0;
        } else {
          // Yellow to Green (0.5 to 1.0)
          const t = (normalized - 0.5) * 2; // 0 to 1
          r = Math.round(255 * (1 - t)); // 255 -> 0
          g = 255;
          b = 0;
        }

        return [r, g, b, 180];
      },
    });

    if (this.deckGLInstance) {
      this.deckGLInstance.setProps({ layers: [heatmapLayer] });
    }
  }

  /**
   * Commodities data are already loaded at this point, only initialize the overlay
   */
  async initializeOverlay() {
    try {
      console.log("Initializing GoogleMapsOverlay...");
      console.log("this.map exists:", !!this.map);

      // Create GoogleMapsOverlay instance
      this.deckGLInstance = new deck.GoogleMapsOverlay({
        layers: [],
      });
      console.log("GoogleMapsOverlay instance created:", !!this.deckGLInstance);

      this.deckGLInstance.setMap(this.map);
      console.log("GoogleMapsOverlay attached to map via setMap()");
    } catch (error) {
      console.error("Error initializing GoogleMapsOverlay:", error);
    }
  }

  /**
   * Initialize the scoring map with cells and commodities
   * @param {number} gridSize - Number of grid divisions (e.g., 3 for 3x3)
   * @param {Array<number>} weights - Commodity weights (must be array of 5)
   * @returns {Promise<Map>} Initialized Map instance with scores
   */
  async initializeScoringMap(gridSize = 3, weights = [85, 60, 40, 70, 90]) {
    try {
      // 1. Create ScoringMap instance
      const scoringMap = new ScoringMap();
      scoringMap.setGridSize(gridSize);
      scoringMap.setWeight(weights);

      // 2. Get grid cells from current map bounds
      const gridCells = this.toGrid(gridSize);

      // 3. Get commodities from Google Places API
      const commodities = await this.getCommodities();
      console.log(`Fetched ${commodities.length} commodities`);

      // Commodity type mapping
      const typeIndexMap = {
        restaurant: 0,
        gas_station: 1,
        supermarket: 2,
        pharmacy: 3,
        school: 4,
      };

      // 4. Create and populate cell objects
      console.log("\n=== POPULATING CELLS ===");
      gridCells.forEach((cellBounds, index) => {
        const cellObj = new cell();

        // Set cell coordinates from grid bounds
        cellObj.setCoords({
          topright: [cellBounds.ne.lng, cellBounds.ne.lat],
          bottomleft: [cellBounds.sw.lng, cellBounds.sw.lat],
        });
        cellObj.setPosition(index);

        // Initialize commodity counts array [restaurant, gas, grocery, pharmacy, school]
        const commodityCounts = [0, 0, 0, 0, 0];

        // Count commodities in this cell by type
        commodities.forEach((commodity) => {
          const lat = commodity.location.lat;
          const lng = commodity.location.lng;

          // Check if commodity is within cell bounds
          if (
            lat >= cellBounds.sw.lat &&
            lat <= cellBounds.ne.lat &&
            lng >= cellBounds.sw.lng &&
            lng <= cellBounds.ne.lng
          ) {
            // Map primaryType to index and increment count
            const typeIndex = typeIndexMap[commodity.primaryType];
            if (typeIndex !== undefined) {
              commodityCounts[typeIndex]++;
            }
          }
        });

        // Store commodity counts in cell (ensure all 5 positions are filled with 0s)
        commodityCounts.forEach((count, typeIndex) => {
          cellObj.setCommodities(count, typeIndex);
        });

        // Add cell to map
        scoringMap.addCell(cellObj, index);

        // Log stored data for verification
        console.log(`Cell ${index} stored:`, {
          position: cellObj.getPosition(),
          commodityCounts: cellObj.getCommodities(),
          coords: cellObj.getCoords(),
        });
      });

      console.log("\n=== MAP POPULATED ===");
      console.log("Total cells in map:", scoringMap.getGrid().length);

      // 5. Send to scorer for processing
      console.log("\n=== SENDING TO SCORER ===");
      const scorer = new CommodityScorer({
        maxDistance: 5000,
        decayFactor: 2,
        varianceAmplification: 2,
      });

      console.log("Weights being used:", scoringMap.getWeight());
      const scores = scoringMap.calculateScores(scorer);
      console.log(`\n=== SCORING COMPLETE ===`);
      console.log(`Processed ${scores.length} cells`);
      console.log(scores);
      console.log("\nScores after calculation:");
      scores.forEach((scoreData, index) => {
        console.log(
          `${scoreData.gridId}: Base=${scoreData.baseScore}, Aggregated=${scoreData.aggregatedScore}`,
        );
      });

      console.log("\nAll scores from map:", scoringMap.getAllScores());

      // 6. Return scored map to main.js
      return scoringMap;
    } catch (error) {
      console.error("Error initializing scoring map:", error);
      return null;
    }
  }

  /**
   * Update visualization layers based on commodities data
   * @param {Array} pureData - Raw place data from Google Places API
   */
  updateVisualization(pureData) {
    console.log(
      "updateVisualization called with",
      pureData?.length || 0,
      "places",
    );
    // Convert places to GeoJSON format
    const geojsonData = CommoditiesManager.formatData(pureData);

    if (!geojsonData || geojsonData.features.length === 0) {
      console.log("No commodity data to visualize");
      return;
    }

    console.log("Formatted data:", geojsonData.features.length, "features");
    console.log("GeoJSON Data:", geojsonData);

    // Create GeoJSON Layer for all point features
    const geojsonLayer = new deck.GeoJsonLayer({
      id: "commodity-geojson",
      data: geojsonData,
      pointType: "circle",
      filled: true,
      stroked: true,
      getFillColor: (f) => {
        const value = f.properties ? f.properties.value : 50;
        return CommoditiesManager.getColor(value);
      },
      getLineColor: [0, 0, 0, 255],
      getPointRadius: (f) => {
        const value = f.properties ? f.properties.value : 50;
        return Math.max(5, value * 0.5); // Much smaller circles
      },
      getLineWidth: 1,
      pointRadiusMinPixels: 3,
      pointRadiusScale: 1,
    });

    // Update Deck.GL with layers
    if (this.deckGLInstance) {
      console.log("Setting props on overlay with layer:", geojsonLayer.id);
      this.deckGLInstance.setProps({
        layers: [geojsonLayer],
      });
      console.log(LOG_MESSAGE.DECK_GL_LAYERS_UPDATED);
    } else {
      console.error("deckGLInstance not found!");
    }
  }

  async scanCurrentView(commodityPreferences) {
    showLoading();
    try {
      // Create the grid
      const gridSize = 5;
      const grid = this.toGrid(gridSize);
      // Fetch the commodity data
      const data = await this.getCommodities(grid);

      console.log(data);

      const typeOrder = [
        "restaurant",
        "gas_station",
        "supermarket",
        "pharmacy",
        "school",
      ];

    const scoringMap = new ScoringMap();
    scoringMap.setGridSize(gridSize);

      grid.forEach((cellBounds, index) => {
        const c = new cell();
        c.setPosition(index);
        c.setCoords({
          topright: [cellBounds.ne.lng, cellBounds.ne.lat],
          bottomleft: [cellBounds.sw.lng, cellBounds.sw.lat],
        });
        typeOrder.forEach((_, i) => c.setCommodities(0, i));
        scoringMap.addCell(c, index);
      });

      data.forEach((place) => {
        const typeIndex = typeOrder.indexOf(place.placeType);
        if (typeIndex === -1) return;
        for (let i = 0; i < grid.length; i++) {
          const cellBounds = grid[i];
          const lat = place.location.lat;
          const lng = place.location.lng;
          if (
            lat >= cellBounds.sw.lat &&
            lat <= cellBounds.ne.lat &&
            lng >= cellBounds.sw.lng &&
            lng <= cellBounds.ne.lng
          ) {
            const cellObj = scoringMap.getCell(i);
            const current = cellObj.getCommodities()[typeIndex] || 0;
            cellObj.setCommodities(current + 1, typeIndex);
            break;
          }
        }
      });

      // Display commodity counts for each cell
      console.log("\n=== COMMODITY COUNTS BY CELL ===");
      scoringMap.getGrid().forEach((cell, index) => {
        if (cell) {
          const commodities = cell.getCommodities();
          console.log(
            `Cell ${index}: [Restaurant:${commodities[0]}, Gas:${commodities[1]}, Supermarket:${commodities[2]}, Pharmacy:${commodities[3]}, School:${commodities[4]}]`,
          );
        }
      });
      console.log(
        "Total cells with data:",
        scoringMap.getGrid().filter((c) => c !== null).length,
      );

      const weights = typeOrder.map((t) => {
        const v = commodityPreferences?.[t];
        const num = typeof v === "number" ? v : parseFloat(v);
        return Number.isFinite(num) ? num : 0;
      });
      scoringMap.setWeight(weights);

      const scorer = new CommodityScorer();
      scoringMap.calculateScores(scorer);

    const base = scoringMap
      .getScoresArray({ type: "base", includeNulls: true })
      .map((v) => (v ?? 0));
    const aggregated = scoringMap
      .getScoresArray({ type: "aggregated", includeNulls: true })
      .map((v) => (v ?? 0));

    return { base, aggregated };
      const aggregated = scoringMap
        .getScoresArray({ type: "aggregated", includeNulls: true })
        .map((v) => v ?? 0);
      console.log("Aggregated scores:", aggregated);
      return aggregated;
    } finally {
      hideLoading();
    }
  }
}

// Create singleton instance
const MapManager = new MapManagerSingleton();

// Initialize program
function initialize() {
  // Initialize the map
  MapManager.build();

  // Set up user's geolocation
  const setCurrentLocationButton = document.getElementById(
    "activate-geolocation",
  );
  setCurrentLocationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      console.error(ERROR_MESSAGE.GEOLOCATION_UNSUPPORTED);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // Update map to user location
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        MapManager.setUserLocation({ lat: userLat, lng: userLng });
        console.log(LOG_MESSAGE.GEOLOCATION_SUCCESS);
      },
      () => {
        console.error(ERROR_MESSAGE.GEOLOCATION_UNSUPPORTED);
      },
    );
  });
}

// Loading the map
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

// Update slider value displays on input
document.addEventListener("DOMContentLoaded", () => {
  const sliders = document.querySelectorAll('input[type="range"]');

  sliders.forEach((slider) => {
    const valueDisplay = document.getElementById(
      slider.id.replace("-slider", "-value"),
    );

    if (valueDisplay) {
      slider.addEventListener("input", (e) => {
        valueDisplay.textContent = e.target.value;
      });
    }
  });

  // Handle form hide/show functionality
  const form = document.getElementById("input-form");
  const hideBtn = document.getElementById("hide-form-btn");
  const showBtn = document.getElementById("show-form-btn");

  hideBtn.addEventListener("click", () => {
    form.classList.add("hidden");
    showBtn.style.display = "block";
  });

  showBtn.addEventListener("click", () => {
    form.classList.remove("hidden");
    showBtn.style.display = "none";
  });

  // Handle scan button click to initialize scoring map
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Get weights from form sliders
    // const weights = [
    //   parseFloat(
    //     document.getElementById("restaurant-value")?.textContent || 85,
    //   ),
    //   parseFloat(document.getElementById("gas-value")?.textContent || 60),
    //   parseFloat(document.getElementById("grocery-value")?.textContent || 40),
    //   parseFloat(document.getElementById("pharmacy-value")?.textContent || 70),
    //   parseFloat(document.getElementById("school-value")?.textContent || 90),
    // ];

    // console.log("Weights from form:", weights);

    // // Data flow: main.js → Map class → CommodityScorer → Map class → main.js
    //onst scoringMap = await MapManager.initializeScoringMap(3, weights);

    // if (scoringMap) {
    //   console.log("\n=== SCORING MAP COMPLETE ===");
    //   console.log("Grid size:", scoringMap.getGridSize());
    //   console.log("Center cell:", scoringMap.getCenter());
    //   console.log("Weights:", scoringMap.getWeight());
    //   console.log(
    //     "All scores [baseScore, aggregatedScore]:",
    //     scoringMap.getAllScores(),
    //   );

    //   // Display individual cell details
    //   console.log("\n=== CELL DETAILS ===");
    //   for (let i = 0; i < scoringMap.getGridSize(); i++) {
    //     const cellData = scoringMap.getCell(i);
    //     if (cellData) {
    //       console.log(`Cell ${i}:`, {
    //         position: cellData.getPosition(),
    //         baseScore: cellData.getScore(),
    //         aggregatedScore: cellData.getAggregatedScore(),
    //         commodities: cellData.getCommodities(),
    //         coords: cellData.getCoords(),
    //       });
    //     }
    //   }
    // }

    // Get commodity preferences from the form
    const commodityPreferences = getCommodityPreferences();
    console.log("Commodity Preferences:", commodityPreferences);

    // Pass preferences to map manager
    const arrayOfCellsWithScore =
      await MapManager.scanCurrentView(commodityPreferences);
    console.log("Array of cells with score:", arrayOfCellsWithScore);

    // const mockData = MapManager.generateMockRatedCells(4);
    MapManager.displayHeatmap(
      arrayOfCellsWithScore,
      Math.sqrt(arrayOfCellsWithScore.length),
    );
  });
});

/**
 * Get commodity preference values from the form
 * @returns {Object} Key-value pairs where key is commodity type and value is the slider value (0-100)
 */
function getCommodityPreferences() {
  const form = document.getElementById("input-form");
  const sliders = form.querySelectorAll('input[type="range"]');

  const preferences = {};

  sliders.forEach((slider) => {
    const commodityType = slider.name; // e.g., "restaurant", "gas_station", etc.
    const value = parseInt(slider.value, 10);
    preferences[commodityType] = value;
  });

  return preferences;
}

/**
 * Show loading overlay
 */
function showLoading() {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
  }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.display = "none";
  }
}
