// EVR Transaction Tracer - Intuitive Fund Flow Visualization

// Main tracing state object
const TracingState = {
    activeTraces: {}, // Maps trace ID to trace data
    currentTraceId: 0, // Counter for generating unique trace IDs
    traceBatchSize: 5, // Number of transactions to process in each batch
    tracingInProgress: {}, // Tracks ongoing trace operations
};

// Initialize tracing functionality
function initTracing() {
    // Create popover container if it doesn't exist
    if (!document.getElementById('trace-popover-container')) {
        const container = document.createElement('div');
        container.id = 'trace-popover-container';
        document.body.appendChild(container);
    }

    // Add event listener for escape key to close all traces
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllTraces();
        }
    });

    // Add global CSS class for trace buttons
    addTracingStyles();
}

// Add trace button to an output element
function addTraceButton(outputElement, txid, vout) {
    // Create trace button
    const traceButton = document.createElement('button');
    traceButton.className = 'trace-button';
    traceButton.innerHTML = '<i class="fas fa-project-diagram"></i> Trace';
    traceButton.title = 'Follow where these funds were spent';
    
    // Add click handler
    traceButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startNewTrace(txid, vout);
    });
    
    // Add to output element
    outputElement.querySelector('.io-value').appendChild(traceButton);
}

// Start a new trace operation
async function startNewTrace(txid, vout) {
    // Generate a new trace ID
    const traceId = `trace-${++TracingState.currentTraceId}`;
    
    // Create initial trace data structure with better organization
    const traceData = {
        id: traceId,
        initialTxid: txid,
        initialVout: vout,
        depth: 3, // Initial trace depth
        nodes: new Map(), // Use Map for better performance with node lookup
        edges: [], // Store connections between nodes
        transactions: new Map(), // Use Map for better transaction lookup
        addresses: new Map(), // Use Map for better address lookup
        // Track the "heads" (unspent outputs) of the trace
        heads: [],
        // Track filter settings
        filters: {
            addresses: new Set(), // Addresses to follow
            minValue: 0, // Minimum value to trace
        },
        // Store UI state
        uiState: {
            currentView: 'flow', // 'flow', 'list', 'graph'
            expandedTransactions: new Set(),
        },
        // Store statistics
        stats: {
            totalValue: 0,
            transactionCount: 0,
            addressCount: 0,
            maxLevel: 0,
        }
    };
    
    // Store in active traces
    TracingState.activeTraces[traceId] = traceData;
    
    // Set tracing in progress flag
    TracingState.tracingInProgress[traceId] = true;
    
    // Show loading indicator and create popover
    showTracePopover(traceId, true);
    
    try {
        // Get initial transaction info to find the starting value
        const txDetails = await window.utilities.getTransactionDetails(txid);
        if (txDetails && txDetails.tx && txDetails.tx.vout && txDetails.tx.vout[vout]) {
            traceData.stats.totalValue = txDetails.tx.vout[vout].value || 0;
        }
        
        // Start tracing process with progressive loading
        await traceOutputProgressive(traceId, txid, vout, 0);
    } catch (error) {
        console.error('Error starting trace:', error);
        showTraceError(traceId, error);
    }
}

