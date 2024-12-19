// /Users/jsentuerk/server-ambulanz/dashboard-web/dashboard-desktop/preload.js
// Ver. 1.0.0
const { contextBridge, ipcRenderer } = require('electron');

// Erlaubte IPC-Kanäle für die Sicherheit
const validChannels = {
    send: [
        'minimize-window',
        'maximize-window',
        'hide-window',
        'show-window',
        'set-always-on-top',
        'set-minimize-to-tray',
        'set-auto-start',
        'clear-cache'
    ],
    receive: [
        'connection-status',
        'update-available',
        'download-progress'
    ],
    invoke: [
        'get-app-version',
        'get-platform',
        'get-environment',
        'check-connection',
        'get-dashboard-data',
        'get-plugin-data',
        'get-settings',
        'show-error-dialog',
        'show-message-box'
    ]
};

// API für den Renderer-Prozess
contextBridge.exposeInMainWorld('electron', {
    // App Info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getEnvironment: () => ipcRenderer.invoke('get-environment'),
    
    // Window Management
    window: {
        minimize: () => ipcRenderer.send('minimize-window'),
        maximize: () => ipcRenderer.send('maximize-window'),
        hide: () => ipcRenderer.send('hide-window'),
        show: () => ipcRenderer.send('show-window')
    },

    // Settings Management
    settings: {
        get: () => ipcRenderer.invoke('get-settings'),
        setAlwaysOnTop: (value) => ipcRenderer.send('set-always-on-top', value),
        setMinimizeToTray: (value) => ipcRenderer.send('set-minimize-to-tray', value),
        setAutoStart: (value) => ipcRenderer.send('set-auto-start', value)
    },

    // Network & Cache
    network: {
        checkConnection: () => ipcRenderer.invoke('check-connection'),
        onConnectionChange: (callback) => {
            if (typeof callback !== 'function') return;
            
            const subscription = (event, status) => callback(status);
            ipcRenderer.on('connection-status', subscription);
            
            // Cleanup-Funktion zurückgeben
            return () => {
                ipcRenderer.removeListener('connection-status', subscription);
            };
        }
    },

    // Cache Management
    cache: {
        getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),
        getPluginData: (pluginId) => ipcRenderer.invoke('get-plugin-data', pluginId),
        clear: () => ipcRenderer.send('clear-cache')
    },

    // Dialog Management
    dialog: {
        showError: (title, message) => 
            ipcRenderer.invoke('show-error-dialog', { title, message }),
        showMessage: (options) => 
            ipcRenderer.invoke('show-message-box', options)
    },

    // Updates
    updates: {
        onUpdateAvailable: (callback) => {
            if (typeof callback !== 'function') return;
            
            const subscription = (event, info) => callback(info);
            ipcRenderer.on('update-available', subscription);
            
            return () => {
                ipcRenderer.removeListener('update-available', subscription);
            };
        },
        onDownloadProgress: (callback) => {
            if (typeof callback !== 'function') return;
            
            const subscription = (event, progress) => callback(progress);
            ipcRenderer.on('download-progress', subscription);
            
            return () => {
                ipcRenderer.removeListener('download-progress', subscription);
            };
        }
    }
});

// Validierung der IPC-Kommunikation
function validateChannel(channel, type) {
    if (!validChannels[type].includes(channel)) {
        throw new Error(`Unauthorized IPC ${type} channel: ${channel}`);
    }
}

// IPC Security Wrapper
const originalSend = ipcRenderer.send;
const originalOn = ipcRenderer.on;
const originalInvoke = ipcRenderer.invoke;

ipcRenderer.send = (channel, ...args) => {
    validateChannel(channel, 'send');
    return originalSend.apply(ipcRenderer, [channel, ...args]);
};

ipcRenderer.on = (channel, listener) => {
    validateChannel(channel, 'receive');
    return originalOn.apply(ipcRenderer, [channel, listener]);
};

ipcRenderer.invoke = (channel, ...args) => {
    validateChannel(channel, 'invoke');
    return originalInvoke.apply(ipcRenderer, [channel, ...args]);
};

// Debugging in Development
if (process.env.FLASK_ENV === 'development') {
    console.log('Electron preload script loaded');
    console.log('Exposed API:', Object.keys(window.electron));
}
