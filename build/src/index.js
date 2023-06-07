import MetroClient from './metro-client.js';
const metroClient = new MetroClient();
metroClient.start().catch((error) => {
    console.error('Error starting MetroClient', error);
});
// import express from 'express';
// console.log('index:  http-server');
// // Create an Express app
// const app = express();
//
// // Middleware to log incoming requests
// app.use((req, res, next) => {
//     console.log(`Received request: ${req.method} ${req.url}`);
//     next();
// });
//
// // Route handler for the main endpoint
// app.get('/', async (req, res) => {
//     try {
//         res.send('Request handled successfully');
//     } catch (error) {
//         console.error('Error handling request:', error);
//         res.status(500).send('An error occurred');
//     }
// });
//
// // Start the server
// const port = 3000;
// app.listen(port, () => {
//     console.log(`Express server listening on port: ${port}`);
// });
//# sourceMappingURL=index.js.map