// Trace transaction output with progressive loading
async function traceOutputProgressive(traceId, txid, vout, level) {
    // Get trace data
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Check if we've reached max depth
    if (level >= traceData.depth) {
        return;
    }
    
    try {
        // Get initial transaction details
        await traceOutput(traceId, txid, vout, level);
        
        // Update UI with initial results
        updateTracePopover(traceId, true);
        
        // Continue tracing async for each level
        for (let currentLevel = level + 1; currentLevel < traceData.depth; currentLevel++) {
            if (!TracingState.tracingInProgress[traceId]) {
                console.log(`Tracing of ${traceId} was cancelled.`);
                return;
            }
            
            // Get heads (unspent outputs) at the previous level to trace next
            const headsToTrace = traceData.heads.filter(head => head.level === currentLevel - 1);
            
            // Process heads in batches for better responsiveness
            for (let i = 0; i < headsToTrace.length; i += TracingState.traceBatchSize) {
                if (!TracingState.tracingInProgress[traceId]) return;
                
                const batchHeads = headsToTrace.slice(i, i + TracingState.traceBatchSize);
                await Promise.all(batchHeads.map(head => 
                    traceOutput(traceId, head.txid, head.vout, currentLevel)
                ));
                
                // Update stats for progress indicator
                traceData.stats.completedHeads = i + batchHeads.length;
                traceData.stats.totalHeads = headsToTrace.length;
                
                // Update UI after each batch
                updateTracePopover(traceId, true);
                
                // Small delay to keep UI responsive
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            // Clean up completed level heads
            traceData.heads = traceData.heads.filter(head => head.level !== currentLevel - 1 || head.unspent);
        }
    } catch (error) {
        console.error(`Error in progressive tracing for ${txid}:${vout}:`, error);
        showTraceError(traceId, error);
    } finally {
        // Mark tracing as complete
        TracingState.tracingInProgress[traceId] = false;
        
        // Final UI update
        updateTracePopover(traceId, false);
    }
}

// Core function to trace a specific output
async function traceOutput(traceId, txid, vout, level) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Skip if this specific output has already been traced
    const outputNodeId = `${txid}-${vout}`;
    if (traceData.nodes.has(outputNodeId)) {
        return;
    }
    
    try {
        // Get transaction details
        const txDetails = await window.utilities.getTransactionDetails(txid);
        
        // Process the transaction if we haven't seen it yet
        if (!traceData.transactions.has(txid)) {
            processTransaction(traceId, txDetails, level);
        }
        
        // Get output status to see if it's spent
        const outputStatus = await window.utilities.getOutputStatus(txid, vout);
        
        // Get output value
        const outputValue = txDetails.tx.vout[vout].value || 0;
        
        // Create output node
        const outputNode = {
            id: outputNodeId,
            txid: txid,
            vout: vout,
            value: outputValue,
            level: level,
            spent: outputStatus.status === 'Spent',
            addresses: extractAddressesFromOutput(txDetails.tx.vout[vout]),
            time: txDetails.tx.time || txDetails.tx.blocktime,
            confirmations: txDetails.confirmations
        };
        
        // Add node to the collection
        traceData.nodes.set(outputNodeId, outputNode);
        
        // If the output is unspent, add to heads list
        if (outputStatus.status !== 'Spent') {
            traceData.heads.push({
                txid: txid,
                vout: vout,
                level: level,
                value: outputValue,
                unspent: true
            });
            return;
        }
        
        // If spent, process the spending transaction
        if (outputStatus.status === 'Spent' && outputStatus.spendingTx) {
            const spendingTxid = outputStatus.spendingTx;
            
            // Fetch spending transaction details
            const spendingTx = await window.utilities.getTransactionDetails(spendingTxid);
            
            // Process spending transaction if not already processed
            if (!traceData.transactions.has(spendingTxid)) {
                processTransaction(traceId, spendingTx, level + 1);
            }
            
            // Find the input that spends this output
            const spendingVin = spendingTx.tx.vin.findIndex(vin => 
                vin.txid === txid && vin.vout === vout);
            
            if (spendingVin >= 0) {
                // Add the edge connecting this output to its spending input
                const spendingInputNodeId = `${spendingTxid}-input-${spendingVin}`;
                traceData.edges.push({
                    id: `${outputNodeId}-to-${spendingInputNodeId}`,
                    from: outputNodeId,
                    to: spendingInputNodeId,
                    value: outputValue,
                    level: level
                });
                
                // Create spending input node if it doesn't exist
                if (!traceData.nodes.has(spendingInputNodeId)) {
                    const inputNode = {
                        id: spendingInputNodeId,
                        txid: spendingTxid,
                        vin: spendingVin,
                        value: outputValue,
                        sourceOutput: {
                            txid: txid,
                            vout: vout
                        },
                        level: level + 0.5,
                        nodeType: 'input'
                    };
                    traceData.nodes.set(spendingInputNodeId, inputNode);
                }
                
                // Add each output of the spending transaction to the heads list for next level processing
                // (They will actually be processed in the next level iteration)
                spendingTx.tx.vout.forEach((output, index) => {
                    // Apply value filter if set
                    if (output.value >= traceData.filters.minValue) {
                        // Apply address filter if addresses are being followed
                        const outputAddresses = extractAddressesFromOutput(output);
                        const shouldFollow = checkShouldFollowOutput(traceData, outputAddresses);
                        
                        if (shouldFollow) {
                            // Create connection from spending tx to this output
                            const spendingOutputNodeId = `${spendingTxid}-${index}`;
                            traceData.edges.push({
                                id: `${spendingTxid}-to-${spendingOutputNodeId}`,
                                from: spendingTxid,
                                to: spendingOutputNodeId,
                                value: output.value,
                                level: level + 0.5
                            });
                            
                            // Add to heads for future processing
                            traceData.heads.push({
                                txid: spendingTxid,
                                vout: index,
                                level: level + 1,
                                value: output.value,
                                unspent: false
                            });
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error(`Error tracing output ${txid}:${vout}:`, error);
    }
}

// Process a transaction and extract relevant data
function processTransaction(traceId, txDetails, level) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    const txid = txDetails.tx.txid || txDetails.tx.hash;
    
    // Skip if already processed
    if (traceData.transactions.has(txid)) {
        return;
    }
    
    // Extract and store transaction data
    const tx = {
        id: txid,
        txid: txid,
        hash: txDetails.tx.hash,
        version: txDetails.tx.version,
        size: txDetails.tx.size,
        time: txDetails.tx.time || txDetails.tx.blocktime,
        confirmations: txDetails.confirmations,
        level: level,
        inputs: [],
        outputs: [],
        fees: 0,
        inputValue: 0,
        outputValue: 0,
        nodeType: 'transaction'
    };
    
    // Add transaction node to the graph
    traceData.nodes.set(txid, {
        id: txid,
        txid: txid,
        level: level,
        time: tx.time,
        confirmations: tx.confirmations,
        nodeType: 'transaction'
    });
    
    // Process inputs
    txDetails.tx.vin.forEach((vin, index) => {
        const inputId = `${txid}-input-${index}`;
        tx.inputs.push({
            id: inputId,
            index: index,
            prevTxid: vin.txid,
            prevVout: vin.vout,
            sequence: vin.sequence
        });
    });
    
    // Process outputs and update address info
    txDetails.tx.vout.forEach((vout, index) => {
        const outputId = `${txid}-${index}`;
        const outputAddresses = extractAddressesFromOutput(vout);
        
        tx.outputs.push({
            id: outputId,
            index: index,
            value: vout.value,
            addresses: outputAddresses,
            scriptPubKey: vout.scriptPubKey
        });
        
        tx.outputValue += vout.value || 0;
        
        // Update address records
        outputAddresses.forEach(addr => {
            updateAddressRecord(traceData, addr, {
                type: 'received',
                txid: txid,
                value: vout.value,
                time: tx.time,
                level: level
            });
        });
    });
    
    // Store the transaction
    traceData.transactions.set(txid, tx);
    
    // Update stats
    traceData.stats.transactionCount++;
    traceData.stats.maxLevel = Math.max(traceData.stats.maxLevel, level);
}

// Extract addresses from an output
function extractAddressesFromOutput(output) {
    const addresses = [];
    
    if (output.scriptPubKey && output.scriptPubKey.addresses) {
        addresses.push(...output.scriptPubKey.addresses);
    }
    
    return addresses;
}

// Update the record for an address
function updateAddressRecord(traceData, address, record) {
    if (!address) return;
    
    // Get or create address record
    if (!traceData.addresses.has(address)) {
        traceData.addresses.set(address, {
            address: address,
            totalReceived: 0,
            totalSent: 0,
            transactions: []
        });
        
        // Update stats
        traceData.stats.addressCount++;
    }
    
    const addressRecord = traceData.addresses.get(address);
    
    // Update totals
    if (record.type === 'received') {
        addressRecord.totalReceived += record.value || 0;
    } else if (record.type === 'sent') {
        addressRecord.totalSent += record.value || 0;
    }
    
    // Add transaction reference
    addressRecord.transactions.push(record);
}

// Check if an output should be followed based on address filters
function checkShouldFollowOutput(traceData, outputAddresses) {
    // If no addresses are being followed, follow all
    if (traceData.filters.addresses.size === 0) {
        return true;
    }
    
    // Check if any of the output addresses is in our follow list
    for (const addr of outputAddresses) {
        if (traceData.filters.addresses.has(addr)) {
            return true;
        }
    }
    
    return false;
}

// Add an address to the follow filter
function setAddressFilter(traceId, address, shouldFollow) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    if (shouldFollow) {
        traceData.filters.addresses.add(address);
    } else {
        traceData.filters.addresses.delete(address);
    }
    
    // Reset and restart the trace
    resetAndRestartTrace(traceId);
}

// Set minimum value filter
function setValueFilter(traceId, minValue) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Update filter
    traceData.filters.minValue = parseFloat(minValue) || 0;
    
    // Reset and restart the trace
    resetAndRestartTrace(traceId);
}

// Reset and restart a trace with new filters
function resetAndRestartTrace(traceId) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Cancel any in-progress tracing
    TracingState.tracingInProgress[traceId] = false;
    
    // Wait a bit to ensure any ongoing operations can complete
    setTimeout(() => {
        // Clear existing data but keep filters
        const filters = traceData.filters;
        const initialTxid = traceData.initialTxid;
        const initialVout = traceData.initialVout;
        const depth = traceData.depth;
        
        // Reset data structures
        traceData.nodes = new Map();
        traceData.edges = [];
        traceData.transactions = new Map();
        traceData.addresses = new Map();
        traceData.heads = [];
        traceData.stats = {
            totalValue: 0,
            transactionCount: 0,
            addressCount: 0,
            maxLevel: 0
        };
        
        // Keep filters
        traceData.filters = filters;
        traceData.initialTxid = initialTxid;
        traceData.initialVout = initialVout;
        traceData.depth = depth;
        
        // Show loading state
        showTracePopover(traceId, true);
        
        // Set tracing in progress
        TracingState.tracingInProgress[traceId] = true;
        
        // Start new trace
        traceOutputProgressive(traceId, initialTxid, initialVout, 0);
    }, 100);
}

// Set trace depth and restart
function setTraceDepth(traceId, depth) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Update depth
    traceData.depth = parseInt(depth) || 3;
    
    // Reset and restart trace
    resetAndRestartTrace(traceId);
}

// Create the trace popover UI
function showTracePopover(traceId, isLoading = false) {
    // Check if container exists
    const container = document.getElementById('trace-popover-container');
    if (!container) return;
    
    // Get trace data
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Check if popover already exists
    let popover = document.getElementById(traceId);
    
    // Format txid for display
    const formattedTxid = window.app.formatHash(traceData.initialTxid);
    
    if (!popover) {
        // Create new popover
        popover = document.createElement('div');
        popover.id = traceId;
        popover.className = 'trace-popover';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'trace-popover-header';
        
        // Title
        const title = document.createElement('div');
        title.className = 'trace-popover-title';
        title.textContent = `Transaction Trace: ${formattedTxid}`;
        header.appendChild(title);
        
        // Controls
        const controls = document.createElement('div');
        controls.className = 'trace-popover-controls';
        
        // View selection
        const viewSelection = document.createElement('div');
        viewSelection.className = 'trace-view-selection';
        viewSelection.innerHTML = `
            <button class="view-btn active" data-view="flow">Flow View</button>
            <button class="view-btn" data-view="list">List View</button>
            <button class="view-btn" data-view="graph">Graph View</button>
        `;
        controls.appendChild(viewSelection);
        
        // Depth control
        const depthControl = document.createElement('div');
        depthControl.className = 'trace-depth-control';
        depthControl.innerHTML = `
            <label>Depth: 
                <select class="trace-depth-select">
                    <option value="2">2 levels</option>
                    <option value="3" selected>3 levels</option>
                    <option value="5">5 levels</option>
                    <option value="10">10 levels</option>
                    <option value="20">20 levels</option>
                </select>
            </label>
        `;
        controls.appendChild(depthControl);
        
        // Value filter
        const valueFilter = document.createElement('div');
        valueFilter.className = 'trace-value-filter';
        valueFilter.innerHTML = `
            <label>Min Value: 
                <input type="number" class="value-filter-input" min="0" step="0.00000001" value="0">
            </label>
        `;
        controls.appendChild(valueFilter);
        
        // Window controls
        const windowControls = document.createElement('div');
        windowControls.className = 'trace-window-controls';
        
        // Minimize button
        const minimizeButton = document.createElement('button');
        minimizeButton.className = 'trace-minimize-button';
        minimizeButton.innerHTML = '&#8722;'; // Minus sign
        minimizeButton.title = 'Minimize trace panel';
        windowControls.appendChild(minimizeButton);
        
        // Close button
        const closeButton = document.createElement('button');
        closeButton.className = 'trace-close-button';
        closeButton.innerHTML = '&times;';
        closeButton.title = 'Close trace';
        windowControls.appendChild(closeButton);
        
        controls.appendChild(windowControls);
        header.appendChild(controls);
        
        // Add header to popover
        popover.appendChild(header);
        
        // Create content area
        const content = document.createElement('div');
        content.className = 'trace-popover-content';
        popover.appendChild(content);
        
        // Create loading indicator
        if (isLoading) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'trace-loading';
            loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading trace data...';
            content.appendChild(loadingDiv);
        }
        
        // Create toolbar for filters
        const toolbar = document.createElement('div');
        toolbar.className = 'trace-toolbar';
        
        // Address filter input
        const addressFilter = document.createElement('div');
        addressFilter.className = 'trace-address-filter';
        addressFilter.innerHTML = `
            <input type="text" class="address-input" placeholder="Enter address to follow">
            <button class="add-address-btn">Follow</button>
        `;
        toolbar.appendChild(addressFilter);
        
        // Address filter tags
        const addressTags = document.createElement('div');
        addressTags.className = 'trace-address-tags';
        toolbar.appendChild(addressTags);
        
        popover.appendChild(toolbar);
        
        // Add status bar
        const statusBar = document.createElement('div');
        statusBar.className = 'trace-status-bar';
        statusBar.innerHTML = `
            <div class="trace-stats">
                <span class="trace-stat">Transactions: <span class="tx-count">0</span></span>
                <span class="trace-stat">Addresses: <span class="addr-count">0</span></span>
                <span class="trace-stat">Total Value: <span class="total-value">0.00000000</span> EVR</span>
            </div>
            <div class="trace-progress">
                <div class="progress-bar"></div>
            </div>
        `;
        popover.appendChild(statusBar);
        
        // Make popover draggable
        makeDraggable(popover, header);
        
        // Make popover resizable
        makeResizable(popover);
        
        // Set initial position and size
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        popover.style.width = '975px';
        popover.style.height = '700px';
        popover.style.left = `${Math.max(0, (viewportWidth - 975) / 2)}px`;
        popover.style.top = `${Math.max(0, (viewportHeight - 700) / 2)}px`;
        
        // Add event listeners
        
        // View selection
        viewSelection.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.getAttribute('data-view');
                traceData.uiState.currentView = view;
                
                // Update active button
                viewSelection.querySelectorAll('.view-btn').forEach(b => {
                    b.classList.remove('active');
                });
                e.target.classList.add('active');
                
                // Update view
                updateTracePopover(traceId, false);
            });
        });
        
        // Depth selection
        const depthSelect = popover.querySelector('.trace-depth-select');
        depthSelect.addEventListener('change', (e) => {
            setTraceDepth(traceId, e.target.value);
        });
        
        // Value filter
        const valueInput = popover.querySelector('.value-filter-input');
        valueInput.addEventListener('change', (e) => {
            setValueFilter(traceId, e.target.value);
        });
        
        // Address filter
        const addressInput = popover.querySelector('.address-input');
        const addAddressBtn = popover.querySelector('.add-address-btn');
        
        addAddressBtn.addEventListener('click', () => {
            const address = addressInput.value.trim();
            if (address) {
                setAddressFilter(traceId, address, true);
                addressInput.value = '';
                updateAddressFilterTags(traceId);
            }
        });
        
        addressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const address = addressInput.value.trim();
                if (address) {
                    setAddressFilter(traceId, address, true);
                    addressInput.value = '';
                    updateAddressFilterTags(traceId);
                }
            }
        });
        
        // Window controls
        minimizeButton.addEventListener('click', () => toggleMinimize(traceId));
        closeButton.addEventListener('click', () => closeTrace(traceId));
        
        // Add to container
        container.appendChild(popover);
    } else {
        // Update existing popover title
        const title = popover.querySelector('.trace-popover-title');
        if (title) {
            title.textContent = `Transaction Trace: ${formattedTxid}`;
        }
        
        // Update loading state
        const content = popover.querySelector('.trace-popover-content');
        if (isLoading && content) {
            content.innerHTML = '<div class="trace-loading"><i class="fas fa-spinner fa-spin"></i> Loading trace data...</div>';
        }
        
        // Bring to front
        bringToFront(popover);
    }
    
    // Update address filter tags
    updateAddressFilterTags(traceId);
}

