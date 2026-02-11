require('dotenv').config();
const app = require('./app');

app.main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});