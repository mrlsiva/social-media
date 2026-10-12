import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response:message';
export const RAW_RESPONSE_KEY = 'response:raw';

/** Sets the human readable `message` of the success envelope. */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);

/** Skips the envelope (used for redirects such as OAuth callbacks and file streams). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
