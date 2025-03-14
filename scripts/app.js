// EVR Tracky Boi - Main Application Script

// State management
const appState = {
    currentView: 'dashboard',
    currentBlockHeight: 0,
    blockPagination: { page: 1, perPage: 20 },
    transactionPagination: { page: 1, perPage: 20 },
    assetsPagination: { page: 1, perPage: 20 },
    currentAddress: null,
    addressPagination: { page: 1, perPage: 10 },
    currentAsset: null,
    assetHoldersPagination: { page: 1, perPage: 10 },
    // Add the asset holders sorting state
    assetHoldersSorting: { field: 'amount', direction: 'desc' },
    isConnected: true,
    cacheOptimizations: {}, // Track addresses that have been optimized
    lastViewedItems: [] // Track recently viewed items for potential background caching
};

document.addEventListener('DOMContentLoaded', function() {
    initializeApp().catch(error => {
        console.error('Application initialization error:', error);
        UI.showNotification('Connection Error', 'Failed to connect to the Evrmore network. Please check your connection and reload the page.', 'error');
    });

    document.getElementById('logo-link').addEventListener('click', function(e) {
        e.preventDefault();
        // Navigate to dashboard view
        window.app.navigateToView('dashboard');
    });

    
});

// Initialize function
async function initializeApp() {
    setupEventListeners();
    await updateNetworkStatus();
    
    // Initialize router before loading content
    if (window.router) {
        window.router.init();
    }
    
    // Initialize tracing functionality if available
    if (window.tracing && typeof window.tracing.init === 'function') {
        window.tracing.init();
    }
    
    // Only load dashboard if connected and no specific route is provided
    if (window.app.appState.isConnected) {
        // Default to dashboard only if there's no hash route
        if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#debug') {
            loadDashboard();
        }
        
        // Preload common data in background after short delay
        setTimeout(() => {
            window.utilities.preloadCommonData().then(() => {
                console.log("Cache preloading complete");
            });
        }, 2000);
    } else {
        document.getElementById('dashboard-view').innerHTML = `
            <div class="connection-error">
                <h2>Connection Error</h2>
                <p>Unable to connect to the Evrmore network.</p>
                <p>Please check your connection and try again.</p>
                <button id="retry-connection">Retry Connection</button>
            </div>
        `;
        
        document.getElementById('retry-connection').addEventListener('click', async () => {
            try {
                await updateNetworkStatus();
                if (window.app.appState.isConnected) {
                    loadDashboard();
                }
            } catch (error) {
                console.error('Retry connection error:', error);
                UI.showNotification('Connection Error', 'Still unable to connect to the Evrmore network.', 'error');
            }
        });
    }
    
    setInterval(updateNetworkStatus, 30000); // Update every 30 seconds

    setInterval(function() {
        // 1. Clean up stale requests (older than 30 seconds)
        if (window.utilities && window.utilities.currentRpcRequests) {
            const now = Date.now();
            const timeoutThreshold = 30000; // 30 seconds
            window.utilities.currentRpcRequests = window.utilities.currentRpcRequests.filter(req => {
                return !req.timestamp || (now - req.timestamp) < timeoutThreshold;
            });
        }
        
        // 2. Update the UI
        if (window.ui && typeof window.ui.updateRpcStatus === 'function') {
            window.ui.updateRpcStatus();
        } else {
            // Fallback if UI module isn't available
            const rpcCount = document.getElementById('rpc-count');
            if (rpcCount && window.utilities && window.utilities.currentRpcRequests) {
                rpcCount.textContent = window.utilities.currentRpcRequests.length.toString();
            }
        }
    }, 1000); // Update every second
}

// Setup event listeners with updated navigation support
function setupEventListeners() {
    // Navigation menu
    document.querySelectorAll('.main-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            navigateToView(view);
        });
    });

    // Search form
    document.getElementById('search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const searchTerm = document.getElementById('search-input').value.trim();
        if (searchTerm) {
            search(searchTerm);
        }
    });

    // Clear cache button
    document.getElementById('clear-cache').addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Show loading notification
        UI.showNotification('Cache', 'Clearing cache...', 'info');
        
        // Clear all caches
        const success = await window.utilities.clearAllCaches();
        
        if (success) {
            UI.showNotification('Cache', 'Cache cleared successfully!', 'success');
            // Reload after short delay
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            UI.showNotification('Cache', 'Failed to clear cache.', 'error');
        }
    });

    // View more links
    document.querySelectorAll('.view-more a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            navigateToView(view);
        });
    });

    // Add cache stats display if debug mode is enabled
    if (location.hash === '#debug') {
        const footer = document.querySelector('.footer-info');
        const statsElement = document.createElement('p');
        statsElement.id = 'cache-stats';
        statsElement.innerHTML = 'Cache stats: Loading...';
        footer.appendChild(statsElement);
        
        // Update stats periodically
        setInterval(() => {
            const stats = window.utilities.getCacheStats();
            document.getElementById('cache-stats').innerHTML = 
                `Cache: ${stats.hits} hits, ${stats.misses} misses (${Math.round(stats.ratio * 100)}% hit rate)`;
        }, 5000);
    }
}

