// Set up SVG dimensions
const svg = d3.select("#graph");
const width = svg.node().getBoundingClientRect().width;
const height = svg.node().getBoundingClientRect().height;

// Create arrow marker for directed edges
svg.append("defs").append("marker")
  .attr("id", "arrowhead")
  .attr("viewBox", "0 -5 10 10")
  .attr("refX", 12.5)
  .attr("refY", 0)
  .attr("markerWidth", 6)
  .attr("markerHeight", 6)
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,-5L10,0L0,5")
  .attr("fill", "#999");

// Create container groups
const g = svg.append("g");
const moduleGroup = g.append("g").attr("class", "modules");
const linkGroup = g.append("g").attr("class", "links");
const nodeGroup = g.append("g").attr("class", "nodes");

// Add zoom behavior
const zoom = d3.zoom()
  .scaleExtent([0.1, 4])
  .on("zoom", (event) => {
    g.attr("transform", event.transform);
  });

svg.call(zoom);

// Store original data for filtering
let originalEdges = [];
let originalNodes = [];
let allNodesMap = new Map();

// Initialize Tom Select instances
let sourceSelect = null;
let sinkSelect = null;
let moduleSelect = null;

// Handle file upload
document.getElementById("fileInput").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const jsonContent = e.target.result;
      loadGraphData(jsonContent);
    };
    reader.readAsText(file);
  }
});

// Function to initialize Tom Select for filters
function getModuleFromId(id) {
  // Module is everything up to the last '.'
  const lastDot = id.lastIndexOf('.');
  if (lastDot === -1) return null; // No module part
  return id.substring(0, lastDot);
}

// Function to initialize Tom Select for filters
function initializeFilters(nodes) {
  // Destroy existing instances if they exist
  if (sourceSelect) {
    sourceSelect.destroy();
  }
  if (sinkSelect) {
    sinkSelect.destroy();
  }
  if (moduleSelect) {
    moduleSelect.destroy();
  }

  // Sort nodes alphabetically for easier searching
  const sortedNodes = nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
  const options = sortedNodes.map(n => ({ value: n.id, text: n.id }));

  // Build unique module list for moduleSelect
  const moduleSet = new Set();
  sortedNodes.forEach(n => {
    const mod = getModuleFromId(n.id);
    if (mod) moduleSet.add(mod);
  });
  const moduleOptions = Array.from(moduleSet).sort().map(m => ({ value: m, text: m }));

  // Initialize source filter
  sourceSelect = new TomSelect('#sourceFilter', {
    plugins: ['remove_button'],
    maxItems: null,
    valueField: 'value',
    labelField: 'text',
    searchField: 'text',
    options: options,
    placeholder: 'Filter to callees of these functions...',
    onChange: function() {
      // Auto-apply filters when selection changes
      applyFilters();
    }
  });

  // Initialize sink filter
  sinkSelect = new TomSelect('#sinkFilter', {
    plugins: ['remove_button'],
    maxItems: null,
    valueField: 'value',
    labelField: 'text',
    searchField: 'text',
    options: options,
    placeholder: 'Filter to callers of these functions...',
    onChange: function() {
      // Auto-apply filters when selection changes
      applyFilters();
    }
  });

  // Initialize exclude filter
  moduleSelect = new TomSelect('#excludeFilter', {
    plugins: ['remove_button'],
    maxItems: null,
    valueField: 'value',
    labelField: 'text',
    searchField: 'text',
    options: moduleOptions,
    placeholder: 'Show only nodes from these modules...',
    onChange: function() {
      // Auto-apply filters when selection changes
      applyFilters();
    }
  });
}

// Helper function to format node identifier
function formatNodeId(node) {
  // Concatenate module parts with function using periods
  // e.g., {"module": ["Foo", "Bar"], "function": "asdf/2"} -> "Foo.Bar.asdf/2"
  const modulePath = node.module.join('.');
  return `${modulePath}.${node.function}`;
}

// Helper function to create node key for comparison
function getNodeKey(node) {
  // Create a unique key for the node based on module and function
  return JSON.stringify({ module: node.module, function: node.function });
}

