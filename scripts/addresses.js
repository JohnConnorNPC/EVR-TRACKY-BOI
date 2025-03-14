// EVR Tracky Boi - Addresses Explorer Functionality

// Load addresses view (mostly a placeholder for search)
function loadAddressesView() {
    try {
        // Load the template if the view is empty
        const addressesView = document.getElementById('addresses-view');
        if (addressesView.innerHTML === '') {
            // Simple address search interface
            addressesView.innerHTML = `
                <div class="addresses-container">
                    <h2>Address Explorer</h2>
                    <div class="address-search-container">
                        <p>Enter an Evrmore address to view its details.</p>
                        <div class="address-search">
                            <input type="text" id="address-search-input" placeholder="Enter an Evrmore address...">
                            <button id="search-address">Search</button>
                        </div>
                    </div>
                    <div class="address-popular">
                        <h3>Examples</h3>
                        <p>Try these example addresses:</p>
                        <ul class="address-examples">
                            <li><a href="#" class="address-example">eHNUGzw8ZG9PGC8gKtnneyMaQXQTtAUm98</a></li>
                            <li><a href="#" class="address-example">ELBcgjWDFQGTMxotB8FRXBdkBccJCGiKmT</a></li>
                        </ul>
                    </div>
                </div>
            `;
            
            // Add event listeners
            document.getElementById('search-address').addEventListener('click', (e) => {
                e.preventDefault();
                const address = document.getElementById('address-search-input').value.trim();
                if (address) {
                    window.app.navigateToAddressDetails(address);
                } else {
                    UI.showNotification('Error', 'Please enter a valid Evrmore address.', 'error');
                }
            });
            
            document.getElementById('address-search-input').addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    const address = e.target.value.trim();
                    if (address) {
                        window.app.navigateToAddressDetails(address);
                    } else {
                        UI.showNotification('Error', 'Please enter a valid Evrmore address.', 'error');
                    }
                }
            });
            
            // Add example address click handlers
            document.querySelectorAll('.address-example').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const address = e.target.textContent.trim();
                    window.app.navigateToAddressDetails(address);
                });
            });
        }
    } catch (error) {
        console.error('Error loading addresses view:', error);
        UI.showNotification('Error', 'Failed to load addresses explorer.', 'error');
    }
}

