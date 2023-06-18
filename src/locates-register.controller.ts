import {ILocatesRegister} from "./interfaces/locates-register.interface.js";
import {IPurchasedLocate} from "./interfaces/purchased-locate.interfaces.js";

class LocatesRegister implements ILocatesRegister {
    date: Date;
    userMap: Map<string, IPurchasedLocate[]>;

    constructor() {
        this.date = new Date();
        this.userMap = new Map<string, IPurchasedLocate[]>();
    }
}

export class LocatesRegisterController {

    locatesRegister: ILocatesRegister;

    constructor() {
        this.locatesRegister = new LocatesRegister();
    }

    /**
     * Add new purchased locates for a given user and ticker
     * @param user
     * @param ticker
     * @param price
     * @param amount
     * @param date
     */
    addLocate(user: string, ticker: string, price: number, amount: number, date: Date) {
        if (this.locatesRegister && !this.isSameDay(this.locatesRegister.date, date)) {
            this.locatesRegister = new LocatesRegister();
        }

        const userPurchasedLocates = this.locatesRegister.userMap.get(user);

        if (userPurchasedLocates) {
            const existingTicker = userPurchasedLocates.find(loc => loc.ticker === ticker);
            if (existingTicker) {
                existingTicker.orders.push({price, amount, date});
            } else {
                userPurchasedLocates.push({ticker, orders: [{price, amount, date}]});
            }
        } else {
            this.locatesRegister.userMap.set(user, [{ticker, orders: [{price, amount, date}]}]);
        }
    }

    /**
     * Get all purchased locates for a given user
     * @param user
     * @returns {IPurchasedLocate[]}
     */
    getLocates(user: string): IPurchasedLocate[] {
        if (this.locatesRegister && this.isSameDay(this.locatesRegister.date, new Date())) {
            return this.locatesRegister.userMap.get(user);
        } else {
            return null;
        }
    }

    private isSameDay(date1: Date, date2: Date): boolean {
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    }

}