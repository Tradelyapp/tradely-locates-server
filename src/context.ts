import {IContextData} from "./interfaces/context-data.interface.js";

export class Context {
    public userCache: Record<string, IContextData> = {};

    public store(key: string, value: IContextData): void {
        // Adding timestamp to the stored value
        this.userCache[key] = {...value, timestamp: Date.now()};
    }

    public get(key: string): IContextData | null {
        const ONE_MINUTE = 60 * 1000; // Milliseconds in a minute
        const value = this.userCache[key];

        if (value && (Date.now() - value.timestamp) < ONE_MINUTE) {
            return value;
        } else {
            delete this.userCache[key];
            return null;
        }
    }
}
