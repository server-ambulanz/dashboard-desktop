// /Users/jsentuerk/server-ambulanz/dashboard-web/dashboard-desktop/network.js
// Ver. 1.0.0
const { net } = require('electron');
const log = require('electron-log');
const Store = require('electron-store');
const https = require('https');
const dns = require('dns');
const { promisify } = require('util');

class NetworkManager {
    constructor() {
        this.store = new Store();
        this.serverUrl = this.store.get('serverUrl');
        this.isOnline = true;
        this.dnsResolve = promisify(dns.resolve);
        
        // SSL/TLS Konfiguration
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: true,
            keepAlive: true,
            timeout: 30000
        });
    }

    async diagnoseConnectionProblem() {
        try {
            // 1. Prüfe Internet-Verbindung (DNS-Test)
            try {
                await this.dnsResolve('8.8.8.8');
            } catch (error) {
                return {
                    type: 'INTERNET_CONNECTION',
                    message: 'Keine Internetverbindung verfügbar',
                    detail: 'Bitte überprüfen Sie Ihre Internetverbindung.'
                };
            }

            // 2. Prüfe Server-DNS
            const serverHost = new URL(this.serverUrl).hostname;
            try {
                await this.dnsResolve(serverHost);
            } catch (error) {
                return {
                    type: 'DNS_RESOLUTION',
                    message: 'Server nicht erreichbar',
                    detail: `Der Server "${serverHost}" konnte nicht aufgelöst werden.`
                };
            }

            // 3. Prüfe Server-Erreichbarkeit
            try {
                await this.pingServer();
            } catch (error) {
                return {
                    type: 'SERVER_CONNECTION',
                    message: 'Server nicht verfügbar',
                    detail: 'Der Server ist momentan nicht erreichbar. Bitte versuchen Sie es später erneut.'
                };
            }

            // 4. Prüfe Authentifizierung
            try {
                await this.checkAuth();
            } catch (error) {
                if (error.status === 401) {
                    return {
                        type: 'AUTHENTICATION',
                        message: 'Authentifizierungsfehler',
                        detail: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.'
                    };
                }
            }

            return null; // Keine Probleme gefunden

        } catch (error) {
            log.error('Connection diagnosis failed:', error);
            return {
                type: 'UNKNOWN',
                message: 'Unbekannter Verbindungsfehler',
                detail: 'Ein unerwarteter Fehler ist aufgetreten.'
            };
        }
    }

    async pingServer() {
        return new Promise((resolve, reject) => {
            const request = net.request({
                url: `${this.serverUrl}/health`,
                agent: this.httpsAgent,
                method: 'GET'
            });

            request.on('response', (response) => {
                response.on('data', () => {}); // Stream leeren
                response.on('end', () => {
                    if (response.statusCode === 200) {
                        resolve();
                    } else {
                        reject(new Error(`Server returned status ${response.statusCode}`));
                    }
                });
            });

            request.on('error', reject);
            request.end();
        });
    }

    async checkAuth() {
        return new Promise((resolve, reject) => {
            const request = net.request({
                url: `${this.serverUrl}/api/v1/auth/check`,
                agent: this.httpsAgent,
                method: 'GET'
            });

            request.on('response', (response) => {
                if (response.statusCode === 200) {
                    resolve();
                } else {
                    reject({ status: response.statusCode });
                }
            });

            request.on('error', reject);
            request.end();
        });
    }

    async fetch(endpoint, options = {}) {
        try {
            const url = `${this.serverUrl}${endpoint}`;
            const request = net.request({
                url,
                ...options,
                agent: this.httpsAgent
            });

            return new Promise((resolve, reject) => {
                request.on('response', (response) => {
                    let data = '';
                    response.on('data', (chunk) => {
                        data += chunk;
                    });
                    response.on('end', () => {
                        if (response.statusCode >= 200 && response.statusCode < 300) {
                            resolve({ data: JSON.parse(data), status: response.statusCode });
                        } else {
                            reject(new Error(`Request failed with status ${response.statusCode}`));
                        }
                    });
                });

                request.on('error', async (error) => {
                    const diagnosis = await this.diagnoseConnectionProblem();
                    reject({ ...error, diagnosis });
                });

                if (options.body) {
                    request.write(JSON.stringify(options.body));
                }
                request.end();
            });
        } catch (error) {
            log.error('Fetch error:', error);
            throw error;
        }
    }
}

module.exports = new NetworkManager();