// Function to load and parse JSON data
function loadGraphData(jsonContent) {
  try {
    const data = JSON.parse(jsonContent);

    if (!data.nodes || !data.edges) {
      document.getElementById("info").textContent = "Invalid JSON format. Expected 'nodes' and 'edges' properties.";
      return;
    }

    allNodesMap = new Map();
    const edges = [];

    // Process nodes - create formatted versions with IDs
    data.nodes.forEach(node => {
      const nodeKey = getNodeKey(node);
      const formattedNode = {
        id: formatNodeId(node),
        module: node.module,
        function: node.function,
        originalKey: nodeKey
      };
      allNodesMap.set(formattedNode.id, formattedNode);
    });

    // Process edges
    data.edges.forEach(edge => {
      const sourceId = formatNodeId(edge.source);
      const targetId = formatNodeId(edge.target);

      const sourceNode = allNodesMap.get(sourceId);
      const targetNode = allNodesMap.get(targetId);

      if (sourceNode && targetNode) {
        edges.push({
          source: sourceNode,
          target: targetNode
        });
      }
    });

    if (edges.length === 0) {
      document.getElementById("info").textContent = "No valid edges found in JSON file.";
      return;
    }

    // Store original data
    originalEdges = edges;
    originalNodes = Array.from(allNodesMap.values());

    // Initialize the filter dropdowns with all nodes
    initializeFilters(originalNodes);

    // Initial visualization with no filters
    clearFilters();
  } catch (error) {
    document.getElementById("info").textContent = `Error parsing JSON: ${error.message}`;
    console.error("JSON parsing error:", error);
  }
}

// Function to get all transitive callees of a node (forward traversal)
function getTransitiveCallees(startNode, edges) {
  const callees = new Set();
  const queue = [startNode];

  while (queue.length > 0) {
    const current = queue.shift();

    edges.forEach(edge => {
      if (edge.source.id === current && !callees.has(edge.target.id)) {
        callees.add(edge.target.id);
        queue.push(edge.target.id);
      }
    });
  }

  return callees;
}

// Function to get all transitive callers of a node (backward traversal)
function getTransitiveCallers(startNode, edges) {
  const callers = new Set();
  const queue = [startNode];

  while (queue.length > 0) {
    const current = queue.shift();

    edges.forEach(edge => {
      if (edge.target.id === current && !callers.has(edge.source.id)) {
        callers.add(edge.source.id);
        queue.push(edge.source.id);
      }
    });
  }

  return callers;
}

// Apply source and sink filters
function applyFilters() {
  if (!sourceSelect || !sinkSelect || !moduleSelect) {
    return; // Selects not initialized yet
  }

  const sourceFilters = sourceSelect.getValue();
  const sinkFilters = sinkSelect.getValue();
  const moduleFilters = moduleSelect.getValue();

  if (moduleFilters.length === 0) {
    visualizeCallGraph([], []);
    return;
  }

  let filteredNodes = new Set(originalNodes.map(n => n.id));

  // Apply source filters (keep only callees of any source)
  if (sourceFilters.length > 0) {
    const allCallees = new Set();

    sourceFilters.forEach(sourceFilter => {
      if (!allNodesMap.has(sourceFilter)) {
        return;
      }

      const callees = getTransitiveCallees(sourceFilter, originalEdges);
      callees.add(sourceFilter); // Include the source itself
      callees.forEach(c => allCallees.add(c));
    });

    filteredNodes = new Set([...filteredNodes].filter(n => allCallees.has(n)));
  }

  // Apply sink filters (keep only callers of any sink)
  if (sinkFilters.length > 0) {
    const allCallers = new Set();

    sinkFilters.forEach(sinkFilter => {
      if (!allNodesMap.has(sinkFilter)) {
        return;
      }

      const callers = getTransitiveCallers(sinkFilter, originalEdges);
      callers.add(sinkFilter); // Include the sink itself
      callers.forEach(c => allCallers.add(c));
    });

    filteredNodes = new Set([...filteredNodes].filter(n => allCallers.has(n)));
  }

  // Apply module include filters (keep only nodes belonging to selected modules)
  const includedModules = new Set(moduleFilters);
  filteredNodes = new Set(
    [...filteredNodes].filter(id => {
      const mod = getModuleFromId(id);
      return mod && includedModules.has(mod);
    })
  );

  // Filter nodes and edges
  const nodes = originalNodes.filter(n => filteredNodes.has(n.id));
  const edges = originalEdges.filter(e =>
    filteredNodes.has(e.source.id) && filteredNodes.has(e.target.id)
  );

  visualizeCallGraph(nodes, edges);
}

// Clear all filters
function clearFilters() {
  if (sourceSelect) {
    sourceSelect.clear();
  }
  if (sinkSelect) {
    sinkSelect.clear();
  }
  if (moduleSelect) {
    moduleSelect.clear();
  }
  visualizeCallGraph([], []);
}