// Update the address filter tags
function updateAddressFilterTags(traceId) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    const tagsContainer = popover.querySelector('.trace-address-tags');
    if (!tagsContainer) return;
    
    // Clear current tags
    tagsContainer.innerHTML = '';
    
    // If no addresses are being followed, show message
    if (traceData.filters.addresses.size === 0) {
        tagsContainer.innerHTML = '<span class="no-filters">No address filters (following all addresses)</span>';
        return;
    }
    
    // Add tag for each address
    traceData.filters.addresses.forEach(address => {
        const tag = document.createElement('div');
        tag.className = 'address-tag';
        tag.innerHTML = `
            <span class="address-text">${shortenAddress(address)}</span>
            <button class="remove-tag-btn" data-address="${address}">&times;</button>
        `;
        
        // Add click listener for remove button
        tag.querySelector('.remove-tag-btn').addEventListener('click', (e) => {
            const addr = e.target.getAttribute('data-address');
            setAddressFilter(traceId, addr, false);
            updateAddressFilterTags(traceId);
        });
        
        tagsContainer.appendChild(tag);
    });
}

// Update trace popover with current data
function updateTracePopover(traceId, isPartialUpdate = false) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Update statistics
    updateTraceStats(traceId);
    
    // If this is just a progress update, skip full rendering
    if (isPartialUpdate && popover.querySelector('.trace-loading')) {
        updateTraceProgress(traceId);
        return;
    }
    
    // Get content container
    const content = popover.querySelector('.trace-popover-content');
    if (!content) return;
    
    // Clear content
    content.innerHTML = '';
    
    // Check if we have data
    if (traceData.transactions.size === 0) {
        content.innerHTML = '<div class="trace-empty">No trace data available.</div>';
        return;
    }
    
    // Render the appropriate view
    switch (traceData.uiState.currentView) {
        case 'flow':
            renderFlowView(traceId, content);
            break;
        case 'list':
            renderListView(traceId, content);
            break;
        case 'graph':
            renderGraphView(traceId, content);
            break;
        default:
            renderFlowView(traceId, content);
    }
}

