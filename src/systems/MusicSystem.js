const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/helpers');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

let distubeInstance = null;
const queues = new Map();

// Función interna para procesar las cookies en formato JSON o Netscape plano
function parseCookiesAnyFormat(rawText) {
  const text = rawText.trim();
  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : [parsed]).map(c => ({
      domain: c.domain || '.youtube.com',
      path: c.path || '/',
      secure: c.secure !== undefined ? c.secure : true,
      name: c.name || c.key,
      value: c.value
    })).filter(c => c.name && c.value);
  }
  const cookies = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      cookies.push({ 
        domain: parts[0], 
        path: parts[2], 
        secure: parts[3] === 'TRUE', 
        name: parts[5], 
        value: parts[6] 
      });
    }
  }
  return cookies;
}

function getDisTube(client) {
  if (!distubeInstance && client) {
    const cookiesPath = path.join(process.cwd(), 'cookies.json');
    const plugins = [];

    // 1. Configuración del plugin de YouTube con manejo de cookies
    if (fs.existsSync(cookiesPath)) {
      try {
        const cookiesData = parseCookiesAnyFormat(fs.readFileSync(cookiesPath, 'utf-8'));
        plugins.push(new YouTubePlugin({ cookies: cookiesData }));
        console.log(`✅ Plugins: YouTube configurado con [${cookiesData.length}] cookies.`);
      } catch (err) {
        console.error('❌ Error al leer cookies.json, iniciando YouTube básico:', err.message);
        plugins.push(new YouTubePlugin());
      }
    } else {
      plugins.push(new YouTubePlugin());
    }

    // 2. Agregamos Spotify y SoundCloud de respaldo (sin opciones obsoletas)
    plugins.push(new SpotifyPlugin());
    plugins.push(new SoundCloudPlugin());

    // 3. Inicialización del motor principal de DisTube
    distubeInstance = new DisTube(client, {
      emitNewSongOnly: true,
      nsfw: true,
      plugins: plugins,
      ffmpeg: { path: ffmpegPath }
    });

    // Evento cuando una canción empieza a sonar
    distubeInstance.on('playSong', (queue, song) => {
      const mins = Math.floor(song.duration / 60);
      const secs = String(song.duration % 60).padStart(2, '0');
      if (queue.textChannel) {
        queue.textChannel.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS?.main || 0x5865F2)
          .setAuthor({ name: '🎵 Reproduciendo ahora mismo' })
          .setTitle(song.name)
          .setURL(song.url)
          .setThumbnail(song.thumbnail || null)
          .addFields({ name: '⏱️ Duración', value: `\`${mins}:${secs}\``, inline: true })]
        }).catch(() => {});
      }
    });

    // Manejo global de errores del reproductor
    distubeInstance.on('error', (channel, e) => {
      console.error('Error en DisTube:', e.message);
      if (channel) channel.send(`❌ Error en el reproductor: ${e.message}`).catch(() => {});
    });
  }
  return distubeInstance;
}

class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.textChannel = null;
  }

  async addTrack(query, voiceChannel, message) {
    if (!voiceChannel) throw new Error('¡Necesitas estar en un canal de voz!');
    const distube = getDisTube(voiceChannel.client);
    try {
      if (voiceChannel.guild.members.me.voice.channelId) {
        try { distube.voices.leave(voiceChannel.guild.id); } catch {}
      }
      await distube.play(voiceChannel, query, { 
        textChannel: this.textChannel || message.channel, 
        message: message 
      });
      return { title: query, url: '' };
    } catch (e) {
      console.error('Fallo crítico al reproducir:', e.message);
      throw new Error('No se pudo procesar la pista en ninguna de las plataformas.');
    }
  }

  start() {}
  skip() { try { const d = getDisTube(); if (d) d.skip(this.guildId); } catch {} }
  pause() { try { const d = getDisTube(); if (d) d.pause(this.guildId); } catch {} }
  resume() { try { const d = getDisTube(); if (d) d.resume(this.guildId); } catch {} }
  destroy() { try { const d = getDisTube(); if (d) d.stop(this.guildId); } catch {} queues.delete(this.guildId); }
}

function getQueue(guildId) { return queues.get(guildId) || null; }
function createQueue(guildId) { const q = new MusicQueue(guildId); queues.set(guildId, q); return q; }
function deleteQueue(guildId) { const q = queues.get(guildId); if (q) q.destroy(); }

module.exports = { getQueue, createQueue, deleteQueue };