class Map{
    constructor(){
        this.grid = []
        this.center = 0;
        this.gridSize = 9; //Assuming a 3x3 Grid for now

    }
    //getter
    getGrid(){
        return this.grid;
    }
    getContent(position){
        if (this.grid[position] !== undefined) {
            return this.grid[position];

            //Maybe add a for loop to show the content in the grid position
        }
        else{
            return null
        }
    }

    getCenter() {
        return this.center;
    }

    getGridSize(){
        return this.gridSize;
    }

    //setter
    setCenter(){
        if (this.gridSize > 0) {
            this.center = Math.floor(this.gridSize/2)
        }
    }

    setGridSize(size){
        this.gridSize = size*size;
        this.setCenter();
    }


    //One type of setter?
    add(commodity, position){
        //Creates a set to store the commodity to the grid
        if (this.grid[position] === undefined) {
            this.grid[position] = [[], 0]; //add a score for later
        }
        //Push the commodity to the grid position
        commodity.setGridPosition(position);
        this.grid[position][0].push(commodity);
        //Placeholder Calculate the score of the position
        //this.grid[position][1].getScore() or smth of the sort
    }


}

//Ignore this part of the code
class commodity{
    constructor(){
        this.GridPosition = 0;
        this.distance2Center = 0; //tileCenter
        this.distance2AbsCenter = 0; //GridCenter
        this.score = 0 //Out of 100?
        this.userNeed = 0; //The dragbar

    }
    //Getter

    //Setter
    setGridPosition(position){
        this.gridPosition = position;
    }

    setDistance2Center(distance2Center){
        this.distance2Center = distance2Center;
    }

    setDistance2AbsCenter(distance2AbsCenter){
        this.distance2AbsCenter = distance2AbsCenter;
    }


    async getScore(){

        //Do some sort of math to calculate the score based on the distance, modifier and whatever
    }
}