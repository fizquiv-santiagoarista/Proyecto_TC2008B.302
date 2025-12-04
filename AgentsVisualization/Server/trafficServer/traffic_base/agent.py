from mesa.discrete_space import CellAgent, FixedAgent
import heapq

class Car(CellAgent):
    """
    Car agent that moves following road directions to reach a destination.
    """
    def __init__(self, model, cell, destination=None):
        """
        Creates a new car agent.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            destination: Target destination cell (randomly assigned if None)
        """
        super().__init__(model)
        self.cell = cell
        
        # Assign a random destination if not provided
        if destination is None and model.destinations:
            self.destination = self.model.random.choice(model.destinations)
        else:
            self.destination = destination
        
        self.reached_destination = False
        self.last_direction = None  # Track the last direction the car moved
        self.path = []  # Store the computed path
        self.path_index = 0  # Current position in the path
        self.stuck_counter = 0  # Track how long we've been stuck
        self.last_cell = None  # Track last position to detect stuck state
        
        # Calculate initial path to destination
        if self.destination:
            self.update_path()

    def get_road_direction(self, cell):
        """
        Get the direction of the road at the given cell.
        Returns the Road agent's direction or None if no road exists.
        """
        for agent in cell.agents:
            if isinstance(agent, Road):
                return agent.direction
        return None

    def get_next_cell_by_direction(self, direction):
        """
        Calculate the next cell based on road direction.
        """
        current_pos = self.cell.coordinate
        x, y = current_pos
        
        if direction == "Up":
            next_pos = (x, y + 1)
        elif direction == "Down":
            next_pos = (x, y - 1)
        elif direction == "Left":
            next_pos = (x - 1, y)
        elif direction == "Right":
            next_pos = (x + 1, y)
        else:
            return None
        
        # Check if next position is within grid bounds
        if (0 <= next_pos[0] < self.model.grid.dimensions[0] and 
            0 <= next_pos[1] < self.model.grid.dimensions[1]):
            return self.model.grid[next_pos]
        return None

    def is_cell_blocked(self, cell):
        """
        Check if a cell is blocked by another car or an obstacle.
        Ignores cars that have reached their destination.
        """
        for agent in cell.agents:
            if isinstance(agent, Obstacle):
                return True
            if isinstance(agent, Car):
                # Don't consider it blocked if the car has reached its destination
                if not getattr(agent, 'reached_destination', False):
                    return True
        return False
    
    def is_traffic_light_red(self, cell):
        """
        Check if there's a red traffic light in the cell.
        Red light means state == False (False = Red, True = Green)
        Returns tuple: (is_red, timeToChange) or (False, 0) if no red light
        """
        for agent in cell.agents:
            if isinstance(agent, Traffic_Light):
                if agent.state == False:
                    return (True, agent.timeToChange)
        return (False, 0)
    
    def get_visible_cells(self):
        """
        Get cells visible to the car based on its current direction:
        - 2 cells ahead
        - 1 cell to each side (left and right)
        - 1 cell behind
        
        Returns a dictionary with keys: 'ahead_1', 'ahead_2', 'left', 'right', 'behind'
        Each value is either a cell object or None if out of bounds.
        """
        current_pos = self.cell.coordinate
        x, y = current_pos
        
        # Determine direction to use for calculating vision
        on_traffic_light = any(isinstance(agent, Traffic_Light) for agent in self.cell.agents)
        if on_traffic_light and self.last_direction is not None:
            direction = self.last_direction
        else:
            direction = self.get_road_direction(self.cell)
        
        if direction is None:
            return {}
        
        visible_cells = {}
        
        # Calculate offsets based on direction
        if direction == "Up":
            offsets = {
                'ahead_1': (0, 1),
                'ahead_2': (0, 2),
                'left': (-1, 0),
                'right': (1, 0),
                'behind': (0, -1)
            }
        elif direction == "Down":
            offsets = {
                'ahead_1': (0, -1),
                'ahead_2': (0, -2),
                'left': (1, 0),
                'right': (-1, 0),
                'behind': (0, 1)
            }
        elif direction == "Left":
            offsets = {
                'ahead_1': (-1, 0),
                'ahead_2': (-2, 0),
                'left': (0, -1),
                'right': (0, 1),
                'behind': (1, 0)
            }
        elif direction == "Right":
            offsets = {
                'ahead_1': (1, 0),
                'ahead_2': (2, 0),
                'left': (0, 1),
                'right': (0, -1),
                'behind': (-1, 0)
            }
        else:
            return {}
        
        # Get cells at each offset
        for position_name, (dx, dy) in offsets.items():
            new_x, new_y = x + dx, y + dy
            # Check if position is within grid bounds
            if (0 <= new_x < self.model.grid.dimensions[0] and 
                0 <= new_y < self.model.grid.dimensions[1]):
                visible_cells[position_name] = self.model.grid[(new_x, new_y)]
            else:
                visible_cells[position_name] = None
        
        return visible_cells
    
    def get_cell_info(self, cell):
        """
        Get information about what's in a cell.
        Returns a dictionary with boolean flags for different agent types.
        """
        if cell is None:
            return {'out_of_bounds': True}
        
        info = {
            'has_car': False,
            'has_obstacle': False,
            'has_red_light': False,
            'has_green_light': False,
            'has_road': False,
            'has_destination': False,
            'out_of_bounds': False
        }
        
        for agent in cell.agents:
            if isinstance(agent, Car):
                info['has_car'] = True
            elif isinstance(agent, Obstacle):
                info['has_obstacle'] = True
            elif isinstance(agent, Traffic_Light):
                if agent.state == False:
                    info['has_red_light'] = True
                else:
                    info['has_green_light'] = True
            elif isinstance(agent, Road):
                info['has_road'] = True
            elif isinstance(agent, Destination):
                info['has_destination'] = True
        
        return info
    
    def manhattan_distance(self, pos1, pos2):
        """
        Calculate Manhattan distance between two positions.
        """
        return abs(pos1[0] - pos2[0]) + abs(pos1[1] - pos2[1])
    
    def is_intersection(self, cell):
        """
        Check if a cell is an intersection by looking at adjacent roads.
        An intersection has roads in multiple different directions adjacent to it.
        """
        x, y = cell.coordinate
        adjacent_directions = set()
        
        # Check all 4 directions for roads
        for direction, (dx, dy) in [("Up", (0, 1)), ("Down", (0, -1)), ("Left", (-1, 0)), ("Right", (1, 0))]:
            nx, ny = x + dx, y + dy
            if (0 <= nx < self.model.grid.dimensions[0] and 
                0 <= ny < self.model.grid.dimensions[1]):
                neighbor = self.model.grid[(nx, ny)]
                neighbor_road_dir = self.get_road_direction(neighbor)
                if neighbor_road_dir:
                    adjacent_directions.add(neighbor_road_dir)
        
        # If we have roads in 3+ different directions nearby, it's an intersection
        return len(adjacent_directions) >= 2
    
    def get_valid_neighbors(self, cell):
        """
        Get valid neighboring cells that the car can move to.
        A valid neighbor must:
        1. Be within grid bounds
        2. Have a road or be the destination  
        3. NOT have obstacles (obstacles cannot be crossed)
        
        MOVEMENT RULES:
        - Cars can move FORWARD in the direction of their current road
        - Cars can move DIAGONALLY for lane changes (forward + left/right)
        - Cars CANNOT move purely to the SIDE (must be diagonal)
        - Cars CANNOT move BACKWARD (opposite to current direction)
        """
        neighbors = []
        current_pos = cell.coordinate
        x, y = current_pos
        
        # Get current road direction (where we are now)
        current_road_dir = self.get_road_direction(cell)
        if current_road_dir is None:
            current_road_dir = self.last_direction
        
        # If we still don't have a direction, we can't determine valid moves
        if current_road_dir is None:
            return neighbors
        
        # Define which directions are allowed based on current road direction
        # Format: current_direction -> [forward_direction, diagonal_left, diagonal_right]
        # Lane changes MUST be diagonal (forward + side)
        allowed_moves = {
            "Up": [
                ("Up", (x, y + 1)),           # Forward
                ("UpLeft", (x - 1, y + 1)),   # Diagonal left (forward + left)
                ("UpRight", (x + 1, y + 1))   # Diagonal right (forward + right)
            ],
            "Down": [
                ("Down", (x, y - 1)),         # Forward
                ("DownLeft", (x + 1, y - 1)), # Diagonal left (forward + left from down perspective)
                ("DownRight", (x - 1, y - 1)) # Diagonal right (forward + right from down perspective)
            ],
            "Left": [
                ("Left", (x - 1, y)),         # Forward
                ("LeftUp", (x - 1, y + 1)),   # Diagonal up (forward + up)
                ("LeftDown", (x - 1, y - 1))  # Diagonal down (forward + down)
            ],
            "Right": [
                ("Right", (x + 1, y)),        # Forward
                ("RightUp", (x + 1, y + 1)),  # Diagonal up (forward + up)
                ("RightDown", (x + 1, y - 1)) # Diagonal down (forward + down)
            ]
        }
        
        # Get the allowed movement positions for current road direction
        possible_moves = allowed_moves.get(current_road_dir, [])
        
        for move_name, (nx, ny) in possible_moves:
            # Check if position is within bounds
            if not (0 <= nx < self.model.grid.dimensions[0] and 
                    0 <= ny < self.model.grid.dimensions[1]):
                continue
            
            neighbor_cell = self.model.grid[(nx, ny)]
            
            # Check if neighbor is a destination (always accessible from roads)
            is_destination = any(isinstance(agent, Destination) for agent in neighbor_cell.agents)
            if is_destination:
                neighbors.append((neighbor_cell, move_name))
                continue
            
            # CRITICAL: Skip cells with obstacles - they cannot be crossed
            has_obstacle = any(isinstance(agent, Obstacle) for agent in neighbor_cell.agents)
            if has_obstacle:
                continue
            
            # Check if neighbor has a road
            neighbor_road_dir = self.get_road_direction(neighbor_cell)
            if neighbor_road_dir is None:
                continue
            
            # IMPORTANT: Validate that we can legally enter the neighbor road
            # For diagonal moves (lane changes), be more lenient - allow any compatible road
            # For forward moves, neighbor can flow in compatible directions
            
            # Define which neighbor road directions are compatible with each move type
            # Diagonal moves are more lenient to avoid blocking pathfinding
            compatible_roads = {
                "Up": ["Up", "Left", "Right"],          # Forward up
                "UpLeft": ["Up", "Left", "Right"],      # Diagonal - allow any non-Down road
                "UpRight": ["Up", "Left", "Right"],     # Diagonal - allow any non-Down road
                "Down": ["Down", "Left", "Right"],      # Forward down
                "DownLeft": ["Down", "Left", "Right"],  # Diagonal - allow any non-Up road
                "DownRight": ["Down", "Left", "Right"], # Diagonal - allow any non-Up road
                "Left": ["Left", "Up", "Down"],         # Forward left
                "LeftUp": ["Left", "Up", "Down"],       # Diagonal - allow any non-Right road
                "LeftDown": ["Left", "Up", "Down"],     # Diagonal - allow any non-Right road
                "Right": ["Right", "Up", "Down"],       # Forward right
                "RightUp": ["Right", "Up", "Down"],     # Diagonal - allow any non-Left road
                "RightDown": ["Right", "Up", "Down"]    # Diagonal - allow any non-Left road
            }
            
            # Check if the neighbor's road direction is compatible with our movement
            allowed_neighbor_dirs = compatible_roads.get(move_name, [])
            if neighbor_road_dir not in allowed_neighbor_dirs:
                continue
            
            # Add this neighbor as a valid option
            neighbors.append((neighbor_cell, move_name))
        
        return neighbors
    
    def get_pathfinding_neighbors(self, cell):
        """
        Get valid neighboring cells for pathfinding purposes.
        Unlike get_valid_neighbors (used for actual movement), this method explores
        based on the CELL's road direction, not the car's current direction.
        This allows A* to explore the entire road network.
        
        A valid neighbor must:
        1. Be within grid bounds
        2. Have a road or be the destination
        3. NOT have obstacles
        4. Be reachable following the road's direction (including diagonal lane changes)
        """
        neighbors = []
        current_pos = cell.coordinate
        x, y = current_pos
        
        # Get the road direction of the cell we're exploring FROM
        cell_road_dir = self.get_road_direction(cell)
        
        # If this cell has no road direction, it might be the destination
        if cell_road_dir is None:
            # Check if it's the destination
            is_dest = any(isinstance(agent, Destination) for agent in cell.agents)
            if is_dest:
                # From destination, we can't go anywhere (this is the goal)
                return neighbors
            # If not destination and no road, we can't explore from here
            return neighbors
        
        # Define which moves are allowed based on the CELL's road direction
        # Include diagonal moves for lane changes
        allowed_moves = {
            "Up": [
                ("Up", (x, y + 1)),
                ("UpLeft", (x - 1, y + 1)),
                ("UpRight", (x + 1, y + 1))
            ],
            "Down": [
                ("Down", (x, y - 1)),
                ("DownLeft", (x + 1, y - 1)),
                ("DownRight", (x - 1, y - 1))
            ],
            "Left": [
                ("Left", (x - 1, y)),
                ("LeftUp", (x - 1, y + 1)),
                ("LeftDown", (x - 1, y - 1))
            ],
            "Right": [
                ("Right", (x + 1, y)),
                ("RightUp", (x + 1, y + 1)),
                ("RightDown", (x + 1, y - 1))
            ]
        }
        
        possible_moves = allowed_moves.get(cell_road_dir, [])
        
        for move_name, (nx, ny) in possible_moves:
            # Check bounds
            if not (0 <= nx < self.model.grid.dimensions[0] and 
                    0 <= ny < self.model.grid.dimensions[1]):
                continue
            
            neighbor_cell = self.model.grid[(nx, ny)]
            
            # Check if neighbor is a destination
            is_destination = any(isinstance(agent, Destination) for agent in neighbor_cell.agents)
            if is_destination:
                neighbors.append((neighbor_cell, move_name))
                continue
            
            # Skip obstacles
            has_obstacle = any(isinstance(agent, Obstacle) for agent in neighbor_cell.agents)
            if has_obstacle:
                continue
            
            # Check if neighbor has a road
            neighbor_road_dir = self.get_road_direction(neighbor_cell)
            if neighbor_road_dir is None:
                continue
            
            # Validate compatibility: prevent head-on collisions
            # For diagonal moves, be more lenient - as long as not head-on collision
            # For straight moves, use strict compatibility
            compatible_roads = {
                "Up": ["Up", "Left", "Right"],
                "UpLeft": ["Up", "Left", "Right"],      # Allow any non-Down road
                "UpRight": ["Up", "Left", "Right"],     # Allow any non-Down road
                "Down": ["Down", "Left", "Right"],
                "DownLeft": ["Down", "Left", "Right"],  # Allow any non-Up road
                "DownRight": ["Down", "Left", "Right"], # Allow any non-Up road
                "Left": ["Left", "Up", "Down"],
                "LeftUp": ["Left", "Up", "Down"],       # Allow any non-Right road
                "LeftDown": ["Left", "Up", "Down"],     # Allow any non-Right road
                "Right": ["Right", "Up", "Down"],
                "RightUp": ["Right", "Up", "Down"],     # Allow any non-Left road
                "RightDown": ["Right", "Up", "Down"]    # Allow any non-Left road
            }
            
            allowed_neighbor_dirs = compatible_roads.get(move_name, [])
            allowed_neighbor_dirs = compatible_roads.get(move_name, [])
            if neighbor_road_dir not in allowed_neighbor_dirs:
                continue
            
            neighbors.append((neighbor_cell, move_name))
        
        return neighbors
    
    def a_star_pathfinding(self):
        """
        Compute the optimal path from current position to destination using A* algorithm.
        Returns a list of cells representing the path, or empty list if no path found.
        OPTIMIZED FOR THROUGHPUT: Better congestion avoidance, smarter cost calculations.
        """
        if self.destination is None:
            return []
        
        start = self.cell
        goal = self.destination.cell
        
        # Priority queue: (f_score, counter, cell, path)
        # counter is used to break ties in priority queue
        counter = 0
        open_set = []
        heapq.heappush(open_set, (0, counter, start, [start]))
        
        # Keep track of visited cells to avoid revisiting
        visited = set()
        
        # g_score: cost from start to each cell
        g_score = {start: 0}
        
        # Track best f_score for each cell to avoid exploring worse paths
        f_score_map = {start: 0}
        
        max_iterations = 5000  
        iterations = 0
        
        while open_set and iterations < max_iterations:
            iterations += 1
            current_f, _, current_cell, path = heapq.heappop(open_set)
            
            # If we reached the goal, return the path
            if current_cell == goal:
                return path
            
            # Skip if already visited (closed set)
            if current_cell in visited:
                continue
            
            # Skip if we've found a better path to this cell already
            if current_cell in f_score_map and current_f > f_score_map[current_cell]:
                continue
            
            visited.add(current_cell)
            
            # Explore neighbors
            neighbors = self.get_pathfinding_neighbors(current_cell)
            
            for neighbor_cell, move_name in neighbors:
                if neighbor_cell in visited:
                    continue
                
                # Calculate cost to reach this neighbor
                # Diagonal moves cost more (approximating sqrt(2) ≈ 1.4)
                if len(move_name) > 5:  # Diagonal moves have longer names
                    move_cost = 1.4  # Diagonal cost
                else:
                    move_cost = 1  # Straight move cost
                
                # THROUGHPUT OPTIMIZATION: Strongly avoid congested areas
                # Count all cars in neighbor to assess congestion level
                car_count = sum(1 for agent in neighbor_cell.agents if isinstance(agent, Car) and not getattr(agent, 'reached_destination', False))
                
                if car_count > 0:
                    # Heavy penalty for congested cells - encourages spreading out
                    move_cost += car_count * 4  # Strong congestion penalty
                
                # Smart traffic light handling for throughput
                is_red, time_to_change = self.is_traffic_light_red(neighbor_cell)
                if is_red:
                    # If light will change soon, small penalty. If not, larger penalty.
                    if time_to_change <= 2:
                        move_cost += 1  # About to change, minimal penalty
                    else:
                        move_cost += time_to_change * 0.5  # Scale with wait time
                
                tentative_g_score = g_score[current_cell] + move_cost
                
                # If this path to neighbor is better than any previous one
                if neighbor_cell not in g_score or tentative_g_score < g_score[neighbor_cell]:
                    g_score[neighbor_cell] = tentative_g_score
                    
                    # Calculate f_score = g_score + h_score (heuristic)
                    h_score = self.manhattan_distance(neighbor_cell.coordinate, goal.coordinate)
                    f_score = tentative_g_score + h_score
                    
                    # Only add to open set if this is better than previous f_score
                    if neighbor_cell not in f_score_map or f_score < f_score_map[neighbor_cell]:
                        f_score_map[neighbor_cell] = f_score
                        counter += 1
                        new_path = path + [neighbor_cell]
                        heapq.heappush(open_set, (f_score, counter, neighbor_cell, new_path))
        
        # No path found after exhausting all options
        return []
    
    def update_path(self):
        """
        Recalculate the path to the destination.
        Called when obstacles or intersections are detected.
        OPTIMIZED: Reduced debug output for performance.
        """
        self.path = self.a_star_pathfinding()
        self.path_index = 0
        
        # Minimal debug output only on initial pathfinding failure
        if not self.path and self.last_direction is None:
            start_pos = self.cell.coordinate
            dest_pos = self.destination.cell.coordinate if self.destination else "None"
            print(f"Car {self.unique_id}: No initial path from {start_pos} to {dest_pos}")
    
    def get_next_cell_from_path(self):
        """
        Get the next cell to move to based on the computed path.
        Returns None if no valid path or already at destination.
        """
        if not self.path or self.path_index >= len(self.path):
            return None
        
        # The path includes current position, so we need the next one
        if self.path_index + 1 < len(self.path):
            return self.path[self.path_index + 1]
        
        return None

    def step(self):
        """ 
        Move the car following the optimal path using A* algorithm, respecting traffic lights and obstacles.
        """
        # Check if already at destination
        if self.destination and self.cell == self.destination.cell:
            self.reached_destination = True
            
            # Increment the model's counter for cars that reached destination
            self.model.increment_cars_reached_destination()
            
            # Remove car from simulation when it reaches destination
            # Remove from the cell's agent list
            if self in self.cell.agents:
                self.cell.agents.remove(self)
            
            # Remove from the model's agent collection
            if self in self.model.agents:
                self.model.agents.remove(self)
                
            return
        
        # If we don't have a path yet recalculate the path
        if not self.path:
            self.update_path()
            if not self.path:
                # No path found, stay in place
                return
        
        # Update path index to match current position
        try:
            if self.cell in self.path:
                self.path_index = self.path.index(self.cell)
        except ValueError:
            # Current cell not in path, recalculate
            self.update_path()
            if not self.path:
                return
        
        # Get the next cell from the path
        next_cell = self.get_next_cell_from_path()
        
        if next_cell is None:
            # End of path - might be at destination, check on next step
            return
        
        # Check if next cell IS the destination - if so, always move there
        is_next_destination = (self.destination and next_cell == self.destination.cell)
        
        if not is_next_destination:
            # Check if next cell has a red traffic light (state = False means red)
            is_red, time_to_change = self.is_traffic_light_red(next_cell)
            if is_red:
                # THROUGHPUT OPTIMIZATION: If light will change very soon, wait patiently
                # But if it just changed, consider alternate route
                if time_to_change > 8:  # Light just turned red
                    # Check if we've been waiting a while - if so, try alternate route
                    if self.stuck_counter >= 5:
                        self.update_path()
                        self.stuck_counter = 0
                # Stop before entering the red light
                return
            
            # THROUGHPUT OPTIMIZATION: Look ahead to avoid moving into heavy congestion
            # Count cars in next cell and cells ahead
            car_count_next = sum(1 for agent in next_cell.agents 
                                if isinstance(agent, Car) and not getattr(agent, 'reached_destination', False))
            
            # If next cell is heavily congested (2+ cars), consider waiting or rerouting
            if car_count_next >= 2:
                # If we've been trying to enter congestion for a while, find alternate route
                if self.stuck_counter >= 2:
                    self.update_path()
                    self.stuck_counter = 0
                else:
                    # Wait one turn to see if congestion clears
                    self.stuck_counter += 1
                    self.last_cell = self.cell
                    return
            
        # Check if next cell is blocked by another car or obstacle
        if self.is_cell_blocked(next_cell):
            # Cell is blocked, wait or recalculate path
            # Check if blocking is temporary (another car) or permanent (obstacle)
            has_obstacle = any(isinstance(agent, Obstacle) for agent in next_cell.agents)
            if has_obstacle:
                # Permanent obstacle, need to recalculate path immediately
                self.update_path()
            else:
                # THROUGHPUT OPTIMIZATION: Smart stuck detection and aggressive rerouting
                # Track if we're stuck in the same position
                if self.last_cell == self.cell:
                    self.stuck_counter += 1
                else:
                    self.stuck_counter = 0
                
                # If stuck for 3+ steps, aggressively find alternate route
                if self.stuck_counter >= 3:
                    self.update_path()
                    self.stuck_counter = 0  # Reset after rerouting
                # If mildly stuck (2 steps), occasionally try alternate route
                elif self.stuck_counter >= 2 and self.model.steps % 3 == 0:
                    self.update_path()
            
            # Remember this position for next step
            self.last_cell = self.cell
            # If it's just another car, wait for it to move
            return
        
        # Calculate direction for this move
        current_pos = self.cell.coordinate
        next_pos = next_cell.coordinate
        dx = next_pos[0] - current_pos[0]
        dy = next_pos[1] - current_pos[1]
        
        # Determine direction (including diagonal moves)
        if dx > 0 and dy > 0:
            direction = "RightUp"  # Diagonal
        elif dx > 0 and dy < 0:
            direction = "RightDown"  # Diagonal
        elif dx < 0 and dy > 0:
            direction = "LeftUp"  # Diagonal
        elif dx < 0 and dy < 0:
            direction = "LeftDown"  # Diagonal
        elif dx > 0:
            direction = "Right"
        elif dx < 0:
            direction = "Left"
        elif dy > 0:
            direction = "Up"
        elif dy < 0:
            direction = "Down"
        else:
            direction = None
        
        # Move to next cell
        if self in self.cell.agents:
            self.cell.agents.remove(self)
        self.cell = next_cell
        if self not in self.cell.agents:
            self.cell.agents.append(self)
        self.last_direction = direction
        self.path_index += 1
        
        # Track successful movement - reset stuck counter
        self.stuck_counter = 0
        self.last_cell = self.cell

