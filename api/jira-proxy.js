// Vercel serverless function to proxy Jira API requests
// This duplicates the logic from server.js/vite.config.js but runs per-request.

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

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
        if (contentType) res.setHeader('Content-Type', contentType);
        res.send(responseBody);
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
}
