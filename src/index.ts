import MetroClient from './metro-client.js';
import HttpServer from "./http-server.js";

/** The aim of this file is to serve as a launcher, it creates the metroClient, launches the httpServer passing the metroClient
 * reference to make the metro actions
 */


async function initializeMetroClient(): Promise<MetroClient> {
    console.log('Starting metroClient');
    const metroClient = new MetroClient();
    const started = await metroClient.start();
    if (started) {
        console.log('Started metroClient');
    } else {
        console.log('Failed to start metroClient');
    }
    return metroClient;
}

function launchServer(metroClient: MetroClient) {
    console.log('Starting server');
    const httpServer: HttpServer = new HttpServer(metroClient);
    httpServer.startServer()
    console.log('Started server');
}

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

