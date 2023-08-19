export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a human-readable description for the given status code.
 *
 * @param statusCode - The status code for which to retrieve the description.
 * @returns A description corresponding to the provided status code.
 */
export function StatusCodeDescription(statusCode: number): string {
  switch (statusCode) {
    case 151:
      return `Command not supported by this deviceType, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`;
    case 152:
      return `Device not found, statusCode: ${statusCode}`;
    case 160:
      return `Command is not supported, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`;
    case 161:
      return `Device is offline, statusCode: ${statusCode}`;
    case 171:
      return `Hub Device is offline, statusCode: ${statusCode}`;
    case 190:
      return `Device internal error due to device states not synchronized with server or command format is invalid, statusCode: ${statusCode}`;
    case 100:
      return `Command successfully sent, statusCode: ${statusCode}`;
    case 200:
      return `Request successful, statusCode: ${statusCode}`;
    case 400:
      return `Bad Request, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`;
    case 401:
      return `Unauthorized, statusCode: ${statusCode}`;
    case 403:
      return `Forbidden, statusCode: ${statusCode}`;
    case 404:
      return `Not Found, statusCode: ${statusCode}`;
    case 406:
      return `Not Acceptable, statusCode: ${statusCode}`;
    case 415:
      return `Unsupported Media Type, statusCode: ${statusCode}`;
    case 422:
      return `Unprocessable Entity, statusCode: ${statusCode}`;
    case 429:
      return `Too Many Requests, statusCode: ${statusCode}`;
    case 500:
      return `Internal Server Error, statusCode: ${statusCode}`;
    default:
      return `Unknown statusCode, statusCode: ${statusCode}, Submit Bugs Here: https://tinyurl.com/SwitchBotBug`;
  }
}