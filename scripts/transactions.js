// EVR Tracky Boi - Transactions Explorer Functionality

// Load transactions view
function loadTransactionsView() {
    try {
        // Load the template if the view is empty
        const txView = document.getElementById('transactions-view');
        if (txView.innerHTML === '') {
            const template = document.getElementById('transactions-template');
            txView.innerHTML = template.innerHTML;
            
            // Add event listeners
            document.getElementById('show-mempool').addEventListener('change', (e) => {
                const mempoolSection = document.querySelector('.mempool-section');
                if (mempoolSection) {
                    if (e.target.checked) {
                        mempoolSection.style.display = 'block';
                        loadMempoolTransactions();
                    } else {
                        mempoolSection.style.display = 'none';
                    }
                }
            });
        }
        
        // Load latest blocks and their transactions
        loadRecentTransactions();
        
        // Load mempool transactions if checkbox is checked
        const showMempool = document.getElementById('show-mempool');
        if (showMempool && showMempool.checked) {
            loadMempoolTransactions();
        }
    } catch (error) {
        console.error('Error loading transactions view:', error);
        window.ui.showNotification('Error', 'Failed to load transactions.', 'error');
    }
}

// Load recent transactions from the latest blocks
async function loadRecentTransactions() {
    const tbody = document.getElementById('transactions-table-body');
    
    // Show loading indicator
    tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Loading transactions...</td></tr>';
    
    try {
        // Get current blockchain height
        const currentHeight = await window.utilities.getBlockCount();
        
        // Number of recent blocks to scan
        const BLOCKS_TO_SCAN = 2;
        const transactionsToShow = [];
        
        // Scan recent blocks for transactions
        for (let height = currentHeight; height > currentHeight - BLOCKS_TO_SCAN && height >= 0; height--) {
            try {
                const blockHash = await window.utilities.getBlockHash(height);
                const block = await window.utilities.getBlock(blockHash);
                
                // Take a subset of transactions from each block
                const blockTransactions = block.tx.slice(0, 10);
                
                // Get transaction details
                for (const tx of blockTransactions) {
                    if (transactionsToShow.length >= 20) break; // Limit to 20 transactions
                    
                    try {
                        // Handle both cases where tx can be a string (txid) or a transaction object
                        const txid = typeof tx === 'string' ? tx : tx.txid;
                        const txDetails = await window.utilities.getTransactionDetails(txid);
                        transactionsToShow.push({
                            tx: txDetails.tx,
                            blockheight: height,
                            confirmations: txDetails.confirmations
                        });
                    } catch (txError) {
                        console.error(`Error processing transaction in block ${height}:`, txError);
                    }
                }
            } catch (blockError) {
                console.error(`Error processing block at height ${height}:`, blockError);
            }
            
            if (transactionsToShow.length >= 20) break;
        }
        
        // Clear table and display transactions
        tbody.innerHTML = '';
        
        if (transactionsToShow.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No transactions found</td></tr>';
            return;
        }
        
        // Add transactions to table
        transactionsToShow.forEach(txData => {
            const tx = txData.tx;
            const blockheight = txData.blockheight;
            const confirmations = txData.confirmations;
            
            // Calculate total input/output value
            let totalInputValue = 0;
            let totalOutputValue = 0;
            let containsAssets = false;
            
            // Check if transaction has assets
            for (const vout of tx.vout) {
                if (vout.scriptPubKey && vout.scriptPubKey.asset) {
                    containsAssets = true;
                }
                if (vout.value) {
                    totalOutputValue += vout.value;
                }
            }
            
            // Calculate input values (more complex due to need to look up previous tx outputs)
            // For simplicity, we'll just display output values
            
            // Create table row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><a href="#" data-txid="${tx.txid}" class="tx-link">${window.app.formatHash(tx.txid)}</a></td>
                <td><a href="#" data-block-hash="${tx.blockhash}" class="block-link">${blockheight.toLocaleString()}</a></td>
                <td>${window.app.formatTime(tx.time)}</td>
                <td>${tx.vin.length}</td>
                <td>${tx.vout.length}</td>
                <td>${totalOutputValue.toFixed(8)} EVR ${containsAssets ? '<i class="fas fa-cube" title="Contains Assets"></i>' : ''}</td>
                <td><span class="status-badge status-confirmed">${confirmations} Confirmations</span></td>
            `;
            tbody.appendChild(row);
        });
        
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
        console.error('Error loading recent transactions:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Error loading transactions</td></tr>';
    }
}

// Load mempool transactions
async function loadMempoolTransactions() {
    const tbody = document.getElementById('mempool-table-body');
    
    // Show loading indicator
    tbody.innerHTML = '<tr><td colspan="5" class="loading-row">Loading mempool transactions...</td></tr>';
    
    try {
        // Get mempool transactions
        const mempool = await window.utilities.getRawMempool(true);
        const mempoolTxids = Object.keys(mempool);
        
        // Clear table
        tbody.innerHTML = '';
        
        if (mempoolTxids.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No transactions in mempool</td></tr>';
            return;
        }
        
        // Display first 20 mempool transactions
        const txidsToShow = mempoolTxids.slice(0, 20);
        
        // Add mempool transactions to table
        for (const txid of txidsToShow) {
            try {
                const mempoolInfo = mempool[txid];
                
                // Get transaction details
                const txDetails = await window.utilities.getTransactionDetails(txid);
                const tx = txDetails.tx;
                
                // Calculate fee and fee rate
                const fee = mempoolInfo.fee || 0;
                const feeRate = fee / (tx.size / 1000);
                
                // Create table row
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><a href="#" data-txid="${txid}" class="tx-link">${window.app.formatHash(txid)}</a></td>
                    <td>${window.app.formatTime(mempoolInfo.time)}</td>
                    <td>${tx.size.toLocaleString()}</td>
                    <td>${fee.toFixed(8)}</td>
                    <td>${feeRate.toFixed(8)}</td>
                `;
                tbody.appendChild(row);
            } catch (error) {
                console.error(`Error processing mempool transaction ${txid}:`, error);
            }
        }
        
        // Add click event listeners to transaction links
        document.querySelectorAll('.tx-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const txid = link.getAttribute('data-txid');
                window.app.navigateToTransactionDetails(txid);
            });
        });
    } catch (error) {
        console.error('Error loading mempool transactions:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="loading-row">Error loading mempool transactions</td></tr>';
    }
}

