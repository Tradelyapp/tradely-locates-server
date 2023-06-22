import {IMetroUser} from "./metro-user.interface.js";
import {IQueueReportItem} from "./queue-item.interface.js";

export interface IServerStatus {
    status: string;
    message: string;
    cookies: string[];
    userLoggedIn: boolean;
    officeValue: string;
    users: IMetroUser[];
    requests?: IQueueReportItem[];
}