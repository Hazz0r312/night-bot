const { GoogleGenerativeAI } = require('@google/generative-ai');
const { EmbedBuilder } = require('discord.js');

const chatHistory = new Map();

class AISystem {
  static _getModel() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // gemini-1.5-flash fue reemplazado — usar gemini-2.0-flash que es gratuito y estable
    return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  // Respuesta en canal de chat IA (con historial)
  static async respond(message, config) {
    if (!process.env.GEMINI_API_KEY) return;

    const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 5000);
    message.channel.sendTyping().catch(() => {});

    try {
      const model = AISystem._getModel();

      const personality = config?.aiPersonality ||
        'Eres Night, un bot de Discord amigable, divertido y útil. Responde siempre en el idioma del usuario. Sé conciso.';

      const key = `${message.guild.id}:${message.channelId}`;
      if (!chatHistory.has(key)) chatHistory.set(key, []);
      const history = chatHistory.get(key);

      if (history.length > 20) history.splice(0, history.length - 20);

      const chat = model.startChat({
        history,
        generationConfig: { maxOutputTokens: 500, temperature: 0.8 },
        systemInstruction: `${personality}\n\nServidor: "${message.guild.name}". Usuario: "${message.author.username}".`,
      });

      const result   = await chat.sendMessage(message.content);
      const response = result.response.text();

      history.push({ role: 'user',  parts: [{ text: message.content }] });
      history.push({ role: 'model', parts: [{ text: response }] });

      clearInterval(typingInterval);

      if (response.length > 1900) {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: '🤖 Night IA', iconURL: message.client.user.displayAvatarURL() })
          .setDescription(response.substring(0, 4000))
          .setFooter({ text: 'Powered by Google Gemini' })]
        });
      } else {
        await message.reply(response);
      }
    } catch (err) {
      clearInterval(typingInterval);
      console.error('Gemini error:', err.message);
    }
  }

  // Pregunta directa sin historial (/ia ask)
  static async ask(question, guildName = '') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada en .env');

    const model  = AISystem._getModel();
    const result = await model.generateContent(
      `[Servidor Discord: ${guildName}]\nUsuario pregunta: ${question}`
    );
    return result.response.text();
  }
}

module.exports = AISystem;