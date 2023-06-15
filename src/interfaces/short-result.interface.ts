import {IMetroCallParameters} from "./metro-call-parameters.interface.js";

export interface IShortPrice {
    totalCost: string,
    pricePerShare: string
}

/**
 * This used at the getShortPrice method where we need the price but also the context for the next call
 */
export interface IShortPriceWithContext extends IShortPrice {
    metroCallParameters: IMetroCallParameters
}