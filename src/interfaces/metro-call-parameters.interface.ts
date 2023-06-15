/**
 * This interface/class implements all the attributes that the Metro Calls might need along the process to buy locates
 */
export interface IMetroCallParameters {
    formBuildId: string;
    formId: string;
    formToken: string;
    authLocation: string;
    accept: string;
    quoteSource: string;
    quoteSourceValue: string;
}

export class MetroCallParameters implements IMetroCallParameters {
    formBuildId: string = '';
    formId: string = '';
    formToken: string = '';
    authLocation: string = '';
    accept: string = '';
    quoteSource: string = '';
    quoteSourceValue: string = '';

    constructor(formBuildId?: string, formId?: string, formToken?: string, authLocation?: string, accept?: string, quoteSource?: string, quoteSourceValue?: string) {
        if (formBuildId) this.formBuildId = formBuildId;
        if (formId) this.formId = formId;
        if (formToken) this.formToken = formToken;
        if (authLocation) this.authLocation = authLocation;
        if (accept) this.accept = accept;
        if (quoteSource) this.quoteSource = quoteSource;
        if (quoteSourceValue) this.quoteSourceValue = quoteSourceValue;
    }

}