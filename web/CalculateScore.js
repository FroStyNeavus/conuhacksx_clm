class Map{
    constructor(){
        this.Grid = []
        this.Center = 0;
        this.GridSize = 9; //This is the outer Grid

        this.weight = [];
    }
    //getter
    getGrid(){
        return this.innerGrid;
    }
    getCenter(){
        return this.center;
    }
    getGridSize(){
        return this.gridSize;
    }
    getWeight(){
        return this.weight;
    }
    getCell(Position){
        return this.Grid[Position];
    }

    //setter
    setCenters(){
        this.Center = Math.floor(this.GridSize/2)
    }
    setGridSize(size){
        this.GridSize = size*size;
    }
    setWeight(weight){
        this.weight = weight;
    }

    //Functions
    addCell(cell, position){
        this.Grid[position] = cell;
    }

}
class cell{
    constructor(){
        this.topleft = [0, 0];
        this.topright = [1,0];
        this.bottomleft = [0,1];
        this.bottomright = [1,1];

        this.position = 0;

        this.score = 0;
        this.aggregatedScore = 0;

        this.commodities = []; //Currently 5 commodities
    }

    //setter
    setCoords(coords){ //subject to change based on goher
        this.topleft = coords.top;
        this.topright = coords.top;
        this.bottomleft = coords.bottom;
        this.bottomright = coords.right;

    }

    setPosition(position){
        this.position = position;
    }

    setScore(score){
        this.score = score;
    }
    setAggregatedScore(AggScore){
        this.aggregatedScore = AggScore;
    }
    setCommodities(commodityCount, position){
        this.commodities[position] = commodityCount;
    }

    //getter
    getCoords(){
        return this.topleft, this.topright, this.bottomleft, this.bottomright; //Subject to change
    }

    getPosition(){
        return this.position;
    }

    getScore(){
        return this.score;
    }

    getAggregatedScore(){
        return this.aggregatedScore;
    }
    getCommodities(){
        return this.commodities;
    }


}