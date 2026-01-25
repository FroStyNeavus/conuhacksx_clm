/**
 * Commodity Scoring System (map-agnostic)
 *
 * CODING PLAN OUTLINE:
 * =====================
 * 
 * GOAL: Calculate grid scores based on:
 *   1. Commodity user weights (0-100 scale, where 0=unwanted, 100=extremely desired)
 *   2. Variance-based outlier amplification (outliers have more impact)
 *   3. Distance-based score aggregation (further grids contribute less exponentially)
 *   4. Display map grid heat only from user input “relative wanted degree” (no per-grid custom weights)
 * 
 * INPUT DATA STRUCTURES:
 *   - weights: Array<number> (0-100) for each commodity type (global input, same for all grids)
 *   - gridMap: Map<gridId, {
 *       gridId,
 *       centerLat,
 *       centerLng,
 *       commodityCounts: Array<number> // counts per commodity type (same ordering as weights)
 *     }>
 * 
 * STEP 1: COMMODITY SCORING MULTIPLIER (Variance-Based Amplification)
 *   Function: calculateVarianceMultipliers(weights[])
 *   - Calculate mean of all global commodity weights
 *   - Calculate variance/standard deviation
 *   - Amplify weights based on distance from mean (outliers have stronger effect)
 *   - Return: amplified weight per commodity (same length as weights)
 * 
 * STEP 2: BASE GRID SCORE (Single Grid, No Neighbors)
 *   Function: calculateGridScore(gridData, weights)
 *   - Apply variance-amplified weights (from Step 1)
 *   - Aggregate: sum(count_i * amplifiedWeight_i) across commodity types
 *   - Normalize by total commodity count to stay within 0-100
 *   - Return: base score for this grid only
 * 
 * STEP 3: DISTANCE SCORING MULTIPLIER (Exponential Decay)
 *   Function: calculateScoreDecay(distance)
 *   - Exponential decay based on distance
 *   - weight = e^(-decayFactor * (distance/maxDistance)²)
 *   - Further grids contribute exponentially less
 * 
 * STEP 4: AGGREGATED GRID SCORE (With Neighbor Influence)
 *   Function: calculateAggregatedScore(targetGridId, gridMap, baseScores)
 *   - Get base score of target grid (from Step 2)
 *   - For each neighboring grid within maxDistance:
 *     → Calculate distance between grid centers
 *     → Apply distance decay (Step 3)
 *     → contribution = neighbor_base_score * decay_weight
 *   - Aggregate: weighted_sum / total_weights
 *   - Return: { baseScore, aggregatedScore, breakdown }
 * 
 * STEP 5: MAP-WIDE CALCULATION
 *   Function: calculateAllAggregatedScores(gridMap)
 *   - Compute base scores for all grids first (Step 2)
 *   - Then compute aggregated scores for all grids (Step 4)
 *   - Return: Array of all grid scores
 */

// Method summary for CommodityScorer:
// - calculateDistance: Haversine distance between two lat/lng points (meters)
// - calculateScoreDecay: Exponential decay weight for a given distance
// - calculateVarianceMultipliers: Amplify weights based on variance/outliers
// - calculateGridScore: Base score for a single grid using amplified weights
// - calculateAllBaseScores: Precompute base scores for all grids
// - calculateAggregatedScore: Neighbor-weighted score with distance decay
// - calculateAllAggregatedScores: Aggregated scores for every grid
// - getHeatmapData: Heatmap-ready payload of lat/lng/value per grid
// - getSummary: Dataset-wide stats (avg, median, min, max, totals)