// Display transaction details
async function displayTransactionDetails(txid) {
    try {
        // Get elements
        const txIdEl = document.getElementById('tx-detail-id');
        const txBlockEl = document.getElementById('tx-detail-block');
        const txTimeEl = document.getElementById('tx-detail-time');
        const txSizeEl = document.getElementById('tx-detail-size');
        const txFeeEl = document.getElementById('tx-detail-fee');
        const txInputCountEl = document.getElementById('tx-input-count');
        const txOutputCountEl = document.getElementById('tx-output-count');
        const txInputsListEl = document.getElementById('tx-inputs-list');
        const txOutputsListEl = document.getElementById('tx-outputs-list');
        const txAssetsListEl = document.getElementById('tx-assets-list');
        const rawTxDataEl = document.getElementById('raw-tx-data');
        
        // Show loading indicators
        txIdEl.textContent = 'Loading...';
        txBlockEl.textContent = 'Loading...';
        txTimeEl.textContent = 'Loading...';
        txSizeEl.textContent = 'Loading...';
        txFeeEl.textContent = 'Loading...';
        txInputCountEl.textContent = '...';
        txOutputCountEl.textContent = '...';
        txInputsListEl.innerHTML = '<div class="loading-row">Loading inputs...</div>';
        txOutputsListEl.innerHTML = '<div class="loading-row">Loading outputs...</div>';
        txAssetsListEl.innerHTML = '<div class="loading-row">Loading assets...</div>';
        rawTxDataEl.textContent = 'Loading...';
        
        // Update transaction status
        window.ui.updateTxStatus('Loading...');
        
        // Fetch transaction details
        const txDetails = await window.utilities.getTransactionDetails(txid);
        
        // Ensure we have valid transaction data
        if (!txDetails || !txDetails.tx) {
            throw new Error('Invalid transaction data received');
        }
        
        const { tx, confirmations } = txDetails;
        
        // Update transaction details
        txIdEl.textContent = tx.txid;
        
        // Set block info if confirmed
        if (tx.blockhash) {
            txBlockEl.textContent = tx.blockheight ? tx.blockheight.toLocaleString() : 'Confirmed';
            txBlockEl.setAttribute('data-block-hash', tx.blockhash);
            txBlockEl.addEventListener('click', (e) => {
                e.preventDefault();
                window.app.navigateToBlockDetails(tx.blockhash);
            });
        } else {
            txBlockEl.textContent = 'Unconfirmed (Mempool)';
        }
        
        // Set time
        if (tx.time) {
            const txDate = new Date(tx.time * 1000);
            txTimeEl.textContent = `${txDate.toLocaleString()} (${window.app.formatTime(tx.time)})`;
        } else {
            txTimeEl.textContent = 'Pending';
        }
        
        // Update size, fee, and counts
        txSizeEl.textContent = `${tx.size.toLocaleString()} bytes`;
        
        // Calculate fee (for simplicity, we'll just show "N/A" as calculating the fee requires looking up input values)
        txFeeEl.textContent = 'Calculating...';
        calculateTxFee(tx).then(fee => {
            txFeeEl.textContent = fee !== null ? `${fee.toFixed(8)} EVR` : 'N/A';
        });
        
        txInputCountEl.textContent = tx.vin.length;
        txOutputCountEl.textContent = tx.vout.length;
        
        // Update transaction status
        window.ui.updateTxStatus(confirmations);
        
        // Display inputs
        displayTxInputs(tx);
        
        // Display outputs
        displayTxOutputs(tx);
        
        // Display assets if present
        displayTxAssets(tx);
        
        // Set raw transaction data
        rawTxDataEl.textContent = JSON.stringify(tx, null, 2);
    } catch (error) {
        console.error('Error displaying transaction details:', error);
        window.ui.showNotification('Error', 'Failed to load transaction details.', 'error');
    }
}

