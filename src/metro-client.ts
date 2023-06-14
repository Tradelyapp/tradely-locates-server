import fs from 'fs';
import * as querystring from 'querystring';
import readline from "readline";
import {load} from 'cheerio';
import got from 'got';
import {IShortPrice} from "./interfaces/short-result.interface.js";
import {Context} from "./context.js";
import {IContextData} from "./interfaces/context-data.interface.js";
import {IServerStatus} from "./interfaces/server-status.interface.js";
import {ILoginResultInterface} from "./interfaces/login-result.interface.js";

export default class MetroClient {
    private context: Context;

    private metroUserId: string = '79125005';

    private cookies: string[] = ['has_js=1'];

    // If 2FA is needed
    private authLocation: string = '';

    private readonly email: string = 'annahuix@yahoo.es';
    private readonly pass: string = 'Ve1oWD9r2ZS6ny';

    // Access metro
    private formBuildIdAccessMetro: string = '';
    private formIdAccessMetro: string = '';
    // Login
    private formBuildIdLogin: string = '';
    private formIdLogin: string = '';
    // 2FA: mail
    private formId2FAMail: string = '';
    private formBuildId2FAMail: string = '';


    // TODO: these have to be set at session level
    // Create short request #1
    private formBuildIdShortRequest: string = '';
    private formIdShortRequest: string = '';
    private formTokenShortRequest: string = '';
    // Create short request #2 - Submit office
    private formBuildIdShortOfficeRequest: string = '';
    private formIdShortOfficeRequest: string = '';
    private formTokenShortOfficeRequest: string = '';
    // Create short request #3 - Submit ticker and quantity
    private formBuildIdShortTickerRequest: string = '';
    private formIdShortTickerRequest: string = '';
    private formTokenShortTickerRequest: string = '';
    private acceptValueShortTickerRequest: string = '';
    private quoteSourceShortTickerRequest: string = '';
    private quoteSourceShortTickerValueRequest: string = '';


    // User input readline
    private rl;
    // User logged in indicator
    private userLoggedIn: boolean = false;
    // Office value used to get shorts
    private officeValue: string = '78272187';
    private users: { metro: string, metroForm: string }[] = [];

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
            await this.getIdsForShortRequest();

            console.log('createShortRequestWithOffice');
            await this.createShortRequestWithOffice();

            console.log('createTickerShortRequest');
            const shortPriceResult: IShortPrice = await this.createTickerShortRequest(trader, symbol, quantity);

            this.context.store(trader, {
                formId: this.formIdShortTickerRequest,
                formBuildId: this.formBuildIdShortTickerRequest,
                formToken: this.formTokenShortRequest,
                timestamp: Date.now()
            });

            return shortPriceResult;
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
                // await this.confirmShortsRequest(userContext.formId, userContext.formBuildId, userContext.formToken);
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
            try {
                await this.accessMetroWithTimeout(20000);
            } catch (error) {
                console.error('Error accessing Metro:', error);
                return false; // Return false to indicate failure
            }

            if (this.userLoggedIn) {
                return true; // Return true to indicate success
            }

            await this.accessLogin();

            if (this.authLocation !== '' && !skip2FA) {
                console.log('WILL TRIGGER 2FA by MAIL');
                await this.performTwoFactorAuthenticationByMail(this.authLocation);

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

                const identified = await this.submit2FAPinCode(this.authLocation, pinCode);

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
    public async handleConnectionWithClientInput2FACode(): Promise<ILoginResultInterface> {
        try {
            console.log('Access Metro');

            try {
                await this.accessMetroWithTimeout(20000);
            } catch (error) {
                console.error('Error accessing Metro:', error);
                return {is2FARequired: false, loggedIn: false}; // Return false to indicate failure
            }

            if (this.userLoggedIn) {
                return {is2FARequired: false, loggedIn: true};
            }

            await this.accessLogin();

            if (this.authLocation !== '') {
                console.log('WILL TRIGGER 2FA by MAIL');
                await this.performTwoFactorAuthenticationByMail(this.authLocation);
                return {is2FARequired: true, loggedIn: false};
            }
            return {is2FARequired: false, loggedIn: false};
        } catch (error) {
            console.error('Error performing metro login:', error);
            return {is2FARequired: false, loggedIn: false};
        }
    }

    /**
     * Enters the 2FA PIN code
     * @param pinCode
     */
    public async handleConnectionWithClientInput2FACodeApplyingCode(pinCode: string): Promise<boolean> {
        try {
            const identified = await this.submit2FAPinCode(this.authLocation, pinCode);
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
            let serverStatus: IServerStatus = {
                status: 'ok',
                message: 'Server is running',
                cookies: this.cookies,
                userLoggedIn: this.userLoggedIn,
                officeValue: this.officeValue,
                users: this.users
            };
            return serverStatus;
        } catch (error) {
            console.error('Error getting server status: ', error);
            return {
                status: 'error',
                message: 'Error getting server status',
                cookies: [],
                userLoggedIn: false,
                officeValue: '',
                users: []
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
    private async accessMetroWithTimeout(timeout: number): Promise<void> {
        const accessMetroPromise = this.accessMetro();

        const timeoutPromise = new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                reject(new Error('Access Metro request timed out - Check that the CubeX is connected and a PPro instance is running'));
            }, timeout);
        });

        try {
            await Promise.race([accessMetroPromise, timeoutPromise]);
        } catch (error) {
            console.error('Error at accessMetroWithTimeout:', error);
            throw error;
        }
    }

