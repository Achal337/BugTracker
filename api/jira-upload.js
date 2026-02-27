// Serverless function for handling Jira file uploads (multipart)

import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false, // we will parse manually with formidable
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'Upload parsing failed' });
      return;
    }

    const targetUrl = req.headers['x-target-url'];
    const authorization = req.headers['x-jira-auth'];

    if (!targetUrl) {
      res.status(400).json({ error: 'x-target-url header required' });
      return;
    }

    try {
      // read raw file buffer
      const file = files.file;
      const buffer = await fs.promises.readFile(file.filepath);

      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'X-Atlassian-Token': 'no-check',
          'Content-Type': file.mimetype,
        },
        body: buffer,
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
