// /Users/jsentuerk/server-ambulanz/dashboard-web/dashboard-desktop/tray.js
// Ver. 1.0.0
const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const log = require('electron-log');

class TrayManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.tray = null;
        this.contextMenu = null;
        this.init();
    }

    init() {
        try {
            // Icon erstellen (für macOS in Template Mode)
            const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
            const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
            
            // Für macOS: Template Image für automatische Dark/Light Mode Anpassung
            if (process.platform === 'darwin') {
                trayIcon.setTemplateImage(true);
            }
            
            this.tray = new Tray(trayIcon);

            // macOS: Position in der Menu Bar
            if (process.platform === 'darwin') {
                this.tray.setIgnoreDoubleClickEvents(true);
            }

            this.tray.setToolTip('Server-Ambulanz Dashboard');
            this.createContextMenu();

            // Event Handler
            if (process.platform === 'darwin') {
                // Für macOS: Menü bei jedem Klick zeigen
                this.tray.on('click', (event, bounds) => {
                    this.tray.popUpContextMenu(this.contextMenu);
                });
            } else {
                // Für Windows/Linux: Toggle Window bei Klick
                this.tray.on('click', () => {
                    this.toggleWindow();
                });
                this.tray.on('right-click', () => {
                    this.tray.popUpContextMenu(this.contextMenu);
                });
            }

            log.info('Menu Bar Item/Tray successfully initialized');
        } catch (error) {
            log.error('Failed to initialize menu bar item/tray:', error);
        }
    }

    createContextMenu() {
        const isMac = process.platform === 'darwin';
        
        this.contextMenu = Menu.buildFromTemplate([
            {
                label: 'Server-Ambulanz Dashboard',
                enabled: false,
                icon: this.createMenuIcon('dashboard-icon.png')
            },
            { type: 'separator' },
            {
                label: 'Dashboard öffnen',
                click: () => {
                    this.showWindow();
                },
                icon: this.createMenuIcon('open-icon.png')
            },
            {
                label: 'Status',
                submenu: [
                    {
                        label: 'Verbunden',
                        type: 'radio',
                        checked: true,
                        enabled: false
                    }
                ],
                icon: this.createMenuIcon('status-icon.png')
            },
            { type: 'separator' },
            {
                label: 'Einstellungen',
                submenu: [
                    {
                        label: 'Automatischer Start',
                        type: 'checkbox',
                        checked: app.getLoginItemSettings().openAtLogin,
                        click: (menuItem) => {
                            app.setLoginItemSettings({
                                openAtLogin: menuItem.checked
                            });
                        }
                    },
                    {
                        label: 'In Menüleiste minimieren',
                        type: 'checkbox',
                        checked: true,
                        click: (menuItem) => {
                            // Store-Setting aktualisieren
                            const store = require('electron-store');
                            new store().set('minimizeToTray', menuItem.checked);
                        }
                    }
                ],
                icon: this.createMenuIcon('settings-icon.png')
            },
            {
                label: 'Entwicklung',
                submenu: [
                    {
                        label: 'Entwicklerwerkzeuge',
                        click: () => {
                            this.mainWindow.webContents.openDevTools();
                        }
                    },
                    {
                        label: 'Cache leeren',
                        click: async () => {
                            const cacheManager = require('./cache');
                            await cacheManager.clearCache();
                            this.showNotification('Cache gelöscht', 'Der Cache wurde erfolgreich geleert.');
                        }
                    }
                ],
                visible: process.env.FLASK_ENV === 'development',
                icon: this.createMenuIcon('dev-icon.png')
            },
            { type: 'separator' },
            {
                label: isMac ? 'Server-Ambulanz beenden' : 'Beenden',
                click: () => {
                    app.quit();
                },
                icon: this.createMenuIcon('quit-icon.png')
            }
        ]);
    }

    createMenuIcon(iconName) {
        if (process.platform === 'darwin') {
            const iconPath = path.join(__dirname, 'assets', 'menu', iconName);
            return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        }
        return null;
    }

    updateStatus(isConnected) {
        // Statustext für macOS anpassen
        const statusLabel = isConnected ? 'Verbunden' : 'Nicht verbunden';
        
        const newContextMenu = Menu.buildFromTemplate([
            ...this.contextMenu.items.map(item => {
                if (item.label === 'Status') {
                    return {
                        label: 'Status',
                        submenu: [
                            {
                                label: statusLabel,
                                type: 'radio',
                                checked: true,
                                enabled: false
                            }
                        ],
                        icon: this.createMenuIcon('status-icon.png')
                    };
                }
                return item;
            })
        ]);
        
        this.contextMenu = newContextMenu;
        this.tray.setContextMenu(this.contextMenu);

        // Für nicht-macOS Systeme: Icon ändern
        if (process.platform !== 'darwin') {
            const iconName = isConnected ? 'tray-icon.png' : 'tray-icon-disconnected.png';
            const iconPath = path.join(__dirname, 'assets', iconName);
            const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
            this.tray.setImage(trayIcon);
        }

        // Tooltip aktualisieren
        this.tray.setToolTip(`Server-Ambulanz Dashboard - ${statusLabel}`);
    }

    toggleWindow() {
        if (this.mainWindow.isVisible()) {
            this.hideWindow();
        } else {
            this.showWindow();
        }
    }

    showWindow() {
        if (!this.mainWindow.isVisible()) {
            this.mainWindow.show();
            this.mainWindow.focus();
        }
    }

    hideWindow() {
        if (this.mainWindow.isVisible()) {
            this.mainWindow.hide();
        }
    }

    showNotification(title, message, onClick = null) {
        if (Notification.isSupported()) {
            const notification = new Notification({
                title,
                body: message,
                icon: path.join(__dirname, 'assets', 'notification-icon.png'),
                silent: false
            });

            if (onClick) {
                notification.on('click', onClick);
            }

            notification.show();
        } else {
            log.warn('Notifications are not supported on this system');
        }
    }

    destroy() {
        if (this.tray) {
            this.tray.destroy();
        }
    }
}

module.exports = TrayManager;
