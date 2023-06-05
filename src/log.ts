export function logMessage(message: any): void {
    if (message) {
        console.log(`Log message: ${message}`);
    } else {
        console.log('No message provided.');
    }
}
