const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');
const axios = require('axios');

// Konfigurasi API Premku
const PREMKU_API_KEY = 'a1f9783be99aa798a7aee06561d3bb92'; 
const PREMKU_BASE_URL = 'https://premku.com/api';

const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, resolve));
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    let phoneNumber = '';

    // Minta nomor telepon SEBELUM koneksi socket dimulai
    if (!state.creds.registered) {
        phoneNumber = await question('Masukkan nomor WhatsApp bot (contoh: 62812xxxx): ');
        phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); // Bersihkan karakter selain angka
        console.log('Menghubungkan ke server WhatsApp, mohon tunggu...');
    }

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // KUNCI PERBAIKAN: 
        // Event 'qr' hanya akan muncul jika koneksi socket sudah 100% terbuka.
        // Jadi kita request pairing code di sini agar tidak ada lagi error "Connection Closed".
        if (qr && !state.creds.registered) {
            try {
                console.log('Koneksi stabil! Meminta kode pairing ke server...');
                const code = await sock.requestPairingCode(phoneNumber);
                console.log('\n=============================================');
                console.log(`[!] KODE PAIRING ANDA: ${code}`);
                console.log('=============================================\n');
                console.log('Masukkan kode di atas pada aplikasi WA Anda.');
            } catch (error) {
                console.error('\n[X] Gagal mendapatkan kode pairing:', error.message);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Mencoba menyambungkan ulang...');
                connectToWhatsApp();
            } else {
                console.log('Sesi ditutup. Silakan hapus folder auth_info_baileys dan mulai ulang.');
            }
        } else if (connection === 'open') {
            console.log('\n[V] Bot berhasil terhubung ke WhatsApp dan siap digunakan!\n');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (text.toLowerCase() === '!ping') {
            await sock.sendMessage(from, { text: 'Pong! Bot berjalan dengan baik.' });
        }

        if (text.toLowerCase() === '!profile') {
            try {
                const response = await axios.post(`${PREMKU_BASE_URL}/profile`, {
                    api_key: PREMKU_API_KEY
                });

                if (response.data.success) {
                    const data = response.data.data;
                    const reply = `*PROFIL PREMKU*\n\nUsername: ${data.username}\nSaldo: Rp${data.saldo}\nWhatsApp: ${data.whatsapp}`;
                    await sock.sendMessage(from, { text: reply });
                } else {
                    await sock.sendMessage(from, { text: `Gagal: ${response.data.message}` });
                }
            } catch (error) {
                await sock.sendMessage(from, { text: 'Terjadi kesalahan saat menghubungi API Premku.' });
            }
        }

        if (text.toLowerCase() === '!produk') {
            try {
                const response = await axios.post(`${PREMKU_BASE_URL}/products`, {
                    api_key: PREMKU_API_KEY
                });

                if (response.data.success) {
                    let reply = '*DAFTAR PRODUK PREMKU*\n\n';
                    response.data.products.forEach((p) => {
                        reply += `ID: ${p.id}\nNama: ${p.name}\nHarga: Rp${p.price}\nStok: ${p.stock}\nStatus: ${p.status}\n\n`;
                    });
                    await sock.sendMessage(from, { text: reply });
                }
            } catch (error) {
                await sock.sendMessage(from, { text: 'Terjadi kesalahan saat mengambil data produk.' });
            }
        }
    });
}

connectToWhatsApp();
