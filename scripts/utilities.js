// utilities.js - Enhanced caching version


// Cache Duration Variables - these will be overridden by settings
let ADDRESS_DATA_CACHE_DURATION = 3600000; // 1 hour
let BLOCK_COUNT_CACHE_DURATION = 60000; // 1 minute
let MEMPOOL_CACHE_DURATION = 30000; // 30 seconds for mempool data
let UTXO_CACHE_DURATION = 1800000; // 30 minutes for UTXO data
let TX_HISTORY_CACHE_DURATION = 3600000; // 1 hour for transaction histories
let ASSET_DATA_CACHE_DURATION = 86400000; // 24 hours for asset data
let INDEFINITE_CACHE = 31536000000; // ~1 year (for immutable data)

// RPC Configuration
let RPC_URL = 'https://evr-rpc-mainnet.ting.finance/rpc/';
let MAX_CONCURRENT_REQUESTS = 50;

// Function to update cache durations from settings
function setCacheDurations(durations) {
  if (!durations) return;
  
  ADDRESS_DATA_CACHE_DURATION = durations.addressData || ADDRESS_DATA_CACHE_DURATION;
  BLOCK_COUNT_CACHE_DURATION = durations.blockCount || BLOCK_COUNT_CACHE_DURATION;
  MEMPOOL_CACHE_DURATION = durations.mempool || MEMPOOL_CACHE_DURATION;
  UTXO_CACHE_DURATION = durations.utxo || UTXO_CACHE_DURATION;
  TX_HISTORY_CACHE_DURATION = durations.txHistory || TX_HISTORY_CACHE_DURATION;
  ASSET_DATA_CACHE_DURATION = durations.assetData || ASSET_DATA_CACHE_DURATION;
  INDEFINITE_CACHE = durations.indefinite || INDEFINITE_CACHE;
  
  console.log('Cache durations updated:', durations);
}

// IndexedDB Setup
let dbPromise = null;

// Track current RPC requests (for UI purposes)
let currentRpcRequests = [];
let requestCounter = 0;

// RPC Queue for managing concurrent requests
const rpcQueue = [];
let activeRequests = 0;
const maxConcurrent = 50; // Adjust based on server limits

// Cache hit counter (for debugging)
let cacheHits = 0;
let cacheMisses = 0;


// Function to set RPC URL
function setRpcUrl(url) {
  if (url && typeof url === 'string') {
    RPC_URL = url;
    console.log('RPC URL updated:', url);
  }
}

// Function to set max concurrent requests
function setMaxConcurrentRequests(max) {
  if (max && !isNaN(max) && max > 0) {
    MAX_CONCURRENT_REQUESTS = max;
    console.log('Max concurrent requests updated:', max);
  }
}


// Open IndexedDB with improved schema
function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('BlockExplorerDB', 2); // Increased version for schema update
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create stores if they don't exist
      if (!db.objectStoreNames.contains('heightToHash')) {
        db.createObjectStore('heightToHash', { keyPath: 'height' });
      }
      
      if (!db.objectStoreNames.contains('blockMetadata')) {
        db.createObjectStore('blockMetadata', { keyPath: 'height' });
      }
      
      if (!db.objectStoreNames.contains('assetsCache')) {
        db.createObjectStore('assetsCache', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('assetData')) {
        db.createObjectStore('assetData', { keyPath: 'assetName' });
      }
      
      if (!db.objectStoreNames.contains('addressTxids')) {
        db.createObjectStore('addressTxids', { keyPath: 'cacheKey' });
      }
      
      if (!db.objectStoreNames.contains('addressFullData')) {
        // New comprehensive address data store
        db.createObjectStore('addressFullData', { keyPath: 'address' });
      }
      
      if (!db.objectStoreNames.contains('spendingTxCache')) {
        db.createObjectStore('spendingTxCache', { keyPath: 'cacheKey' });
      }
      
      if (!db.objectStoreNames.contains('blocks')) {
        db.createObjectStore('blocks', { keyPath: 'hash' });
      }
      
      if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'txid' });
      }
      
      if (!db.objectStoreNames.contains('misc')) {
        db.createObjectStore('misc', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('addressCache')) {
        db.createObjectStore('addressCache', { keyPath: 'address' });
      }
      
      if (!db.objectStoreNames.contains('outputStatusCache')) {
        db.createObjectStore('outputStatusCache', { keyPath: 'cacheKey' });
      }
      
      if (!db.objectStoreNames.contains('transactionDetailsCache')) {
        db.createObjectStore('transactionDetailsCache', { keyPath: 'txid' });
      }
      
      if (!db.objectStoreNames.contains('blockDetailsCache')) {
        db.createObjectStore('blockDetailsCache', { keyPath: 'blockHash' });
      }
      
      if (!db.objectStoreNames.contains('mempoolCache')) {
        db.createObjectStore('mempoolCache', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('utxoCache')) {
        db.createObjectStore('utxoCache', { keyPath: 'address' });
      }
      
      if (!db.objectStoreNames.contains('assetHoldersCache')) {
        // New store for asset holders data
        db.createObjectStore('assetHoldersCache', { keyPath: 'cacheKey' });
      }
      
      if (!db.objectStoreNames.contains('assetTxsCache')) {
        // New store for asset-related transactions
        db.createObjectStore('assetTxsCache', { keyPath: 'assetName' });
      }
      
      if (!db.objectStoreNames.contains('blockRangeCache')) {
        // New store for caching ranges of blocks
        db.createObjectStore('blockRangeCache', { keyPath: 'cacheKey' });
      }
    };
    
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
  return dbPromise;
}

// Save to IndexedDB with error handling
async function saveToIndexedDB(storeName, data) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
      
      // Add transaction complete handler
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.warn(`Error saving to IndexedDB store ${storeName}:`, error);
    // Fail gracefully - don't let cache errors disrupt the app
    return null;
  }
}

// Load from IndexedDB with error handling
async function loadFromIndexedDB(storeName, key) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.warn(`Error loading from IndexedDB store ${storeName}:`, error);
    // Fail gracefully
    return null;
  }
}

// Delete from IndexedDB
async function deleteFromIndexedDB(storeName, key) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.warn(`Error deleting from IndexedDB store ${storeName}:`, error);
    return null;
  }
}


// Modified queue RPC function to use dynamic max concurrent
async function queueRpc(method, params = []) {
  return new Promise((resolve, reject) => {
    console.warn(method);
    rpcQueue.push({ method, params, resolve, reject });
    processQueue();
  });
}

// Process the RPC queue
async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || !rpcQueue.length) return;
  activeRequests++;
  const { method, params, resolve, reject } = rpcQueue.shift();
  try {
    const result = await callRpc(method, params);
    resolve(result);
  } catch (e) {
    reject(e);
  } finally {
    activeRequests--;
    processQueue();
  }
}


// Create normalized cache key with stable serialization
function createCacheKey(method, params) {
  // Special case for certain methods where order doesn't matter
  if (['getaddressutxos', 'getaddressbalance', 'getaddressdeltas'].includes(method) && 
      Array.isArray(params) && params.length === 1 && typeof params[0] === 'object') {
        
    // Sort addresses to ensure consistent cache keys
    if (params[0].addresses && Array.isArray(params[0].addresses)) {
      const sortedAddresses = [...params[0].addresses].sort();
      const normalizedParams = {...params[0], addresses: sortedAddresses};
      return `${method}_${JSON.stringify(normalizedParams)}`;
    }
  }
  
  // Default case
  return `${method}_${JSON.stringify(params)}`;
}

