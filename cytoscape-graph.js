// Global variables
let cy = null;
let allElements = [];
let visibleElements = [];

// Register the cose-bilkent layout extension
if (typeof cytoscape !== 'undefined' && typeof cytoscapeCoseBilkent !== 'undefined') {
  cytoscape.use(cytoscapeCoseBilkent);
}

// Initialize Cytoscape instance
function initializeCytoscape() {
  cy = cytoscape({
    container: document.getElementById('cy'),

    style: [
      // Style for module containers (compound nodes)
      {
        selector: 'node[type="module"]',
        style: {
          'background-color': '#e3f2fd',
          'background-opacity': 0.3,
          'border-width': 2,
          'border-color': '#1976d2',
          'border-style': 'solid',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'text-margin-y': -10,
          'font-size': '14px',
          'font-weight': 'bold',
          'color': '#1565c0',
          'padding': '20px',
          'shape': 'roundrectangle'
        }
      },

      // Style for function nodes
      {
        selector: 'node[type="function"]',
        style: {
          'background-color': '#4CAF50',
          'border-width': 2,
          'border-color': '#2e7d32',
          'label': 'data(label)',
          'color': '#000',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
          'width': '120px',
          'height': '40px',
          'shape': 'roundrectangle',
          'text-wrap': 'wrap',
          'text-max-width': '110px'
        }
      },

      // Style for edges (calls)
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#666',
          'target-arrow-color': '#666',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.5
        }
      },

      // Highlighted nodes (selected/filtered)
      {
        selector: 'node.highlighted',
        style: {
          'background-color': '#ff9800',
          'border-color': '#f57c00',
          'border-width': 3
        }
      },

      // Dimmed nodes (when filtering)
      {
        selector: 'node.dimmed',
        style: {
          'opacity': 0.2
        }
      },

      // Dimmed edges (when filtering)
      {
        selector: 'edge.dimmed',
        style: {
          'opacity': 0.1
        }
      }
    ],

    layout: {
      name: 'preset'
    },

    minZoom: 0.01,
    maxZoom: 3,
    wheelSensitivity: 0.2
  });

  return cy;
}

// Apply dagre layout
function applyLayout(cy) {
  const layout = cy.layout({
    name: 'dagre',
    rankDir: 'TB', // Top to bottom
    nodeSep: 50,
    rankSep: 100,
    padding: 30,
    spacingFactor: 1,
    animate: true,
    animationDuration: 500,
    animationEasing: 'ease-out'
  });

  layout.run();
}

function refreshGraph() {
  // Add elements to graph
  cy.elements().remove();
  cy.add(visibleElements);

  // Apply layout
  applyLayout(cy);

  // Update display info

  const functionNodes = visibleElements.filter(is_function);
  const moduleNodes = visibleElements.filter(is_module);
  const edges = visibleElements.filter(is_edge);

  document.getElementById('info').textContent =
    `Showing ${functionNodes.length} functions across ${moduleNodes.length} modules with ${edges.length} calls.`;
}

// Load and visualize graph data
function loadGraphData(elements) {
  if (!cy) {
    cy = initializeCytoscape();
  }

  // Store original data
  allElements = elements;

  // Set all elements as visible by default
  visibleElements = allElements;

  // Populate graph
  refreshGraph();

  // Populate filter dropdowns
  populateFilterSelects();

  // Enable selects
  document.getElementById('sourceSelect').disabled = false;
  document.getElementById('sinkSelect').disabled = false;
  document.getElementById('moduleSelect').disabled = false;

  // Enable buttons
  document.getElementById('applyFilterBtn').disabled = false;
  document.getElementById('clearFilterBtn').disabled = false;
  document.getElementById('resetZoomBtn').disabled = false;
  document.getElementById('resetLayoutBtn').disabled = false;
}

const is_function = (el) => el.data.type === 'function';
const is_module = (el) => el.data.type === 'module';
const is_edge = (el) => el.group === 'edges';

// Populate source and sink select dropdowns
function populateFilterSelects() {
  const sourceSelect = document.getElementById('sourceSelect');
  const sinkSelect = document.getElementById('sinkSelect');
  const moduleSelect = document.getElementById('moduleSelect');

  // Clear existing options
  sourceSelect.innerHTML = '';
  sinkSelect.innerHTML = '';
  moduleSelect.innerHTML = '';

  // Get all function nodes sorted by ID
  const sortedFunctions = visibleElements
    .filter(is_function)
    .map(el => el.data)
    .sort((a, b) => a.id.toLocaleLowerCase().localeCompare(b.id.toLocaleLowerCase()));

  // Populate both selects
  sortedFunctions.forEach(node => {
    const sourceOption = document.createElement('option');
    sourceOption.value = node.id;
    sourceOption.textContent = node.id;
    sourceSelect.appendChild(sourceOption);

    const sinkOption = document.createElement('option');
    sinkOption.value = node.id;
    sinkOption.textContent = node.id;
    sinkSelect.appendChild(sinkOption);
  });

  const sortedModules = allElements
    .filter(e => e.data.type === "module")
    .map(el => el.data)
    .sort((a, b) => a.id.toLocaleLowerCase().localeCompare(b.id.toLocaleLowerCase()));

  sortedModules.forEach(node => {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = node.label;
    moduleSelect.appendChild(option);
  })
}

