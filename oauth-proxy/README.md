# Circadia OAuth Proxy

This folder contains a small Cloudflare Worker that handles the GitHub OAuth popup flow for the Decap CMS instance at `/admin/`.

The public site stays on GitHub Pages. The Worker is a separate deployment, intended for a subdomain such as `https://auth.caincraft.com`.

## What It Does

- Redirects the CMS login popup to GitHub OAuth at `/auth`
- Exchanges the callback code for a GitHub access token at `/callback`
- Returns the token to Decap CMS using the popup `postMessage` format it expects

## Files

- `src/index.js`: Worker source
- `wrangler.toml`: Cloudflare Worker config
- `.dev.vars.example`: local environment variable template

## GitHub OAuth App Setup

Create a GitHub OAuth app and configure it with:

- Homepage URL: `https://caincraft.com/admin/`
- Authorization callback URL: `https://auth.caincraft.com/callback`

Save the app's client ID and client secret for the Worker environment.

## Worker Secrets

Set these environment variables in Cloudflare:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_SCOPE`
- `GITHUB_ALLOW_SIGNUP`

Recommended values:

- `GITHUB_SCOPE=public_repo`
- `GITHUB_ALLOW_SIGNUP=false`

If this repository ever becomes private, change the scope to `repo`.

## Local Development

1. Install Wrangler if you do not already have it.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Replace the placeholder values with your GitHub OAuth app credentials.
4. Run `wrangler dev`.

For local CMS testing, temporarily point `admin/config.yml` to your local Worker URL and make sure the OAuth app's callback URL matches that environment.

## Production Deployment

1. Deploy the Worker to Cloudflare.
2. Bind the Worker to `auth.caincraft.com`.
3. Add the Worker secrets in the Cloudflare dashboard or with Wrangler.
4. Confirm `https://auth.caincraft.com/` responds and `https://auth.caincraft.com/auth` redirects to GitHub.
5. Keep `admin/config.yml` pointed at `https://auth.caincraft.com`.

## Security Notes

- The Worker never stores GitHub tokens persistently.
- The OAuth state value is checked with a short-lived secure cookie before the access token is accepted.
- The site still relies on GitHub repository permissions to determine who can actually edit content.