// RPC Call Function with Enhanced Caching
async function callRpc(method, params = []) {
  const cacheKey = createCacheKey(method, params);
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  const now = Date.now();
  let cacheDuration;

  // Determine cache duration based on method
  switch (method) {
    // Block-related mutable data (changes with new blocks)
    case 'getblockcount':
    case 'getbestblockhash':
    case 'getdifficulty':
      cacheDuration = BLOCK_COUNT_CACHE_DURATION;
      break;

    // Mempool-related data (changes frequently)
    case 'getrawmempool':
    case 'getmempoolinfo':
    case 'getmempoolentry':
    case 'getmempoolancestors':
    case 'getmempooldescendants':
    case 'getaddressmempool':
      cacheDuration = MEMPOOL_CACHE_DURATION;
      break;

    // UTXO and balance data (changes with transactions)
    case 'getaddressutxos':
    case 'getaddressbalance':
    case 'listassetbalancesbyaddress':
    case 'gettxout':
    case 'getspentinfo':
      cacheDuration = UTXO_CACHE_DURATION;
      break;

    // Address transaction history - long cache
    case 'getaddresstxids':
    case 'getaddressdeltas':
      cacheDuration = TX_HISTORY_CACHE_DURATION;
      break;

    // Asset data (generally static)
    case 'getassetdata':
    case 'listassets':
    case 'listaddressesbyasset':
      cacheDuration = ASSET_DATA_CACHE_DURATION;
      break;

    // Immutable data (blocks, transactions, proofs)
    case 'getblockhash':
    case 'getblock':
    case 'getblockheader':
    case 'gettxoutproof':
    case 'getrawtransaction': 
      cacheDuration = INDEFINITE_CACHE;
      break;

    // Statistical or semi-static data
    case 'getchaintips':
    case 'getchaintxstats':
    case 'getnetworkhashps':
    case 'getblockchaininfo':
      cacheDuration = 300000; // 5 minutes
      break;

    // Utility functions (cache for consistency)
    case 'decodeblock':
    case 'decoderawtransaction':
    case 'decodescript':
    case 'combinerawtransaction':
    case 'createrawtransaction':
      cacheDuration = INDEFINITE_CACHE; // Same input, same output
      break;

    // Default for unhandled methods
    default:
      cacheDuration = 60000; // 1 minute
  }

  if (cachedData && (cacheDuration === INDEFINITE_CACHE || now - cachedData.timestamp < cacheDuration)) {
    // Cache hit
    cacheHits++;
    if (cacheHits % 100 === 0) {
      console.log(`Cache hits: ${cacheHits}, misses: ${cacheMisses}`);
    }
    return cachedData.result;
  }

  // Cache miss
  cacheMisses++;
  
  const requestId = requestCounter++;
  currentRpcRequests.push({ id: requestId, method, timestamp: Date.now() });
  if (window.ui && typeof window.ui.updateRpcStatus === 'function') window.ui.updateRpcStatus();

  try {
    // Use the dynamic RPC_URL from settings
    const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '1.0',
            id: '1',
            method: method,
            params: params
        })
    });
    
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const result = data.result;
    
    // Save to cache with timestamp
    await saveToIndexedDB('misc', { id: cacheKey, result, timestamp: now });
    
    return result;
  } catch (error) {
    console.error(`RPC error for ${method}:`, error);
    throw error;
  } finally {
    // Remove this request from tracking
    currentRpcRequests = currentRpcRequests.filter(req => req.id !== requestId);
    if (window.ui && typeof window.ui.updateRpcStatus === 'function') window.ui.updateRpcStatus();
  }
}


// ### Addressindex Functions ###

// Enhanced address balance function with better caching
async function getAddressBalance(address) {
  // Normalize address parameter
  const addressParam = typeof address === 'string' 
    ? { addresses: [address] } 
    : (address.addresses ? address : { addresses: [address] });
  
  // For a single address, check comprehensive cache first
  if (addressParam.addresses && addressParam.addresses.length === 1) {
    const singleAddress = addressParam.addresses[0];
    const fullData = await loadFromIndexedDB('addressFullData', singleAddress);
    
    if (fullData && fullData.balance && (Date.now() - fullData.timestamp < ADDRESS_DATA_CACHE_DURATION)) {
      return fullData.balance;
    }
  }
  
  // Proceed with RPC call if not in comprehensive cache
  return await queueRpc('getaddressbalance', [addressParam]);
}

