import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


export default [
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [".dist/*"]
  },
  {
    rules: {
      "quotes": [
        "warn",
        "single"
      ],
      "indent": [
        "warn",
        2,
        {
          "SwitchCase": 1
        }
      ],
      "linebreak-style": [
        "warn",
        "unix"
      ],
      "semi": [
        "warn",
        "always"
      ],
      "comma-dangle": [
        "warn",
        "always-multiline"
      ],
      "dot-notation": "off",
      "eqeqeq": "warn",
      "curly": [
        "warn",
        "all"
      ],
      "brace-style": [
        "warn"
      ],
      "prefer-arrow-callback": [
        "warn"
      ],
      "max-len": [
        "warn",
        150
      ],
      "no-console": [
        "warn"
      ], // use the provided Homebridge log method instead
      "no-non-null-assertion": [
        "off"
      ],
      "comma-spacing": [
        "error"
      ],
      "no-multi-spaces": [
        "warn",
        {
          "ignoreEOLComments": true
        }
      ],
      "no-trailing-spaces": [
        "warn"
      ],
      "lines-between-class-members": [
        "warn",
        "always",
        {
          "exceptAfterSingleLine": true
        }
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];