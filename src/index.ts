import MetroClient from './metro-client.js';
import HttpServer from "./http-server.js";
import dotenv from 'dotenv';
import path from "path";

/** The aim of this file is to serve as a launcher, it creates the metroClient, launches the httpServer passing the metroClient
 * reference to make the metro actions
 */



async function initializeMetroClient(): Promise<MetroClient> {
    try {
        console.log('Starting metroClient');
        const metroClient = new MetroClient();
        const started = await metroClient.start();
        if (started) {
            console.log('Started metroClient');
        } else {
            console.log('Failed to start metroClient');
        }
        return metroClient;
    } catch (error) {
        console.log('Error starting metroClient:', error);
        throw error;
    }
}

function launchServer(metroClient: MetroClient): void {
    console.log('Starting server');
    const httpServer: HttpServer = new HttpServer(metroClient);
    httpServer.startServer()
    console.log('Started server');
}

/**
 * Load environment variables
 */
function loadEnvVariables() {
    // Load environment variables
    const envFile =
        process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
    dotenv.config({path: path.resolve(process.cwd(), envFile)});

    const requiredVariables = ['DTTW_URL', 'DTTW_PORT', 'DTTW_MANAGER', 'DTTW_PASS'];
    const missingVariables = [];

    for (const variable of requiredVariables) {
        if (!process.env[variable]) {
            missingVariables.push(variable);
        }
    }

    if (missingVariables.length > 0) {
        throw new Error(`Required environment variables are missing: ${missingVariables.join(', ')}`);
    }
}

// Call the function to load and validate environment variables
loadEnvVariables();

// Initialize the MetroClient
initializeMetroClient()
    .then((metroClient) => {
        // MetroClient initialization completed successfully
        console.log('MetroClient initialization completed successfully');
        // Launch the server
        launchServer(metroClient);
    })
    .catch((error) => {
        // Error occurred during MetroClient initialization
        console.error('Error initializing MetroClient:', error);
    });

