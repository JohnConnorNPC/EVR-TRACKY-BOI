// EVR Tracky Boi - Assets Explorer Functionality

// Load assets view
async function loadAssetsView() {
    try {
        // Load the template if the view is empty
        const assetsView = document.getElementById('assets-view');
        if (assetsView.innerHTML === '') {
            const template = document.getElementById('assets-template');
            assetsView.innerHTML = template.innerHTML;
            
            // Add event listeners
            document.getElementById('search-asset').addEventListener('click', (e) => {
                e.preventDefault();
                const assetName = document.getElementById('asset-search-input').value.trim().toUpperCase();
                if (assetName) {
                    window.app.navigateToAssetDetails(assetName);
                } else {
                    UI.showNotification('Error', 'Please enter a valid asset name.', 'error');
                }
            });
            
            document.getElementById('asset-search-input').addEventListener('keyup', (e) => {
                const assetName = e.target.value.trim().toUpperCase();
                
                // Perform live search if at least one character is entered
                if (assetName.length > 0) {
                    performLiveAssetSearch(assetName);
                } else {
                    // If search field is cleared, load full list
                    loadAssetsList();
                }
                
                // Handle Enter key press
                if (e.key === 'Enter' && assetName) {
                    window.app.navigateToAssetDetails(assetName);
                } else if (e.key === 'Enter' && !assetName) {
                    UI.showNotification('Error', 'Please enter a valid asset name.', 'error');
                }
            });
            
            document.getElementById('prev-assets-page').addEventListener('click', (e) => {
                e.preventDefault();
                if (window.app.appState.assetsPagination.page > 1) {
                    window.app.appState.assetsPagination.page--;
                    loadAssetsList();
                }
            });
            
            document.getElementById('next-assets-page').addEventListener('click', (e) => {
                e.preventDefault();
                window.app.appState.assetsPagination.page++;
                loadAssetsList();
            });
        }
        
        // Load assets list
        await loadAssetsList();
    } catch (error) {
        console.error('Error loading assets view:', error);
        UI.showNotification('Error', 'Failed to load assets.', 'error');
    }
}

// Set up clickable header columns for sorting
function setupAssetHoldersTableHeaders(assetName) {
    const headersRow = document.querySelector('#asset-holders-table thead tr');
    if (!headersRow) return;
    
    // Clear existing headers first (in case of re-initialization)
    headersRow.innerHTML = '';
    
    // Create new sortable headers
    const headers = [
        { id: 'address', text: 'Address', field: 'address' },
        { id: 'balance', text: 'Balance', field: 'amount' },
        { id: 'percentage', text: 'Percentage', field: 'percentage' }
    ];
    
    // Create headers with sort indicators
    headers.forEach(header => {
        const th = document.createElement('th');
        th.className = 'sortable-header';
        th.id = `sort-${header.id}`;
        th.setAttribute('data-sort-field', header.field);
        th.innerHTML = `
            ${header.text}
            <span class="sort-indicator">
                <i class="fas fa-sort"></i>
            </span>
        `;
        
        // Add click event for sorting
        th.addEventListener('click', () => {
            // Show loading indicator
            const tableBody = document.getElementById('asset-holders-body');
            tableBody.innerHTML = '<tr><td colspan="3" class="loading-row">Sorting holders...</td></tr>';
            
            // Get current sort direction from data attribute or default to 'desc'
            const currentDirection = th.getAttribute('data-sort-direction') || 'none';
            let newDirection = 'asc';
            
            // Toggle between asc, desc, and none
            if (currentDirection === 'asc') {
                newDirection = 'desc';
            } else if (currentDirection === 'desc') {
                newDirection = 'asc';
            }
            
            // Reset all headers
            document.querySelectorAll('.sortable-header').forEach(h => {
                h.setAttribute('data-sort-direction', 'none');
                h.querySelector('.sort-indicator').innerHTML = '<i class="fas fa-sort"></i>';
            });
            
            // Set the new direction on this header
            th.setAttribute('data-sort-direction', newDirection);
            th.querySelector('.sort-indicator').innerHTML = 
                newDirection === 'asc' ? 
                '<i class="fas fa-sort-up"></i>' : 
                '<i class="fas fa-sort-down"></i>';
            
            // Store sort info in appState for persistence
            window.app.appState.assetHoldersSorting = {
                field: header.field,
                direction: newDirection
            };
            
            // Refresh the holders list with new sort
            displayAssetHolders(assetName);
        });
        
        headersRow.appendChild(th);
    });
    
    // Set initial sort direction if there's a saved state
    if (window.app.appState.assetHoldersSorting) {
        const { field, direction } = window.app.appState.assetHoldersSorting;
        const header = document.querySelector(`.sortable-header[data-sort-field="${field}"]`);
        if (header) {
            header.setAttribute('data-sort-direction', direction);
            header.querySelector('.sort-indicator').innerHTML = 
                direction === 'asc' ? 
                '<i class="fas fa-sort-up"></i>' : 
                '<i class="fas fa-sort-down"></i>';
        }
    } else {
        // Default sort: amount descending
        const balanceHeader = document.querySelector('#sort-balance');
        if (balanceHeader) {
            balanceHeader.setAttribute('data-sort-direction', 'desc');
            balanceHeader.querySelector('.sort-indicator').innerHTML = '<i class="fas fa-sort-down"></i>';
            
            // Save to app state
            window.app.appState.assetHoldersSorting = {
                field: 'amount',
                direction: 'desc'
            };
        }
    }
}

