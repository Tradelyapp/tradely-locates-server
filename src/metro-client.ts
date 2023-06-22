import fs from 'fs';
import * as querystring from 'querystring';
import readline from "readline";
import {load} from 'cheerio';
import got from 'got';
import {IShortPrice, IShortPriceWithContext} from "./interfaces/short-result.interface.js";
import {Context} from "./context.js";
import {IContextData} from "./interfaces/context-data.interface.js";
import {IServerStatus} from "./interfaces/server-status.interface.js";
import {ILoginResultInterface} from "./interfaces/login-result.interface.js";
import {IMetroCallParameters, MetroCallParameters} from "./interfaces/metro-call-parameters.interface.js";
import {IMetroUser} from "./interfaces/metro-user.interface.js";
import {LocatesRegisterController} from "./locates-register.controller.js";
import {IPurchasedLocate} from "./interfaces/purchased-locate.interfaces.js";

export default class MetroClient {
    // Sessions cotnext
    private context: Context;

    // Purchased locates registry
    private locatesRegistry: LocatesRegisterController;

    private cookies: string[] = ['has_js=1'];

    // If 2FA is needed
    private authLocation: string = '';

    private readonly email: string = 'annahuix@yahoo.es';
    private readonly pass: string = 'Ve1oWD9r2ZS6ny';

    // User input readline - to enter PIN Code on server startup
    private rl;
    // User logged in indicator
    private userLoggedIn: boolean = false;
    // Office value used to get shorts
    private officeValue: string = '78272187';
    private users: IMetroUser[] = [];

