/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ExtractContextRequest = {
    context_dir: string;
    provider: ExtractContextRequest.provider;
};
export namespace ExtractContextRequest {
    export enum provider {
        OPENAI = 'openai',
        GROQ = 'groq',
        GOOGLE = 'google',
        ANYTHINGLLM = 'anythingllm',
        LOCAL = 'local',
        OLLAMA = 'ollama',
    }
}