class CommodityScorer {
    /**
     * METHODS SUMMARY:
     * ================
     * • constructor(config) - Initialize scorer with distance, decay, and amplification settings
     * • calculateDistance(point1, point2) - Haversine distance between two lat/lng points (meters)
     * • calculateScoreDecay(distance) - Exponential decay factor (0-1) based on distance
     * • calculateVarianceMultipliers(weights) - Amplify outlier weights using z-score
     * • calculateGridScore(gridData, weights, amplifiedWeights) - Base score for single grid
     * • calculateAllBaseScores(gridMap, weights, amplifiedWeights) - Base scores for all grids
     * • calculateAggregatedScore(targetGridId, gridMap, weights, baseScores, amplifiedWeights) - Score with neighbor influence
     * • calculateAllAggregatedScores(gridMap, weights, baseScores, amplifiedWeights) - Aggregated scores for all grids
     * • getHeatmapData(gridMap, weights) - Format grid scores for heatmap visualization
     * • getSummary(gridMap, weights) - Statistical summary (mean, min, max, median)
     */

    /**
     * @param {Object} config
     * @param {number} config.maxDistance   Maximum distance (m) to consider neighbors (default: 5000)
     * @param {number} config.decayFactor   Steepness of exponential score decay (default: 2, higher = steeper)
     * @param {number} config.varianceAmplification   How much to amplify outlier effects (default: 2)
     */
    constructor(config = {}) {
        this.maxDistance = config.maxDistance || 5000;
        this.decayFactor = config.decayFactor || 2;
        this.varianceAmplification = config.varianceAmplification || 1.5;
    }

    /**
     * Calculate distance between two geographic points using Haversine formula
     * @param {Object} point1 - {lat, lng}
     * @param {Object} point2 - {lat, lng}
     * @returns {number} Distance in meters
     */
    calculateDistance(point1, point2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
        const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((point1.lat * Math.PI) / 180) *
                Math.cos((point2.lat * Math.PI) / 180) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * STEP 3: Calculate exponential decay factor applied to scores based on distance
     * @param {number} distance - Distance in meters
     * @returns {number} Decay weight between 0 and 1
     */
    calculateScoreDecay(distance) {
        if (distance > this.maxDistance) return 0;
        const normalized = distance / this.maxDistance;
        return Math.exp(-this.decayFactor * Math.pow(normalized, 2));
    }

    /**
     * STEP 1: Calculate variance-based amplified weights
     * Outliers (far from mean) get amplified impact
     * @param {Array<number>} weights - Array of commodity weights (0-100)
     * @returns {Array<number>} Amplified weights
     */
    calculateVarianceMultipliers(weights) {
        if (!weights || weights.length === 0) return [];
        if (weights.length === 1) return weights;

        // Calculate mean
        const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length;

        // Calculate variance and standard deviation
        const variance =
            weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) /
            weights.length;
        const stdDev = Math.sqrt(variance);

        // If no variance (all weights are same), return original weights
        if (stdDev === 0) return weights;

        // Amplify based on distance from mean (z-score)
        return weights.map((weight) => {
            const deviationFromMean = Math.abs(weight - mean);
            const zScore = deviationFromMean / stdDev;

            // Amplification factor: outliers get exponentially more weight
            const amplificationFactor = 1 + zScore * this.varianceAmplification;

            // Apply amplification in the direction of deviation
            // If below mean (unwanted), reduce score more
            // If above mean (wanted), increase score more
            const amplified = mean + (weight - mean) * amplificationFactor;

            // Keep within 0-100 bounds
            return Math.max(0, Math.min(100, amplified));
        });
    }

    /**
     * STEP 2: Calculate base score for a single grid (no neighbor influence)
     * @param {Object} gridData - Grid data with commodities: { commodities: Array<{ weight: 0-100 }> }
     * @returns {number} Base score (0-100)
     */
    calculateGridScore(gridData, weights, amplifiedWeightsInput) {
        if (!gridData || !Array.isArray(gridData.commodityCounts)) return 0;
        const counts = gridData.commodityCounts;
        if (!weights || weights.length === 0 || counts.length === 0) return 0;

        // Use provided amplified weights or compute once
        const amplifiedWeights =
            amplifiedWeightsInput || this.calculateVarianceMultipliers(weights);

        const len = Math.min(counts.length, amplifiedWeights.length);
        let totalWeighted = 0;
        let totalCount = 0;

        for (let i = 0; i < len; i++) {
            const count = counts[i] || 0;
            totalWeighted += count * amplifiedWeights[i];
            totalCount += count;
        }

        if (totalCount === 0) return 0;

        // Normalize to 0-100 by average weighted value
        const averageScore = totalWeighted / totalCount;
        return Math.max(0, Math.min(100, averageScore));
    }

