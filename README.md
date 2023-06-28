# Tradely Locates Server

This project is a Node.js application that will create a webserver to buy locates from DTTW Firm throughout the Metro Page

## Installation

Follow these steps to set up and run the application:

1. Clone the repository and navigate to the project directory:

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Configure Environment Variables:
   
   Create a `.env` file in the root directory of the project and define the following environment variables:
   
   ```plaintext
   DTTW_URL=http://localhost                 # To perform actions related to trading position
   DTTW_PORT=8080                            # Port number for the application
   DTTW_MANAGER=<metro-admin>                 # Metro admin who will buy the locates
   DTTW_PASS=<password>                       # Password for the Metro admin
   LOCATES_CLIENT_IP=<whitelisted-ip>         # IP address to whitelist
   ```

4. Build the application:

   ```bash
   npm run build
   ```

5. Run the application:

   ```bash
   npm start
   ```

The application should now be up and running on the specified port.
## Scripts

The project includes the following scripts defined in the `package.json` file:

- `ts`: Compiles the TypeScript files.
- `start`: Builds and runs the application.
- `lint`: Lints the TypeScript files using the TSLint configuration.
- `clean`: Deletes the `build` directory.
- `build`: Cleans the project and compiles the TypeScript code.
- `local`: Runs the application using `ts-node` for local development.
- `local:watch`: Monitors changes in the source files and restarts the application automatically.

Feel free to use these scripts based on your development and deployment requirements.

## Running as a Windows Service

To run the Node.js application as a Windows service, you there is the `node-windows` package.

1. Install the required package globally:

   ```bash
   npm install -g node-windows
   ```

2. In the project directory, build the project:

   ```bash
   npm run build
   ```

4. Install the windows-service.js as a service:

   ```bash
   node build/src/windows-service.js install
   ```

   This will install and start the service.

5. Verify the service is running:

   ```bash
   node-windows list
   ```

   You should see your service listed with its status.

To uninstall the app as a windows service

   ```bash
   node build/src/windows-service.js uninstall
   ```

## License

[Include the license information for your project here, if applicable]

[Add any additional sections as needed, such as Usage, Features, or Troubleshooting]
