import {IMetroCallParameters} from "./metro-call-parameters.interface.js";

export interface IContextData {
    contextForPIN?: IMetroCallParameters;
    contextForShortConfirm?: IMetroCallParameters;
    timestamp: number;
}