// Display address details
async function displayAddressDetails(address) {
    try {
        // Get elements
        const addressEl = document.getElementById('address-detail-addr');
        const balanceEl = document.getElementById('address-detail-balance');
        const txCountEl = document.getElementById('address-detail-tx-count');
        const assetsTableEl = document.getElementById('address-assets-body');
        const txsTableEl = document.getElementById('address-txs-body');
        const pageInfoEl = document.getElementById('address-page-info');
        const prevPageBtn = document.getElementById('prev-address-page');
        const nextPageBtn = document.getElementById('next-address-page');
        
        // Show loading indicators only for basic info
        addressEl.textContent = address;
        balanceEl.textContent = 'Loading...';
        txCountEl.textContent = 'Loading...';
        assetsTableEl.innerHTML = '<tr><td colspan="2" class="loading-row">Loading assets...</td></tr>';
        
        // Get current page
        const page = window.app.appState.addressPagination.page;
        pageInfoEl.textContent = `Page ${page}`;
        prevPageBtn.disabled = page <= 1;
        
        // Fetch address details
        const addressDetails = await window.utilities.getAddressDetails(address, page);
        
        // Update address balance
        balanceEl.textContent = `${addressDetails.balance} EVR`;
        
        // Enable/disable pagination buttons
        nextPageBtn.disabled = !addressDetails.hasMore;
        
        // Display assets
        displayAddressAssets(addressDetails.assetBalances, assetsTableEl);
        
        // Get total transaction count - this is the fix!
        // First try to get it from the fullAddressData cache
        let totalTxCount = 0;
        const fullAddressData = await window.utilities.loadFromIndexedDB('addressFullData', address);
        if (fullAddressData && fullAddressData.allTxids) {
            totalTxCount = fullAddressData.allTxids.length;
        } else {
            // If not available in cache, make a specific call to get the total count
            try {
                const txids = await window.utilities.callRpc('getaddresstxids', [{ addresses: [address] }]);
                totalTxCount = txids.length;
            } catch (error) {
                console.warn('Could not get total transaction count:', error);
                // Fallback to page count if total count is unavailable
                totalTxCount = addressDetails.pageTxids ? addressDetails.pageTxids.length : 0;
            }
        }
        
        // Update the transaction count with the total (not just page count)
        txCountEl.textContent = totalTxCount.toString();
        
        // Track if transactions are loaded using a data attribute on the address view
        const addressView = document.getElementById('address-details-view');
        const txsLoaded = addressView.getAttribute('data-txs-loaded') === 'true';
        
        // Handle transaction section
        const txSection = document.querySelector('.address-txs');
        if (txSection) {
            // Remove any existing button containers to prevent duplicates
            const existingTxBtnContainer = txSection.querySelector('.load-data-btn-container');
            if (existingTxBtnContainer) {
                existingTxBtnContainer.remove();
            }
            
            if (txsLoaded) {
                // If already loaded, just update the transactions for the current page
                txsTableEl.innerHTML = '<tr><td colspan="6" class="loading-row">Loading transactions...</td></tr>';
                const txIds = addressDetails.pageTxids;
                await displayAddressTransactions(address, txIds, txsTableEl);
            } else {
                // If not loaded, show the load button
                const loadTxBtnContainer = document.createElement('div');
                loadTxBtnContainer.className = 'load-data-btn-container';
                loadTxBtnContainer.innerHTML = `
                    <button id="load-tx-btn" class="load-data-btn">
                        <i class="fas fa-sync-alt"></i> Load Transactions
                    </button>
                    <p class="load-data-note">Click to load transaction history (may take time for addresses with many transactions)</p>
                `;
                
                // Insert button before table
                const tableContainer = txSection.querySelector('.table-container');
                txSection.insertBefore(loadTxBtnContainer, tableContainer);
                
                // Clear table content and add message
                txsTableEl.innerHTML = '<tr><td colspan="6" class="info-row">Click "Load Transactions" to view transaction history</td></tr>';
                
                // Add click event listener
                document.getElementById('load-tx-btn').addEventListener('click', async (e) => {
                    e.preventDefault();
                    
                    // Update button state
                    const btn = e.target.closest('button');
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                    
                    // Show loading in table
                    txsTableEl.innerHTML = '<tr><td colspan="6" class="loading-row">Loading transactions...</td></tr>';
                    
                    try {
                        // Load transactions
                        const txIds = addressDetails.pageTxids;
                        await displayAddressTransactions(address, txIds, txsTableEl);
                        
                        // Mark transactions as loaded
                        addressView.setAttribute('data-txs-loaded', 'true');
                        
                        // Remove button container after loading
                        loadTxBtnContainer.remove();
                    } catch (error) {
                        console.error('Error loading transactions:', error);
                        txsTableEl.innerHTML = '<tr><td colspan="6" class="loading-row">Error loading transactions. <a href="#" id="retry-tx-load">Retry</a></td></tr>';
                        
                        // Add retry handler
                        document.getElementById('retry-tx-load').addEventListener('click', async (e) => {
                            e.preventDefault();
                            const txIds = addressDetails.pageTxids;
                            await displayAddressTransactions(address, txIds, txsTableEl);
                            addressView.setAttribute('data-txs-loaded', 'true');
                            loadTxBtnContainer.remove();
                        });
                        
                        // Reset button
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Load Transactions';
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error displaying address details:', error);
        UI.showNotification('Error', 'Failed to load address details.', 'error');
    }
}

// Display address assets
function displayAddressAssets(assetBalances, tableBody) {
    // Clear table
    tableBody.innerHTML = '';
    
    if (assetBalances.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="2" class="loading-row">No assets found</td></tr>';
      return;
    }
    
    // Sort assets alphabetically by name
    assetBalances.sort((a, b) => a.name.localeCompare(b.name));
    
    // Add asset rows
    assetBalances.forEach(asset => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="#" class="asset-link" data-asset="${asset.name}">${asset.name}</a></td>
        <td>${asset.amount}</td>
      `;
      tableBody.appendChild(row);
    });
    
    // Add click event listeners to asset links
    document.querySelectorAll('.asset-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const asset = link.getAttribute('data-asset');
        window.app.navigateToAssetDetails(asset);
      });
    });
}

// Display address transactions - Optimized version
async function displayAddressTransactions(address, txIds, tableBody) {
    // Clear table
    tableBody.innerHTML = '';
    
    if (!txIds || txIds.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="loading-row">No transactions found</td></tr>';
        return;
    }
    
    try {
        // Add progress indicator to improve user experience with many transactions
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-row">
                    Loading transactions... (0/${txIds.length})
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: 0%"></div>
                    </div>
                </td>
            </tr>
        `;
        
        // Create a promise-based transaction loader to handle the analysis
        const loadTransaction = async (txid, index) => {
            try {
                // Ensure txid is a string
                const txIdStr = typeof txid === 'string' ? txid : (txid.txid || '');
                if (!txIdStr) {
                    console.error(`Invalid transaction ID: ${txid}`);
                    return null;
                }
                
                // First check if we already have this transaction analyzed in the cache
                const cacheKey = `tx_analysis_${txIdStr}_${address}`;
                const cachedAnalysis = await window.utilities.loadFromIndexedDB('misc', cacheKey);
                
                if (cachedAnalysis && cachedAnalysis.result) {
                    // Update progress
                    updateLoadingProgress(index + 1, txIds.length);
                    return cachedAnalysis.result;
                }
                
                // Get transaction details
                const txDetails = await window.utilities.getTransactionDetails(txIdStr);
                if (!txDetails || !txDetails.tx) {
                    return null;
                }
                
                const tx = txDetails.tx;
                
                // Use optimized transaction analysis
                const txInfo = await analyzeTransactionForAddressOptimized(tx, address);
                
                // Create result object
                const result = {
                    tx,
                    type: txInfo.type,
                    balanceChange: txInfo.balanceChange,
                    confirmation: txDetails.confirmations
                };
                
                // Cache the analysis for future use
                await window.utilities.saveToIndexedDB('misc', {
                    id: cacheKey,
                    result,
                    timestamp: Date.now()
                });
                
                // Update progress
                updateLoadingProgress(index + 1, txIds.length);
                
                return result;
            } catch (error) {
                console.error(`Error processing transaction ${txid}:`, error);
                updateLoadingProgress(index + 1, txIds.length);
                return null;
            }
        };
        
        // Function to update the loading progress bar
        function updateLoadingProgress(current, total) {
            const percentage = Math.round((current / total) * 100);
            const loadingRow = tableBody.querySelector('.loading-row');
            if (loadingRow) {
                loadingRow.innerHTML = `
                    Loading transactions... (${current}/${total})
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${percentage}%"></div>
                    </div>
                `;
            }
        }
        
        // Process transactions in parallel batches
        const BATCH_SIZE = 10; // Increased from 5 to 10 for better parallelization
        const transactions = [];
        
        for (let i = 0; i < txIds.length; i += BATCH_SIZE) {
            const batch = txIds.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map((txid, idx) => loadTransaction(txid, i + idx))
            );
            
            // Filter out null results and add to transactions array
            batchResults.forEach(result => {
                if (result) transactions.push(result);
            });
        }
        
        // Clear the loading indicator
        tableBody.innerHTML = '';
        
        // Handle empty results
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="loading-row">No transactions found</td></tr>';
            return;
        }
        
        // Sort transactions by time (most recent first)
        transactions.sort((a, b) => {
            const timeA = a.tx.time || 0;
            const timeB = b.tx.time || 0;
            return timeB - timeA;
        });
        
        // Display transactions
        for (const tx of transactions) {
            // Calculate total value
            let totalValue = 0;
            tx.tx.vout.forEach(vout => {
                if (vout.value) totalValue += vout.value;
            });
            
            // Determine block info
            let blockInfo = tx.tx.blockheight ? `${tx.tx.blockheight.toLocaleString()}` : 'Mempool';
            
            // Create table row
            const row = document.createElement('tr');
            
            // Set row class based on transaction type
            if (tx.type === 'sent') {
                row.classList.add('tx-sent');
            } else if (tx.type === 'received') {
                row.classList.add('tx-received');
            } else {
                row.classList.add('tx-self');
            }
            
            row.innerHTML = `
                <td><a href="#" data-txid="${tx.tx.txid}" class="tx-link">${window.app.formatHash(tx.tx.txid)}</a></td>
                <td>${tx.tx.blockhash ? `<a href="#" data-block-hash="${tx.tx.blockhash}" class="block-link">${blockInfo}</a>` : blockInfo}</td>
                <td>${tx.tx.time ? window.app.formatTime(tx.tx.time) : 'Pending'}</td>
                <td>${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</td>
                <td>${totalValue.toFixed(8)} EVR</td>
                <td class="${tx.balanceChange > 0 ? 'balance-positive' : tx.balanceChange < 0 ? 'balance-negative' : ''}">${formatBalanceChange(tx.balanceChange)}</td>
            `;
            tableBody.appendChild(row);
        }
        
        // Add click event listeners
        document.querySelectorAll('.tx-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const txid = link.getAttribute('data-txid');
                window.app.navigateToTransactionDetails(txid);
            });
        });
        
        document.querySelectorAll('.block-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const blockHash = link.getAttribute('data-block-hash');
                window.app.navigateToBlockDetails(blockHash);
            });
        });
    } catch (error) {
        console.error('Error displaying address transactions:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="error-row">Error loading transactions. <a href="#" id="retry-tx-load">Retry</a></td></tr>';
        
        // Add retry handler
        document.getElementById('retry-tx-load').addEventListener('click', async (e) => {
            e.preventDefault();
            await displayAddressTransactions(address, txIds, tableBody);
        });
    }
}

