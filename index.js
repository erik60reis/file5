const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
const http = require('http');
const geolib = require('geolib');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Limpar a pasta de uploads no início do servidor
const uploadDir = path.join(__dirname, 'uploads');
fs.readdir(uploadDir, (err, files) => {
    if (err) console.error('Erro ao ler a pasta de uploads:', err);
    files.forEach(file => {
        const filePath = path.join(uploadDir, file);
        fs.unlink(filePath, err => {
            if (err) console.error('Erro ao deletar arquivo:', err);
        });
    });
});

// Configurar limite de tamanho de upload (25 MB)
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

const files = [];

// Serve os arquivos estáticos do frontend
app.use(express.static('public'));

// API para upload de arquivos
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Arquivo não foi enviado ou excede o limite de 25 MB.' });
    }

    const file = {
        name: req.file.originalname,
        path: req.file.path,
        uploadedAt: Date.now(),
        coordinates: req.body.coordinates ? JSON.parse(req.body.coordinates) : null
    };
    files.push(file);

    // Notifica os clientes sobre o novo arquivo
    io.emit('fileUploaded', file);

    // Remove o arquivo da lista após 8 minutos
    setTimeout(() => {
        const index = files.indexOf(file);
        if (index > -1) {
            // Remove o arquivo da lista
            files.splice(index, 1);
            io.emit('fileRemoved', file);

            // Remove o arquivo do sistema de arquivos
            fs.unlink(file.path, (err) => {
                if (err) console.error('Erro ao deletar o arquivo:', err);
            });
        }
    }, 480000);

    res.json({ success: true, file });
});

// API para obter a lista de arquivos dentro do raio de 300 metros
app.get('/files', (req, res) => {
    const userCoords = req.query.coordinates ? JSON.parse(req.query.coordinates) : null;

    const filteredFiles = userCoords
        ? files.filter(file =>
            file.coordinates &&
            geolib.getDistance(userCoords, file.coordinates) <= 300
          )
        : files;

    res.json(filteredFiles);
});

// Rota para download de arquivos
app.get('/download/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const file = files.find(f => f.name === fileName);

    if (file) {
        res.download(file.path, file.name);
    } else {
        res.status(404).send('Arquivo não encontrado');
    }
});

// Inicia o servidor
server.listen(4547, () => {
    console.log('Servidor rodando na porta 4547');
});