async function getAddressDeltas(address, start, end) {
  // Normalize address parameter
  const addressParam = typeof address === 'string' 
    ? { addresses: [address] } 
    : (address.addresses ? address : { addresses: [address] });
  
  const params = [addressParam];
  if (start !== undefined) params.push(start);
  if (end !== undefined) params.push(end);
  
  // Create cache key that includes range
  const cacheKey = `addressDeltas_${JSON.stringify(addressParam)}_${start || 0}_${end || 'latest'}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData && (Date.now() - cachedData.timestamp < TX_HISTORY_CACHE_DURATION)) {
    return cachedData.result;
  }
  
  // Make RPC call
  const result = await queueRpc('getaddressdeltas', params);
  
  // Cache result
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result, 
    timestamp: Date.now() 
  });
  
  return result;
}

async function getAddressMempool(address) {
  // Normalize address parameter
  const addressParam = typeof address === 'string' 
    ? { addresses: [address] } 
    : (address.addresses ? address : { addresses: [address] });
  
  return await queueRpc('getaddressmempool', [addressParam]);
}



async function getAddressTxids(address, page = 1) {
  const perPage = 10;
  const initialBlocksToScan = 10;
  const maxBlocksToScan = 10000; // Increased from 1000 to allow finding older transactions
  const maxRequestsPerPage = 8;  // Increased from 5 to allow more parallel requests
  
  // Normalize address parameter
  const addressParam = typeof address === 'string' 
    ? { addresses: [address] } 
    : (address.addresses ? address : { addresses: [address] });
  
  // For simplicity, extract single address if we have one
  const singleAddress = addressParam.addresses && addressParam.addresses.length === 1 
    ? addressParam.addresses[0] 
    : null;
  
  // First try comprehensive cache for fast response
  if (singleAddress) {
    // Check if we already have a page-specific cache for this request
    const pageSpecificCacheKey = `${singleAddress}_page_${page}`;
    const pageCache = await loadFromIndexedDB('addressTxids', pageSpecificCacheKey);
    
    if (pageCache && pageCache.txids) {
      console.log(`Cache hit for address ${singleAddress} page ${page}`);
      return { 
        pageTxids: pageCache.txids.slice(0, perPage), 
        hasMore: pageCache.txids.length > perPage || pageCache.hasMore 
      };
    }
    
    // Check comprehensive address data cache
    const fullAddressData = await loadFromIndexedDB('addressFullData', singleAddress);
    if (fullAddressData && fullAddressData.allTxids && 
        (Date.now() - fullAddressData.timestamp < ADDRESS_DATA_CACHE_DURATION)) {
      
      console.log(`Full data cache hit for address ${singleAddress}`);
      // Calculate pagination from the complete list
      const startIdx = (page - 1) * perPage;
      const endIdx = startIdx + perPage;
      const pageTxids = fullAddressData.allTxids.slice(startIdx, endIdx);
      const hasMore = fullAddressData.allTxids.length > endIdx;
      
      // Cache this page result for faster access next time
      await saveToIndexedDB('addressTxids', { 
        cacheKey: pageSpecificCacheKey, 
        txids: pageTxids,
        hasMore,
        timestamp: Date.now()
      });
      
      return { pageTxids, hasMore };
    }
  }
  
  // If not in cache, proceed with exponential search pattern
  console.log(`Cache miss for address ${singleAddress}, performing exponential search`);
  const currentHeight = await getBlockCount();
  
  // Variables for exponential search pattern
  const allTxids = [];
  let requestCount = 0;
  let heightsToSearch = [];
  let scanHeightStart = currentHeight;
  let batchSize = initialBlocksToScan;
  let foundTxids = true; // Start true to enter the loop
  
  // Generate the heights to search using exponential increasing batch sizes
  // Example: [0-10], [11-30], [31-70], [71-150], ...
  while (scanHeightStart > 0 && batchSize <= maxBlocksToScan) {
      const endHeight = scanHeightStart;
      const startHeight = Math.max(scanHeightStart - batchSize + 1, 0);
      
      heightsToSearch.push({
          start: startHeight,
          end: endHeight
      });
      
      scanHeightStart = startHeight - 1;
      // Double batch size each time (exponential growth)
      batchSize = batchSize * 2; 
      
      // Safety check for very large addresses
      if (heightsToSearch.length >= maxRequestsPerPage) {
          break;
      }
  }
  
  // Process heights in parallel batches
  const processedRanges = [];
  
  // Extract the page-specific range based on page number
  const pageOffset = (page - 1) * heightsToSearch.length / 2;
  const rangesForThisPage = heightsToSearch.slice(
      Math.min(Math.floor(pageOffset), heightsToSearch.length - 1),
      Math.min(Math.floor(pageOffset) + maxRequestsPerPage, heightsToSearch.length)
  );
  
  console.log(`Searching ${rangesForThisPage.length} block ranges for page ${page}`);
  
  // Execute RPC calls in parallel batches
  const batchPromises = rangesForThisPage.map(async range => {
      const cacheKey = `${JSON.stringify(addressParam)}_${range.start}_${range.end}`;
      let cachedTxids = await loadFromIndexedDB('addressTxids', cacheKey);
      
      if (cachedTxids) {
          console.log(`Cache hit for range ${range.start}-${range.end}`);
          return { 
              range, 
              txids: cachedTxids.txids,
              fromCache: true
          };
      }
      
      try {
          console.log(`Searching blocks ${range.start} to ${range.end} for ${singleAddress}`);
          const txids = await queueRpc('getaddresstxids', [{ 
              ...addressParam, 
              start: range.start, 
              end: range.end 
          }]);
          
          // Cache this range result
          await saveToIndexedDB('addressTxids', { 
              cacheKey, 
              txids,
              timestamp: Date.now()
          });
          
          return { range, txids, fromCache: false };
      } catch (error) {
          console.error(`Error searching range ${range.start}-${range.end}:`, error);
          return { range, txids: [], error: true };
      }
  });
  
  // Wait for all parallel requests to complete
  const batchResults = await Promise.all(batchPromises);
  
  // Combine results in chronological order (oldest first)
  let combinedTxids = [];
  for (const result of batchResults.sort((a, b) => a.range.start - b.range.start)) {
      if (result.txids && result.txids.length > 0) {
          combinedTxids = [...combinedTxids, ...result.txids];
      }
  }
  
  // Store in comprehensive cache if it's a single address
  if (singleAddress && combinedTxids.length > 0) {
      // Update or create address data
      let fullAddressData = await loadFromIndexedDB('addressFullData', singleAddress) || { 
          address: singleAddress 
      };
      
      // Merge with existing txids if available
      if (fullAddressData.allTxids && Array.isArray(fullAddressData.allTxids)) {
          // Create a Set to efficiently remove duplicates
          const txidSet = new Set([...combinedTxids, ...fullAddressData.allTxids]);
          fullAddressData.allTxids = Array.from(txidSet);
      } else {
          fullAddressData.allTxids = combinedTxids;
      }
      
      fullAddressData.timestamp = Date.now();
      
      // Save back to comprehensive cache
      await saveToIndexedDB('addressFullData', fullAddressData);
      
      console.log(`Updated comprehensive cache for ${singleAddress} with ${fullAddressData.allTxids.length} txids`);
  }
  
  // Now handle pagination for the combined results
  combinedTxids = combinedTxids.reverse(); // Most recent first
  const hasMoreBlocks = batchResults.length > 0 && 
                      batchResults[batchResults.length - 1].range.start > 0;
  
  // Slice for the current page
  const pageTxids = combinedTxids.slice(0, perPage);
  const hasMore = combinedTxids.length > perPage || hasMoreBlocks;
  
  // Cache the page result for faster access next time
  if (singleAddress) {
      const pageKey = `${singleAddress}_page_${page}`;
      await saveToIndexedDB('addressTxids', { 
          cacheKey: pageKey, 
          txids: pageTxids, 
          hasMore,
          timestamp: Date.now()
      });
  }
  
  return { pageTxids, hasMore };
}

// Improved UTXO function with better caching
async function getAddressUtxos(address, includeMempool = true) {
    // Format the address parameter correctly
    const addressParam = typeof address === 'string' 
      ? { addresses: [address] } 
      : (address.addresses ? address : { addresses: [address] });
    
    // For a single address, check comprehensive cache
    if (addressParam.addresses && addressParam.addresses.length === 1) {
      const singleAddress = addressParam.addresses[0];
      const fullData = await loadFromIndexedDB('addressFullData', singleAddress);
      const now = Date.now();
      
      if (fullData && fullData.utxos && (now - fullData.utxoTimestamp < UTXO_CACHE_DURATION)) {
        return fullData.utxos;
      }
      
      // If not in address cache, check UTXO-specific cache
      const cachedUtxos = await loadFromIndexedDB('utxoCache', singleAddress);
      if (cachedUtxos && (now - cachedUtxos.timestamp < UTXO_CACHE_DURATION)) {
        return cachedUtxos.utxos;
      }
    }
    
    // Make the RPC call
    const utxos = await queueRpc('getaddressutxos', [addressParam]);
    
    // Cache result for a single address
    if (addressParam.addresses && addressParam.addresses.length === 1) {
      const singleAddress = addressParam.addresses[0];
      
      // Update UTXO-specific cache
      await saveToIndexedDB('utxoCache', { 
        address: singleAddress, 
        utxos, 
        timestamp: Date.now() 
      });
      
      // Also update comprehensive cache if it exists
      const fullData = await loadFromIndexedDB('addressFullData', singleAddress);
      if (fullData) {
        fullData.utxos = utxos;
        fullData.utxoTimestamp = Date.now();
        await saveToIndexedDB('addressFullData', fullData);
      }
    }
    
    return utxos;
}

// ### Assets Functions ###

// Enhanced asset data function with better caching
async function getAssetData(assetName) {
  // Normalize asset name to uppercase

  const normalizedAssetName = assetName.toUpperCase();
  
  const cachedData = await loadFromIndexedDB('assetData', normalizedAssetName);
  if (cachedData && (Date.now() - cachedData.timestamp < ASSET_DATA_CACHE_DURATION)) {
    return cachedData.data;
  }
  
  //const assetData = await queueRpc('getassetdata', [normalizedAssetName]);
  const assetData = await queueRpc('getassetdata', [normalizedAssetName]);
  //console.log('Asset data for', normalizedAssetName, ':', assetData);
  
  await saveToIndexedDB('assetData', { 
    assetName: normalizedAssetName, 
    data: assetData,
    timestamp: Date.now()
  });
  
  return assetData;
}

// Improved asset holders function with caching
async function listAddressesByAsset(assetName, onlytotal = false, count = 10, start = 0) {
  // Create cache key that includes pagination
  const cacheKey = `${assetName.toUpperCase()}_holders_${onlytotal}_${count}_${start}`;
  
  // Check cache first
  const cachedData = await loadFromIndexedDB('assetHoldersCache', cacheKey);
  if (cachedData && (Date.now() - cachedData.timestamp < ASSET_DATA_CACHE_DURATION)) {
    return cachedData.holders;
  }
  
  // Make the RPC call
  const holders = await queueRpc('listaddressesbyasset', [assetName, onlytotal, count, start]);
  
  // Cache the result
  await saveToIndexedDB('assetHoldersCache', { 
    cacheKey, 
    holders,
    timestamp: Date.now()
  });
  
  return holders;
}

async function listAssetBalancesByAddress(address, onlytotal = false, count = 10, start = 0) {
  // Create cache key
  const cacheKey = `${address}_assetBalances_${onlytotal}_${count}_${start}`;
  
  // Check comprehensive address cache first
  const fullData = await loadFromIndexedDB('addressFullData', address);
  if (fullData && fullData.assetBalances && (Date.now() - fullData.timestamp < ADDRESS_DATA_CACHE_DURATION)) {
    return fullData.assetBalances;
  }
  
  // Then check specific cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData && (Date.now() - cachedData.timestamp < ASSET_DATA_CACHE_DURATION)) {
    return cachedData.result;
  }
  
  // Make the RPC call
  const balances = await queueRpc('listassetbalancesbyaddress', [address, onlytotal, count, start]);
  
  // Cache the result
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: balances,
    timestamp: Date.now()
  });
  
  // Also update comprehensive address cache if it exists
  if (fullData) {
    fullData.assetBalances = balances;
    fullData.timestamp = Date.now();
    await saveToIndexedDB('addressFullData', fullData);
  }
  
  return balances;
}

// Improved asset listing with better caching
async function listAssets(asset = '', verbose = false, count = 9999999, start = 0) {
  // Create cache key that includes parameters
  const cacheKey = `listAssets_${asset}_${verbose}_${count}_${start}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData && (Date.now() - cachedData.timestamp < ASSET_DATA_CACHE_DURATION)) {
    return cachedData.result;
  }
  
  // Make the RPC call
  const assets = await queueRpc('listassets', [asset, verbose, count, start]);
  
  // Cache result
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: assets,
    timestamp: Date.now()
  });
  
  return assets;
}

