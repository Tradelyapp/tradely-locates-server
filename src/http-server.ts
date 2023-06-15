import express, {Request, Response} from 'express';
import MetroClient from "./metro-client.js";

export default class HttpServer {
    app = express();
    metroClient: MetroClient;
    private port: number = 3000;

    constructor(metroClient: MetroClient) {
        this.app.use(express.json());
        this.metroClient = metroClient;
    }

    public startServer(): void {
        // Middleware to log incoming requests
        this.app.use((req, res, next) => {
            console.log(`Received request: ${req.method} ${req.url}`);
            next();
        });

        // Route handler for the buy endpoint
        this.app.get('/buyShorts', async (req: Request, res: Response) => {
            try {
                console.log('BUY request received');
                // Parse the ticker and amount parameters
                const trader: string = req.query.trader as string;
                const ticker: string = req.query.ticker as string;
                const amount: string = req.query.amount as string;

                console.log(`Received buy request: ticker = ${ticker}, amount = ${amount}`);

                console.log('Calling MetroClient - getShort');
                const price = await this.metroClient.getShortsPrice(trader, ticker, amount);

                // Send the price in the response
                res.json(price);
            } catch (error: any) {
                // Check if error message contains 'Can not access Metro'
                if (error.message.includes('not logged in')) {
                    console.error('Error message: 401', error.message);
                    // Not logged in
                    res.status(401).json({error: error.message}); // Send error as JSON
                } else {
                    console.error('Error message: 500');
                    // All logged errors
                    res.status(500).json({error: error.message}); // Send error as JSON
                }
            }
        });

        // Route handler for the buy endpoint
        this.app.get('/confirmShorts', async (req: Request, res: Response) => {
            try {
                console.log('CONFIRM request received');

                console.log('Calling MetroClient - confirmShortsorder');
                const price = await this.metroClient.confirmShortsOrder('JOAN');

                // Send the price in the response
                res.json(price);
            } catch (error) {
                console.error('Error handling confirmation buy request:', error);
                res.status(500).send('Error handling confirmation buy request');
            }
        });


        // Route handler for restart connection endpoint
        this.app.get('/restart', async (req: Request, res: Response) => {
            try {
                console.log('Restart request received');
                res.json(await this.metroClient.handleConnectionWithClientInput2FACode('JOAN'));
            } catch (error) {
                console.error('Error handling buy request:', error);
                res.status(500).send('An error occurred');
            }
        });

        // Route handler for restart connection endpoint
        this.app.post('/pin', async (req: Request, res: Response) => {
            try {
                console.log('PIN request received ' + req.body.pin);
                res.json(await this.metroClient.handleConnectionWithClientInput2FACodeApplyingCode('JOAN', req.body.pin));
            } catch (error: any) {
                console.error('Error handling PIN request:', error);
                res.status(500).json({error: error.message});
            }
        });

        // Route handler for the server status endpoint
        this.app.get('/server', async (req: Request, res: Response) => {
            try {
                console.log('Server status request received');
                res.json(await this.metroClient.getServerStatus());
            } catch (error) {
                console.error('Error handling buy request:', error);
                res.status(500).send('An error occurred');
            }
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
