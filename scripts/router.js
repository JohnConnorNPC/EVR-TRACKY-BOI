// router.js - Hash-based routing for EVR Tracky Boi

// Route types and mapping
const ROUTES = {
    VIEW: 'view', // Main views (dashboard, blocks, transactions, etc.)
    BLOCK: 'block', // Block details
    TX: 'tx', // Transaction details
    ADDRESS: 'address', // Address details
    ASSET: 'asset' // Asset details
};

// Router object
const Router = {
    // Initialize the router
    init: function() {
        // Handle initial URL on page load
        this.handleInitialUrl();
        
        // Add event listener for hash changes
        window.addEventListener('hashchange', this.handleHashChange.bind(this));
        
        console.log('Router initialized');
    },
    
    // Handle initial URL on page load
    handleInitialUrl: function() {
        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            this.handleHashChange();
        }
    },
    
    // Handle hash change events
    handleHashChange: function() {
        const hash = window.location.hash;
        if (!hash || hash === '#' || hash === '#debug') {
            // Default view or debug mode - no need to do anything
            return;
        }
        
        // Parse the hash route
        const route = this.parseRoute(hash);
        
        // Handle the route
        if (route) {
            this.navigateToRoute(route);
        }
    },
    
    // Parse a hash route into components
    parseRoute: function(hash) {
        // Remove the leading # and split by /
        const parts = hash.substring(1).split('/').filter(part => part !== '');
        
        if (parts.length === 0) {
            return null;
        }
        
        // Create route object
        const route = {
            type: parts[0].toLowerCase(),
            id: null,
            page: null // Initialize page as null
        };
        
        // Handle the ID and page parameters
        if (parts.length > 1) {
            if (route.type === 'asset') {
                // For assets, the ID is the asset name
                route.id = parts[1];
                
                // Check if there's a page parameter (parts[2])
                if (parts.length > 2) {
                    const pageParam = parseInt(parts[2]);
                    if (!isNaN(pageParam) && pageParam > 0) {
                        route.page = pageParam;
                    }
                }
            } else {
                // For other routes, just use parts[1] as the ID
                route.id = parts.slice(1).join('/');
            }
        }
        
        return route;
    },
    
    // Navigate to a parsed route
    navigateToRoute: function(route) {
        console.log('Navigating to route:', route);
        
        switch (route.type) {
            case 'view':
                // Handle main view navigation
                if (route.id && ['dashboard', 'blocks', 'transactions', 'addresses', 'assets'].includes(route.id)) {
                    window.app.navigateToView(route.id, false);
                }
                break;
                
            case 'block':
                // Handle block details navigation
                if (route.id) {
                    window.app.navigateToBlockDetails(route.id, false);
                }
                break;
                
            case 'tx':
                // Handle transaction details navigation
                if (route.id) {
                    window.app.navigateToTransactionDetails(route.id, false);
                }
                break;
                
            case 'address':
                // Handle address details navigation
                if (route.id) {
                    window.app.navigateToAddressDetails(route.id, false);
                }
                break;
                
            case 'asset':
                // Handle asset details navigation with pagination
                if (route.id) {
                    // Set the page in app state if provided
                    if (route.page) {
                        window.app.appState.assetHoldersPagination.page = route.page;
                    } else {
                        window.app.appState.assetHoldersPagination.page = 1;
                    }
                    window.app.navigateToAssetDetails(route.id, false);
                }
                break;
                
            default:
                console.warn('Unknown route type:', route.type);
                break;
        }
    },
    
    
    // Update the URL hash without triggering navigation
    updateHash: function(type, id) {
        const newHash = id ? `#/${type}/${id}` : `#/${type}`;
        
        // Only update if hash has changed to avoid unnecessary history entries
        if (window.location.hash !== newHash) {
            // Use history.replaceState to update the URL without triggering hashchange
            window.history.pushState(null, '', newHash);
        }
    },
    
    // Helper methods for updating specific route types
    
    // Update to main view
    navigateToView: function(viewName) {
        this.updateHash('view', viewName);
    },
    
    // Update to block details
    navigateToBlock: function(blockHash) {
        this.updateHash('block', blockHash);
    },
    
    // Update to transaction details
    navigateToTransaction: function(txid) {
        this.updateHash('tx', txid);
    },
    
    // Update to address details
    navigateToAddress: function(address) {
        this.updateHash('address', address);
    },
    
    // Update to asset details
    navigateToAsset: function(assetName, page = null) {
        if (page && page > 1) {
            this.updateHash('asset', `${assetName}/${page}`);
        } else {
            this.updateHash('asset', assetName);
        }
    }
    
};

// Export the Router
window.router = Router;