// ### Blockchain Functions ###
async function decodeBlock(blockHex) {
  // This is a deterministic function, can be cached indefinitely
  const cacheKey = `decodeBlock_${blockHex}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  // Make the RPC call
  const decoded = await queueRpc('decodeblock', [blockHex]);
  
  // Cache result indefinitely (no timestamp needed)
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: decoded,
    timestamp: Date.now()
  });
  
  return decoded;
}

async function getBestBlockHash() {
  return await queueRpc('getbestblockhash');
}

// Improved block retrieval with enhanced caching
async function getBlock(blockHash, verbosity = 2) {
  const cachedBlock = await loadFromIndexedDB('blocks', blockHash);
  if (cachedBlock) return cachedBlock.data;
  
  const block = await queueRpc('getblock', [blockHash, verbosity]);
  
  // Cache the block indefinitely - blocks don't change once confirmed
  await saveToIndexedDB('blocks', { 
    hash: blockHash, 
    data: block, 
    timestamp: Date.now()
  });
  
  // Also cache the block height to hash mapping
  if (block.height !== undefined) {
    await saveToIndexedDB('heightToHash', { 
      height: block.height, 
      hash: blockHash 
    });
  }
  
  return block;
}

async function getBlockChainInfo() {
  return await queueRpc('getblockchaininfo');
}

async function getBlockCount() {
  return await queueRpc('getblockcount');
}

// Enhanced block hash lookup with better caching
async function getBlockHash(height) {
  const cachedHash = await loadFromIndexedDB('heightToHash', height);
  if (cachedHash) return cachedHash.hash;
  
  const hash = await queueRpc('getblockhash', [height]);
  
  // Cache the hash indefinitely - the mapping doesn't change for confirmed blocks
  await saveToIndexedDB('heightToHash', { 
    height, 
    hash,
    timestamp: Date.now() 
  });
  
  return hash;
}

async function getBlockHeader(hash, verbose = true) {
  // Cache block headers indefinitely
  const cacheKey = `blockHeader_${hash}_${verbose}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  // Make the RPC call
  const header = await queueRpc('getblockheader', [hash, verbose]);
  
  // Cache indefinitely
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: header,
    timestamp: Date.now() 
  });
  
  return header;
}

async function getChainTips() {
  // Short cache for this since tips can change
  return await queueRpc('getchaintips');
}

async function getChainTxStats(nblocks = 1, blockhash = '') {
  const params = [];
  if (nblocks !== undefined) params.push(nblocks);
  if (blockhash !== undefined && blockhash !== '') params.push(blockhash);
  
  // Create cache key
  const cacheKey = `chainTxStats_${nblocks}_${blockhash}`;
  
  // Check cache for recently computed stats
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < 300000) { // 5 min cache
    return cachedData.result;
  }
  
  const stats = await queueRpc('getchaintxstats', params);
  
  // Cache the result
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: stats,
    timestamp: Date.now() 
  });
  
  return stats;
}

async function getDifficulty() {
  return await queueRpc('getdifficulty');
}

async function getMempoolAncestors(txid, verbose = false) {
  return await queueRpc('getmempoolancestors', [txid, verbose]);
}

async function getMempoolDescendants(txid, verbose = false) {
  return await queueRpc('getmempooldescendants', [txid, verbose]);
}

async function getMempoolEntry(txid) {
  return await queueRpc('getmempoolentry', [txid]);
}

async function getMempoolInfo() {
  return await queueRpc('getmempoolinfo');
}

async function getRawMempool(verbose = false) {
  return await queueRpc('getrawmempool', [verbose]);
}

// Improved spent info check with better caching
async function getSpentInfo(txid, vout) {
  try {
    // Create cache key
    const cacheKey = `spentInfo_${txid}_${vout}`;
    
    // Check cache
    const cachedData = await loadFromIndexedDB('spendingTxCache', cacheKey);
    if (cachedData) {
      // For spent outputs, the data is valid indefinitely
      if (cachedData.result && cachedData.result.txid) {
        return cachedData.result;
      }
      
      // For unspent outputs, only trust cache for a limited time
      if (Date.now() - cachedData.timestamp < UTXO_CACHE_DURATION) {
        return cachedData.result;
      }
    }
    
    // Make the RPC call
    const result = await queueRpc('getspentinfo', [{ txid: txid, index: vout }]);
    
    // Cache the result
    await saveToIndexedDB('spendingTxCache', { 
      cacheKey, 
      result,
      timestamp: Date.now() 
    });
    
    return result;
  } catch (e) {
    console.error(`Error in getSpentInfo for ${txid}:${vout}: ${e.message}`);
    
    // Cache the null result but with a shorter duration
    const cacheKey = `spentInfo_${txid}_${vout}`;
    await saveToIndexedDB('spendingTxCache', { 
      cacheKey, 
      result: null,
      timestamp: Date.now() 
    });
    
    return null;
  }
}

