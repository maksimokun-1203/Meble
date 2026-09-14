# Agent Guidelines for ViyarStone Project

1. **Strict Approval Policy**: NEVER modify code without explicit user confirmation. Always present a clear plan of what you intend to do, wait for the user to read it, approve it, or make corrections. Do not execute code changes on your own initiative.
2. **"Prompt" Generation**: When the user asks to "create a prompt" ("зроби промпт"), they intend to use it for consulting with a colleague and their AI assistant. Prepare these prompts as separate, clearly formatted artifacts so the user can easily copy, share, and review them before any integration into the code.
3. **Execution Block**: Absolutely no code changes should be made without prior consent. Always stop and ask for permission before modifying any file.
4. **Running the Bot**: When asked to run or start the Telegram bot, ALWAYS run it using the global python executable via the command `python bot.py` in the workspace root. DO NOT use the `.venv` directory because the required dependencies (aiogram, openai, pyzbar) are installed in the global environment. Send the execution to the background (WaitMsBeforeAsync = 3000) so it keeps running.