    /**
     * STEP 2B: Precompute base scores for all grids (no neighbor influence)
     * @param {Map} gridMap - Map of all grids
     * @returns {Map<string, number>} Map of gridId to base score
     */
    calculateAllBaseScores(gridMap, weights, amplifiedWeightsInput) {
        const amplified =
            amplifiedWeightsInput || this.calculateVarianceMultipliers(weights);
        const baseScores = new Map();
        gridMap.forEach((grid, gridId) => {
            baseScores.set(gridId, this.calculateGridScore(grid, weights, amplified));
        });
        return baseScores;
    }

    /**
     * STEP 4: Calculate aggregated score for a target grid using neighbors with distance decay
     * @param {string} targetGridId - ID of the target grid
     * @param {Map} gridMap - Map of all grids
     * @param {Map} baseScores - Precomputed base scores (optional)
     * @returns {Object} Aggregated score data
     */
    calculateAggregatedScore(targetGridId, gridMap, weights, baseScores, amplifiedWeightsInput) {
        const target = gridMap.get(targetGridId);
        if (!target) {
            return {
                gridId: targetGridId,
                baseScore: 0,
                aggregatedScore: 0,
                contributingGrids: 0,
                breakdown: [],
            };
        }

        const amplified =
            amplifiedWeightsInput || this.calculateVarianceMultipliers(weights);

        const baseScore =
            baseScores?.get(targetGridId) ??
            this.calculateGridScore(target, weights, amplified);
        let totalWeightedScore = 0;
        let totalWeight = 0;
        const breakdown = [];

        // Iterate through all grids and calculate their contribution
        gridMap.forEach((grid, gridId) => {
            const distance = this.calculateDistance(
                { lat: target.centerLat, lng: target.centerLng },
                { lat: grid.centerLat, lng: grid.centerLng }
            );

            // Skip if distance exceeds maximum (except for self)
            if (distance > this.maxDistance && gridId !== targetGridId) return;

            const weight = this.calculateScoreDecay(distance);
            const gridScore =
                baseScores?.get(gridId) ??
                this.calculateGridScore(grid, weights, amplified);
            const contribution = gridScore * weight;

            totalWeightedScore += contribution;
            totalWeight += weight;

            breakdown.push({
                gridId,
                distance: Math.round(distance),
                contribution: Math.round(contribution * 100) / 100,
                weight: Math.round(weight * 10000) / 10000,
                score: Math.round(gridScore * 100) / 100,
            });
        });

        // Normalize aggregated score by total weight
        const aggregatedScore =
            totalWeight > 0 ? totalWeightedScore / totalWeight : baseScore;

        return {
            gridId: targetGridId,
            baseScore: Math.round(baseScore * 100) / 100,
            aggregatedScore: Math.round(aggregatedScore * 100) / 100,
            contributingGrids: breakdown.length,
            breakdown: breakdown.sort((a, b) => a.distance - b.distance),
        };
    }

    /**
     * STEP 5: Calculate aggregated scores for all grids
     * @param {Map} gridMap - Map of all grids
     * @param {Map} baseScores - Precomputed base scores (optional)
     * @returns {Array} Array of aggregated score data for all grids
     */
    calculateAllAggregatedScores(gridMap, weights, baseScores, amplifiedWeightsInput) {
        const resolvedAmplified =
            amplifiedWeightsInput || this.calculateVarianceMultipliers(weights);
        const resolvedBase =
            baseScores || this.calculateAllBaseScores(gridMap, weights, resolvedAmplified);
        const results = [];
        gridMap.forEach((_, gridId) => {
            results.push(
                this.calculateAggregatedScore(
                    gridId,
                    gridMap,
                    weights,
                    resolvedBase,
                    resolvedAmplified
                )
            );
        });
        return results;
    }

