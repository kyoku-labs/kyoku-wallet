// src/utils/solanaSignInUtils.ts

export interface ParsedSignInMessage {
  domain: string;
  address: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
  originalMessage: string;
}

export enum SignInMessageErrorType {
  DOMAIN_MISMATCH = "Security Risk: The domain in the sign-in request does not match the website you are on. This could be a phishing attempt.",
  URI_MISMATCH = "Security Risk: The URI in the sign-in request does not match the website you are on. This could be a phishing attempt.",
  ADDRESS_MISMATCH = "Warning: The address in the sign-in message does not match your currently selected wallet address.",
  NONCE_MISSING = "Warning: Nonce is missing. This is recommended for replay protection.",
  ISSUED_AT_MISSING = "Warning: 'Issued At' timestamp is missing. This is recommended for security.",
  ISSUED_TOO_FAR_IN_PAST = "Warning: This sign-in request was issued a while ago and might be stale.",
  ISSUED_IN_FUTURE = "Warning: This sign-in request seems to be from the future. Check your system clock.",
  EXPIRED = "This sign-in request has expired.",
  NOT_YET_VALID = "This sign-in request is not valid yet (due to 'Not Before' time).",
  EXPIRES_BEFORE_ISSUANCE = "Error: Sign-in request expires before it's issued.",
  EXPIRES_BEFORE_NOT_BEFORE = "Error: Sign-in request expires before its 'not before' time.",
  INVALID_DOMAIN_FORMAT = "Error: The domain in the sign-in request is malformed.",
  INVALID_URI_FORMAT = "Error: The URI in the sign-in request is malformed.",
  INVALID_ISSUED_AT_FORMAT = "Error: The 'Issued At' timestamp is not a valid ISO 8601 date.",
  INVALID_EXPIRATION_TIME_FORMAT = "Error: The 'Expiration Time' is not a valid ISO 8601 date.",
  INVALID_NOT_BEFORE_FORMAT = "Error: The 'Not Before' timestamp is not a valid ISO 8601 date.",
  UNEXPECTED_PARSING_ERROR = "An unexpected error occurred while parsing the sign-in message structure.",
}

export interface SignInVerificationOptions {
  issuedAtThresholdMs?: number;
}

const DEFAULT_ISSUED_AT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const DOMAIN_REGEX_PART = `(?<domain>[^\\n]+?) wants you to sign in with your Solana account:`;
const ADDRESS_REGEX_PART = `\\n(?<address>[a-zA-Z0-9]{32,44})`;

const SIWE_MESSAGE_REGEX_HEADER = new RegExp(
  `^${DOMAIN_REGEX_PART}${ADDRESS_REGEX_PART}`
);

// [FIXED] This regex is now specific to known optional fields to avoid misinterpreting the statement.
const OPTIONAL_FIELD_LINE_START_REGEX = /^(?:URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID|Resources): /m;

