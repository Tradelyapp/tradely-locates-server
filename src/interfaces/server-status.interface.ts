import {IMetroUser} from "./metro-user.interface.js";
import {IQueueReportItem} from "./queue-item.interface.js";

export interface IServerStatus {
    startTime?: string;
    status: string;
    message: string;
    cookies: string[];
    oldCookies?: string[];
    userLoggedIn: boolean;
    officeValue: string;
    users: IMetroUser[];
    requests?: IQueueReportItem[];
    stats?: IStats;
}

export interface IStats {
    totalShortPriceRequests: number;
    totalAcceptedShortRequests: number;
    shortPriceRequests: number;
    acceptedShortRequests: number;
}