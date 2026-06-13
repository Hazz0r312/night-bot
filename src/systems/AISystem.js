/**
 * NIGHT BOT — AISystem.js
 * Powered by Groq (gratis, muy rápido) — Llama 3.3 70B
 * 
 * Obtén tu key gratis en: console.groq.com/keys
 */
const axios = require('axios');
const { EmbedBuilder } = require('discord.js');

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Modelo gratuito de Groq, muy potente

// Historial de conversación por canal (en memoria)
const chatHistory = new Map();

class AISystem {

  static _checkKey() {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'tu_groq_key_aqui') {
      throw new Error('GROQ_API_KEY no configurada en .env');
    }
  }

  // ─── Respuesta en canal de chat IA (con historial) ────────────────────────
  static async respond(message, config) {
    this._checkKey();

    const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 5000);
    message.channel.sendTyping().catch(() => {});

    try {
      const personality = config?.aiPersonality ||
        'Eres Night, un bot de Discord amigable, divertido y útil. Responde siempre en el idioma del usuario. Sé conciso.';

      const key = `${message.guild.id}:${message.channelId}`;
      if (!chatHistory.has(key)) chatHistory.set(key, []);
      const history = chatHistory.get(key);

      // Limitar historial a 10 intercambios (20 mensajes)
      if (history.length > 20) history.splice(0, history.length - 20);

      const messages = [
        {
          role: 'system',
          content: `${personality}\n\nServidor: "${message.guild.name}". Usuario: "${message.author.username}".`,
        },
        ...history,
        { role: 'user', content: message.content },
      ];

      const response = await axios.post(GROQ_URL, {
        model: GROQ_MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.85,
      }, {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const answer = response.data.choices[0].message.content;

      // Guardar en historial
      history.push({ role: 'user', content: message.content });
      history.push({ role: 'assistant', content: answer });

      clearInterval(typingInterval);

      if (answer.length > 1900) {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: '🤖 Night IA', iconURL: message.client.user.displayAvatarURL() })
          .setDescription(answer.substring(0, 4000))
          .setFooter({ text: 'Powered by Groq · Llama 3.3' })]
        });
      } else {
        await message.reply(answer);
      }
    } catch (err) {
      clearInterval(typingInterval);
      console.error('Groq error:', err.response?.data || err.message);

      if (err.response?.status === 429) {
        message.reply('⚠️ Límite de IA alcanzado temporalmente. Intenta de nuevo en unos segundos.').catch(() => {});
      }
    }
  }

  // ─── Pregunta directa sin historial (/ia ask) ─────────────────────────────
  static async ask(question, guildName = '', personality = null) {
    this._checkKey();

    const systemPrompt = personality ||
      'Eres Night, un bot de Discord útil y amigable. Responde en el idioma del usuario. Sé conciso pero completo.';

    const response = await axios.post(GROQ_URL, {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: `${systemPrompt}\n\nServidor Discord: ${guildName}` },
        { role: 'user', content: question },
      ],
      max_tokens: 700,
      temperature: 0.8,
    }, {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return response.data.choices[0].message.content;
  }
}

module.exports = AISystem;
