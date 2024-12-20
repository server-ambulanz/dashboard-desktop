// /Users/jsentuerk/server-ambulanz/dashboard-web/dashboard-desktop/cache.js
// Ver. 1.0.0
const Store = require('electron-store');
const log = require('electron-log');

class CacheManager {
    constructor() {
        this.store = new Store({
            name: 'cache',
            encryptionKey: 'your-encryption-key'
        });
        this.defaultTTL = 3600000; // 1 Stunde in Millisekunden
    }

    setCacheItem(key, data, ttl = this.defaultTTL) {
        try {
            const item = {
                data,
                timestamp: Date.now(),
                expires: Date.now() + ttl
            };
            this.store.set(key, item);
            log.info(`Cache set for key: ${key}`);
            return true;
        } catch (error) {
            log.error('Cache set error:', error);
            return false;
        }
    }

    getCacheItem(key) {
        try {
            const item = this.store.get(key);
            
            if (!item) {
                return null;
            }

            if (Date.now() > item.expires) {
                this.store.delete(key);
                return null;
            }

            return item.data;
        } catch (error) {
            log.error('Cache get error:', error);
            return null;
        }
    }

    clearCache() {
        try {
            this.store.clear();
            log.info('Cache cleared');
            return true;
        } catch (error) {
            log.error('Cache clear error:', error);
            return false;
        }
    }

    clearExpiredItems() {
        try {
            const keys = this.store.store;
            Object.keys(keys).forEach(key => {
                const item = this.store.get(key);
                if (Date.now() > item.expires) {
                    this.store.delete(key);
                }
            });
            log.info('Expired cache items cleared');
            return true;
        } catch (error) {
            log.error('Clear expired items error:', error);
            return false;
        }
    }

    // Spezielle Methode für Dashboard-Daten
    async getDashboardData(networkManager) {
        const cacheKey = 'dashboard-data';
        const cachedData = this.getCacheItem(cacheKey);

        if (cachedData) {
            return cachedData;
        }

        try {
            const { data } = await networkManager.fetch('/api/v1/dashboard');
            this.setCacheItem(cacheKey, data, 300000); // 5 Minuten TTL für Dashboard-Daten
            return data;
        } catch (error) {
            log.error('Dashboard data fetch error:', error);
            return null;
        }
    }

    // Spezielle Methode für Plugin-Daten
    async getPluginData(networkManager, pluginId) {
        const cacheKey = `plugin-${pluginId}`;
        const cachedData = this.getCacheItem(cacheKey);

        if (cachedData) {
            return cachedData;
        }

        try {
            const { data } = await networkManager.fetch(`/api/v1/plugins/${pluginId}`);
            this.setCacheItem(cacheKey, data, 1800000); // 30 Minuten TTL für Plugin-Daten
            return data;
        } catch (error) {
            log.error(`Plugin data fetch error for ${pluginId}:`, error);
            return null;
        }
    }
}

module.exports = new CacheManager();
