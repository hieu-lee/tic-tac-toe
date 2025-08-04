/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FillEntrySchema } from './FillEntrySchema';
export type ProcessFillEntriesRequest = {
    entries: Array<FillEntrySchema>;
    context_dir: string;
    form_path: string;
    pattern: string;
    provider: ProcessFillEntriesRequest.provider;
};
export namespace ProcessFillEntriesRequest {
    export enum provider {
        OPENAI = 'openai',
        GROQ = 'groq',
        GOOGLE = 'google',
        ANYTHINGLLM = 'anythingllm',
        LOCAL = 'local',
        OLLAMA = 'ollama',
    }
}