    // Will extract error messages on each request
    private isDebugMode: boolean = true;
    // Will log the HTML response on each request
    private logHTMLResponse: boolean = false;


    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.context = new Context();
        this.locatesRegistry = new LocatesRegisterController();
    }

    /**
     * The start is called on the initialization of the server. It means that it could happen the user has no means
     * to enter the PIN code.
     *
     * Moreover, it cannot alert to the telegram bot to enter the PIN code.
     * /restart should be able to be called and restart the server connection to DTTW properly
     */
    public async start(): Promise<boolean> {
        try {
            this.loadCookies();
            await this.handleConnection(false);
            return true;
        } catch (error) {
            console.error('Error performing metro login:', error);
            return false; // Return false to indicate failure
        }
    }

    /**
     * Gets the short price for a given trader
     * @param trader
     * @param symbol
     * @param quantity
     */
    public async getShortsPrice(trader: string, symbol: string, quantity: string): Promise<IShortPrice> {
        try {
            const connected = await this.handleConnection(true);
            if (!connected) {
                throw new Error(`Can not access Metro`);
            }

            console.log(`Getting shorts for ${trader}: ${symbol} ${quantity} shares`);
            this.officeValue = await this.accessShortsPage();

            console.log('getIdsForShortRequest');
            const metroDataShortRequest: IMetroCallParameters = await this.getIdsForShortRequest();

            console.log('createShortRequestWithOffice');
            const metroDataShortRequestWithOfficeId: IMetroCallParameters = await this.createShortRequestWithOffice(trader, metroDataShortRequest);


            console.log('createTickerShortRequest');
            const metroDataTickerShortRequest: IMetroCallParameters = await this.createTickerShortRequest(symbol, quantity, metroDataShortRequestWithOfficeId);

            console.log('createTickerShortRequest');
            const shortPriceContextResult: IShortPriceWithContext = await this.acceptSelection(metroDataTickerShortRequest);

            // Store the context for the confirmation of the purchase in another request
            this.context.store(trader, {
                contextForShortConfirm: shortPriceContextResult.metroCallParameters,
                timestamp: Date.now()
            });

            const shortPrice: IShortPrice = shortPriceContextResult as IShortPrice;
            return shortPrice;
        } catch (error: any) {
            throw new Error(`Error getting shorts: ${error.message}`);
        }
    }


    /**
     * Gets the short price for a given trader
     * @param trader
     * @param symbol
     * @param quantity
     */
    public async confirmShortsOrder(trader: string): Promise<void> {
        try {
            const userContext: IContextData | null = await this.context.get(trader);
            if (!!userContext) {
                console.log(`Confirm shorts for ${trader}`);
                const isLocatesPurchaseSuccessful: boolean = await this.confirmSelection(trader, userContext.contextForShortConfirm);
            } else {
                console.log(`No context for ${trader}, the confirm shorts request will be skipped`);
            }
        } catch (error) {
            console.error('Error getting shorts');
        }
    }

    /**
     * Checks if the user is logged in by accessing to the metro page, if not connected it can retry the login
     * This is used in shorts request, if not connected and 2FA is required, it will be skipped
     *
     * @param skip2FA
     */
    public async handleConnection(skip2FA: boolean): Promise<boolean> {
        try {
            console.log('Access Metro');
            let accessMetroCallParameters: MetroCallParameters = new MetroCallParameters();
            try {
                accessMetroCallParameters = await this.accessMetroWithTimeout(20000);
            } catch (error) {
                console.error('Error accessing Metro:', error);
                return false; // Return false to indicate failure
            }

            if (this.userLoggedIn) {
                return true; // Return true to indicate success
            }

            const accessLoginCallParameters = await this.accessLogin(accessMetroCallParameters);

            if (accessLoginCallParameters.authLocation !== '' && !skip2FA) {
                console.log('WILL TRIGGER 2FA by MAIL');
                const email2FAMetroCallParameters = await this.performTwoFactorAuthenticationByMail(accessLoginCallParameters);

                // Set timeout for PIN authentication otherwise server will be blocked
                const pinCodePromise = this.promptForPinCode().catch(_ => '');
                const timeoutPromise = new Promise<string>((_, reject) => setTimeout(() => reject('Timeout Error'), 25000)); // 25 seconds
                let pinCode;
                try {
                    pinCode = await Promise.race([pinCodePromise, timeoutPromise]);
                } catch (error: any) {
                    console.log('Timeout PIN Input:', error.message);
                    return false;
                }

                const identified = await this.submit2FAPinCode(accessLoginCallParameters, pinCode);

                if (identified) {
                    return true; // Return true to indicate success
                }
            } else if (this.authLocation !== '' && skip2FA) {
                throw new Error('Short request: Skipped 2FA, not logged in');
            }
            return false;
        } catch (error: any) {
            throw new Error(`Error performing metro login: ${error.message}`);
        }
    }

    /**
     * Logs in to metro in case the cookies are valid or not needed a 2FA authentication
     * In case Pin code is needed, it will be requested to the user
     *
     * This is used in the /restart command
     */
    public async handleConnectionWithClientInput2FACode(trader: string): Promise<ILoginResultInterface> {
        try {
            console.log('Access Metro');
            let accessMetroCallParameters: MetroCallParameters = new MetroCallParameters();
            try {
                accessMetroCallParameters = await this.accessMetroWithTimeout(20000);
            } catch (error) {
                console.error('Error accessing Metro:', error);
                return {is2FARequired: false, loggedIn: false}; // Return false to indicate failure
            }

            if (this.userLoggedIn) {
                return {is2FARequired: false, loggedIn: true};
            }

            const accessLoginCallParameters = await this.accessLogin(accessMetroCallParameters);

            console.log('Restart authLocation: ' + this.authLocation);
            console.log('Restart accessLoginCallParameters authLocation: ' + accessLoginCallParameters.authLocation);
            if (accessLoginCallParameters.authLocation !== '') {
                console.log('WILL TRIGGER 2FA by MAIL');
                await this.performTwoFactorAuthenticationByMail(accessLoginCallParameters);
                // Store the context for the 2FA Mail to enter the PIN later on another request
                this.context.store(trader, {
                    contextForPIN: accessLoginCallParameters,
                    timestamp: Date.now()
                });

                return {is2FARequired: true, loggedIn: false};
            }
            return {is2FARequired: false, loggedIn: false};
        } catch (error) {
            console.error('Error performing metro login:', error);
            return {is2FARequired: false, loggedIn: false};
        }
    }

    /**
     * Enters the 2FA PIN code - need to get from session the MetroCallParameters ( Metro context )
     * @param pinCode
     */
    public async handleConnectionWithClientInput2FACodeApplyingCode(trader: string, pinCode: string): Promise<boolean> {
        try {
            let traderContext: IContextData = this.context.get(trader)

            // Don't perform the call if there is no context, otherwise the login PIN call will fail for missing formId,token...
            if (!traderContext) {
                throw new Error(`No context for ${trader}`);
            }
            const identified = await this.submit2FAPinCode(traderContext.contextForPIN, pinCode);
            if (identified) {
                console.log('Identified - going to locates page');
                return true;
            }
            return false;
        } catch (error: any) {
            console.error('Error performing metro login:', error);
            throw new Error(`Error 2FA PIN:${error.message}`);
        }
    }

    public async getServerStatus(): Promise<IServerStatus> {
        try {
            // To know if the CubeX is available and if Metro is available and logged in
            await this.accessMetroWithTimeout(20000);
            return {
                status: 'ok',
                message: 'Server is running',
                cookies: this.cookies,
                userLoggedIn: this.userLoggedIn,
                officeValue: this.officeValue,
                users: this.users
            };
        } catch (error: any) {
            return {
                status: 'error',
                message: 'Error getting Metro connection status ' + error.message,
                cookies: this.cookies,
                userLoggedIn: this.userLoggedIn,
                officeValue: this.officeValue,
                users: this.users
            };
        }
    }


    /**
     * Initialize office config
     */
    public async initializeOfficeConfig(): Promise<boolean> {
        this.officeValue = await this.accessShortsPage();
        this.users = await this.accessTradersPage();
        return true;
    }

    /**
     * Returns a list of purchased locates
     */
    public async getPurchasedLocates(trader: string): Promise<IPurchasedLocate[]> {
        return this.locatesRegistry.getLocates(trader);
    }

    /**
     * Returns a list of purchased locates
     */
    public async getOfficePurchasedLocates(): Promise<Record<string, IPurchasedLocate[]>> {
        return this.locatesRegistry.getAllLocates();
    }


    /**
     * Ask user in terminal to input the 2FA code
     * @private
     */
    private async promptForPinCode(): Promise<string> {
        return new Promise((resolve, reject) => {
            this.rl.question('Enter the PIN code sent to your email: ', (pinCode) => {
                if (pinCode.length === 6 && /^\d+$/.test(pinCode)) {
                    resolve(pinCode);
                } else {
                    console.log('Invalid PIN code. Please enter a 6-digit numeric code.');
                    reject(new Error('Invalid PIN code. Please enter a 6-digit numeric code.'));
                }
            });
        });
    }

    /**
     * Timeout accessMetro - Check possible PPro8/network issues
     * @param timeout
     * @private
     */
    private async accessMetroWithTimeout(timeout: number): Promise<IMetroCallParameters> {
        const accessMetroPromise = this.accessMetro();

        const timeoutPromise = new Promise<IMetroCallParameters>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Access Metro request timed out - Check that the CubeX is connected and a PPro instance is running'));
            }, timeout);
        });
        return await Promise.race([accessMetroPromise, timeoutPromise]);
    }

    /**
     * Access metro - get the formId and set has_js cookie
     */
    private async accessMetro(): Promise<IMetroCallParameters> {
        try {
            const config: any = {
                headers: {
                    Cookie: this.cookies.join('; '), // Set the cookies in the request
                }
            };

            const response = await got.get('https://metro.dttw.com/metro/', config);
            this.debugMode(response, 'accessMetro');

            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();

            if (response.statusCode === 200) {
                // Check if user logged in
                if (this.checkIfLoggedIn(response)) {
                    this.userLoggedIn = true;
                } else {
                    this.userLoggedIn = false;
                    // Get the ids for the login page
                    this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);
                }
            }
            return outputMetroCallParameters;
        } catch (error: any) {
            // Do not want to print the error timeout, there is already a race condition with accessMetroWithTimeout
            if (error.code != 'ETIMEDOUT') {
                this.handleCallError(error, 'accessMetro');
                throw error;
            }
            throw new Error("Error at access Metro");
        }
    }

    /**
     * Enter input log in mail and password - retrieves the cookie ( session ) in future requests the MetroTrustBrowser cookie is retrieved
     * In this step if the Location response header parameter is present, means a two-factor authentication is needed. This parameter
     * contains the POST url for the 2FA action
     *
     * @param formBuildId - from first access to metro page - used on all requests
     * @param formId - from first access to metro page - used on all requests
     */
    private async accessLogin(metroCallParameters: IMetroCallParameters): Promise<IMetroCallParameters> {
        try {
            const loginData = querystring.stringify({
                name: this.email,
                pass: this.pass,
                form_build_id: metroCallParameters.formBuildId,
                form_id: metroCallParameters.formId,
                op: 'Log in'
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: 'has_js=1', // Set the "has_js" cookie
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post('https://metro.dttw.com/metro/node?destination=node', {
                body: loginData,
                headers,
                followRedirect: false,
            });
            this.debugMode(response, 'accessLogin');

            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();

            if (response.statusCode === 302) {
                // At this step NO FORM ID is generated when there is the need of 2FA
                this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);

                if (response.headers['set-cookie']) {
                    console.log('accessLogin Cookies: ', response.headers['set-cookie']);
                    this.cookies.push(...response.headers['set-cookie']);
                }
                outputMetroCallParameters.authLocation = !!response?.headers?.location ? response?.headers?.location : '';
            } else {
                console.log('Login failed');
            }
            return outputMetroCallParameters;
        } catch (error) {
            this.handleCallError(error, 'accessLogin');
            throw error;
        }
    }

    /**
     * 2FA can be done by mail or sms, by default is done by mail
     * @param url
     * @param cookies
     * @param formBuildId
     */
    private async performTwoFactorAuthenticationByMail(metroCallParameters: IMetroCallParameters): Promise<void> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    destination: 'node',
                    authentication_type: 'email',
                    op: 'Submit',
                    form_build_id: metroCallParameters.formBuildId,
                    form_id: 'bpm_two_factor_authentication_form'
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': postData.mimeType,
                Cookie: this.cookies.join('; '), // Set the cookies in the request
                Referer: metroCallParameters.authLocation,
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post(metroCallParameters.authLocation, {
                body: formData,
                headers,
                followRedirect: false
            });

            this.debugMode(response, 'performTwoFactorAuthenticationByMail');


            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();
            if (response.statusCode === 200) {
                this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);
            }
        } catch (error) {
            this.handleCallError(error, 'performTwoFactorAuthenticationByMail');
        }
    }

    /**
     * Submit the pinCode, location url same as the previous call
     * @param url
     * @param cookies
     * @param formBuildId
     * @param pinCode
     */
    private async submit2FAPinCode(metroCallParameters: IMetroCallParameters, pinCode: string): Promise<boolean> {
        try {
            console.log('SUBMIT PIN is: ', pinCode);
            const postData = {
                formData: {
                    authentication_code: pinCode,
                    op: 'Submit',
                    form_build_id: metroCallParameters.formBuildId,
                    form_id: 'bpm_two_factor_authentication_form'
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: this.cookies.join('; '),
                Referer: metroCallParameters.authLocation,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post(metroCallParameters.authLocation, {
                method: 'POST',
                headers,
                body: formData,
                followRedirect: false
            });
            this.debugMode(response, 'submit2FAPinCode');

            if (response.statusCode === 302) {
                const setCookie = response.headers['set-cookie'];
                console.log('submit2FAPinCode Cookies: ', setCookie);
                if (setCookie) {
                    // Set the MetroTrustBrowser Cookie
                    this.cookies = []; // Remove the cookie from AccessMetro is a different one now
                    for (const cookie of setCookie) {
                        if (!this.cookies.includes(cookie)) {
                            this.cookies.push(cookie);
                        }
                    }
                }
                this.storeCookies(); // Store the updated cookies to the file
                return true;
            }
            return false;
        } catch (error: any) {
            this.handleCallError(error, 'submit2FAPinCode');
            return false;
        }
    }

    /**
     * Access the short page and gets the office Id
     * @private
     */
    private async accessShortsPage(): Promise<any> {
        try {
            const headers = {
                Cookie: this.cookies.join('; '), // Set the received cookies in the request header
                Referer: 'https://metro.dttw.com/metro/pay-for-short-requested',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.get('https://metro.dttw.com/metro/pay-for-short-requested', {
                headers,
            });

            this.debugMode(response, 'accessShortsPage');

            const responseData = response.body;
            const $ = load(responseData);
            const officeValueElement = $('select[name="field_enhanced_payforshort_offic_nid"] option').not('[value="All"]');
            let officeValue: string = '';

            if (officeValueElement.length > 0) {
                const val = officeValueElement.val();
                officeValue = val ? val.toString() : '';
            }

            console.log('officeValue:', officeValue);
            return officeValue;
        } catch (error) {
            this.handleCallError(error, 'accessShortsPage');
            throw error;
        }
    }

    private async accessTradersPage(): Promise<any> {
        try {
            const headers = {
                Cookie: this.cookies.join('; '), // Set the received cookies in the request header
                Referer: 'https://metro.dttw.com/metro/pay-for-short-requested',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.get('https://metro.dttw.com/metro/create-pay-for-short-request\n', {
                headers,
            });

            this.debugMode(response, 'accessTradersPage');

            const responseData = response.body;
            const $ = load(responseData);
            const officeValueElement = $('select[name="field_enhanced_payforshort_offic_nid"] option').not('[value="All"]');
            let officeValue: string = '';

            this.extractErrorOrWarningMessage(response);

            if (officeValueElement.length > 0) {
                const val = officeValueElement.val();
                officeValue = val ? val.toString() : '';
            }

            console.log('officeValue:', officeValue);
            return officeValue;
        } catch (error) {
            this.handleCallError(error, 'accessTradersPage');
            throw error;
        }
    }

    /**
     * #1 call for the short request process
     * Gets the short request form id's
     * @private
     */
    private async getIdsForShortRequest(): Promise<IMetroCallParameters> {
        try {
            const config: any = {
                headers: {
                    Cookie: this.cookies.join('; '), // Set the cookies in the request
                }
            };

            const response = await got.get('https://metro.dttw.com/metro/create-pay-for-short-request', config);

            this.debugMode(response, 'getIdsForShortRequest');

            this.extractErrorOrWarningMessage(response);

            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();

            if (response.statusCode === 200) {
                // Get the form id's for to submit of the createRequestWithOfficeId
                this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);
                this.extractFormTokenFromResponse(response, outputMetroCallParameters);
            }
            return outputMetroCallParameters;
        } catch (error) {
            this.handleCallError(error, 'getIdsForShortRequest');
            throw error;
        }
    }

    /**
     * #2 call for the short request process
     * Submits the office id, the aim is to get a form ids for the shorts request
     * @private
     */
    private async createShortRequestWithOffice(trader: string, metroCallParameters: IMetroCallParameters): Promise<IMetroCallParameters> {
        try {

            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    office_dropdown: this.officeValue,
                    op: 'Apply',
                    form_build_id: metroCallParameters.formBuildId,
                    form_token: metroCallParameters.formToken,
                    form_id: 'bpm_pay_for_short_request_form'
                }
            };

            const headers = {
                'Content-Type': postData.mimeType,
                Cookie: this.cookies.join('; '),
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const formData = querystring.stringify(postData.formData);

            const response = await got.post('https://metro.dttw.com/metro/create-pay-for-short-request', {
                body: formData,
                headers
            });

            this.debugMode(response, 'createShortRequestWithOffice');

            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();

            this.extractErrorOrWarningMessage(response);

            if (response.statusCode === 200) {
                // Get the form id's for to submit of the createRequestWithOfficeId
                this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);
                this.extractFormTokenFromResponse(response, outputMetroCallParameters);

                this.users = this.extractUsersNameAndId(response);
                const traderId = this.users.find((t) => t.name === trader);
                if (!traderId) {
                    throw new Error('No trader found with name: ' + trader);
                } else {
                    outputMetroCallParameters.traderId = traderId.id;
                }
            }
            return outputMetroCallParameters;
        } catch (error) {
            this.handleCallError(error, 'createShortRequestWithOffice');
            throw error;
        }
    }

    /**
     * #3 call for the short request process
     * Submits the ticker and number of shares
     * Sets ids (formId, formBuilderId, formToken, acceptValue and quoteSource)
     * @private
     */
    private async createTickerShortRequest(ticker: string, quantity: string, metroCallParameters: IMetroCallParameters): Promise<IMetroCallParameters> {
        try {
            const postData = {
                'office_dropdown': this.officeValue,
                'trader[]': [metroCallParameters.traderId],
                'symbol[]': [ticker],
                'num_of_shares[]': [quantity],
                'op': 'Submit',
                'form_build_id': metroCallParameters.formBuildId,
                'form_token': metroCallParameters.formToken,
                'form_id': metroCallParameters.formId
            };

            const formData = querystring.stringify(postData);

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: this.cookies.join('; '),
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post('https://metro.dttw.com/metro/create-pay-for-short-request', {
                body: formData,
                headers
            });

            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();
            this.debugMode(response, 'createTickerShortRequest');

            if (response.statusCode === 200) {
                // Get the form id's for submitting the createRequestWithOfficeId
                this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);
                this.extractFormTokenFromResponse(response, outputMetroCallParameters);
                this.extractAcceptAndQuoteSource(response, outputMetroCallParameters);

                return outputMetroCallParameters;
            }
            throw new Error('Was not possible to get the locates pricing');
        } catch (error) {
            this.handleCallError(error, 'createTickerShortRequest');
            throw error;
        }
    }

    /**
     * #4 call for the short request process - it will trigger the countdown
     * @private
     */
    private async acceptSelection(metroCallParameters: IMetroCallParameters): Promise<IShortPriceWithContext> {
        try {
            const acceptAttributeName = `accept[${metroCallParameters.quoteSource}]`;
            const quoteSourceAttributeName = `quote_source[${metroCallParameters.quoteSource}]`;

            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    [acceptAttributeName]: '1',
                    [quoteSourceAttributeName]: metroCallParameters.quoteSourceValue,
                    op: 'Submit',
                    form_build_id: metroCallParameters.formBuildId,
                    form_token: metroCallParameters.formToken,
                    form_id: metroCallParameters.formId
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': postData.mimeType,
                Cookie: this.cookies.join('; '),
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post('https://metro.dttw.com/metro/create-pay-for-short-request', {
                body: formData,
                headers
            });

            let outputMetroCallParameters: IMetroCallParameters = new MetroCallParameters();
            this.debugMode(response, 'createTickerShortRequest');

            if (response.statusCode === 200) {
                const priceAndTotalCost: {
                    totalCost: string,
                    pricePerShare: string
                } = this.extractPriceAndTotalCost(response);

                // Get the form id's for submitting the createRequestWithOfficeId
                this.extractFormBuildIdFromResponse(response, outputMetroCallParameters);
                ;
                this.extractFormTokenFromResponse(response, outputMetroCallParameters);
                this.extractAcceptAndQuoteSource(response, outputMetroCallParameters);

                return {
                    totalCost: priceAndTotalCost.totalCost,
                    pricePerShare: priceAndTotalCost.pricePerShare,
                    metroCallParameters: outputMetroCallParameters
                } as IShortPriceWithContext;
            }

            this.debugMode(response, 'acceptSelection');
            // Handle the response as needed
        } catch (error) {
            this.handleCallError(error, 'acceptSelection')
            throw error;
        }
    }


    private async confirmSelection(trader: string, metroCallParameters: IMetroCallParameters): Promise<boolean> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    confirm: '1',
                    form_build_id: metroCallParameters.formBuildId,
                    form_token: metroCallParameters.formToken,
                    form_id: metroCallParameters.formId,
                    op: 'Confirm'
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': postData.mimeType,
                Cookie: this.cookies.join('; '),
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post('https://metro.dttw.com/metro/create-pay-for-short-request', {
                body: formData,
                headers
            });

            this.debugMode(response, 'confirmSelection');
            // Handle the response as needed
            if (response.statusCode === 200) {
                const confirmPurchaseStatus: boolean = this.extractConfirmPurchaseStatus(response);
                if (confirmPurchaseStatus) {
                    // Add purchase to registry
                    const ticker = 'AMD.NY';
                    const price = 10;
                    const amount = 100;
                    this.locatesRegistry.addLocate(trader, ticker, price, amount, new Date());
                }

                return confirmPurchaseStatus;
            }
            return false;
        } catch (error) {
            this.handleCallError(error, 'confirmSelection');
            throw error;
        }
    }

    /*************************************************************************************************
     ********************************************* UTILS *********************************************
     *************************************************************************************************/

    /**
     * Parses the html response and extracts the FormId and FormBuildId
     * @param response
     */
    private extractFormBuildIdFromResponse(response: any, metroCallParameters: IMetroCallParameters): void {
        const $ = load(response.body);
        const formBuildIdElement = $('input[name="form_build_id"]');
        const formIdElement = $('input[name="form_id"]');
        let formBuildId = '';
        let formId = '';

        if (formBuildIdElement.length > 0) {
            const val = formBuildIdElement.val();
            formBuildId = val ? val.toString() : '';
        }

        if (formIdElement.length > 0) {
            const val = formIdElement.val();
            formId = val ? val.toString() : '';
        }
        metroCallParameters.formBuildId = formBuildId;
        metroCallParameters.formId = formId;
    }

    /**
     * Extract the form_token of a response
     * @param response
     * @private
     */
    private extractFormTokenFromResponse(response: any, metroCallParameters: IMetroCallParameters): void {
        const $ = load(response.body);
        const formTokenElement = $('input[name="form_token"]');
        let formToken = '';

        if (formTokenElement.length > 0) {
            const val = formTokenElement.val();
            formToken = val ? val.toString() : '';
        }
        metroCallParameters.formToken = formToken;
    }

    /**
     * Extract the accept and qoute_source values for the accept shorts request
     * @param response
     * @private
     */
    private extractAcceptAndQuoteSource(response: any, metroCallParameters: IMetroCallParameters): void {
        const $ = load(response.body);

        let acceptValue = '';
        let quoteSource = '';
        let quoteSourceValue = '';

        $('input[name^="quote_source["]').each(function (i, elem) {
            let name = $(elem).attr('name');
            if (name) { // Guard clause
                quoteSource = name.split('[')[1].split(']')[0];
                quoteSourceValue = $(elem).attr('value') || '';
            }
        });

        $('select[name^="accept["]').each(function (i, elem) {
            let name = $(elem).attr('name');
            if (name) { // Guard clause
                acceptValue = name.split('[')[1].split(']')[0];
            }
        });
        metroCallParameters.accept = acceptValue;
        metroCallParameters.quoteSource = quoteSource;
        metroCallParameters.quoteSourceValue = quoteSourceValue;
    }

    /**
     * Extract the accept and qoute_source values for the accept shorts request
     * @param response
     * @private
     */
    private extractConfirmPurchaseStatus(response: any): boolean {
        const $ = load(response.body);
        let acceptedValue = false;

        $('table.sticky-enabled tbody tr').each(function (i, elem) {
            const status = $(this).find('td').eq(10).text().trim(); // Index is 0-based

            if (status === 'Accepted') {
                acceptedValue = true;
                return false; // Exit the loop once the Accepted value is found
            }
        });

        return acceptedValue;
    }

    /**
     * Extract the total cost (7 row in table)
     * @param response
     * @private
     */
    private extractPriceAndTotalCost(response: any): { totalCost: string, pricePerShare: string } {
        let totalCost = '';
        let pricePerShare: string = '';
        const $ = load(response.body);
        $('table.sticky-enabled tbody tr').each(function (i, elem) {
            totalCost = $(this).find('td').eq(6).text(); // index is 0-based
            pricePerShare = $(this).find('td').eq(5).text(); // index is 0-based
        });
        console.log('Total Cost:', totalCost);
        console.log('Price per share:', pricePerShare);
        return {totalCost, pricePerShare};
    }

    private extractUsersNameAndId(response: any): IMetroUser[] {

        const $ = load(response.body);
        const users: IMetroUser[] = [];

        const options = $('select[name="trader[]"] option');

        options.map(function (i, elem) {
            const selectedValue = $(this).val().toString();

            if (selectedValue !== '_none') {
                const name = $(this).text().split(' - ')[0];
                const id = selectedValue;
                users.push({name, id});
            }
        });

        console.log('users:', users);
        return users;
    }

    /**
     * Store cookies in file system
     * @private
     */
    private storeCookies(): void {
        const cookiesData = JSON.stringify(this.cookies);
        fs.writeFileSync('cookies.json', cookiesData);
    }

    /**
     * Load cookies from file system
     * @private
     */
    private loadCookies(): void {
        try {
            const cookiesData = fs.readFileSync('cookies.json', 'utf-8');
            const cookies = JSON.parse(cookiesData);
            if (Array.isArray(cookies)) {
                this.cookies = cookies;
            }
        } catch (error) {
            // Ignore error if the file doesn't exist or there's an issue reading it
        }
    }

    /**
     * Check if user is logged in checking on a class in the body
     * @param response
     * @private
     */
    private checkIfLoggedIn(response: any): boolean {
        const $ = load(response.body);
        const bodyClass = $('body').attr('class');

        if (bodyClass && bodyClass.includes('not-logged-in')) {
            console.log('Not logged in: removing cookies');
            // It is possible that the cookies are expired, so I will erase them\
            this.cookies = ['has_js=1'];
            this.storeCookies();
            return false;
        } else {
            console.log('Logged in');
            return true;
        }
    }

    /**
     * Extract the user and its id from form
     */
    private extractUsersIds(response: any): { traders: { metro: string, metroForm: string }[] } {
        let users: { metro: string, metroForm: string }[] = [];
        const $ = load(response.body);

        $('select[name="office_dropdown"] option[value!="_none"]').each((index, element) => {
            const metro = $(element).text().split(' - ')[0];

            const val = $(element).val();
            const metroForm = val ? val.toString() : '';

            users.push({metro, metroForm});
        });

        const jsonData = {
            "traders": users
        };

        console.log(jsonData);
        return jsonData;
    }

    /**
     * Output of request is an html document - creates the html on disk for debugging purposes
     * @param responseData
     * @param fileName
     * @private
     */
    private handleCallError(error: any, fileName: string): void {
        console.error('Error at ' + fileName + ' HTTP request: ', error.message);
        this.createHTMLContent(error.response, fileName);
        // TODO Check this: this.extractErrorOrWarningMessage(error.responseData.response);
        this.extractErrorOrWarningMessage(error.response);
    }

    /**
     * Output of request is an html document - creates the html on disk for debugging purposes
     * @param responseData
     * @param fileName
     * @private
     */
    private debugMode(response: any, fileName: string): void {
        if (this.isDebugMode) {
            console.error('Debug at ' + fileName);
            this.extractErrorOrWarningMessage(response);
            if (this.logHTMLResponse) {
                this.createHTMLContent(response, fileName);
            }

        }
    }

    private createHTMLContent(response: any, fileName: string): void {
        const directory = './htmlErrorPages';
        const filePath: string = directory + '/' + fileName + '.html';

        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }

        console.log(`HTML content written to file: ${filePath}`);
        fs.writeFileSync(filePath, response.body);
    }

    private extractErrorOrWarningMessage(response: any): string | null {
        const $ = load(response.body);

        const title = $('title').text().trim();
        let accessDenied: string = '';
        if (title.toLowerCase().includes('access denied')) {
            accessDenied = 'Access denied';
            console.log('HTML Access: Denied');
        }

        const errorMessage = $('.messages.error').text().trim();
        if (!!errorMessage) {
            console.log('HTML Error: ', errorMessage);
        }
        const warningMessage = $('.messages.warning').text().trim();
        if (!!warningMessage) {
            console.log('HTML Warning: ', warningMessage);
        }

        if (errorMessage || warningMessage || accessDenied) {
            return `${errorMessage} ${warningMessage} ${accessDenied}`.trim() || null;
        } else {
            return null;
        }
    }


}