// Display transaction inputs
async function displayTxInputs(tx) {
    const inputsListEl = document.getElementById('tx-inputs-list');
    inputsListEl.innerHTML = '';
    
    // Check if coinbase transaction
    if (tx.vin.length === 1 && tx.vin[0].coinbase) {
        const coinbaseInput = document.createElement('div');
        coinbaseInput.className = 'io-item';
        coinbaseInput.innerHTML = `
            <div class="io-address">
                <span class="coinbase-tag">Coinbase (Newly Generated Coins)</span>
            </div>
            <div class="io-data">
                <span>Block Reward + Fees</span>
            </div>
            <div class="io-script">
                <span class="label">Coinbase Data:</span>
                <span class="monospace">${tx.vin[0].coinbase}</span>
            </div>
        `;
        inputsListEl.appendChild(coinbaseInput);
        return;
    }
    
    // Process regular inputs
    for (const vin of tx.vin) {
        try {
            // Create input item
            const inputItem = document.createElement('div');
            inputItem.className = 'io-item';
            
            // Try to get the previous transaction to display the address and amount
            try {
                const prevTx = await window.utilities.getTransactionDetails(vin.txid);
                const prevOutput = prevTx.tx.vout[vin.vout];
                
                let addressHtml = '';
                let amountHtml = '';
                
                if (prevOutput) {
                    // Get address from previous output
                    if (prevOutput.scriptPubKey) {
                        if (prevOutput.scriptPubKey.addresses && prevOutput.scriptPubKey.addresses.length > 0) {
                            const address = prevOutput.scriptPubKey.addresses[0];
                            addressHtml = `<a href="#" class="address-link" data-address="${address}">${address}</a>`;
                        } else if (prevOutput.scriptPubKey.address) {
                            addressHtml = `<a href="#" class="address-link" data-address="${prevOutput.scriptPubKey.address}">${prevOutput.scriptPubKey.address}</a>`;
                        } else {
                            addressHtml = `<span class="script-type">${prevOutput.scriptPubKey.type || 'Non-standard'}</span>`;
                        }
                    }
                    
                    // Get amount from previous output
                    if (prevOutput.value) {
                        amountHtml = `<span class="io-amount">${prevOutput.value.toFixed(8)} EVR</span>`;
                    }
                    
                    // Check for assets in previous output
                    if (prevOutput.scriptPubKey && prevOutput.scriptPubKey.asset) {
                        const asset = prevOutput.scriptPubKey.asset;
                        amountHtml += `
                            <div class="io-asset">
                                <span class="asset-name">
                                    <a href="#" class="asset-link" data-asset="${asset.name}">${asset.name}</a>
                                </span>
                                <span class="asset-amount">${asset.amount.toLocaleString()}</span>
                            </div>
                        `;
                    }
                }
                
                inputItem.innerHTML = `
                    <div class="io-prev-tx">
                        <span class="label">From Transaction:</span>
                        <a href="#" class="tx-link" data-txid="${vin.txid}">${window.app.formatHash(vin.txid)}</a>
                        <span class="output-index">(Output #${vin.vout})</span>
                    </div>
                    <div class="io-address">
                        <span class="label">From Address:</span>
                        ${addressHtml || '<span class="unknown-address">Unknown</span>'}
                    </div>
                    <div class="io-value">
                        <span class="label">Value:</span>
                        ${amountHtml || '<span class="unknown-value">Unknown</span>'}
                    </div>
                `;
            } catch (prevTxError) {
                // Failed to get previous transaction
                inputItem.innerHTML = window.ui.formatInputAddress(vin);
            }
            
            inputsListEl.appendChild(inputItem);
        } catch (error) {
            console.error('Error processing input:', error);
            // Add a placeholder for failed inputs
            const errorInput = document.createElement('div');
            errorInput.className = 'io-item';
            errorInput.innerHTML = `
                <div class="io-error">
                    <span class="error-message">Error loading input details</span>
                </div>
            `;
            inputsListEl.appendChild(errorInput);
        }
    }
    
    // Add click event listeners to links
    document.querySelectorAll('#tx-inputs-list .tx-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const txid = link.getAttribute('data-txid');
            window.app.navigateToTransactionDetails(txid);
        });
    });
    
    document.querySelectorAll('#tx-inputs-list .address-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const address = link.getAttribute('data-address');
            window.app.navigateToAddressDetails(address);
        });
    });
    
    document.querySelectorAll('#tx-inputs-list .asset-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const asset = link.getAttribute('data-asset');
            window.app.navigateToAssetDetails(asset);
        });
    });
}

