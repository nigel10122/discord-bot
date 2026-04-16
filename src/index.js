import { Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes } from 'discord.js';
import http from 'http';
import 'dotenv/config';
import { createNigiBot } from '../nigi-bot.js';

// ---------- Client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,   // keyword trigger
    GatewayIntentBits.MessageContent   // keyword matching
  ]
});

// ---------- Lightweight runtime stats ----------
const bootTime = Date.now();
let sessionCommands = 0; // counts /ask, /shot, /stats and keyword replies

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
    .addStringOption(opt => opt.setName('url').setDescription('https://...').setRequired(true)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot usage stats (servers, uptime, session commands) v1.0.1') // bump text to force refresh
].map(cmd => cmd.toJSON());

// ---------- Register commands: GLOBAL + DEV GUILD + OPTIONAL EXTRA GUILDS ----------
async function registerCommands() {
  const appId = process.env.DISCORD_CLIENT_ID;
  if (!appId) {
    console.warn('DISCORD_CLIENT_ID missing; skipping slash registration');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    // 1) GLOBAL commands for EVERY server (first-time global can take ~1h)
    await rest.put(Routes.applicationCommands(appId), { body: slashDefs });
    console.log('🌍 Registered GLOBAL slash commands');

    // 2) DEV guild (instant)
    if (process.env.DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(appId, process.env.DISCORD_GUILD_ID),
        { body: slashDefs }
      );
      console.log(`⚡ Registered DEV GUILD commands for ${process.env.DISCORD_GUILD_ID}`);
    }

    // 3) Additional guilds (instant), comma-separated IDs
    if (process.env.ADDITIONAL_GUILD_IDS) {
      const extra = process.env.ADDITIONAL_GUILD_IDS.split(',').map(s => s.trim()).filter(Boolean);
      for (const gid of extra) {
        await rest.put(Routes.applicationGuildCommands(appId, gid), { body: slashDefs });
        console.log(`⚡ Registered EXTRA GUILD commands for ${gid}`);
      }
    }
  } catch (e) {
    console.error('⚠️ Slash registration failed:', e?.message || e);
  }
}

client.once(Events.ClientReady, c => {
  console.log(`🤖 ${c.user.tag} is online! Health: http://localhost:${port}/`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    console.log(`[STATS] Command run: /${interaction.commandName} by ${interaction.user.tag}`);

    if (interaction.commandName === 'ask') {
      sessionCommands++;
      const q = interaction.options.getString('q', true);
      await interaction.deferReply();
      const result = await nigiBot.handleAsk(interaction.channelId, interaction.user.id, q);
      await interaction.editReply(result.response);
      return;
    }

    if (interaction.commandName === 'shot') {
      sessionCommands++;
      const url = interaction.options.getString('url', true);
      await interaction.deferReply();
      const result = await nigiBot.handleShot(interaction.channelId, interaction.user.id, url);
      if (result.file) {
        await interaction.editReply({ content: result.response, files: [result.file] });
      } else {
        await interaction.editReply(result.response);
      }
      return;
    }

    if (interaction.commandName === 'stats') {
      sessionCommands++;
      const uptimeSec = Math.floor((Date.now() - bootTime) / 1000);
      const guilds = client.guilds.cache.size;
      await interaction.reply(
        `📊 **nigiBot Stats**\n• Servers: ${guilds}\n• Uptime: ${uptimeSec}s\n• Commands this session: ${sessionCommands}`
      );
      return;
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
      sessionCommands++;
      const prompt = content.replace(/nigibot/ig, '').trim() || 'Help me with this chat.';
      const result = await nigiBot.handleAsk(message.channelId, message.author.id, prompt);
      await message.reply(result.response);
      console.log(`[STATS] keyword reply executed for ${message.author.tag}`);
    }
  } catch (err) {
    console.error('MessageCreate error:', err);
  }
});

await registerCommands();
await client.login(process.env.DISCORD_TOKEN);