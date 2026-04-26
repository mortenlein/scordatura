const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const open = require('open');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = 'token.json';

class GDriveSync {
    constructor(credentials, userDataPath) {
        this.client_id = credentials.client_id;
        // PROFESSIONALLY SECURE: Public clients (Desktop/Mobile) do NOT use a client_secret.
        this.redirect_uri = 'http://127.0.0.1:3000';
        this.oAuth2Client = new OAuth2Client(this.client_id, null, this.redirect_uri);
        this.tokenPath = path.join(userDataPath, TOKEN_PATH);
        this.tabsDir = path.join(userDataPath, 'tabs');
        this.logPath = path.join(userDataPath, 'scordatura_sync.log');
    }

    log(msg) {
        const time = new Date().toISOString();
        console.log(`[SYNC] ${msg}`);
        try { fs.appendFileSync(this.logPath, `${time} - ${msg}\n`); } catch (e) {}
    }

    async authenticate() {
        if (fs.existsSync(this.tokenPath)) {
            try {
                const token = JSON.parse(fs.readFileSync(this.tokenPath));
                this.oAuth2Client.setCredentials(token);
                return true;
            } catch (e) {
                this.log("Token invalid, re-authenticating...");
            }
        }
        return this.getNewToken();
    }

    generateCodeVerifier() {
        return crypto.randomBytes(32).toString('hex');
    }

    generateCodeChallenge(verifier) {
        return crypto.createHash('sha256').update(verifier).digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    async getNewToken() {
        return new Promise((resolve, reject) => {
            this.log("Starting secure PKCE flow...");
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = this.generateCodeChallenge(codeVerifier);

            const authUrl = this.oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                prompt: 'consent'
            });

            const server = http.createServer(async (req, res) => {
                try {
                    const reqUrl = new url.URL(req.url, 'http://127.0.0.1:3000');
                    if (reqUrl.pathname === '/') {
                        const code = reqUrl.searchParams.get('code');
                        
                        // Send response to browser first
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(`
                            <html>
                                <head>
                                    <title>Scordatura - Auth Success</title>
                                    <style>
                                        body { 
                                            background-color: #111111; 
                                            color: white; 
                                            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                            display: flex;
                                            flex-direction: column;
                                            align-items: center;
                                            justify-content: center;
                                            height: 100vh;
                                            margin: 0;
                                        }
                                        .container {
                                            text-align: center;
                                            padding: 40px;
                                            background: #1a1a1a;
                                            border-radius: 24px;
                                            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                                            border: 1px solid #333;
                                        }
                                        h1 { color: #ff7a00; letter-spacing: 2px; margin-bottom: 10px; }
                                        p { color: #888; font-size: 1.1rem; }
                                        .icon { font-size: 48px; margin-bottom: 20px; }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <div class="icon">🎸</div>
                                        <h1>AUTHENTICATED</h1>
                                        <p>Your library is now syncing.</p>
                                        <p style="font-size: 0.9rem; margin-top: 20px;">You can close this tab and return to the app.</p>
                                    </div>
                                </body>
                            </html>
                        `);
                        
                        this.log("Code received, exchanging for tokens...");
                        
                        // SECURE TOKEN EXCHANGE (Code + Verifier, NO Secret)
                        const { tokens } = await this.oAuth2Client.getToken({
                            code: code,
                            codeVerifier: codeVerifier
                        });
                        
                        this.oAuth2Client.setCredentials(tokens);
                        fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));
                        
                        this.log("Authentication successful.");
                        server.close();
                        resolve(true);
                    }
                } catch (e) {
                    this.log(`Critical Auth Error: ${e.message}`);
                    if (!res.headersSent) {
                        res.writeHead(500);
                        res.end('Authentication failed');
                    }
                    server.close();
                    reject(e);
                }
            }).listen(3000, '127.0.0.1', () => {
                open(authUrl);
            });
        });
    }

    async getDrive() {
        return google.drive({ version: 'v3', auth: this.oAuth2Client });
    }

    async getOrCreateRootFolder() {
        const drive = await this.getDrive();
        const res = await drive.files.list({
            q: "name = 'Scordatura' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)',
        });
        const folders = res.data.files || [];
        if (folders.length) return folders[0].id;

        const folder = await drive.files.create({
            resource: { name: 'Scordatura', mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id',
        });
        return folder.data.id;
    }

    async sync() {
        try {
            this.log("--- SYNC START ---");
            await this.authenticate();
            const drive = await this.getDrive();
            const folderId = await this.getOrCreateRootFolder();

            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, modifiedTime)',
                pageSize: 1000
            });
            const remoteFiles = res.data.files || [];

            const localTabs = [];
            if (fs.existsSync(this.tabsDir)) {
                const artistDirs = fs.readdirSync(this.tabsDir, { withFileTypes: true }).filter(d => d.isDirectory());
                for (const artistDir of artistDirs) {
                    const artistPath = path.join(this.tabsDir, artistDir.name);
                    const files = fs.readdirSync(artistPath).filter(f => f.endsWith('.json'));
                    for (const f of files) {
                        try {
                            localTabs.push(JSON.parse(fs.readFileSync(path.join(artistPath, f), 'utf-8')));
                        } catch (e) {}
                    }
                }
            }

            // Remote -> Local
            for (const remote of remoteFiles) {
                const tabId = remote.name.replace('.json', '');
                const local = localTabs.find(t => t.id === tabId);
                const remoteTime = new Date(remote.modifiedTime).getTime();

                if (!local || remoteTime > (local.savedAt || 0)) {
                    this.log(`Downloading update: ${remote.name}`);
                    const file = await drive.files.get({ fileId: remote.id, alt: 'media' });
                    const artistDir = path.join(this.tabsDir, file.data.artistId);
                    if (!fs.existsSync(artistDir)) fs.mkdirSync(artistDir, { recursive: true });
                    fs.writeFileSync(path.join(artistDir, file.data.song.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json'), JSON.stringify(file.data, null, 2));
                }
            }

            // Local -> Remote
            for (const tab of localTabs) {
                const fileName = `${tab.id}.json`;
                const remote = remoteFiles.find(f => f.name === fileName);
                const remoteTime = remote ? new Date(remote.modifiedTime).getTime() : 0;

                if (!remote || (tab.savedAt || 0) > remoteTime) {
                    this.log(`Uploading update: ${tab.song}`);
                    const media = { mimeType: 'application/json', body: JSON.stringify(tab) };
                    if (remote) {
                        await drive.files.update({ fileId: remote.id, media: media });
                    } else {
                        await drive.files.create({ resource: { name: fileName, parents: [folderId] }, media: media });
                    }
                }
            }
            this.log("--- SYNC COMPLETE ---");
            return true;
        } catch (e) {
            this.log(`Sync Failed: ${e.message}`);
            throw e;
        }
    }
}

module.exports = GDriveSync;
