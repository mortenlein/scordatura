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
        this.client_secret = credentials.client_secret;
        this.tokenPath = path.join(userDataPath, TOKEN_PATH);
        this.tabsDir = path.join(userDataPath, 'tabs');
        this.logPath = path.join(userDataPath, 'scordatura_sync.log');
        // Will be initialized with dynamic redirect URIs during authenticate
        this.oAuth2Client = new OAuth2Client(this.client_id, this.client_secret);
    }

    log(msg) {
        const time = new Date().toISOString();
        console.log(`[SYNC] ${msg}`);
        try {
            fs.appendFileSync(this.logPath, `${time} - ${msg}\n`);
        } catch (e) {}
    }

    async authenticate() {
        if (fs.existsSync(this.tokenPath)) {
            this.log("Loading existing token...");
            try {
                const token = fs.readFileSync(this.tokenPath);
                const creds = JSON.parse(token);
                this.oAuth2Client.setCredentials(creds);
                
                if (creds.expiry_date && creds.expiry_date <= Date.now()) {
                    this.log("Token expired, refreshing...");
                    const { credentials } = await this.oAuth2Client.refreshAccessToken();
                    this.oAuth2Client.setCredentials(credentials);
                    fs.writeFileSync(this.tokenPath, JSON.stringify(credentials));
                }
                return true;
            } catch (e) {
                this.log(`Auth state error: ${e.message}. Re-authenticating...`);
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
            this.log("Starting authentication flow...");
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = this.generateCodeChallenge(codeVerifier);

            let codeProcessed = false;

            const server = http.createServer(async (req, res) => {
                try {
                    if (req.url.includes('favicon.ico')) {
                        res.writeHead(404);
                        res.end();
                        return;
                    }

                    const reqUrl = new url.URL(req.url, `http://127.0.0.1:${server.address().port}`);
                    const code = reqUrl.searchParams.get('code');

                    if (code && !codeProcessed) {
                        codeProcessed = true;
                        this.log("Code received from browser.");
                        
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
                        
                        this.log("Exchanging code for tokens...");
                        const { tokens } = await this.oAuth2Client.getToken({
                            code: code,
                            codeVerifier: codeVerifier
                        });
                        
                        this.log("Tokens received, saving to disk.");
                        this.oAuth2Client.setCredentials(tokens);
                        fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));
                        
                        setTimeout(() => {
                            server.close();
                            resolve(true);
                        }, 500);
                    } else if (!code && !codeProcessed) {
                        res.writeHead(400);
                        res.end('Waiting for authentication code...');
                    }
                } catch (e) {
                    this.log(`Token exchange error: ${e.message}`);
                    if (!res.headersSent) {
                        res.writeHead(500);
                        res.end('Authentication failed.');
                    }
                    server.close();
                    reject(e);
                }
            });

            server.on('error', (e) => {
                if (e.code === 'EADDRINUSE') {
                    this.log('Port 3000 in use, falling back to dynamic port...');
                    server.listen(0, '127.0.0.1');
                } else {
                    this.log(`Server error: ${e.message}`);
                    reject(e);
                }
            });

            server.on('listening', () => {
                const port = server.address().port;
                this.log(`Auth server listening on http://127.0.0.1:${port} ...`);
                
                const redirect_uri = `http://127.0.0.1:${port}`;
                this.oAuth2Client = new OAuth2Client(this.client_id, this.client_secret, redirect_uri);
                
                const authUrl = this.oAuth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256',
                    prompt: 'consent'
                });
                
                open(authUrl);
            });

            // Start listening on 3000 first (Google exact match URIs often use this)
            server.listen(3000, '127.0.0.1');
        });
    }

    async getDrive() {
        return google.drive({ version: 'v3', auth: this.oAuth2Client });
    }

    async getOrCreateRootFolder() {
        const drive = await this.getDrive();
        this.log("Finding Scordatura folder...");
        const res = await drive.files.list({
            q: "name = 'Scordatura' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)',
        });
        const folders = res.data.files || [];
        if (folders.length) return folders[0].id;

        this.log("Creating new Scordatura folder...");
        const folder = await drive.files.create({
            resource: { name: 'Scordatura', mimeType: 'application/vnd.google-apps.folder' },
            fields: 'id',
        });
        return folder.data.id;
    }

    async sync(onProgress) {
        try {
            this.log("--- SYNC START ---");
            if (onProgress) onProgress("Authenticating...", 5);
            await this.authenticate();
            
            if (onProgress) onProgress("Connecting to Google Drive...", 10);
            const drive = await this.getDrive();
            
            if (onProgress) onProgress("Finding Scordatura folder...", 15);
            const folderId = await this.getOrCreateRootFolder();

            if (onProgress) onProgress("Fetching cloud library state...", 20);
            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, modifiedTime)',
                pageSize: 1000
            });
            const allRemoteFiles = res.data.files || [];

            // Clean up buggy filenames from previous broken agent syncs
            const remoteFiles = [];
            for (const rf of allRemoteFiles) {
                if (rf.name.includes('/') || rf.name.endsWith('.json.json')) {
                    this.log(`Trashing broken cloud file: ${rf.name}`);
                    try { await drive.files.update({ fileId: rf.id, resource: { trashed: true } }); } catch (e) {}
                } else {
                    remoteFiles.push(rf);
                }
            }

            this.log(`Cloud state: ${remoteFiles.length} valid files`);

            if (onProgress) onProgress("Analyzing local files...", 30);
            const localTabs = [];
            if (fs.existsSync(this.tabsDir)) {
                const artistDirs = fs.readdirSync(this.tabsDir, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory());

                for (const artistDir of artistDirs) {
                    const artistPath = path.join(this.tabsDir, artistDir.name);
                    const songFiles = fs.readdirSync(artistPath).filter(f => f.endsWith('.json') && f !== 'settings.json');
                    for (const songFile of songFiles) {
                        try {
                            const filePath = path.join(artistPath, songFile);
                            const stat = fs.statSync(filePath);
                            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                            data._mtime = stat.mtimeMs;
                            data._filePath = filePath;
                            
                            // Fallback ID for older or manually added files
                            if (!data.id) {
                                data.id = `${artistDir.name}/${songFile}`;
                            }
                            
                            localTabs.push(data);
                        } catch (e) {}
                    }
                }
            }
            this.log(`Local state: ${localTabs.length} tabs`);

            // Download updates
            let dCount = 0;
            for (const remoteFile of remoteFiles) {
                if (onProgress && remoteFiles.length > 0) onProgress(`Checking downloads (${dCount}/${remoteFiles.length})...`, 30 + Math.round((dCount / remoteFiles.length) * 35));
                // Find matching local tab based on Google Drive file name (which we map to 'artist_id--song_id.json')
                const localTab = localTabs.find(t => (t.id || '').replace('/', '--') === remoteFile.name);
                const remoteModified = new Date(remoteFile.modifiedTime).getTime();

                // Buffer of 2000ms to account for filesystem modification time precision
                if (!localTab || remoteModified > localTab._mtime + 2000) {
                    if (onProgress) onProgress(`Downloading: ${remoteFile.name}`, 30 + Math.round((dCount / remoteFiles.length) * 35));
                    this.log(`Downloading: ${remoteFile.name}`);
                    const file = await drive.files.get({ fileId: remoteFile.id, alt: 'media' });
                    const syncedTab = file.data;
                    
                    const safeArtist = (syncedTab.artist || 'unknown_artist').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const safeSong = (syncedTab.song || 'unknown_song').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const syncedId = `${safeArtist}/${safeSong}.json`;
                    syncedTab.id = syncedId;
                    
                    const artistDir = path.join(this.tabsDir, safeArtist);
                    if (!fs.existsSync(artistDir)) fs.mkdirSync(artistDir, { recursive: true });
                    
                    const filePath = path.join(artistDir, `${safeSong}.json`);
                    fs.writeFileSync(filePath, JSON.stringify(syncedTab, null, 2));
                    
                    // Set local modification time to exactly match the remote file's modifiedTime
                    // This prevents us from immediately uploading it back in the next sync
                    const remoteDate = new Date(remoteModified);
                    fs.utimesSync(filePath, remoteDate, remoteDate);
                }
            }

            // Upload updates
            let uCount = 0;
            for (const tab of localTabs) {
                if (onProgress && localTabs.length > 0) onProgress(`Checking uploads (${uCount}/${localTabs.length})...`, 65 + Math.round((uCount / localTabs.length) * 30));
                const fileName = (tab.id || '').replace('/', '--');
                const remoteFile = remoteFiles.find(f => f.name === fileName);
                const remoteModified = remoteFile ? new Date(remoteFile.modifiedTime).getTime() : 0;

                if (!remoteFile || tab._mtime > remoteModified + 2000) {
                    if (onProgress) onProgress(`Uploading: ${tab.song}`, 65 + Math.round((uCount / localTabs.length) * 30));
                    this.log(`Uploading: ${tab.song}`);
                    
                    const uploadData = { ...tab };
                    delete uploadData._mtime;
                    delete uploadData._filePath;
                    
                    const media = { mimeType: 'application/json', body: JSON.stringify(uploadData) };
                    
                    if (remoteFile) {
                        const updateRes = await drive.files.update({ fileId: remoteFile.id, media: media, fields: 'modifiedTime' });
                        // Update local mtime to match the server's newly minted modifiedTime to prevent re-downloads
                        if (updateRes.data && updateRes.data.modifiedTime) {
                            const newRemoteTime = new Date(updateRes.data.modifiedTime);
                            fs.utimesSync(tab._filePath, newRemoteTime, newRemoteTime);
                        }
                    } else {
                        const createRes = await drive.files.create({ resource: { name: fileName, parents: [folderId] }, media: media, fields: 'id, modifiedTime' });
                        if (createRes.data && createRes.data.modifiedTime) {
                            const newRemoteTime = new Date(createRes.data.modifiedTime);
                            fs.utimesSync(tab._filePath, newRemoteTime, newRemoteTime);
                        }
                    }
                }
            }
            this.log("--- SYNC COMPLETE ---");
            return true;
        } catch (e) {
            this.log(`CRITICAL SYNC ERROR: ${e.message}`);
            throw e;
        }
    }
}

module.exports = GDriveSync;
