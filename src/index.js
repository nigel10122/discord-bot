import { Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes } from 'discord.js';
import http from 'http';
import 'dotenv/config';
import { createNigiBot } from '../nigi-bot.js';

// ---------- Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,        // for keyword trigger
    GatewayIntentBits.MessageContent         // needed for keyword matching
  ]
});

// ---------- Healthcheck ----------
const port = Number(process.env.PORT || 3000);
http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}).listen(port);

// ---------- NigiBot instance ----------
const nigiBot = createNigiBot({
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.2),
  memoryCharBudget: Number(process.env.MEMORY_CHAR_BUDGET ?? 4000),
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN ?? 6),
  puppeteerTimeoutMs: Number(process.env.PUPPETEER_TIMEOUT_MS ?? 10000),
  logLevel: process.env.LOG_LEVEL || 'info'
});

// ---------- Slash commands definition ----------
const slashDefs = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask nigiBot a question (LLM + memory)')
    .addStringOption(opt => opt.setName('q').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder()
    .setName('shot')
    .setDescription('Screenshot a URL and get a quick summary')
    .addStringOption(opt => opt.setName('url').setDescription('https://...').setRequired(true))
].map(cmd => cmd.toJSON());

// ---------- Register commands (guild fast; global if no GUILD_ID) ----------
async function registerCommands() {
  if (!process.env.DISCORD_CLIENT_ID) {
    console.warn('DISCORD_CLIENT_ID missing; skipping slash registration');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    if (process.env.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: slashDefs }
      );
      console.log('✅ Registered GUILD slash commands');
    } else {
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: slashDefs });
      console.log('✅ Registered GLOBAL slash commands (may take ~1h)');
    }
  } catch (e) {
    console.error('⚠️ Slash registration failed:', e);
  }
}

client.once(Events.ClientReady, c => {
  console.log(`🤖 ${c.user.tag} is online! Health: http://localhost:${port}/`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ask') {
      const q = interaction.options.getString('q', true);
      await interaction.deferReply();
      const result = await nigiBot.handleAsk(interaction.channelId, interaction.user.id, q);
      await interaction.editReply(result.response);
    }

    if (interaction.commandName === 'shot') {
      const url = interaction.options.getString('url', true);
      await interaction.deferReply();
      const result = await nigiBot.handleShot(interaction.channelId, interaction.user.id, url);
      if (result.file) {
        await interaction.editReply({ content: result.response, files: [result.file] });
      } else {
        await interaction.editReply(result.response);
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  }
});

// ---------- Keyword trigger (back-compat) ----------
client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    const content = message.content || '';
    if (content.toLowerCase().includes('nigibot')) {
      const prompt = content.replace(/nigibot/ig, '').trim() || 'Help me with this chat.';
      const result = await nigiBot.handleAsk(message.channelId, message.author.id, prompt);
      await message.reply(result.response);
    }
  } catch (err) {
    console.error('MessageCreate error:', err);
  }
});

await registerCommands();
await client.login(process.env.DISCORD_TOKEN);