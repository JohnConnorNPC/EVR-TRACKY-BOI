// EVR Tracky Boi - Blocks Explorer Functionality

// Load blocks view
async function loadBlocksView() {
    try {
        // Load the template if the view is empty
        const blocksView = document.getElementById('blocks-view');
        if (blocksView.innerHTML === '') {
            const template = document.getElementById('blocks-template');
            blocksView.innerHTML = template.innerHTML;
            
            // Add event listeners
            document.getElementById('filter-blocks').addEventListener('click', (e) => {
                e.preventDefault();
                const startHeight = parseInt(document.getElementById('block-start').value);
                const endHeight = parseInt(document.getElementById('block-end').value);
                
                if (!isNaN(startHeight) && !isNaN(endHeight)) {
                    loadBlocksRange(startHeight, endHeight);
                } else {
                    UI.showNotification('Error', 'Please enter valid block heights.', 'error');
                }
            });
            
            document.getElementById('prev-blocks-page').addEventListener('click', (e) => {
                e.preventDefault();
                if (window.app.appState.blockPagination.page > 1) {
                    window.app.appState.blockPagination.page--;
                    loadBlocksPage();
                }
            });
            
            document.getElementById('next-blocks-page').addEventListener('click', (e) => {
                e.preventDefault();
                window.app.appState.blockPagination.page++;
                loadBlocksPage();
            });
        }
        
        // Load the latest blocks
        loadBlocksPage();
    } catch (error) {
        console.error('Error loading blocks view:', error);
        UI.showNotification('Error', 'Failed to load blocks.', 'error');
    }
}

