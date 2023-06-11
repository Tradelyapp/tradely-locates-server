import fs from 'fs';
import * as querystring from 'querystring';
import readline from "readline";
import {load} from 'cheerio';
import got from 'got';

export default class MetroClient {
    private metroUserId: string = '79125005';

    private cookies: string[] = ['has_js=1'];

    private authLocation: string = '';

    private readonly email: string = 'annahuix@yahoo.es';
    private readonly pass: string = 'Ve1oWD9r2ZS6ny';

    // private readonly email: string = 'okoxxx@gmail.com';
    // private readonly pass: string = '5bLcEQ13YpFj7i';

    // Access metro
    private formBuildIdAccessMetro: string = '';
    private formIdAccessMetro: string = '';
    // Login
    private formBuildIdLogin: string = '';
    private formIdLogin: string = '';
    // 2FA: mail
    private formId2FAMail: string = '';
    private formBuildId2FAMail: string = '';
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

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    public async start(): Promise<boolean> {
        try {
            this.loadCookies();
            console.log('Load cookies: ' + this.cookies);
            console.log('Access Metro');
            try {
                await this.accessMetroWithTimeout(30000);
            } catch (error) {
                console.error('Error accessing Metro:', error);
                return false; // Return false to indicate failure
            }

            if (this.userLoggedIn) {
                console.log('Logged in using cookies');
                console.log('returning true start');
                return true; // Return true to indicate success
            }

            console.log('Access Login');
            await this.accessLogin();

            if (this.authLocation !== '') {
                console.log('WILL TRIGGER 2FA by MAIL');
                await this.performTwoFactorAuthenticationByMail(this.authLocation);
                const pinCode = await this.promptForPinCode();
                const identified = await this.submit2FAPinCode(this.authLocation, pinCode);
                if (identified) {
                    console.log('Identified - going to locates page');
                    // await this.accessShortsPage();
                    console.log('returning true start');
                    return true; // Return true to indicate success
                }
            }

            console.log('returning false start');
            return false; // Return false to indicate failure
        } catch (error) {
            console.error('Error performing metro login:', error);
            console.log('returning false start');
            return false; // Return false to indicate failure
        }
    }

    public async getShortPrice(trader: string, symbol: string, quantity: string): Promise<string> {
        try {
            return '2.37';
            console.log(`Getting shorts for ${trader}: ${symbol} ${quantity} shares`);
            this.officeValue = await this.accessShortsPage();
            // TODO: Initialize step
            // await this.accessTradersPage();
            console.log('getIdsForShortRequest');
            await this.getIdsForShortRequest();
            console.log('createShortRequestWithOffice');
            await this.createShortRequestWithOffice();
            console.log('createTickerShortRequest');
            return await this.createTickerShortRequest(trader, symbol, quantity);
        } catch (error) {
            console.error('Error getting shorts');
            return '';
        }
    }

    public async restartConnection(): Promise<boolean> {
        try {
            return true;
        } catch (error) {
            console.error('Error restarting connection');
            return false;
        }
    }

    public async getServerStatus(): Promise<any> {
        try {
            let serverStatus: any = {};
            serverStatus.status = 'ok';
            serverStatus.message = 'Server is running';
            serverStatus.cookies = this.cookies;
            serverStatus.userLoggedIn = this.userLoggedIn;
            serverStatus.officeValue = this.officeValue;
            serverStatus.users = this.users
            return serverStatus;
        } catch (error) {
            console.error('Error getting server status');
            return {};
        }
    }

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
            // Handle the error as needed
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