// Render the flow view (visual transaction flow)
function renderFlowView(traceId, container) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Create columns for each level
    const levelsContainer = document.createElement('div');
    levelsContainer.className = 'trace-flow-view';
    
    // Determine the maximum level
    const maxLevel = traceData.stats.maxLevel;
    
    // Create a column for each level
    for (let level = 0; level <= maxLevel; level++) {
        const levelColumn = document.createElement('div');
        levelColumn.className = 'level-column';
        levelColumn.innerHTML = `<div class="level-header">Level ${level}</div>`;
        
        // Create level content
        const levelContent = document.createElement('div');
        levelContent.className = 'level-content';
        
        // Find transactions at this level
        const levelTransactions = Array.from(traceData.transactions.values())
            .filter(tx => Math.floor(tx.level) === level)
            .sort((a, b) => (b.time || 0) - (a.time || 0));
        
        // Add transactions
        levelTransactions.forEach(tx => {
            const txCard = createTransactionCard(traceId, tx);
            levelContent.appendChild(txCard);
        });
        
        levelColumn.appendChild(levelContent);
        levelsContainer.appendChild(levelColumn);
    }
    
    // Add the flow view to the container
    container.appendChild(levelsContainer);
    
    // Draw flow lines between connected transactions
    setTimeout(() => {
        drawFlowConnections(traceId);
    }, 100); // Small delay to ensure DOM is ready
}

// Create a transaction card for the flow view
function createTransactionCard(traceId, tx) {
    const traceData = TracingState.activeTraces[traceId];
    
    // Create card
    const card = document.createElement('div');
    card.className = 'tx-card';
    card.setAttribute('data-txid', tx.txid);
    
    // Format time
    const timeStr = tx.time ? new Date(tx.time * 1000).toLocaleString() : 'Unknown';
    
    // Add card content
    card.innerHTML = `
        <div class="tx-card-header">
            <div class="tx-card-txid">
                <a href="#" class="txid-link" data-txid="${tx.txid}">${window.app.formatHash(tx.txid)}</a>
            </div>
            <div class="tx-card-time">${timeStr}</div>
            <div class="tx-card-status">
                ${tx.confirmations === 0 ? 
                    '<span class="unconfirmed">Unconfirmed</span>' : 
                    `<span class="confirmed">${tx.confirmations} confirmation${tx.confirmations !== 1 ? 's' : ''}</span>`
                }
            </div>
        </div>
        <div class="tx-card-body">
            <div class="tx-io-summary">
                <div class="tx-inputs-summary">
                    <h5>Inputs</h5>
                    <div class="tx-inputs-list"></div>
                </div>
                <div class="tx-arrow">→</div>
                <div class="tx-outputs-summary">
                    <h5>Outputs</h5>
                    <div class="tx-outputs-list"></div>
                </div>
            </div>
        </div>
        <div class="tx-card-footer">
            <button class="tx-details-btn">Details</button>
        </div>
    `;
    
    // Add inputs summary
    const inputsList = card.querySelector('.tx-inputs-list');
    
    // Gather inputs
    const txInputs = [];
    tx.inputs.forEach(input => {
        // Find node with details
        const inputNode = traceData.nodes.get(`${tx.txid}-input-${input.index}`);
        if (inputNode && inputNode.sourceOutput) {
            // Find source transaction
            const sourceTx = traceData.transactions.get(inputNode.sourceOutput.txid);
            if (sourceTx) {
                // Find output
                const output = sourceTx.outputs.find(o => o.index === inputNode.sourceOutput.vout);
                if (output) {
                    txInputs.push({
                        value: output.value,
                        addresses: output.addresses
                    });
                }
            }
        } else {
            txInputs.push({
                value: input.value || 0,
                addresses: input.addresses || []
            });
        }
    });
    
    // Group by address
    const inputsByAddress = groupIOByAddress(txInputs);
    
    // Add to list
    Object.entries(inputsByAddress).forEach(([addr, value]) => {
        const inputItem = document.createElement('div');
        inputItem.className = 'tx-io-item';
        inputItem.innerHTML = `
            <a href="#" class="address-link" data-address="${addr}">${shortenAddress(addr)}</a>
            <span class="tx-io-value">${value.toFixed(8)} EVR</span>
        `;
        inputsList.appendChild(inputItem);
    });
    
    // Add outputs summary
    const outputsList = card.querySelector('.tx-outputs-list');
    
    // Group outputs by address
    const outputsByAddress = groupIOByAddress(tx.outputs);
    
    // Add to list
    Object.entries(outputsByAddress).forEach(([addr, value]) => {
        const outputItem = document.createElement('div');
        outputItem.className = 'tx-io-item';
        outputItem.innerHTML = `
            <a href="#" class="address-link" data-address="${addr}">${shortenAddress(addr)}</a>
            <span class="tx-io-value">${value.toFixed(8)} EVR</span>
        `;
        outputsList.appendChild(outputItem);
    });
    
    // Add event listeners
    
    // Transaction ID link
    card.querySelector('.txid-link').addEventListener('click', (e) => {
        e.preventDefault();
        const txid = e.target.getAttribute('data-txid');
        window.app.navigateToTransactionDetails(txid);
    });
    
    // Address links
    card.querySelectorAll('.address-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const address = e.target.getAttribute('data-address');
            window.app.navigateToAddressDetails(address);
        });
    });
    
    // Details button
    card.querySelector('.tx-details-btn').addEventListener('click', () => {
        toggleTransactionDetails(traceId, tx.txid);
    });
    
    return card;
}

