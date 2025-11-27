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
        """
        for agent in cell.agents:
            if isinstance(agent, Car) or isinstance(agent, Obstacle):
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
        return len(adjacent_directions) >= 3
    
    def get_valid_neighbors(self, cell):
        """
        Get valid neighboring cells that the car can move to.
        A valid neighbor must:
        1. Be within grid bounds
        2. Have a road or be the destination  
        3. NOT have obstacles (obstacles cannot be crossed)
        
        MOVEMENT RULES:
        - Cars can move FORWARD in the direction of their current road
        - Cars can move to the SIDES (left/right relative to current direction) for lane changes
        - Cars CANNOT move BACKWARD (opposite to current direction)
        
        Example: If current road direction is "Up":
        - Can move: Up (forward), Left (side), Right (side)
        - Cannot move: Down (backward)
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
        # Format: current_direction -> (forward, left_side, right_side)
        allowed_directions = {
            "Up": ["Up", "Left", "Right"],      # Forward: Up, Sides: Left/Right, Backward: Down (not allowed)
            "Down": ["Down", "Left", "Right"],  # Forward: Down, Sides: Left/Right, Backward: Up (not allowed)
            "Left": ["Left", "Up", "Down"],     # Forward: Left, Sides: Up/Down, Backward: Right (not allowed)
            "Right": ["Right", "Up", "Down"]    # Forward: Right, Sides: Up/Down, Backward: Left (not allowed)
        }
        
        # Get the allowed movement directions for current road direction
        valid_move_directions = allowed_directions.get(current_road_dir, [])
        
        # Check all four directions, but only add if they're in the allowed list
        possible_moves = [
            ("Up", (x, y + 1)),
            ("Down", (x, y - 1)),
            ("Left", (x - 1, y)),
            ("Right", (x + 1, y))
        ]
        
        for move_direction, (nx, ny) in possible_moves:
            # Skip if this direction is not allowed (e.g., moving backward)
            if move_direction not in valid_move_directions:
                continue
            
            # Check if position is within bounds
            if not (0 <= nx < self.model.grid.dimensions[0] and 
                    0 <= ny < self.model.grid.dimensions[1]):
                continue
            
            neighbor_cell = self.model.grid[(nx, ny)]
            
            # Check if neighbor is a destination (always accessible from roads)
            is_destination = any(isinstance(agent, Destination) for agent in neighbor_cell.agents)
            if is_destination:
                neighbors.append((neighbor_cell, move_direction))
                continue
            
            # CRITICAL: Skip cells with obstacles - they cannot be crossed
            has_obstacle = any(isinstance(agent, Obstacle) for agent in neighbor_cell.agents)
            if has_obstacle:
                continue
            
            # Check if neighbor has a road
            neighbor_road_dir = self.get_road_direction(neighbor_cell)
            if neighbor_road_dir is None:
                continue
            
            # Add this neighbor as a valid option
            neighbors.append((neighbor_cell, move_direction))
        
        return neighbors
    
    def a_star_pathfinding(self):
        """
        Compute the optimal path from current position to destination using A* algorithm.
        Returns a list of cells representing the path, or empty list if no path found.
        """
        if self.destination is None:
            return []
        
        start = self.cell
        goal = self.destination.cell
        
        # Debug: Check initial neighbors
        initial_neighbors = self.get_valid_neighbors(start)
        if not initial_neighbors:
            print(f"Car {self.unique_id}: No valid neighbors from start {start.coordinate}, road_dir={self.get_road_direction(start)}")
            return []
        else:
            neighbor_coords = [n[0].coordinate for n in initial_neighbors]
            neighbor_dirs = [n[1] for n in initial_neighbors]
            print(f"Car {self.unique_id}: Found {len(initial_neighbors)} neighbors from start: {list(zip(neighbor_coords, neighbor_dirs))}")
        
        # Debug: Check what roads surround the start
        x, y = start.coordinate
        print(f"Car {self.unique_id}: Checking surrounding roads of start {start.coordinate}:")
        for direction, (dx, dy) in [("Up", (0, 1)), ("Down", (0, -1)), ("Left", (-1, 0)), ("Right", (1, 0))]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < self.model.grid.dimensions[0] and 0 <= ny < self.model.grid.dimensions[1]:
                neighbor = self.model.grid[(nx, ny)]
                road_dir = self.get_road_direction(neighbor)
                has_obs = any(isinstance(agent, Obstacle) for agent in neighbor.agents)
                print(f"  {direction} ({nx},{ny}): road={road_dir}, obstacle={has_obs}")
        
        # Debug: Check if goal has any roads adjacent to it
        goal_neighbors = []
        gx, gy = goal.coordinate
        for dx, dy in [(0,1), (0,-1), (1,0), (-1,0)]:
            nx, ny = gx + dx, gy + dy
            if 0 <= nx < self.model.grid.dimensions[0] and 0 <= ny < self.model.grid.dimensions[1]:
                neighbor = self.model.grid[(nx, ny)]
                if any(isinstance(agent, Road) for agent in neighbor.agents):
                    goal_neighbors.append((nx, ny))
        print(f"Car {self.unique_id}: Goal {goal.coordinate} has {len(goal_neighbors)} adjacent roads: {goal_neighbors}")
        
        # Priority queue: (f_score, counter, cell, path)
        # counter is used to break ties in priority queue
        counter = 0
        open_set = []
        heapq.heappush(open_set, (0, counter, start, [start]))
        
        # Keep track of visited cells to avoid revisiting
        visited = set()
        
        # g_score: cost from start to each cell
        g_score = {start: 0}
        
        max_iterations = 10000  # Prevent infinite loops
        iterations = 0
        
        while open_set and iterations < max_iterations:
            iterations += 1
            current_f, _, current_cell, path = heapq.heappop(open_set)
            
            # If we reached the goal, return the path
            if current_cell == goal:
                return path
            
            # Skip if already visited
            if current_cell in visited:
                continue
            
            visited.add(current_cell)
            
            # Explore neighbors
            neighbors = self.get_valid_neighbors(current_cell)
            
            for neighbor_cell, direction in neighbors:
                if neighbor_cell in visited:
                    continue
                
                # Calculate cost to reach this neighbor
                # Base cost is 1, roads are strictly directional 
                move_cost = 1
                
                # Check if neighbor has cars (dynamic obstacles)
                has_car = any(isinstance(agent, Car) for agent in neighbor_cell.agents)
                if has_car:
                    # Small penalty for cells with cars (they might move)
                    move_cost += 3
                
                # Check for traffic lights - different penalties based on timeToChange
                is_red, time_to_change = self.is_traffic_light_red(neighbor_cell)
                if is_red:
                    # S (timeToChange = 15) adds 15, s (timeToChange = 7) adds 7
                    # This reflects how long the light stays red
                    move_cost += time_to_change
                
                tentative_g_score = g_score[current_cell] + move_cost
                
                # If this path to neighbor is better than any previous one
                if neighbor_cell not in g_score or tentative_g_score < g_score[neighbor_cell]:
                    g_score[neighbor_cell] = tentative_g_score
                    
                    # Calculate f_score = g_score + h_score (heuristic)
                    h_score = self.manhattan_distance(neighbor_cell.coordinate, goal.coordinate)
                    f_score = tentative_g_score + h_score
                    
                    counter += 1
                    new_path = path + [neighbor_cell]
                    heapq.heappush(open_set, (f_score, counter, neighbor_cell, new_path))
        
        # No path found after exhausting all options
        print(f"Car {self.unique_id}: Exhausted search after {iterations} iterations, visited {len(visited)} cells")
        return []
    
    def update_path(self):
        """
        Recalculate the path to the destination.
        Called when obstacles or intersections are detected.
        """
        self.path = self.a_star_pathfinding()
        self.path_index = 0
        
        if not self.path:
            # Debug: print more info about why no path was found
            start_pos = self.cell.coordinate
            dest_pos = self.destination.cell.coordinate if self.destination else "None"
            road_dir = self.get_road_direction(self.cell)
            print(f"Car {self.unique_id}: No path found from {start_pos} to {dest_pos}, road_dir={road_dir}, last_dir={self.last_direction}")
        else:
            print(f"Car {self.unique_id}: Path found with {len(self.path)} steps")
    
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
            print(f"Car {self.unique_id}: Reached destination at {self.cell.coordinate}, removing from simulation")
            # Remove car from simulation when it reaches destination
            # First, explicitly remove from the cell's agent list
            if self in self.cell.agents:
                self.cell.agents.remove(self)
                print(f"Car {self.unique_id}: Removed from cell agents")
            
            # Then remove from the model's agent collection
            if self in self.model.agents:
                self.model.agents.remove(self)
                print(f"Car {self.unique_id}: Removed from model agents")
                
            # Also try to remove from grid if possible (for safety)
            try:
                self.model.grid.remove_agent(self)
                print(f"Car {self.unique_id}: Removed from grid using remove_agent")
            except Exception as e:
                pass
                
            return
        
        # If we don't have a path yet recalculate the path
        if not self.path:
            self.update_path()
            if not self.path:
                # No path found, stay in place
                print(f"Car {self.unique_id}: No path found to destination {self.destination.cell.coordinate} from {self.cell.coordinate}")
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
            # End of path or no path, recalculate
            self.update_path()
            return
        
        # Check if next cell has a red traffic light (state = False means red)
        is_red, _ = self.is_traffic_light_red(next_cell)
        if is_red:
            # Stop before entering the red light
            return
        
        # Check if next cell is blocked by another car or obstacle
        if self.is_cell_blocked(next_cell):
            # Cell is blocked, wait or recalculate path
            # Check if blocking is temporary (another car) or permanent (obstacle)
            has_obstacle = any(isinstance(agent, Obstacle) for agent in next_cell.agents)
            if has_obstacle:
                # Permanent obstacle, need to recalculate path
                self.update_path()
            # If it's just another car, wait for it to move
            return
        
        # Calculate direction for this move
        current_pos = self.cell.coordinate
        next_pos = next_cell.coordinate
        dx = next_pos[0] - current_pos[0]
        dy = next_pos[1] - current_pos[1]
        
        if dx > 0:
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