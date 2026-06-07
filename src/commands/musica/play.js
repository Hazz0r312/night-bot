const { createQueue, getQueue } = require('../../systems/MusicSystem');

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Reproduce una canción o búsqueda en el canal de voz',
    async execute(message, args) {
        // 1. Comprobamos si el usuario está en un canal de voz
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ ¡Tienes que estar en un canal de voz para poner música!').catch(() => {});
        }

        // 2. Comprobamos si ha puesto algún enlace o texto
        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Indica el nombre de una canción o un enlace de YouTube.').catch(() => {});
        }

        // 3. Enviamos el mensaje de espera en Discord
        const msgEsperando = await message.reply('🔍 Buscando y procesando pista... Por favor, espera.').catch(() => {});

        try {
            // 4. Obtenemos o creamos la cola para el servidor
            let queue = getQueue(message.guild.id);
            if (!queue) {
                queue = createQueue(message.guild.id);
            }
            
            // Guardamos el canal de texto para los anuncios automáticos
            queue.textChannel = message.channel;

            // 5. Llamamos al addTrack de DisTube pasándole los datos del canal y del mensaje
            await queue.addTrack(query, voiceChannel, message);

            // Borramos el mensaje de "Buscando..." ya que DisTube enviará el suyo propio al empezar a sonar
            if (msgEsperando) await msgEsperando.delete().catch(() => {});

        } catch (error) {
            console.error('--- ERROR DETALLADO EN EL COMANDO PLAY ---', error);
            if (msgEsperando) {
                await msgEsperando.edit(`❌ Error interno al procesar el audio: ${error.message}`).catch(() => {});
            } else {
                await message.reply(`❌ Error interno al procesar el audio: ${error.message}`).catch(() => {});
            }
        }
    },
};