async function getTxOut(txid, n, includeMempool = true) {
  // Create cache key
  const cacheKey = `txOut_${txid}_${n}_${includeMempool}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    // For null results (spent outputs), cache is valid indefinitely
    if (cachedData.result === null) {
      return null;
    }
    
    // For unspent outputs, cache for limited time
    if (Date.now() - cachedData.timestamp < UTXO_CACHE_DURATION) {
      return cachedData.result;
    }
  }
  
  // Make the RPC call
  const result = await queueRpc('gettxout', [txid, n, includeMempool]);
  
  // Cache the result
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result,
    timestamp: Date.now() 
  });
  
  return result;
}

async function getTxOutProof(txids, blockHash = '') {
  const params = [txids];
  if (blockHash !== '') params.push(blockHash);
  
  // These proofs are immutable so can be cached indefinitely
  const cacheKey = `txOutProof_${JSON.stringify(txids)}_${blockHash}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  // Make the RPC call
  const proof = await queueRpc('gettxoutproof', params);
  
  // Cache indefinitely
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: proof,
    timestamp: Date.now() 
  });
  
  return proof;
}

// ### Control Functions ###
async function help(command = '') {
  // Help text doesn't change, so can be cached indefinitely
  const cacheKey = `help_${command}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  // Make the RPC call
  const helpText = await queueRpc('help', [command]);
  
  // Cache indefinitely
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: helpText,
    timestamp: Date.now() 
  });
  
  return helpText;
}

async function getNetworkHashPs(nblocks = 120, height = -1) {
  // Create cache key
  const cacheKey = `networkHashPs_${nblocks}_${height}`;
  
  // Check cache for recent hashrate
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData && Date.now() - cachedData.timestamp < 300000) { // 5 min cache
    return cachedData.result;
  }
  
  // Make the RPC call
  const hashrate = await queueRpc('getnetworkhashps', [nblocks, height]);
  
  // Cache the result
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: hashrate,
    timestamp: Date.now() 
  });
  
  return hashrate;
}

// ### Rawtransactions Functions ###
// These functions are deterministic with the same inputs so can be cached indefinitely

async function combineRawTransaction(hexStrings) {
  const cacheKey = `combineRawTx_${JSON.stringify(hexStrings)}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  const combined = await queueRpc('combinerawtransaction', [hexStrings]);
  
  // Cache indefinitely
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: combined,
    timestamp: Date.now() 
  });
  
  return combined;
}

async function createRawTransaction(inputs, outputs) {
  const cacheKey = `createRawTx_${JSON.stringify(inputs)}_${JSON.stringify(outputs)}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  const rawTx = await queueRpc('createrawtransaction', [inputs, outputs]);
  
  // Cache indefinitely
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: rawTx,
    timestamp: Date.now() 
  });
  
  return rawTx;
}

async function decodeRawTransaction(hexString) {
  const cacheKey = `decodeRawTx_${hexString}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  const decoded = await queueRpc('decoderawtransaction', [hexString]);
  
  // Cache indefinitely
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: decoded,
    timestamp: Date.now() 
  });
  
  return decoded;
}

async function decodeScript(hexString) {
  const cacheKey = `decodeScript_${hexString}`;
  
  // Check cache
  const cachedData = await loadFromIndexedDB('misc', cacheKey);
  if (cachedData) {
    return cachedData.result;
  }
  
  const decoded = await queueRpc('decodescript', [hexString]);
  
  // Cache indefinitely 
  await saveToIndexedDB('misc', { 
    id: cacheKey, 
    result: decoded,
    timestamp: Date.now() 
  });
  
  return decoded;
}

async function sendRawTransaction(hexString, allowHighFees = false) {
  // Don't cache this - it's a state-changing operation
  return await queueRpc('sendrawtransaction', [hexString, allowHighFees]);
}

async function signRawTransaction(hexString, prevTxs = [], privateKeys = [], sighashType = 'ALL') {
  // Don't cache this - it's potentially sensitive and might use different private keys
  return await queueRpc('signrawtransaction', [hexString, prevTxs, privateKeys, sighashType]);
}

async function testMempoolAccept(rawTxs, allowHighFees = false) {
  // Don't cache this - mempool state changes frequently
  return await queueRpc('testmempoolaccept', [rawTxs, allowHighFees]);
}

// ### Updated Transaction Functions ###

// Get Transaction with Enhanced Caching
async function getTransaction(txid) {
  let cachedTx = await loadFromIndexedDB('transactions', txid);
  const now = Date.now();
  
  if (cachedTx) {
    if (cachedTx.data.blockhash || cachedTx.data.blockheight) {
      // Confirmed transaction, return cached data (immutable)
      return cachedTx.data;
    } else if (cachedTx.timestamp && now - cachedTx.timestamp < MEMPOOL_CACHE_DURATION) {
      // Unconfirmed and cache is recent
      return cachedTx.data;
    }
  }
  
  // Fetch from RPC
  const tx = await callRpc('getrawtransaction', [txid, 1]);
  
  // Enhance with block height if needed
  if (tx.blockhash && !tx.blockheight) {
    try {
      const block = await getBlock(tx.blockhash);
      tx.blockheight = block.height;
    } catch (error) {
      console.warn(`Failed to get block height for tx ${txid}:`, error);
    }
  }
  
  // Cache transaction with appropriate expiration
  if (tx.blockhash) {
    // Save confirmed transaction indefinitely
    await saveToIndexedDB('transactions', { 
      txid, 
      data: tx,
      timestamp: now // Also store timestamp to track when it was cached
    });
  } else {
    // Save unconfirmed transaction with timestamp for short-term caching
    await saveToIndexedDB('transactions', { 
      txid, 
      data: tx, 
      timestamp: now 
    });
  }
  
  return tx;
}

// Fetch Transaction Details with Enhanced Caching
async function getTransactionDetails(txid) {
  // Check detailed transaction cache first
  const cachedDetails = await loadFromIndexedDB('transactionDetailsCache', txid);
  if (cachedDetails) {
    const now = Date.now();
    
    // For confirmed transactions, cache is valid much longer
    if (cachedDetails.data.confirmations > 1) {
      // Only invalidate if it was cached more than an hour ago (confirmations may increase)
      if (now - cachedDetails.timestamp < 3600000) {
        return cachedDetails.data;
      }
    } else if (now - cachedDetails.timestamp < MEMPOOL_CACHE_DURATION) {
      // For mempool/unconfirmed transactions, shorter cache
      return cachedDetails.data;
    }
  }
  
  // Get the transaction
  const tx = await getTransaction(txid);
  
  // Get current block height
  const currentHeight = await getBlockCount();
  
  // Calculate confirmations
  const blockheight = tx.blockheight;
  const confirmations = blockheight ? currentHeight - blockheight + 1 : 0;
  
  // Create detailed transaction data
  const details = { 
    tx, 
    blockheight, 
    confirmations, 
    currentHeight 
  };
  
  // Cache the details
  await saveToIndexedDB('transactionDetailsCache', { 
    txid, 
    data: details,
    timestamp: Date.now() 
  });
  
  return details;
}

// ### Existing Utility Functions ###

// Improved block metadata function
async function getBlockMetadata(height) {
  const cachedMetadata = await loadFromIndexedDB('blockMetadata', height);
  if (cachedMetadata) return cachedMetadata;
  
  // Get block hash first
  const hash = await getBlockHash(height);
  
  // Then get basic block info
  const block = await queueRpc('getblock', [hash, 1]); // Use verbosity 1 for metadata
  
  // Create metadata object
  const metadata = { 
    height, 
    hash: block.hash, 
    time: block.time,
    size: block.size,
    tx_count: block.tx ? block.tx.length : 0
  };
  
  // Cache indefinitely
  await saveToIndexedDB('blockMetadata', metadata);
  
  return metadata;
}