// Display asset holders
async function displayAssetHolders(assetName) {
    console.log("Displaying asset holders for:", assetName);
    
    // Get elements and verify they exist
    const tableBody = document.getElementById('asset-holders-body');
    const pageInfoEl = document.getElementById('holders-page-info');
    const prevPageBtn = document.getElementById('prev-holders-page');
    const nextPageBtn = document.getElementById('next-holders-page');
    
    if (!tableBody) {
        console.error("Missing asset-holders-body element");
        return;
    }
    
    // Show loading indicator
    tableBody.innerHTML = '<tr><td colspan="3" class="loading-row">Loading asset holders...</td></tr>';
    
    try {
        const { page, perPage } = window.app.appState.assetHoldersPagination;
        const sorting = window.app.appState.assetHoldersSorting || { field: 'amount', direction: 'desc' };
        
        console.log(`Loading asset holders page ${page} with ${perPage} per page, sorted by ${sorting.field} ${sorting.direction}`);
        
        // We need to get all holders to sort them properly
        // This approach might need optimization for assets with many holders
        // For now, we'll fetch a large number
        const fetchLimit = 1000; // Fetch up to 1000 holders
        const start = 0; // Start from the beginning to get all holders
        
        // Get all asset holders
        const holdersData = await window.utilities.listAddressesByAsset(assetName, false, fetchLimit, start);
        console.log(`Received ${Object.keys(holdersData).length} holders`);
        
        // Get asset data for supply and units
        const assetData = await window.utilities.getAssetData(assetName);
        const totalSupply = assetData.amount;
        const units = assetData.units;
        
        // Clear table
        tableBody.innerHTML = '';
        
        if (Object.keys(holdersData).length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="loading-row">No holders found</td></tr>';
            
            // Ensure pagination is updated correctly
            if (pageInfoEl) pageInfoEl.textContent = `Page ${page}`;
            if (prevPageBtn) prevPageBtn.disabled = page <= 1;
            if (nextPageBtn) nextPageBtn.disabled = true;
            
            return;
        }
        
        // Process all holders
        const holders = [];
        for (const address in holdersData) {
            const amount = holdersData[address];
            const percentage = (amount / totalSupply) * 100;
            
            holders.push({
                address,
                amount,
                percentage
            });
        }
        
        // Sort holders based on the selected sort option
        if (sorting.field && sorting.direction) {
            const { field, direction } = sorting;
            const multiplier = direction === 'asc' ? 1 : -1;
            
            holders.sort((a, b) => {
                let comparison = 0;
                
                if (field === 'address') {
                    comparison = a.address.localeCompare(b.address);
                } else if (field === 'amount') {
                    comparison = a.amount - b.amount;
                } else if (field === 'percentage') {
                    comparison = a.percentage - b.percentage;
                }
                
                return comparison * multiplier;
            });
        }
        
        // Apply pagination to the sorted results
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        const pageHolders = holders.slice(startIndex, endIndex);
        
        // Display the current page of holders
        for (const holder of pageHolders) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><a href="#" data-address="${holder.address}" class="address-link">${holder.address}</a></td>
                <td>${holder.amount.toLocaleString()}</td>
                <td>${holder.percentage.toFixed(2)}%</td>
            `;
            tableBody.appendChild(row);
        }
        
        // Add click event listeners to address links
        document.querySelectorAll('#asset-holders-body .address-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const address = link.getAttribute('data-address');
                window.app.navigateToAddressDetails(address);
            });
        });
        
        // Update pagination UI with explicit checks
        if (pageInfoEl) pageInfoEl.textContent = `Page ${page} of ${Math.ceil(holders.length / perPage)}`;
        if (prevPageBtn) {
            prevPageBtn.disabled = page <= 1;
            console.log(`Previous button disabled: ${page <= 1}`);
        }
        if (nextPageBtn) {
            nextPageBtn.disabled = endIndex >= holders.length;
            console.log(`Next button disabled: ${endIndex >= holders.length}`);
        }
        
        console.log(`Displayed ${pageHolders.length} holders for page ${page}`);
    } catch (error) {
        console.error('Error displaying asset holders:', error);
        tableBody.innerHTML = '<tr><td colspan="3" class="loading-row">Error loading holders</td></tr>';
        
        // Update pagination UI for error state
        if (pageInfoEl) pageInfoEl.textContent = `Page ${window.app.appState.assetHoldersPagination.page}`;
        if (prevPageBtn) prevPageBtn.disabled = window.app.appState.assetHoldersPagination.page <= 1;
        if (nextPageBtn) nextPageBtn.disabled = true;
    }
}

// Function to handle image load errors by replacing with inline SVG X icon
function replaceWithXIcon(img) {
    // Create the SVG element
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", img.width || "1em"); 
    svg.setAttribute("height", img.height || "1em");
    svg.setAttribute("class", img.className || "");
    svg.style.verticalAlign = "middle";
    
    // Create the path for the X
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M18 6L6 18M6 6l12 12");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("fill", "none");
    
    // Add the path to the SVG
    svg.appendChild(path);
    
    // Replace the image with the SVG
    if (img.parentNode) {
      img.parentNode.replaceChild(svg, img);
    }
}
  
// For direct inline use (without the function)
const inlineErrorHandler = `
onerror="this.onerror=null; this.style.display='none'; this.insertAdjacentHTML('afterend', '<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' width=\\'1em\\' height=\\'1em\\' style=\\'vertical-align:middle; margin-right:5px;\\' class=\\'ipfs-thumbnail\\'><path d=\\'M18 6L6 18M6 6l12 12\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' fill=\\'none\\'></path></svg>');"
`;

// Updated loadAssetsList function with IPFS preview support
async function loadAssetsList() {
    const tbody = document.getElementById('assets-table-body');
    const pageInfo = document.getElementById('assets-page-info');
    const prevButton = document.getElementById('prev-assets-page');
    const nextButton = document.getElementById('next-assets-page');
    
    // Show loading indicator
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Loading assets...</td></tr>';
    
    try {
        const { page, perPage } = window.app.appState.assetsPagination;
        
        // Update pagination info
        pageInfo.textContent = `Page ${page}`;
        prevButton.disabled = page <= 1;
        
        // Calculate pagination parameters
        const start = (page - 1) * perPage;
        
        // Get assets list with extended info to include IPFS data
        const assets = await window.utilities.listAssets('', true, perPage, start);
        
        // Clear table
        tbody.innerHTML = '';
        
        if (Object.keys(assets).length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No assets found</td></tr>';
            nextButton.disabled = true;
            return;
        }
        
        // Process assets and get detailed info for each
        const assetList = [];
        const assetsToFetch = [];
        
        for (const assetName in assets) {
            if (assetName !== '') { // Skip the empty asset name
                assetList.push({
                    name: assetName,
                    ...assets[assetName]
                });
                
                // Add to list of assets that need detailed info
                assetsToFetch.push(assetName);
            }
        }
        
        // Sort assets by name
        assetList.sort((a, b) => a.name.localeCompare(b.name));
        
        // Fetch detailed asset data in parallel for each asset
        const assetDetailsPromises = assetsToFetch.map(name => window.utilities.getAssetData(name));
        const assetDetailsResults = await Promise.allSettled(assetDetailsPromises);
        
        // Create a map of asset details
        const assetDetailsMap = new Map();
        for (let i = 0; i < assetsToFetch.length; i++) {
            const result = assetDetailsResults[i];
            if (result.status === 'fulfilled') {
                assetDetailsMap.set(assetsToFetch[i], result.value);
            }
        }
        
        // Display assets with IPFS data where available
        for (const asset of assetList) {
            // Get detailed asset data if available
            const detailedData = assetDetailsMap.get(asset.name);
            if (detailedData) {
                // Add IPFS info to the asset object
                asset.has_ipfs = detailedData.has_ipfs || false;
                asset.ipfs_hash = detailedData.ipfs_hash || '';
            }
            
            // Create and append the row
            const row = createAssetRow(asset);
            tbody.appendChild(row);
        }
        
        // Add CSS for thumbnails if not already present
        addThumbnailStyles();
        
        // Add click event listeners to asset links
        document.querySelectorAll('.asset-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const asset = link.getAttribute('data-asset');
                window.app.navigateToAssetDetails(asset);
            });
        });
        
        document.querySelectorAll('.address-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const address = link.getAttribute('data-address');
                window.app.navigateToAddressDetails(address);
            });
        });
        
        // Enable/disable next button based on returned asset count
        nextButton.disabled = assetList.length < perPage;
    } catch (error) {
        console.error('Error loading assets list:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Error loading assets</td></tr>';
    }
}

// Updated live search function that matches only the beginning of asset names
async function performLiveAssetSearch(assetPrefix) {
    const tbody = document.getElementById('assets-table-body');
    const pageInfo = document.getElementById('assets-page-info');
    const prevButton = document.getElementById('prev-assets-page');
    const nextButton = document.getElementById('next-assets-page');
    
    // Show loading indicator
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Searching assets...</td></tr>';
    
    try {
        // Get assets that match the prefix
        const assets = await window.utilities.listAssets('', true, 999999, 0);
        
        // Clear table
        tbody.innerHTML = '';
        
        // Filter assets based on prefix match (starts with) and exclude those ending with !
        const assetList = [];
        const assetsToFetch = [];
        const searchTerm = assetPrefix.toLowerCase();
        
        for (const assetName in assets) {
            // Skip empty asset names and those ending with !
            if (assetName !== '' && !assetName.endsWith('!')) {
                // Check if the asset name STARTS WITH the search term (prefix match)
                if (assetName.toLowerCase().startsWith(searchTerm)) {
                    assetList.push({
                        name: assetName,
                        ...assets[assetName]
                    });
                    
                    // Add to list of assets that need detailed info
                    assetsToFetch.push(assetName);
                }
            }
        }
        
        if (assetList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="loading-row">No matching assets found</td></tr>';
            // Disable pagination during live search
            pageInfo.textContent = 'Search Results';
            prevButton.disabled = true;
            nextButton.disabled = true;
            return;
        }
        
        // Sort assets by name
        assetList.sort((a, b) => a.name.localeCompare(b.name));
        
        // Limit results to avoid overwhelming the display
        const limitedResults = assetList.slice(0, 999);
        const limitedFetch = assetsToFetch.slice(0, 999);
        
        // Fetch detailed asset data in parallel for displayed assets
        const assetDetailsPromises = limitedFetch.map(name => window.utilities.getAssetData(name));
        const assetDetailsResults = await Promise.allSettled(assetDetailsPromises);
        
        // Create a map of asset details
        const assetDetailsMap = new Map();
        for (let i = 0; i < limitedFetch.length; i++) {
            const result = assetDetailsResults[i];
            if (result.status === 'fulfilled') {
                assetDetailsMap.set(limitedFetch[i], result.value);
            }
        }
        
        // Add CSS for thumbnails if not already present
        addThumbnailStyles();
        
        // Display assets with IPFS data where available
        for (const asset of limitedResults) {
            // Get detailed asset data if available
            const detailedData = assetDetailsMap.get(asset.name);
            if (detailedData) {
                // Add IPFS info to the asset object
                asset.has_ipfs = detailedData.has_ipfs || false;
                asset.ipfs_hash = detailedData.ipfs_hash || '';
            }
            
            // Create and append the row
            const row = createAssetRow(asset);
            tbody.appendChild(row);
        }
        
        // Add click event listeners to asset links
        document.querySelectorAll('.asset-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const asset = link.getAttribute('data-asset');
                window.app.navigateToAssetDetails(asset);
            });
        });
        
        document.querySelectorAll('.address-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const address = link.getAttribute('data-address');
                window.app.navigateToAddressDetails(address);
            });
        });
        
        // Update pagination display during live search
        pageInfo.textContent = `Showing ${limitedResults.length} of ${assetList.length} matches`;
        prevButton.disabled = true;
        nextButton.disabled = true;
    } catch (error) {
        console.error('Error performing live asset search:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Error searching assets</td></tr>';
    }
}

// Update to the thumbnail styles function to add hover preview
function addThumbnailStyles() {
    // Check if the style already exists
    if (!document.getElementById('ipfs-thumbnail-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'ipfs-thumbnail-styles';
        styleElement.textContent = `
            .ipfs-thumbnail {
                height: 1em;
                width: 1em;
                margin-right: 5px;
                vertical-align: middle;
                object-fit: cover;
                border-radius: 2px;
            }
            
            .asset-name-with-preview {
                display: flex;
                align-items: center;
                position: relative;
            }
            
            .asset-name-with-preview .asset-link {
                overflow: hidden;
                text-overflow: ellipsis;
            }

            /* Hover preview styles */
            .thumbnail-container {
                position: relative;
                display: inline-block;
            }

            .thumbnail-container:hover .ipfs-preview {
                display: block;
            }

            .ipfs-preview {
                display: none;
                position: absolute;
                z-index: 100;
                top: -10px;
                left: 30px;
                width: 200px;
                height: auto;
                background-color: #fff;
                border: 1px solid #ddd;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                padding: 4px;
            }

            .ipfs-preview img {
                width: 100%;
                height: auto;
                max-height: 200px;
                object-fit: contain;
                display: block;
            }
        `;
        document.head.appendChild(styleElement);
    }
}

// Updated createAssetRow function with hover preview - removed issuer column
function createAssetRow(asset) {
    const row = document.createElement('tr');
    
    // Check if the asset has IPFS
    const hasIpfs = asset.has_ipfs || false;
    const ipfsHash = asset.ipfs_hash || '';
    
    // Create the cell content with optional thumbnail
    let nameCell = '';
    
    if (hasIpfs && ipfsHash) {
        // Define ipfsUrl here before using it
        const ipfsUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
        
        nameCell = `
            <td>
                <div class="asset-name-with-preview">
                    <div class="thumbnail-container">
                        <img src="${ipfsUrl}" 
                             alt="IPFS" 
                             class="ipfs-thumbnail" 
                             onerror="this.onerror=null; this.style.display='none'; this.insertAdjacentHTML('afterend', '<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' width=\\'1em\\' height=\\'1em\\' style=\\'vertical-align:middle; margin-right:5px;\\' class=\\'ipfs-thumbnail\\'><path d=\\'M18 6L6 18M6 6l12 12\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' fill=\\'none\\'></path></svg>');">
                        
                        <!-- Preview on hover -->
                        <div class="ipfs-preview">
                            <img src="${ipfsUrl}" 
                                 alt="IPFS Preview" 
                                 onerror="this.onerror=null; this.src='#/img/ipfs-placeholder.png'; this.alt='Unable to load IPFS image';">
                        </div>
                    </div>
                    <a href="#" data-asset="${asset.name}" class="asset-link">${asset.name}</a>
                </div>
            </td>`;
    } else {
        // Standard cell without preview
        nameCell = `<td><a href="#" data-asset="${asset.name}" class="asset-link">${asset.name}</a></td>`;
    }
    
    // Set complete row HTML with all cells - removed issuer cell
    row.innerHTML = `
        ${nameCell}
        <td>${asset.amount}</td>
        <td>${asset.reissuable ? 'Yes' : 'No'}</td>
        <td>${asset.has_ipfs ? 'Yes' : 'No'}</td>
    `;
    
    return row; // Return the completed row element
}

// Update asset detail view to include hover preview as well - removed issuer and tx references
async function displayAssetDetails(assetName) {
    try {
        console.log("Displaying asset details for:", assetName);
        
        // Wait a moment to ensure DOM is fully updated
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Get elements - check if they exist
        const elements = {
            nameEl: document.getElementById('asset-detail-name'),
            supplyEl: document.getElementById('asset-detail-supply'),
            unitsEl: document.getElementById('asset-detail-units'),
            reissuableEl: document.getElementById('asset-detail-reissuable'),
            hasIpfsEl: document.getElementById('asset-detail-has-ipfs'),
            ipfsEl: document.getElementById('asset-detail-ipfs'),
            ipfsContainerEl: document.getElementById('asset-ipfs-container'),
            holdersTable: document.getElementById('asset-holders-body'),
            pageInfoEl: document.getElementById('holders-page-info'),
            prevPageBtn: document.getElementById('prev-holders-page'),
            nextPageBtn: document.getElementById('next-holders-page')
        };
        
        // Check if elements exist and log any missing ones
        let missingElements = false;
        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`Missing element: ${key} (id: asset-detail-${key.replace('El', '')})`);
                missingElements = true;
            }
        }
        
        if (missingElements) {
            console.error("Some required DOM elements are missing. Asset details view might not be properly loaded.");
            // Instead of stopping, try to work with what we have
            UI.showNotification('Warning', 'Asset details view is incomplete. Some information may not display correctly.', 'warning');
        }
        
        // Fetch asset data
        const assetData = await window.utilities.getAssetData(assetName);
        console.log("Asset data received:", assetData);
        
        // Update elements that exist
        if (elements.nameEl) elements.nameEl.textContent = assetName;
        if (elements.supplyEl) elements.supplyEl.textContent = assetData.amount;
        if (elements.unitsEl) elements.unitsEl.textContent = assetData.units;
        if (elements.reissuableEl) elements.reissuableEl.textContent = assetData.reissuable ? 'Yes' : 'No';
        if (elements.hasIpfsEl) elements.hasIpfsEl.textContent = assetData.has_ipfs ? 'Yes' : 'No';
        
        // Show/hide IPFS hash and image
        if (assetData.has_ipfs && elements.ipfsContainerEl && elements.ipfsEl) {
            elements.ipfsContainerEl.style.display = 'flex';
            elements.ipfsEl.textContent = assetData.ipfs_hash;
            
            // Add IPFS link and image display
            const ipfsHash = assetData.ipfs_hash;
            const ipfsUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
            
            try {
                // Create IPFS image container if it doesn't exist
                let ipfsImageContainer = document.getElementById('asset-ipfs-image-container');
                if (!ipfsImageContainer && elements.ipfsContainerEl.parentNode) {
                    ipfsImageContainer = document.createElement('div');
                    ipfsImageContainer.id = 'asset-ipfs-image-container';
                    ipfsImageContainer.className = 'summary-item ipfs-image-container';
                    
                    // Insert after the IPFS hash container
                    elements.ipfsContainerEl.parentNode.insertBefore(ipfsImageContainer, elements.ipfsContainerEl.nextSibling);
                }
                
                // Add IPFS image preview if container exists
                if (ipfsImageContainer) {
                    ipfsImageContainer.innerHTML = `
                        <span class="label">IPFS Content:</span>
                        <div class="ipfs-preview-detail">
                            <a href="${ipfsUrl}" target="_blank" class="ipfs-link">View on IPFS</a>
                            <div class="ipfs-image-wrapper">
                                <img src="${ipfsUrl}" alt="IPFS content for ${assetName}" class="ipfs-image-detail" 
                                     onerror="this.onerror=null; this.src='/img/ipfs-placeholder.png'; this.alt='Unable to load IPFS image';">
                            </div>
                        </div>
                    `;
                }
            } catch (ipfsError) {
                console.error("Error adding IPFS image:", ipfsError);
            }
        } else if (elements.ipfsContainerEl) {
            elements.ipfsContainerEl.style.display = 'none';
            
            // Remove IPFS image container if it exists
            try {
                const ipfsImageContainer = document.getElementById('asset-ipfs-image-container');
                if (ipfsImageContainer) {
                    ipfsImageContainer.remove();
                }
            } catch (removeError) {
                console.error("Error removing IPFS container:", removeError);
            }
        }
        
        // Set up the sortable headers for the holders table
        setupAssetHoldersTableHeaders(assetName);
        
        // Display asset holders if holdersTable exists
        if (elements.holdersTable) {
            await displayAssetHolders(assetName);
        }
        
        // Ensure the thumbnail styles are added
        addDetailPageThumbnailStyles();
        
    } catch (error) {
        console.error('Error displaying asset details:', error);
        UI.showNotification('Error', 'Failed to load asset details.', 'error');
    }
}


function addDetailPageThumbnailStyles() {
    // Check if the style already exists
    if (!document.getElementById('ipfs-detail-thumbnail-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'ipfs-detail-thumbnail-styles';
        styleElement.textContent = `
            .ipfs-image-detail {
                max-width: 200px;
                max-height: 200px;
                object-fit: contain;
                border-radius: 4px;
                border: 1px solid #ddd;
                margin-top: 8px;
            }
            
            .ipfs-preview-detail {
                margin-top: 4px;
            }
            
            .ipfs-link {
                display: inline-block;
                margin-bottom: 4px;
            }
        `;
        document.head.appendChild(styleElement);
    }
}

window.assets = {
    loadAssetsView,
    loadAssetsList,
    performLiveAssetSearch,
    displayAssetDetails,
    displayAssetHolders,
    setupAssetHoldersTableHeaders,
    
    createAssetRow,
    addThumbnailStyles
};
