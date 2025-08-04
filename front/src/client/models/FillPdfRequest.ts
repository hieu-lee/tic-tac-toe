/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckboxEntrySchema } from './CheckboxEntrySchema';
import type { FillEntrySchema } from './FillEntrySchema';
export type FillPdfRequest = {
    fill_entries: Array<FillEntrySchema>;
    checkbox_entries?: Array<CheckboxEntrySchema>;
    form_path: string;
    context_dir?: (string | null);
    output_path?: (string | null);
};