// Group inputs or outputs by address
function groupIOByAddress(items) {
    const byAddress = {};
    
    items.forEach(item => {
        if (item.addresses && item.addresses.length > 0) {
            item.addresses.forEach(addr => {
                byAddress[addr] = (byAddress[addr] || 0) + (item.value || 0);
            });
        } else {
            byAddress['Unknown'] = (byAddress['Unknown'] || 0) + (item.value || 0);
        }
    });
    
    return byAddress;
}

// Draw connection lines between related transactions in the flow view
function drawFlowConnections(traceId) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Clear any existing connections
    const existingLines = popover.querySelectorAll('.trace-connection-line');
    existingLines.forEach(line => line.remove());
    
    // Create SVG container for lines if it doesn't exist
    let svgContainer = popover.querySelector('.trace-connections-svg');
    if (!svgContainer) {
        svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgContainer.classList.add('trace-connections-svg');
        svgContainer.style.position = 'absolute';
        svgContainer.style.top = '0';
        svgContainer.style.left = '0';
        svgContainer.style.width = '100%';
        svgContainer.style.height = '100%';
        svgContainer.style.pointerEvents = 'none';
        svgContainer.style.zIndex = '1';
        popover.querySelector('.trace-popover-content').appendChild(svgContainer);
    }
    
    // Clear SVG
    svgContainer.innerHTML = '';
    
    // Adjust SVG size to match content
    const content = popover.querySelector('.trace-popover-content');
    svgContainer.style.width = `${content.scrollWidth}px`;
    svgContainer.style.height = `${content.scrollHeight}px`;
    
    // Create connections for each edge
    traceData.edges.forEach(edge => {
        // Get source and target nodes
        const fromNode = traceData.nodes.get(edge.from);
        const toNode = traceData.nodes.get(edge.to);
        
        if (!fromNode || !toNode) return;
        
        // For transaction-to-transaction connections
        if (fromNode.nodeType === 'transaction' && toNode.txid) {
            const fromTx = traceData.transactions.get(fromNode.txid);
            const toTx = traceData.transactions.get(toNode.txid);
            
            if (!fromTx || !toTx) return;
            
            // Find the cards in the DOM
            const fromCard = popover.querySelector(`.tx-card[data-txid="${fromTx.txid}"]`);
            const toCard = popover.querySelector(`.tx-card[data-txid="${toTx.txid}"]`);
            
            if (!fromCard || !toCard) return;
            
            // Get positions
            const fromRect = fromCard.getBoundingClientRect();
            const toRect = toCard.getBoundingClientRect();
            const contentRect = content.getBoundingClientRect();
            
            // Calculate positions relative to SVG container
            const x1 = fromRect.right - contentRect.left + content.scrollLeft;
            const y1 = fromRect.top + (fromRect.height / 2) - contentRect.top + content.scrollTop;
            const x2 = toRect.left - contentRect.left + content.scrollLeft;
            const y2 = toRect.top + (toRect.height / 2) - contentRect.top + content.scrollTop;
            
            // Create path with curve
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            // Calculate control points for curve
            const controlX = (x1 + x2) / 2;
            
            // Create path
            const pathData = `M ${x1},${y1} C ${controlX},${y1} ${controlX},${y2} ${x2},${y2}`;
            
            // Set path attributes
            path.setAttribute('d', pathData);
            path.setAttribute('stroke', '#4CAF50');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            
            // Add value label
            const textX = controlX;
            const textY = (y1 + y2) / 2 - 5;
            
            const valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            valueText.setAttribute('x', textX);
            valueText.setAttribute('y', textY);
            valueText.setAttribute('text-anchor', 'middle');
            valueText.setAttribute('font-size', '12');
            valueText.setAttribute('fill', '#333');
            valueText.textContent = `${edge.value.toFixed(8)} EVR`;
            
            // Add background to text for better readability
            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const textWidth = valueText.getComputedTextLength() || 100; // Fallback width
            textBg.setAttribute('x', textX - (textWidth / 2) - 3);
            textBg.setAttribute('y', textY - 12);
            textBg.setAttribute('width', textWidth + 6);
            textBg.setAttribute('height', 16);
            textBg.setAttribute('fill', 'rgba(255, 255, 255, 0.8)');
            textBg.setAttribute('rx', 3);
            
            // Add arrowhead marker if not already defined
            let marker = svgContainer.querySelector('#arrowhead');
            if (!marker) {
                marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.setAttribute('id', 'arrowhead');
                marker.setAttribute('markerWidth', '10');
                marker.setAttribute('markerHeight', '7');
                marker.setAttribute('refX', '9');
                marker.setAttribute('refY', '3.5');
                marker.setAttribute('orient', 'auto');
                
                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
                polygon.setAttribute('fill', '#4CAF50');
                marker.appendChild(polygon);
                
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                defs.appendChild(marker);
                svgContainer.appendChild(defs);
            }
            
            // Add path and text to SVG
            svgContainer.appendChild(path);
            svgContainer.appendChild(textBg);
            svgContainer.appendChild(valueText);
        }
    });
}

// Toggle transaction details
function toggleTransactionDetails(traceId, txid) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Toggle expanded state
    if (traceData.uiState.expandedTransactions.has(txid)) {
        traceData.uiState.expandedTransactions.delete(txid);
    } else {
        traceData.uiState.expandedTransactions.add(txid);
    }
    
    // Re-render view
    const content = popover.querySelector('.trace-popover-content');
    if (content) {
        if (traceData.uiState.currentView === 'flow') {
            renderFlowView(traceId, content);
        } else if (traceData.uiState.currentView === 'list') {
            renderListView(traceId, content);
        }
    }
}

