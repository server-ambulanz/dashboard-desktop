// /Users/jsentuerk/server-ambulanz/dashboard-web/dashboard-desktop/main.js
// Ver. 1.0.0
const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const Store = require('electron-store');
const log = require('electron-log');
const networkManager = require('./network');
const cacheManager = require('./cache');
const TrayManager = require('./tray');
const dotenv = require('dotenv');

// Lade .env Datei
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const isDev = process.env.FLASK_ENV === 'development';
log.info(`Running in ${isDev ? 'development' : 'production'} mode`);

// Store-Konfiguration
const store = new Store({
    defaults: {
        windowBounds: { width: 1200, height: 800 },
        isMaximized: false,
        serverUrl: process.env.SERVER_URL || (isDev ? 'https://dev.server-ambulanz.info' : 'https://dashboard.server-ambulanz.info'),
        minimizeToTray: true,
        autoStart: false,
        alwaysOnTop: false
    }
});

let mainWindow;
let trayManager;

// Verhindern mehrfacher Instanzen
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

async function checkServerConnection() {
    try {
        const diagnosis = await networkManager.diagnoseConnectionProblem();
        
        if (diagnosis) {
            const response = await dialog.showMessageBox({
                type: 'error',
                title: diagnosis.message,
                message: diagnosis.detail,
                detail: getDetailedErrorMessage(diagnosis),
                buttons: ['Erneut versuchen', 'Beenden'],
                defaultId: 0,
                cancelId: 1
            });

            if (response.response === 0) {
                return checkServerConnection();
            } else {
                app.quit();
            }
        }
        return true;
    } catch (error) {
        log.error('Server connection check failed:', error);
        return false;
    }
}

function getDetailedErrorMessage(diagnosis) {
    switch (diagnosis.type) {
        case 'INTERNET_CONNECTION':
            return 'Fehlerbehebung:
' +
                   '1. Überprüfen Sie Ihre WLAN- oder LAN-Verbindung
' +
                   '2. Kontaktieren Sie ggf. Ihren Netzwerkadministrator
' +
                   '3. Prüfen Sie Ihre Firewall-Einstellungen';
            
        case 'DNS_RESOLUTION':
            return 'Fehlerbehebung:
' +
                   '1. Prüfen Sie die DNS-Server-Einstellungen
' +
                   '2. Leeren Sie den DNS-Cache
' +
                   '3. Kontaktieren Sie den Support';
            
        case 'SERVER_CONNECTION':
            return 'Fehlerbehebung:
' +
                   '1. Server könnte momentan gewartet werden
' +
                   '2. Prüfen Sie die VPN-Verbindung falls erforderlich
' +
                   '3. Kontaktieren Sie den Server-Administrator';
            
        case 'AUTHENTICATION':
            return 'Fehlerbehebung:
' +
                   '1. Melden Sie sich erneut an
' +
                   '2. Prüfen Sie Ihre Zugangsdaten
' +
                   '3. Kontaktieren Sie den Support bei weiteren Problemen';
            
        default:
            return 'Bitte kontaktieren Sie den Support für weitere Hilfe.';
    }
}

