/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckboxEntrySchema } from './CheckboxEntrySchema';
export type ProcessCheckboxEntriesRequest = {
    entries: Array<CheckboxEntrySchema>;
    context_dir: string;
    provider: ProcessCheckboxEntriesRequest.provider;
};
export namespace ProcessCheckboxEntriesRequest {
    export enum provider {
        OPENAI = 'openai',
        GROQ = 'groq',
        GOOGLE = 'google',
        ANYTHINGLLM = 'anythingllm',
        LOCAL = 'local',
        OLLAMA = 'ollama',
    }
}