    /**
     * Get heatmap-ready data for visualization
     * @param {Map} gridMap - Map of all grids
     * @returns {Array} Array of grid points with scores
     */
    getHeatmapData(gridMap, weights) {
        const amplified = this.calculateVarianceMultipliers(weights);
        const baseScores = this.calculateAllBaseScores(gridMap, weights, amplified);
        const scores = this.calculateAllAggregatedScores(
            gridMap,
            weights,
            baseScores,
            amplified
        );
        return scores.map((scoreData) => {
            const grid = gridMap.get(scoreData.gridId);
            return {
                lat: grid.centerLat,
                lng: grid.centerLng,
                value: scoreData.aggregatedScore,
                gridId: scoreData.gridId,
                baseScore: scoreData.baseScore,
                commodityCount: grid.commodities?.length || 0,
            };
        });
    }

    /**
     * Get statistical summary of all grids
     * @param {Map} gridMap - Map of all grids
     * @returns {Object} Summary statistics
     */
    getSummary(gridMap, weights) {
        const amplified = this.calculateVarianceMultipliers(weights);
        const baseScores = this.calculateAllBaseScores(gridMap, weights, amplified);
        const allScores = this.calculateAllAggregatedScores(
            gridMap,
            weights,
            baseScores,
            amplified
        );
        const aggregated = allScores.map((s) => s.aggregatedScore);

        if (aggregated.length === 0) {
            return {
                totalGrids: 0,
                totalCommodities: 0,
                averageScore: 0,
                maxScore: 0,
                minScore: 0,
                medianScore: 0,
            };
        }

        const sorted = [...aggregated].sort((a, b) => a - b);
        const median =
            sorted.length % 2 === 0
                ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
                : sorted[Math.floor(sorted.length / 2)];

        const totalCommodities = Array.from(gridMap.values()).reduce(
            (sum, grid) => sum + (grid.commodities?.length || 0),
            0
        );

        return {
            totalGrids: gridMap.size,
            totalCommodities,
            averageScore:
                Math.round(
                    (aggregated.reduce((a, b) => a + b, 0) / aggregated.length) *
                        100
                ) / 100,
            maxScore: Math.round(Math.max(...aggregated) * 100) / 100,
            minScore: Math.round(Math.min(...aggregated) * 100) / 100,
            medianScore: Math.round(median * 100) / 100,
        };
    }
}

// Export for use in Node.js/module systems
if (typeof module !== "undefined" && module.exports) {
    module.exports = CommodityScorer;
}

// ============================================================================
// MOCK DATA AND TEST FUNCTION
// ============================================================================

/**
 * Generate mock grid data for testing
 * @returns {Map} Mock grid map
 */