export function parseSignInMessage(message: string): ParsedSignInMessage | null {
  const headerMatch = SIWE_MESSAGE_REGEX_HEADER.exec(message);

  if (!headerMatch || !headerMatch.groups) {
    return null;
  }

  const domain = headerMatch.groups.domain;
  const address = headerMatch.groups.address;

  if (!domain || !address) {
    return null;
  }

  let statement: string | undefined = undefined;
  let textForOptionalFieldsParsing: string;

  const headerEndIndex = headerMatch[0].length;
  let textAfterHeader = message.substring(headerEndIndex);

  // Divide into lines and remove initial empty lines
  const lines = textAfterHeader.split(/\r?\n/);
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  // Find the index of the first line that is an optional field
  const optionalFieldIndex = lines.findIndex(line => OPTIONAL_FIELD_LINE_START_REGEX.test(line));

  if (optionalFieldIndex === -1) {
    // No optional fields, everything remaining is the statement
    const possibleStatement = lines.join('\n').trim();
    statement = possibleStatement === '' ? undefined : possibleStatement;
    textForOptionalFieldsParsing = '';
  } else if (optionalFieldIndex === 0) {
    // Optional fields start immediately, so there is no statement
    statement = undefined;
    textForOptionalFieldsParsing = lines.join('\n').trimStart();
  } else {
    // The statement is the block of text before the optional fields
    statement = lines.slice(0, optionalFieldIndex).join('\n').trim();
    textForOptionalFieldsParsing = lines.slice(optionalFieldIndex).join('\n').trimStart();
  }

  const parsedFieldsAccumulator: Omit<Partial<ParsedSignInMessage>, 'domain' | 'address' | 'statement' | 'originalMessage' | 'resources'> = {};
  let parsedResources: string[] | undefined = undefined;

  const fieldPatterns: { name: Exclude<keyof ParsedSignInMessage, 'domain'|'address'|'statement'|'originalMessage'|'resources'>; pattern: RegExp }[] = [
    { name: 'uri', pattern: /^URI: (?<uri>[^\r\n]+)/m },
    { name: 'version', pattern: /^Version: (?<version>[^\r\n]+)/m },
    { name: 'chainId', pattern: /^Chain ID: (?<chainId>[^\r\n]+)/m },
    { name: 'nonce', pattern: /^Nonce: (?<nonce>[^\r\n]+)/m },
    { name: 'issuedAt', pattern: /^Issued At: (?<issuedAt>[^\r\n]+)/m },
    { name: 'expirationTime', pattern: /^Expiration Time: (?<expirationTime>[^\r\n]+)/m },
    { name: 'notBefore', pattern: /^Not Before: (?<notBefore>[^\r\n]+)/m },
    { name: 'requestId', pattern: /^Request ID: (?<requestId>[^\r\n]+)/m },
  ];

  let currentRemainingText = textForOptionalFieldsParsing;

  for (const { name, pattern } of fieldPatterns) {
    const match = pattern.exec(currentRemainingText);
    if (match?.groups?.[name as string]) {
      (parsedFieldsAccumulator as any)[name] = match.groups[name as string];
      const matchEndIndex = match[0].length;
      currentRemainingText = currentRemainingText.substring(matchEndIndex).replace(/^\r?\n/, '').trimStart();
    }
  }

  const resourcesMatch = /^Resources:((?:\r?\n- [^\r\n]+)+)/m.exec(currentRemainingText);
  if (resourcesMatch && resourcesMatch[1]) {
    parsedResources = resourcesMatch[1]
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.startsWith('- '))
      .map(line => line.substring(2).trim())
      .filter(Boolean);
  }

  const result: ParsedSignInMessage = {
    domain,
    address,
    statement,
    uri: parsedFieldsAccumulator.uri,
    version: parsedFieldsAccumulator.version,
    chainId: parsedFieldsAccumulator.chainId,
    nonce: parsedFieldsAccumulator.nonce,
    issuedAt: parsedFieldsAccumulator.issuedAt,
    expirationTime: parsedFieldsAccumulator.expirationTime,
    notBefore: parsedFieldsAccumulator.notBefore,
    requestId: parsedFieldsAccumulator.requestId,
    resources: parsedResources,
    originalMessage: message,
  };

  return result;
}