// Render the list view
function renderListView(traceId, container) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Create container for list view
    const listView = document.createElement('div');
    listView.className = 'trace-list-view';
    
    // Add address summary section
    const addressSection = document.createElement('div');
    addressSection.className = 'trace-address-section';
    addressSection.innerHTML = '<h3>Addresses Involved</h3>';
    
    // Create address table
    const addressTable = document.createElement('table');
    addressTable.className = 'trace-address-table';
    addressTable.innerHTML = `
        <thead>
            <tr>
                <th>Address</th>
                <th>Received</th>
                <th>Sent</th>
                <th>Net Flow</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    // Sort addresses by total value
    const sortedAddresses = Array.from(traceData.addresses.values())
        .map(addr => ({
            ...addr,
            netFlow: addr.totalReceived - addr.totalSent
        }))
        .sort((a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow));
    
    // Fill address table
    const tbody = addressTable.querySelector('tbody');
    sortedAddresses.forEach(addr => {
        const row = document.createElement('tr');
        
        // Determine if address is followed
        const isFollowed = traceData.filters.addresses.has(addr.address);
        
        // Set row class based on net flow
        if (addr.netFlow > 0) {
            row.classList.add('positive-flow');
        } else if (addr.netFlow < 0) {
            row.classList.add('negative-flow');
        }
        
        row.innerHTML = `
            <td><a href="#" class="address-link" data-address="${addr.address}">${addr.address}</a></td>
            <td class="amount-cell">${addr.totalReceived.toFixed(8)} EVR</td>
            <td class="amount-cell">${addr.totalSent.toFixed(8)} EVR</td>
            <td class="amount-cell ${addr.netFlow > 0 ? 'positive' : addr.netFlow < 0 ? 'negative' : ''}">${addr.netFlow.toFixed(8)} EVR</td>
            <td>
                <button class="follow-btn ${isFollowed ? 'following' : ''}" data-address="${addr.address}">
                    ${isFollowed ? 'Unfollow' : 'Follow'}
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    addressSection.appendChild(addressTable);
    
    // Add transaction list section
    const txSection = document.createElement('div');
    txSection.className = 'trace-tx-section';
    txSection.innerHTML = '<h3>Transactions</h3>';
    
    // Sort transactions by level, then by time
    const sortedTransactions = Array.from(traceData.transactions.values())
        .sort((a, b) => {
            if (a.level !== b.level) {
                return a.level - b.level;
            }
            return (b.time || 0) - (a.time || 0);
        });
    
    // Create transaction list
    const txList = document.createElement('div');
    txList.className = 'trace-tx-list';
    
    // Add transactions
    sortedTransactions.forEach(tx => {
        const txItem = document.createElement('div');
        txItem.className = 'trace-tx-item';
        txItem.setAttribute('data-txid', tx.txid);
        
        // Format time
        const timeStr = tx.time ? new Date(tx.time * 1000).toLocaleString() : 'Unknown';
        
        // Build transaction HTML
        txItem.innerHTML = `
            <div class="tx-item-header">
                <div class="tx-level">Level ${tx.level}</div>
                <a href="#" class="tx-id" data-txid="${tx.txid}">${window.app.formatHash(tx.txid)}</a>
                <div class="tx-time">${timeStr}</div>
                <div class="tx-confirmations">
                    ${tx.confirmations === 0 ? 
                        '<span class="unconfirmed">Unconfirmed</span>' : 
                        `<span class="confirmed">${tx.confirmations} confirmation${tx.confirmations !== 1 ? 's' : ''}</span>`
                    }
                </div>
                <button class="tx-details-toggle" data-txid="${tx.txid}">
                    ${traceData.uiState.expandedTransactions.has(tx.txid) ? '▼' : '►'}
                </button>
            </div>
        `;
        
        // Add details section if expanded
        if (traceData.uiState.expandedTransactions.has(tx.txid)) {
            const detailsSection = document.createElement('div');
            detailsSection.className = 'tx-item-details';
            
            // Inputs section
            const inputsSection = document.createElement('div');
            inputsSection.className = 'tx-inputs-section';
            inputsSection.innerHTML = '<h4>Inputs</h4>';
            
            // Group inputs by address
            const inputsByAddress = {};
            
            tx.inputs.forEach(input => {
                // Find input node with source info
                const inputNode = traceData.nodes.get(`${tx.txid}-input-${input.index}`);
                if (inputNode && inputNode.sourceOutput) {
                    // Find source transaction
                    const sourceTx = traceData.transactions.get(inputNode.sourceOutput.txid);
                    if (sourceTx) {
                        // Find source output
                        const output = sourceTx.outputs.find(o => o.index === inputNode.sourceOutput.vout);
                        if (output && output.addresses) {
                            output.addresses.forEach(addr => {
                                inputsByAddress[addr] = (inputsByAddress[addr] || 0) + (output.value || 0);
                            });
                        }
                    }
                }
            });
            
            // Add inputs table
            const inputsTable = document.createElement('table');
            inputsTable.className = 'tx-inputs-table';
            inputsTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Address</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            
            // Fill inputs table
            const inputsTbody = inputsTable.querySelector('tbody');
            Object.entries(inputsByAddress).forEach(([addr, value]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><a href="#" class="address-link" data-address="${addr}">${addr}</a></td>
                    <td class="amount-cell">${value.toFixed(8)} EVR</td>
                `;
                inputsTbody.appendChild(row);
            });
            
            inputsSection.appendChild(inputsTable);
            detailsSection.appendChild(inputsSection);
            
            // Outputs section
            const outputsSection = document.createElement('div');
            outputsSection.className = 'tx-outputs-section';
            outputsSection.innerHTML = '<h4>Outputs</h4>';
            
            // Group outputs by address
            const outputsByAddress = {};
            
            tx.outputs.forEach(output => {
                if (output.addresses) {
                    output.addresses.forEach(addr => {
                        outputsByAddress[addr] = (outputsByAddress[addr] || 0) + (output.value || 0);
                    });
                }
            });
            
            // Add outputs table
            const outputsTable = document.createElement('table');
            outputsTable.className = 'tx-outputs-table';
            outputsTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Address</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            
            // Fill outputs table
            const outputsTbody = outputsTable.querySelector('tbody');
            Object.entries(outputsByAddress).forEach(([addr, value]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><a href="#" class="address-link" data-address="${addr}">${addr}</a></td>
                    <td class="amount-cell">${value.toFixed(8)} EVR</td>
                `;
                outputsTbody.appendChild(row);
            });
            
            outputsSection.appendChild(outputsTable);
            detailsSection.appendChild(outputsSection);
            
            txItem.appendChild(detailsSection);
        }
        
        txList.appendChild(txItem);
    });
    
    txSection.appendChild(txList);
    
    // Add sections to container
    listView.appendChild(addressSection);
    listView.appendChild(txSection);
    container.appendChild(listView);
    
    // Add event listeners
    
    // Address links
    container.querySelectorAll('.address-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const address = e.target.getAttribute('data-address');
            window.app.navigateToAddressDetails(address);
        });
    });
    
    // Transaction links
    container.querySelectorAll('.tx-id').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const txid = e.target.getAttribute('data-txid');
            window.app.navigateToTransactionDetails(txid);
        });
    });
    
    // Follow buttons
    container.querySelectorAll('.follow-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const address = e.target.getAttribute('data-address');
            const isFollowing = e.target.classList.contains('following');
            
            setAddressFilter(traceId, address, !isFollowing);
            
            if (isFollowing) {
                e.target.classList.remove('following');
                e.target.textContent = 'Follow';
            } else {
                e.target.classList.add('following');
                e.target.textContent = 'Unfollow';
            }
            
            updateAddressFilterTags(traceId);
        });
    });
    
    // Transaction detail toggles
    container.querySelectorAll('.tx-details-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            const txid = e.target.getAttribute('data-txid');
            toggleTransactionDetails(traceId, txid);
        });
    });
}

