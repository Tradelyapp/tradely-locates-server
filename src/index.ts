import MetroClient from './metro-client.js';
import express from "express";

const app = express();
const port: number = 3000;

async function initializeMetroClient() {
    console.log('Starting metroClient');
    const metroClient = new MetroClient();
    const started = await metroClient.start();
    if (started) {
        console.log('Started metroClient');
    } else {
        console.log('Failed to start metroClient');
    }
}

function startServer(): void {
    // Middleware to log incoming requests
    app.use((req, res, next) => {
        console.log(`Received request: ${req.method} ${req.url}`);
        next();
    });

    // Route handler for the main endpoint
    app.get('/', async (req, res) => {
        try {
            res.send('Request handled successfully');
        } catch (error) {
            console.error('Error handling request:', error);
            res.status(500).send('An error occurred');
        }
    });

    app.listen(port, () => {
        console.log(`Express server listening on port: ${port}`);
    });
}

function launchServer() {
    console.log('Starting server');
    startServer();
    console.log('Started server');
}

// Initialize the MetroClient
initializeMetroClient()
    .then(() => {
        // MetroClient initialization completed successfully
        console.log('MetroClient initialization completed successfully');
        // Launch the server
        launchServer();
    })
    .catch((error) => {
        // Error occurred during MetroClient initialization
        console.error('Error initializing MetroClient:', error);
    });

