const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle automation requests
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('start-automation', async (data) => {
    const { urls } = data;

    socket.emit('log', { message: '🚀 Starting automation...\n', type: 'info' });

    try {
      // Save URLs to temporary file
      const tempFile = path.join(__dirname, 'temp-urls.txt');
      fs.writeFileSync(tempFile, urls.join('\n'), 'utf8');

      // Import and run automation
      const { runAutomationWithUI } = require('./automation-core.js');

      await runAutomationWithUI(
        tempFile,
        // Log callback
        (message, type = 'info') => {
          socket.emit('log', { message, type });
        },
        // Progress callback
        (progress) => {
          socket.emit('progress', progress);
        },
        // Results callback (called for each completed item)
        (result) => {
          socket.emit('result', result);
        }
      );

      // Clean up temp file
      fs.unlinkSync(tempFile);

      socket.emit('complete', { success: true });
      socket.emit('log', { message: '\n✅ All done!\n', type: 'success' });

    } catch (error) {
      socket.emit('log', { message: `\n❌ Error: ${error.message}\n`, type: 'error' });
      socket.emit('complete', { success: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`\n🎨 PinClicks Automation UI is running!`);
  console.log(`\n👉 Open your browser and go to: http://localhost:${PORT}\n`);
});