            if (response.statusCode === 200) {
                // Check if user logged in
                if (this.checkIfLoggedIn(response)) {
                    this.userLoggedIn = true;
                } else {
                    this.userLoggedIn = false;
                    let responseFormIds: { formId: string; formBuildId: string };
                    responseFormIds = this.extractFormBuildIdFromResponse(response);
                    this.formBuildIdAccessMetro = responseFormIds.formBuildId;
                    this.formIdAccessMetro = responseFormIds.formId;
                }
            }
        } catch (error: any) {
            // Do not want to print the error timeout, there is already a racecondition with accessMetroWithTimeout
            if (error.code != 'ETIMEDOUT') {
                console.error('Error at accessMetro HTTP request: ', error);
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
            console.error('Error at accessLogin HTTP Request: ', error);
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

            if (response.statusCode === 200) {
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildId2FAMail = responseFormIds.formBuildId;
                this.formId2FAMail = responseFormIds.formId;
            }
        } catch (error) {
            console.error('Error at performTwoFactorAuthenticationByMail HTTP request:', error);
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
            console.error('Error at submit2FAPinCode HTTP request:', error);
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
            console.error('Error at accessShortsPage HTTP request:', error);
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
            console.error('Error at accessShortsPage HTTP request:', error);
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

            if (response.statusCode === 200) {
                // Get the form id's for to submit of the createRequestWithOfficeId
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildIdShortRequest = responseFormIds.formBuildId;
                this.formIdShortRequest = responseFormIds.formId;
                this.formTokenShortRequest = this.extractFormTokenFromResponse(response);
            }

        } catch (error) {
            console.error('Error making HTTP request:', error);
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
                    form_token: this.formIdShortRequest,
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

            if (response.statusCode === 200) {
                // Get the form id's for to submit of the createRequestWithOfficeId
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.extractFormBuildIdFromResponse(response);
                this.formBuildIdShortOfficeRequest = responseFormIds.formBuildId;
                this.formIdShortOfficeRequest = responseFormIds.formId;
                this.formTokenShortOfficeRequest = this.extractFormTokenFromResponse(response);
            }
        } catch (error) {
            console.error('Error making HTTP request:', error);
        }
    }

    /**
     * #3 call for the short request process
     * Submits the ticker and number of shares
     * Sets ids (formId, formBuilderId, formToken, acceptValue and quoteSource)
     * @private
     */
    private async createTickerShortRequest(trader: string, ticker: string, quantity: string): Promise<string> {
        try {
            console.log('HELLO1');

            const postData = {
                'office_dropdown': this.officeValue,
                'trader[]': [this.metroUserId],
                'symbol[]': [ticker],
                'num_of_shares[]': [quantity],
                'op': 'Submit',
                'form_build_id': this.formBuildIdShortRequest,
                'form_token': this.formTokenShortRequest,
                'form_id': this.formIdShortRequest
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

            if (response.statusCode === 200) {
                console.log('HELLO2');
                console.log(response);
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
                const totalCost: string = this.extractTotalCost(response);
                return totalCost;
            }
            return '';
        } catch (error) {
            console.error('Error making HTTP request:', error);
            return '';
        }
    }

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

            // Handle the response as needed
        } catch (error) {
            console.error('Error making HTTP request:', error);
        }
    }

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

            // Handle the response as needed
        } catch (error) {
            console.error('Error making HTTP request:', error);
        }
    }


    /*************************************************************************************************
     ********************************************* UTILS *********************************************
     *************************************************************************************************/

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
    private extractTotalCost(response: any): string {
        let totalCost = '';
        const $ = load(response.body);
        $('table.sticky-enabled tbody tr').each(function (i, elem) {
            totalCost = $(this).find('td').eq(6).text(); // index is 0-based
        });
        console.log('Total Cost:', totalCost);
        return totalCost;
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
     * @param filePath
     * @private
     */
    private createHTMLContent(responseData: string, filePath: string): void {
        const htmlContent = `
      <html>
        <head>
          <title>Metro Response</title>
        </head>
        <body>
          <pre>${responseData}</pre>
        </body>
      </html>
    `;

        fs.writeFileSync(filePath, htmlContent);
        console.log(`HTML content written to file: ${filePath}`);
    }

    /**
     * Initialize office config
     */
    private async initializeOfficeConfig(): Promise<boolean> {
        this.officeValue = await this.accessShortsPage();
        this.users = await this.accessTradersPage();
        return true;
    }
}

