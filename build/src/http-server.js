import express from 'express';
import MetroClient from './metro-client.js';
console.log('http-server');
// Create an Express app
const app = express();
// Initialize the MetroClient asynchronously using a separate function
async function initializeMetroClient() {
    const metroClient = new MetroClient();
    await metroClient.start();
    console.log('Started metroClient');
}
// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    next();
});
// Route handler for the main endpoint
app.get('/', async (req, res) => {
    try {
        res.send('Request handled successfully');
    }
    catch (error) {
        console.error('Error handling request:', error);
        res.status(500).send('An error occurred');
    }
});
// Initialize the MetroClient before starting the server
initializeMetroClient().catch((error) => {
    console.error('Error initializing MetroClient:', error);
});
// Start the server
const port = 3000;
app.listen(port, () => {
    console.log(`Express server listening on portt: ${port}`);
});
//# sourceMappingURL=http-server.js.map