// Navigation function
function navigateToView(viewName, updateHash = true) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active-view');
    });
    
    // Show selected view
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add('active-view');
        
        // Update active nav link
        document.querySelectorAll('.main-nav a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-view') === viewName) {
                link.classList.add('active');
            }
        });
        
        // Load view content
        appState.currentView = viewName;
        
        // Update URL hash if enabled
        if (updateHash && window.router) {
            window.router.navigateToView(viewName);
        }
        
        switch (viewName) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'blocks':
                if (window.blocks && typeof window.blocks.loadBlocksView === 'function') {
                    window.blocks.loadBlocksView();
                } else {
                    console.error("Blocks module not loaded correctly");
                    UI.showNotification('Error', 'Unable to load Blocks view. Try reloading the page.', 'error');
                }
                break;
            case 'transactions':
                if (window.transactions && typeof window.transactions.loadTransactionsView === 'function') {
                    window.transactions.loadTransactionsView();
                } else {
                    console.error("Transactions module not loaded correctly");
                    UI.showNotification('Error', 'Unable to load Transactions view. Try reloading the page.', 'error');
                }
                break;
            case 'addresses':
                if (window.addresses && typeof window.addresses.loadAddressesView === 'function') {
                    window.addresses.loadAddressesView();
                } else {
                    console.error("Addresses module not loaded correctly");
                    UI.showNotification('Error', 'Unable to load Addresses view. Try reloading the page.', 'error');
                }
                break;
            case 'assets':
                if (window.assets && typeof window.assets.loadAssetsView === 'function') {
                    window.assets.loadAssetsView();
                } else {
                    console.error("Assets module not loaded correctly");
                    UI.showNotification('Error', 'Unable to load Assets view. Try reloading the page.', 'error');
                }
                break;
        }
    }
}


// Handle search
async function search(term) {
    // Reset search input
    document.getElementById('search-input').value = '';
    
    // Determine what type of search term this is
    if (/^[0-9]+$/.test(term)) {
        // Numeric - could be a block height
        const blockHeight = parseInt(term);
        try {
            const blockHash = await window.utilities.getBlockHash(blockHeight);
            navigateToBlockDetails(blockHash);
            return;
        } catch (error) {
            console.log('Not a valid block height');
        }
    }
    
    if (/^[a-fA-F0-9]{64}$/.test(term)) {
        // 64 character hex string - could be block hash or txid
        try {
            // Try as block hash first
            await window.utilities.getBlock(term);
            navigateToBlockDetails(term);
            return;
        } catch (blockError) {
            try {
                // Try as transaction ID
                await window.utilities.getTransactionDetails(term);
                navigateToTransactionDetails(term);
                return;
            } catch (txError) {
                console.log('Not a valid block hash or transaction ID');
            }
        }
    }
    
    // Check if it's an Evrmore address
    if (/^[E][a-km-zA-HJ-NP-Z1-9]{33}$/.test(term)) {
        navigateToAddressDetails(term);
        return;
    }
    
    // Check if it's an asset name
    try {
        const assetData = await window.utilities.getAssetData(term);
        if (assetData) {
            navigateToAssetDetails(term);
            return;
        }
    } catch (error) {
        console.log('Not a valid asset name');
    }
    
    // If we get here, we couldn't identify the search term
    UI.showNotification('Not Found', `Could not identify "${term}" as a valid block, transaction, address, or asset.`, 'error');
}

