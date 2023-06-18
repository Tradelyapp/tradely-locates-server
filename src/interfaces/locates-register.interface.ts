import {IPurchasedLocate} from "./purchased-locate.interfaces.js";

export interface ILocatesRegister {
    date: Date;
    userMap: Map<string, IPurchasedLocate[]>;

}