// Display transaction outputs
function displayTxOutputs(tx) {
    const outputsListEl = document.getElementById('tx-outputs-list');
    outputsListEl.innerHTML = '';
    
    // Process each output
    tx.vout.forEach(async (vout, index) => {
        try {
            // Create output item
            const outputItem = document.createElement('div');
            outputItem.className = 'io-item';
            
            // Generate address HTML
            const addressHtml = window.ui.formatOutputAddress(vout);
            
            // Generate asset HTML if present
            const assetHtml = window.ui.renderAssetDetails(vout);
            
            // Check output status (spent/unspent)
            let statusHtml = '<span class="status-checking">Checking status...</span>';
            
            outputItem.innerHTML = `
                <div class="io-index">
                    <span class="label">Output Index:</span>
                    <span class="output-index">${vout.n}</span>
                </div>
                <div class="io-address">
                    <span class="label">To Address:</span>
                    ${addressHtml}
                </div>
                <div class="io-value">
                    <span class="label">Value:</span>
                    <span class="io-amount">${vout.value ? vout.value.toFixed(8) + ' EVR' : 'No EVR'}</span>
                    ${assetHtml}
                </div>
                <div class="io-status">
                    <span class="label">Status:</span>
                    ${statusHtml}
                </div>
            `;
            
            outputsListEl.appendChild(outputItem);
            
            // Check if output is spent or unspent asynchronously
            try {
                const status = await window.utilities.getOutputStatus(tx.txid, vout.n);
                const statusEl = outputItem.querySelector('.io-status');
                
                if (status.status === 'Unspent') {
                    statusEl.innerHTML = `
                        <span class="label">Status:</span>
                        <span class="status-unspent">Unspent</span>
                    `;
                } else if (status.status === 'Spent' && status.spendingTx) {
                    statusEl.innerHTML = `
                        <span class="label">Status:</span>
                        <span class="status-spent">Spent in </span>
                        <a href="#" class="tx-link" data-txid="${status.spendingTx}">${window.app.formatHash(status.spendingTx)}</a>
                    `;
                    
                    // Add click event listener
                    statusEl.querySelector('.tx-link').addEventListener('click', (e) => {
                        e.preventDefault();
                        const spendingTxid = e.target.getAttribute('data-txid');
                        window.app.navigateToTransactionDetails(spendingTxid);
                    });
                    
                    // Add trace button for spent outputs
                    if (window.tracing) {
                        window.tracing.addTraceButton(outputItem, tx.txid, vout.n);
                    }
                } else {
                    statusEl.innerHTML = `
                        <span class="label">Status:</span>
                        <span class="status-spent">Spent</span>
                    `;
                    
                    // Add trace button even if spending tx is unknown
                    if (window.tracing) {
                        window.tracing.addTraceButton(outputItem, tx.txid, vout.n);
                    }
                }
            } catch (error) {
                const statusEl = outputItem.querySelector('.io-status');
                statusEl.innerHTML = `
                    <span class="label">Status:</span>
                    <span class="status-unknown">Unknown</span>
                `;
            }
        } catch (error) {
            console.error('Error processing output:', error);
            // Add a placeholder for failed outputs
            const errorOutput = document.createElement('div');
            errorOutput.className = 'io-item';
            errorOutput.innerHTML = `
                <div class="io-error">
                    <span class="error-message">Error loading output details</span>
                </div>
            `;
            outputsListEl.appendChild(errorOutput);
        }
    });
    
    // Add click event listeners to links
    document.querySelectorAll('#tx-outputs-list .address-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const address = link.getAttribute('data-address');
            window.app.navigateToAddressDetails(address);
        });
    });
    
    document.querySelectorAll('#tx-outputs-list .asset-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const asset = link.getAttribute('data-asset');
            window.app.navigateToAssetDetails(asset);
        });
    });
}

