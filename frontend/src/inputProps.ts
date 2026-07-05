/**
 * Props for text inputs holding technical values (URLs, paths, pod names,
 * tags, search terms). The macOS WKWebView otherwise autocorrects and
 * autocapitalizes them, silently mangling identifiers while typing.
 */
export const technicalInputProps = {
  autoCorrect: "off",
  autoCapitalize: "off",
  autoComplete: "off",
  spellCheck: false,
} as const;