// Optimized version of analyzeTransactionForAddress with better caching
async function analyzeTransactionForAddressOptimized(tx, address) {
    // Check cache first
    const cacheKey = `tx_analysis_quick_${tx.txid}_${address}`;
    const cachedAnalysis = await window.utilities.loadFromIndexedDB('misc', cacheKey);
    
    if (cachedAnalysis && cachedAnalysis.result) {
        return cachedAnalysis.result;
    }
    
    let isInput = false;
    let isOutput = false;
    let inputAmount = 0;
    let outputAmount = 0;
    
    // Check outputs - this is fast
    for (const vout of tx.vout) {
        if (vout.scriptPubKey) {
            if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.includes(address)) {
                isOutput = true;
                outputAmount += vout.value || 0;
            } else if (vout.scriptPubKey.address === address) {
                isOutput = true;
                outputAmount += vout.value || 0;
            }
        }
    }
    
    // Process inputs in parallel for better performance
    const vinPromises = tx.vin.map(async (vin) => {
        if (vin.coinbase) return { isInput: false, inputAmount: 0 }; // Skip coinbase inputs
        
        try {
            // Use a unique cache key for this specific input
            const inputCacheKey = `input_${vin.txid}_${vin.vout}_${address}`;
            const cachedInput = await window.utilities.loadFromIndexedDB('misc', inputCacheKey);
            
            if (cachedInput && cachedInput.result) {
                return cachedInput.result;
            }
            
            // Get previous transaction
            const prevTx = await window.utilities.getTransactionDetails(vin.txid);
            const prevVout = prevTx.tx.vout[vin.vout];
            
            let result = { isInput: false, inputAmount: 0 };
            
            if (prevVout && prevVout.scriptPubKey) {
                if (prevVout.scriptPubKey.addresses && prevVout.scriptPubKey.addresses.includes(address)) {
                    result = { isInput: true, inputAmount: prevVout.value || 0 };
                } else if (prevVout.scriptPubKey.address === address) {
                    result = { isInput: true, inputAmount: prevVout.value || 0 };
                }
            }
            
            // Cache this input analysis
            await window.utilities.saveToIndexedDB('misc', {
                id: inputCacheKey,
                result,
                timestamp: Date.now()
            });
            
            return result;
        } catch (error) {
            console.warn(`Error getting previous transaction ${vin.txid}:`, error);
            return { isInput: false, inputAmount: 0 };
        }
    });
    
    // Wait for all input analyses to complete
    const inputResults = await Promise.all(vinPromises);
    
    // Combine input results
    for (const result of inputResults) {
        if (result.isInput) {
            isInput = true;
            inputAmount += result.inputAmount;
        }
    }
    
    // Determine transaction type
    let type = 'unknown';
    if (isInput && isOutput) {
        type = 'self';
    } else if (isInput) {
        type = 'sent';
    } else if (isOutput) {
        type = 'received';
    }
    
    // Calculate balance change
    const balanceChange = outputAmount - inputAmount;
    
    const result = { type, balanceChange };
    
    // Cache the final analysis
    await window.utilities.saveToIndexedDB('misc', {
        id: cacheKey,
        result,
        timestamp: Date.now()
    });
    
    return result;
}

