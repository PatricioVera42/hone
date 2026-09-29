/** Line the host prints on stdout once its WebSocket server is listening, followed by a space and the port. */
export const hostReadyLine = "HONE_HOST_READY";

export { AppError, appErrorCodes, type AppErrorName } from "./errors.ts";
export {
  encodeNotification,
  handleJsonRpcMessage,
  jsonRpcErrorCodes,
  registerMethod,
  type MethodDefinition,
  type MethodHandler,
  type NotificationDefinition,
} from "./json-rpc.ts";
export {
  filesChangedNotification,
  filesListMethod,
  type FileChange,
  type FileEntry,
} from "./methods/files.ts";
export { workshopCreateMethod, workshopOpenMethod, type WorkshopInfo } from "./methods/workshop.ts";
export { validateName, type NameValidation } from "./name.ts";
