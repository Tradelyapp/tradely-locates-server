export interface IQueueItem {
    id: number;
    meta: {
        trader: string;
        ticker: string;
        amount: string;
    };
    request: () => Promise<void>;
}

/**
 * This interface is used to provide a useful view of the queue when requesting the server status
 */
export interface IQueueReportItem {
    id: number;
    userName: string; //DTTW user name
    ticker: string;
    amount: string;
}
