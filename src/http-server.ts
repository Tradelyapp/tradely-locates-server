import express, {Request, Response} from 'express';
import MetroClient from "./metro-client.js";
import {IShortPrice} from "./interfaces/short-result.interface.js";
import {IQueueItem, IQueueReportItem} from "./interfaces/queue-item.interface.js";
import {IServerStatus} from "./interfaces/server-status.interface.js";

export default class HttpServer {
    app = express();
    metroClient: MetroClient;
    timeoutId: NodeJS.Timeout | null = null;

    /** Time the executed and in pending status is blocking the rest of the requests until it is removed */
    TIMEOUT_DURATION = 25000; // 25 seconds in milliseconds
    /** Queue with all the buy shorts requests */
    requestQueue: Array<IQueueItem> = [];
    lastRequestId: number = 0;

    private port: number = 3000;

    constructor(metroClient: MetroClient) {
        this.app.use(express.json());
        this.metroClient = metroClient;
    }

    public startServer(): void {
        // Middleware to log incoming requests
        this.app.use((req, res, next) => {
            console.log(`#Received request: ${req.method} ${req.url}`);
            next();
        });

        // Function to process the request
        const processBuyRequest = async (req: Request, res: Response, requestId: any) => {
            try {
                console.log(`Processing the request to the queue ${req.query.trader} ${req.query.ticker} ${req.query.amount}`);
                // Parse the ticker and amount parameters
                const trader: string = req.query.trader as string;
                const ticker: string = req.query.ticker as string;
                const amount: string = req.query.amount as string;

                console.log(`Received buy request: ticker = ${ticker}, amount = ${amount}`);

                console.log('Calling MetroClient - getShort');
                const price: IShortPrice = await this.metroClient.getShortsPrice(trader, ticker, amount);

                //  TODO: Testing purposes only to be removed when queuing testing is done
                // let price;
                // await new Promise((resolve) => setTimeout(resolve, 3000)).then(() => {
                //     console.log('INSIDE TIMEOUT handling BUY request');
                //
                //     price = {
                //         totalCost: '100',
                //         pricePerShare: '100'
                //     };
                // });

                console.log('send response proccessBuyRequest');
                res.json({requestId, price});


            } catch (error: any) {
                // Check if error message contains 'Can not access Metro'
                if (error.message.includes('not logged in')) {
                    console.error('Error message: 401', error.message);
                    // Not logged in
                    console.log('send response proccessBuyRequest - status');
                    res.status(401).json({error: error.message}); // Send error as JSON
                } else {
                    console.error('Error message: 500');
                    // All logged errors
                    console.log('send response proccessBuyRequest - status');
                    res.status(500).json({error: error.message}); // Send error as JSON
                }
            } finally {
                // Check if there are pending requests in the queue
                if (this.requestQueue.length > 0) {
                    // Set the timeout for confirmShorts
                    this.timeoutId = setTimeout(() => {
                        console.log('Timeout reached. Processing next buyShorts request.');
                        // Execute the next request in the queue
                        this.manageRequestQueue(requestId);
                    }, this.TIMEOUT_DURATION); // Replace TIMEOUT_DURATION with the desired timeout duration in milliseconds
                }
            }
        };

        // Modify the route to enqueue the requests
        this.app.get('/buyShorts', (req: Request, res: Response) => {
            console.log(`Received buyShorts request: ${req.method} ${req.url}`);
            const requestId = ++this.lastRequestId;
            const trader: string = req.query.trader as string;
            const ticker: string = req.query.ticker as string;
            const amount: string = req.query.amount as string;

            // Enqueue the request
            this.requestQueue.push({
                id: requestId,
                meta: {trader: trader, ticker: ticker, amount: amount},
                request: () => processBuyRequest(req, res, requestId)
            });

            console.log(`#${this.requestQueue.length} Adding the request to the queue ${trader} ${ticker} ${amount}`);

            // Check if it's the only request in the queue
            console.log('Queue length: ' + this.requestQueue.length);
            if (this.requestQueue.length === 1) {
                // Process the request immediately
                const currentRequest = this.requestQueue[0];
                if (currentRequest) {
                    clearTimeout(this.timeoutId); // Clear the timeout if it exists
                    this.timeoutId = null;
                    currentRequest.request();
                }
            }
        });

        /**
         * Confirm the buy request
         */
        this.app.post('/confirmShorts', async (req: Request, res: Response) => {
            const requestId = req.body.requestId as number;
            console.log(`CONFIRM request ${requestId} received`);
            try {
                clearTimeout(this.timeoutId); // Clear the timeout if it exists
                this.timeoutId = null;

                // TODO: Remove after testing
                //  Simulating the delay from this.metroClient.confirmShortsOrder(trader)
                // let price;
                // await new Promise((resolve) => setTimeout(resolve, 5000)).then(() => {
                //     price = {
                //         totalCost: '100',
                //         pricePerShare: '100'
                //     };
                // });\

                const trader: string = req.body.trader as string;
                const price = await this.metroClient.confirmShortsOrder(trader);

                //
                // Send the price in the response
                console.log('send response confirmShorts');
                res.json(price);
            } catch (error) {
                console.error('Error handling confirmation buy request:', error);
                console.log('send response confirmShorts - status');
                res.status(500).send('Error handling confirmation buy request');
            } finally {
                // Remove the current request from the queue and execute the next one
                this.manageRequestQueue(requestId);
            }
        });

        /**
         * Remove the request from the queue, if there are more requests in the queue then execute the next one
         */
        this.app.post('/cancelShorts', async (req: Request, res: Response) => {
            const requestId = req.body.requestId as number;
            console.log(`CANCEL request received ${requestId}`);
            const requestRemovedFromQueue: boolean = this.manageRequestQueue(requestId);
            if (requestRemovedFromQueue) {
                res.send('Shorts order canceled successfully');
            } else {
                console.error('CANCEL Request: requestId not found, maybe removed by timeout');
            }
        });

        // Route handler for restart connection endpoint
        this.app.get('/restart', async (req: Request, res: Response) => {
            try {
                console.log('Restart request received');
                res.json(await this.metroClient.handleConnectionWithClientInput2FACode('JOAN'));
                console.log('Restart request queue');
                this.requestQueue = [];
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
                const queueReport: IQueueReportItem[] = this.getPendingRequests();
                let status: IServerStatus = await this.metroClient.getServerStatus();
                status.requests = queueReport;
                res.json(status);
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

    /**
     * The requests have to be queued because DTTW only supports one request at a time
     * When a request is timed out / cancelled or completed the request will be removed from the queue
     * and the next request, if any, will be executed
     * @param requestId
     * @private
     */

    private manageRequestQueue(requestId: number): boolean {
        // Remove the current request from the queue
        console.log('Removing request with id ', requestId);
        const index = this.requestQueue.findIndex((queuedRequest) => queuedRequest.id === requestId);
        let requestRemovedFromQueue: boolean = false;
        if (index !== -1) {
            this.requestQueue.splice(index, 1);
            requestRemovedFromQueue = true;
        }

        console.log('Request queue ids: ', this.requestQueue.map(requestId => requestId.id));
        // Execute the next request if any
        if (this.requestQueue.length > 0) {
            const nextRequest = this.requestQueue[0];
            if (nextRequest) {
                console.log('Executing NEXT request ' + nextRequest.id);
                nextRequest.request();
            }
        } else {
            console.log('No more requests in the queue.');
        }
        return requestRemovedFromQueue;
    }


    /**
     * Transform the request to format IQueueItem[]
     * @private
     */
    private getPendingRequests(): IQueueReportItem[] {
        return this.requestQueue.map(item => {
            return {
                id: item.id, // convert id to string
                userName: item.meta.trader,
                ticker: item.meta.ticker,
                amount: item.meta.amount
            };
        })
    }
}
