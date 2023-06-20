import express, {Request, Response} from 'express';
import MetroClient from "./metro-client.js";

export default class HttpServer {
    app = express();
    metroClient: MetroClient;
    timeoutId: NodeJS.Timeout | null = null;
    TIMEOUT_DURATION = 15000; // 20 seconds in milliseconds
    requestQueue: Array<() => Promise<void>> = [];

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
        // this.app.get('/buyShorts', async (req: Request, res: Response) => {
        //     try {
        //         console.log('BUY request received');
        //         // Parse the ticker and amount parameters
        //         const trader: string = req.query.trader as string;
        //         const ticker: string = req.query.ticker as string;
        //         const amount: string = req.query.amount as string;
        //
        //         console.log(`Received buy request: ticker = ${ticker}, amount = ${amount}`);
        //
        //         console.log('Calling MetroClient - getShort');
        //         const price: IShortPrice = await this.metroClient.getShortsPrice(trader, ticker, amount);
        //
        //         // Send the price in the response
        //         res.json(price);
        //     } catch (error: any) {
        //         // Check if error message contains 'Can not access Metro'
        //         if (error.message.includes('not logged in')) {
        //             console.error('Error message: 401', error.message);
        //             // Not logged in
        //             res.status(401).json({error: error.message}); // Send error as JSON
        //         } else {
        //             console.error('Error message: 500');
        //             // All logged errors
        //             res.status(500).json({error: error.message}); // Send error as JSON
        //         }
        //     }
        // });


        // Create a queue to store the requests

        // Function to process the request
        const processBuyRequest = async (req: Request, res: Response) => {
            try {
                console.log(`Processing the request to the queue ${req.query.trader} ${req.query.ticker} ${req.query.amount}`);
                // Parse the ticker and amount parameters
                const trader: string = req.query.trader as string;
                const ticker: string = req.query.ticker as string;
                const amount: string = req.query.amount as string;

                console.log(`Received buy request: ticker = ${ticker}, amount = ${amount}`);

                console.log('Calling MetroClient - getShort');
                // const price: IShortPrice = await this.metroClient.getShortsPrice(trader, ticker, amount);

                //  TODO: Change this for real call.
                let price;
                await setTimeout(() => {
                    price = {
                        totalCost: '100',
                        pricePerShare: '100'
                    };
                    console.log('price', price);
                    // Rest of your code here

                    // Send the price in the response
                    console.log('Sending the price in the response');
                    res.json(price);
                }, 5000);

                // Check if there are pending requests in the queue
                if (this.requestQueue.length > 0) {
                    // Set the timeout for confirmShorts
                    this.timeoutId = setTimeout(() => {
                        console.log('Timeout reached. Processing next buyShorts request.');
                        // Execute the next request in the queue
                        this.requestQueue.shift();
                        if (this.requestQueue.length > 0) {
                            const nextRequest = this.requestQueue[0];
                            if (nextRequest) {
                                clearTimeout(this.timeoutId);
                                this.timeoutId = null;
                                nextRequest();
                            }
                        }
                    }, this.TIMEOUT_DURATION); // Replace TIMEOUT_DURATION with the desired timeout duration in milliseconds
                }
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
        };

        // Modify the route to enqueue the requests
        this.app.get('/buyShorts', (req: Request, res: Response) => {
            // Enqueue the request
            this.requestQueue.push(() => processBuyRequest(req, res));
            console.log('Request queue', this.requestQueue);
            console.log(`#${this.requestQueue.length} Adding the request to the queue ${req.query.trader} ${req.query.ticker} ${req.query.amount}`);

            // Check if it's the only request in the queue
            console.log('Queue length: ' + this.requestQueue.length);
            if (this.requestQueue.length === 1) {
                // Process the request immediately
                const currentRequest = this.requestQueue[0];
                if (currentRequest) {
                    clearTimeout(this.timeoutId); // Clear the timeout if it exists
                    this.timeoutId = null;
                    currentRequest();
                }
            }
        });


        // Route handler for the buy endpoint
        this.app.post('/confirmShorts', async (req: Request, res: Response) => {
            try {
                clearTimeout(this.timeoutId); // Clear the timeout if it exists
                this.timeoutId = null;

                const trader: string = req.body.trader as string;

                console.log('CONFIRM request received');

                console.log('Calling MetroClient - confirmShortsorder');
                const price = await this.metroClient.confirmShortsOrder(trader);

                // Send the price in the response
                res.json(price);

                // Remove the accepted request from the queue and process the next request if any
                this.requestQueue.shift();
                if (this.requestQueue.length > 0) {
                    const nextRequest = this.requestQueue[0];
                    if (nextRequest) {
                        nextRequest();
                    }
                }
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
        this.app.get('/status', async (req: Request, res: Response) => {
            try {
                console.log('Server status request received');
                res.json(await this.metroClient.getServerStatus());
            } catch (error) {
                console.error('Error handling buy request:', error);
                res.status(500).send('An error occurred');
            }
        });


        // Route handler for the purchase history
        this.app.get('/cart', async (req: Request, res: Response) => {
            try {
                const trader: string = req.query.trader as string;

                console.log('Purchased locates historic request received for', trader);
                res.json(await this.metroClient.getPurchasedLocates(trader));
            } catch (error) {
                console.error('Error handling purchased locates historic request:', error);
                res.status(500).send('An error occurred');
            }
        });


        // Route handler for the purchase history
        this.app.get('/cartAll', async (req: Request, res: Response) => {
            try {
                const userLocates = await this.metroClient.getOfficePurchasedLocates();
                res.json(userLocates);
            } catch (error) {
                console.error('Error handling purchased locates historic request:', error);
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
