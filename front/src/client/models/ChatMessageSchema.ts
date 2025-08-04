/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ChatMessageSchema = {
    role: ChatMessageSchema.role;
    content: string;
    image_path?: (string | null);
};
export namespace ChatMessageSchema {
    export enum role {
        USER = 'user',
        ASSISTANT = 'assistant',
    }
}