// Display transaction assets
function displayTxAssets(tx) {
    const assetsListEl = document.getElementById('tx-assets-list');
    
    // Check if transaction has any assets
    const hasAssets = tx.vout.some(vout => vout.scriptPubKey && vout.scriptPubKey.asset);
    
    if (!hasAssets) {
        assetsListEl.innerHTML = '<p>No assets transferred in this transaction.</p>';
        return;
    }
    
    // Create assets summary table
    const assetsTable = document.createElement('table');
    assetsTable.className = 'assets-table';
    assetsTable.innerHTML = `
        <thead>
            <tr>
                <th>Asset Name</th>
                <th>Type</th>
                <th>Amount</th>
                <th>From</th>
                <th>To</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const assetsBody = assetsTable.querySelector('tbody');
    const assetMap = new Map();
    
    // Process each output with assets
    tx.vout.forEach(vout => {
        if (vout.scriptPubKey && vout.scriptPubKey.asset) {
            const asset = vout.scriptPubKey.asset;
            const assetName = asset.name;
            
            // Determine asset type (new, transfer, reissue)
            let assetType = 'Transfer';
            if (asset.issueTxid === tx.txid) {
                assetType = 'New Issue';
            } else if (asset.reissuable) {
                // This is a simplification - to truly determine if this is a reissue
                // we would need to check if this transaction changes the asset properties
                assetType = 'Reissue';
            }
            
            // Get recipient address
            let toAddress = 'Unknown';
            if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.length > 0) {
                toAddress = vout.scriptPubKey.addresses[0];
            } else if (vout.scriptPubKey.address) {
                toAddress = vout.scriptPubKey.address;
            }
            
            // Track asset transfer
            if (!assetMap.has(assetName)) {
                assetMap.set(assetName, {
                    name: assetName,
                    type: assetType,
                    amount: asset.amount,
                    from: 'Unknown', // Will be determined from inputs
                    to: toAddress
                });
            } else {
                // Add to existing asset amount
                const existingAsset = assetMap.get(assetName);
                existingAsset.amount += asset.amount;
                // Keep the same type, as it should be consistent for one asset in a tx
            }
        }
    });
    
    // Add asset rows to table
    assetMap.forEach(asset => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><a href="#" class="asset-link" data-asset="${asset.name}">${asset.name}</a></td>
            <td>${asset.type}</td>
            <td>${asset.amount.toLocaleString()}</td>
            <td>${asset.from === 'Unknown' ? 'Unknown' : `<a href="#" class="address-link" data-address="${asset.from}">${asset.from}</a>`}</td>
            <td>${asset.to === 'Unknown' ? 'Unknown' : `<a href="#" class="address-link" data-address="${asset.to}">${asset.to}</a>`}</td>
        `;
        assetsBody.appendChild(row);
    });
    
    // Replace content with the assets table
    assetsListEl.innerHTML = '';
    assetsListEl.appendChild(assetsTable);
    
    // Add click event listeners to links
    document.querySelectorAll('#tx-assets-list .asset-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const asset = link.getAttribute('data-asset');
            window.app.navigateToAssetDetails(asset);
        });
    });
    
    document.querySelectorAll('#tx-assets-list .address-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const address = link.getAttribute('data-address');
            window.app.navigateToAddressDetails(address);
        });
    });
}

