export interface IServerStatus {
    status: string;
    message: string;
    cookies: string[];
    userLoggedIn: boolean;
    officeValue: string;
    users: any[];
}