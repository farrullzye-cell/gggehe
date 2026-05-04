const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Sistem Konfigurasi Toko
const configFile = './config.json';
let config = {
    storeName: 'Rullzye Premium',
    apiKey: process.env.API_KEY || '',
    profit: parseInt(process.env.PROFIT || 2000),
    adminPassword: 'admin' // Password login admin
};

// Coba muat config dari file jika ada
if (fs.existsSync(configFile)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(configFile));
        config = { ...config, ...savedConfig };
    } catch (e) {}
}

const saveConfig = () => {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
};

// ==========================================
// ENDPOINT ADMIN
// ==========================================
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === config.adminPassword) return res.json({ success: true, config });
    res.json({ success: false, message: 'Password Salah!' });
});

app.post('/api/admin/save', (req, res) => {
    const { storeName, apiKey, profit, password } = req.body;
    if (password !== config.adminPassword) return res.status(403).json({ success: false });
    
    config.storeName = storeName;
    config.apiKey = apiKey;
    config.profit = parseInt(profit);
    saveConfig();
    
    res.json({ success: true, message: 'Pengaturan berhasil disimpan!' });
});

// ==========================================
// ENDPOINT TOKO UTAMA (TERHUBUNG KE PREMKU)
// ==========================================
app.get('/api/store-info', (req, res) => {
    res.json({ storeName: config.storeName });
});

app.get('/api/products', async (req, res) => {
    if (!config.apiKey) return res.json({ success: false, message: 'API Key belum diatur di Admin.' });

    try {
        const response = await axios.post('https://premku.com/api/products', { api_key: config.apiKey });
        if (response.data && response.data.products) {
            const products = response.data.products.map(p => ({
                id: p.id,
                name: p.name,
                price: parseInt(p.price) + config.profit // Harga Asli + Keuntungan
            }));
            return res.json({ success: true, products });
        }
        res.json({ success: false, message: 'Data produk kosong dari pusat.' });
    } catch (e) {
        res.json({ success: false, message: e.response?.data?.message || 'Server pusat sedang sibuk.' });
    }
});

app.post('/api/order', async (req, res) => {
    const { service, target, displayPrice, productName } = req.body;
    
    try {
        const response = await axios.post('https://premku.com/api/order', {
            api_key: config.apiKey,
            service: service,
            target: target
        });

        if (response.data && response.data.status === true) {
            res.json({
                status: true,
                invoice: {
                    orderId: response.data.data.id || 'INV-' + Math.floor(Math.random() * 10000),
                    productName: productName,
                    target: target,
                    amount: displayPrice,
                    qr_url: response.data.data.qr_url || response.data.data.qr_data,
                    date: new Date().toLocaleString('id-ID')
                }
            });
        } else {
            res.json({ status: false, message: response.data.message || 'Gagal dari pusat.' });
        }
    } catch (e) {
        const errorMsg = e.response?.data?.message || 'Koneksi ke Premku gagal.';
        res.json({ status: false, message: "Error Provider: " + errorMsg });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sistem Live di Port ${PORT}`));
