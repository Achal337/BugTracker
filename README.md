# Bug Report Generator (AA-Bug-AI)

This is a single-page web application that helps testers and developers generate structured bug reports using AI and push them to Jira.

## Features

- Four-step wizard: Configure, Describe Bug, Review Report, Create Bug
- Screenshot upload with drag-and-drop
- AI analysis via Groq Llama-4-Scout
- Jira integration with proxy endpoints to avoid CORS
- Production-ready Express server serving static files and proxying requests

## Development

```bash
npm install
npm run dev        # start vite dev server on localhost:5173
```

The dev server includes a built-in proxy (`vite.config.js`) that forwards Jira API requests to bypass CORS.

## Production Build & Deployment

### Vercel Deployment

If you're hosting on Vercel, the `server.js` Express server won't run – instead
Vercel exposes any files under `api/` as serverless functions. Two such
functions (`jira-proxy.js` and `jira-upload.js`) have been added to mirror the
proxy behaviour. After pushing to GitHub, Vercel will automatically build the
frontend and deploy these functions so that `/api/jira-proxy` and
`/api/jira-upload` work correctly.

Ensure the `formidable` dependency is installed (included below) because the
upload handler needs it.


1. Build the frontend:
   ```bash
   npm run build
   ```
   The files will be generated in the `dist/` directory.

2. Install production dependencies:
   ```bash
   npm install --production
   ```

3. Start the Express server:
   ```bash
   npm start
   ```

   The server listens on `PORT` (default 3000) and serves `dist/` plus `/api/jira-proxy` and `/api/jira-upload` endpoints that forward requests to Jira.

4. Configure environment variables or a `.env` file if needed (see `.gitignore`).

You can deploy to any Node.js-hosting provider (Heroku, Vercel with a serverless function, DigitalOcean, etc.).

> **Important:** the proxy endpoints are required in production unless you configure CORS on your Jira instance or handle Jira communication in a separate backend.
>
> **Security note:** the current frontend stores the Groq API key and Jira credentials in `localStorage` and uses them directly from the browser. This is convenient for testing but **not secure for production**. Consider moving authentication and all API calls (Groq and Jira) to a server‑side component so that secrets never reach the client.

## GitHub Push

Before pushing to GitHub, make sure:

- `.gitignore` includes `node_modules/`, `dist/`, and `.env`.
- `package.json` has the `start` script and `express` dependency.

Then:

```bash
git init
git add .
git commit -m "Initial commit with production server and instructions"
git remote add origin <your-repo-url>
git push -u origin main
```

Replace `<your-repo-url>` with the URL of your new GitHub repository.

---

Feel free to modify the server or environment configuration as needed for your deployment target.