// Enhanced function to fetch latest blocks metadata with better caching
async function getLatestBlocksMetadata(startHeight = null, count = 10) {
  const blockCount = await getBlockCount();
  let H = startHeight ? parseInt(startHeight) : blockCount;
  
  if (isNaN(H) || H > blockCount) H = blockCount;
  if (H < 0) H = 0;
  
  // Create a range key for caching
  const rangeKey = `blockRange_${H}_${count}`;
  
  // Check if we have a cached range
  const cachedRange = await loadFromIndexedDB('blockRangeCache', rangeKey);
  if (cachedRange && Date.now() - cachedRange.timestamp < BLOCK_COUNT_CACHE_DURATION) {
    return cachedRange.data;
  }
  
  // Generate array of heights to fetch
  const heights = Array.from({ length: Math.min(count, H + 1) }, (_, i) => H - i);
  
  // Fetch metadata for each height
  const metadataPromises = heights.map(height => getBlockMetadata(height));
  const metadatas = await Promise.all(metadataPromises);
  
  // Prepare return data
  const returnData = { 
    metadatas, 
    currentHeight: blockCount 
  };
  
  // Cache this range
  await saveToIndexedDB('blockRangeCache', { 
    cacheKey: rangeKey, 
    data: returnData,
    timestamp: Date.now() 
  });
  
  return returnData;
}

// Fetch Block Details with enhanced caching
async function getBlockDetails(blockId) {
  let blockHash;
  
  // Convert height to hash if needed
  if (blockId.match(/^[0-9]+$/)) {
    blockHash = await getBlockHash(parseInt(blockId));
  } else {
    blockHash = blockId;
  }
  
  // Check cache
  const cachedDetails = await loadFromIndexedDB('blockDetailsCache', blockHash);
  if (cachedDetails) {
    const now = Date.now();
    
    // Only refresh cache if it's old (blocks are mostly immutable, just confirmations change)
    if (now - cachedDetails.timestamp < 3600000) { // 1 hour
      return cachedDetails.data;
    }
  }
  
  // Fetch block data
  const block = await getBlock(blockHash);
  const currentHeight = await getBlockCount();
  
  // Calculate confirmations
  const confirmations = currentHeight - block.height + 1;
  
  // Build the full details
  const data = { block, confirmations, currentHeight };
  
  // Cache the details
  await saveToIndexedDB('blockDetailsCache', { 
    blockHash, 
    data,
    timestamp: Date.now() 
  });
  
  return data;
}

// Helper function to fetch and cache mempool transactions
async function getMempoolTransactions() {
  const cachedMempool = await loadFromIndexedDB('mempoolCache', 'mempool');
  const now = Date.now();
  
  if (cachedMempool && now - cachedMempool.timestamp < MEMPOOL_CACHE_DURATION) {
    return cachedMempool.transactions;
  }
  
  const mempool = await queueRpc('getrawmempool', [true]);
  
  await saveToIndexedDB('mempoolCache', { 
    id: 'mempool', 
    transactions: mempool, 
    timestamp: now 
  });
  
  return mempool;
}

// Enhanced output status checking with better caching
async function getOutputStatus(txid, vout) {
  const cacheKey = `${txid}_${vout}`;
  
  // Check cache
  const cachedStatus = await loadFromIndexedDB('outputStatusCache', cacheKey);
  const now = Date.now();
  
  if (cachedStatus) {
    // Spent outputs stay spent - cache indefinitely
    if (cachedStatus.result.status === 'Spent') {
      return cachedStatus.result;
    }
    
    // Unspent outputs might become spent - shorter cache
    if (now - cachedStatus.timestamp < UTXO_CACHE_DURATION) {
      return cachedStatus.result;
    }
  }

  // Step 1: Check if the output is unspent
  const txout = await queueRpc('gettxout', [txid, vout, true]);
  if (txout) {
    const result = { status: 'Unspent' };
    await saveToIndexedDB('outputStatusCache', { 
      cacheKey, 
      result, 
      timestamp: now 
    });
    return result;
  }

  // Step 2: Try to get the spending transaction directly
  try {
    const spentInfo = await getSpentInfo(txid, vout);
    if (spentInfo && spentInfo.txid) {
      const result = { 
        status: 'Spent', 
        spendingTx: spentInfo.txid 
      };
      
      // Cache spent outputs indefinitely
      await saveToIndexedDB('outputStatusCache', { 
        cacheKey, 
        result, 
        timestamp: now 
      });
      
      return result;
    }
  } catch (e) {
    console.warn(`getspentinfo failed for ${txid}:${vout}: ${e.message}`);
  }

  // Step 3: Check the mempool for unconfirmed spends
  const mempool = await getMempoolTransactions();
  for (const mempoolTxid in mempool) {
    try {
      const mtx = await getTransactionDetails(mempoolTxid);
      if (mtx.tx.vin.some(vin => vin.txid === txid && vin.vout === vout)) {
        const result = { 
          status: 'Spent', 
          spendingTx: mempoolTxid 
        };
        
        await saveToIndexedDB('outputStatusCache', { 
          cacheKey, 
          result, 
          timestamp: now 
        });
        
        return result;
      }
    } catch (e) {
      continue; // Skip errors for individual transactions
    }
  }

  // Step 4: If not found, assume spent but spending tx not located
  const result = { status: 'Spent (not found)' };
  await saveToIndexedDB('outputStatusCache', { 
    cacheKey, 
    result, 
    timestamp: now 
  });
  
  return result;
}

// Find Spending Transaction with caching
async function findSpendingTx(txid, vout, maxBlocks = 1000) {
  // Check cache first
  const cacheKey = `findSpendingTx_${txid}_${vout}`;
  const cachedResult = await loadFromIndexedDB('spendingTxCache', cacheKey);
  
  if (cachedResult) {
    // If we found a spending tx before, it stays spent
    if (cachedResult.result) {
      return cachedResult.result;
    }
    
    // If we didn't find it before, but recently checked, trust that result
    if (Date.now() - cachedResult.timestamp < 3600000) { // 1 hour
      return null;
    }
  }
  
  // Not in cache or cache is old - do the expensive search
  const currentHeight = await getBlockCount();
  
  for (let height = currentHeight; height > currentHeight - maxBlocks && height >= 0; height--) {
    try {
      const blockHash = await getBlockHash(height);
      const block = await getBlock(blockHash);
      
      for (const tx of block.tx) {
        const txid2 = typeof tx === 'string' ? tx : tx.txid;
        
        if (typeof tx === 'string') {
          // If tx is just a string (txid), fetch full tx
          const fullTx = await getTransaction(tx);
          if (fullTx.vin.some(vin => vin.txid === txid && vin.vout === vout)) {
            // Found the spending transaction
            await saveToIndexedDB('spendingTxCache', { 
              cacheKey, 
              result: txid2,
              timestamp: Date.now() 
            });
            
            return txid2;
          }
        } else if (tx.vin && tx.vin.some(vin => vin.txid === txid && vin.vout === vout)) {
          // Found the spending transaction
          await saveToIndexedDB('spendingTxCache', { 
            cacheKey, 
            result: txid2,
            timestamp: Date.now() 
          });
          
          return txid2;
        }
      }
    } catch (error) {
      console.warn(`Error checking block ${height}:`, error);
      continue;
    }
  }
  
  // Not found - cache the negative result
  await saveToIndexedDB('spendingTxCache', { 
    cacheKey, 
    result: null,
    timestamp: Date.now() 
  });
  
  return null;
}

