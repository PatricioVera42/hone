/** One JSON-RPC application error code per condition, in the -32000 to -32099 server-error range. */
export const appErrorCodes = {
  NotAWorkshop: -32000,
  NestedWorkshop: -32001,
  AlreadyExists: -32002,
  NotFound: -32003,
  OutsideWorkshop: -32004,
  VersionConflict: -32005,
  NotText: -32006,
  TooLarge: -32007,
  NoWorkshopOpen: -32008,
  InvalidName: -32009,
} as const;

export type AppErrorName = keyof typeof appErrorCodes;

/** An application-level failure a method handler throws; the JSON-RPC layer turns it into an error response. */
export class AppError extends Error {
  readonly code: number;
  override readonly name: AppErrorName;

  constructor(name: AppErrorName, message: string) {
    super(message);
    this.name = name;
    this.code = appErrorCodes[name];
  }
}