    /**
     * Access metro - get the formId and set has_js cookie
     */
    private async accessMetro(): Promise<void> {
        try {
            const config: any = {
                headers: {
                    Cookie: this.cookies.join('; '), // Set the cookies in the request
                }
            };

            const response = await got.get('https://metro.dttw.com/metro/', config);
            this.debugMode(response, 'accessMetro');

            if (response.statusCode === 200) {
                // Check if user logged in
                if (this.checkIfLoggedIn(response)) {
                    this.userLoggedIn = true;
                } else {
                    this.userLoggedIn = false;
                    // Get the ids for the login page
                    let responseFormIds: { formId: string; formBuildId: string };
                    responseFormIds = this.extractFormBuildIdFromResponse(response);
                    this.formBuildIdAccessMetro = responseFormIds.formBuildId;
                    this.formIdAccessMetro = responseFormIds.formId;
                }
            }
        } catch (error: any) {
            // Do not want to print the error timeout, there is already a racecondition with accessMetroWithTimeout
            if (error.code != 'ETIMEDOUT') {
                this.handleCallError(error, 'accessMetro');
                throw error;
            }
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
    private async accessLogin(): Promise<void> {
        try {
            const loginData = querystring.stringify({
                name: this.email,
                pass: this.pass,
                form_build_id: this.formBuildIdAccessMetro,
                form_id: this.formIdAccessMetro,
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


            if (response.statusCode === 302) {
                // At this step NO FORM ID is generated when there is the need of 2FA
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildIdLogin = responseFormIds.formBuildId;
                this.formIdLogin = responseFormIds.formId;

                if (response.headers['set-cookie']) {
                    console.log('accessLogin Cookies: ', response.headers['set-cookie']);
                    this.cookies.push(...response.headers['set-cookie']);
                }
                this.authLocation = !!response?.headers?.location ? response?.headers?.location : '';
            } else {
                console.log('Login failed');
            }
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
    private async performTwoFactorAuthenticationByMail(url: string): Promise<void> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    destination: 'node',
                    authentication_type: 'email',
                    op: 'Submit',
                    form_build_id: this.formBuildIdAccessMetro,
                    form_id: 'bpm_two_factor_authentication_form'
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': postData.mimeType,
                Cookie: this.cookies.join('; '), // Set the cookies in the request
                Referer: url,
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post(url, {
                body: formData,
                headers,
                followRedirect: false
            });

            this.debugMode(response, 'performTwoFactorAuthenticationByMail');


            if (response.statusCode === 200) {
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildId2FAMail = responseFormIds.formBuildId;
                this.formId2FAMail = responseFormIds.formId;
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
    private async submit2FAPinCode(url: string, pinCode: string): Promise<boolean> {
        try {
            console.log('SUBMIT PIN is: ', pinCode);
            const postData = {
                formData: {
                    authentication_code: pinCode,
                    op: 'Submit',
                    form_build_id: this.formBuildId2FAMail,
                    form_id: 'bpm_two_factor_authentication_form'
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: this.cookies.join('; '),
                Referer: url,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.post(url, {
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
    private async getIdsForShortRequest(): Promise<void> {
        try {
            const config: any = {
                headers: {
                    Cookie: this.cookies.join('; '), // Set the cookies in the request
                }
            };

            const response = await got.get('https://metro.dttw.com/metro/create-pay-for-short-request', config);

            this.debugMode(response, 'getIdsForShortRequest');

            this.extractErrorOrWarningMessage(response);

            if (response.statusCode === 200) {
                // Get the form id's for to submit of the createRequestWithOfficeId
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildIdShortRequest = responseFormIds.formBuildId;
                this.formIdShortRequest = responseFormIds.formId;
                this.formTokenShortRequest = this.extractFormTokenFromResponse(response);
            }
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
    private async createShortRequestWithOffice(): Promise<void> {
        try {

            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    office_dropdown: this.officeValue,
                    op: 'Apply',
                    form_build_id: this.formBuildIdShortRequest,
                    form_token: this.formTokenShortRequest,
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

            this.extractErrorOrWarningMessage(response);

            if (response.statusCode === 200) {
                // Get the form id's for to submit of the createRequestWithOfficeId
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildIdShortOfficeRequest = responseFormIds.formBuildId;
                this.formIdShortOfficeRequest = responseFormIds.formId;
                this.formTokenShortOfficeRequest = this.extractFormTokenFromResponse(response);
            }
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
    private async createTickerShortRequest(trader: string, ticker: string, quantity: string): Promise<{
        totalCost: string,
        pricePerShare: string
    }> {
        try {
            const postData = {
                'office_dropdown': this.officeValue,
                'trader[]': [this.metroUserId],
                'symbol[]': [ticker],
                'num_of_shares[]': [quantity],
                'op': 'Submit',
                'form_build_id': this.formBuildIdShortOfficeRequest,
                'form_token': this.formTokenShortOfficeRequest,
                'form_id': this.formIdShortOfficeRequest
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

            this.debugMode(response, 'createTickerShortRequest');

            if (response.statusCode === 200) {
                // Get the form id's for submitting the createRequestWithOfficeId
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildIdShortTickerRequest = responseFormIds.formBuildId;
                this.formIdShortTickerRequest = responseFormIds.formId;
                this.formTokenShortTickerRequest = this.extractFormTokenFromResponse(response);
                const responseAcceptAndQuoteSource: {
                    accept: string;
                    quoteSource: string,
                    quoteSourceValue: string
                } = this.extractAcceptAndQuoteSource(response);
                this.acceptValueShortTickerRequest = responseAcceptAndQuoteSource.accept;
                this.quoteSourceShortTickerRequest = responseAcceptAndQuoteSource.quoteSource;
                this.quoteSourceShortTickerValueRequest = responseAcceptAndQuoteSource.quoteSourceValue;
                return this.extractPriceAndTotalCost(response);
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
    private async acceptSelection(): Promise<void> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    accept: '1',
                    quote_source: this.quoteSourceShortTickerRequest,
                    op: 'Submit',
                    form_build_id: 'form-xNTppYa87B759potJn9U-kJQhrn7VwHYuoKW_g1_6bc',
                    form_token: '-qZNk9WN3HfwYthxAfvClcs3lkGVelcnl9wKKi6UnGQ',
                    form_id: 'bpm_pay_for_short_request_form'
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
            this.debugMode(response, 'acceptSelection');
            // Handle the response as needed
        } catch (error) {
            this.handleCallError(error, 'acceptSelection')
            throw error;
        }
    }


    /*************************************************************************************************
     ********************************************* UTILS *********************************************
     *************************************************************************************************/

    private async confirmSelection(): Promise<void> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    confirm: '1',
                    form_build_id: 'form-OFtnDkzcoJkyH2Vn05ngHqFhoDLiPF-Zon0w3WrACKw',
                    form_token: '-qZNk9WN3HfwYthxAfvClcs3lkGVelcnl9wKKi6UnGQ',
                    form_id: 'bpm_pay_for_short_request_form',
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
        } catch (error) {
            this.handleCallError(error, 'confirmSelection');
            throw error;
        }
    }

    /**
     * Parses the html response and extracts the FormId and FormBuildId
     * @param response
     */
    private extractFormBuildIdFromResponse(response: any): { formBuildId: string, formId: string } {
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

        console.log('formBuildId: ', formBuildId);
        console.log('formId: ', formId);

        return {
            formBuildId,
            formId
        };
    }

    /**
     * Extract the form_token of a response
     * @param response
     * @private
     */
    private extractFormTokenFromResponse(response: any): string {
        const $ = load(response.body);
        const formTokenElement = $('input[name="form_token"]');
        let formToken = '';

        if (formTokenElement.length > 0) {
            const val = formTokenElement.val();
            formToken = val ? val.toString() : '';
        }
        return formToken
    }

    /**
     * Extract the accept and qoute_source values for the accept shorts request
     * @param response
     * @private
     */
    private extractAcceptAndQuoteSource(response: any): {
        accept: string,
        quoteSource: string,
        quoteSourceValue: string
    } {
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

        console.log('accept Id:', acceptValue);
        console.log('quoteSource Id:', quoteSource);
        console.log('quoteSource Value:', quoteSourceValue);

        return {accept: acceptValue, quoteSource: quoteSource, quoteSourceValue: quoteSourceValue};
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

