import { createBot } from './discord.js';

const env = {
  WORKFLOW_URL: process.env.WORKFLOW_URL || 'http://localhost:8787',
  MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_REPO: process.env.GITHUB_REPO || '',
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
  EXA_API_KEY: process.env.EXA_API_KEY || '',
};

if (!env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN is required');
  process.exit(1);
}

if (!env.MINIMAX_API_KEY) {
  console.error('MINIMAX_API_KEY is required');
  process.exit(1);
}

const bot = createBot(env);
bot.start().catch((error) => {
  console.error('Failed to start bot:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  process.exit(0);
});
