// /Users/jsentuerk/server-ambulanz/dashboard-web/dashboard-desktop/update.js
// Ver. 1.0.0
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const Store = require('electron-store');

class UpdateManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.store = new Store();
        this.isUpdateAvailable = false;
        
        // Logger für Updater konfigurieren
        autoUpdater.logger = log;
        autoUpdater.logger.transports.file.level = 'info';
        
        // Update-Server URL aus .env oder Standard
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: process.env.UPDATE_SERVER_URL || 'https://updates.server-ambulanz.info'
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Update verfügbar
        autoUpdater.on('update-available', (info) => {
            log.info('Update verfügbar:', info);
            this.isUpdateAvailable = true;
            
            this.mainWindow.webContents.send('update-available', {
                version: info.version,
                releaseNotes: info.releaseNotes
            });
        });

        // Kein Update verfügbar
        autoUpdater.on('update-not-available', (info) => {
            log.info('Kein Update verfügbar:', info);
            this.isUpdateAvailable = false;
        });

        // Update-Fehler
        autoUpdater.on('error', (err) => {
            log.error('Update-Fehler:', err);
            this.mainWindow.webContents.send('update-error', {
                error: err.message
            });
        });

        // Download-Fortschritt
        autoUpdater.on('download-progress', (progressObj) => {
            this.mainWindow.webContents.send('download-progress', {
                speed: progressObj.bytesPerSecond,
                percent: progressObj.percent,
                transferred: progressObj.transferred,
                total: progressObj.total
            });
        });

        // Update heruntergeladen
        autoUpdater.on('update-downloaded', (info) => {
            log.info('Update heruntergeladen:', info);
            this.mainWindow.webContents.send('update-downloaded', {
                version: info.version,
                releaseNotes: info.releaseNotes
            });
        });
    }

    async checkForUpdates(manual = false) {
        try {
            log.info('Prüfe auf Updates...');
            
            if (manual) {
                // Bei manueller Prüfung direkt den Server anfragen
                return await autoUpdater.checkForUpdates();
            } else {
                // Bei automatischer Prüfung erst zeitlichen Abstand prüfen
                const lastCheck = this.store.get('lastUpdateCheck');
                const now = Date.now();
                
                // Prüfung nur alle 4 Stunden
                if (!lastCheck || (now - lastCheck > 4 * 60 * 60 * 1000)) {
                    this.store.set('lastUpdateCheck', now);
                    return await autoUpdater.checkForUpdates();
                }
            }
        } catch (error) {
            log.error('Fehler bei Update-Prüfung:', error);
            throw error;
        }
    }

    async downloadUpdate() {
        if (!this.isUpdateAvailable) {
            throw new Error('Kein Update verfügbar');
        }

        try {
            await autoUpdater.downloadUpdate();
        } catch (error) {
            log.error('Fehler beim Update-Download:', error);
            throw error;
        }
    }

    async installUpdate() {
        try {
            autoUpdater.quitAndInstall(false, true);
        } catch (error) {
            log.error('Fehler bei Update-Installation:', error);
            throw error;
        }
    }

    // Updatezyklus basierend auf Tageszeit
    scheduleUpdates() {
        // Prüfe Updates alle 4 Stunden
        setInterval(() => {
            const hour = new Date().getHours();
            
            // Nur zwischen 9 und 17 Uhr automatisch updaten
            if (hour >= 9 && hour <= 17) {
                this.checkForUpdates();
            }
        }, 4 * 60 * 60 * 1000); // 4 Stunden Intervall
    }
}

module.exports = UpdateManager;
