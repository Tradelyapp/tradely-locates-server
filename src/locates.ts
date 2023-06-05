// import fs from 'fs';
// import axios from 'axios';
// import cheerio from 'cheerio';
// import readline from 'readline';
// import * as querystring from "querystring";
//
// // Create readline interface
// const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
// });
//
// // Function to create HTML content with response data and write to file
// function createHTMLContent(responseData: string, filePath: string): void {
//     const htmlContent = `
//     <html>
//       <head>
//         <title>Metro Response</title>
//       </head>
//       <body>
//         <pre>${responseData}</pre>
//       </body>
//     </html>
//   `;
//
//     fs.writeFileSync(filePath, htmlContent);
//     console.log(`HTML content written to file: ${filePath}`);
// }
//
// /**
//  * Access metro - get the formId and set has_js cookie
//  */
// async function accessMetro(): Promise<{ formBuildId: string; formId: string }> {
//     try {
//         // Set the "has_js" cookie in the document manually
//         const cookie = 'has_js=1; path=/';
//         const cookieHeader = {Cookie: cookie};
//
//         const response = await axios.get<string>('https://metro.dttw.com/metro/', {
//             headers: cookieHeader
//         });
//
//         // Extract form_build_id and form_id from the response HTML
//         const $ = cheerio.load(response.data);
//         const formBuildId = $('input[name="form_build_id"]').val() as string;
//         const formId = $('input[name="form_id"]').val() as string;
//
//         // Create HTML content using the createHTMLContent function and write to file
//         createHTMLContent(response.data, 'response.html');
//
//         // Return the extracted values
//         return {formBuildId, formId};
//     } catch (error) {
//         console.error('Error accessing Metro:', error);
//         throw error;
//     }
// }
//
//
// /**
//  * Enter input log in mail and password - retrieves the cookie ( session ) in future requests the MetroTrustBrowser cookie is retrieved
//  * In this step if the Location response header parameter is present, means a two-factor authentication is needed. This parameter
//  * contains the POST url for the 2FA action
//  *
//  * @param formBuildId - from first access to metro page - used on all requests
//  * @param formId - from first access to metro page - used on all requests
//  */
// async function accessLogin(formBuildId: string, formId: string): Promise<{ cookies: string[]; location: string }> {
//     try {
//         let location: string = '';
//         let cookies: string[] = [];
//         const loginData = querystring.stringify({
//             name: 'annahuix@yahoo.es',
//             pass: 'Ve1oWD9r2ZS6ny',
//             form_build_id: formBuildId,
//             form_id: formId,
//             op: 'Log in'
//         });
//
//         const headers = {
//             'Content-Type': 'application/x-www-form-urlencoded',
//             Cookie: 'has_js=1', // Set the "has_js" cookie
//             Referer: 'https://metro.dttw.com/metro/',
//             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
//         };
//
//         const response = await axios.post('https://metro.dttw.com/metro/node?destination=node', loginData, {
//             headers,
//             maxRedirects: 0, // Disable automatic redirection
//             validateStatus: function (status) {
//                 return status >= 200 && status < 400; // Validate only successful status codes
//             }
//         });
//
//
//         // Check the response status code
//         if (response.status === 302) {
//             console.log('Login successful');
//             if (response.headers['set-cookie']) {
//                 const receivedCookies = response.headers['set-cookie'];
//                 cookies = Array.isArray(receivedCookies) ? receivedCookies : [receivedCookies]; // Store the received cookies
//             }
//             console.log('Cookies:', cookies);
//
//
//             // Extract the two-factor authentication URL from the Location header
//             const locationHeader = response.headers['location'];
//             if (locationHeader) {
//                 location = locationHeader as string;
//                 console.log('Two-factor authentication URL:', location);
//                 // Perform any necessary actions with the two-factor authentication URL
//             } else {
//                 console.log('Two-factor authentication URL not found in response');
//             }
//             createHTMLContent(response.data, 'response.html');
//         } else {
//             console.log('Login failed');
//         }
//         return {cookies, location};
//     } catch (error) {
//         console.error('Error during accessLogin:', error);
//         throw error;
//     }
// }
//
//
//
// async function performLogin(): Promise<void> {
//     try {
//         const {formBuildId, formId} = await accessMetro();
//         const loginResponse = await accessLogin(formBuildId, formId);
//         if (loginResponse.location !== '') {
//             console.log('WILL TRIGGER 2FA by MAIL');
//             await performTwoFactorAuthenticationByMail(loginResponse.location, loginResponse.cookies, formBuildId);
//             rl.question('Enter the PIN code sent to your email: ', async (pinCode) => {
//                 if (pinCode.length === 6 && /^\d+$/.test(pinCode)) {
//                     console.log(`The pin code is: ${pinCode} . Sending it to Metro`);
//                     const identified: boolean  = await submit2FAPinCode(loginResponse.location, loginResponse.cookies,formBuildId, pinCode);
//                     if( identified) {
//                         console.log('Identified - going to locates page');
//                         await accessShortsPage(loginResponse.cookies);
//                     }
//                 } else {
//                     console.log('Invalid PIN code. Please enter a 6-digit numeric code.');
//                 }
//             });
//         }
//     } catch (error) {
//         console.error('Error performing login:', error);
//     }
// }
//
//
// performLogin().then(() => console.log('end'));