// Load blocks for a specific page
async function loadBlocksPage() {
    const { page, perPage } = window.app.appState.blockPagination;
    const tbody = document.getElementById('blocks-table-body');
    const pageInfo = document.getElementById('blocks-page-info');
    const prevButton = document.getElementById('prev-blocks-page');
    
    // Show loading indicator
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Loading blocks...</td></tr>';
    
    try {
        // Get current blockchain height
        const currentHeight = await window.utilities.getBlockCount();
        
        // Calculate start height for this page
        const startHeight = Math.max(currentHeight - ((page - 1) * perPage), 0);
        const endHeight = Math.max(startHeight - perPage + 1, 0);
        
        // Load blocks in this range
        await loadBlocksRange(endHeight, startHeight);
        
        // Update pagination UI
        pageInfo.textContent = `Page ${page}`;
        prevButton.disabled = page <= 1;
    } catch (error) {
        console.error('Error loading blocks page:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Error loading blocks</td></tr>';
    }
}

// Load blocks in a specific height range
// Load blocks in a specific height range
async function loadBlocksRange(startHeight, endHeight) {
    const tbody = document.getElementById('blocks-table-body');
    
    try {
        // Ensure start height is less than or equal to end height
        if (startHeight > endHeight) {
            const temp = startHeight;
            startHeight = endHeight;
            endHeight = temp;
        }
        
        // Create array of heights to load
        const heights = [];
        for (let h = endHeight; h >= startHeight; h--) {
            heights.push(h);
        }
        
        // Clear table
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Loading blocks...</td></tr>';
        
        // Process blocks in batches to avoid overloading the browser
        const BATCH_SIZE = 5;
        const blockDataArray = [];
        
        // First, fetch all block data and store it in memory
        for (let i = 0; i < heights.length; i += BATCH_SIZE) {
            const batch = heights.slice(i, i + BATCH_SIZE);
            
            // Process each height in the batch
            const batchPromises = batch.map(async (height) => {
                try {
                    const hash = await window.utilities.getBlockHash(height);
                    const block = await window.utilities.getBlock(hash);
                    
                    // Return block data object instead of creating DOM element
                    return {
                        height,
                        hash: block.hash,
                        time: block.time,
                        txCount: block.tx.length,
                        size: block.size,
                        difficulty: block.difficulty
                    };
                } catch (error) {
                    console.error(`Error loading block at height ${height}:`, error);
                    // Return null for failed blocks
                    return null;
                }
            });
            
            // Wait for all blocks in this batch to be fetched
            const batchResults = await Promise.all(batchPromises);
            
            // Add valid results to our array
            blockDataArray.push(...batchResults.filter(block => block !== null));
        }
        
        // Clear loading message
        tbody.innerHTML = '';
        
        // Sort blocks by height (descending)
        blockDataArray.sort((a, b) => b.height - a.height);
        
        // Now create and append DOM elements in the correct order
        blockDataArray.forEach(block => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><a href="#" data-block-hash="${block.hash}" class="block-link">${block.height.toLocaleString()}</a></td>
                <td><span class="truncate-hash">${block.hash}</span></td>
                <td>${window.app.formatTime(block.time)}</td>
                <td>${block.txCount.toLocaleString()}</td>
                <td>${(block.size / 1024).toFixed(2)}</td>
                <td>${block.difficulty.toFixed(8)}</td>
            `;
            tbody.appendChild(row);
        });
        
        // Check if we have no blocks
        if (blockDataArray.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No blocks found in this range</td></tr>';
            return;
        }
        
        // Add click event listeners to block links
        document.querySelectorAll('.block-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const blockHash = link.getAttribute('data-block-hash');
                window.app.navigateToBlockDetails(blockHash);
            });
        });
    } catch (error) {
        console.error('Error loading blocks range:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Error loading blocks</td></tr>';
    }
}

// Display block details
async function displayBlockDetails(blockHash) {
    try {
        // Get elements
        const blockHeightEl = document.getElementById('block-detail-height');
        const blockHashEl = document.getElementById('block-detail-hash');
        const prevBlockEl = document.getElementById('block-detail-prev-block');
        const nextBlockEl = document.getElementById('block-detail-next-block');
        const merkleRootEl = document.getElementById('block-detail-merkle-root');
        const timeEl = document.getElementById('block-detail-time');
        const difficultyEl = document.getElementById('block-detail-difficulty');
        const nonceEl = document.getElementById('block-detail-nonce');
        const bitsEl = document.getElementById('block-detail-bits');
        const sizeEl = document.getElementById('block-detail-size');
        const confirmationsEl = document.getElementById('block-detail-confirmations');
        const txCountEl = document.getElementById('block-detail-tx-count');
        const txTableEl = document.getElementById('block-transactions-body');
        
        // Show loading indicators
        blockHeightEl.textContent = 'Loading...';
        blockHashEl.textContent = 'Loading...';
        prevBlockEl.textContent = 'Loading...';
        nextBlockEl.textContent = 'Loading...';
        merkleRootEl.textContent = 'Loading...';
        timeEl.textContent = 'Loading...';
        difficultyEl.textContent = 'Loading...';
        nonceEl.textContent = 'Loading...';
        bitsEl.textContent = 'Loading...';
        sizeEl.textContent = 'Loading...';
        confirmationsEl.textContent = 'Loading...';
        txCountEl.textContent = '...';
        txTableEl.innerHTML = '<tr><td colspan="5" class="loading-row">Loading transactions...</td></tr>';
        
        // Fetch block details
        const blockDetails = await window.utilities.getBlockDetails(blockHash);
        const { block, confirmations } = blockDetails;
        
        // Update block details
        blockHeightEl.textContent = block.height.toLocaleString();
        blockHashEl.textContent = block.hash;
        
        // Handle previous and next block links
        if (block.previousblockhash) {
            prevBlockEl.textContent = window.app.formatHash(block.previousblockhash);
            prevBlockEl.setAttribute('data-block-hash', block.previousblockhash);
            prevBlockEl.addEventListener('click', (e) => {
                e.preventDefault();
                window.app.navigateToBlockDetails(block.previousblockhash);
            });
        } else {
            prevBlockEl.textContent = 'None (Genesis Block)';
        }
        
        // Get next block if this is not the latest block
        if (confirmations > 1) {
            try {
                const nextBlockHeight = block.height + 1;
                const nextBlockHash = await window.utilities.getBlockHash(nextBlockHeight);
                nextBlockEl.textContent = window.app.formatHash(nextBlockHash);
                nextBlockEl.setAttribute('data-block-hash', nextBlockHash);
                nextBlockEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.app.navigateToBlockDetails(nextBlockHash);
                });
            } catch (error) {
                nextBlockEl.textContent = 'Error loading next block';
            }
        } else {
            nextBlockEl.textContent = 'None (Latest Block)';
        }
        
        // Update remaining block details
        merkleRootEl.textContent = block.merkleroot;
        
        const blockDate = new Date(block.time * 1000);
        timeEl.textContent = `${blockDate.toLocaleString()} (${window.app.formatTime(block.time)})`;
        
        difficultyEl.textContent = block.difficulty.toFixed(8);
        nonceEl.textContent = block.nonce;
        bitsEl.textContent = block.bits;
        sizeEl.textContent = `${(block.size / 1024).toFixed(2)} KB (${block.size.toLocaleString()} bytes)`;
        confirmationsEl.textContent = confirmations.toLocaleString();
        txCountEl.textContent = block.tx.length.toLocaleString();
        
        // Display transactions
        await displayBlockTransactions(block);
    } catch (error) {
        console.error('Error displaying block details:', error);
        UI.showNotification('Error', 'Failed to load block details.', 'error');
    }
}

// Display block transactions
async function displayBlockTransactions(block) {
    const tableBody = document.getElementById('block-transactions-body');
    tableBody.innerHTML = '';
    
    try {
        // Process transactions in batches to avoid overloading the browser
        const transactions = Array.isArray(block.tx) ? block.tx : [];
        const BATCH_SIZE = 10;
        
        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            const batch = transactions.slice(i, i + BATCH_SIZE);
            const rows = [];
            
            // Process each transaction in the batch
            for (const tx of batch) {
                // If tx is just a txid string, fetch the full transaction
                const txData = typeof tx === 'string' ? await window.utilities.getTransactionDetails(tx) : tx;
                const transaction = txData.tx || txData;
                
                let txType = 'Regular';
                let totalValue = 0;
                
                // Determine transaction type
                if (transaction.vin.some(vin => vin.coinbase)) {
                    txType = 'Coinbase';
                } else if (transaction.vout.some(vout => vout.scriptPubKey && vout.scriptPubKey.asset)) {
                    txType = 'Asset';
                }
                
                // Calculate total value
                transaction.vout.forEach(vout => {
                    if (vout.value) totalValue += vout.value;
                });
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><a href="#" data-txid="${transaction.txid}" class="tx-link">${window.app.formatHash(transaction.txid)}</a></td>
                    <td><span class="tx-type tx-type-${txType.toLowerCase()}">${txType}</span></td>
                    <td>${transaction.vin.length}</td>
                    <td>${transaction.vout.length}</td>
                    <td>${totalValue.toFixed(8)} EVR</td>
                `;
                rows.push(row);
            }
            
            // Add all rows from this batch to the table
            rows.forEach(row => tableBody.appendChild(row));
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
        console.error('Error displaying block transactions:', error);
        tableBody.innerHTML = '<tr><td colspan="5" class="loading-row">Error loading transactions</td></tr>';
    }
}

// Export functions
window.blocks = {
    loadBlocksView,
    loadBlocksPage,
    loadBlocksRange,
    displayBlockDetails,
    displayBlockTransactions
};