export function verifySignInMessage(
  parsedMessage: ParsedSignInMessage,
  expectedDappOrigin: string,
  expectedWalletAddress: string,
  currentTimestamp: number = Date.now(),
  options: SignInVerificationOptions = {}
): SignInMessageErrorType[] {
  const errors: SignInMessageErrorType[] = [];
  const {
    domain,
    address: messageAddress,
    uri,
    issuedAt,
    expirationTime,
    notBefore,
    nonce
  } = parsedMessage;

  const {
    issuedAtThresholdMs = DEFAULT_ISSUED_AT_THRESHOLD_MS,
  } = options;

  let dAppOriginURL: URL | null = null;
  try {
    if (expectedDappOrigin) {
        dAppOriginURL = new URL(expectedDappOrigin);
    } else {
     //   console.warn("[SIWE Verify] expectedDappOrigin is missing or empty for verification.");
    }
  } catch (e) {
   // console.error("[SIWE Verify] Invalid expectedDappOrigin provided:", expectedDappOrigin, e);
    errors.push(SignInMessageErrorType.UNEXPECTED_PARSING_ERROR);
  }

  if (dAppOriginURL) {
    if (domain !== dAppOriginURL.hostname) {
      errors.push(SignInMessageErrorType.DOMAIN_MISMATCH);
    }
    if (uri) {
      try {
        const messageUriURL = new URL(uri);
        if (messageUriURL.origin !== dAppOriginURL.origin) {
          errors.push(SignInMessageErrorType.URI_MISMATCH);
        }
      } catch (e) {
        errors.push(SignInMessageErrorType.INVALID_URI_FORMAT);
      }
    }
  }

  if (messageAddress && expectedWalletAddress && messageAddress.toLowerCase() !== expectedWalletAddress.toLowerCase()) {
    errors.push(SignInMessageErrorType.ADDRESS_MISMATCH);
  }

  let iatMs: number | undefined;
  if (issuedAt) {
    iatMs = new Date(issuedAt).getTime();
    if (isNaN(iatMs)) {
      errors.push(SignInMessageErrorType.INVALID_ISSUED_AT_FORMAT);
    } else {
      if (Math.abs(currentTimestamp - iatMs) > issuedAtThresholdMs) {
        if (iatMs < currentTimestamp) errors.push(SignInMessageErrorType.ISSUED_TOO_FAR_IN_PAST);
        else errors.push(SignInMessageErrorType.ISSUED_IN_FUTURE);
      }
    }
  } else {
    errors.push(SignInMessageErrorType.ISSUED_AT_MISSING);
  }

  if (expirationTime) {
    const expMs = new Date(expirationTime).getTime();
    if (isNaN(expMs)) {
      errors.push(SignInMessageErrorType.INVALID_EXPIRATION_TIME_FORMAT);
    } else {
      if (expMs <= currentTimestamp) {
        errors.push(SignInMessageErrorType.EXPIRED);
      }
      if (iatMs && !isNaN(iatMs) && expMs < iatMs) {
        errors.push(SignInMessageErrorType.EXPIRES_BEFORE_ISSUANCE);
      }
    }
  }

  if (notBefore) {
    const nbfMs = new Date(notBefore).getTime();
    if (isNaN(nbfMs)) {
      errors.push(SignInMessageErrorType.INVALID_NOT_BEFORE_FORMAT);
    } else {
      if (currentTimestamp < nbfMs) {
        errors.push(SignInMessageErrorType.NOT_YET_VALID);
      }
      if (expirationTime && !isNaN(new Date(expirationTime).getTime()) && new Date(expirationTime).getTime() < nbfMs) {
        errors.push(SignInMessageErrorType.EXPIRES_BEFORE_NOT_BEFORE);
      }
    }
  }

  if (!nonce) {
    errors.push(SignInMessageErrorType.NONCE_MISSING);
  }
  return errors;
}

export function formatSignInMessageDetails(parsedMessage: ParsedSignInMessage): string {
  let details = `Domain: ${parsedMessage.domain}\nAddress: ${parsedMessage.address}`;
  if (parsedMessage.statement) details += `\n\nStatement:\n${parsedMessage.statement}`;
  if (parsedMessage.uri) details += `\nURI: ${parsedMessage.uri}`;
  if (parsedMessage.version) details += `\nVersion: ${parsedMessage.version}`;
  if (parsedMessage.chainId) details += `\nChain ID: ${parsedMessage.chainId}`;
  if (parsedMessage.nonce) details += `\nNonce: ${parsedMessage.nonce}`;
  if (parsedMessage.issuedAt) details += `\nIssued At: ${new Date(parsedMessage.issuedAt).toLocaleString()}`;
  if (parsedMessage.expirationTime) details += `\nExpiration Time: ${new Date(parsedMessage.expirationTime).toLocaleString()}`;
  if (parsedMessage.notBefore) details += `\nNot Before: ${new Date(parsedMessage.notBefore).toLocaleString()}`;
  if (parsedMessage.requestId) details += `\nRequest ID: ${parsedMessage.requestId}`;
  if (parsedMessage.resources && parsedMessage.resources.length > 0) {
    details += `\nResources:\n${parsedMessage.resources.map(r => `- ${r}`).join('\n')}`;
  }
  return details;
}