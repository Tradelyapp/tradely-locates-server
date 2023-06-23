import got from 'got';
import {IOpenPosition} from "./interfaces/open-position.interface.js";

export default class DttwClient {
    private url: string;
    private port: string;

    constructor(url: string, port: string) {
        this.url = url;
        this.port = port;
    }

    /**
     * Gets open positions
     * @param trader
     */
    public async getOpenPositions(trader: string): Promise<IOpenPosition[]> {
        try {
            console.log("POSITION for " + trader);

            const response = await got.get(`http://${this.url}:${this.port}/GetOpenPositions`, {
                searchParams: {
                    user: trader
                }
            });

            if (response.statusCode === 200) {
                console.log("POSITION", response.body);
                return JSON.parse(response.body) as IOpenPosition[]; // Assuming the response is in JSON format
            }
        } catch (error: any) {
            throw new Error("Could not get open positions for " + trader + ". Error: " + error.message);
        }
    }

    /**
     * Flattens the open positions of a trader
     * @param trader
     */
    public async flattenTrader(trader: string): Promise<void> {
        try {
            console.log("Flatten for " + trader);

            const response = await got.get(`http://${this.url}:${this.port}/Flatten`, {
                searchParams: {
                    symbol: '*.*', // Flattening all positions for the NQ market as an example
                    trader: trader
                }
            });

            if (response.statusCode === 200) {
                console.log("Flatten response", response.body);
            }
        } catch (error: any) {
            throw new Error("Error at access Metro");
        }
    }
}

