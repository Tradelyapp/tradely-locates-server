import {IMetroCallParameters} from "./metro-call-parameters.interface.js";
import {ITransactionParameters} from "./transaction-parameters.interface.js";

export interface IContextData {
    contextForPIN?: IMetroCallParameters;
    contextForShortConfirm?: IMetroCallParameters;
    transactionParameters?: ITransactionParameters;
    timestamp: number;
}