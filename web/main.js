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
  zoom: 12,
  center: { lat: -25.344, lng: 131.031 },
  mapId: "DEMO_MAP_ID",
};

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
        this.commoditiesData = await this.getCommodities();
        console.log(
          "Initial commodities data fetched:",
          this.commoditiesData?.length || 0,
          "places",
        );

        this.updateVisualization(this.commoditiesData);
        console.log("Initial visualization updated");
      } catch (overlayError) {
        console.error("Error initializing overlay:", overlayError);
      }
      // !IMPORTANT: State change listener for any data updates, fetching, etc.
      google.maps.event.addListener(this.map, "idle", async () => {
        console.log("Map idle event triggered");
        this.commoditiesData = await this.getCommodities();
        this.updateVisualization(this.commoditiesData);
      });

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

  async getCommodities() {
    try {
      if (!this.map) {
        console.error("Map not initialized");
        return [];
      }
      // Import required libraries
      const { spherical } = await google.maps.importLibrary("geometry");
      const { Place } = await google.maps.importLibrary("places");

      let bounds = this.map.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const center = this.map.getCenter();
      const diameter = spherical.computeDistanceBetween(ne, sw);
      const radius = Math.min(diameter / 2, 50000);

      // IMPORTANT: Customize the data fields here as per your requirements
      const request = {
        fields: ["displayName", "location", "formattedAddress"],
        locationRestriction: { center, radius },
        includedPrimaryTypes: ["restaurant"],
        maxResultCount: 2,
      };

      // Search nearby places based on the request
      console.log("Searching for nearby places with radius:", radius);
      const { places } = await Place.searchNearby(request);
      console.log("Nearby places found:", places.length);
      console.log("Places data:", places);
      return places;
    } catch (error) {
      console.error("Error fetching commodities:", error);
      return [];
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
