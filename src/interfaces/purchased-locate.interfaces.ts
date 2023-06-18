export interface IPurchasedLocate {
    ticker: string;
    orders: { price: number, amount: number, date: Date }[];
}