// Get all nodes reachable from a node (transitive callees)
function getTransitiveCallees(nodeId) {
  const visited = new Set();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all outgoing edges
    cy.edges(`[source="${current}"]`).forEach(edge => {
      const target = edge.target().id();
      if (!visited.has(target)) {
        queue.push(target);
      }
    });
  }

  return visited;
}

// Get all nodes that can reach a node (transitive callers)
function getTransitiveCallers(nodeId) {
  const visited = new Set();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all incoming edges
    cy.edges(`[target="${current}"]`).forEach(edge => {
      const source = edge.source().id();
      if (!visited.has(source)) {
        queue.push(source);
      }
    });
  }

  return visited;
}

// Apply filtering based on source and sink selections
function applyFilter() {
  const sourceSelect = document.getElementById('sourceSelect');
  const sinkSelect = document.getElementById('sinkSelect');
  const moduleSelect = document.getElementById('moduleSelect');

  const selectedSources = Array.from(sourceSelect.selectedOptions).map(opt => opt.value);
  const selectedSinks = Array.from(sinkSelect.selectedOptions).map(opt => opt.value);
  const selectedModules = Array.from(moduleSelect.selectedOptions).map(opt => opt.value);

  // Module filtering
  const visibleModules = allElements.filter(el => is_module(el) && selectedModules.includes(el.data.id));
  const visibleFunctions = allElements.filter(el => is_function(el) && selectedModules.includes(el.data.parent));
  const visibleEdges = allElements.filter(el => {
    const functionIds = visibleFunctions.map(n => n.data.id);
    return is_edge(el) && functionIds.includes(el.data.source) && functionIds.includes(el.data.target);
  });

  visibleElements = visibleModules.concat(visibleFunctions).concat(visibleEdges);

  refreshGraph();

  if (selectedSources.length === 0 && selectedSinks.length === 0) {
    return;
  }

  let relevantNodes = new Set();

  // If sources are selected, get all their transitive callees
  if (selectedSources.length > 0) {
    selectedSources.forEach(sourceId => {
      const callees = getTransitiveCallees(sourceId);
      callees.forEach(id => relevantNodes.add(id));
    });
  }

  // If sinks are selected, get all their transitive callers
  if (selectedSinks.length > 0) {
    const callers = new Set();
    selectedSinks.forEach(sinkId => {
      const nodeCallers = getTransitiveCallers(sinkId);
      nodeCallers.forEach(id => callers.add(id));
    });

    // Intersect with existing relevant nodes if sources were also selected
    if (selectedSources.length > 0) {
      relevantNodes = new Set([...relevantNodes].filter(id => callers.has(id)));
    } else {
      relevantNodes = callers;
    }
  }

  // Apply highlighting and dimming
  cy.nodes('[type="function"]').forEach(node => {
    if (relevantNodes.has(node.id())) {
      node.removeClass('dimmed').addClass('highlighted');
    } else {
      node.removeClass('highlighted').addClass('dimmed');
    }
  });

  // Dim edges that don't connect relevant nodes
  cy.edges().forEach(edge => {
    const sourceId = edge.source().id();
    const targetId = edge.target().id();

    if (relevantNodes.has(sourceId) && relevantNodes.has(targetId)) {
      edge.removeClass('dimmed');
    } else {
      edge.addClass('dimmed');
    }
  });
}

// Clear all filters
function clearFilter() {
  document.getElementById('sourceSelect').selectedIndex = -1;
  document.getElementById('sinkSelect').selectedIndex = -1;
  document.getElementById('moduleSelect').selectedIndex = -1;

  visibleElements = allElements;
  refreshGraph();

  // Remove all highlighting and dimming
  cy.nodes().removeClass('highlighted dimmed');
  cy.edges().removeClass('dimmed');
}

// Reset zoom and pan
function resetZoom() {
  cy.fit();
  cy.center();
}

// Event Listeners
document.getElementById('fileInput').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const jsonData = JSON.parse(e.target.result);
      loadGraphData(jsonData);
    } catch (error) {
      alert('Error parsing JSON file: ' + error.message);
      console.error(error);
    }
  };
  reader.readAsText(file);
});

document.getElementById('applyFilterBtn').addEventListener('click', applyFilter);
document.getElementById('clearFilterBtn').addEventListener('click', clearFilter);
document.getElementById('resetZoomBtn').addEventListener('click', resetZoom);
document.getElementById('resetLayoutBtn').addEventListener('click', () => applyLayout(cy));

// Initialize empty Cytoscape instance
initializeCytoscape();
