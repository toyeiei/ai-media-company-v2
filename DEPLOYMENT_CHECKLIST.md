# AI Media Team Bot - Deployment Checklist

## Pre-Requisites
- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] GitHub account with a repository for GitHub Pages
- [ ] Discord account

---

## Step 1: Create Discord Bot

### 1.1 Create Application
1. Go to https://discord.com/developers/applications
2. Click **New Application**
3. Name it `AI Media Team` (or your choice)
4. Click **Create**

### 1.2 Add Bot User
1. In left sidebar, click **Bot**
2. Click **Add Bot** → **Yes, do it**
3. Under **Token**, click **Reset Token**
4. **COPY AND SAVE THE TOKEN** (you won't see it again!)
5. Scroll down to **Privileged Gateway Intents**
6. Enable **Message Content Intent** ✓

### 1.3 Configure OAuth2
1. In left sidebar, click **OAuth2** → **URL Generator**
2. Check scopes: `bot`
3. Check permissions: `Send Messages`, `Read Message History`
4. **COPY THE GENERATED URL**

### 1.4 Add Bot to Server
1. Open the generated URL in your browser
2. Select your server
3. Click **Authorize**

---

## Step 2: Set Up Cloudflare

### 2.1 Login to Cloudflare
```bash
wrangler login
```

### 2.2 Create KV Namespace
```bash
cd ai-media-team
wrangler kv:namespace create CACHE
```
**COPY THE ID** returned (looks like `abc123def456`)

### 2.3 Update wrangler.toml
Replace `id = "cache"` with your actual KV ID:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_KV_ID_HERE"
```

---

## Step 3: Set Secrets

```bash
cd ai-media-team

# Discord Bot Token (from Step 1.2)
wrangler secret put DISCORD_BOT_TOKEN
# Enter your Discord bot token when prompted

# MiniMax API Key (from your MiniMax dashboard)
wrangler secret put MINIMAX_API_KEY
# Enter your MiniMax API key when prompted

# GitHub Personal Access Token
wrangler secret put GITHUB_TOKEN
# Create one at: https://github.com/settings/tokens
# Needs 'repo' scope for private repos, or 'public_repo' for public

# GitHub Repository (format: username/repo)
wrangler secret put GITHUB_REPO
# Example: "myusername/myusername.github.io"

# Your Worker URL (after deploy, update this)
wrangler secret put WORKFLOW_URL
# Enter a temporary value first, we'll update after deploy
```

---

## Step 4: Create GitHub Personal Access Token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it `AI Media Team`
4. Select scopes:
   - [ ] `repo` (if private repo)
   - [ ] `public_repo` (if public repo only)
5. Click **Generate token**
6. **COPY AND SAVE THE TOKEN** (won't see again!)

---

## Step 5: Deploy the Worker

```bash
cd ai-media-team
npm run deploy
```

**SAVE THE `.worker.dev` URL** shown in the output (e.g., `https://ai-media-team.your-subdomain.workers.dev`)

---

## Step 6: Update WORKFLOW_URL

```bash
wrangler secret put WORKFLOW_URL
# Enter your worker URL, e.g., https://ai-media-team.your-subdomain.workers.dev
```

---

## Step 7: Test the Bot

### 7.1 Health Check
```bash
curl https://your-worker-url.workers.dev/health
```
Should return: `{"status": "ok", "timestamp": ...}`

### 7.2 Test in Discord
1. Open Discord and find your bot in the server
2. **Send a DM** to the bot (click on bot name → Message)
3. Try: `create blog test topic`
4. Bot should respond with starting workflow

### 7.3 Test Commands
| Command | Expected Response |
|---------|-------------------|
| `create blog test` | "Starting workflow for: test..." |
| `status` | Shows current workflow status |
| `cancel` | Cancels workflow |
| `help` | Shows available commands |

---

## Step 8: Verify Full Workflow (Optional)

### 8.1 Start a Blog
```
create blog Why Cloudflare Workers is Amazing
```

### 8.2 Wait for Steps
Bot will progress through:
- RESEARCH
- DRAFT  
- EDIT
- FINAL
- SOCIAL
- AWAITING_APPROVAL

### 8.3 Approve and Publish
```
yes
```
Bot should publish to GitHub Pages.

---

## Troubleshooting

### Bot not responding?
1. Check bot is online in Discord
2. Verify DISCORD_BOT_TOKEN is correct
3. Check Worker logs: `wrangler tail`

### Publishing fails?
1. Verify GITHUB_TOKEN has correct permissions
2. Check GITHUB_REPO format is correct (`owner/repo`)
3. Ensure repo exists and is accessible

### MiniMax errors?
1. Verify MINIMAX_API_KEY is correct
2. Check your rate limit at MiniMax dashboard
3. Run `wrangler tail` to see error details

### Worker deploy fails?
1. Run `wrangler deploy --verbose` for details
2. Check `wrangler.toml` syntax
3. Ensure you're logged in: `wrangler whoami`

---

## File Structure Reference

```
ai-media-team/
├── src/
│   ├── index.ts         # Worker entry + workflow API
│   ├── discord.ts       # Discord bot client
│   ├── env.ts           # Durable Objects + types
│   ├── minimax.ts       # MiniMax API client
│   ├── github.ts        # GitHub publishing
│   ├── exa.ts          # Exa search (optional)
│   ├── bot.ts           # Standalone bot runner
│   └── steps/
│       └── index.ts     # Workflow steps
├── wrangler.toml       # Worker config
├── package.json
├── tsconfig.json
└── README.md
```

---

## Quick Reference: Commands

| Command | Description |
|---------|-------------|
| `create blog <topic>` | Start new blog workflow |
| `status` | View current progress |
| `retry` | Retry failed step |
| `cancel` | Cancel workflow |
| `yes` | Approve and publish |
| `no` | Request revisions |

---

## Quick Reference: Environment Variables

| Variable | Where to Get |
|----------|--------------|
| DISCORD_BOT_TOKEN | Discord Developer Portal → Bot → Token |
| MINIMAX_API_KEY | MiniMax Dashboard → API Keys |
| GITHUB_TOKEN | GitHub Settings → Developer Settings → Personal Access Token |
| GITHUB_REPO | Your GitHub username + repo name |
| WORKFLOW_URL | Your Cloudflare Worker URL (after deploy) |
