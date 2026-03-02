// Serverless function for handling Jira file uploads (multipart)



export const config = {
  api: {
    bodyParser: false, // we handle the raw multipart stream manually
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const targetUrl = req.headers['x-target-url'];
  const authorization = req.headers['x-jira-auth'];

  if (!targetUrl) {
    res.status(400).json({ error: 'x-target-url header required' });
    return;
  }

  // accumulate raw body chunks
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('error', (err) => {
    res.status(500).json({ error: 'Request stream error' });
  });
  req.on('end', async () => {
    const rawBody = Buffer.concat(chunks);

    try {
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'X-Atlassian-Token': 'no-check',
          'Content-Type': req.headers['content-type'],
        },
        body: rawBody,
      });

      const responseBody = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      res.send(responseBody);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
}
