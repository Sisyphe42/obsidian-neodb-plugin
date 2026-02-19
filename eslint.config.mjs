import obsidianmd from "eslint-plugin-obsidianmd";
import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["**/*.ts"],
        plugins: {
            obsidianmd: obsidianmd,
        },
        languageOptions: {
            parser: (await import("@typescript-eslint/parser")).default,
            ecmaVersion: 2020,
            sourceType: "module",
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        rules: {
            "obsidianmd/commands/no-command-in-command-id": "error",
            "obsidianmd/commands/no-command-in-command-name": "error",
            "obsidianmd/commands/no-default-hotkeys": "error",
            "obsidianmd/detach-leaves": "error",
            "obsidianmd/hardcoded-config-path": "error",
            "obsidianmd/no-forbidden-elements": "error",
            "obsidianmd/no-plugin-as-component": "error",
            "obsidianmd/no-sample-code": "error",
            "obsidianmd/no-tfile-tfolder-cast": "error",
            "no-unused-vars": ["error", { "args": "none" }],
        },
    },
];
