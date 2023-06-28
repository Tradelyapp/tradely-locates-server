import * as Service from 'node-windows';
import * as path from 'path';
import {fileURLToPath} from "url";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);
const svc = new Service.Service({
    name: 'Tradely Locates',
    description: 'Tradely service to purchase locates on MetroDTTW',
    script: path.join(__dirname, '', 'index.js'),
    nodeOptions: '--harmony --max_old_space_size=4096',
});

svc.on('install', () => {
    svc.start();
    console.log('Service installed and started successfully.');
});

svc.on('uninstall', () => {
    console.log('Service uninstalled successfully.');
});

if (process.argv[2] === 'install') {
    svc.install();
} else if (process.argv[2] === 'uninstall') {
    svc.uninstall();
} else {
    console.log('Please specify "install" or "uninstall" as an argument.');
}
