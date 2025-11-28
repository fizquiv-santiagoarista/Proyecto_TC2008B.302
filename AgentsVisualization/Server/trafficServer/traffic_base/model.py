from mesa import Model
from mesa.discrete_space import OrthogonalMooreGrid
from .agent import *
import json
import random


class CityModel(Model):
    """
    Creates a model based on a city map.

    Args:
        N: Number of cars to add per spawn cycle
        width: Width of the map (not used, kept for compatibility)
        height: Height of the map (not used, kept for compatibility)
        seed: Random seed for the model
    """

    def __init__(self, N, width=None, height=None, seed=42):

        super().__init__(seed=seed)

        # Load the map dictionary. The dictionary maps the characters in the map file to the corresponding agent.
        dataDictionary = json.load(open("city_files/mapDictionary.json"))

        self.cars_per_spawn = N  # Number of cars to add each spawn cycle
        self.traffic_lights = []
        self.destinations = []
        self.road_cells = []
        self.obstacles = []

        # Load the map file. The map file is a text file where each character represents an agent.
        with open("city_files/2022_base.txt") as baseFile:
            lines = [line.strip() for line in baseFile.readlines()] 
            self.width = len(lines[0])
            self.height = len(lines)

            self.grid = OrthogonalMooreGrid(
                [self.width, self.height], capacity=100, torus=False
            )

            # Goes through each character in the map file and creates the corresponding agent.
            for r, row in enumerate(lines):
                for c, col in enumerate(row):

                    cell = self.grid[(c, self.height - r - 1)]

                    if col in ["v", "^", ">", "<"]:
                        agent = Road(self, cell, dataDictionary[col])
                        self.road_cells.append(cell)

                    elif col in ["S", "s"]:
                        # Traffic lights need to also have a Road underneath
                        # Infer the direction from the flow of traffic in the map
                        # Check neighbors to see which direction cars would be coming FROM
                        traffic_light_direction = None
                        
                        # Check each direction and see if there's a road pointing TO this cell
                        # Left neighbor (c-1): if it has '>', it points right (to this cell)
                        if c > 0 and lines[r][c-1] == '>':
                            traffic_light_direction = "Right"
                        # Right neighbor (c+1): if it has '<', it points left (to this cell)
                        elif c < len(lines[r])-1 and lines[r][c+1] == '<':
                            traffic_light_direction = "Left"
                        # Top neighbor (r-1): if it has 'v', it points down (to this cell)
                        elif r > 0 and lines[r-1][c] == 'v':
                            traffic_light_direction = "Down"
                        # Bottom neighbor (r+1): if it has '^', it points up (to this cell)
                        elif r < len(lines)-1 and lines[r+1][c] == '^':
                            traffic_light_direction = "Up"
                        # If still not found, check same-direction neighbors (parallel traffic)
                        elif c > 0 and lines[r][c-1] in ['<', 'v', '^']:
                            traffic_light_direction = dataDictionary[lines[r][c-1]]
                        elif c < len(lines[r])-1 and lines[r][c+1] in ['>', 'v', '^']:
                            traffic_light_direction = dataDictionary[lines[r][c+1]]
                        elif r > 0 and lines[r-1][c] in ['<', '>', 'v']:
                            traffic_light_direction = dataDictionary[lines[r-1][c]]
                        elif r < len(lines)-1 and lines[r+1][c] in ['<', '>', '^']:
                            traffic_light_direction = dataDictionary[lines[r+1][c]]
                        else:
                            # Default fallback
                            traffic_light_direction = "Right"
                        
                        Road(self, cell, traffic_light_direction)
                        self.road_cells.append(cell)
                        
                        # Then create the traffic light on top
                        traffic_light = Traffic_Light(
                            self,
                            cell,
                            True,  # All traffic lights start green
                            int(dataDictionary[col]),
                        )
                        self.traffic_lights.append(traffic_light)

                    elif col == "#":
                        agent = Obstacle(self, cell)

                    elif col == "D":
                        agent = Destination(self, cell)
                        self.destinations.append(agent)

        # Define corner positions for car spawning
        corners = [
            (0, 0),                          # Bottom-left
            (self.width - 1, 0),             # Bottom-right
            (0, self.height - 1),            # Top-left
            (self.width - 1, self.height - 1) # Top-right
        ]
        
        # Get corner cells that are roads and have valid next cells
        self.corner_road_cells = []
        for corner_pos in corners:
            cell = self.grid[corner_pos]
            # Check if the cell has a Road agent
            has_road = any(isinstance(agent, Road) for agent in cell.agents)
            if not has_road:
                continue
            
            # Check if this road leads to a valid cell (not out of bounds)
            # Get the road direction
            road_dir = None
            for agent in cell.agents:
                if isinstance(agent, Road):
                    road_dir = agent.direction
                    break
            
            if road_dir:
                # Calculate next position based on direction
                x, y = corner_pos
                if road_dir == "Up":
                    next_pos = (x, y + 1)
                elif road_dir == "Down":
                    next_pos = (x, y - 1)
                elif road_dir == "Left":
                    next_pos = (x - 1, y)
                elif road_dir == "Right":
                    next_pos = (x + 1, y)
                else:
                    continue
                
                # Only add if next position is within bounds
                if (0 <= next_pos[0] < self.width and 
                    0 <= next_pos[1] < self.height):
                    self.corner_road_cells.append(cell)
        
        if not self.corner_road_cells:
            print("Warning: No road cells found at map corners. Cars cannot be spawned.")
        
        self.spawn_interval = 10  # Spawn cars every 10 steps

        self.running = True

    def step(self):
        """Advance the model by one step."""
        self.agents.shuffle_do("step")
        
        # Spawn cars every spawn_interval steps
        if self.steps % self.spawn_interval == 0:
            if self.corner_road_cells and self.destinations:
                # Spawn the specified number of cars
                for i in range(self.cars_per_spawn):
                    # Select a corner to spawn the car (cycle through corners)
                    starting_cell = self.corner_road_cells[i % len(self.corner_road_cells)]
                    
                    # Check if the starting cell is already occupied by a car
                    cell_has_car = any(isinstance(agent, Car) for agent in starting_cell.agents)
                    if cell_has_car:
                        # Skip spawning if cell is occupied to avoid collisions
                        continue
                    
                    # Assign a random destination to the car
                    # Avoid assigning destinations that are too close to the starting point
                    # This helps distribute traffic better across the map
                    available_destinations = [d for d in self.destinations 
                                             if abs(d.cell.coordinate[0] - starting_cell.coordinate[0]) + 
                                                abs(d.cell.coordinate[1] - starting_cell.coordinate[1]) > 5]
                    
                    if available_destinations:
                        destination = self.random.choice(available_destinations)
                    else:
                        # If no distant destinations, use any destination
                        destination = self.random.choice(self.destinations)
                    
                    car = Car(self, starting_cell, destination)