// Improved clean cache function
async function clearAllCaches() {
  try {
    const db = await openDatabase();
    const stores = [
      'heightToHash', 'blockMetadata', 'assetsCache', 'assetData', 'addressTxids',
      'spendingTxCache', 'blocks', 'transactions', 'misc', 'addressCache',
      'outputStatusCache', 'transactionDetailsCache', 'blockDetailsCache',
      'mempoolCache', 'utxoCache', 'addressFullData', 'assetHoldersCache',
      'assetTxsCache', 'blockRangeCache'
    ];
    
    for (const storeName of stores) {
      if (!db.objectStoreNames.contains(storeName)) {
        console.log(`Store ${storeName} doesn't exist, skipping`);
        continue;
      }
      
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    }
    
    // Reset counters
    cacheHits = 0;
    cacheMisses = 0;
    
    console.log('All IndexedDB caches cleared successfully');
    return true;
  } catch (error) {
    console.error('Error clearing caches:', error);
    return false;
  }
}

// Comprehensive function to get address details - optimized for caching
async function getAddressDetails(address, page = 1) {
  try {
    const cacheKey = `addressDetails_${address}_page${page}`;
    const cachedDetails = await loadFromIndexedDB('misc', cacheKey);
    const now = Date.now();
    
    // Check if we have a valid cached result
    if (cachedDetails && now - cachedDetails.timestamp < ADDRESS_DATA_CACHE_DURATION) {
      return cachedDetails.result;
    }
    
    // Check comprehensive address data
    const fullAddressData = await loadFromIndexedDB('addressFullData', address);
    if (fullAddressData && now - fullAddressData.timestamp < ADDRESS_DATA_CACHE_DURATION) {
      // We have comprehensive data, but need to do pagination
      const perPage = 10;
      const startIdx = (page - 1) * perPage;
      const endIdx = startIdx + perPage;
      
      if (fullAddressData.allTxids) {
        const pageTxids = fullAddressData.allTxids.slice(startIdx, endIdx);
        const hasMore = fullAddressData.allTxids.length > endIdx;
        
        const result = {
          balance: fullAddressData.balance || '0.00000000',
          assetBalances: fullAddressData.assetBalances || [],
          pageTxids,
          currentPage: page,
          hasMore
        };
        
        // Cache this page result
        await saveToIndexedDB('misc', { 
          id: cacheKey, 
          result, 
          timestamp: now 
        });
        
        return result;
      }
    }
    
    // Not in cache, need to fetch all data
    
    // Get transaction IDs with pagination
    const txidsData = await getAddressTxids(address, page);
    const pageTxids = txidsData.pageTxids;
    const hasMore = txidsData.hasMore;

    // Get basic EVR balance info
    let balance, utxos, assetBalances;
    
    // Try to get from address cache first
    const cachedAddrData = await loadFromIndexedDB('addressCache', address);
    if (cachedAddrData && now - cachedAddrData.timestamp < ADDRESS_DATA_CACHE_DURATION) {
      balance = cachedAddrData.balance;
      utxos = cachedAddrData.utxos;
    } else {
      // Fetch balance and UTXOs in parallel
      const [balanceData, utxosData] = await Promise.all([
        queueRpc('getaddressbalance', [{ addresses: [address] }]),
        queueRpc('getaddressutxos', [{ addresses: [address] }])
      ]);
      
      balance = balanceData.balance;
      utxos = utxosData;
      
      // Update address cache
      await saveToIndexedDB('addressCache', { 
        address, 
        balance, 
        utxos, 
        timestamp: now 
      });
    }

    // Format EVR balance
    const formattedBalance = (balance / 1e8).toFixed(8);
    
    // Get asset balances
    assetBalances = await getAssetsForAddress(address);
    
    // Create result object
    const result = {
      balance: formattedBalance,
      assetBalances,
      pageTxids,
      currentPage: page,
      hasMore
    };
    
    // Cache this result
    await saveToIndexedDB('misc', { 
      id: cacheKey, 
      result, 
      timestamp: now 
    });
    
    // Update comprehensive address data
    let fullData = fullAddressData || { address };
    fullData.balance = formattedBalance;
    fullData.assetBalances = assetBalances;
    fullData.timestamp = now;
    
    // Store txids if we have them
    if (pageTxids.length > 0 && (!fullData.allTxids || fullData.allTxids.length === 0)) {
      // This is just the first page, but better than nothing
      fullData.allTxids = pageTxids;
    }
    
    // Save comprehensive data
    await saveToIndexedDB('addressFullData', fullData);
    
    return result;
  } catch (error) {
    console.error('Error in getAddressDetails:', error);
    return {
      balance: '0.00000000',
      assetBalances: [],
      pageTxids: [],
      currentPage: page,
      hasMore: false
    };
  }
}

// Enhanced function to get assets for an address with better caching
async function getAssetsForAddress(address) {
  try {
    const cacheKey = `assetsForAddress_${address}`;
    const cachedData = await loadFromIndexedDB('misc', cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp < ASSET_DATA_CACHE_DURATION)) {
      return cachedData.result;
    }
    
    // Get comprehensive address data if it exists
    const fullData = await loadFromIndexedDB('addressFullData', address);
    if (fullData && fullData.assetBalances && 
        (Date.now() - fullData.timestamp < ASSET_DATA_CACHE_DURATION)) {
      return fullData.assetBalances;
    }
    
    // Get asset balances directly using the dedicated method
    const assetBalances = await queueRpc('listassetbalancesbyaddress', [address, false, 100, 0]);
    
    const formattedAssets = [];
    for (const [name, balance] of Object.entries(assetBalances)) {
      if (name === '') continue; // Skip empty asset name
      
      try {
        const assetData = await getAssetData(name);
        const units = assetData.units || 0;
        formattedAssets.push({ 
          name, 
          amount: formatAssetAmount(balance, units)
        });
      } catch (error) {
        console.error(`Error getting asset data for ${name}:`, error);
        // Fall back to using the raw balance if asset data can't be retrieved
        formattedAssets.push({ name, amount: balance.toString() });
      }
    }
    
    // Cache the result
    await saveToIndexedDB('misc', { 
      id: cacheKey, 
      result: formattedAssets,
      timestamp: Date.now() 
    });
    
    return formattedAssets;
  } catch (error) {
    console.error("Error in getAssetsForAddress:", error);
    // Try fallback method using UTXOs if the direct method fails
    return getAssetsFromUTXOs(address);
  }
}

