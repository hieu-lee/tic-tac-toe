/**
  * ok : return `true` if the only placeholders are modified, false otherwise
  * fills: should be [] if !ok end return fills in the place of placeholders
  *
  * Example: 
  * ``` ts
  * const this1 = 'First Name: _____-_____ ,Last Name: _______';
  * const other1 = 'First Name: Thanh Tung ,Last Name: VU';
  * const other2 = 'First Na: Thanh Tung ,Last Name: VU';
  * const other3 = 'First Name: _____-_____ ,Last Name: VU';
  * const pat = '(_____-_____)|(_______)'
  * 
  * console.log(getFills(this1, other1, pat)); // { ok: true, fills: [ 'Thanh Tung', 'VU' ] })
  * console.log(getFills(this1, other2, pat)); // { ok: false, fills: [] }
  * console.log(getFills(this1, other3, pat)); // {ok: true, fills: ['VU'] }}
  * ```
  */
export const getFills = (
  originalLine: string,
  filledLine: string,
  fillPattern: string
): { ok: boolean, fills: (string | null)[] } => {
  console.log(originalLine)
  console.log(filledLine)
  console.log(fillPattern)
  const trimmedOriginalLine = removeZeroWidthSpaces(originalLine.trim());
  const trimmedFilledLine = removeZeroWidthSpaces(filledLine.trim());
  const placeholderRegex = new RegExp(fillPattern, 'g');

  type Token = { type: 'literal'; value: string } | { type: 'placeholder'; value: string };

  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = placeholderRegex.exec(trimmedOriginalLine))) {
    const { index } = match;
    if (index > lastIndex) {
      tokens.push({ type: 'literal', value: trimmedOriginalLine.slice(lastIndex, index) });
    }
    tokens.push({ type: 'placeholder', value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < trimmedOriginalLine.length) {
    tokens.push({ type: 'literal', value: trimmedOriginalLine.slice(lastIndex) });
  }

  const fills: (string | null)[] = [];
  let pos = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === 'literal') {
      if (trimmedFilledLine.startsWith(token.value, pos)) {
        pos += token.value.length;
        continue;
      }
      return { ok: false, fills: [] };
    }

    // Below is all about the `placeholder` token

    const nextLiteral = tokens.slice(i + 1).find((t) => t.type === 'literal')

    let endPos: number;
    if (nextLiteral) {
      endPos = trimmedFilledLine.indexOf(nextLiteral.value, pos);
      if (endPos === -1) {
        return { ok: false, fills: [] };
      }
    } else {
      endPos = trimmedFilledLine.length;
    }

    const replacement = trimmedFilledLine.slice(pos, endPos);


    // If the placeholder is left untouched we simply ignore it and
    // keep moving forward – replacing a subset of placeholders is valid
    // as long as no other part of the string changed.
    if (replacement === token.value) {
      fills.push(null);
    } else {
      // An actual replacement must be a non-empty string that does not
      // itself match the placeholder pattern.
      if (replacement.length === 0 || replacement.match(placeholderRegex)) {
        return { ok: false, fills: [] };
      }
      fills.push(replacement);
    }
    pos = endPos;
  }

  if (pos !== trimmedFilledLine.length) {
    return { ok: false, fills: [] };
  }

  return { ok: true, fills };
}

const removeZeroWidthSpaces = (str: string) => {
  return str.replace(/\u200B/g, '');
};


/**
 * Construct a new filled line given an original template line, the fill values, and the placeholder pattern.
 * Each occurrence of the placeholder pattern is replaced sequentially with the corresponding value in
 * `fillValues`.  If an element in `fillValues` is `null` or `undefined`, the placeholder token is left
 * untouched.
 */
export const getFilledLine = (
  originalLine: string,
  fillValues: (string | null)[],
  fillPattern: string
): string => {
  const placeholderRegex = new RegExp(fillPattern, 'g');
  let fillIndex = 0;
  return originalLine.replace(placeholderRegex, (match) => {
    const replacement = fillValues[fillIndex++];
    return replacement === null || replacement === undefined ? match : replacement;
  });
};

export const GetMarkdownText = async (filePath: string) => {
  const { content } = await window.easyFormContext.readFile(filePath);

  // Decode base64 to get the original text content
  // Using TextDecoder to properly handle UTF-8 characters
  const binaryString = atob(content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const decodedText = new TextDecoder('utf-8').decode(bytes);

  return decodedText;
}

export const RemoveFileExtension = (filePath: string): string => {
  const lastDotIndex = filePath.lastIndexOf('.');

  // If no dot found, return original string
  if (lastDotIndex === -1) {
    return filePath;
  }

  // Return everything before the last dot
  return filePath.substring(0, lastDotIndex);
}

export const GetFileExtension = (filePath: string): string => {
  const lastDotIndex = filePath.lastIndexOf('.');

  // If no dot found, return original string
  if (lastDotIndex === -1) {
    return filePath;
  }

  // Return everything before the last dot
  return filePath.substring(lastDotIndex, filePath.length);

}