// Render the graph view
function renderGraphView(traceId, container) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Create graph container
    const graphContainer = document.createElement('div');
    graphContainer.className = 'trace-graph-container';
    container.appendChild(graphContainer);
    
    // Add graph canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'trace-graph-canvas';
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight - 20;
    graphContainer.appendChild(canvas);
    
    // Add graph caption/legend
    const legend = document.createElement('div');
    legend.className = 'trace-graph-legend';
    legend.innerHTML = `
        <div class="legend-item"><span class="legend-tx"></span> Transaction</div>
        <div class="legend-item"><span class="legend-input"></span> Input</div>
        <div class="legend-item"><span class="legend-output"></span> Output</div>
        <div class="legend-item"><span class="legend-flow"></span> Fund Flow</div>
    `;
    graphContainer.appendChild(legend);
    
    // Render graph on canvas
    renderGraphOnCanvas(traceId, canvas);
}

// Render graph on canvas
function renderGraphOnCanvas(traceId, canvas) {
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set up layout
    const maxLevel = traceData.stats.maxLevel;
    const levelWidth = canvas.width / (maxLevel + 1);
    const nodePadding = 10;
    const nodeWidth = 160;
    const nodeHeight = 40;
    
    // Organize nodes by level
    const nodesByLevel = {};
    for (let i = 0; i <= maxLevel; i++) {
        nodesByLevel[i] = [];
    }
    
    // Collect transaction nodes
    Array.from(traceData.transactions.values()).forEach(tx => {
        const level = Math.floor(tx.level);
        nodesByLevel[level].push({
            id: tx.txid,
            type: 'transaction',
            tx: tx
        });
    });
    
    // Sort nodes within each level
    for (let level = 0; level <= maxLevel; level++) {
        nodesByLevel[level].sort((a, b) => {
            return (b.tx.time || 0) - (a.tx.time || 0);
        });
    }
    
    // Position nodes
    const nodePositions = new Map();
    
    // Position transaction nodes
    for (let level = 0; level <= maxLevel; level++) {
        const nodes = nodesByLevel[level];
        const levelX = level * levelWidth + (levelWidth / 2) - (nodeWidth / 2);
        const totalHeight = nodes.length * (nodeHeight + nodePadding);
        let startY = (canvas.height - totalHeight) / 2;
        
        nodes.forEach((node, index) => {
            const y = startY + index * (nodeHeight + nodePadding);
            nodePositions.set(node.id, {
                x: levelX,
                y: y,
                width: nodeWidth,
                height: nodeHeight,
                type: node.type
            });
            
            // Draw transaction node
            drawTransactionNode(ctx, levelX, y, nodeWidth, nodeHeight, node.tx);
        });
    }
    
    // Draw edges
    traceData.edges.forEach(edge => {
        const fromNode = traceData.nodes.get(edge.from);
        const toNode = traceData.nodes.get(edge.to);
        
        if (!fromNode || !toNode) return;
        
        // Only draw transaction-to-transaction connections for simplicity
        if (fromNode.nodeType === 'transaction' && toNode.txid) {
            const fromPos = nodePositions.get(fromNode.txid);
            const toPos = nodePositions.get(toNode.txid);
            
            if (fromPos && toPos) {
                // Draw connection line
                drawConnection(ctx, 
                    fromPos.x + fromPos.width, // from right side of fromNode
                    fromPos.y + (fromPos.height / 2), // from middle of fromNode
                    toPos.x, // to left side of toNode
                    toPos.y + (toPos.height / 2), // to middle of toNode
                    edge.value // value for label
                );
            }
        }
    });
    
    // Add event listener for interactions
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if a node was clicked
        for (const [id, pos] of nodePositions.entries()) {
            if (x >= pos.x && x <= pos.x + pos.width &&
                y >= pos.y && y <= pos.y + pos.height) {
                // Node was clicked
                if (pos.type === 'transaction') {
                    window.app.navigateToTransactionDetails(id);
                }
                break;
            }
        }
    });
}

// Draw a transaction node on canvas
function drawTransactionNode(ctx, x, y, width, height, tx) {
    // Draw node background
    ctx.fillStyle = '#f5f5f5';
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, width, height, 5, true, true);
    
    // Draw text
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw txid (shortened)
    const shortTxid = `${tx.txid.substring(0, 6)}...${tx.txid.substring(tx.txid.length - 6)}`;
    ctx.fillText(shortTxid, x + (width / 2), y + (height / 2) - 8);
    
    // Draw value
    ctx.font = '10px Arial';
    ctx.fillText(`${tx.outputValue.toFixed(8)} EVR`, x + (width / 2), y + (height / 2) + 8);
}

// Draw a connection line with arrow and value label
function drawConnection(ctx, x1, y1, x2, y2, value) {
    // Draw curve with control points
    const controlX = (x1 + x2) / 2;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(controlX, y1, controlX, y2, x2, y2);
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw arrowhead
    const arrowSize = 8;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
        x2 - arrowSize * Math.cos(angle - Math.PI / 6),
        y2 - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        x2 - arrowSize * Math.cos(angle + Math.PI / 6),
        y2 - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = '#4CAF50';
    ctx.fill();
    
    // Draw value label
    const labelX = controlX;
    const labelY = (y1 + y2) / 2 - 10;
    const valueText = value.toFixed(8) + ' EVR';
    
    // Measure text width
    const textWidth = ctx.measureText(valueText).width;
    
    // Draw background for label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    roundRect(ctx, labelX - (textWidth / 2) - 3, labelY - 8, textWidth + 6, 16, 3, true, false);
    
    // Draw label text
    ctx.fillStyle = '#333';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(valueText, labelX, labelY);
}

// Helper function to draw rounded rectangles
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    
    if (fill) {
        ctx.fill();
    }
    
    if (stroke) {
        ctx.stroke();
    }
}

// Update trace statistics
function updateTraceStats(traceId) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Update transaction count
    const txCountElement = popover.querySelector('.tx-count');
    if (txCountElement) {
        txCountElement.textContent = traceData.transactions.size;
    }
    
    // Update address count
    const addrCountElement = popover.querySelector('.addr-count');
    if (addrCountElement) {
        addrCountElement.textContent = traceData.addresses.size;
    }
    
    // Update total value
    const totalValueElement = popover.querySelector('.total-value');
    if (totalValueElement) {
        totalValueElement.textContent = traceData.stats.totalValue.toFixed(8);
    }
}

