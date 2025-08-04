/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AddContextRequest } from '../models/AddContextRequest';
import type { AddContextResponse } from '../models/AddContextResponse';
import type { CancelFormRequest } from '../models/CancelFormRequest';
import type { CancelFormResponse } from '../models/CancelFormResponse';
import type { CreateChatSessionRequest } from '../models/CreateChatSessionRequest';
import type { CreateChatSessionResponse } from '../models/CreateChatSessionResponse';
import type { DeleteChatSessionRequest } from '../models/DeleteChatSessionRequest';
import type { DeleteChatSessionResponse } from '../models/DeleteChatSessionResponse';
import type { DetectCheckboxEntriesRequest } from '../models/DetectCheckboxEntriesRequest';
import type { DetectCheckboxEntriesResponse } from '../models/DetectCheckboxEntriesResponse';
import type { DetectFillEntriesRequest } from '../models/DetectFillEntriesRequest';
import type { DetectFillEntriesResponse } from '../models/DetectFillEntriesResponse';
import type { DetectPatternRequest } from '../models/DetectPatternRequest';
import type { DetectPatternResponse } from '../models/DetectPatternResponse';
import type { ExtractContextRequest } from '../models/ExtractContextRequest';
import type { ExtractContextResponse } from '../models/ExtractContextResponse';
import type { ExtractFormTextRequest } from '../models/ExtractFormTextRequest';
import type { ExtractFormTextResponse } from '../models/ExtractFormTextResponse';
import type { FillDocxRequest } from '../models/FillDocxRequest';
import type { FillDocxResponse } from '../models/FillDocxResponse';
import type { FillInteractivePdfRequest } from '../models/FillInteractivePdfRequest';
import type { FillInteractivePdfResponse } from '../models/FillInteractivePdfResponse';
import type { FillPdfDynamicRequest } from '../models/FillPdfDynamicRequest';
import type { FillPdfDynamicResponse } from '../models/FillPdfDynamicResponse';
import type { FillPdfRequest } from '../models/FillPdfRequest';
import type { FillPdfResponse } from '../models/FillPdfResponse';
import type { IsInteractiveRequest } from '../models/IsInteractiveRequest';
import type { IsInteractiveResponse } from '../models/IsInteractiveResponse';
import type { ListChatSessionsResponse } from '../models/ListChatSessionsResponse';
import type { ProcessCheckboxEntriesRequest } from '../models/ProcessCheckboxEntriesRequest';
import type { ProcessCheckboxEntriesResponse } from '../models/ProcessCheckboxEntriesResponse';
import type { ProcessFillEntriesRequest } from '../models/ProcessFillEntriesRequest';
import type { ProcessFillEntriesResponse } from '../models/ProcessFillEntriesResponse';
import type { ReadContextRequest } from '../models/ReadContextRequest';
import type { ReadContextResponse } from '../models/ReadContextResponse';
import type { SaveInteractivePdfRequest } from '../models/SaveInteractivePdfRequest';
import type { SaveInteractivePdfResponse } from '../models/SaveInteractivePdfResponse';
import type { SendMessageRequest } from '../models/SendMessageRequest';
import type { SendMessageResponse } from '../models/SendMessageResponse';
import type { TranslateFileRequest } from '../models/TranslateFileRequest';
import type { TranslateFileResponse } from '../models/TranslateFileResponse';
import type { UpdateContextDirRequest } from '../models/UpdateContextDirRequest';
import type { UpdateContextDirResponse } from '../models/UpdateContextDirResponse';
import type { UpdateFormPathsRequest } from '../models/UpdateFormPathsRequest';
import type { UpdateFormPathsResponse } from '../models/UpdateFormPathsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Api Cancel Form
     * Register cancellation for *form_path* so subsequent tasks abort early.
     * @param requestBody
     * @returns CancelFormResponse Successful Response
     * @throws ApiError
     */
    public static apiCancelFormFormCancelPost(
        requestBody: CancelFormRequest,
    ): CancelablePromise<CancelFormResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/form/cancel',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Extract Form Text
     * @param requestBody
     * @returns ExtractFormTextResponse Successful Response
     * @throws ApiError
     */
    public static apiExtractFormTextFormTextPost(
        requestBody: ExtractFormTextRequest,
    ): CancelablePromise<ExtractFormTextResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/form/text',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Detect Pattern
     * @param requestBody
     * @returns DetectPatternResponse Successful Response
     * @throws ApiError
     */
    public static apiDetectPatternPatternDetectPost(
        requestBody: DetectPatternRequest,
    ): CancelablePromise<DetectPatternResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/pattern/detect',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Detect Fill Entries
     * @param requestBody
     * @returns DetectFillEntriesResponse Successful Response
     * @throws ApiError
     */
    public static apiDetectFillEntriesFillEntriesDetectPost(
        requestBody: DetectFillEntriesRequest,
    ): CancelablePromise<DetectFillEntriesResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/fill-entries/detect',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Process Fill Entries
     * @param requestBody
     * @returns ProcessFillEntriesResponse Successful Response
     * @throws ApiError
     */
    public static apiProcessFillEntriesFillEntriesProcessPost(
        requestBody: ProcessFillEntriesRequest,
    ): CancelablePromise<ProcessFillEntriesResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/fill-entries/process',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Read Context
     * @param requestBody
     * @returns ReadContextResponse Successful Response
     * @throws ApiError
     */
    public static apiReadContextContextReadPost(
        requestBody: ReadContextRequest,
    ): CancelablePromise<ReadContextResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/context/read',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Add Context
     * @param requestBody
     * @returns AddContextResponse Successful Response
     * @throws ApiError
     */
    public static apiAddContextContextAddPost(
        requestBody: AddContextRequest,
    ): CancelablePromise<AddContextResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/context/add',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Detect Checkbox Entries
     * @param requestBody
     * @returns DetectCheckboxEntriesResponse Successful Response
     * @throws ApiError
     */
    public static apiDetectCheckboxEntriesCheckboxEntriesDetectPost(
        requestBody: DetectCheckboxEntriesRequest,
    ): CancelablePromise<DetectCheckboxEntriesResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/checkbox-entries/detect',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Process Checkbox Entries
     * @param requestBody
     * @returns ProcessCheckboxEntriesResponse Successful Response
     * @throws ApiError
     */
    public static apiProcessCheckboxEntriesCheckboxEntriesProcessPost(
        requestBody: ProcessCheckboxEntriesRequest,
    ): CancelablePromise<ProcessCheckboxEntriesResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/checkbox-entries/process',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Extract Context
     * @param requestBody
     * @returns ExtractContextResponse Successful Response
     * @throws ApiError
     */
    public static apiExtractContextContextExtractPost(
        requestBody: ExtractContextRequest,
    ): CancelablePromise<ExtractContextResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/context/extract',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Fill a DOCX form using pre-computed placeholder & checkbox entries
     * Takes the raw `form_path` to a DOCX template, a list of pre-processed `FillEntry` objects
     * (each with its `filled_lines` already populated) and `CheckboxEntry` objects indicating which
     * checkbox indices should be checked. No placeholder or checkbox pattern detection is executed
     * server-side — the entries must be prepared on the client. The filled document is written to
     * `output_path` (or '<form>_filled.docx' beside the original) and the absolute path is returned.
     * @param requestBody
     * @returns FillDocxResponse Successful Response
     * @throws ApiError
     */
    public static apiFillDocxDocxFillPost(
        requestBody: FillDocxRequest,
    ): CancelablePromise<FillDocxResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/docx/fill',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Fill a PDF form using pre-computed placeholder & checkbox entries
     * Similar to `/docx/fill` but for PDF files. Interactive AcroForm fields are attempted first; if the
     * PDF is flat, text overlay is used. Checkbox entries are currently ignored (no overlay support yet)
     * but accepted for forward compatibility. Output path mirrors DOCX behaviour.
     * @param requestBody
     * @returns FillPdfResponse Successful Response
     * @throws ApiError
     */
    public static apiFillPdfPdfFillPost(
        requestBody: FillPdfRequest,
    ): CancelablePromise<FillPdfResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/pdf/fill',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Auto-fill an interactive (AcroForm) PDF file
     * Detects all text widgets in the PDF, infers the most relevant context key for each widget label and fills the field with its value from `context_dir`. If the PDF contains *no* interactive widgets, consider using `/pdf/fill-dynamic` instead.
     * @param requestBody
     * @returns FillInteractivePdfResponse Successful Response
     * @throws ApiError
     */
    public static apiFillInteractivePdfPdfFillInteractivePost(
        requestBody: FillInteractivePdfRequest,
    ): CancelablePromise<FillInteractivePdfResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/pdf/fill-interactive',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Auto-fill a PDF (interactive or flat) in a single call
     * Automatically determines whether the PDF contains interactive form fields. If yes, fields are filled similarly to `/pdf/fill-interactive`. Otherwise, placeholder detection and replacement is performed using the provided `keys` and `pattern`.
     * @param requestBody
     * @returns FillPdfDynamicResponse Successful Response
     * @throws ApiError
     */
    public static apiFillDynamicPdfPdfFillDynamicPost(
        requestBody: FillPdfDynamicRequest,
    ): CancelablePromise<FillPdfDynamicResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/pdf/fill-dynamic',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Is Interactive
     * Check whether a PDF contains interactive AcroForm fields.
     * @param requestBody
     * @returns IsInteractiveResponse Successful Response
     * @throws ApiError
     */
    public static apiIsInteractivePdfIsInteractivePost(
        requestBody: IsInteractiveRequest,
    ): CancelablePromise<IsInteractiveResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/pdf/is-interactive',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Save updated widget values in an interactive PDF
     * Iterates through widgets in *form_path*, updating each field with the attributes provided in `widgets` (matched by `field_name`). The PDF is saved in-place and the absolute path is returned.
     * @param requestBody
     * @returns SaveInteractivePdfResponse Successful Response
     * @throws ApiError
     */
    public static apiSaveInteractivePdfPdfSaveInteractivePost(
        requestBody: SaveInteractivePdfRequest,
    ): CancelablePromise<SaveInteractivePdfResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/pdf/save-interactive',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api List Chat Sessions
     * @returns ListChatSessionsResponse Successful Response
     * @throws ApiError
     */
    public static apiListChatSessionsChatSessionsListPost(): CancelablePromise<ListChatSessionsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/sessions/list',
        });
    }
    /**
     * Api Create Chat Session
     * @param requestBody
     * @returns CreateChatSessionResponse Successful Response
     * @throws ApiError
     */
    public static apiCreateChatSessionChatSessionsCreatePost(
        requestBody: CreateChatSessionRequest,
    ): CancelablePromise<CreateChatSessionResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/sessions/create',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Delete Chat Session
     * @param requestBody
     * @returns DeleteChatSessionResponse Successful Response
     * @throws ApiError
     */
    public static apiDeleteChatSessionChatSessionsDeletePost(
        requestBody: DeleteChatSessionRequest,
    ): CancelablePromise<DeleteChatSessionResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/sessions/delete',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Send Chat Message
     * @param requestBody
     * @returns SendMessageResponse Successful Response
     * @throws ApiError
     */
    public static apiSendChatMessageChatMessagesSendPost(
        requestBody: SendMessageRequest,
    ): CancelablePromise<SendMessageResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/messages/send',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Update Chat Session Context Dir
     * @param requestBody
     * @returns UpdateContextDirResponse Successful Response
     * @throws ApiError
     */
    public static apiUpdateChatSessionContextDirChatSessionsUpdateContextDirPost(
        requestBody: UpdateContextDirRequest,
    ): CancelablePromise<UpdateContextDirResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/sessions/update-context-dir',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Api Update Chat Session Form Paths
     * Update the list of form paths associated with a chat session.
     *
     * This delegates the persistence logic to ``set_form_paths`` in
     * ``back.chatbot.core`` which updates the session object and persists it
     * to disk. The updated session is returned so the frontend can refresh its
     * state without making an additional request.
     * @param requestBody
     * @returns UpdateFormPathsResponse Successful Response
     * @throws ApiError
     */
    public static apiUpdateChatSessionFormPathsChatSessionsUpdateFormPathsPost(
        requestBody: UpdateFormPathsRequest,
    ): CancelablePromise<UpdateFormPathsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/chat/sessions/update-form-paths',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Translate PDF/DOCX/Image file
     * @param requestBody
     * @returns TranslateFileResponse Successful Response
     * @throws ApiError
     */
    public static apiTranslateFileTranslatePost(
        requestBody: TranslateFileRequest,
    ): CancelablePromise<TranslateFileResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/translate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Health Check
     * @returns any Successful Response
     * @throws ApiError
     */
    public static healthCheckHealthGet(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health',
        });
    }
}