async function createWindow() {
    const { width, height } = store.get('windowBounds');
    const isMaximized = store.get('isMaximized');
    const alwaysOnTop = store.get('alwaysOnTop');

    mainWindow = new BrowserWindow({
        width,
        height,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false,
        alwaysOnTop
    });

    // Tray Manager initialisieren
    trayManager = new TrayManager(mainWindow);

    // Window Events
    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
        if (isMaximized) {
            mainWindow.maximize();
        }
    });

    mainWindow.on('close', (event) => {
        if (store.get('minimizeToTray') && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            trayManager.showNotification(
                'Server-Ambulanz läuft im Hintergrund',
                'Klicken Sie auf das Menu Bar Icon, um das Dashboard wieder zu öffnen.'
            );
        }
    });

    mainWindow.on('resize', () => {
        if (!mainWindow.isMaximized()) {
            store.set('windowBounds', mainWindow.getBounds());
        }
        store.set('isMaximized', mainWindow.isMaximized());
    });

    mainWindow.on('move', () => {
        if (!mainWindow.isMaximized()) {
            store.set('windowBounds', mainWindow.getBounds());
        }
    });

    // Initialer Verbindungscheck
    const isConnected = await checkServerConnection();
    trayManager.updateStatus(isConnected);

    // Lade die Remote-App
    const serverUrl = store.get('serverUrl');
    log.info(`Loading application from: ${serverUrl}`);
    
    try {
        await mainWindow.loadURL(serverUrl);
    } catch (error) {
        log.error('Failed to load URL:', error);
        dialog.showErrorBox('Ladefehler', 
            `Fehler beim Laden der Anwendung:
${error.message}
URL: ${serverUrl}`);
    }

    // Globale Shortcuts registrieren
    if (process.platform === 'darwin') {
        globalShortcut.register('Command+Shift+D', () => {
            toggleWindow();
        });
    } else {
        globalShortcut.register('Control+Shift+D', () => {
            toggleWindow();
        });
    }

    // Periodische Verbindungsprüfung
    setInterval(async () => {
        const isConnected = await checkServerConnection();
        if (isConnected) {
            mainWindow.webContents.send('connection-status', true);
            trayManager.updateStatus(true);
        }
    }, 30000); // Alle 30 Sekunden
}

function toggleWindow() {
    if (mainWindow.isVisible()) {
        mainWindow.hide();
    } else {
        mainWindow.show();
        mainWindow.focus();
    }
}

// App Events
app.whenReady().then(async () => {
    try {
        await createWindow();
        log.info('Application window created successfully');
    } catch (error) {
        log.error('Failed to create application window:', error);
        dialog.showErrorBox('Startfehler', 
            'Die Anwendung konnte nicht gestartet werden:
' + error.message);
        app.quit();
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
    trayManager.destroy();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC Events für Desktop-Integration
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-platform', () => {
    return process.platform;
});

ipcMain.handle('get-environment', () => {
    return isDev ? 'development' : 'production';
});

// Window Management
ipcMain.handle('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.handle('hide-window', () => {
    mainWindow.hide();
});

ipcMain.handle('show-window', () => {
    mainWindow.show();
    mainWindow.focus();
});

// Settings
ipcMain.handle('set-always-on-top', (event, value) => {
    store.set('alwaysOnTop', value);
    mainWindow.setAlwaysOnTop(value);
});

ipcMain.handle('get-settings', () => {
    return {
        minimizeToTray: store.get('minimizeToTray'),
        alwaysOnTop: store.get('alwaysOnTop'),
        autoStart: store.get('autoStart')
    };
});

ipcMain.handle('set-minimize-to-tray', (event, value) => {
    store.set('minimizeToTray', value);
});

// Network & Cache
ipcMain.handle('check-connection', async () => {
    return await checkServerConnection();
});

ipcMain.handle('diagnose-connection', async () => {
    return await networkManager.diagnoseConnectionProblem();
});

ipcMain.handle('get-dashboard-data', async () => {
    return await cacheManager.getDashboardData(networkManager);
});

ipcMain.handle('get-plugin-data', async (event, pluginId) => {
    return await cacheManager.getPluginData(networkManager, pluginId);
});

ipcMain.handle('clear-cache', async () => {
    await cacheManager.clearCache();
    return true;
});

// Dialoge
ipcMain.handle('show-error-dialog', async (event, { title, message }) => {
    return dialog.showErrorBox(title, message);
});

ipcMain.handle('show-message-box', async (event, options) => {
    return dialog.showMessageBox(mainWindow, options);
});

// Auto-Start Konfiguration
ipcMain.handle('set-auto-start', (event, value) => {
    app.setLoginItemSettings({
        openAtLogin: value,
        path: app.getPath('exe')
    });
    store.set('autoStart', value);
});

// Export wichtiger Module für andere Teile der Anwendung
module.exports = {
    mainWindow,
    trayManager,
    store,
    networkManager,
    cacheManager
};