function generateMockGridData() {
    const gridMap = new Map();

    // Global commodity weights (same ordering used in commodityCounts)
    // Example types: [restaurant, gas, grocery, pharmacy, cafe]
    const weights = [85, 60, 40, 70, 90];

    // Grid 1: Downtown area - dense, high cafes and restaurants
    gridMap.set("grid_1", {
        gridId: "grid_1",
        centerLat: 45.5017,
        centerLng: -73.5673,
        commodityCounts: [15, 4, 6, 3, 20],
    });

    // Grid 2: Nearby - mixed with some low gas count
    gridMap.set("grid_2", {
        gridId: "grid_2",
        centerLat: 45.5067,
        centerLng: -73.5623,
        commodityCounts: [8, 1, 5, 2, 6],
    });

    // Grid 3: Residential - moderate grocery/pharmacy
    gridMap.set("grid_3", {
        gridId: "grid_3",
        centerLat: 45.4967,
        centerLng: -73.5723,
        commodityCounts: [4, 2, 7, 4, 3],
    });

    // Grid 4: Suburban - low everything
    gridMap.set("grid_4", {
        gridId: "grid_4",
        centerLat: 45.5117,
        centerLng: -73.5773,
        commodityCounts: [2, 1, 2, 1, 1],
    });

    // Grid 5: Far away - high restaurants but far distance reduces impact
    gridMap.set("grid_5", {
        gridId: "grid_5",
        centerLat: 45.5517,
        centerLng: -73.6173,
        commodityCounts: [12, 0, 3, 1, 5],
    });

    // Grid 6: Edge case - single type only (restaurants)
    gridMap.set("grid_6", {
        gridId: "grid_6",
        centerLat: 45.5007,
        centerLng: -73.5773,
        commodityCounts: [5, 0, 0, 0, 0],
    });

    // Grid 7: Empty - no commodities
    gridMap.set("grid_7", {
        gridId: "grid_7",
        centerLat: 45.5087,
        centerLng: -73.5523,
        commodityCounts: [0, 0, 0, 0, 0],
    });

    // Grid 8: Mixed commercial
    gridMap.set("grid_8", {
        gridId: "grid_8",
        centerLat: 45.4937,
        centerLng: -73.5823,
        commodityCounts: [6, 3, 5, 2, 4],
    });

    // Grid 9: Cafe-heavy cluster
    gridMap.set("grid_9", {
        gridId: "grid_9",
        centerLat: 45.4897,
        centerLng: -73.5773,
        commodityCounts: [4, 1, 2, 1, 12],
    });

    // Grid 10: Gas-heavy corridor
    gridMap.set("grid_10", {
        gridId: "grid_10",
        centerLat: 45.5157,
        centerLng: -73.5903,
        commodityCounts: [3, 9, 2, 1, 2],
    });

    // Grid 11: Grocery focus
    gridMap.set("grid_11", {
        gridId: "grid_11",
        centerLat: 45.5227,
        centerLng: -73.5653,
        commodityCounts: [2, 1, 10, 3, 2],
    });

    // Grid 12: Pharmacy-heavy medical area
    gridMap.set("grid_12", {
        gridId: "grid_12",
        centerLat: 45.5187,
        centerLng: -73.5553,
        commodityCounts: [1, 1, 2, 9, 1],
    });

    // Grid 13: Restaurant strip
    gridMap.set("grid_13", {
        gridId: "grid_13",
        centerLat: 45.4877,
        centerLng: -73.5653,
        commodityCounts: [14, 1, 2, 1, 6],
    });

    // Grid 14: Balanced suburban mix
    gridMap.set("grid_14", {
        gridId: "grid_14",
        centerLat: 45.5047,
        centerLng: -73.5973,
        commodityCounts: [5, 4, 5, 3, 4],
    });

    // Grid 15: Low density fringe
    gridMap.set("grid_15", {
        gridId: "grid_15",
        centerLat: 45.5327,
        centerLng: -73.6053,
        commodityCounts: [1, 1, 1, 1, 1],
    });

    // Grid 16: High grocery & cafe cluster
    gridMap.set("grid_16", {
        gridId: "grid_16",
        centerLat: 45.5407,
        centerLng: -73.5753,
        commodityCounts: [3, 2, 12, 2, 9],
    });

    return { gridMap, weights };
}

/**
 * Test function to demonstrate the scoring system
 */