// Update network status display
async function updateNetworkStatus() {
    try {
        const blockHeight = await window.utilities.getBlockCount();
        appState.currentBlockHeight = blockHeight;
        
        document.getElementById('block-height').innerHTML = `<i class="fas fa-cube"></i> Block Height: ${blockHeight.toLocaleString()}`;
        document.getElementById('connection-status').innerHTML = `<i class="fas fa-plug"></i> Connected`;
        document.getElementById('connection-status').style.color = 'var(--success-color)';
        
        appState.isConnected = true;
    } catch (error) {
        document.getElementById('connection-status').innerHTML = `<i class="fas fa-plug"></i> Disconnected`;
        document.getElementById('connection-status').style.color = 'var(--danger-color)';
        
        appState.isConnected = false;
    }
}

// Dashboard
async function loadDashboard() {
    // Only load if we're on the dashboard view
    if (appState.currentView !== 'dashboard') return;
    
    try {
        // Network stats
        const [difficulty, mempoolInfo, chainInfo, networkHashPs] = await Promise.all([
            window.utilities.getDifficulty(),
            window.utilities.getMempoolInfo(),
            window.utilities.getBlockChainInfo(),
            window.utilities.getNetworkHashPs()
        ]);
        
        document.getElementById('dash-block-height').textContent = appState.currentBlockHeight.toLocaleString();
        document.getElementById('dash-difficulty').textContent = difficulty.toLocaleString();
        document.getElementById('dash-hashrate').textContent = formatHashrate(networkHashPs);
        document.getElementById('dash-mempool-size').textContent = formatBytes(mempoolInfo.bytes);
        document.getElementById('dash-mempool-tx').textContent = mempoolInfo.size.toLocaleString();
        document.getElementById('dash-chain-work').textContent = chainInfo.chainwork;
        
        // Latest blocks
        const blocksData = await window.utilities.getLatestBlocksMetadata(null, 5);
        displayLatestBlocks(blocksData.metadatas);
        
        // Latest transactions
        await loadLatestTransactions();
        
        // Mempool activity chart
        createMempoolChart();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        UI.showNotification('Error', 'Failed to load dashboard data.', 'error');
    }
}

