// EVR Tracky Boi - UI Utilities

// UI utilities object
const UI = {
    // Show a notification toast
    showNotification: function(title, message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // Add notification content
        notification.innerHTML = `
            <div class="notification-header">
                <span class="notification-title">${title}</span>
                <button class="notification-close">&times;</button>
            </div>
            <div class="notification-body">
                <p>${message}</p>
            </div>
        `;
        
        // Add to DOM
        if (!document.querySelector('.notifications-container')) {
            const container = document.createElement('div');
            container.className = 'notifications-container';
            document.body.appendChild(container);
        }
        
        document.querySelector('.notifications-container').appendChild(notification);
        
        // Add close handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.add('notification-closing');
            setTimeout(() => {
                notification.remove();
            }, 300);
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('notification-closing');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 5000);
    },
    
    // Show loading indicator
    showLoading: function(elementOrId, message = 'Loading...') {
        const element = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
        if (!element) return;
        
        // Create and add loading overlay
        const loadingEl = document.createElement('div');
        loadingEl.className = 'loading-overlay';
        loadingEl.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-message">${message}</div>
        `;
        
        element.style.position = 'relative';
        element.appendChild(loadingEl);
        
        return loadingEl;
    },
    
    // Hide loading indicator
    hideLoading: function(loadingElement) {
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.remove();
        }
    },
    
    // Create a confirmation dialog
    confirm: function(title, message, onConfirm, onCancel) {
        // Create modal element
        const modal = document.createElement('div');
        modal.className = 'modal';
        
        // Add modal content
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">Cancel</button>
                    <button class="btn btn-primary modal-confirm">Confirm</button>
                </div>
            </div>
        `;
        
        // Add to DOM
        document.body.appendChild(modal);
        
        // Add click handlers
        modal.querySelector('.modal-close').addEventListener('click', () => {
            closeModal();
            if (onCancel) onCancel();
        });
        
        modal.querySelector('.modal-cancel').addEventListener('click', () => {
            closeModal();
            if (onCancel) onCancel();
        });
        
        modal.querySelector('.modal-confirm').addEventListener('click', () => {
            closeModal();
            if (onConfirm) onConfirm();
        });
        
        // Close modal function
        function closeModal() {
            modal.classList.add('modal-closing');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('modal-visible');
        }, 10);
    },
    
    // Format an output address display
    formatOutputAddress: function(vout) {
        if (!vout) return '';
        
        let addressHtml = '';
        
        // Parse address from script pub key
        if (vout.scriptPubKey) {
            if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.length > 0) {
                const address = vout.scriptPubKey.addresses[0];
                addressHtml = `<a href="#" class="address-link" data-address="${address}">${address}</a>`;
            } else if (vout.scriptPubKey.address) {
                addressHtml = `<a href="#" class="address-link" data-address="${vout.scriptPubKey.address}">${vout.scriptPubKey.address}</a>`;
            } else {
                // Handle non-standard scripts
                addressHtml = `<span class="script-type">${vout.scriptPubKey.type || 'Non-standard'}</span>`;
            }
            
            // Add OP_RETURN data if present
            if (vout.scriptPubKey.asm && vout.scriptPubKey.asm.startsWith('OP_RETURN')) {
                const data = vout.scriptPubKey.asm.substring(10);
                addressHtml += `<div class="op-return-data">OP_RETURN: <span class="monospace">${data}</span></div>`;
            }
        } else {
            addressHtml = '<span class="unknown-address">Unknown</span>';
        }
        
        return addressHtml;
    },
    
    // Format input address display
    formatInputAddress: function(vin) {
        if (!vin) return '';
        
        // Coinbase transaction
        if (vin.coinbase) {
            return '<span class="coinbase-tag">Coinbase (Newly Generated Coins)</span>';
        }
        
        // Regular transaction input
        if (vin.txid) {
            return `
                <div class="input-txid">
                    <span class="label">From Tx:</span>
                    <a href="#" class="tx-link" data-txid="${vin.txid}">${window.app.formatHash(vin.txid)}</a>
                </div>
                <div class="input-vout">
                    <span class="label">Output Index:</span>
                    <span>${vin.vout}</span>
                </div>
            `;
        }
        
        return '<span class="unknown-input">Unknown</span>';
    },
    
    // Render asset details
    renderAssetDetails: function(vout) {
        if (!vout || !vout.scriptPubKey || !vout.scriptPubKey.asset) {
            return '';
        }
        
        const asset = vout.scriptPubKey.asset;
        return `
            <div class="output-asset">
                <span class="asset-name">
                    <a href="#" class="asset-link" data-asset="${asset.name}">${asset.name}</a>
                </span>
                <span class="asset-amount">${asset.amount.toLocaleString()}</span>
            </div>
        `;
    },
    
    // Update transaction status with confirmations and appropriate styling
    updateTxStatus: function(confirmations) {
        const txStatusEl = document.getElementById('tx-status');
        const txConfirmationsEl = document.getElementById('tx-confirmations');
        const txStatusContainer = document.getElementById('tx-status-container');
        
        if (!txStatusEl || !txConfirmationsEl || !txStatusContainer) return;
        
        if (confirmations === 'Unconfirmed') {
            txStatusEl.textContent = 'Pending';
            txStatusEl.className = 'status-value pending';
            txConfirmationsEl.textContent = '(In Mempool)';
            txStatusContainer.className = 'transaction-status pending';
        } else if (confirmations === 0) {
            txStatusEl.textContent = 'Pending';
            txStatusEl.className = 'status-value pending';
            txConfirmationsEl.textContent = '(0 Confirmations)';
            txStatusContainer.className = 'transaction-status pending';
        } else if (confirmations < 6) {
            txStatusEl.textContent = 'Confirming';
            txStatusEl.className = 'status-value confirming';
            txConfirmationsEl.textContent = `(${confirmations} Confirmation${confirmations > 1 ? 's' : ''})`;
            txStatusContainer.className = 'transaction-status confirming';
        } else {
            txStatusEl.textContent = 'Confirmed';
            txStatusEl.className = 'status-value confirmed';
            txConfirmationsEl.textContent = `(${confirmations.toLocaleString()} Confirmations)`;
            txStatusContainer.className = 'transaction-status confirmed';
        }
    },
    
    // Add event listeners to make elements with the same class clickable
    addClickHandlers: function(className, handler) {
        document.querySelectorAll(`.${className}`).forEach(element => {
            element.addEventListener('click', handler);
        });
    },
    
    // Update RPC status in UI
    updateRpcStatus: function() {
        const rpcCount = document.getElementById('rpc-count');
        if (rpcCount && window.utilities && window.utilities.currentRpcRequests) {
            const count = window.utilities.currentRpcRequests.length;
            rpcCount.textContent = count.toString();
            
            // Add visual indicator if there are active requests
            if (count > 0) {
                rpcCount.classList.add('has-active-requests');
            } else {
                rpcCount.classList.remove('has-active-requests');
            }
        }
    },
    
    // Create a tooltip for an element
    createTooltip: function(element, text) {
        element.classList.add('tooltip');
        const tooltip = document.createElement('span');
        tooltip.className = 'tooltip-text';
        tooltip.textContent = text;
        element.appendChild(tooltip);
    }
};



// Expose UI to window
window.ui = UI;