function testCommodityScoring() {
    console.log("=".repeat(80));
    console.log("COMMODITY SCORING SYSTEM - TEST");
    console.log("=".repeat(80));
    console.log("");

    // Create scorer with custom config
    const scorer = new CommodityScorer({
        maxDistance: 5000, // 5km max distance
        decayFactor: 2, // Moderate decay
        varianceAmplification: 2, // Moderate outlier amplification
    });

    // Generate mock data (global weights + grids)
    const { gridMap, weights } = generateMockGridData();
    console.log(`📊 Generated ${gridMap.size} mock grids with ${weights.length} commodity types\n`);

    // STEP 1: Calculate base scores (no neighbor influence)
    console.log("STEP 1: BASE SCORES (Grid alone, no neighbors)");
    console.log("-".repeat(80));
    const baseScores = scorer.calculateAllBaseScores(gridMap, weights);
    const amplified = scorer.calculateVarianceMultipliers(weights);
    baseScores.forEach((score, gridId) => {
        const grid = gridMap.get(gridId);
        const counts = grid.commodityCounts;
        console.log(
            `${gridId}: ${score.toFixed(2)} | Counts: [${counts.join(", ")}] | Amplified Weights: [${amplified.map((w) => w.toFixed(1)).join(", ")}]`
        );
    });
    console.log("");

    // STEP 2: Calculate aggregated scores (with neighbor influence)
    console.log("STEP 2: AGGREGATED SCORES (With distance-weighted neighbors)");
    console.log("-".repeat(80));
    const aggregatedScores = scorer.calculateAllAggregatedScores(
        gridMap,
        weights,
        baseScores,
        amplified
    );
    aggregatedScores.forEach((result) => {
        const change = result.aggregatedScore - result.baseScore;
        const changeSymbol = change > 0 ? "↑" : change < 0 ? "↓" : "→";
        console.log(
            `${result.gridId}: Base=${result.baseScore} → Aggregated=${result.aggregatedScore} ${changeSymbol} (${change >= 0 ? "+" : ""}${change.toFixed(2)}) | Contributing grids: ${result.contributingGrids}`
        );
    });
    console.log("");

    // STEP 3: Detailed breakdown for one grid
    console.log("STEP 3: DETAILED BREAKDOWN (Grid 1)");
    console.log("-".repeat(80));
    const grid1Detail = scorer.calculateAggregatedScore(
        "grid_1",
        gridMap,
        weights,
        baseScores,
        amplified
    );
    console.log(`Grid: ${grid1Detail.gridId}`);
    console.log(`Base Score: ${grid1Detail.baseScore}`);
    console.log(`Aggregated Score: ${grid1Detail.aggregatedScore}`);
    console.log(`Contributing Grids: ${grid1Detail.contributingGrids}\n`);
    console.log("Breakdown of contributions:");
    grid1Detail.breakdown.slice(0, 5).forEach((contrib) => {
        console.log(
            `  ${contrib.gridId.padEnd(10)} | Distance: ${String(contrib.distance).padStart(5)}m | Weight: ${contrib.weight.toFixed(4)} | Score: ${contrib.score.toFixed(2)} | Contribution: ${contrib.contribution.toFixed(2)}`
        );
    });
    console.log("");

    // STEP 4: Get heatmap data
    console.log("STEP 4: HEATMAP DATA (For visualization)");
    console.log("-".repeat(80));
    const heatmapData = scorer.getHeatmapData(gridMap, weights);
    heatmapData.slice(0, 3).forEach((point) => {
        console.log(
            `Lat: ${point.lat.toFixed(4)}, Lng: ${point.lng.toFixed(4)} | Score: ${point.value.toFixed(2)} | Commodities: ${point.commodityCount}`
        );
    });
    console.log("");

    // STEP 5: Summary statistics
    console.log("STEP 5: SUMMARY STATISTICS");
    console.log("-".repeat(80));
    const summary = scorer.getSummary(gridMap, weights);
    console.log(`Total Grids: ${summary.totalGrids}`);
    console.log(`Total Commodities: ${summary.totalCommodities}`);
    console.log(`Average Score: ${summary.averageScore}`);
    console.log(`Max Score: ${summary.maxScore}`);
    console.log(`Min Score: ${summary.minScore}`);
    console.log(`Median Score: ${summary.medianScore}`);
    console.log("");

    console.log("=".repeat(80));
    console.log("✅ TEST COMPLETE");
    console.log("=".repeat(80));

    return {
        baseScores,
        aggregatedScores,
        heatmapData,
        summary,
    };
}

// Auto-run test if this file is loaded directly in browser
if (typeof window !== "undefined" && typeof module === "undefined") {
    console.log("🚀 Running commodity scoring test...\n");
    testCommodityScoring();
}
