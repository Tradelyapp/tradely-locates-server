import fs from 'fs';
import axios from 'axios';
import cheerio from 'cheerio';
import * as querystring from 'querystring';
import readline from "readline";

export class MetroClient {
    private cookies: string[];

    private authLocation : string = '';

    private readonly email: string =  'annahuix@yahoo.es';
    private readonly pass: string =  'Ve1oWD9r2ZS6ny';

    // User input readline
    private rl;
    constructor() {
        this.cookies = [];
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
    private async accessMetro(): Promise<{ formBuildId: string; formId: string }> {
        try {
            const cookie = 'has_js=1; path=/';
            const cookieHeader = { Cookie: cookie };

            const response = await axios.get<string>('https://metro.dttw.com/metro/', {
                headers: cookieHeader,
            });

            const $ = cheerio.load(response.data);
            const formBuildId = $('input[name="form_build_id"]').val() as string;
            const formId = $('input[name="form_id"]').val() as string;

            this.createHTMLContent(response.data, 'response.html');

            return { formBuildId, formId };
        } catch (error) {
            console.error('Error accessing Metro:', error);
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
    private async accessLogin(formBuildId: string, formId: string): Promise<void> {
        try {
            let location: string = '';

            const loginData = querystring.stringify({
                name: this.email,
                pass: this.pass,
                form_build_id: formBuildId,
                form_id: formId,
                op: 'Log in',
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: 'has_js=1', // Set the "has_js" cookie
                Referer: 'https://metro.dttw.com/metro/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
            };

            const response = await axios.post('https://metro.dttw.com/metro/node?destination=node', loginData, {
                headers,
                maxRedirects: 0,
                validateStatus: function (status) {
                    return status >= 200 && status < 400;
                },
            });

            if (response.headers['set-cookie']) {
                this.cookies = response.headers['set-cookie'];
                console.log('Received cookies:', this.cookies);
            } else {
                console.log('No cookies received');
            }

            if (response.status === 302) {
                console.log('Login successful');
                this.authLocation = response.headers['location'] as string;
                console.log('Two-factor authentication URL:', this.authLocation);
                this.createHTMLContent(response.data, 'response.html');
            } else {
                console.log('Login failed');
            }
        } catch (error) {
            console.error('Error during accessLogin:', error);
            throw error;
        }
    }


    /**
     * 2FA can be done by mail or sms, by default is done by mail
     * @param url
     * @param cookies
     * @param formBuildId
     */
    private async performTwoFactorAuthenticationByMail(url: string, formBuildId: string): Promise<void> {
        {
            try {
                // console.log('inputFormId: ', formId);
                const postData = {
                    mimeType: 'application/x-www-form-urlencoded',
                    formData: {
                        destination: 'node',
                        authentication_type: 'email',
                        op: 'Submit',
                        form_build_id: formBuildId,
                        form_id: 'bpm_two_factor_authentication_form'
                    }
                };

                const formData = querystring.stringify(postData.formData);

                const headers = {
                    'Content-Type': postData.mimeType,
                    Cookie: this.cookies.join('; '), // Set the cookies in the request
                    Referer: url,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
                };

                const response = await axios.post(url, formData, {
                    headers
                });
            } catch (error) {
                console.error('Error making HTTP request:', error);
            }
        }
    }

    /**
     * Submit the pinCode, location url same as the previous call
     * @param url
     * @param cookies
     * @param formBuildId
     * @param pinCode
     */
    private async submit2FAPinCode(url: string, formBuildId: string, pinCode: string): Promise<boolean> {
        try {
            const postData = {
                mimeType: 'application/x-www-form-urlencoded',
                formData: {
                    authentication_code: pinCode,
                    op: 'Submit',
                    form_build_id: formBuildId,
                    form_id: 'bpm_two_factor_authentication_form'
                }
            };

            const formData = querystring.stringify(postData.formData);

            const headers = {
                'Content-Type': postData.mimeType,
                Cookie: this.cookies.join('; '), // Set the cookies in the request
                Referer: url,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            };

            const response = await axios.post(url, formData, {
                headers
            });

            // Check the response status code
            this.createHTMLContent(response.data, 'response.html');
            if (response.status === 302) {
                console.log('Pin submitted successfully');
                return true;
            } else {
                console.log('Pin submission failed');
                return false;
            }
        } catch (error) {
            console.error('Error making HTTP request:', error);
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

            const response = await axios.get('https://metro.dttw.com/metro/create-pay-for-short-request', {
                headers
            });

            const responseData = response.data;
            const formBuildIdMatch = responseData.match(/name="form_build_id" value="([^"]+)"/);
            const formBuildId = formBuildIdMatch ? formBuildIdMatch[1] : '';

            const formTokenMatch = responseData.match(/name="form_token" value="([^"]+)"/);
            const formToken = formTokenMatch ? formTokenMatch[1] : '';

            const formIdMatch = responseData.match(/name="form_id" value="([^"]+)"/);
            const formId = formIdMatch ? formIdMatch[1] : '';

            console.log('form_build_id:', formBuildId);
            console.log('form_token:', formToken);
            console.log('form_id:', formId);

            return {formBuildId, formToken, formId};
        } catch (error) {
            console.error('Error fetching form data:', error);
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

            const formData = querystring.stringify(postData.formData);

            const response = await axios.post('https://metro.dttw.com/metro/create-pay-for-short-request', formData, {
                headers: {
                    'Content-Type': postData.mimeType
                }
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

            const response = await axios.post('https://metro.dttw.com/metro/create-pay-for-short-request', formData, {
                headers: {
                    'Content-Type': postData.mimeType
                }
            })
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

            const reponse = await axios.post('https://metro.dttw.com/metro/create-pay-for-short-request', formData, {
                headers: {
                    'Content-Type': postData.mimeType
                }
            })
        } catch (error) {
            console.error('Error making HTTP request:', error);
        }
    }

    public getCookies(): string[] {
        return this.cookies;
    }

    public async start(): Promise<void> {
            try {
                const {formBuildId, formId} = await this.accessMetro();
                await this.accessLogin(formBuildId, formId);
                if (this.authLocation !== '') {
                    console.log('WILL TRIGGER 2FA by MAIL');
                    await this.performTwoFactorAuthenticationByMail(this.authLocation, formBuildId);
                    this.rl.question('Enter the PIN code sent to your email: ', async (pinCode) => {
                        if (pinCode.length === 6 && /^\d+$/.test(pinCode)) {
                            console.log(`The pin code is: ${pinCode} . Sending it to Metro`);
                            const identified: boolean  = await this.submit2FAPinCode(this.authLocation, formBuildId, pinCode);
                            if( identified) {
                                console.log('Identified - going to locates page');
                                await this.accessShortsPage();
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
}

