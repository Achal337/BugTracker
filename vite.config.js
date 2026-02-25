import { defineConfig } from 'vite';

// Custom Vite plugin to proxy Jira API calls (avoids CORS)
function jiraProxyPlugin() {
    return {
        name: 'jira-proxy',
        configureServer(server) {
            server.middlewares.use('/api/jira-proxy', async (req, res) => {
                // Only accept POST
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }

                // Read body
                let body = '';
                for await (const chunk of req) body += chunk;

                let payload;
                try {
                    payload = JSON.parse(body);
                } catch {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    return;
                }

                const { targetUrl, method, headers, requestBody } = payload;

                if (!targetUrl) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'targetUrl is required' }));
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

                    res.statusCode = upstream.status;
                    res.setHeader('Content-Type', contentType);
                    res.end(responseBody);
                } catch (err) {
                    res.statusCode = 502;
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // Separate endpoint for file uploads (multipart)
            server.middlewares.use('/api/jira-upload', async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: 'Method not allowed' }));
                    return;
                }

                // Read the raw binary body
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                const rawBody = Buffer.concat(chunks);

                const targetUrl = req.headers['x-target-url'];
                const authorization = req.headers['x-jira-auth'];

                if (!targetUrl) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'x-target-url header required' }));
                    return;
                }

                try {
                    const upstream = await fetch(targetUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': authorization,
                            'X-Atlassian-Token': 'no-check',
                            'Content-Type': req.headers['content-type'],
                        },
                        body: rawBody,
                    });

                    const responseBody = await upstream.text();
                    res.statusCode = upstream.status;
                    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
                    res.end(responseBody);
                } catch (err) {
                    res.statusCode = 502;
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        }
    };
}

export default defineConfig({
    plugins: [jiraProxyPlugin()],
    server: {
        port: 5173,
        open: true
    }
});