// Display latest blocks in dashboard
function displayLatestBlocks(blocks) {
    const tbody = document.getElementById('latest-blocks-body');
    tbody.innerHTML = '';
    
    if (blocks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No blocks found</td></tr>';
        return;
    }
    
    blocks.forEach(block => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><a href="#" data-block-hash="${block.hash}" class="block-link">${block.height.toLocaleString()}</a></td>
            <td><span class="truncate-hash">${formatHash(block.hash)}</span></td>
            <td>${formatTime(block.time)}</td>
            <td>${block.tx_count ? block.tx_count.toLocaleString() : 'Loading...'}</td>
            <td>${block.size ? formatBytes(block.size) : 'Loading...'}</td>
        `;
        tbody.appendChild(row);
        
        // If tx_count or size is missing, load asynchronously (but only if missing)
        if (!block.tx_count || !block.size) {
            (async () => {
                try {
                    const blockDetails = await window.utilities.getBlock(block.hash);
                    if (!block.tx_count) row.cells[3].textContent = blockDetails.tx.length.toLocaleString();
                    if (!block.size) row.cells[4].textContent = formatBytes(blockDetails.size);
                } catch (error) {
                    console.error(`Error loading details for block ${block.hash}:`, error);
                    if (!block.tx_count) row.cells[3].textContent = 'Error';
                    if (!block.size) row.cells[4].textContent = 'Error';
                }
            })();
        }
    });
    
    // Add click event listeners to block links
    document.querySelectorAll('.block-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const blockHash = link.getAttribute('data-block-hash');
            navigateToBlockDetails(blockHash);
        });
    });
}

// Load latest transactions for dashboard
async function loadLatestTransactions() {
    const tbody = document.getElementById('latest-txs-body');
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Loading transactions...</td></tr>';
    
    try {
        // First get latest block
        const latestBlockHash = await window.utilities.getBestBlockHash();
        const latestBlock = await window.utilities.getBlock(latestBlockHash);
        
        // Get a sample of transactions from the latest block
        // Handle both cases where tx can be an array of strings (txids) or an array of transaction objects
        const txids = latestBlock.tx.slice(0, 5).map(tx => typeof tx === 'string' ? tx : tx.txid);
        const transactions = await Promise.all(txids.map(txid => window.utilities.getTransactionDetails(txid)));
        
        tbody.innerHTML = '';
        
        transactions.forEach(txData => {
            const { tx } = txData;
            
            // Calculate total value
            let totalValue = 0;
            tx.vout.forEach(vout => {
                if (vout.value) totalValue += vout.value;
            });
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><a href="#" data-txid="${tx.txid}" class="tx-link">${formatHash(tx.txid)}</a></td>
                <td>${formatTime(tx.time || Date.now() / 1000)}</td>
                <td>${totalValue.toFixed(8)} EVR</td>
                <td><span class="status-badge status-confirmed">Confirmed</span></td>
            `;
            tbody.appendChild(row);
        });
        
        // Add mempool transactions if available
        const mempool = await window.utilities.getRawMempool(true);
        const mempoolTxids = Object.keys(mempool).slice(0, 5);
        
        if (mempoolTxids.length > 0) {
            for (const txid of mempoolTxids) {
                const tx = await window.utilities.getTransactionDetails(txid);
                
                // Calculate total value
                let totalValue = 0;
                tx.tx.vout.forEach(vout => {
                    if (vout.value) totalValue += vout.value;
                });
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><a href="#" data-txid="${tx.tx.txid}" class="tx-link">${formatHash(tx.tx.txid)}</a></td>
                    <td>${formatTime(mempool[txid].time)}</td>
                    <td>${totalValue.toFixed(8)} EVR</td>
                    <td><span class="status-badge status-pending">Pending</span></td>
                `;
                tbody.appendChild(row);
            }
        }
        
        // Add click event listeners to transaction links
        document.querySelectorAll('.tx-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const txid = link.getAttribute('data-txid');
                navigateToTransactionDetails(txid);
            });
        });
    } catch (error) {
        console.error('Error loading latest transactions:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Error loading transactions</td></tr>';
    }
}

// Create mempool chart
function createMempoolChart() {
    const ctx = document.getElementById('mempool-chart').getContext('2d');
    
    // Placeholder data - in a real application, you'd query historical mempool data
    const labels = Array.from({ length: 24 }, (_, i) => `${(23 - i)} hr ago`).reverse();
    const data = {
        labels: labels,
        datasets: [{
            label: 'Mempool Size (Tx Count)',
            data: Array.from({ length: 24 }, () => Math.floor(Math.random() * 100) + 50),
            borderColor: 'rgba(52, 152, 219, 1)',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            fill: true,
            tension: 0.4
        }]
    };
    
    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    };
    
    // Destroy existing chart if it exists
    if (window.mempoolChart) {
        window.mempoolChart.destroy();
    }
    
    window.mempoolChart = new Chart(ctx, config);
    
    // Update mempool stats
    document.getElementById('mempool-pending').textContent = data.datasets[0].data[data.datasets[0].data.length - 1].toLocaleString();
    document.getElementById('mempool-fees').textContent = `${(Math.random() * 0.1).toFixed(8)} EVR`;
}

// Navigate to block details
async function navigateToBlockDetails(blockHash, updateHash = true) {
    try {
        // Load the block details template if it's not already loaded
        const blockDetailsView = document.getElementById('block-details-view');
        if (blockDetailsView.innerHTML === '') {
            const template = document.getElementById('block-details-template');
            blockDetailsView.innerHTML = template.innerHTML;
            
            // Add back button event listener
            blockDetailsView.querySelector('#back-to-blocks').addEventListener('click', (e) => {
                e.preventDefault();
                navigateToView('blocks');
            });
        }
        
        // Hide all views and show block details
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active-view');
        });
        blockDetailsView.classList.add('active-view');
        
        // Update active nav
        document.querySelectorAll('.main-nav a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-view') === 'blocks') {
                link.classList.add('active');
            }
        });
        
        // Update URL hash if enabled
        if (updateHash && window.router) {
            window.router.navigateToBlock(blockHash);
        }
        
        // Add to recently viewed items
        addToRecentlyViewed({type: 'block', id: blockHash});
        
        // Load and display block details
        await displayBlockDetails(blockHash);
    } catch (error) {
        console.error('Error navigating to block details:', error);
        UI.showNotification('Error', 'Failed to load block details.', 'error');
        navigateToView('blocks');
    }
}


// Navigate to transaction details
async function navigateToTransactionDetails(txid, updateHash = true) {
    try {
        // Load the transaction details template if it's not already loaded
        const txDetailsView = document.getElementById('transaction-details-view');
        if (txDetailsView.innerHTML === '') {
            const template = document.getElementById('transaction-details-template');
            txDetailsView.innerHTML = template.innerHTML;
            
            // Add back button event listener
            txDetailsView.querySelector('#back-to-transactions').addEventListener('click', (e) => {
                e.preventDefault();
                navigateToView('transactions');
            });
            
            // Add toggle raw tx button event listener
            txDetailsView.querySelector('#toggle-raw-tx').addEventListener('click', (e) => {
                const rawTxData = document.getElementById('raw-tx-data');
                const toggleBtn = document.getElementById('toggle-raw-tx');
                
                if (rawTxData.classList.contains('hidden')) {
                    rawTxData.classList.remove('hidden');
                    toggleBtn.textContent = 'Hide Raw Data';
                } else {
                    rawTxData.classList.add('hidden');
                    toggleBtn.textContent = 'Show Raw Data';
                }
            });
        }
        
        // Hide all views and show transaction details
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active-view');
        });
        txDetailsView.classList.add('active-view');
        
        // Update active nav
        document.querySelectorAll('.main-nav a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-view') === 'transactions') {
                link.classList.add('active');
            }
        });
        
        // Update URL hash if enabled
        if (updateHash && window.router) {
            window.router.navigateToTransaction(txid);
        }
        
        // Add to recently viewed items
        addToRecentlyViewed({type: 'transaction', id: txid});
        
        // Load and display transaction details
        await displayTransactionDetails(txid);
    } catch (error) {
        console.error('Error navigating to transaction details:', error);
        UI.showNotification('Error', 'Failed to load transaction details.', 'error');
        navigateToView('transactions');
    }
}


// Navigate to address details with enhanced caching
// Modification to navigateToAddressDetails function in app.js to remove the optimization notifications

async function navigateToAddressDetails(address, updateHash = true) {
    try {
        // Load the address details template if it's not already loaded
        const addressDetailsView = document.getElementById('address-details-view');
        if (addressDetailsView.innerHTML === '') {
            const template = document.getElementById('address-details-template');
            addressDetailsView.innerHTML = template.innerHTML;
            
            // Add back button event listener
            addressDetailsView.querySelector('#back-to-addresses').addEventListener('click', (e) => {
                e.preventDefault();
                navigateToView('addresses');
            });
            
            // Add pagination event listeners
            addressDetailsView.querySelector('#prev-address-page').addEventListener('click', (e) => {
                e.preventDefault();
                if (appState.addressPagination.page > 1) {
                    appState.addressPagination.page--;
                    displayAddressDetails(appState.currentAddress);
                }
            });
            
            addressDetailsView.querySelector('#next-address-page').addEventListener('click', (e) => {
                e.preventDefault();
                appState.addressPagination.page++;
                displayAddressDetails(appState.currentAddress);
            });
        }
        
        // Hide all views and show address details
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active-view');
        });
        addressDetailsView.classList.add('active-view');
        
        // Update active nav
        document.querySelectorAll('.main-nav a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-view') === 'addresses') {
                link.classList.add('active');
            }
        });
        
        // Update URL hash if enabled
        if (updateHash && window.router) {
            window.router.navigateToAddress(address);
        }
        
        // Reset pagination and store current address
        appState.addressPagination.page = 1;
        appState.currentAddress = address;
        
        // Add to recently viewed items
        addToRecentlyViewed({type: 'address', id: address});
        
        // Load and display address details
        await displayAddressDetails(address);
        
        // Run cache optimization in background if not yet done for this address
        if (!appState.cacheOptimizations[address]) {
            setTimeout(() => {
                // Run optimization silently without notifications
                window.utilities.optimizeAddressCache(address).then(success => {
                    if (success) {
                        appState.cacheOptimizations[address] = true;
                        console.log(`Cache optimized for address ${address}`);
                        
                        // Refresh the address details to show the optimized data
                        displayAddressDetails(address);
                    }
                });
            }, 1000);
        }
    } catch (error) {
        console.error('Error navigating to address details:', error);
        UI.showNotification('Error', 'Failed to load address details.', 'error');
        navigateToView('addresses');
    }
}


// Navigate to asset details with enhanced caching
async function navigateToAssetDetails(assetName, updateHash = true) {
    try {
        console.log("Navigating to asset details for:", assetName);
        
        // Load the asset details template if it's not already loaded
        const assetDetailsView = document.getElementById('asset-details-view');
        if (!assetDetailsView) {
            console.error("asset-details-view element not found in the DOM");
            UI.showNotification('Error', 'The asset details view is missing. Please reload the page.', 'error');
            return;
        }
        
        // Check if the view is empty and load template
        if (assetDetailsView.innerHTML === '') {
            console.log("Loading asset details template");
            const template = document.getElementById('asset-details-template');
            if (!template) {
                console.error("asset-details-template not found in the DOM");
                UI.showNotification('Error', 'The asset template is missing. Please reload the page.', 'error');
                return;
            }
            
            // Add the template content
            assetDetailsView.innerHTML = template.innerHTML;
            
            // Use a small delay to ensure the DOM is updated
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Add back button event listener
            const backButton = assetDetailsView.querySelector('#back-to-assets');
            if (backButton) {
                backButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigateToView('assets');
                });
            } else {
                console.warn("back-to-assets button not found in the template");
            }
            
            // Add pagination event listeners
            const prevHoldersBtn = assetDetailsView.querySelector('#prev-holders-page');
            const nextHoldersBtn = assetDetailsView.querySelector('#next-holders-page');
            
            if (prevHoldersBtn) {
                prevHoldersBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (appState.assetHoldersPagination.page > 1) {
                        appState.assetHoldersPagination.page--;
                        // Update URL to reflect new page
                        if (window.router) {
                            window.router.navigateToAsset(appState.currentAsset, appState.assetHoldersPagination.page);
                        }
                        window.assets.displayAssetHolders(appState.currentAsset);
                    }
                });
            }
            
            if (nextHoldersBtn) {
                nextHoldersBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    appState.assetHoldersPagination.page++;
                    // Update URL to reflect new page
                    if (window.router) {
                        window.router.navigateToAsset(appState.currentAsset, appState.assetHoldersPagination.page);
                    }
                    window.assets.displayAssetHolders(appState.currentAsset);
                });
            }
            
        }
        
        // Hide all views and show asset details
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active-view');
        });
        assetDetailsView.classList.add('active-view');
        
        // Update active nav
        document.querySelectorAll('.main-nav a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-view') === 'assets') {
                link.classList.add('active');
            }
        });
        
        // Normalize asset name to uppercase
        const normalizedAssetName = assetName.toUpperCase();
        
        // Update URL hash if enabled
        if (updateHash && window.router) {
            window.router.navigateToAsset(normalizedAssetName);
        }
        
        // Reset pagination and store current asset
        appState.assetHoldersPagination.page = 1;
        appState.currentAsset = normalizedAssetName;
        
        // Add to recently viewed items
        addToRecentlyViewed({type: 'asset', id: normalizedAssetName});
        
        // Ensure the template content is fully rendered before proceeding
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Load and display asset details
        if (window.assets && typeof window.assets.displayAssetDetails === 'function') {
            await window.assets.displayAssetDetails(normalizedAssetName);
        } else {
            console.error("assets.displayAssetDetails function not found");
            UI.showNotification('Error', 'Failed to load asset details function.', 'error');
        }
    } catch (error) {
        console.error('Error navigating to asset details:', error);
        UI.showNotification('Error', `Failed to load asset details: ${error.message}`, 'error');
        navigateToView('assets');
    }
}

// Add to recently viewed items list (for potential background caching)
function addToRecentlyViewed(item) {
    // Remove this item if it's already in the list
    appState.lastViewedItems = appState.lastViewedItems.filter(i => 
        !(i.type === item.type && i.id === item.id));
    
    // Add to the front of the list
    appState.lastViewedItems.unshift(item);
    
    // Limit to 10 items
    if (appState.lastViewedItems.length > 10) {
        appState.lastViewedItems.pop();
    }
}

// Utility functions

// Format hash for display (truncate in middle)
function formatHash(hash) {
    if (!hash) return '';
    return `${hash.substring(0, 10)}...${hash.substring(hash.length - 10)}`;
}

// Format timestamp to readable date/time
function formatTime(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return moment(date).fromNow();
}

// Format bytes to KB, MB, etc.
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format hashrate
function formatHashrate(hashrate) {
    if (hashrate === 0) return '0 H/s';
    const k = 1000;
    const sizes = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
    const i = Math.floor(Math.log(hashrate) / Math.log(k));
    return parseFloat((hashrate / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Expose functions to window for other scripts
window.app = {
    navigateToView,
    navigateToBlockDetails,
    navigateToTransactionDetails,
    navigateToAddressDetails,
    navigateToAssetDetails,
    formatHash,
    formatTime,
    formatBytes,
    formatHashrate,
    appState
};