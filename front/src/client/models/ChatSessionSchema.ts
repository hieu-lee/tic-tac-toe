/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatMessageSchema } from './ChatMessageSchema';
export type ChatSessionSchema = {
    id: string;
    name: string;
    provider?: (string | null);
    context_dir?: (string | null);
    system_prompt?: (string | null);
    created_at: string;
    messages?: Array<ChatMessageSchema>;
};

