import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple Express server that serves the built frontend and provides
// Jira proxy endpoints which mirror the logic in vite.config.js.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

// Allow large JSON bodies (base64 images can be big)
app.use(express.json({ limit: '50mb' }));

// ----- jira-proxy endpoint -----
app.post('/api/jira-proxy', async (req, res) => {
    const { targetUrl, method, headers, requestBody } = req.body || {};
    if (!targetUrl) {
        res.status(400).json({ error: 'targetUrl is required' });
        return;
    }

    try {
        const fetchOpts = {
            method: method || 'GET',
            headers: headers || {},
        };

        if (requestBody) {
            if (typeof requestBody === 'string') {
                fetchOpts.body = requestBody;
            } else {
                fetchOpts.body = JSON.stringify(requestBody);
            }
        }

        const upstream = await fetch(targetUrl, fetchOpts);
        const contentType = upstream.headers.get('content-type') || '';
        const responseBody = await upstream.text();

        res.status(upstream.status);
        if (contentType) res.set('Content-Type', contentType);
        res.send(responseBody);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
});

// ----- jira-upload endpoint (multipart) -----
app.post(
    '/api/jira-upload',
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req, res) => {
        const targetUrl = req.headers['x-target-url'];
        const authorization = req.headers['x-jira-auth'];

        if (!targetUrl) {
            res.status(400).json({ error: 'x-target-url header required' });
            return;
        }

        try {
            const upstream = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    Authorization: authorization,
                    'X-Atlassian-Token': 'no-check',
                    'Content-Type': req.headers['content-type'],
                },
                body: req.body,
            });

            const responseBody = await upstream.text();
            res.status(upstream.status);
            res.set(
                'Content-Type',
                upstream.headers.get('content-type') || 'application/json'
            );
            res.send(responseBody);
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    }
);

// Serve static files from the dist directory after building
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
