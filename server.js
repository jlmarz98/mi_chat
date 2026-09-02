const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Base de datos SQLite ligera
const db = new Database('chat.db');

// Crear tablas si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Registro
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Faltan campos' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    stmt.run(username, hashedPassword);
    res.json({ success: true, username });
  } catch (err) {
    res.status(400).json({ error: 'El usuario ya existe' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const user = stmt.get(username);

  if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });

  bcrypt.compare(password, user.password, (err, match) => {
    if (match) {
      res.json({ success: true, username: user.username });
    } else {
      res.status(400).json({ error: 'Contraseña incorrecta' });
    }
  });
});

// Websockets
io.on('connection', (socket) => {
  const history = db.prepare('SELECT user, text FROM messages ORDER BY id DESC LIMIT 50').all();
  socket.emit('history', history.reverse());

  socket.on('chatMessage', (data) => {
    const { user, text } = data;
    const stmt = db.prepare('INSERT INTO messages (user, text) VALUES (?, ?)');
    stmt.run(user, text);
    io.emit('message', { user, text });
  });
});

server.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});