// Update trace progress indicator
function updateTraceProgress(traceId) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const traceData = TracingState.activeTraces[traceId];
    if (!traceData) return;
    
    // Update progress bar
    const progressBar = popover.querySelector('.progress-bar');
    if (progressBar && traceData.stats.totalHeads > 0) {
        const progress = (traceData.stats.completedHeads / traceData.stats.totalHeads) * 100;
        progressBar.style.width = `${progress}%`;
        
        // Update loading text with progress
        const loadingDiv = popover.querySelector('.trace-loading');
        if (loadingDiv) {
            loadingDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading trace data... ${Math.round(progress)}%`;
        }
    }
}

// Show error message in trace popover
function showTraceError(traceId, error) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const content = popover.querySelector('.trace-popover-content');
    if (!content) return;
    
    content.innerHTML = `
        <div class="trace-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error loading trace data: ${error.message || 'Unknown error'}</p>
            <button class="trace-retry-btn">Retry</button>
        </div>
    `;
    
    // Add retry button handler
    const retryBtn = content.querySelector('.trace-retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            const traceData = TracingState.activeTraces[traceId];
            if (traceData) {
                resetAndRestartTrace(traceId);
            }
        });
    }
}

// Toggle minimize state of trace popover
function toggleMinimize(traceId) {
    const popover = document.getElementById(traceId);
    if (!popover) return;
    
    const content = popover.querySelector('.trace-popover-content');
    const toolbar = popover.querySelector('.trace-toolbar');
    const statusBar = popover.querySelector('.trace-status-bar');
    const resizeHandle = popover.querySelector('.trace-resize-handle');
    const minimizeButton = popover.querySelector('.trace-minimize-button');
    
    if (popover.classList.contains('minimized')) {
        // Restore
        popover.classList.remove('minimized');
        if (content) content.style.display = 'block';
        if (toolbar) toolbar.style.display = 'flex';
        if (statusBar) statusBar.style.display = 'flex';
        if (resizeHandle) resizeHandle.style.display = 'block';
        if (minimizeButton) {
            minimizeButton.innerHTML = '&#8722;'; // Minus sign
            minimizeButton.title = 'Minimize trace panel';
        }
    } else {
        // Minimize
        popover.classList.add('minimized');
        if (content) content.style.display = 'none';
        if (toolbar) toolbar.style.display = 'none';
        if (statusBar) statusBar.style.display = 'none';
        if (resizeHandle) resizeHandle.style.display = 'none';
        if (minimizeButton) {
            minimizeButton.innerHTML = '&#10548;'; // Up-right diagonal arrow (maximize)
            minimizeButton.title = 'Restore trace panel';
        }
    }
}

// Close a specific trace
function closeTrace(traceId) {
    // Cancel any in-progress tracing
    TracingState.tracingInProgress[traceId] = false;
    
    // Remove popover
    const popover = document.getElementById(traceId);
    if (popover) {
        popover.remove();
    }
    
    // Remove from active traces
    delete TracingState.activeTraces[traceId];
    delete TracingState.tracingInProgress[traceId];
}

// Close all traces
function closeAllTraces() {
    // Cancel all in-progress tracing
    Object.keys(TracingState.tracingInProgress).forEach(traceId => {
        TracingState.tracingInProgress[traceId] = false;
    });
    
    // Clear container
    const container = document.getElementById('trace-popover-container');
    if (container) {
        container.innerHTML = '';
    }
    
    // Clear trace data
    TracingState.activeTraces = {};
    TracingState.tracingInProgress = {};
}

// Make an element draggable by its handle
function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', dragMouseDown);
    
    function dragMouseDown(e) {
        e.preventDefault();
        
        // Bring to front
        bringToFront(element);
        
        // Get cursor position
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Add event listeners
        document.addEventListener('mousemove', elementDrag);
        document.addEventListener('mouseup', closeDragElement);
    }
    
    function elementDrag(e) {
        e.preventDefault();
        
        // Calculate new position
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Set element's new position
        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;
        
        // Keep within viewport
        element.style.top = `${Math.max(0, newTop)}px`;
        element.style.left = `${Math.max(0, newLeft)}px`;
    }
    
    function closeDragElement() {
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('mouseup', closeDragElement);
    }
}

// Make an element resizable
function makeResizable(element) {
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'trace-resize-handle';
    element.appendChild(resizeHandle);
    
    let startX, startY, startWidth, startHeight;
    
    resizeHandle.addEventListener('mousedown', initResize);
    
    function initResize(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Bring to front
        bringToFront(element);
        
        // Get starting dimensions
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
        
        // Add event listeners
        document.addEventListener('mousemove', resizeElement);
        document.addEventListener('mouseup', stopResize);
    }
    
    function resizeElement(e) {
        e.preventDefault();
        
        // Calculate new dimensions
        const newWidth = startWidth + e.clientX - startX;
        const newHeight = startHeight + e.clientY - startY;
        
        // Apply with minimum constraints
        element.style.width = `${Math.max(500, newWidth)}px`;
        element.style.height = `${Math.max(300, newHeight)}px`;
        
        // Update graph view if active
        const traceId = element.id;
        const traceData = TracingState.activeTraces[traceId];
        
        if (traceData && traceData.uiState.currentView === 'graph') {
            const content = element.querySelector('.trace-popover-content');
            const canvas = content?.querySelector('.trace-graph-canvas');
            
            if (canvas) {
                // Resize canvas
                canvas.width = content.clientWidth;
                canvas.height = content.clientHeight - 20;
                
                // Redraw graph
                renderGraphOnCanvas(traceId, canvas);
            }
        }
    }
    
    function stopResize() {
        document.removeEventListener('mousemove', resizeElement);
        document.removeEventListener('mouseup', stopResize);
    }
}

// Bring element to front
function bringToFront(element) {
    // Get all popovers
    const popovers = document.querySelectorAll('.trace-popover');
    
    // Find max z-index
    let maxZ = 0;
    popovers.forEach(p => {
        const zIndex = parseInt(window.getComputedStyle(p).zIndex) || 0;
        maxZ = Math.max(maxZ, zIndex);
    });
    
    // Set to max + 1
    element.style.zIndex = maxZ + 1;
}

// Helper to shorten address for display
function shortenAddress(address) {
    if (!address) return 'Unknown';
    if (address === 'Unknown') return address;
    
    const length = address.length;
    if (length <= 20) return address;
    
    return `${address.substring(0, 10)}...${address.substring(length - 10)}`;
}

// Add styling for trace buttons
function addTracingStyles() {
    // Check if styles already exist
    if (document.getElementById('tracing-styles')) return;
    
    // Create style element
    const style = document.createElement('style');
    style.id = 'tracing-styles';
    style.textContent = `
        /* Basic tracing button styles - remaining styles are in the main CSS */
        .trace-button {
            margin-left: 5px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 3px;
            padding: 2px 5px;
            font-size: 12px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .trace-button:hover {
            background-color: #45a049;
        }
    `;
    
    // Add to document head
    document.head.appendChild(style);
}

// Export public functions
window.tracing = {
    init: initTracing,
    addTraceButton,
    startNewTrace,
    closeAllTraces
};