class Traffic_Light(FixedAgent):
    """
    Traffic light. Where the traffic lights are in the grid.
    """
    def __init__(self, model, cell, state = False, timeToChange = 10):
        """
        Creates a new Traffic light.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            state: Whether the traffic light is green or red
            timeToChange: After how many step should the traffic light change color 
        """
        super().__init__(model)
        self.cell = cell
        self.state = state
        self.timeToChange = timeToChange

    def step(self):
        """ 
        To change the state (green or red) of the traffic light in case you consider the time to change of each traffic light.
        """
        # Skip step 0 to avoid immediate toggle, then toggle every timeToChange steps
        if self.model.steps > 0 and self.model.steps % self.timeToChange == 0:
            self.state = not self.state

class Destination(FixedAgent):
    """
    Destination agent. Where each car should go.
    """
    def __init__(self, model, cell):
        """
        Creates a new destination agent
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Obstacle(FixedAgent):
    """
    Obstacle agent. Just to add obstacles to the grid.
    """
    def __init__(self, model, cell):
        """
        Creates a new obstacle.
        
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Road(FixedAgent):
    """
    Road agent. Determines where the cars can move, and in which direction.
    """
    def __init__(self, model, cell, direction= "Left"):
        """
        Creates a new road.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell
        self.direction = direction