// Fallback function to get assets from UTXOs
async function getAssetsFromUTXOs(address) {
  try {
    const cacheKey = `assetsFromUTXOs_${address}`;
    const cachedData = await loadFromIndexedDB('misc', cacheKey);
    
    if (cachedData && (Date.now() - cachedData.timestamp < UTXO_CACHE_DURATION)) {
      return cachedData.result;
    }
    
    const utxos = await queueRpc('getaddressutxos', [{ addresses: [address] }]);
    const assetMap = {};
    
    // Process UTXOs to find assets
    for (const utxo of utxos) {
      try {
        // For UTXOs that don't have asset info directly, fetch the transaction
        if (!utxo.scriptPubKey || !utxo.scriptPubKey.asset) {
          const txData = await getTransactionDetails(utxo.txid);
          const tx = txData.tx;
          
          // Check if this output has asset information
          if (tx && tx.vout && tx.vout[utxo.vout]) {
            const vout = tx.vout[utxo.vout];
            if (vout.scriptPubKey && vout.scriptPubKey.asset) {
              const asset = vout.scriptPubKey.asset;
              if (asset.name && asset.name !== 'EVR') {
                if (!assetMap[asset.name]) {
                  assetMap[asset.name] = 0;
                }
                assetMap[asset.name] += asset.amount;
              }
            }
          }
        } 
        // If the UTXO already has asset info
        else if (utxo.scriptPubKey.asset) {
          const asset = utxo.scriptPubKey.asset;
          if (asset.name && asset.name !== 'EVR') {
            if (!assetMap[asset.name]) {
              assetMap[asset.name] = 0;
            }
            assetMap[asset.name] += asset.amount;
          }
        }
      } catch (err) {
        console.error(`Error processing UTXO ${utxo.txid}:${utxo.vout}`, err);
      }
    }
    
    // Format the assets found
    const formattedAssets = [];
    for (const [name, amount] of Object.entries(assetMap)) {
      try {
        const assetData = await getAssetData(name);
        const units = assetData.units || 0;
        formattedAssets.push({ 
          name, 
          amount: formatAssetAmount(amount, units)
        });
      } catch (error) {
        console.error(`Error getting asset data for ${name}:`, error);
        formattedAssets.push({ name, amount: amount.toString() });
      }
    }
    
    // Cache the result
    await saveToIndexedDB('misc', { 
      id: cacheKey, 
      result: formattedAssets,
      timestamp: Date.now() 
    });
    
    return formattedAssets;
  } catch (error) {
    console.error("Error in getAssetsFromUTXOs:", error);
    return [];
  }
}

// Format asset amount with units
function formatAssetAmount(amount, units) {
  // Handle undefined or invalid values
  if (amount === undefined || amount === null) {
    return "Unknown";
  }
  
  // Ensure units is a number
  const unitsValue = Number(units) || 0;
  
  if (unitsValue === 0) {
    return amount.toLocaleString();
  } else {
    return (amount / Math.pow(10, unitsValue)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: unitsValue
    });
  }
}

// Get cache stats (for debugging and monitoring)
function getCacheStats() {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    ratio: cacheHits / (cacheHits + cacheMisses || 1)
  };
}

// Preload common data to warm the cache
async function preloadCommonData() {
  try {
    console.log("Preloading common data to warm cache...");
    
    // Get current block count
    const blockCount = await getBlockCount();
    
    // Preload latest blocks
    const latestBlocks = await getLatestBlocksMetadata(null, 10);
    
    // Preload blockchain info
    const chainInfo = await getBlockChainInfo();
    
    // Preload difficulty
    const difficulty = await getDifficulty();
    
    // Preload network hash power
    const hashPs = await getNetworkHashPs();
    
    // Preload mempool info
    const mempoolInfo = await getMempoolInfo();
    
    // Preload raw mempool
    const mempool = await getRawMempool(true);
    
    console.log("Cache preloading complete!");
    return true;
  } catch (error) {
    console.error("Error preloading cache:", error);
    return false;
  }
}

// Optimize address cache for a specific address (background task)
async function optimizeAddressCache(address) {
  try {
    console.log(`Optimizing cache for address ${address}...`);
    
    // Create or get comprehensive address data
    let fullData = await loadFromIndexedDB('addressFullData', address) || { address };
    
    // Set timestamp
    fullData.timestamp = Date.now();
    
    // Get all transactions (up to a reasonable limit)
    const maxBlocks = 10000; // Limit how far back we search
    const currentHeight = await getBlockCount();
    const endBlock = currentHeight;
    const startBlock = Math.max(currentHeight - maxBlocks, 0);
    
    console.log(`Fetching all txids for ${address} from blocks ${startBlock} to ${endBlock}...`);
    
    // Get all txids
    const allTxids = await queueRpc('getaddresstxids', [{ 
      addresses: [address], 
      start: startBlock, 
      end: endBlock 
    }]);
    
    // Sort txids by recency (using index in list as an approximation)
    fullData.allTxids = allTxids.reverse(); // Most recent first
    
    // Get balance
    const balanceData = await queueRpc('getaddressbalance', [{ addresses: [address] }]);
    fullData.balance = (balanceData.balance / 1e8).toFixed(8);
    
    // Get UTXOs
    const utxos = await queueRpc('getaddressutxos', [{ addresses: [address] }]);
    fullData.utxos = utxos;
    fullData.utxoTimestamp = Date.now();
    
    // Get asset balances
    fullData.assetBalances = await getAssetsForAddress(address);
    
    // Save the comprehensive data
    await saveToIndexedDB('addressFullData', fullData);
    
    // Pre-cache pagination pages
    const perPage = 10;
    const totalPages = Math.ceil(fullData.allTxids.length / perPage);
    
    for (let i = 1; i <= Math.min(totalPages, 5); i++) { // Cache first 5 pages
      const startIdx = (i - 1) * perPage;
      const endIdx = startIdx + perPage;
      const pageTxids = fullData.allTxids.slice(startIdx, endIdx);
      
      const pageKey = `${address}_page_${i}`;
      await saveToIndexedDB('addressTxids', { 
        cacheKey: pageKey, 
        txids: pageTxids, 
        hasMore: endIdx < fullData.allTxids.length,
        timestamp: Date.now()
      });
    }
    
    console.log(`Address cache optimization complete for ${address}, cached ${fullData.allTxids.length} transactions.`);
    return true;
  } catch (error) {
    console.error(`Error optimizing address cache for ${address}:`, error);
    return false;
  }
}

// Expose Utilities
window.utilities = {
  callRpc: queueRpc,
  getBlockHash,
  getBlockMetadata,
  getAssetData,
  getLatestBlocksMetadata,
  getBlockDetails,
  getTransactionDetails,
  getOutputStatus,
  findSpendingTx,
  getAddressTxids,
  getAddressDetails,
  clearAllCaches,
  getCacheStats,
  preloadCommonData,
  optimizeAddressCache,
  currentRpcRequests,
  loadFromIndexedDB, // Add this line to expose the function

  // Addressindex
  getAddressBalance,
  getAddressDeltas,
  getAddressMempool,
  getAddressUtxos,

  // Assets
  listAddressesByAsset,
  listAssetBalancesByAddress,
  listAssets,

  // Blockchain
  decodeBlock,
  getBestBlockHash,
  getBlock,
  getBlockChainInfo,
  getBlockCount,
  getBlockHeader,
  getChainTips,
  getChainTxStats,
  getDifficulty,
  getMempoolAncestors,
  getMempoolDescendants,
  getMempoolEntry,
  getMempoolInfo,
  getRawMempool,
  getSpentInfo,
  getTxOut,
  getTxOutProof,

  // Control
  help,
  getNetworkHashPs,

  // Rawtransactions
  combineRawTransaction,
  createRawTransaction,
  decodeRawTransaction,
  decodeScript,
  sendRawTransaction,
  signRawTransaction,
  testMempoolAccept
};

window.utilities.setCacheDurations = setCacheDurations;
window.utilities.setRpcUrl = setRpcUrl;
window.utilities.setMaxConcurrentRequests = setMaxConcurrentRequests;

// Expose the IndexedDB functions to make them available for settings
window.utilities.saveToIndexedDB = saveToIndexedDB;
window.utilities.loadFromIndexedDB = loadFromIndexedDB;
window.utilities.deleteFromIndexedDB = deleteFromIndexedDB;