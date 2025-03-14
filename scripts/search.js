// EVR Tracky Boi - Search Functionality with URL Routing Support

// Search utility functions for the explorer
const Search = {
    // Main search function
    search: async function(query) {
        query = query.trim();
        
        if (!query) {
            UI.showNotification('Error', 'Please enter a search term.', 'error');
            return;
        }
        
        try {
            // Try to identify what the search term is
            const result = await this.identifySearchTerm(query);
            
            if (result.type === 'block_height') {
                window.app.navigateToBlockDetails(result.value);
            } else if (result.type === 'block_hash') {
                window.app.navigateToBlockDetails(result.value);
            } else if (result.type === 'transaction') {
                window.app.navigateToTransactionDetails(result.value);
            } else if (result.type === 'address') {
                window.app.navigateToAddressDetails(result.value);
            } else if (result.type === 'asset') {
                window.app.navigateToAssetDetails(result.value);
            } else {
                // No match found
                UI.showNotification('Not Found', `Could not find any matches for "${query}".`, 'warning');
            }
        } catch (error) {
            console.error('Search error:', error);
            UI.showNotification('Error', 'An error occurred while searching.', 'error');
        }
    },
    
    // Identify what the search term is
    identifySearchTerm: async function(query) {
        // Check if it's a block height (number)
        if (/^[0-9]+$/.test(query)) {
            try {
                const blockHash = await window.utilities.getBlockHash(parseInt(query));
                return { type: 'block_height', value: blockHash };
            } catch (error) {
                console.log('Not a valid block height');
            }
        }
        
        // Check if it's a block hash (64 hex characters)
        if (/^[a-fA-F0-9]{64}$/.test(query)) {
            try {
                await window.utilities.getBlock(query);
                return { type: 'block_hash', value: query };
            } catch (blockError) {
                try {
                    // If not a block hash, check if it's a transaction ID
                    await window.utilities.getTransactionDetails(query);
                    return { type: 'transaction', value: query };
                } catch (txError) {
                    console.log('Not a valid block hash or transaction ID');
                }
            }
        }
        
        // Check if it's an Evrmore address (starts with E, 34 chars)
        if (/^[E][a-km-zA-HJ-NP-Z1-9]{33}$/.test(query)) {
            // Valid address format
            return { type: 'address', value: query };
        }
        
        // Check if it's an asset name - convert to uppercase for asset lookup
        try {
            // Evrmore assets are uppercase only, so convert any input to uppercase
            const upperCaseQuery = query.toUpperCase();
            console.log("Looking up asset:", upperCaseQuery);
            
            try {
                const assetData = await window.utilities.getAssetData(upperCaseQuery);
                if (assetData) {
                    console.log("Asset found:", assetData);
                    return { type: 'asset', value: upperCaseQuery };
                }
            } catch (assetError) {
                console.log('Exact asset match not found, trying wildcard search');
                
                // Try a wildcard search if exact match fails
                const assets = await window.utilities.listAssets(upperCaseQuery, true, 1);
                if (assets && Object.keys(assets).length > 0) {
                    // Return the first match if any found
                    const firstAssetName = Object.keys(assets)[0];
                    if (firstAssetName && firstAssetName !== '') {
                        console.log("Asset found through wildcard search:", firstAssetName);
                        return { type: 'asset', value: firstAssetName };
                    }
                }
                
                throw assetError; // Re-throw if no matches found
            }
        } catch (error) {
            console.log('Not a valid asset name:', error);
        }
        
        // No match found
        return { type: 'unknown', value: query };
    },
    
    // Handle direct navigation from a hash URL
    // This could be called directly from router.js if needed
    handleUrlNavigation: async function(type, id) {
        try {
            switch (type) {
                case 'block':
                    await window.app.navigateToBlockDetails(id, false);
                    break;
                case 'tx':
                    await window.app.navigateToTransactionDetails(id, false);
                    break;
                case 'address':
                    await window.app.navigateToAddressDetails(id, false);
                    break;
                case 'asset':
                    await window.app.navigateToAssetDetails(id, false);
                    break;
                case 'view':
                    window.app.navigateToView(id, false);
                    break;
                default:
                    console.warn('Unknown navigation type:', type);
                    UI.showNotification('Error', 'Invalid URL format.', 'error');
            }
        } catch (error) {
            console.error('Navigation error:', error);
            UI.showNotification('Error', 'Failed to navigate to the requested resource.', 'error');
        }
    },
    
    // Suggest search completions (for future autocomplete feature)
    suggestCompletions: async function(partial) {
        const suggestions = [];
        
        if (partial.length < 3) {
            return suggestions;
        }
        
        try {
            // Try to find matching assets - convert to uppercase for asset search
            const upperCasePartial = partial.toUpperCase();
            const assets = await window.utilities.listAssets(upperCasePartial);
            for (const assetName in assets) {
                if (assetName !== '' && assetName.includes(upperCasePartial)) {
                    suggestions.push({
                        type: 'asset',
                        value: assetName,
                        display: `Asset: ${assetName}`
                    });
                    
                    // Limit to 5 asset suggestions
                    if (suggestions.length >= 5) break;
                }
            }
        } catch (error) {
            console.warn('Error getting asset suggestions:', error);
        }
        
        return suggestions;
    },
    
    // Validate search input
    validateSearch: function(query) {
        // Block height validation
        if (/^[0-9]+$/.test(query)) {
            return { isValid: true, type: 'block_height' };
        }
        
        // Block hash or transaction ID validation
        if (/^[a-fA-F0-9]{64}$/.test(query)) {
            return { isValid: true, type: 'hash' };
        }
        
        // Address validation
        if (/^[E][a-km-zA-HJ-NP-Z1-9]{33}$/.test(query)) {
            return { isValid: true, type: 'address' };
        }
        
        // Asset name validation (simple check) - allow both upper and lowercase input
        if (/^[A-Za-z0-9._]{3,}$/.test(query)) {
            return { isValid: true, type: 'asset' };
        }
        
        // If nothing matches, it could still be a valid asset name with special characters
        return { isValid: true, type: 'unknown' };
    }
};

// Event listeners for search functionality
document.addEventListener('DOMContentLoaded', () => {
    // Main search form
    const searchForm = document.getElementById('search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('search-input');
            const query = searchInput.value.trim();
            
            if (query) {
                Search.search(query);
                searchInput.value = ''; // Clear the input after search
            }
        });
    }
    
    // Mobile search toggle (if exists)
    const mobileSearchToggle = document.getElementById('mobile-search-toggle');
    if (mobileSearchToggle) {
        mobileSearchToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const searchContainer = document.querySelector('.search-container');
            searchContainer.classList.toggle('mobile-visible');
        });
    }
    
    // Search input enhancement for validation
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            const validation = Search.validateSearch(query);
            
            if (validation.isValid) {
                searchInput.classList.remove('invalid-search');
            } else {
                searchInput.classList.add('invalid-search');
            }
        });
    }
});

// Expose Search to window
window.search = Search;