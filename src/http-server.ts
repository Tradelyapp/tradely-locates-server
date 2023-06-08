import express from 'express';


export default class HttpServer {

    app = express();
    private port: number = 3000;

    public startServer(): void {
        // Middleware to log incoming requests
        this.app.use((req, res, next) => {
            console.log(`Received request: ${req.method} ${req.url}`);
            next();
        });

        // Route handler for the main endpoint
        this.app.get('/', async (req, res) => {
            try {
                res.send('Request handled successfully');
            } catch (error) {
                console.error('Error handling request:', error);
                res.status(500).send('An error occurred');
            }
        });

        this.app.listen(this.port, () => {
            console.log(`Express server listening on port: ${this.port}`);
        });

    }
}





