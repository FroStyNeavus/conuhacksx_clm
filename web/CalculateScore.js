class ScoringMap {
  constructor() {
    this.grid = [];
    this.center = 0;
    this.gridSize = 9; //This is the outer Grid

    this.weight = [];
  }
  //getter
  getGrid() {
    return this.grid;
  }
  getCenter() {
    return this.center;
  }
  getGridSize() {
    return this.gridSize;
  }
  getWeight() {
    return this.weight;
  }
  getCell(position) {
    return this.grid[position];
  }

  getAllScores() {
    return this.grid.map((cell) => (cell ? cell.getScores() : null));
  }

  getBaseScores() {
    return this.grid.map((cell) => (cell ? cell.getScore() : null));
  }

  getAggregatedScores() {
    return this.grid.map((cell) => (cell ? cell.getAggregatedScore() : null));
  }

  getScoresArray({ type = "base", includeNulls = false } = {}) {
    const arr =
      type === "aggregated"
        ? this.grid.map((cell) => (cell ? cell.getAggregatedScore() : null))
        : this.grid.map((cell) => (cell ? cell.getScore() : null));
    return includeNulls
      ? arr
      : arr.filter((v) => v !== null && v !== undefined);
  }

  //setter
  setCenter() {
    this.center = Math.floor(this.gridSize / 2);
  }
  setGridSize(size) {
    this.gridSize = size * size;
    this.setCenter();
  }
  setWeight(weight) {
    if (Array.isArray(weight) && weight.length === 5) {
      this.weight = weight;
    } else {
      throw new Error("Weight must be an array of size 5");
    }
  }
  //Functions
  addCell(cell, position) {
    this.grid[position] = cell;
  }

  /**
   * Send data to scorer for processing
   * @param {CommodityScorer} scorer - The scorer instance
   * @returns {Array} Aggregated scores with grid data
   */
  calculateScores(scorer) {
    if (!scorer) throw new Error("Scorer instance required");

    // Convert grid cells to a Map format expected by scorer
    const gridMap = new Map();
    this.grid.forEach((cellObj, index) => {
      if (cellObj) {
        // Calculate center from coordinates
        const centerLat = (cellObj.topleft[1] + cellObj.bottomright[1]) / 2;
        const centerLng = (cellObj.topleft[0] + cellObj.bottomright[0]) / 2;

        gridMap.set(`cell_${index}`, {
          gridId: `cell_${index}`,
          centerLat: centerLat,
          centerLng: centerLng,
          commodityCounts: cellObj.commodities,
        });
      }
    });
    console.log(gridMap);
    // Calculate scores using the scorer
    const scores = scorer.calculateAllAggregatedScores(gridMap, this.weight);

    // Store scores back in cells
    scores.forEach((scoreData) => {
      const cellIndex = parseInt(scoreData.gridId.split("_")[1]);
      if (this.grid[cellIndex]) {
        this.grid[cellIndex].setScore(scoreData.baseScore);
        this.grid[cellIndex].setAggregatedScore(scoreData.aggregatedScore);
      }
    });

    return scores;
  }
}
class cell {
  constructor() {
    this.topleft = [0, 0];
    this.topright = [1, 0];
    this.bottomleft = [0, 1];
    this.bottomright = [1, 1];

    this.position = 0;

    this.score = 0;
    this.aggregatedScore = 0;

    this.commodities = []; //Currently 5 commodities
  }

  //setter
  setCoords(coords) {
    //subject to change based on goher
    this.topleft = coords.topleft;
    this.topright = coords.topright;
    this.bottomleft = coords.bottomleft;
    this.bottomright = coords.bottomright;
  }

  setPosition(position) {
    this.position = position;
  }

  setScore(score) {
    this.score = score;
  }
  setAggregatedScore(AggScore) {
    this.aggregatedScore = AggScore;
  }
  setCommodities(commodityCount, position) {
    this.commodities[position] = commodityCount;
  }

  //getter
  getCoords() {
    return {
      topleft: this.topleft,
      topright: this.topright,
      bottomleft: this.bottomleft,
      bottomright: this.bottomright,
    };
  }

  getPosition() {
    return this.position;
  }
  setCoords(coords) {
    // coords should have: coords.topright and coords.bottomleft
    // Each corner is [longitude, latitude] or [x, y]

    this.topright = coords.topright; // [x1, y1]
    this.bottomleft = coords.bottomleft; // [x2, y2]

    // Calculate the other two corners
    this.topleft = [coords.bottomleft[0], coords.topright[1]]; // [x2, y1]
    this.bottomright = [coords.topright[0], coords.bottomleft[1]]; // [x1, y2]
  }

  getScore() {
    return this.score;
  }

  getAggregatedScore() {
    return this.aggregatedScore;
  }

  getScores() {
    return [this.score, this.aggregatedScore];
  }
  getCommodities() {
    return this.commodities;
  }
}