// Analyze transaction to determine type and balance change for an address
// Original function kept for compatibility with existing code
async function analyzeTransactionForAddress(tx, address) {
    let isInput = false;
    let isOutput = false;
    let inputAmount = 0;
    let outputAmount = 0;
    
    // Check outputs
    for (const vout of tx.vout) {
        if (vout.scriptPubKey) {
            if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.includes(address)) {
                isOutput = true;
                outputAmount += vout.value || 0;
            } else if (vout.scriptPubKey.address === address) {
                isOutput = true;
                outputAmount += vout.value || 0;
            }
        }
    }
    
    // Check inputs
    for (const vin of tx.vin) {
        if (vin.coinbase) continue; // Skip coinbase inputs
        
        try {
            // Get previous transaction
            const prevTx = await window.utilities.getTransactionDetails(vin.txid);
            const prevVout = prevTx.tx.vout[vin.vout];
            
            if (prevVout && prevVout.scriptPubKey) {
                if (prevVout.scriptPubKey.addresses && prevVout.scriptPubKey.addresses.includes(address)) {
                    isInput = true;
                    inputAmount += prevVout.value || 0;
                } else if (prevVout.scriptPubKey.address === address) {
                    isInput = true;
                    inputAmount += prevVout.value || 0;
                }
            }
        } catch (error) {
            console.warn(`Error getting previous transaction ${vin.txid}:`, error);
        }
    }
    
    // Determine transaction type
    let type = 'unknown';
    if (isInput && isOutput) {
        type = 'self';
    } else if (isInput) {
        type = 'sent';
    } else if (isOutput) {
        type = 'received';
    }
    
    // Calculate balance change
    const balanceChange = outputAmount - inputAmount;
    
    return { type, balanceChange };
}

// Format balance change with sign
function formatBalanceChange(change) {
    if (change === 0) return '0.00000000 EVR';
    
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(8)} EVR`;
}

// Export functions
window.addresses = {
    loadAddressesView,
    displayAddressDetails,
    displayAddressAssets,
    displayAddressTransactions,
    analyzeTransactionForAddress,
    analyzeTransactionForAddressOptimized
};