// Calculate transaction fee
async function calculateTxFee(tx) {
    // Coinbase transactions have no fee
    if (tx.vin.length === 1 && tx.vin[0].coinbase) {
        return 0;
    }
    
    try {
        let inputValue = 0;
        let outputValue = 0;
        
        // Calculate total output value
        for (const vout of tx.vout) {
            if (vout.value) {
                outputValue += vout.value;
            }
        }
        
        // Calculate total input value (requires fetching previous transactions)
        try {
            for (const vin of tx.vin) {
                try {
                    const prevTx = await window.utilities.getTransactionDetails(vin.txid);
                    const prevOut = prevTx.tx.vout[vin.vout];
                    if (prevOut && prevOut.value) {
                        inputValue += prevOut.value;
                    }
                } catch (error) {
                    console.warn(`Failed to get previous transaction ${vin.txid}:`, error);
                    // If we can't get all inputs, we can't calculate the fee accurately
                    return null;
                }
            }
        } catch (error) {
            console.error('Error calculating input values:', error);
            return null;
        }
        
        // Fee is input value minus output value
        const fee = inputValue - outputValue;
        return fee >= 0 ? fee : null; // Sanity check: fee should be non-negative
    } catch (error) {
        console.error('Error calculating transaction fee:', error);
        return null;
    }
}

// Make sure all functions are defined before exporting
// Export functions
window.transactions = {
    loadTransactionsView,
    loadRecentTransactions,
    loadMempoolTransactions,
    displayTransactionDetails,
    displayTxInputs,
    displayTxOutputs,
    displayTxAssets,
    calculateTxFee
};