function rankNodes(rootNodes, adjacency) {
  const levels = new Map();

  // Perform DFS from each root node (level 0)
  rootNodes.forEach(node => {
    rankNodes2(node.id, 0, levels, adjacency, new Set());
  });

  return levels;
}

function rankNodes2(id, level, levels, adjacency, visited) {
  if (visited.has(id)) return;

  const newVisited = new Set(visited.values());
  newVisited.add(id);

  const currentLevel = levels.get(id);
  if (currentLevel === undefined || currentLevel < level) {
    levels.set(id, level);
  }

  const neighbors = adjacency.get(id) || [];
  neighbors.forEach(targetId => rankNodes2(targetId, level + 1, levels, adjacency, newVisited));
}

// Function to visualize the call graph
function visualizeCallGraph(nodes, edges) {
  if (!nodes || nodes.length === 0) {
    document.getElementById("info").textContent = "No nodes to visualize.";
    return;
  }

  const nodeArray = nodes.map(n => { return { id: n.id } });
  const edgesArray = edges.map(e => { return { source: e.source.id, target: e.target.id} });

  // Compute hierarchical levels using BFS from root nodes
  // Root nodes are those that never appear as targets
  const targetSet = new Set(edgesArray.map(e => e.target));
  const rootNodes = nodeArray.filter(n => !targetSet.has(n.id));

  // Build adjacency list
  const adjacency = new Map();
  nodeArray.forEach(n => adjacency.set(n.id, []));
  edgesArray.forEach(e => adjacency.get(e.source).push(e.target));

  levels = rankNodes(rootNodes, adjacency);

  // Assign level to nodes (nodes in cycles or unreachable get max level + 1)
  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  nodeArray.forEach(node => {
    node.level = levels.get(node.id) ?? (maxLevel + 1);
  });

  const numLevels = maxLevel + 2;
  const levelHeight = Math.max(150, height / numLevels);

  // Update info
  const rootCount = rootNodes.length;
  const sourceFilters = sourceSelect ? sourceSelect.getValue() : [];
  const sinkFilters = sinkSelect ? sinkSelect.getValue() : [];
  const moduleFilters = moduleSelect ? moduleSelect.getValue() : [];
  let filterText = "";
  if (sourceFilters.length > 0 || sinkFilters.length > 0 || moduleFilters.length > 0) {
    filterText = " (filtered";
    if (sourceFilters.length > 0) {
      filterText += ` from ${sourceFilters.length} source${sourceFilters.length > 1 ? 's' : ''}`;
    }
    if (sinkFilters.length > 0) {
      if (sourceFilters.length > 0) filterText += " and";
      filterText += ` to ${sinkFilters.length} sink${sinkFilters.length > 1 ? 's' : ''}`;
    }
    if (moduleFilters.length > 0) {
      if (sourceFilters.length > 0 || sinkFilters.length > 0) filterText += " and";
      filterText += ` in ${moduleFilters.length} module${moduleFilters.length > 1 ? 's' : ''}`;
    }
    filterText += ")";
  }
  document.getElementById("info").textContent =
    `Visualizing ${nodeArray.length} functions with ${edges.length} calls. ${rootCount} root functions across ${numLevels} levels.${filterText}`;

  // Clear previous graph
  linkGroup.selectAll("*").remove();
  nodeGroup.selectAll("*").remove();

  // Create force simulation with hierarchical constraints
  const simulation = d3.forceSimulation(nodeArray)
    .force("link", d3.forceLink(edgesArray).id(d => d.id).distance(100))
    .force("charge", d3.forceManyBody().strength(-500))
  /* .force("x", d3.forceX(width / 2).strength(0.05)) */
    .force("y", d3.forceY(d => d.level * levelHeight + 50).strength(1))

  // Drag functions (must be defined before nodes are created)
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.1).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Draw links
  const link = linkGroup.selectAll("path")
    .data(edgesArray)
    .enter()
    .append("path")
    .attr("class", "link");

  // Draw nodes
  const node = nodeGroup.selectAll("g")
    .data(nodeArray)
    .enter()
    .append("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  node.append("circle")
    .attr("r", 8);

  node.append("text")
    .attr("dx", 12)
    .attr("dy", 4)
    .text(d => d.id);

  // Add tooltip on hover
  node.append("title")
    .text(d => d.id);

  // Update positions on simulation tick
  simulation.on("tick", () => {
    link.attr("d", d => {
      return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`;
    });

    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
}
