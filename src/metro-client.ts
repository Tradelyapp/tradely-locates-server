import fs from 'fs';
import * as querystring from 'querystring';
import readline from "readline";
import { load } from 'cheerio';
import got from 'got';

export default class MetroClient {
    private cookies: string[]=['has_js=1'];

    private authLocation : string = '';

    // private readonly email: string =  'annahuix@yahoo.es';
    // private readonly pass: string =  'Ve1oWD9r2ZS6ny';

    private readonly email: string =  'okoxxx@gmail.com';
    private readonly pass: string =  '5bLcEQ13YpFj7i';

    // Access metro
    private formBuildIdAccessMetro: string = '';
    private formIdAccessMetro: string = '';

    // Login
    private formBuildIdLogin: string = '';
    private formIdLogin: string = '';

    // 2FA: mail
    private formId2FAMail: string ='';
    private formBuildId2FAMail: string ='';

    // Submit Pin
    private formBuildIdSubmitPin: string ='';
    private formIdSubmitPin: string = '';

    // User input readline
    private rl;
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
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
     * Access metro - get the formId and set has_js cookie
     */
    private async accessMetro(): Promise<void> {
        try {
            const cookie = 'has_js=1; path=/';
            const config: any = {
                headers: {
                    Cookie: cookie
                }
            };

            const response = await got.get('https://metro.dttw.com/metro/', config);

            this.createHTMLContent(response.body, 'response.html');

            if (response.statusCode === 200) {
                let responseFormIds: { formId: string; formBuildId: string };
                responseFormIds = this.getFormBuildIdFromResponse(response);
                this.formBuildIdAccessMetro = responseFormIds.formBuildId;
                this.formIdAccessMetro = responseFormIds.formId;
            }
        } catch (error) {
            console.error('Error at accessMetro HTTP request: ', error);
            throw error;
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
                responseFormIds = this.getFormBuildIdFromResponse(response);
                this.formBuildIdLogin = responseFormIds.formBuildId;
                this.formIdLogin = responseFormIds.formId;

                if (response.headers['set-cookie']) {
                    this.cookies.push(...response.headers['set-cookie']);
                }
                this.authLocation = !!response?.headers?.location? response?.headers?.location :'';
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
                responseFormIds = this.getFormBuildIdFromResponse(response);
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

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
                redirect: 'manual' // this is to prevent automatic redirection
            });

            if (response.status === 302) {
                const setCookie = response.headers.get('set-cookie');
                if (setCookie) {
                    // Set the MetroTrustBrowser Cookie
                    const newCookies = setCookie.split('; ');
                    for (const cookie of newCookies) {
                        if (!this.cookies.includes(cookie)) {
                            this.cookies.push(cookie);
                        }
                    }
                }
                return true;
            }
            return false;
        } catch (error:any) {
            console.error('Error at submit2FAPinCode HTTP request:', error);
            return false;
        }
    }

    private async accessShortsPage(): Promise<any> {
        try {
            const headers = {
                Cookie: this.cookies.join('; '), // Set the received cookies in the request header
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await got.get('https://metro.dttw.com/metro/create-pay-for-short-request', {
                headers,
            });

            const responseData = response.body;
            const formBuildIdMatch = responseData.match(/name="form_build_id" value="([^"]+)"/);
            const formBuildId = formBuildIdMatch ? formBuildIdMatch[1] : '';

            const formTokenMatch = responseData.match(/name="form_token" value="([^"]+)"/);
            const formToken = formTokenMatch ? formTokenMatch[1] : '';

            const formIdMatch = responseData.match(/name="form_id" value="([^"]+)"/);
            const formId = formIdMatch ? formIdMatch[1] : '';
            console.log('form_build_id:', formBuildId);
            console.log('form_token:', formToken);
            console.log('form_id:', formId);

            return { formBuildId, formToken, formId };
        } catch (error) {
            console.error('Error at accessShortsPage HTTP request:', error);
            throw error;
        }
    }



    private async officeSelection(): Promise<void> {
        try {

            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    office_dropdown: '78272187',
                    'trader[]': '79125005',
                    'symbol[]': 'TSLA.NQ',
                    'num_of_shares[]': '100',
                    op: 'Submit',
                    form_build_id: 'form-nr2HyBrpwc8Z3Uc7wJVBfWBzX49XxNJrCcfSUSxFWWg',
                    form_token: '-qZNk9WN3HfwYthxAfvClcs3lkGVelcnl9wKKi6UnGQ',
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

        }
            catch(error) {
                console.error('Error making HTTP request:', error);
            }
        }

    private async acceptSelection(): Promise<void> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    accept: '1',
                    quote_source: 'Short Pool',
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

    public async start(): Promise<void> {
            try {
                console.log('Access Metro');
                await this.accessMetro();
                console.log('Access Login')
                await this.accessLogin();
                if (this.authLocation !== '') {
                    console.log('WILL TRIGGER 2FA by MAIL');
                    await this.performTwoFactorAuthenticationByMail(this.authLocation);
                    this.rl.question('Enter the PIN code sent to your email: ', async (pinCode) => {
                        if (pinCode.length === 6 && /^\d+$/.test(pinCode)) {
                            const identified: boolean  = await this.submit2FAPinCode(this.authLocation, pinCode);
                            if( identified) {
                                console.log('Identified - going to locates page');
                                // await this.accessShortsPage();
                            }
                        } else {
                            console.log('Invalid PIN code. Please enter a 6-digit numeric code.');
                        }
                    });
                }
            } catch (error) {
                console.error('Error performing login:', error);
            }
        }

    /**
     * Parses the html response and extracts the FormId and FormBuildId
     * @param response
     */
    private getFormBuildIdFromResponse(response: any): {formBuildId: string, formId: string} {
        const $ = load(response.body);
        const formBuildIdElement = $('input[name="form_build_id"]');
        const formIdElement = $('input[name="form_id"]');
        let formBuildId = '';
        let formId = '';

        if(formBuildIdElement.length > 0) {
            const val = formBuildIdElement.val();
            formBuildId = val ? val.toString() : '';
        }

        if(formIdElement.length > 0) {
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

}

